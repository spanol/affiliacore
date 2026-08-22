import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  HOUSE_PRESETS,
  getHousePreset,
  buildHouseIconSvg,
  buildHouseLogoSvg,
  buildHouseIconDataUrl,
  housePresetIconPath,
  monogramColor,
  contrastRatio,
  findHousePresetFor,
  houseLogoOrPreset,
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

  // A URL da logo oficial é o caminho de escape do ícone autoral (o admin baixa e
  // sobe a logo real). URL malformada quebraria esse link silenciosamente.
  it('a URL da logo oficial é https ou asset local do repo', () => {
    for (const p of HOUSE_PRESETS) {
      if (!p.officialLogoUrl) continue;
      expect(p.officialLogoUrl, p.name).toMatch(/^(https:\/\/|\/brands\/)/);
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

// Resolução de EXIBIÇÃO: casas criadas antes dos presets têm `logo: null` gravado e
// o seletor só mexe no formulário de criar/editar — sem este fallback elas nunca
// ganhariam ícone (foi o que aconteceu no rollout).
describe('fallback de logo por preset', () => {
  it('casa por slug, por id do doc ou por nome', () => {
    expect(findHousePresetFor('betano')?.name).toBe('Betano');
    expect(findHousePresetFor('Betano')?.slug).toBe('betano');
    expect(findHousePresetFor(null, undefined, 'bet365')?.slug).toBe('bet365');
  });

  it('ignora acento, caixa e separador ao casar nome com slug', () => {
    // o admin digita o nome; o catálogo guarda o slug — as duas grafias têm que bater
    expect(findHousePresetFor('Esportes da Sorte')?.slug).toBe('esportes-da-sorte');
    expect(findHousePresetFor('esportesdasorte')?.slug).toBe('esportes-da-sorte');
    expect(findHousePresetFor('F12.Bet')?.slug).toBe('f12bet');
    expect(findHousePresetFor('BR4BET')?.slug).toBe('br4bet');
    expect(findHousePresetFor('MC Games')?.slug).toBe('mcgames');
    // "SportingBet" é o nome canônico no repo; o preset registra "Sportingbet"
    expect(findHousePresetFor('SportingBet')?.slug).toBe('sportingbet');
  });

  it('não casa casa desconhecida', () => {
    expect(findHousePresetFor('Casa Inventada XYZ')).toBeNull();
    expect(findHousePresetFor('', null, undefined)).toBeNull();
  });

  // "Super Bet V2" é o nome real da casa no painel legado da Infinity — mesma casa,
  // instância diferente. Tratado por REGRA (sufixo de versão), não por caso especial.
  it('casa nome com sufixo de versão no preset base', () => {
    expect(findHousePresetFor('Super Bet V2')?.slug).toBe('superbet');
    expect(findHousePresetFor('Superbet V2')?.slug).toBe('superbet');
    expect(findHousePresetFor('superbet-v2')?.slug).toBe('superbet');
    expect(findHousePresetFor('Betano 2')?.slug).toBe('betano');
  });

  it('casa apelidos declarados no catálogo', () => {
    expect(findHousePresetFor('7k')?.slug).toBe('bet7k');
    expect(findHousePresetFor('Viva Sorte Bet')?.slug).toBe('vivasorte');
    expect(findHousePresetFor('RdP')?.slug).toBe('rei-do-pitaco');
  });

  // Sufixo de SEGMENTO ("Sports") é como a Infinity cadastra a casa da marca-mãe.
  // Não é sufixo de versão (a regra v?<dígitos> não o pega de propósito), então
  // cada um entra como apelido declarado — e some se a marca sair do catálogo.
  it('casa o sufixo de segmento da Infinity no preset da marca-mãe', () => {
    expect(findHousePresetFor('JonBet Sports')?.slug).toBe('jonbet');
    expect(findHousePresetFor('jonbet-sports')?.slug).toBe('jonbet');
    expect(findHousePresetFor('Blaze Sports')?.slug).toBe('blaze');
  });

  it('casa as 5 casas da coleta de 22/08 pelo nome de cadastro', () => {
    expect(findHousePresetFor('Rei do Pitaco')?.slug).toBe('rei-do-pitaco');
    expect(findHousePresetFor('JonBet')?.slug).toBe('jonbet');
    expect(findHousePresetFor('Bet Warrior')?.slug).toBe('betwarrior');
    expect(findHousePresetFor('Bacana Play')?.slug).toBe('bacanaplay');
    expect(findHousePresetFor('Oley Bet')?.slug).toBe('oleybet');
  });

  // A tolerância de versão é estreita de propósito: qualquer sobra faria "StakeBet"
  // (que pode ser outra casa) virar Stake.
  it('NÃO casa sobra que não seja sufixo de versão', () => {
    expect(findHousePresetFor('StakeBet')).toBeNull();
    expect(findHousePresetFor('Betano Cassino')).toBeNull();
    expect(findHousePresetFor('Superbet Premium')).toBeNull();
  });

  // Casamento exato tem que vencer a regra frouxa, senão um preset de nome curto
  // com sufixo numérico poderia sequestrar uma casa que já casa exatamente.
  it('casamento exato vence a tolerância de versão', () => {
    expect(findHousePresetFor('bet365')?.slug).toBe('bet365');
    expect(findHousePresetFor('7games')?.slug).toBe('7games');
    expect(findHousePresetFor('brazino777')?.slug).toBe('brazino777');
  });

  it('a logo do preset segue a mesma resolução p/ nome versionado', () => {
    expect(houseLogoOrPreset(null, 'Super Bet V2')).toBe('/brands/presets/superbet.svg');
  });

  // Invariante: o upload do admin é a verdade. O preset só preenche o VAZIO.
  it('a logo gravada sempre vence o preset', () => {
    expect(houseLogoOrPreset('https://storage/house-logos/betano-123.png', 'betano'))
      .toBe('https://storage/house-logos/betano-123.png');
  });

  it('sem logo gravada devolve o ícone do preset', () => {
    expect(houseLogoOrPreset(null, 'betano')).toBe('/brands/presets/betano.svg');
    expect(houseLogoOrPreset(undefined, null, 'KTO')).toBe('/brands/presets/kto.svg');
  });

  it('sem logo e sem preset devolve null (a UI cai no avatar de inicial)', () => {
    expect(houseLogoOrPreset(null, 'casa-inventada')).toBeNull();
  });
});

// Os SVGs em public/brands/presets são GERADOS a partir deste catálogo
// (scripts/gen-house-icons.mjs). Este teste é o cinto de segurança contra drift:
// mudou a cor/monograma no catálogo e esqueceu de regerar, o teste acusa.
describe('assets estáticos em public/brands/presets', () => {
  const repoRoot = resolve(__dirname, '../..');

  // Reproduz os DOIS caminhos do gerador: logo oficial embutida (quando o preset
  // declara officialIcon) e monograma autoral (quando não declara).
  const expectedSvg = (p: (typeof HOUSE_PRESETS)[number]): string => {
    if (!p.officialIcon) return buildHouseIconSvg(p);
    const png = resolve(repoRoot, `scripts/house-logos/${p.slug}.png`);
    return buildHouseLogoSvg(p, readFileSync(png).toString('base64'));
  };

  it('existe um .svg por preset, idêntico ao que o catálogo gera', () => {
    const stale: string[] = [];
    const missing: string[] = [];
    for (const p of HOUSE_PRESETS) {
      const file = resolve(repoRoot, `public${housePresetIconPath(p)}`);
      if (!existsSync(file)) { missing.push(p.slug); continue; }
      if (readFileSync(file, 'utf8').trim() !== expectedSvg(p)) stale.push(p.slug);
    }
    expect(missing, 'faltando — rode: npm run icons:casas').toEqual([]);
    expect(stale, 'desatualizado — rode: npm run icons:casas').toEqual([]);
  });

  // `officialIcon` sem a arte correspondente faria o gerador estourar. Melhor o
  // teste apontar a casa exata do que ler um stack trace do script.
  it('toda casa com officialIcon tem a logo normalizada no repo', () => {
    const semArte = HOUSE_PRESETS
      .filter((p) => p.officialIcon)
      .filter((p) => !existsSync(resolve(repoRoot, `scripts/house-logos/${p.slug}.png`)))
      .map((p) => p.slug);
    expect(semArte).toEqual([]);
  });

  it('não sobra logo de casa que deixou de usar ícone oficial', () => {
    const dir = resolve(repoRoot, 'scripts/house-logos');
    const declaradas = new Set(HOUSE_PRESETS.filter((p) => p.officialIcon).map((p) => `${p.slug}.png`));
    const orfas = readdirSync(dir).filter((f) => f.endsWith('.png') && !declaradas.has(f));
    expect(orfas).toEqual([]);
  });
});
