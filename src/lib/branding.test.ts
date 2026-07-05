import { describe, it, expect } from 'vitest';
import { resolveBrand } from './branding';

describe('resolveBrand · marca por instância (P3)', () => {
  it('sem env → marca do PRODUTO (AffiliaCore — inversão P4.1; Boost é pinado por env)', () => {
    expect(resolveBrand(undefined)).toEqual({
      name: 'AffiliaCore',
      shortName: 'AffiliaCore',
      logoUrl: '/affiliacore/logo.svg',
      faviconUrl: '/affiliacore/favicon.svg',
    });
  });

  it('instância Boost pinada por env reproduz a marca do Carlos exatamente', () => {
    const b = resolveBrand({
      VITE_BRAND_NAME: 'Agência Boost',
      VITE_BRAND_SHORT: 'Boost',
      VITE_BRAND_LOGO_URL: '/boost-home/logo.svg',
      VITE_BRAND_FAVICON_URL: '/boost-home/favicon.svg',
    });
    expect(b).toEqual({
      name: 'Agência Boost',
      shortName: 'Boost',
      logoUrl: '/boost-home/logo.svg',
      faviconUrl: '/boost-home/favicon.svg',
    });
  });

  it('envs setadas sobrepõem cada campo individualmente', () => {
    const b = resolveBrand({
      VITE_BRAND_NAME: 'Agência Alfa',
      VITE_BRAND_SHORT: 'Alfa',
      VITE_BRAND_LOGO_URL: 'https://cdn.alfa.com/logo.svg',
    });
    expect(b.name).toBe('Agência Alfa');
    expect(b.shortName).toBe('Alfa');
    expect(b.logoUrl).toBe('https://cdn.alfa.com/logo.svg');
    expect(b.faviconUrl).toBe('/affiliacore/favicon.svg'); // não setado → default do produto
  });

  it('string vazia/só espaços NÃO sobrepõe (cai no default, sem marca em branco)', () => {
    const b = resolveBrand({ VITE_BRAND_NAME: '  ', VITE_BRAND_SHORT: '' });
    expect(b.name).toBe('AffiliaCore');
    expect(b.shortName).toBe('AffiliaCore');
  });

  it('respeita o BASE_URL no default do logo/favicon', () => {
    const b = resolveBrand({}, '/app/');
    expect(b.logoUrl).toBe('/app/affiliacore/logo.svg');
    expect(b.faviconUrl).toBe('/app/affiliacore/favicon.svg');
  });

  it('valor não-string (env exótica) não quebra e cai no default', () => {
    const b = resolveBrand({ VITE_BRAND_NAME: 123 as any, VITE_BRAND_LOGO_URL: null });
    expect(b.name).toBe('AffiliaCore');
    expect(b.logoUrl).toBe('/affiliacore/logo.svg');
  });
});
