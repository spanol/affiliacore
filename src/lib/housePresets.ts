// Presets de casas de aposta (ícone + identidade) para o backoffice /casas.
//
// PROBLEMA: criar uma casa em /casas exigia ter a logo em disco pra subir. Sem
// logo, a UI cai no avatar de inicial pintado com o accent DA INSTÂNCIA — ou seja,
// todas as casas ficam da mesma cor e a lista deixa de ser escaneável.
//
// SOLUÇÃO: um catálogo ESTÁTICO E VERSIONADO (mesmo padrão de `DEFAULT_BRANDS` em
// brand.ts e a arquitetura recomendada em PESQUISA-PRESETS-DEALS §4.1) com as casas
// mais conhecidas e AUTORIZADAS pelo SPA/MF, cada uma com um ícone SVG gerado aqui
// na cor de marca da casa. É dado de PRODUTO (vale pra toda instância), não dado de
// tenant — por isso vive no repo, não numa coleção Firestore.
//
// ATENÇÃO — o ícone gerado NÃO é a logo oficial da casa. É uma marca-d'água autoral
// (monograma sobre a cor da casa), justamente pra não versionar marca registrada de
// terceiro no repo. O campo `officialLogoUrl` aponta pra logo oficial de cada casa;
// quem quiser a logo real baixa de lá e sobe pelo upload que já existe no modal.
//
// PROVENIÊNCIA (igual ao `source`/`asOf` dos presets de acordo): as cores NÃO foram
// escolhidas a olho — foram MEDIDAS na fonte oficial de cada casa em 2026-07-28
// (logo/favicon decodificado pixel a pixel, ou o `theme-color` declarado pelo próprio
// site .bet.br). O campo `colorSource` diz de onde veio cada uma. Ver
// PESQUISA-PRESETS-CASAS.md para a tabela completa e o método.

// De onde a cor de marca foi medida — proveniência, não enfeite.
export type ColorSource =
  | 'logo-oficial'   // pixel dominante da logo/favicon oficial decodificada
  | 'theme-color'    // <meta name="theme-color"> ou manifest do site oficial
  | 'css-oficial';   // cor mais frequente no CSS/HTML servido pelo site oficial

export interface HousePreset {
  slug: string;              // id do preset = slug sugerido da casa
  name: string;              // nome canônico da casa
  monogram: string;          // 1–3 caracteres desenhados no ícone
  color: string;             // cor de FUNDO do ícone (cor de marca medida)
  accent?: string;           // cor do monograma; ausente = contraste automático
  colorSource: ColorSource;  // como `color` foi obtida
  site: string;              // domínio .bet.br oficial
  officialLogoUrl?: string;  // logo oficial verificada (pra trocar o ícone autoral)
  // Licença SPA/MF (Lei 14.790/2023). `legalEntity` é a empresa autorizada — várias
  // marcas podem dividir a mesma autorização (ex.: BR4BET e Lotogreen, ambas Sabiá).
  legalEntity: string;
  spaPortaria: string;
  // Grafias alternativas que a MESMA casa recebe no cadastro de cada agência. Só
  // para variações que a normalização NÃO resolve sozinha: "Super Bet" já casa com
  // "Superbet" (o separador some), mas "Super Bet V2" não — é nome de instância do
  // painel legado da Infinity, não uma casa diferente.
  aliases?: string[];
  // Como o ícone da casa é montado:
  //   ausente  → monograma autoral sobre a cor da marca (buildHouseIconSvg)
  //   'tile'   → logo oficial que JÁ vem com fundo próprio: preenche a moldura
  //   'inset'  → logo oficial TRANSPARENTE: entra com respiro sobre a cor da marca
  // Só recebe logo oficial quem passou nos 3 critérios objetivos de qualidade
  // (≥64px, proporção ≤2:1, decodificável) — ver PESQUISA-PRESETS-CASAS.md §4.1.
  officialIcon?: 'tile' | 'inset';
  // Fundo sob uma logo 'inset'. Ausente = a cor da marca. Existe porque algumas
  // logos transparentes são ESCURAS e desaparecem sobre a própria cor da casa —
  // a Novibet mede 1.26:1 contra o navy dela. Mesma regra do monograma: escolhe-se
  // o fundo que dá mais contraste, medido, não no olho.
  insetBackdrop?: string;
}

