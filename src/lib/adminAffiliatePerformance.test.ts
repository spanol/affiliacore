import { describe, expect, it } from 'vitest';
import { buildAffiliatePerformance, indexPerformanceById } from './adminAffiliatePerformance';
import {
  aggregateByAffiliate,
  aggregateByHouse,
  addMetrics,
  emptyMetrics,
  type StoredManualRow,
} from './houseResults';

const manualRow = (over: Partial<StoredManualRow>): StoredManualRow =>
  ({
    houseSlug: 'esportiva',
    date: '2026-07-10',
    affiliateId: 'a1',
    registrations: 0,
    first_deposits: 0,
    qualified_cpa: 0,
    rvs: 0,
    deposit: 0,
    total_commission: 0,
    ...over,
  }) as StoredManualRow;

/** O headline do /admin: agrega por CASA, então conta linha atribuída E órfã. */
const headlineCommission = (rows: StoredManualRow[]): number => {
  const byHouse = aggregateByHouse(rows);
  const total = emptyMetrics();
  for (const slug of Object.keys(byHouse)) addMetrics(total, byHouse[slug]);
  return total.total_commission;
};

describe('buildAffiliatePerformance', () => {
  it('instância OTG-free: as barras saem SÓ do manual (o bug da Infinity)', () => {
    // fetchAffiliateApi devolve {data:[]} quando VITE_OTG_ENABLED=false, então
    // `results` chega vazio. Antes do fix o gráfico ficava em "sem dados" mesmo
    // com o headline cheio.
    const manual = aggregateByAffiliate([
      manualRow({ affiliateId: 'a1', total_commission: 4000, rvs: 100 }),
      manualRow({ affiliateId: 'a2', total_commission: 1760 }),
    ]);
    const rows = buildAffiliatePerformance([], manual, { a1: 'ana silva', a2: 'bruno' });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'a1', commission: 4000, rev: 100 });
    expect(rows[1]).toMatchObject({ id: 'a2', commission: 1760 });
  });

  it('soma OTG + manual no MESMO afiliado (não duplica nem sobrescreve)', () => {
    const otg = [{ affiliate_id: 'a1', label: 'Ana', total_commission: 300, cpa: 120, rvs: 30 }];
    const manual = aggregateByAffiliate([manualRow({ affiliateId: 'a1', total_commission: 200, rvs: 20 })]);

    const [row] = buildAffiliatePerformance(otg, manual);
    expect(row.commission).toBe(500);
    expect(row.rev).toBe(50);
    // CPA em R$ só existe na OTG — o upload manual não coleta no v1.
    expect(row.cpa).toBe(120);
  });

  it('ordena por comissão desc (o gráfico mostra 5 por vez)', () => {
    const manual = aggregateByAffiliate([
      manualRow({ affiliateId: 'baixo', total_commission: 10 }),
      manualRow({ affiliateId: 'alto', total_commission: 900 }),
      manualRow({ affiliateId: 'medio', total_commission: 500 }),
    ]);
    expect(buildAffiliatePerformance([], manual).map((r) => r.id)).toEqual([
      'alto',
      'medio',
      'baixo',
    ]);
  });

  it('INVARIANTE: planilha só por afiliado → Σ do gráfico == headline, exato', () => {
    // É o caso real da Infinity: upload por afiliado, sem linha agregada.
    const rows = [
      manualRow({ affiliateId: 'a1', date: '2026-07-10', total_commission: 4000 }),
      manualRow({ affiliateId: 'a2', date: '2026-07-10', total_commission: 1000 }),
      manualRow({ affiliateId: 'a1', date: '2026-07-11', total_commission: 760 }),
    ];
    const somaChart = buildAffiliatePerformance([], aggregateByAffiliate(rows))
      .reduce((s, r) => s + r.commission, 0);

    expect(somaChart).toBe(5760);
    expect(somaChart).toBe(headlineCommission(rows));
  });

  it('DIVERGÊNCIA CONHECIDA: linha agregada da casa vence no headline e não no gráfico', () => {
    // `affiliateId: null` = linha agregada da casa (planilha sem coluna de
    // afiliado). No headline, dailyAggregate deixa ela VENCER e descarta as
    // linhas por afiliado do mesmo casa|dia (anti double-count); o
    // aggregateByAffiliate soma as atribuídas sem olhar o dia. Este teste
    // documenta a divergência p/ ninguém "consertar" um dos lados sem saber —
    // vale p/ todo consumidor do helper, não só p/ este módulo.
    const rows = [
      manualRow({ affiliateId: 'a1', date: '2026-07-10', total_commission: 4000 }),
      manualRow({ affiliateId: null, date: '2026-07-10', total_commission: 760 }),
    ];
    const somaChart = buildAffiliatePerformance([], aggregateByAffiliate(rows))
      .reduce((s, r) => s + r.commission, 0);

    expect(headlineCommission(rows)).toBe(760); // agregado vence
    expect(somaChart).toBe(4000); // gráfico segue as atribuídas
  });

  it('nome: label da OTG > mapa do mirror > id (afiliado só-manual tem nome legível)', () => {
    const otg = [{ affiliate_id: 'a1', label: 'anaSilva', total_commission: 1 }];
    const manual = aggregateByAffiliate([
      manualRow({ affiliateId: 'a2', total_commission: 5 }),
      manualRow({ affiliateId: 'a3', total_commission: 3 }),
    ]);
    const rows = indexPerformanceById(
      buildAffiliatePerformance(otg, manual, { a2: 'Bruno Costa' }),
    );

    expect(rows.a1.name).toBe('ana Silva'); // humanizeName quebra o camelCase da OTG
    expect(rows.a2.name).toBe('Bruno Costa'); // só-manual, veio do mirror
    expect(rows.a3.name).toBe('a3'); // sem nome em lugar nenhum → cai no id
  });

  it('não propaga NaN nem quebra com linha suja da API externa', () => {
    const otg = [
      { affiliate_id: 'a1', total_commission: 'não-é-número', cpa: null, rvs: undefined },
      { total_commission: 999 }, // sem id → ignorada (não vira barra fantasma)
    ];
    const rows = buildAffiliatePerformance(otg, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'a1', commission: 0, cpa: 0, rev: 0 });
  });

  it('entradas ausentes/malformadas não lançam', () => {
    expect(buildAffiliatePerformance(null as any, null as any)).toEqual([]);
    expect(buildAffiliatePerformance(undefined as any, {})).toEqual([]);
  });
});
