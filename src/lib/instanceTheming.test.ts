// @vitest-environment node
//
// Invariante de PRODUTIZAÇÃO (2026-07-28): o fundo PRETO é o padrão de toda
// label. O apphosting.yaml BASE é herdado por TODA instância, então tema no
// base = tema em toda label que não sobrescrever — foi assim que o ember da
// AffiliaCore (P5.1) vazou p/ Infinity e Previsão e deixou modais/cards
// avermelhados (o CANVAS re-tinta a ramp neutral-* inteira + os tokens glass
// escuros, ver resolveThemeTokens). Este teste trava as duas pontas:
//   1. o base não declara VITE_BRAND_* nenhum;
//   2. toda label de cliente resolve SEM canvas/surface (default do index.css);
//   3. a vitrine do produto (demo) segue ember — o tema não se perdeu, mudou de
//      arquivo.
// Se um destes cair, a próxima label nasce com a cara errada de novo.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveThemeTokens } from './theming';

const THEME_ENVS = [
  'VITE_BRAND_ACCENT',
  'VITE_BRAND_CANVAS',
  'VITE_BRAND_SURFACE',
  'VITE_BRAND_STYLE',
  'VITE_BRAND_THEME',
] as const;

/** Instâncias de CLIENTE (label). `demo` é a vitrine do produto, não é label.
 *  `boost` saiu daqui em 2026-07-30: a label foi entregue ao Carlos com a codebase
 *  própria (repo `spanol/boost`), e o backend dele builda de lá — o yaml não vive
 *  mais neste repo. Ver PRODUTIZACAO.md. */
const LABELS = ['infinity', 'previsao'] as const;

/** Envs `- variable: X` + `value: Y` de um apphosting yaml (entradas `secret:` são ignoradas). */
function readEnv(file: string): Record<string, string> {
  const path = new URL(`../../${file}`, import.meta.url);
  const txt = readFileSync(path, 'utf8');
  const out: Record<string, string> = {};
  const re = /^[ \t]*-[ \t]*variable:[ \t]*(\S+)[ \t]*\r?\n[ \t]*value:[ \t]*(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  return out;
}

/** O que a instância REALMENTE vê: base + override específico (específico vence). */
const merged = (instance: string) => ({
  ...readEnv('apphosting.yaml'),
  ...readEnv(`apphosting.${instance}.yaml`),
});

describe('tema por instância (apphosting.*.yaml)', () => {
  it('o BASE não declara tema — senão toda label herda a cara do produto', () => {
    const base = readEnv('apphosting.yaml');
    for (const env of THEME_ENVS) {
      expect(base, `${env} não pode voltar ao apphosting.yaml`).not.toHaveProperty(env);
    }
  });

  it.each(LABELS)('label "%s" nasce no fundo PRETO (sem canvas/surface)', (instance) => {
    const { cssVars } = resolveThemeTokens(merged(instance));
    // canvas ⇒ re-tinta neutral-* + glass escuros; surface ⇒ --color-brand.
    const tinted = Object.keys(cssVars).filter(
      (v) => v.startsWith('--color-neutral-') || v.startsWith('--color-brand') || v.startsWith('--color-glass-'),
    );
    expect(tinted, `${instance} está tingindo o canvas/superfície`).toEqual([]);
  });

  it('a Infinity mantém o accent roxo do cliente (o fix do fundo não apagou a marca)', () => {
    const { cssVars } = resolveThemeTokens(merged('infinity'));
    expect(cssVars['--color-accent-500']).toBe('hsl(276 57.4% 46.1%)');
  });

  it('a superfície pública da Infinity fala o roxo da marca (LP + telas de auth)', () => {
    const { cssVars } = resolveThemeTokens(merged('infinity'));
    expect(cssVars['--color-lp-cta']).toBe(cssVars['--color-accent-500']);
    expect(cssVars['--color-lp-cta-text']).toBe(cssVars['--color-accent-contrast']);
    expect(cssVars['--color-lp-glow']).toMatch(/^hsl\(276 /);
    expect(cssVars['--color-auth-cta']).toBe(cssVars['--color-accent-500']);
  });

  it('label SEM accent não pinta a superfície pública (fica pixel-idêntica)', () => {
    // Os --color-lp-*/--color-auth-* nascem branco/neutral/navy no index.css e só
    // são emitidos por quem declara accent. Uma instância que herda o base e não
    // declara nada — ou que "des-seta" com 'none' — não muda um pixel na landing
    // nem nas telas de auth. (Era o caso da Boost, que já saiu deste repo; o
    // contrato vale p/ qualquer label nova que entre sem cor definida.)
    const herdado = readEnv('apphosting.yaml');
    for (const env of [{ ...herdado }, { ...herdado, VITE_BRAND_ACCENT: 'none' }]) {
      const { cssVars } = resolveThemeTokens(env);
      expect(Object.keys(cssVars).filter((v) => /^--color-(lp|auth)-/.test(v))).toEqual([]);
    }
  });

  it('a DEMO (vitrine do produto) segue no ember AffiliaCore', () => {
    const { cssVars } = resolveThemeTokens(merged('demo'));
    expect(cssVars['--color-neutral-950']).toBeTruthy(); // canvas plum aplicado
    expect(cssVars['--color-brand']).toBeTruthy(); // surface aplicada
    expect(cssVars['--color-accent-500']).toBeTruthy(); // ember
  });
});
