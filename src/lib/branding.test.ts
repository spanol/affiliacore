import { describe, it, expect } from 'vitest';
import { resolveBrand } from './branding';

describe('resolveBrand · marca por instância (P3)', () => {
  it('sem env → marca Boost atual (instância existente não muda nada)', () => {
    expect(resolveBrand(undefined)).toEqual({
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
    expect(b.faviconUrl).toBe('/boost-home/favicon.svg'); // não setado → default
  });

  it('string vazia/só espaços NÃO sobrepõe (cai no default, sem marca em branco)', () => {
    const b = resolveBrand({ VITE_BRAND_NAME: '  ', VITE_BRAND_SHORT: '' });
    expect(b.name).toBe('Agência Boost');
    expect(b.shortName).toBe('Boost');
  });

  it('respeita o BASE_URL no default do logo/favicon', () => {
    const b = resolveBrand({}, '/app/');
    expect(b.logoUrl).toBe('/app/boost-home/logo.svg');
    expect(b.faviconUrl).toBe('/app/boost-home/favicon.svg');
  });

  it('valor não-string (env exótica) não quebra e cai no default', () => {
    const b = resolveBrand({ VITE_BRAND_NAME: 123 as any, VITE_BRAND_LOGO_URL: null });
    expect(b.name).toBe('Agência Boost');
    expect(b.logoUrl).toBe('/boost-home/logo.svg');
  });
});