// Contraste relativo (WCAG) — decide monograma claro ou escuro quando a casa não
// declara um par de cores próprio.
const luminance = (hex: string): number => {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};

// Razão de contraste entre duas cores (1 = idênticas, 21 = preto vs branco).
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Cor do monograma: a `accent` da casa quando ela tem um par próprio; senão o
// branco/quase-preto que der MAIS contraste sobre o fundo.
//
// Escolhemos MEDINDO os dois contrastes em vez de comparar a luminância contra um
// limiar fixo: laranjas fortes (Betsson #ff6600) caem logo abaixo do limiar, ganham
// monograma branco e ficam em 2.9:1 — reprovado no piso de 3:1. Medir os dois e
// pegar o melhor acerta sozinho pra qualquer casa nova.
export function monogramColor(preset: HousePreset): string {
  if (preset.accent) return preset.accent;
  const dark = '#0b0f14';
  return contrastRatio('#ffffff', preset.color) >= contrastRatio(dark, preset.color)
    ? '#ffffff'
    : dark;
}

// Catálogo. Ordenado por notoriedade no BR (patrocínio de clube da Série A 2026 +
// presença nas docs do projeto), não alfabeticamente — a grade do seletor mostra as
// mais prováveis primeiro.
export const HOUSE_PRESETS: HousePreset[] = [
  { slug: 'betano', name: 'Betano', monogram: 'B', officialIcon: 'tile', color: '#ff3c00', colorSource: 'logo-oficial',
    site: 'betano.bet.br', officialLogoUrl: 'https://www.betano.bet.br/assets/static/favicons/betano/apple-icon-180x180.png',
    legalEntity: 'Kaizen Gaming Brasil LTDA', spaPortaria: 'SPA/MF nº 246, de 07/02/2025' },
  { slug: 'superbet', name: 'Superbet', monogram: 'S', officialIcon: 'tile', color: '#fd0104', colorSource: 'logo-oficial',
    site: 'superbet.bet.br', officialLogoUrl: '/brands/superbet.png',
    legalEntity: 'SPRBT Interactive Brasil LTDA', spaPortaria: 'SPA/MF nº 2.090, de 30/12/2024',
    // "Super Bet V2" é como a casa aparece no painel legado da Infinity — mesma casa,
    // instância nova. Já cairia na regra de sufixo de versão; fica explícito por ser
    // nome real em produção. ("Super Bet" sem o V2 a normalização já resolve.)
    aliases: ['Super Bet V2'] },
  { slug: 'sportingbet', name: 'Sportingbet', monogram: 'sb', officialIcon: 'tile', color: '#003dc4', colorSource: 'logo-oficial',
    site: 'sportingbet.bet.br', officialLogoUrl: '/brands/sportingbet.png',
    legalEntity: 'Ventmear Brasil S.A.', spaPortaria: 'SPA/MF nº 247, de 07/02/2025' },
  { slug: 'bet365', name: 'bet365', monogram: '365', color: '#126e51', accent: '#ffdf1b', colorSource: 'logo-oficial',
    site: 'bet365.bet.br', officialLogoUrl: 'https://bet365.bet.br/sportsbook-static/favicons/favicon-167x167.png',
    legalEntity: 'HS do Brasil LTDA', spaPortaria: 'SPA/MF nº 250, de 07/02/2025' },
  { slug: 'betfair', name: 'Betfair', monogram: 'bf', color: '#ffb80c', accent: '#1e1e1e', colorSource: 'css-oficial',
    site: 'betfair.bet.br', officialLogoUrl: 'https://betfair.bet.br/favicon.ico',
    legalEntity: 'NSX Betfair Brasil S.A.', spaPortaria: 'SPA/MF nº 2.291, de 09/10/2025' },
  { slug: 'betnacional', name: 'Betnacional', monogram: 'BN', officialIcon: 'tile', color: '#131e32', accent: '#ebbd54', colorSource: 'logo-oficial',
    site: 'betnacional.bet.br', officialLogoUrl: 'https://betnacional.bet.br/assets/skins/betnacional/favicon/apple-icon-180x180.png',
    legalEntity: 'NSX Brasil S.A.', spaPortaria: 'SPA/MF nº 1.814, de 15/08/2025' },
  { slug: 'kto', name: 'KTO', monogram: 'KTO', officialIcon: 'tile', color: '#da0000', colorSource: 'logo-oficial',
    site: 'kto.bet.br', officialLogoUrl: 'https://static.kto.bet.br/lo/2026/07/06220509/kto-favicon-2-300x300.png',
    legalEntity: 'Apollo Operations LTDA', spaPortaria: 'SPA/MF nº 2.093, de 30/12/2024' },
  { slug: 'esportes-da-sorte', name: 'Esportes da Sorte', monogram: 'EdS', color: '#38e67d', accent: '#08301a', colorSource: 'logo-oficial',
    site: 'esportesdasorte.bet.br', officialLogoUrl: 'https://esportesdasorte.bet.br/logo.png', // wordmark, não é quadrado

    legalEntity: 'Esportes Gaming Brasil LTDA', spaPortaria: 'SPA/MF nº 1.559, de 18/07/2025' },
  { slug: 'estrelabet', name: 'EstrelaBet', monogram: 'EB', color: '#ffd700', accent: '#1a1400', colorSource: 'css-oficial',
    site: 'estrelabet.bet.br',
    legalEntity: 'EB Intermediacoes e Jogos S.A.', spaPortaria: 'SPA/MF nº 1.762, de 13/08/2025' },
  { slug: 'brazino777', name: 'Brazino777', monogram: '777', officialIcon: 'tile', color: '#035d03', colorSource: 'logo-oficial',
    site: 'brazino777.bet.br', officialLogoUrl: 'https://www.brazino-cdnsrv-cst.org/build/images/favicons/apple-touch-icon-152x152.png',
    legalEntity: 'Futuras Apostas LTDA', spaPortaria: 'SPA/MF nº 466, de 10/03/2025' },
  { slug: 'stake', name: 'Stake', monogram: 'St', officialIcon: 'tile', color: '#1a2c38', accent: '#4bc4ff', colorSource: 'theme-color',
    site: 'stake.bet.br', officialLogoUrl: 'https://stake.bet.br/favicon.ico',
    legalEntity: 'Stake Brazil LTDA', spaPortaria: 'SPA/MF nº 263, de 07/02/2025' },
  { slug: 'bet7k', name: 'Bet7k', monogram: '7K', officialIcon: 'tile', color: '#a1cd3d', accent: '#16182a', colorSource: 'css-oficial',
    site: '7k.bet.br', officialLogoUrl: 'https://7k.bet.br/pwa/apple-touch-icon-180x180.png',
    legalEntity: 'Ana Gaming Brasil S.A.', spaPortaria: 'SPA/MF nº 1.056, de 14/05/2025',
    aliases: ['7k'] }, // o domínio e a camisa do Vitória usam só "7k"
  { slug: '7games', name: '7Games', monogram: '7G', officialIcon: 'tile', color: '#1b1b1b', accent: '#f5d76e', colorSource: 'css-oficial',
    site: '7games.bet.br', officialLogoUrl: 'https://7games.bet.br/apple-touch-icon.png',
    legalEntity: 'OIG Gaming Brazil LTDA', spaPortaria: 'SPA/MF nº 2.096, de 30/12/2024' },
  { slug: 'vbet', name: 'Vbet', monogram: 'V', color: '#d80d83', colorSource: 'logo-oficial',
    site: 'vbet.bet.br', officialLogoUrl: 'https://vbet.bet.br/favicon.ico',
    legalEntity: 'SC Operating Brazil LTDA', spaPortaria: 'SPA/MF nº 254, de 07/02/2025' },
  { slug: 'h2bet', name: 'H2bet', monogram: 'H2', color: '#77148e', accent: '#24cfa4', colorSource: 'css-oficial',
    site: 'h2.bet.br',
    legalEntity: 'H2 Licensed LTDA', spaPortaria: 'SPA/MF nº 253, de 07/02/2025' },
  { slug: 'vivasorte', name: 'Viva Sorte', monogram: 'VS', officialIcon: 'tile', color: '#ff7912', accent: '#1a243d', colorSource: 'css-oficial',
    site: 'vivasorte.bet.br', officialLogoUrl: 'https://cn.vivasorte.bet.br/assets/icons/apple-touch-icon.png',
    legalEntity: 'Jogo Principal LTDA', spaPortaria: 'SPA/MF nº 262, de 18/02/2025',
    aliases: ['Viva Sorte Bet'] }, // grafia usada no patrocínio do Athletico
  // Logo escura: 1.26:1 contra o navy da marca, 14.7:1 contra o branco (medido).
  { slug: 'novibet', name: 'Novibet', monogram: 'N', officialIcon: 'inset', insetBackdrop: '#ffffff', color: '#0a1324', accent: '#29a8ac', colorSource: 'theme-color',
    site: 'novibet.bet.br', officialLogoUrl: 'https://novibet.bet.br/assets/images/logos/apple-touch-icon-180x180.png',
    legalEntity: 'NVBT Gaming LTDA', spaPortaria: 'SPA/MF nº 249, de 07/02/2025' },
  { slug: 'pixbet', name: 'Pixbet', monogram: 'px', officialIcon: 'tile', color: '#ccff00', accent: '#12200a', colorSource: 'theme-color',
    site: 'pixbet.bet.br', officialLogoUrl: 'https://pixbet.bet.br/assets/brands/pixbet/favicons/apple-touch-icon.png',
    legalEntity: 'Pixbet Soluções Tecnológicas LTDA', spaPortaria: 'SPA/MF nº 2.326, de 14/10/2025' },
  { slug: 'blaze', name: 'Blaze', monogram: 'BZ', color: '#131521', accent: '#e60026', colorSource: 'theme-color',
    site: 'blaze.bet.br', officialLogoUrl: 'https://blaze.bet.br/apple-touch-icon.png',
    legalEntity: 'Foggo Entertainment LTDA', spaPortaria: 'SPA/MF nº 471, de 10/03/2025' },
  { slug: 'betsson', name: 'Betsson', monogram: 'bs', color: '#ff6600', colorSource: 'theme-color',
    site: 'betsson.bet.br',
    legalEntity: 'Simulcasting Brasil Som e Imagem S.A.', spaPortaria: 'SPA/MF nº 371, de 24/02/2025' },
  { slug: 'f12bet', name: 'F12.Bet', monogram: 'F12', color: '#58cc02', accent: '#0d1117', colorSource: 'theme-color',
    site: 'f12.bet.br',
    legalEntity: 'F12 do Brasil Jogos Eletrônicos LTDA', spaPortaria: 'SPA/MF nº 1.423, de 30/06/2025' },
  { slug: 'aposta-ganha', name: 'Aposta Ganha', monogram: 'AG', color: '#ff3d00', colorSource: 'css-oficial',
    site: 'apostaganha.bet.br', officialLogoUrl: 'https://apostaganha.bet.br/assets/favicon.png',
    legalEntity: 'Aposta Ganha Loterias LTDA', spaPortaria: 'SPA/MF nº 807, de 23/03/2026' },
  { slug: 'br4bet', name: 'BR4BET', monogram: 'BR4', color: '#12b530', accent: '#04240c', colorSource: 'theme-color',
    site: 'br4.bet.br',
    legalEntity: 'Sabiá Administração LTDA', spaPortaria: 'SPA/MF nº 399, de 24/02/2025' },
  // SEM logo oficial de propósito: o único asset disponível é uma arte FOTOGRÁFICA
  // (leão), que vira borrão a 36px — e mede 2.98:1 contra o preto da marca, abaixo
  // do piso de 3:1. O monograma dourado sobre preto é a identidade dela e é nítido.
  { slug: 'betmgm', name: 'BetMGM', monogram: 'MGM', color: '#0b0b0b', accent: '#b19661', colorSource: 'logo-oficial',
    site: 'betmgm.bet.br', officialLogoUrl: 'https://betmgm.bet.br/apple-touch-icon.png',
    legalEntity: 'Boa Lion S.A.', spaPortaria: 'SPA/MF nº 2.098, de 30/12/2024' },
  { slug: 'lotogreen', name: 'Lotogreen', monogram: 'LG', color: '#1dbf24', accent: '#04240c', colorSource: 'theme-color',
    site: 'lotogreen.bet.br', officialLogoUrl: 'https://cometa-s3-images-loto-public.s3.ca-central-1.amazonaws.com/settings/logo.png',
    legalEntity: 'Sabiá Administração LTDA', spaPortaria: 'SPA/MF nº 399, de 24/02/2025' },
  { slug: 'mcgames', name: 'MC Games', monogram: 'MC', officialIcon: 'tile', color: '#171d25', accent: '#f4b942', colorSource: 'theme-color',
    site: 'mcgames.bet.br',
    legalEntity: 'Sistema Lotérico de Pernambuco LTDA', spaPortaria: 'SPA/MF nº 2.007, de 09/09/2025' },
  // Casa real da Infinity (MIGRACAO-INFINITY-LEGADO.md). Ficou de fora da coleta de
  // 28/07 (o favicon vinha corrompido na origem e o theme-color é cor de chrome);
  // em 13/08 o site passou a servir um maskable-icon 512px — cor medida NELE, e a
  // licença conferida na planilha oficial do SPA/MF (a autorizada é a mesma empresa
  // da Bateu Bet, portaria compartilhada — igual ao caso BR4BET/Lotogreen).
  { slug: 'esportiva-bet', name: 'Esportiva Bet', monogram: 'EB', officialIcon: 'tile', color: '#ff3a00', colorSource: 'logo-oficial',
    site: 'esportiva.bet.br', officialLogoUrl: 'https://static.esportiva.bet.br/public-assets/maskable-icon-512x512.png',
    legalEntity: 'EA Entretenimento e Esportes S.A.', spaPortaria: 'SPA/MF nº 523, de 14/03/2025',
    aliases: ['Esportiva'] }, // o manifest oficial grafa "EsportivaBet", que já normaliza sozinho
];

