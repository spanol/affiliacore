import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  HOUSE_PRESETS,
  getHousePreset,
  buildHouseIconSvg,
  buildHouseIconDataUrl,
  housePresetIconPath,
  monogramColor,
  contrastRatio,
} from './housePresets';

// A MESMA regex que `uploadHouseLogo` (server.ts) usa pra aceitar o upload — se o
// data URL do preset não casar com ela, o preset não salva.
const SERVER_DATA_URL = /^data:(image\/(png|jpe?g|webp|svg\+xml));base64,(.+)$/i;

describe('catálogo de presets de casas', () => {
  it('não tem slug repetido', () => {
    const slugs = HOUSE_PRESETS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('usa slug em formato de id de documento (minúsculo, sem espaço)', () => {
    for (const p of HOUSE_PRESETS) {
      expect(p.slug, p.name).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('tem cor de marca em hex de 6 dígitos', () => {
    for (const p of HOUSE_PRESETS) {
      expect(p.color, p.name).toMatch(/^#[0-9a-f]{6}$/);
      if (p.accent) expect(p.accent, p.name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('tem monograma de 1 a 3 caracteres', () => {
    for (const p of HOUSE_PRESETS) {
      expect(p.monogram.length, p.name).toBeGreaterThanOrEqual(1);
      expect(p.monogram.length, p.name).toBeLessThanOrEqual(3);
    }
  });

  it('declara a licença SPA/MF e o domínio .bet.br de cada casa', () => {
    for (const p of HOUSE_PRESETS) {
      expect(p.spaPortaria, p.name).toMatch(/^SPA\/MF nº /);
      expect(p.site, p.name).toMatch(/\.bet\.br$/);
      expect(p.legalEntity.trim().length, p.name).toBeGreaterThan(0);
    }
  });

  // Invariante VISUAL: o monograma tem que ser legível sobre a cor da casa. 3:1 é o
  // piso do WCAG AA pra texto grande/negrito — sem isso, casas de cor clara (Pixbet,
  // EstrelaBet, Betfair) sairiam com monograma branco sumindo no fundo.
  it('mantém contraste >= 3:1 entre o monograma e o fundo', () => {
    for (const p of HOUSE_PRESETS) {
      expect(contrastRatio(monogramColor(p), p.color), `${p.name} (${p.color})`).toBeGreaterThanOrEqual(3);
    }
  });

  it('busca por slug é case-insensitive e devolve null p/ desconhecido', () => {
    expect(getHousePreset('BETANO')?.name).toBe('Betano');
    expect(getHousePreset('  bet365 ')?.name).toBe('bet365');
    expect(getHousePreset('casa-que-nao-existe')).toBeNull();
    expect(getHousePreset('')).toBeNull();
    expect(getHousePreset(null)).toBeNull();
  });
});

describe('geração do ícone SVG', () => {
  it('gera um SVG 64x64 com a cor da casa e o monograma', () => {
    const betano = getHousePreset('betano')!;
    const svg = buildHouseIconSvg(betano);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain('#ff3c00');
    expect(svg).toContain('>B</text>');
  });

  it('é determinístico (mesma entrada, mesmos bytes)', () => {
    for (const p of HOUSE_PRESETS) {
      expect(buildHouseIconSvg(p)).toBe(buildHouseIconSvg(p));
    }
  });

  // Se dois ícones forem inlinados no MESMO documento com o mesmo id de gradiente,
  // o segundo herda o brilho do primeiro (colisão de id em SVG é silenciosa).
  it('usa um id de gradiente único por casa', () => {
    const ids = HOUSE_PRESETS.map((p) => /id="([^"]+)"/.exec(buildHouseIconSvg(p))![1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fixa a largura do texto p/ não vazar da caixa em máquina sem a fonte', () => {
    for (const p of HOUSE_PRESETS) {
      const svg = buildHouseIconSvg(p);
      expect(svg, p.name).toContain('lengthAdjust="spacingAndGlyphs"');
      const len = Number(/textLength="(\d+)"/.exec(svg)![1]);
      expect(len, p.name).toBeLessThanOrEqual(48); // caixa de 64 com respiro nas bordas
    }
  });

  it('escapa caracteres especiais em vez de quebrar o XML', () => {
    const svg = buildHouseIconSvg({
      ...getHousePreset('betano')!,
      name: 'Casa & "Cia" <teste>',
      monogram: '&<>',
    });
    expect(svg).toContain('aria-label="Casa &amp; &quot;Cia&quot; &lt;teste&gt;"');
    expect(svg).toContain('>&amp;&lt;&gt;</text>');
  });
});

describe('data URL do preset (caminho de upload)', () => {
  it('casa com a regex que o servidor aceita em uploadHouseLogo', () => {
    for (const p of HOUSE_PRESETS) {
      expect(buildHouseIconDataUrl(p), p.name).toMatch(SERVER_DATA_URL);
    }
  });

  it('decodifica de volta exatamente no SVG gerado', () => {
    const p = getHousePreset('bet365')!;
    const b64 = buildHouseIconDataUrl(p).split(',')[1];
    const decoded =
      typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    expect(decoded).toBe(buildHouseIconSvg(p));
  });

  it('fica MUITO abaixo do teto de 2MB do upload', () => {
    for (const p of HOUSE_PRESETS) {
      expect(buildHouseIconDataUrl(p).length, p.name).toBeLessThan(4096);
    }
  });
});

// Os SVGs em public/brands/presets são GERADOS a partir deste catálogo
// (scripts/gen-house-icons.mjs). Este teste é o cinto de segurança contra drift:
// mudou a cor/monograma no catálogo e esqueceu de regerar, o teste acusa.
describe('assets estáticos em public/brands/presets', () => {
  const repoRoot = resolve(__dirname, '../..');

  it('existe um .svg por preset, idêntico ao que o catálogo gera', () => {
    const stale: string[] = [];
    const missing: string[] = [];
    for (const p of HOUSE_PRESETS) {
      const file = resolve(repoRoot, `public${housePresetIconPath(p)}`);
      if (!existsSync(file)) { missing.push(p.slug); continue; }
      if (readFileSync(file, 'utf8').trim() !== buildHouseIconSvg(p)) stale.push(p.slug);
    }
    expect(missing, 'faltando — rode: npm run icons:casas').toEqual([]);
    expect(stale, 'desatualizado — rode: npm run icons:casas').toEqual([]);
  });
});
