import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import InstanceLogo from './InstanceLogo';

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

describe('InstanceLogo · logo da instância ciente de tema', () => {
  beforeEach(() => {
    mockBrand.logoUrl = '/affiliacore/logo.svg';
    mockBrand.shortName = 'AffiliaCore';
    mockBrand.logoLightUrl = null;
    mockBrand.logoDarkUrl = null;
  });

  it('sem par por tema → uma <img> mono com o invert clássico', () => {
    const { container } = render(<InstanceLogo className="h-7 w-auto" />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe('/affiliacore/logo.svg');
    expect(imgs[0].className).toContain('invert');
    expect(imgs[0].className).toContain('dark:invert-0');
    expect(imgs[0].className).toContain('h-7');
    expect(imgs[0].getAttribute('alt')).toBe('AffiliaCore');
  });

  it('par completo (Infinity) → duas <img> por tema, SEM invert', () => {
    mockBrand.logoLightUrl = '/infinity/logo-sidebar-dark.svg';
    mockBrand.logoDarkUrl = '/infinity/logo-sidebar-white.svg';
    mockBrand.shortName = 'Infinity';
    const { container } = render(<InstanceLogo className="h-[30px] w-auto" />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    // tema claro: a colorida de texto escuro, escondida no dark
    expect(imgs[0].getAttribute('src')).toBe('/infinity/logo-sidebar-dark.svg');
    expect(imgs[0].className).toContain('dark:hidden');
    expect(imgs[0].getAttribute('alt')).toBe('Infinity');
    // tema escuro: a de texto branco, só aparece no dark; decorativa p/ a11y
    expect(imgs[1].getAttribute('src')).toBe('/infinity/logo-sidebar-white.svg');
    expect(imgs[1].className).toContain('hidden');
    expect(imgs[1].className).toContain('dark:block');
    expect(imgs[1].getAttribute('aria-hidden')).toBe('true');
    // nenhuma das duas leva filtro — invert em logo colorida vira verde
    imgs.forEach((img) => expect(img.className).not.toContain('invert'));
    imgs.forEach((img) => expect(img.className).toContain('h-[30px]'));
  });

  it('par INCOMPLETO conta como sem par (mono+invert, nada de tema capenga)', () => {
    mockBrand.logoLightUrl = '/infinity/logo-sidebar-dark.svg';
    const { container } = render(<InstanceLogo />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe('/affiliacore/logo.svg');
    expect(imgs[0].className).toContain('invert');
  });

  it('alt="" (decorativa, ex. HeroDashboardMock) é respeitado', () => {
    const { container } = render(<InstanceLogo alt="" />);
    expect(container.querySelector('img')!.getAttribute('alt')).toBe('');
  });
});