// Busca um preset pelo slug (o mesmo slug que o modal sugere pra casa).
export function getHousePreset(slug?: string | null): HousePreset | null {
  const key = String(slug ?? '').trim().toLowerCase();
  if (!key) return null;
  return HOUSE_PRESETS.find((p) => p.slug === key) ?? null;
}

// Escapa texto pra dentro do SVG (os monogramas são ASCII, mas o nome vai no
// aria-label — e um `&` solto quebraria o XML).
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Geometria do monograma por tamanho. `textLength` fixa a largura desenhada, então
// o ícone fica IDÊNTICO em qualquer máquina mesmo com fontes diferentes — sem isso,
// um monograma de 3 letras vazaria da caixa em quem não tem a fonte da lista.
const GEOMETRY: Record<number, { size: number; length: number }> = {
  1: { size: 30, length: 19 },
  2: { size: 25, length: 32 },
  3: { size: 20, length: 42 },
};

// Pilha de fontes: o SVG é carregado em <img>, um documento ISOLADO que não enxerga
// as webfonts da página — então só valem fontes de sistema.
const FONT_STACK = "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

// Gera o SVG do ícone da casa (64×64): quadrado arredondado na cor de marca, um
// brilho sutil no topo e o monograma centralizado. Puro e determinístico — a mesma
// entrada sempre produz os mesmos bytes (é o que o gerador de assets grava em disco).
export function buildHouseIconSvg(preset: HousePreset): string {
  const mono = preset.monogram.slice(0, 3);
  const geo = GEOMETRY[mono.length] ?? GEOMETRY[3];
  const fg = monogramColor(preset);
  // id do gradiente com o slug: se a UI inlinar vários ícones no MESMO documento,
  // ids repetidos fariam todos herdarem o gradiente do primeiro.
  const gid = `hp-${preset.slug}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${esc(preset.name)}">`,
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="#ffffff" stop-opacity=".20"/>`,
    `<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>`,
    `</linearGradient></defs>`,
    `<rect width="64" height="64" rx="14" fill="${preset.color}"/>`,
    `<rect width="64" height="64" rx="14" fill="url(#${gid})"/>`,
    `<text x="32" y="33" text-anchor="middle" dominant-baseline="central"`,
    ` font-family="${FONT_STACK}" font-size="${geo.size}" font-weight="700"`,
    ` textLength="${geo.length}" lengthAdjust="spacingAndGlyphs" fill="${fg}">${esc(mono)}</text>`,
    `</svg>`,
  ].join('');
}

// Moldura para a LOGO OFICIAL da casa. Mesma caixa 64×64 e mesmo raio do ícone
// autoral — é isso que mantém a lista uniforme mesmo misturando as duas origens
// (o conjunto de logos oficiais, cru, tem proporção e respiro diferentes em cada
// casa; ver PESQUISA-PRESETS-CASAS.md §4.1).
//
// 'tile'  → a logo já traz fundo próprio (Betano, Superbet, KTO...): preenche a
//           moldura e é recortada pelo raio, sem cor por baixo.
// 'inset' → a logo é transparente (Novibet, BetMGM): ganha respiro sobre a cor de
//           marca medida, senão sumiria no tema escuro do app.
export function buildHouseLogoSvg(preset: HousePreset, pngBase64: string): string {
  const id = `hl-${preset.slug}`;
  const href = `data:image/png;base64,${pngBase64}`;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${esc(preset.name)}">`;
  if (preset.officialIcon === 'tile') {
    return [
      open,
      `<defs><clipPath id="${id}"><rect width="64" height="64" rx="14"/></clipPath></defs>`,
      `<image href="${href}" width="64" height="64" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`,
      `</svg>`,
    ].join('');
  }
  return [
    open,
    `<rect width="64" height="64" rx="14" fill="${preset.insetBackdrop ?? preset.color}"/>`,
    `<image href="${href}" x="9" y="9" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>`,
    `</svg>`,
  ].join('');
}

