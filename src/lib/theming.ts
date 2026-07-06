// P3.1 (produtização): tema por instância — cor de destaque (accent) e superfície
// da marca configuráveis por env, sem rebuild por cliente.
//   VITE_BRAND_ACCENT  — 1 hex (ex. '#E11D48'); vira a escala accent-50..950 inteira
//                        + --color-accent-contrast (texto legível sobre o accent).
//   VITE_BRAND_SURFACE — hex do navy de superfície (--color-brand); a variante
//                        clara (--color-brand-light) é derivada automaticamente.
//   VITE_BRAND_STYLE   — P3.2: estilo das superfícies de marca. 'glass' (default,
//                        o look da Boost: fills translúcidos + backdrop-blur) ou
//                        'solid' (fills opacos, blur zerado — look corporativo).
//                        Mecânica idêntica: os tokens --color-glass-*/--blur-glass-*
//                        do index.css são sobrescritos no :root em runtime.
//   VITE_BRAND_CANVAS  — P3.3: matiz do CANVAS escuro. 1 hex → re-tinta a ramp
//                        neutral-* inteira (fundos/cards/bordas/textos do dark;
//                        luminosidade segue a curva slate) e leva os tokens glass
//                        escuros junto. É a env que muda a "cara" do modo escuro —
//                        accent/style sozinhos mudam pouco num dark lado a lado.
//   VITE_BRAND_THEME   — P3.3: tema INICIAL ('light'|'dark') p/ quem não tem
//                        preferência salva; ausência = preferência do SO
//                        (comportamento Boost). Consumido pelo ThemeContext via
//                        brandingClient (não emite var CSS).
// Mecânica: no Tailwind v4 cada classe `bg-accent-500` compila para
// var(--color-accent-500) — sobrescrever a var no :root re-tematiza em runtime.
// Ausência das envs → null → as vars ficam com o default do index.css (amber/navy,
// o visual do produto e da instância Boost — regressão-zero).
// Puro e sem import.meta (mesmo padrão de branding.ts); o client aplica via
// brandingClient.ts.

export type AccentStep =
  | '50' | '100' | '200' | '300' | '400' | '500'
  | '600' | '700' | '800' | '900' | '950';

export const ACCENT_STEPS: AccentStep[] = [
  '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950',
];

export type AccentRamp = Record<AccentStep, string> & { contrast: string };

interface Hsl { h: number; s: number; l: number }

/** '#rgb' ou '#rrggbb' (com ou sem '#') → RGB 0–255; inválido → null. */
export function parseHex(input: unknown): { r: number; g: number; b: number } | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().replace(/^#/, '');
  const full = /^[0-9a-fA-F]{6}$/.test(raw)
    ? raw
    : /^[0-9a-fA-F]{3}$/.test(raw)
      ? raw.split('').map((c) => c + c).join('')
      : null;
  if (!full) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function hslCss({ h, s, l }: Hsl, alpha?: number): string {
  const round = (v: number) => Math.round(v * 10) / 10;
  const base = `${round(h)} ${round(clamp01(s) * 100)}% ${round(clamp01(l) * 100)}%`;
  return alpha === undefined ? `hsl(${base})` : `hsl(${base} / ${alpha})`;
}

/** Luminância relativa WCAG de um RGB 0–255. */
export function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const cn = c / 255;
    return cn <= 0.04045 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Escada de interpolação: o hex de entrada É o degrau 500; os claros caminham em
// direção a L≈0.97 e os escuros a L≈0.10 (proporções calcadas na curva das
// paletas do Tailwind). Saturação relaxa nos extremos claros (fundos suaves).
const LIGHT_T: Array<[AccentStep, number]> = [
  ['50', 0.95], ['100', 0.87], ['200', 0.72], ['300', 0.52], ['400', 0.27],
];
const DARK_T: Array<[AccentStep, number]> = [
  ['600', 0.18], ['700', 0.36], ['800', 0.52], ['900', 0.65], ['950', 0.84],
];
const L_MAX = 0.97;
const L_MIN = 0.10;

/**
 * Gera a escala accent completa a partir de UM hex (o tom "500" da marca).
 * Hex inválido/vazio → null (chamador mantém o default do CSS).
 */
export function buildAccentRamp(hex: unknown): AccentRamp | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const base = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const ramp = {} as AccentRamp;
  for (const [step, t] of LIGHT_T) {
    const l = base.l + (L_MAX - base.l) * t;
    const s = base.s * (1 - 0.25 * t); // fundos claros menos saturados
    ramp[step] = hslCss({ h: base.h, s, l });
  }
  ramp['500'] = hslCss(base);
  for (const [step, t] of DARK_T) {
    const l = base.l - (base.l - L_MIN) * t;
    ramp[step] = hslCss({ h: base.h, s: base.s, l });
  }

  // Texto sobre o accent (botões bg-accent-500/600): branco quando o contraste
  // WCAG passa de 4.5:1; senão um quase-preto quente (mesma família do amber-950).
  const lum = relativeLuminance(rgb.r, rgb.g, rgb.b);
  const contrastWhite = (1.0 + 0.05) / (lum + 0.05);
  ramp.contrast = contrastWhite >= 4.5 ? '#ffffff' : '#1c1408';
  return ramp;
}

