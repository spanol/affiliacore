import { describe, expect, it } from 'vitest';
import {
  ACCENT_STEPS,
  buildAccentRamp,
  lightenSurface,
  parseHex,
  relativeLuminance,
  resolveThemeTokens,
} from './theming';

const lightnessOf = (hsl: string): number => {
  const m = /hsl\([\d.]+ [\d.]+% ([\d.]+)%\)/.exec(hsl);
  if (!m) throw new Error(`hsl inesperado: ${hsl}`);
  return parseFloat(m[1]);
};

const hueOf = (hsl: string): number => {
  const m = /hsl\(([\d.]+) /.exec(hsl);
  if (!m) throw new Error(`hsl inesperado: ${hsl}`);
  return parseFloat(m[1]);
};

describe('parseHex', () => {
  it('aceita #rrggbb e #rgb (expande), com ou sem #', () => {
    expect(parseHex('#f59e0b')).toEqual({ r: 0xf5, g: 0x9e, b: 0x0b });
    expect(parseHex('f59e0b')).toEqual({ r: 0xf5, g: 0x9e, b: 0x0b });
    expect(parseHex('#fa0')).toEqual({ r: 0xff, g: 0xaa, b: 0x00 });
  });

  it('rejeita entradas inválidas sem lançar', () => {
    expect(parseHex('')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('vermelho')).toBeNull();
    expect(parseHex(null)).toBeNull();
    expect(parseHex(42 as unknown)).toBeNull();
    expect(parseHex({ toString: false } as unknown)).toBeNull();
  });
});

describe('buildAccentRamp', () => {
  it('hex inválido → null (chamador mantém o default do CSS)', () => {
    expect(buildAccentRamp('')).toBeNull();
    expect(buildAccentRamp(undefined)).toBeNull();
    expect(buildAccentRamp('#zzz')).toBeNull();
  });

  it('gera os 11 degraus + contrast', () => {
    const ramp = buildAccentRamp('#E11D48')!;
    for (const step of ACCENT_STEPS) expect(ramp[step]).toMatch(/^hsl\(/);
    expect(ramp.contrast).toMatch(/^#/);
  });

  it('luminosidade estritamente decrescente do 50 ao 950 (ramp monotônica)', () => {
    for (const hex of ['#E11D48', '#f59e0b', '#1e3a8a', '#16a34a']) {
      const ramp = buildAccentRamp(hex)!;
      const ls = ACCENT_STEPS.map((s) => lightnessOf(ramp[s]));
      for (let i = 1; i < ls.length; i++) {
        expect(ls[i], `${hex}: degrau ${ACCENT_STEPS[i]} vs ${ACCENT_STEPS[i - 1]}`)
          .toBeLessThan(ls[i - 1]);
      }
    }
  });

  it('o degrau 500 preserva o matiz da marca em toda a escala', () => {
    const ramp = buildAccentRamp('#E11D48')!;
    const h500 = hueOf(ramp['500']);
    for (const step of ACCENT_STEPS) {
      expect(hueOf(ramp[step])).toBeCloseTo(h500, 0);
    }
  });

  it('contraste: accent claro (amber) → texto escuro; accent escuro (navy) → branco', () => {
    expect(buildAccentRamp('#f59e0b')!.contrast).toBe('#1c1408');
    expect(buildAccentRamp('#1e3a8a')!.contrast).toBe('#ffffff');
  });
});

describe('relativeLuminance', () => {
  it('branco=1, preto=0, e é monotônica no cinza', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 5);
    expect(relativeLuminance(200, 200, 200)).toBeGreaterThan(relativeLuminance(100, 100, 100));
  });
});

describe('lightenSurface', () => {
  it('clareia mantendo o matiz; inválido → null', () => {
    const out = lightenSurface('#141C2A');
    expect(out).toMatch(/^hsl\(/);
    expect(lightnessOf(out!)).toBeGreaterThan(lightnessOf('hsl(216 35.5% 12.2%)'));
    expect(lightenSurface('#xyz')).toBeNull();
  });
});

describe('resolveThemeTokens', () => {
  it('sem envs → nenhuma var (defaults do index.css valem: regressão-zero)', () => {
    expect(resolveThemeTokens({}).cssVars).toEqual({});
    expect(resolveThemeTokens(null).cssVars).toEqual({});
    expect(resolveThemeTokens({ VITE_BRAND_ACCENT: '' }).cssVars).toEqual({});
    expect(resolveThemeTokens({ VITE_BRAND_ACCENT: 'não-é-hex' }).cssVars).toEqual({});
  });

  it('VITE_BRAND_ACCENT emite a escala completa + contrast', () => {
    const { cssVars } = resolveThemeTokens({ VITE_BRAND_ACCENT: '#E11D48' });
    expect(Object.keys(cssVars)).toHaveLength(ACCENT_STEPS.length + 1);
    expect(cssVars['--color-accent-500']).toMatch(/^hsl\(/);
    expect(cssVars['--color-accent-contrast']).toBe('#ffffff');
  });

  it('VITE_BRAND_SURFACE emite brand + brand-light derivada', () => {
    const { cssVars } = resolveThemeTokens({ VITE_BRAND_SURFACE: '#141C2A' });
    expect(cssVars['--color-brand']).toMatch(/^hsl\(/);
    expect(cssVars['--color-brand-light']).toMatch(/^hsl\(/);
    expect(lightnessOf(cssVars['--color-brand-light']))
      .toBeGreaterThan(lightnessOf(cssVars['--color-brand']));
  });

  it('as duas envs juntas convivem', () => {
    const { cssVars } = resolveThemeTokens({
      VITE_BRAND_ACCENT: '#16a34a',
      VITE_BRAND_SURFACE: '#0b1f17',
    });
    expect(cssVars['--color-accent-500']).toBeDefined();
    expect(cssVars['--color-brand']).toBeDefined();
  });
});
