import { describe, it, expect } from 'vitest';
import {
  houseRateKey,
  buildHouseOptions,
  houseKeyByName,
  scopePartsToHouse,
  funnelByAffiliate,
  houseRateDraft,
  isIncompleteRateDraft,
} from './subHouseRates';

describe('houseRateKey', () => {
  it('prefere o brandId da OTG e cai no slug da casa manual', () => {
    expect(houseRateKey({ brandId: 'clsuperbet000001', slug: 'superbet' })).toBe('clsuperbet000001');
    expect(houseRateKey({ slug: 'esportiva-bet' })).toBe('esportiva-bet');
    expect(houseRateKey({ id: 'leon-bet' })).toBe('leon-bet');
    expect(houseRateKey(null)).toBe('');
  });
});

describe('buildHouseOptions', () => {
  it('lista as casas ativas com nome, sem repetir a mesma chave', () => {
    const opts = buildHouseOptions([
      { slug: 'esportiva-bet', name: 'Esportiva Bet', active: true },
      { slug: 'esportiva-bet', name: 'Esportiva Bet (duplicada)', active: true },
      { slug: 'leon-bet', name: 'LEON Bet', active: true },
    ]);
    expect(opts).toEqual([
      { key: 'esportiva-bet', name: 'Esportiva Bet' },
      { key: 'leon-bet', name: 'LEON Bet' },
    ]);
  });

  it('deixa de fora casa pausada e casa sem nome', () => {
    const opts = buildHouseOptions([
      { slug: 'pausada', name: 'Pausada', active: false },
      { slug: 'sem-nome', name: '   ', active: true },
      { slug: 'viva', name: 'Viva', active: true },
    ]);
    expect(opts).toEqual([{ key: 'viva', name: 'Viva' }]);
  });

  it('não quebra com entrada inválida', () => {
    expect(buildHouseOptions(null)).toEqual([]);
    expect(buildHouseOptions(undefined)).toEqual([]);
  });
});

describe('houseKeyByName', () => {
  const options = [
    { key: 'clsuperbet000001', name: 'Superbet' },
    { key: 'esportiva-bet', name: 'Esportiva Bet' },
  ];

  it('resolve a chave da casa pelo rótulo do seletor', () => {
    expect(houseKeyByName(options, 'Esportiva Bet')).toBe('esportiva-bet');
  });

  it('devolve null para nome desconhecido ou vazio', () => {
    expect(houseKeyByName(options, 'Casa que não existe')).toBeNull();
    expect(houseKeyByName(options, '')).toBeNull();
    expect(houseKeyByName(options, null)).toBeNull();
  });
});

describe('scopePartsToHouse', () => {
  const brandIdOf = (id: string) => (id === 'A' ? 'clsuperbet000001' : undefined);
  const parts = {
    otg: [
      { affiliate_id: 'A', qualified_cpa: 3 },
      { affiliate_id: 'B', qualified_cpa: 5 },
    ],
    manual: [
      { affiliateId: 'A', houseSlug: 'esportiva-bet', qualified_cpa: 1 },
      { affiliateId: 'B', houseSlug: 'leon-bet', qualified_cpa: 2 },
    ],
  };

  it('sem casa selecionada devolve tudo', () => {
    expect(scopePartsToHouse(parts, brandIdOf, null)).toEqual(parts);
    expect(scopePartsToHouse(parts, brandIdOf, '   ')).toEqual(parts);
  });

  it('recorta a parte manual pela casa da LINHA', () => {
    const scoped = scopePartsToHouse(parts, brandIdOf, 'esportiva-bet');
    expect(scoped.manual).toEqual([{ affiliateId: 'A', houseSlug: 'esportiva-bet', qualified_cpa: 1 }]);
    // Nenhum afiliado do mirror é da Esportiva: a parte OTG sai vazia.
    expect(scoped.otg).toEqual([]);
  });

  it('recorta a parte OTG pela casa do MIRROR', () => {
    const scoped = scopePartsToHouse(parts, brandIdOf, 'clsuperbet000001');
    expect(scoped.otg).toEqual([{ affiliate_id: 'A', qualified_cpa: 3 }]);
    expect(scoped.manual).toEqual([]);
  });

  it('preserva a separação OTG × manual (nunca mescla)', () => {
    const scoped = scopePartsToHouse(parts, brandIdOf, 'leon-bet');
    expect(scoped.otg).toEqual([]);
    expect(scoped.manual).toHaveLength(1);
  });
});