export interface ThemeTokens {
  /** Vars CSS a aplicar no :root; vazio = fica tudo no default do index.css. */
  cssVars: Record<string, string>;
}

// ——— P3.2: estilo das superfícies de marca (efeito glass) ————————————————

export type BrandStyle = 'glass' | 'solid';

/** 'glass' | 'solid' (case-insensitive); qualquer outra coisa → null (default). */
export function resolveBrandStyle(input: unknown): BrandStyle | null {
  const s = typeof input === 'string' ? input.trim().toLowerCase() : '';
  return s === 'glass' || s === 'solid' ? s : null;
}

// Preset 'solid': mesmos cinzas das superfícies glass (neutral-950/900/800 do
// Tailwind), só que OPACOS, e todo backdrop-blur zerado. Tokens já-opacos no
// default (card light, thead light) não precisam de override e ficam de fora.
export const SOLID_STYLE_VARS: Record<string, string> = {
  '--color-glass-chrome': '#ffffff',
  '--color-glass-chrome-dark': '#0a0a0a',
  '--color-glass-card-dark': '#171717',
  '--color-glass-frame-dark': '#171717',
  '--color-glass-banner': '#ffffff',
  '--color-glass-banner-dark': '#171717',
  '--color-glass-thead-dark': '#262626',
  '--blur-glass-soft': '0px',
  '--blur-glass-medium': '0px',
  '--blur-glass-strong': '0px',
};

// ——— P3.3: canvas escuro por instância ———————————————————————————————————

// Curvas calcadas na paleta slate do Tailwind (o "cinza tintado" de referência):
// LUMINOSIDADE FIXA por degrau (garante contraste texto/fundo idêntico ao das
// paletas neutras oficiais, independente do hex de entrada); o hex de entrada
// contribui só MATIZ + saturação (limitada e re-escalada por degrau — o 950
// satura mais, os cinzas médios quase nada — mesma assinatura da slate). Passar
// a própria slate-900 (#0f172a) reproduz ≈slate; qualquer matiz gera a família
// tintada equivalente.
const CANVAS_L: Record<AccentStep, number> = {
  '50': 0.98, '100': 0.961, '200': 0.91, '300': 0.84, '400': 0.651,
  '500': 0.469, '600': 0.345, '700': 0.267, '800': 0.175, '900': 0.112, '950': 0.049,
};
const CANVAS_S: Record<AccentStep, number> = {
  '50': 0.84, '100': 0.84, '200': 0.68, '300': 0.57, '400': 0.43,
  '500': 0.34, '600': 0.41, '700': 0.53, '800': 0.69, '900': 1, '950': 1.77,
};
const CANVAS_S_BASE_MAX = 0.55; // entrada muito saturada não vira canvas berrante

function canvasHslSteps(hex: unknown): Record<AccentStep, Hsl> | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const base = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const sBase = Math.min(base.s, CANVAS_S_BASE_MAX);
  const out = {} as Record<AccentStep, Hsl>;
  for (const step of ACCENT_STEPS) {
    out[step] = { h: base.h, s: clamp01(sBase * CANVAS_S[step]), l: CANVAS_L[step] };
  }
  return out;
}

/**
 * Ramp neutra TINTADA (o canvas do modo escuro) a partir de UM hex — sobrescreve
 * --color-neutral-50..950 no :root. Hex inválido/vazio → null (neutral original).
 */
