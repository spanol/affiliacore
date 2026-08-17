import { describe, it, expect } from 'vitest';
import {
  buildDealLabel, dealBrandKey, dealToBrandRates, normalizeDealInput, buildDraftDealFromHouse,
  PAYMENT_CYCLES, PAYMENT_CYCLE_LABEL,
} from './deal';

describe('buildDealLabel · padrão Operadora-Modelo-Ciclo-Moeda-Geo', () => {
  it('monta o label completo (igual ao Affility)', () => {
    expect(buildDealLabel({ operatorName: 'Deuces', model: 'cpa', cycle: 'quinzenal', currency: 'crypto', geo: 'México' }))
      .toBe('Deuces - CPA - Quinzenal - crypto - México');
  });
  it('omite partes vazias sem deixar hífen órfão', () => {
    expect(buildDealLabel({ operatorName: 'Betano', model: 'revshare' }))
      .toBe('Betano - RevShare');
    expect(buildDealLabel({ operatorName: 'X', geo: '' })).toBe('X');
  });
  it('objeto vazio → string vazia (nunca lança)', () => {
    expect(buildDealLabel({})).toBe('');
  });
});

describe('ciclo D30+ (pedido Infinity, 17/08/2026)', () => {
  it('entra no enum e tem rótulo próprio, distinto do mensal', () => {
    expect(PAYMENT_CYCLES).toContain('d30mais');
    expect(PAYMENT_CYCLE_LABEL.d30mais).toBe('D30+');
    expect(PAYMENT_CYCLE_LABEL.d30mais).not.toBe(PAYMENT_CYCLE_LABEL.mensal);
  });
  it('todo ciclo do enum tem rótulo (nada cai no vazio na tela)', () => {
    PAYMENT_CYCLES.forEach((c) => expect(PAYMENT_CYCLE_LABEL[c]?.length ?? 0).toBeGreaterThan(0));
  });
  it('aparece no rótulo do acordo', () => {
    expect(buildDealLabel({ operatorName: 'LEON Bet', model: 'cpa', cycle: 'd30mais', currency: 'BRL' }))
      .toBe('LEON Bet - CPA - D30+ - BRL');
  });
  it('normaliza como ciclo válido, sem cair no default', () => {
    const { deal } = normalizeDealInput({ houseId: 'leon-bet', operatorName: 'LEON Bet', model: 'cpa', cpaValue: 150, cycle: 'd30mais' });
    expect(deal?.cycle).toBe('d30mais');
  });
});

describe('meta mínima de CPA', () => {
  const base = { houseId: 'leon-bet', operatorName: 'LEON Bet', model: 'cpa', cpaValue: 150 };

  it('grava a quantidade informada', () => {
    expect(normalizeDealInput({ ...base, minCpaGoal: 5 }).deal?.minCpaGoal).toBe(5);
  });
  // Acordo antigo não tem o campo, e "sem meta" é o estado normal de quem nunca a
  // usou. 0 é o valor que o card lê como "não estipulou" e não desenha a linha.
  it('ausente vira 0 (a casa não estipulou meta), sem exigir migração', () => {
    expect(normalizeDealInput(base).deal?.minCpaGoal).toBe(0);
    expect(normalizeDealInput({ ...base, minCpaGoal: '' }).deal?.minCpaGoal).toBe(0);
  });
  it('recusa negativo', () => {
    expect(normalizeDealInput({ ...base, minCpaGoal: -1 }).error).toMatch(/negativa/i);
  });
  it('recusa quebrado: meta é contagem de CPA, não dinheiro', () => {
    expect(normalizeDealInput({ ...base, minCpaGoal: 2.5 }).error).toMatch(/inteiro/i);
  });
  it('valor malformado não propaga NaN', () => {
    const { deal, error } = normalizeDealInput({ ...base, minCpaGoal: 'abc' });
    expect(error).toBeUndefined();
    expect(deal?.minCpaGoal).toBe(0);
  });
  it('rascunho criado junto com a casa nasce sem meta', () => {
    expect(buildDraftDealFromHouse({ slug: 'leon-bet', name: 'LEON Bet' })?.minCpaGoal).toBe(0);
  });
});

