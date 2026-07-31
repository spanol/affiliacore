import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import BrandName from './BrandName';

// BRAND mutável por teste — o componente lê o objeto a cada render.
const mockBrand = vi.hoisted(() => ({
  name: 'AffiliaCore',
  shortName: 'AffiliaCore',
  logoUrl: '/affiliacore/logo.svg',
  faviconUrl: '/affiliacore/favicon.svg',
  logoLightUrl: null as string | null,
  logoDarkUrl: null as string | null,
}));
vi.mock('../lib/brandingClient', () => ({ BRAND: mockBrand }));

describe('BrandName · nome da instância à prova de tradutor', () => {
  beforeEach(() => {
    mockBrand.name = 'AffiliaCore';
    mockBrand.shortName = 'AffiliaCore';
  });

  it('default = nome CURTO (o que cabe no meio de frase)', () => {
    mockBrand.name = 'Infinity Affiliates';
    mockBrand.shortName = 'Infinity';
    const { container } = render(<BrandName />);
    expect(container.textContent).toBe('Infinity');
  });

  it('full → nome COMPLETO', () => {
    mockBrand.name = 'Infinity Affiliates';
    mockBrand.shortName = 'Infinity';
    const { container } = render(<BrandName full />);
    expect(container.textContent).toBe('Infinity Affiliates');
  });

  // O invariante do componente: marca não se traduz. Sem isto o Chrome vira
  // "Infinity" em "infinidade" (queixa real do cliente, 2026-07-31).
  it('marca o texto como NÃO traduzível', () => {
    const { container } = render(<BrandName />);
    expect(container.querySelector('span')!.getAttribute('translate')).toBe('no');
  });

  it('repassa className', () => {
    const { container } = render(<BrandName className="font-bold" />);
    expect(container.querySelector('span')!.className).toBe('font-bold');
  });
});
