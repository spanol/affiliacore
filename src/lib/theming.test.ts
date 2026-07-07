import { describe, expect, it } from 'vitest';
import {
  ACCENT_STEPS,
  SOLID_STYLE_VARS,
  buildAccentRamp,
  buildCanvasRamp,
  lightenSurface,
  parseHex,
  relativeLuminance,
  resolveBrandStyle,
  resolveDefaultTheme,
  resolveInitialTheme,
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

  it('CONTRATO do pin da Boost (P5.1): todas as envs de tema com string VAZIA equivalem a ausentes', () => {
    // O apphosting.yaml BASE define o tema AffiliaCore; o apphosting.boost.yaml
    // "des-seta" com '' p/ a Boost cair nos defaults do index.css (amber/neutral
    // /navy). Se '' deixar de significar "ausente", a Boost muda de cara em prod.
    const { cssVars } = resolveThemeTokens({
      VITE_BRAND_ACCENT: '',
      VITE_BRAND_CANVAS: '',
      VITE_BRAND_SURFACE: '',
      VITE_BRAND_STYLE: '',
      VITE_BRAND_THEME: '',
    });
    expect(cssVars).toEqual({});
    expect(resolveDefaultTheme('')).toBeNull();
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

  it("VITE_BRAND_STYLE='solid' emite os overrides do preset (blur zerado, fills opacos)", () => {
    const { cssVars } = resolveThemeTokens({ VITE_BRAND_STYLE: 'solid' });
    expect(cssVars).toEqual(SOLID_STYLE_VARS);
    expect(cssVars['--blur-glass-soft']).toBe('0px');
    expect(cssVars['--blur-glass-medium']).toBe('0px');
    expect(cssVars['--blur-glass-strong']).toBe('0px');
    // opacos: nenhum valor do preset carrega canal alpha
    for (const [name, value] of Object.entries(cssVars)) {
      if (!name.startsWith('--color-')) continue;
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("VITE_BRAND_STYLE='glass', ausente ou lixo → nenhuma var (default do CSS)", () => {
    expect(resolveThemeTokens({ VITE_BRAND_STYLE: 'glass' }).cssVars).toEqual({});
    expect(resolveThemeTokens({ VITE_BRAND_STYLE: 'vidro' }).cssVars).toEqual({});
    expect(resolveThemeTokens({ VITE_BRAND_STYLE: 42 }).cssVars).toEqual({});
  });

  it('estilo + accent convivem (tema completo de instância)', () => {
    const { cssVars } = resolveThemeTokens({
      VITE_BRAND_ACCENT: '#2563eb',
      VITE_BRAND_STYLE: 'solid',
    });
    expect(cssVars['--color-accent-500']).toBeDefined();
    expect(cssVars['--blur-glass-strong']).toBe('0px');
  });
});

describe('resolveBrandStyle', () => {
  it('normaliza caixa/espaços; só aceita os presets conhecidos', () => {
    expect(resolveBrandStyle('solid')).toBe('solid');
    expect(resolveBrandStyle('  SOLID ')).toBe('solid');
    expect(resolveBrandStyle('Glass')).toBe('glass');
    expect(resolveBrandStyle('flat')).toBeNull();
    expect(resolveBrandStyle('')).toBeNull();
    expect(resolveBrandStyle(undefined)).toBeNull();
    expect(resolveBrandStyle(null)).toBeNull();
  });
});

describe('buildCanvasRamp (P3.3)', () => {
  it('hex inválido → null (neutral original do Tailwind vale)', () => {
    expect(buildCanvasRamp('')).toBeNull();
    expect(buildCanvasRamp(undefined)).toBeNull();
    expect(buildCanvasRamp('#zz')).toBeNull();
  });

  it('gera os 11 degraus em hsl, com o matiz da entrada em todos', () => {
    const ramp = buildCanvasRamp('#0f172a')!; // slate-900
    for (const step of ACCENT_STEPS) {
      expect(ramp[step]).toMatch(/^hsl\(/);
      expect(hueOf(ramp[step])).toBeCloseTo(hueOf(ramp['900']), 0);
    }
  });

  it('luminosidade estritamente decrescente 50→950 (contraste preservado p/ qualquer matiz)', () => {
    for (const hex of ['#0f172a', '#16a34a', '#7c3aed', '#000080']) {
      const ramp = buildCanvasRamp(hex)!;
      const ls = ACCENT_STEPS.map((s) => lightnessOf(ramp[s]));
      for (let i = 1; i < ls.length; i++) {
        expect(ls[i], `${hex}: degrau ${ACCENT_STEPS[i]}`).toBeLessThan(ls[i - 1]);
      }
    }
  });

  it('entrada slate-900 reproduz ≈slate (sanidade da curva)', () => {
    const ramp = buildCanvasRamp('#0f172a')!;
    expect(lightnessOf(ramp['900'])).toBeCloseTo(11.2, 0);
    expect(lightnessOf(ramp['950'])).toBeCloseTo(4.9, 0);
    expect(lightnessOf(ramp['800'])).toBeCloseTo(17.5, 0);
  });

  it('entrada supersaturada é domada (canvas não vira cor chapada)', () => {
    const ramp = buildCanvasRamp('#0000ff')!; // s=100%
    const satOf = (hsl: string): number => {
      const m = /hsl\([\d.]+ ([\d.]+)% /.exec(hsl);
      if (!m) throw new Error(`hsl inesperado: ${hsl}`);
      return parseFloat(m[1]);
    };
    expect(satOf(ramp['900'])).toBeLessThanOrEqual(55);
    expect(satOf(ramp['500'])).toBeLessThanOrEqual(25);
  });
});

describe('resolveThemeTokens · canvas (P3.3)', () => {
  it('VITE_BRAND_CANVAS emite a ramp neutral-* + tokens glass escuros translúcidos', () => {
    const { cssVars } = resolveThemeTokens({ VITE_BRAND_CANVAS: '#0f172a' });
    for (const step of ACCENT_STEPS) {
      expect(cssVars[`--color-neutral-${step}`]).toMatch(/^hsl\(/);
    }
    // glass escuro acompanha o canvas, mantendo os alphas dos defaults
    expect(cssVars['--color-glass-chrome-dark']).toMatch(/\/ 0\.8\)$/);
    expect(cssVars['--color-glass-card-dark']).toMatch(/\/ 0\.6\)$/);
    expect(cssVars['--color-glass-banner-dark']).toMatch(/\/ 0\.95\)$/);
    // lado claro do glass NÃO muda (canvas é eixo do dark)
    expect(cssVars['--color-glass-chrome']).toBeUndefined();
    expect(cssVars['--color-glass-card']).toBeUndefined();
  });

  it('canvas + solid: fills opacos saem da ramp tintada (sem alpha) e blur zera', () => {
    const { cssVars } = resolveThemeTokens({
      VITE_BRAND_CANVAS: '#0f172a',
      VITE_BRAND_STYLE: 'solid',
    });
    expect(cssVars['--blur-glass-strong']).toBe('0px');
    for (const name of [
      '--color-glass-chrome-dark', '--color-glass-card-dark',
      '--color-glass-frame-dark', '--color-glass-banner-dark',
      '--color-glass-thead-dark',
    ]) {
      expect(cssVars[name], name).toMatch(/^hsl\(/);
      expect(cssVars[name], name).not.toMatch(/\//);
    }
    // e o lado claro segue o preset solid normal
    expect(cssVars['--color-glass-chrome']).toBe('#ffffff');
  });

  it('sem VITE_BRAND_CANVAS não emite nenhuma var neutral-*', () => {
    const { cssVars } = resolveThemeTokens({ VITE_BRAND_STYLE: 'solid' });
    expect(Object.keys(cssVars).some((k) => k.startsWith('--color-neutral-'))).toBe(false);
  });
});

describe('resolveDefaultTheme / resolveInitialTheme (P3.3)', () => {
  it("resolveDefaultTheme: só 'light'/'dark' (case-insensitive); resto → null", () => {
    expect(resolveDefaultTheme('light')).toBe('light');
    expect(resolveDefaultTheme(' DARK ')).toBe('dark');
    expect(resolveDefaultTheme('auto')).toBeNull();
    expect(resolveDefaultTheme('')).toBeNull();
    expect(resolveDefaultTheme(undefined)).toBeNull();
  });

  it('precedência: preferência salva > default da instância > SO', () => {
    expect(resolveInitialTheme('dark', 'light', false)).toBe('dark');
    expect(resolveInitialTheme('light', 'dark', true)).toBe('light');
    expect(resolveInitialTheme(null, 'light', true)).toBe('light');
    expect(resolveInitialTheme(null, 'dark', false)).toBe('dark');
    expect(resolveInitialTheme(null, null, true)).toBe('dark');
    expect(resolveInitialTheme(null, null, false)).toBe('light');
    expect(resolveInitialTheme('lixo', null, true)).toBe('dark');
  });
});
