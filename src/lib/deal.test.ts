import { describe, it, expect } from 'vitest';
import {
  buildDealLabel, dealBrandKey, dealToBrandRates, normalizeDealInput,
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
