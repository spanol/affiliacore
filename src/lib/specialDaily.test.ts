import { describe, it, expect } from 'vitest';
import { buildSpecialDailySeries } from './specialDaily';
import type { AffiliateConfig } from './commission';

// Taxa própria do especial: R$ 100/CPA + 10% REV.
const CFG: AffiliateConfig = { affiliateId: 'esp1', cpaValue: 100, revPercentage: 10 };

const NETWORK = [
  { id: '2026-08-01', registrations: 5, qualified_cpa: 3, rvs: 50, total_commission: 999 }, // 999 = bruto da casa (deve ser trocado)
  { id: '2026-08-02', registrations: 2, qualified_cpa: 1, rvs: 0, total_commission: 999 },
];
const OWN = [
  { id: '2026-08-01', registrations: 1, qualified_cpa: 1, rvs: 10, total_commission: 999 },
];

describe('buildSpecialDailySeries (linha "produção própria" — call Infinity 12/08)', () => {
  it('rede à taxa própria + own_commission por dia (nunca o bruto da casa)', () => {
    const rows = buildSpecialDailySeries(NETWORK, OWN, CFG);
    const d1 = rows.find((r) => r.id === '2026-08-01')!;
    expect(d1.total_commission).toBeCloseTo(3 * 100 + 50 * 0.1); // rede: 305
    expect(d1.own_commission).toBeCloseTo(1 * 100 + 10 * 0.1); // própria: 101
  });

  it('dia sem produção própria sai com own_commission = 0 (a série própria FOI consultada)', () => {
    const rows = buildSpecialDailySeries(NETWORK, OWN, CFG);
    expect(rows.find((r) => r.id === '2026-08-02')!.own_commission).toBe(0);
  });

  it('dia só na série própria (borda) entra com a própria como total do dia', () => {
    const rows = buildSpecialDailySeries([], OWN, CFG);
    const d1 = rows.find((r) => r.id === '2026-08-01')!;
    expect(d1.total_commission).toBeCloseTo(101);
    expect(d1.own_commission).toBeCloseTo(101);
  });

  it('entradas nulas/vazias não quebram', () => {
    expect(buildSpecialDailySeries(null, null, CFG)).toEqual([]);
    expect(buildSpecialDailySeries(undefined, [], null)).toEqual([]);
  });
});
