import { describe, it, expect } from 'vitest';
import { isProducingRow, producingAffiliateIds } from './affiliateActivity';

describe('isProducingRow · sinal de produção no período', () => {
  it('funil isolado já conta (cadastro, FTD ou CPA)', () => {
    expect(isProducingRow({ registrations: 1 })).toBe(true);
    expect(isProducingRow({ first_deposits: 1 })).toBe(true);
    expect(isProducingRow({ qualified_cpa: 1 })).toBe(true);
  });

  it('dinheiro isolado conta — o caso que a regra antiga perdia', () => {
    // Import manual: há linha cuja única evidência é a comissão. Com a regra
    // só-funil o afiliado aparecia como parado mesmo tendo produzido.
    expect(isProducingRow({ registrations: 0, first_deposits: 0, qualified_cpa: 0, total_commission: 300 })).toBe(true);
    expect(isProducingRow({ deposit: 50 })).toBe(true);
  });

  it('tudo zerado, vazio, nulo ou não-objeto = não produziu', () => {
    expect(isProducingRow({ registrations: 0, first_deposits: 0, qualified_cpa: 0, total_commission: 0, deposit: 0 })).toBe(false);
    expect(isProducingRow({})).toBe(false);
    expect(isProducingRow(null)).toBe(false);
    expect(isProducingRow(undefined)).toBe(false);
    expect(isProducingRow('x' as any)).toBe(false);
  });

  it('lixo numérico não vira produção (num guarda NaN/objeto)', () => {
    expect(isProducingRow({ registrations: 'abc' })).toBe(false);
    expect(isProducingRow({ registrations: null })).toBe(false);
    expect(isProducingRow({ registrations: { toString: false } as any })).toBe(false);
    // negativo não é produção
    expect(isProducingRow({ total_commission: -10 })).toBe(false);
    // string numérica com PONTO é aceita (mesma convenção do `num`)
    expect(isProducingRow({ registrations: '2' })).toBe(true);
  });
});

describe('producingAffiliateIds · une OTG + manual', () => {
  it('pega o id da OTG por affiliate_id ou id', () => {
    const s = producingAffiliateIds(
      [{ affiliate_id: 'A', registrations: 3 }, { id: 'B', qualified_cpa: 1 }],
      []
    );
    expect(s).toEqual(new Set(['A', 'B']));
  });

  it('conta o afiliado que só produziu em casa MANUAL (instância OTG-free)', () => {
    // Sem isto, numa instância sem OTG o contador do /admin daria sempre zero.
    const s = producingAffiliateIds([], [{ affiliateId: 'boost_1', qualified_cpa: 2 }]);
    expect(s.has('boost_1')).toBe(true);
  });

  it('linha manual é POR DIA: um único dia com sinal já marca o afiliado', () => {
    const s = producingAffiliateIds([], [
      { affiliateId: 'X', registrations: 0, total_commission: 0 },
      { affiliateId: 'X', registrations: 0, total_commission: 280 },
      { affiliateId: 'Y', registrations: 0, total_commission: 0 },
    ]);
    expect(s.has('X')).toBe(true);
    expect(s.has('Y')).toBe(false);
  });

  it('agregado da casa (affiliateId nulo) NÃO vira produção de ninguém', () => {
    const s = producingAffiliateIds([], [{ affiliateId: null, qualified_cpa: 99 }]);
    expect(s.size).toBe(0);
  });

  it('une as duas fontes sem duplicar o mesmo afiliado', () => {
    const s = producingAffiliateIds(
      [{ affiliate_id: 'A', registrations: 1 }],
      [{ affiliateId: 'A', qualified_cpa: 5 }, { affiliateId: 'B', deposit: 10 }]
    );
    expect(s).toEqual(new Set(['A', 'B']));
  });

  it('entrada nula/ausente não explode', () => {
    expect(producingAffiliateIds(null, null).size).toBe(0);
    expect(producingAffiliateIds(undefined, undefined).size).toBe(0);
    expect(producingAffiliateIds([{ affiliate_id: '', registrations: 1 }], []).size).toBe(0);
  });
});
