import { describe, it, expect } from 'vitest';
import { expandAffiliateIdsParam } from './affiliateIdsParam';

describe('expandAffiliateIdsParam (P2.9 · fonte única do CSV→repetido da OTG)', () => {
  it('retorna [] para ausência (null/undefined)', () => {
    expect(expandAffiliateIdsParam(null)).toEqual([]);
    expect(expandAffiliateIdsParam(undefined)).toEqual([]);
  });

  it('expande CSV (string) em ids individuais', () => {
    expect(expandAffiliateIdsParam('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('um id só (string sem vírgula) vira [id]', () => {
    expect(expandAffiliateIdsParam('a')).toEqual(['a']);
  });

  it('array de ids (param repetido do Express) é preservado', () => {
    expect(expandAffiliateIdsParam(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('array com CSV dentro é achatado (["a,b","c"] → a,b,c)', () => {
    expect(expandAffiliateIdsParam(['a,b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('faz trim e descarta vazios (espaços, vírgulas a mais)', () => {
    expect(expandAffiliateIdsParam(' a , , b ,')).toEqual(['a', 'b']);
    expect(expandAffiliateIdsParam('')).toEqual([]);
    expect(expandAffiliateIdsParam([',', ' '])).toEqual([]);
  });

  it('DEDUPLICA preservando a ordem da primeira ocorrência', () => {
    expect(expandAffiliateIdsParam('a,b,a,c,b')).toEqual(['a', 'b', 'c']);
    expect(expandAffiliateIdsParam(['a', 'a,b', 'b'])).toEqual(['a', 'b']);
  });

  it('coage números a string (id numérico do array vira string)', () => {
    expect(expandAffiliateIdsParam([1, 2] as any)).toEqual(['1', '2']);
    expect(expandAffiliateIdsParam(42 as any)).toEqual(['42']);
  });
});
