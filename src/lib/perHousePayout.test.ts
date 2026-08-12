import { describe, it, expect } from 'vitest';
import { perHousePayout, buildPerHousePayout } from './perHousePayout';
import type { AffiliateConfig } from './commission';

// O caso REAL que motivou a lib (Infinity, 2026-08-12): Maurício tem
// byBrand{esportiva-bet:110, super-bet-v2:280} e o mirror o registra na Super
// Bet. O QFTD de teste entrou pela ESPORTIVA — e o painel dele mostrou R$ 280
// (agregado × taxa da casa do mirror) em vez de R$ 110 (taxa da casa da linha).
const MAURICIO: AffiliateConfig = {
  affiliateId: 'boost_mau',
  byBrand: {
    stake: { cpaValue: 160 },
    'esportiva-bet': { cpaValue: 110 },
    'super-bet-v2': { cpaValue: 280 },
  },
} as any;

describe('perHousePayout', () => {
  it('reproduz o caso Maurício: QFTD manual da Esportiva sai a 110, nunca a 280 do mirror', () => {
    const parts = perHousePayout(
      undefined, // sem produção OTG
      [{ affiliateId: 'boost_mau', houseSlug: 'esportiva-bet', qualified_cpa: 1, rvs: 6.02 }],
      MAURICIO,
      'super-bet-v2', // a casa do mirror NÃO manda na linha manual
    );
    expect(parts.total).toBe(110); // rev não configurado → só CPA
    expect(parts.cpa).toBe(110);
    expect(parts.rev).toBe(0);
  });

  it('produção em VÁRIAS casas manuais soma cada uma na própria taxa', () => {
    const parts = perHousePayout(
      undefined,
      [
        { houseSlug: 'esportiva-bet', qualified_cpa: 2, rvs: 0 },
        { houseSlug: 'super-bet-v2', qualified_cpa: 1, rvs: 0 },
        { houseSlug: 'stake', qualified_cpa: 3, rvs: 0 },
      ],
      MAURICIO,
    );
    expect(parts.total).toBe(2 * 110 + 1 * 280 + 3 * 160);
  });

  it('a linha OTG segue o modelo 1 afiliado → 1 casa (brandId do mirror)', () => {
    const cfg: AffiliateConfig = {
      affiliateId: 'x',
      cpaValue: 50,
      revPercentage: 10,
      byBrand: { superbet: { cpaValue: 200, revPercentage: 20 } },
    } as any;
    const parts = perHousePayout({ qualified_cpa: 2, rvs: 100 }, [], cfg, 'superbet');
    expect(parts.cpa).toBe(400);
    expect(parts.rev).toBe(20);
    expect(parts.total).toBe(420);
  });

  it('linha manual sem houseSlug cai na taxa de topo (byBrand é no-op sem chave)', () => {
    const cfg: AffiliateConfig = { affiliateId: 'x', cpaValue: 90, byBrand: { 'esportiva-bet': { cpaValue: 110 } } } as any;
    const parts = perHousePayout(undefined, [{ qualified_cpa: 1, rvs: 0 }], cfg);
    expect(parts.total).toBe(90);
  });

  it('total == cpa + rev (linearidade — a fórmula vem só de calcAffiliatePayout)', () => {
    const cfg: AffiliateConfig = {
      affiliateId: 'x',
      cpaValue: 75,
      revPercentage: 12,
      byBrand: { 'esportiva-bet': { cpaValue: 110, revPercentage: 5 } },
    } as any;
    const parts = perHousePayout(
      { qualified_cpa: 3, rvs: 400 },
      [{ houseSlug: 'esportiva-bet', qualified_cpa: 2, rvs: 100 }],
      cfg,
    );
    expect(parts.total).toBeCloseTo(parts.cpa + parts.rev, 10);
    expect(parts.total).toBeCloseTo(3 * 75 + 400 * 0.12 + 2 * 110 + 100 * 0.05, 10);
  });

  it('sem config → 0 (ausência ≠ taxa inventada)', () => {
    expect(perHousePayout({ qualified_cpa: 5 }, [{ houseSlug: 'x', qualified_cpa: 5 }], null).total).toBe(0);
  });
});

describe('buildPerHousePayout', () => {
  const brandIdOf = (id: string) => (id === 'boost_mau' ? 'super-bet-v2' : undefined);

  it('indexa OTG por afiliado e manual por casa; agregado da casa (affiliateId null) é ignorado', () => {
    const idx = buildPerHousePayout(
      [],
      [
        { affiliateId: 'boost_mau', houseSlug: 'esportiva-bet', qualified_cpa: 1, rvs: 0 },
        { affiliateId: null, houseSlug: 'esportiva-bet', qualified_cpa: 9, rvs: 0 }, // agregado do dia
      ],
      brandIdOf,
    );
    expect(idx.breakdownFor('boost_mau', MAURICIO).total).toBe(110);
    expect(idx.breakdownFor('desconhecido', MAURICIO).total).toBe(0);
  });

  it('spread por casa: breakdown(cfg do especial) − breakdown(cfg do sub)', () => {
    const especial: AffiliateConfig = { affiliateId: 'esp', byBrand: { 'esportiva-bet': { cpaValue: 110 } } } as any;
    const sub: AffiliateConfig = { affiliateId: 'sub', byBrand: { 'esportiva-bet': { cpaValue: 80 } } } as any;
    const idx = buildPerHousePayout(
      [],
      [{ affiliateId: 'sub', houseSlug: 'esportiva-bet', qualified_cpa: 2, rvs: 0 }],
      () => undefined,
    );
    const spread = idx.breakdownFor('sub', especial).total - idx.breakdownFor('sub', sub).total;
    expect(spread).toBe(2 * (110 - 80));
  });

  it('OTG e manual do MESMO afiliado somam (cada parte na taxa certa)', () => {
    const cfg: AffiliateConfig = {
      affiliateId: 'boost_mau',
      byBrand: { 'super-bet-v2': { cpaValue: 280 }, 'esportiva-bet': { cpaValue: 110 } },
    } as any;
    const idx = buildPerHousePayout(
      [{ affiliate_id: 'boost_mau', qualified_cpa: 1, rvs: 0 }], // OTG: casa do mirror (super-bet-v2)
      [{ affiliateId: 'boost_mau', houseSlug: 'esportiva-bet', qualified_cpa: 1, rvs: 0 }],
      brandIdOf,
    );
    expect(idx.breakdownFor('boost_mau', cfg).total).toBe(280 + 110);
  });
});