describe('funnelByAffiliate', () => {
  it('soma OTG + manual por afiliado', () => {
    const funnel = funnelByAffiliate({
      otg: [{ affiliate_id: 'A', registrations: 10, first_deposits: 4, qualified_cpa: 2 }],
      manual: [
        { affiliateId: 'A', houseSlug: 'x', registrations: 5, first_deposits: 1, qualified_cpa: 1 } as any,
        { affiliateId: 'B', houseSlug: 'x', registrations: 7, first_deposits: 3, qualified_cpa: 3 } as any,
      ],
    });
    expect(funnel.A).toEqual({ registrations: 15, first_deposits: 5, qualified_cpa: 3 });
    expect(funnel.B).toEqual({ registrations: 7, first_deposits: 3, qualified_cpa: 3 });
  });

  it('ignora a linha agregada da casa (affiliateId nulo) para não contar 2×', () => {
    const funnel = funnelByAffiliate({
      otg: [],
      manual: [
        { affiliateId: null, houseSlug: 'x', registrations: 100, first_deposits: 50, qualified_cpa: 20 } as any,
        { affiliateId: 'A', houseSlug: 'x', registrations: 1, first_deposits: 1, qualified_cpa: 1 } as any,
      ],
    });
    expect(Object.keys(funnel)).toEqual(['A']);
    expect(funnel.A.registrations).toBe(1);
  });

  it('não propaga NaN de métrica inválida', () => {
    const funnel = funnelByAffiliate({
      otg: [{ affiliate_id: 'A', registrations: 'oito', first_deposits: null, qualified_cpa: undefined }],
      manual: [],
    });
    expect(funnel.A).toEqual({ registrations: 0, first_deposits: 0, qualified_cpa: 0 });
  });
});

describe('houseRateDraft', () => {
  const config: any = {
    affiliateId: 'A',
    cpaValue: 280,
    revPercentage: 30,
    byBrand: { 'esportiva-bet': { cpaValue: 110, revPercentage: 0 } },
  };

  it('pré-preenche com o override da casa, inclusive o zero configurado', () => {
    expect(houseRateDraft(config, 'esportiva-bet')).toEqual({ cpaValue: '110', revPercentage: '0' });
  });

  it('casa sem override nasce VAZIA — nunca herda a taxa de topo', () => {
    expect(houseRateDraft(config, 'leon-bet')).toEqual({ cpaValue: '', revPercentage: '' });
  });

  it('sem casa selecionada não há rascunho', () => {
    expect(houseRateDraft(config, null)).toEqual({ cpaValue: '', revPercentage: '' });
    expect(houseRateDraft(null, 'esportiva-bet')).toEqual({ cpaValue: '', revPercentage: '' });
  });
});

describe('isIncompleteRateDraft', () => {
  it('exige os DOIS campos: em branco vira 0 gravado, e 0 gravado é taxa', () => {
    expect(isIncompleteRateDraft({ cpaValue: '110', revPercentage: '5' })).toBe(false);
    expect(isIncompleteRateDraft({ cpaValue: '0', revPercentage: '0' })).toBe(false);
    expect(isIncompleteRateDraft({ cpaValue: '110', revPercentage: '' })).toBe(true);
    expect(isIncompleteRateDraft({ cpaValue: '', revPercentage: '5' })).toBe(true);
    expect(isIncompleteRateDraft({ cpaValue: '', revPercentage: '' })).toBe(true);
    expect(isIncompleteRateDraft(null)).toBe(true);
  });
});