// base64 isomórfico (btoa no browser, Buffer no Node dos testes/gerador). Passa pelo
// TextEncoder antes: `btoa` só aceita latin1 e estouraria em qualquer caractere
// acentuado que venha a entrar num nome de casa.
const toBase64 = (s: string): string => {
  if (typeof btoa !== 'function') return Buffer.from(s, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

// Empacota um SVG no formato que `uploadHouseLogo` (server.ts) já aceita — é assim
// que o preset entra pelo MESMO caminho do upload manual, sem rota nova.
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

// Data URL do ícone AUTORAL. Atenção: para casa com `officialIcon`, o SVG real
// embute a logo oficial e NÃO é derivável do catálogo — a UI busca o asset gerado
// (housePresetIconPath) em vez de chamar isto. Aqui fica o fallback.
export function buildHouseIconDataUrl(preset: HousePreset): string {
  return svgToDataUrl(buildHouseIconSvg(preset));
}

// Caminho do SVG estático equivalente (gerado por scripts/gen-house-icons.ts).
// Serve pra prévia na grade do seletor sem inflar o bundle com 26 data URLs.
export function housePresetIconPath(preset: HousePreset): string {
  return `/brands/presets/${preset.slug}.svg`;
}

// Chave de casamento casa↔preset: minúsculo, sem acento e sem separador. Faz
// "Esportes da Sorte", "esportes-da-sorte" e "EsportesDaSorte" caírem na mesma
// chave — e é o que permite casar o NOME digitado pelo admin com o slug do preset
// ("F12.Bet" → "f12bet", "BR4BET" → "br4bet").
const matchKey = (s?: string | null): string =>
  String(s ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Todas as chaves sob as quais um preset responde: slug, nome e apelidos.
const presetKeys = (p: HousePreset): string[] =>
  [p.slug, p.name, ...(p.aliases ?? [])].map(matchKey).filter(Boolean);

// Sufixo de VERSÃO no fim do nome da casa: "v2", "V3", "2". É o padrão de painel
// legado ("Super Bet V2" na Infinity) — mesma casa, instância diferente. Restrito de
// propósito a v?<dígitos>: aceitar qualquer sobra faria "Stake" casar com "StakeBet",
// que pode ser outra casa.
const VERSION_SUFFIX = /^v?\d{1,2}$/;

// Acha o preset de uma casa por qualquer das chaves (slug, id do doc, nome).
// Duas passadas: primeiro casamento EXATO (em todas as chaves de todos os presets),
// e só depois a tolerância de sufixo de versão — assim uma casa que casa exatamente
// com um preset nunca é roubada pela regra frouxa de outro.
export function findHousePresetFor(...keys: (string | null | undefined)[]): HousePreset | null {
  const wanted = keys.map(matchKey).filter(Boolean);
  if (!wanted.length) return null;

  for (const key of wanted) {
    const exact = HOUSE_PRESETS.find((p) => presetKeys(p).includes(key));
    if (exact) return exact;
  }

  // Casa "<preset><versão>" → o preset. Entre vários prefixos possíveis vence o MAIS
  // LONGO, pra não deixar um preset de nome curto sequestrar o de nome mais completo.
  for (const key of wanted) {
    let best: { preset: HousePreset; len: number } | null = null;
    for (const p of HOUSE_PRESETS) {
      for (const pk of presetKeys(p)) {
        if (!key.startsWith(pk) || key === pk) continue;
        if (!VERSION_SUFFIX.test(key.slice(pk.length))) continue;
        if (!best || pk.length > best.len) best = { preset: p, len: pk.length };
      }
    }
    if (best) return best.preset;
  }
  return null;
}

// Logo a EXIBIR para uma casa. Precedência: a logo GRAVADA vence sempre (upload do
// admin) → senão o ícone do preset da casa conhecida → senão null (a UI cai no
// avatar de inicial, como era antes).
//
// Por que a resolução é de EXIBIÇÃO e não uma migração de dados: casas criadas antes
// dos presets têm `logo: null` gravado, e o seletor só preenche o formulário de
// criar/editar — ou seja, elas nunca ganhariam ícone sozinhas. Resolver aqui vale
// retroativamente pra toda instância, sem escrita no Firestore, sem custo de Storage
// e sem migração: no dia em que o admin subir a logo oficial, ela simplesmente vence.
export function houseLogoOrPreset(
  stored: string | null | undefined,
  ...keys: (string | null | undefined)[]
): string | null {
  if (stored) return stored;
  const preset = findHousePresetFor(...keys);
  return preset ? housePresetIconPath(preset) : null;
}
