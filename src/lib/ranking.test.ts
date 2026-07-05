import { describe, it, expect } from 'vitest';
import { computeRankingEntries } from './ranking';

// Métrica (2026-07-05): comissão BRUTA por afiliado = OTG total_commission + manual
// derivado da taxa da casa (houseCommissionForRow). Antes recalculava o repasse Boost
// pela config CPA/REV, zerando a produção REV-share (bug "ranking sempre 0").
describe('computeRankingEntries · ranqueia pela comissão bruta (total_commission)', () => {
  it('OTG: usa o total_commission da linha, ordena desc e numera; comissão 0 fica de fora', () => {
    const rows = [
      { id: 'a', label: 'Alice', total_commission: 2643.74, qualified_cpa: 13, rvs: 43.74 },
      { id: 'b', label: 'Bob', total_commission: 1624.03, qualified_cpa: 0, rvs: 1624.03 },
      { id: 'zero', label: 'Zé', total_commission: 0, qualified_cpa: 0, rvs: 0 },
    ];
    const entries = computeRankingEntries(rows);
    expect(entries.map((e) => e.affiliateId)).toEqual(['a', 'b']); // zero filtrado
    expect(entries[0]).toMatchObject({ pos: 1, affiliateId: 'a', name: 'Alice', commission: 2643.74 });
    expect(entries[1]).toMatchObject({ pos: 2, affiliateId: 'b', name: 'Bob', commission: 1624.03 });
  });

  it('REGRESSÃO do bug: produção só-REV (qualified_cpa=0, rvs>0) NÃO vira R$0', () => {
    // Este é o caso que sumia do ranking antigo (comissão = rvs × revPercentage/100, e
    // revPercentage era 0). Agora vale o total_commission que a OTG reporta.
    const entries = computeRankingEntries([{ id: 'r', qualified_cpa: 0, rvs: 1624.03, total_commission: 1624.03 }]);
    expect(entries).toEqual([{ pos: 1, affiliateId: 'r', name: 'Afiliado #r', commission: 1624.03 }]);
  });

  it('OTG com total_commission <= 0 (ex.: -0,03) é filtrado (sem casa p/ derivar → 0)', () => {
    const entries = computeRankingEntries([{ id: 'neg', total_commission: -0.03, rvs: -0.03 }]);
    expect(entries).toEqual([]);
  });

  it('manual (total_commission=0) deriva a comissão pela taxa da casa (defaultCpa BRL)', () => {
    const rows = [{ houseSlug: 'betfair', date: '2026-06-30', affiliateId: 'm1', qualified_cpa: 3, rvs: 0, total_commission: 0 }];
    const houseRateOf = (slug?: string) => (slug === 'betfair' ? { defaultCpa: 40, defaultRev: 0 } : undefined);
    const entries = computeRankingEntries(rows, { houseRateOf });
    expect(entries).toEqual([{ pos: 1, affiliateId: 'm1', name: 'Afiliado #m1', commission: 120 }]); // 3 × R$40
  });

  it('manual com REV: deriva rvs × defaultRev/100', () => {
    const rows = [{ houseSlug: 'h', affiliateId: 'm2', qualified_cpa: 0, rvs: 200, total_commission: 0 }];
    const houseRateOf = () => ({ defaultCpa: 0, defaultRev: 10 });
    const entries = computeRankingEntries(rows, { houseRateOf });
    expect(entries[0].commission).toBe(20); // 200 × 10%
  });

  it('afiliado com produção OTG + manual SOMA as duas comissões', () => {
    const rows = [
      { id: 'a', total_commission: 100 },
      { houseSlug: 'betfair', affiliateId: 'a', qualified_cpa: 1, rvs: 0, total_commission: 0 },
    ];
    const houseRateOf = () => ({ defaultCpa: 40, defaultRev: 0 });
    const entries = computeRankingEntries(rows, { houseRateOf });
    expect(entries).toEqual([{ pos: 1, affiliateId: 'a', name: 'Afiliado #a', commission: 140 }]); // 100 + 1×40
  });

  it('linha agregada da casa (affiliateId null) fica de fora', () => {
    const rows = [
      { houseSlug: 'betfair', affiliateId: 'm1', qualified_cpa: 2, total_commission: 0 },
      { houseSlug: 'betfair', affiliateId: null, qualified_cpa: 99, total_commission: 0 }, // agregado
    ];
    const houseRateOf = () => ({ defaultCpa: 40, defaultRev: 0 });
    const entries = computeRankingEntries(rows, { houseRateOf });
    expect(entries).toHaveLength(1);
    expect(entries[0].affiliateId).toBe('m1');
  });

  it('sem houseRateOf, linha manual não deriva → comissão 0 → filtrada', () => {
    const rows = [{ houseSlug: 'betfair', affiliateId: 'm1', qualified_cpa: 3, total_commission: 0 }];
    expect(computeRankingEntries(rows)).toEqual([]);
  });

  it('usa nameById quando disponível, senão o label da linha, senão #id', () => {
    const rows = [
      { id: 'a', total_commission: 10, label: 'Row Alice' },
      { id: 'b', total_commission: 5 },
    ];
    const entries = computeRankingEntries(rows, { nameById: { a: 'Alice' } });
    expect(entries.find((e) => e.affiliateId === 'a')!.name).toBe('Alice');
    expect(entries.find((e) => e.affiliateId === 'b')!.name).toBe('Afiliado #b');
  });

  it('não propaga NaN de métrica string (via num) — vira 0 e é filtrado', () => {
    const otg = [{ id: 'x', total_commission: 'oops' as any }];
    const manual = [{ houseSlug: 'h', affiliateId: 'y', qualified_cpa: '2,5' as any, rvs: 'nan' as any, total_commission: 0 }];
    const houseRateOf = () => ({ defaultCpa: 40, defaultRev: 0 });
    expect(computeRankingEntries([...otg, ...manual], { houseRateOf })).toEqual([]);
  });

  it('respeita o limite (top N) e arredonda a 2 casas', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, total_commission: (i + 1) * 10.005 }));
    const top3 = computeRankingEntries(many, { limit: 3 });
    expect(top3).toHaveLength(3);
    expect(top3[0].affiliateId).toBe('n4'); // maior total_commission
    expect(Number.isInteger(top3[0].commission * 100)).toBe(true); // 2 casas
  });

  it('ignora linha sem id e tolera entrada vazia/null', () => {
    expect(computeRankingEntries([{ total_commission: 9 }])).toEqual([]);
    expect(computeRankingEntries(null as any)).toEqual([]);
  });
});
