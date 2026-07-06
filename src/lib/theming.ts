// P3.1 (produtização): tema por instância — cor de destaque (accent) e superfície
// da marca configuráveis por env, sem rebuild por cliente.
//   VITE_BRAND_ACCENT  — 1 hex (ex. '#E11D48'); vira a escala accent-50..950 inteira
//                        + --color-accent-contrast (texto legível sobre o accent).
//   VITE_BRAND_SURFACE — hex do navy de superfície (--color-brand); a variante
//                        clara (--color-brand-light) é derivada automaticamente.
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

function hslCss({ h, s, l }: Hsl): string {
  const round = (v: number) => Math.round(v * 10) / 10;
  return `hsl(${round(h)} ${round(clamp01(s) * 100)}% ${round(clamp01(l) * 100)}%)`;
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

  return { cssVars };
}