export function buildCanvasRamp(hex: unknown): Record<AccentStep, string> | null {
  const steps = canvasHslSteps(hex);
  if (!steps) return null;
  const out = {} as Record<AccentStep, string>;
  for (const step of ACCENT_STEPS) out[step] = hslCss(steps[step]);
  return out;
}

// ——— P3.3: tema inicial da instância —————————————————————————————————————

export type ThemeName = 'light' | 'dark';

/** 'light' | 'dark' (case-insensitive); resto → null (= preferência do SO). */
export function resolveDefaultTheme(input: unknown): ThemeName | null {
  const s = typeof input === 'string' ? input.trim().toLowerCase() : '';
  return s === 'light' || s === 'dark' ? s : null;
}

/**
 * Tema inicial efetivo: preferência SALVA do usuário > default da instância
 * (VITE_BRAND_THEME) > preferência do SO. Pura p/ teste; ThemeContext delega.
 */
export function resolveInitialTheme(
  saved: unknown,
  brandDefault: ThemeName | null,
  prefersDark: boolean,
): ThemeName {
  if (saved === 'light' || saved === 'dark') return saved;
  if (brandDefault) return brandDefault;
  return prefersDark ? 'dark' : 'light';
}

/** Deriva a variante clara da superfície (ex.: brand → brand-light). */
export function lightenSurface(hex: unknown, amount = 0.09): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return hslCss({ ...hsl, l: clamp01(hsl.l + amount) });
}

/**
 * Lê as envs de tema (mesmo contrato de resolveBrand: um Record qualquer) e
 * devolve as vars CSS a sobrescrever. Envs ausentes/inválidas → não emite a var.
 */
export function resolveThemeTokens(env?: Record<string, unknown> | null): ThemeTokens {
  const e = env ?? {};
  const cssVars: Record<string, string> = {};

  const accent = buildAccentRamp(e.VITE_BRAND_ACCENT);
  if (accent) {
    for (const step of ACCENT_STEPS) cssVars[`--color-accent-${step}`] = accent[step];
    cssVars['--color-accent-contrast'] = accent.contrast;
  }

  const surface = parseHex(e.VITE_BRAND_SURFACE);
  if (surface) {
    const light = lightenSurface(e.VITE_BRAND_SURFACE);
    cssVars['--color-brand'] = hslCss(rgbToHsl(surface.r, surface.g, surface.b));
    if (light) cssVars['--color-brand-light'] = light;
  }

  // P3.3: canvas escuro tintado — re-tinta a ramp neutral-* inteira e leva os
  // tokens glass ESCUROS junto (senão as superfícies de marca ficariam no cinza
  // original flutuando sobre o canvas tintado). Alphas = os dos defaults.
  const canvas = canvasHslSteps(e.VITE_BRAND_CANVAS);
  if (canvas) {
    for (const step of ACCENT_STEPS) {
      cssVars[`--color-neutral-${step}`] = hslCss(canvas[step]);
    }
    cssVars['--color-glass-chrome-dark'] = hslCss(canvas['950'], 0.8);
    cssVars['--color-glass-card-dark'] = hslCss(canvas['900'], 0.6);
    cssVars['--color-glass-frame-dark'] = hslCss(canvas['900'], 0.5);
    cssVars['--color-glass-banner-dark'] = hslCss(canvas['900'], 0.95);
    cssVars['--color-glass-thead-dark'] = hslCss(canvas['800'], 0.5);
  }

  // 'glass' (ou ausente/inválida) = default do CSS — não emite nada.
  if (resolveBrandStyle(e.VITE_BRAND_STYLE) === 'solid') {
    Object.assign(cssVars, SOLID_STYLE_VARS);
    if (canvas) {
      // solid + canvas: fills opacos saem da ramp tintada, não do cinza fixo.
      cssVars['--color-glass-chrome-dark'] = hslCss(canvas['950']);
      cssVars['--color-glass-card-dark'] = hslCss(canvas['900']);
      cssVars['--color-glass-frame-dark'] = hslCss(canvas['900']);
      cssVars['--color-glass-banner-dark'] = hslCss(canvas['900']);
      cssVars['--color-glass-thead-dark'] = hslCss(canvas['800']);
    }
  }

  return { cssVars };
}
