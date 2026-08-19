// Marca da instância no HTML SERVIDO (não só depois que o JS roda).
//
// PROBLEMA REAL (19/08/2026): o gerente da Infinity mandou o link de convite aos
// afiliados e o card de preview do WhatsApp veio com "AffiliaCore". O index.html é
// COMPARTILHADO por todas as instâncias e traz os defaults do PRODUTO; quem troca a
// marca é o `applyBrandToDocument` (brandingClient.ts), em runtime, no boot do App.
// Só que rastreador de link (WhatsApp, Telegram, Slack, iMessage, Google) lê o HTML
// CRU e não executa JavaScript: para todos eles a página se chamava AffiliaCore.
//
// A correção carimba nome, favicon e as tags Open Graph no HTML durante o BUILD
// (plugin `transformIndexHtml` no vite.config.ts), que é quando cada instância já
// tem os seus `VITE_BRAND_*` (todo yaml de label declara availability BUILD, sem o
// que nem o bundle resolveria a marca). O runtime continua igual: este módulo só
// troca TEXTO e atributos, então `translate="no"` e os demais atributos do <title>
// sobrevivem.
//
// Puro e sem import.meta: testável e importável por qualquer lado.
import type { Brand } from './branding';

export interface BrandMeta {
  /** Descrição usada em <meta name="description"> e og:description. */
  description: string;
  /**
   * Imagem do card de preview. `null` = NENHUMA tag de imagem é emitida, de
   * propósito: as logos das instâncias são SVG e WhatsApp/Telegram não renderizam
   * SVG, então apontar para elas trocaria "sem imagem" por "imagem quebrada".
   * Declare `VITE_BRAND_OG_IMAGE_URL` com um PNG/JPG (idealmente 1200×630).
   */
  ogImageUrl: string | null;
}

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : null;
};

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Texto do card de preview. CONVENÇÃO pt-BR do produto: a marca é tratada no
 * feminino ("a {short} ..."), a mesma de `branding.ts`.
 */
export function resolveBrandMeta(
  env: Record<string, unknown> | null | undefined,
  brand: Brand,
): BrandMeta {
  const e = env ?? {};
  return {
    description:
      str(e.VITE_BRAND_DESCRIPTION) ??
      `Painel de afiliados da ${brand.shortName}. Acompanhe resultados, comissões e materiais de divulgação.`,
    ogImageUrl: str(e.VITE_BRAND_OG_IMAGE_URL),
  };
}

// Marcador do bloco que este módulo é dono. Reaplicar o transform (dev + build na
// mesma sessão, ou um plugin que rode duas vezes) tem que ser IDEMPOTENTE: sem o
// marcador o head acumularia og:title duplicado, e crawler com duas tags iguais
// escolhe a que quiser.
const BLOCK_OPEN = '<!-- brand:meta -->';
const BLOCK_CLOSE = '<!-- /brand:meta -->';
const BLOCK_RE = /[ \t]*<!-- brand:meta -->[\s\S]*?<!-- \/brand:meta -->\n?/g;

function renderMetaBlock(brand: Brand, meta: BrandMeta): string {
  const name = esc(brand.name);
  const description = esc(meta.description);
  const image = meta.ogImageUrl;
  const lines = [
    BLOCK_OPEN,
    `<meta name="description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${name}" />`,
    `<meta property="og:title" content="${name}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    // summary_large_image só com imagem; sem ela o card grande fica vazio.
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${name}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    ...(image
      ? [
          `<meta property="og:image" content="${esc(image)}" />`,
          `<meta name="twitter:image" content="${esc(image)}" />`,
        ]
      : []),
    BLOCK_CLOSE,
  ];
  return lines.map((l) => `    ${l}`).join('\n');
}

// O index.html COMENTA o próprio <title>: o comentário do lang="pt-BR" cita a tag
// para explicar a tradução automática, e comentário pode conter qualquer markup.
// Casar a regex ali dentro apagava do `<title>` do comentário até o `</title>` de
// verdade, levando o <head> junto (o `vite build` quebrou com `nested-comment`).
// Por isso toda substituição roda só FORA de comentário.
const COMMENT_RE = /<!--[\s\S]*?-->/g;

function outsideComments(html: string, fn: (chunk: string) => string): string {
  let out = '';
  let last = 0;
  for (const m of html.matchAll(COMMENT_RE)) {
    const at = m.index ?? 0;
    out += fn(html.slice(last, at)) + m[0];
    last = at + m[0].length;
  }
  return out + fn(html.slice(last));
}

/** Troca o texto do <title>, preservando os atributos da tag. */
function applyTitle(html: string, name: string): string {
  let done = false;
  return outsideComments(html, (chunk) => {
    if (done) return chunk;
    return chunk.replace(/<title\b([^>]*)>[\s\S]*?<\/title>/i, (_m, attrs: string) => {
      done = true;
      return `<title${attrs}>${esc(name)}</title>`;
    });
  });
}

/** Troca o href de todo <link rel="icon"|"shortcut icon"> pelo favicon da marca. */
function applyFavicon(html: string, faviconUrl: string): string {
  return outsideComments(html, (chunk) =>
    chunk.replace(/<link\b[^>]*>/gi, (tag) => {
      if (!/\brel\s*=\s*["']?(?:shortcut\s+)?icon["']?/i.test(tag)) return tag;
      if (!/\bhref\s*=\s*"/i.test(tag)) return tag;
      return tag.replace(/(\bhref\s*=\s*")[^"]*(")/i, `$1${esc(faviconUrl)}$2`);
    }),
  );
}

/**
 * Carimba a marca da instância no index.html: título, favicon e o bloco de tags
 * sociais. Idempotente.
 */
export function applyBrandToHtml(html: string, brand: Brand, meta: BrandMeta): string {
  let out = html.replace(BLOCK_RE, '');

  out = applyTitle(out, brand.name);
  out = applyFavicon(out, brand.faviconUrl);

  const block = renderMetaBlock(brand, meta);
  let inserted = false;
  out = outsideComments(out, (chunk) => {
    if (inserted) return chunk;
    return chunk.replace(/([ \t]*)<\/head>/i, (_m, indent: string) => {
      inserted = true;
      return `${block}\n${indent}</head>`;
    });
  });
  if (!inserted) {
    // HTML sem <head> não deveria existir aqui, mas perder a marca em silêncio é
    // pior do que uma tag no fim do documento.
    out = `${out}\n${block}`;
  }
  return out;
}