describe('dealBrandKey · casa OTG usa brandId, manual usa slug', () => {
  it('usa brandId quando presente (casa OTG)', () => {
    expect(dealBrandKey({ brandId: 'cmm5-superbet', slug: 'superbet' })).toBe('cmm5-superbet');
  });
  it('cai no slug quando brandId é null/vazio (casa MANUAL — instância OTG-free)', () => {
    expect(dealBrandKey({ brandId: null, slug: 'betano' })).toBe('betano');
    expect(dealBrandKey({ brandId: '   ', slug: 'betfair' })).toBe('betfair');
  });
  it('cai no id quando não há slug', () => {
    expect(dealBrandKey({ id: 'novibet' })).toBe('novibet');
  });
});

describe('dealToBrandRates · termos do deal viram byBrand', () => {
  it('extrai cpaValue/revPercentage e blinda valor malformado', () => {
    expect(dealToBrandRates({ cpaValue: 80, revPercentage: 0 })).toEqual({ cpaValue: 80, revPercentage: 0 });
    expect(dealToBrandRates({ cpaValue: 'lixo' as any, revPercentage: 25 })).toEqual({ cpaValue: 0, revPercentage: 25 });
  });
});

describe('normalizeDealInput · validação de criação/edição', () => {
  it('acordo CPA válido', () => {
    const { deal, error } = normalizeDealInput({ houseId: 'betano', operatorName: 'Betano', model: 'cpa', cpaValue: 120, cycle: 'quinzenal', currency: 'BRL', geo: 'Brasil' });
    expect(error).toBeUndefined();
    expect(deal).toMatchObject({ houseId: 'betano', operatorName: 'Betano', model: 'cpa', cpaValue: 120, revPercentage: 0, cycle: 'quinzenal', currency: 'BRL', geo: 'Brasil', active: true });
  });
  it('sem operadora/casa → erro', () => {
    expect(normalizeDealInput({ operatorName: 'X' }).error).toMatch(/operadora/i);
    expect(normalizeDealInput({ houseId: 'x' }).error).toMatch(/operadora/i);
  });
  it('CPA sem valor → erro; RevShare sem % → erro; híbrido sem nenhum → erro', () => {
    expect(normalizeDealInput({ houseId: 'h', operatorName: 'H', model: 'cpa', cpaValue: 0 }).error).toMatch(/CPA/i);
    expect(normalizeDealInput({ houseId: 'h', operatorName: 'H', model: 'revshare', revPercentage: 0 }).error).toMatch(/RevShare/i);
    expect(normalizeDealInput({ houseId: 'h', operatorName: 'H', model: 'hybrid', cpaValue: 0, revPercentage: 0 }).error).toMatch(/híbrido/i);
  });
  it('valores negativos → erro', () => {
    expect(normalizeDealInput({ houseId: 'h', operatorName: 'H', model: 'cpa', cpaValue: -1 }).error).toMatch(/negativ/i);
  });
  it('modelo/ciclo/moeda inválidos caem no default (cpa/mensal/BRL)', () => {
    const { deal } = normalizeDealInput({ houseId: 'h', operatorName: 'H', model: 'xpto', cycle: 'anual', currency: 'ZZZ', cpaValue: 10 });
    expect(deal).toMatchObject({ model: 'cpa', cycle: 'mensal', currency: 'BRL' });
  });
});

