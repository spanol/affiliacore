import { describe, it, expect } from 'vitest';
import { computeRankingEntries, mergeManualIntoRankingRows } from './ranking';

describe('computeRankingEntries · leaderboard usa byBrand (R2)', () => {
  const rows = [
    { affiliate_id: 'a', qualified_cpa: 5, rvs: 0 },
    { affiliate_id: 'b', qualified_cpa: 2, rvs: 1000 },
    { affiliate_id: 'zero', qualified_cpa: 0, rvs: 0 },
  ];
  const configs = {
    a: { affiliateId: 'a', cpaValue: 100, revPercentage: 0, byBrand: { sb: { cpaValue: 200, revPercentage: 0 } } },
    b: { affiliateId: 'b', cpaValue: 50, revPercentage: 10 },
    zero: { affiliateId: 'zero', cpaValue: 100, revPercentage: 0 },
  } as any;

  it('aplica a taxa POR CASA (byBrand) quando o brandId é conhecido — antes era só topo', () => {
    const brandIdOf = (id: string) => (id === 'a' ? 'sb' : undefined);
    const entries = computeRankingEntries(rows, configs, { brandIdOf });
    const a = entries.find((e) => e.affiliateId === 'a')!;
    expect(a.commission).toBe(5 * 200); // 1000 com byBrand 200; com o topo 100 daria 500
  });

  it('sem brandIdOf cai na taxa de topo (retrocompat)', () => {
    const entries = computeRankingEntries(rows, configs);
    const a = entries.find((e) => e.affiliateId === 'a')!;
    expect(a.commission).toBe(5 * 100); // topo
  });

  it('filtra comissão <= 0, ordena desc e numera as posições', () => {
    const entries = computeRankingEntries(rows, configs);
    // a: 500 (topo), b: 2×50 + 1000×0.1 = 200, zero: 0 (filtrado)
    expect(entries.map((e) => e.affiliateId)).toEqual(['a', 'b']);
    expect(entries[0].pos).toBe(1);
    expect(entries[1].pos).toBe(2);
  });

  it('não propaga NaN de métrica string (via calcAffiliatePayout/num)', () => {
    const bad = [{ affiliate_id: 'x', qualified_cpa: '2,5', rvs: 'oops' }];
    const cfg = { x: { affiliateId: 'x', cpaValue: 100, revPercentage: 10 } } as any;
    const entries = computeRankingEntries(bad, cfg);
    expect(entries).toEqual([]); // '2,5'→0, 'oops'→0 → comissão 0 → filtrado, sem NaN
  });

  it('usa nameById quando disponível, senão cai no nome da linha', () => {
    const entries = computeRankingEntries(rows, configs, { nameById: { a: 'Alice' } });
    expect(entries.find((e) => e.affiliateId === 'a')!.name).toBe('Alice');
    expect(entries.find((e) => e.affiliateId === 'b')!.name).toContain('#b');
  });

  it('respeita o limite (top N) e arredonda a 2 casas', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ affiliate_id: `n${i}`, qualified_cpa: i + 1, rvs: 0 }));
    const cfgs: any = {};
    many.forEach((r) => { cfgs[r.affiliate_id] = { affiliateId: r.affiliate_id, cpaValue: 10.005, revPercentage: 0 }; });
    const top3 = computeRankingEntries(many, cfgs, { limit: 3 });
    expect(top3).toHaveLength(3);
    expect(top3[0].affiliateId).toBe('n4'); // maior qualified_cpa
    expect(Number.isInteger(top3[0].commission * 100)).toBe(true); // 2 casas
  });

  it('ignora linha sem affiliate_id e tolera entrada vazia', () => {
    expect(computeRankingEntries([{ qualified_cpa: 9 }], {})).toEqual([]);
    expect(computeRankingEntries(null as any, {})).toEqual([]);
  });
});

// Bug 2026-07-02: o ranking só via a OTG → count=0 todo dia enquanto a produção
// real estava nas casas manuais (house_results). O merge aditivo fecha o buraco.
describe('mergeManualIntoRankingRows · manual entra no ranking (fix ranking zerado)', () => {
  it('afiliado SÓ-manual vira linha nova; agregado (affiliateId null) fica de fora', () => {
    const manual = [
      { houseSlug: 'betfair', date: '2026-06-30', affiliateId: 'm1', qualified_cpa: 3, rvs: 200 },
      { houseSlug: 'betfair', date: '2026-06-30', affiliateId: null, qualified_cpa: 99, rvs: 0 }, // agregado da casa
    ];
    const rows = mergeManualIntoRankingRows([], manual);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ affiliate_id: 'm1', qualified_cpa: 3, rvs: 200 });
  });

  it('afiliado com OTG + manual SOMA as métricas (merge aditivo, igual aos dashboards)', () => {
    const otg = [{ affiliate_id: 'a', qualified_cpa: 5, rvs: 100, total_commission: 900 }];
    const manual = [
      { houseSlug: 'betano', date: '2026-06-30', affiliateId: 'a', qualified_cpa: 2, rvs: 50 },
      { houseSlug: 'betfair', date: '2026-06-30', affiliateId: 'a', qualified_cpa: 1, rvs: 0 },
    ];
    const rows = mergeManualIntoRankingRows(otg, manual);
    expect(rows).toHaveLength(1);
    expect(rows[0].qualified_cpa).toBe(8); // 5 + 2 + 1
    expect(rows[0].rvs).toBe(150);         // 100 + 50
    expect(rows[0].total_commission).toBe(900); // campos da OTG preservados
  });

  it('métrica string/NaN não propaga (num) e entradas vazias são toleradas', () => {
    const rows = mergeManualIntoRankingRows(null as any, [
      { affiliateId: 'x', qualified_cpa: '2,5', rvs: 'oops' },
    ]);
    expect(rows[0]).toMatchObject({ affiliate_id: 'x', qualified_cpa: 0, rvs: 0 });
    expect(mergeManualIntoRankingRows(null as any, null as any)).toEqual([]);
  });

  it('ponta a ponta: manual do dia gera comissão no ranking pela taxa do afiliado', () => {
    const merged = mergeManualIntoRankingRows([], [
      { houseSlug: 'betfair', date: '2026-06-30', affiliateId: 'm1', qualified_cpa: 3, rvs: 0 },
    ]);
    const entries = computeRankingEntries(merged, { m1: { affiliateId: 'm1', cpaValue: 40, revPercentage: 0 } } as any);
    expect(entries).toEqual([{ pos: 1, affiliateId: 'm1', name: 'Afiliado #m1', commission: 120 }]);
  });
});
