import { describe, it, expect } from 'vitest';
import { perHousePayout, buildPerHousePayout, payoutOverBrandRows, unratedProducingBrands } from './perHousePayout';
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

// O caso REAL de 25/08/2026 (Infinity): Rodrigo da Silva Peres tem taxa SÓ por
// casa (byBrand), sem nada no topo. O CPA da Blaze contou, mas em "Todas as
// casas" o dinheiro não subia para o total, porque a tela multiplicava o
// agregado pela taxa de topo, que nele é ausente.
describe('payoutOverBrandRows', () => {
  const cfgRodrigo: AffiliateConfig = {
    affiliateId: 'boost_rodrigo',
    cpaValue: undefined as any,        // sem taxa de topo, como está em produção
    revPercentage: undefined as any,
    byBrand: {
      blaze: { cpaValue: 120, revPercentage: 0 },
      'esportiva-bet': { cpaValue: 100, revPercentage: 0 },
      winhugo: { cpaValue: 100, revPercentage: 0 },
    },
  };
  const linhas = [
    { id: 'blaze', name: 'Blaze', qualified_cpa: 1, rvs: 0 },
    { id: 'esportiva-bet', name: 'Esportiva Bet', qualified_cpa: 1, rvs: 0 },
    { id: 'winhugo', name: 'Winhugo', qualified_cpa: 0, rvs: 0 },
  ];

  it('soma casa a casa: o que sumia do total volta', () => {
    expect(payoutOverBrandRows(linhas, cfgRodrigo).total).toBe(220);
  });

  it('é a MESMA conta do filtro por casa, uma de cada vez', () => {
    const porCasa = linhas.map((l) => payoutOverBrandRows([l], cfgRodrigo).total);
    expect(porCasa).toEqual([120, 100, 0]);
    expect(porCasa.reduce((a, b) => a + b, 0)).toBe(payoutOverBrandRows(linhas, cfgRodrigo).total);
  });

  it('devolve as parcelas separadas (CPA e REV)', () => {
    const cfg: AffiliateConfig = { affiliateId: 'x', cpaValue: 0, revPercentage: 0, byBrand: { kto: { cpaValue: 50, revPercentage: 20 } } };
    expect(payoutOverBrandRows([{ id: 'kto', qualified_cpa: 2, rvs: 300 }], cfg)).toEqual({ cpa: 100, rev: 60, total: 160 });
  });

  it('casa sem chave cai na taxa de topo (comportamento antigo)', () => {
    const cfg: AffiliateConfig = { affiliateId: 'x', cpaValue: 70, revPercentage: 0 };
    expect(payoutOverBrandRows([{ id: '', qualified_cpa: 2, rvs: 0 }], cfg).total).toBe(140);
  });

  it('lista vazia ou ausente não vira NaN', () => {
    expect(payoutOverBrandRows([], cfgRodrigo)).toEqual({ cpa: 0, rev: 0, total: 0 });
    expect(payoutOverBrandRows(null, cfgRodrigo).total).toBe(0);
  });
});

describe('unratedProducingBrands', () => {
  const cfg: AffiliateConfig = {
    affiliateId: 'x', cpaValue: undefined as any, revPercentage: undefined as any,
    byBrand: { blaze: { cpaValue: 120, revPercentage: 0 } },
  };

  it('com todas as casas produzidas precificadas, não acusa nada', () => {
    expect(unratedProducingBrands([{ id: 'blaze', name: 'Blaze', qualified_cpa: 1 }], cfg)).toEqual([]);
  });

  it('acusa a casa que produziu e não tem taxa nenhuma', () => {
    expect(unratedProducingBrands([
      { id: 'blaze', name: 'Blaze', qualified_cpa: 1 },
      { id: 'kto', name: 'KTO', qualified_cpa: 2 },
    ], cfg)).toEqual(['KTO']);
  });

  it('casa sem produção não entra: não configurar taxa de casa parada é normal', () => {
    expect(unratedProducingBrands([{ id: 'kto', name: 'KTO', qualified_cpa: 0, rvs: 0 }], cfg)).toEqual([]);
  });

  it('REV negativo conta como produção (a casa mexeu no dinheiro)', () => {
    expect(unratedProducingBrands([{ id: 'kto', name: 'KTO', qualified_cpa: 0, rvs: -12 }], cfg)).toEqual(['KTO']);
  });

  it('taxa de topo cobre todas as casas', () => {
    const comTopo: AffiliateConfig = { affiliateId: 'x', cpaValue: 90, revPercentage: 0 };
    expect(unratedProducingBrands([{ id: 'kto', name: 'KTO', qualified_cpa: 2 }], comTopo)).toEqual([]);
  });
});