describe('normalizeDealInput · tipo de deal e KPIs da vitrine', () => {
  const base = { houseId: 'esportiva', operatorName: 'Esportiva Bet', model: 'cpa', cpaValue: 110 };

  it('sem `type` grava direto (deal antigo continua valendo)', () => {
    expect(normalizeDealInput(base).deal).toMatchObject({ type: 'direto' });
  });
  it('tipo desconhecido não vaza para o dado', () => {
    expect(normalizeDealInput({ ...base, type: 'infinity' }).deal).toMatchObject({ type: 'direto' });
  });
  it('acordo gerenciado válido guarda baseline, rollover e GGR', () => {
    const { deal, error } = normalizeDealInput({ ...base, type: 'gerenciado', baseline: 10, rollover: 2, ggrPercentage: 30, cycle: 'semanal' });
    expect(error).toBeUndefined();
    expect(deal).toMatchObject({ type: 'gerenciado', baseline: 10, rollover: 2, ggrPercentage: 30, cycle: 'semanal', cpaValue: 110 });
  });
  it('GGR vazio vira null ("se tiver"), não zero', () => {
    expect(normalizeDealInput({ ...base, type: 'gerenciado', baseline: 10, ggrPercentage: '' }).deal?.ggrPercentage).toBeNull();
    expect(normalizeDealInput({ ...base, type: 'gerenciado', baseline: 10 }).deal?.ggrPercentage).toBeNull();
  });
  it('publicar gerenciado sem baseline → erro (card ficaria sem número)', () => {
    expect(normalizeDealInput({ ...base, type: 'gerenciado' }).error).toMatch(/baseline/i);
  });
  it('RASCUNHO (inativo) de gerenciado pode ficar sem baseline', () => {
    const { deal, error } = normalizeDealInput({ ...base, type: 'gerenciado', active: false });
    expect(error).toBeUndefined();
    expect(deal).toMatchObject({ type: 'gerenciado', active: false, baseline: 0 });
  });
  it('acordo direto não exige baseline', () => {
    expect(normalizeDealInput({ ...base, type: 'direto' }).error).toBeUndefined();
  });
  it('baseline/rollover/GGR negativos → erro', () => {
    expect(normalizeDealInput({ ...base, type: 'gerenciado', baseline: -1 }).error).toMatch(/negativ/i);
    expect(normalizeDealInput({ ...base, baseline: 10, rollover: -2 }).error).toMatch(/negativ/i);
    expect(normalizeDealInput({ ...base, baseline: 10, ggrPercentage: -5 }).error).toMatch(/negativ/i);
  });
});

describe('buildDraftDealFromHouse · a casa cria o acordo', () => {
  const house = { slug: 'esportiva', name: 'Esportiva Bet' };

  it('nasce INATIVO, sem taxa e sem KPI (o admin revisa antes de publicar)', () => {
    expect(buildDraftDealFromHouse(house)).toMatchObject({
      houseId: 'esportiva', operatorName: 'Esportiva Bet',
      active: false, cpaValue: 0, revPercentage: 0, baseline: 0, ggrPercentage: null,
    });
  });
  it('carimba o tipo default da instância', () => {
    expect(buildDraftDealFromHouse(house, 'gerenciado')).toMatchObject({ type: 'gerenciado' });
    expect(buildDraftDealFromHouse(house)).toMatchObject({ type: 'direto' });
    expect(buildDraftDealFromHouse(house, 'xpto' as any)).toMatchObject({ type: 'direto' });
  });
  it('usa o id quando a casa não tem slug', () => {
    expect(buildDraftDealFromHouse({ id: 'leon-bet', name: 'LEON' })?.houseId).toBe('leon-bet');
  });
  it('casa sem identidade ou sem nome → null (não cria doc vazio)', () => {
    expect(buildDraftDealFromHouse({ name: 'Sem slug' })).toBeNull();
    expect(buildDraftDealFromHouse({ slug: 'sem-nome' })).toBeNull();
    expect(buildDraftDealFromHouse({} as any)).toBeNull();
  });
  // O rascunho não passa por normalizeDealInput de propósito: o validador exige
  // CPA > 0 no modelo `cpa`, o que é certo ao publicar e errado num rascunho vazio.
  it('o rascunho seria REJEITADO pelo validador de publicação, e tudo bem', () => {
    const draft = buildDraftDealFromHouse(house)!;
    expect(normalizeDealInput({ ...draft, active: true }).error).toBeTruthy();
  });
});
