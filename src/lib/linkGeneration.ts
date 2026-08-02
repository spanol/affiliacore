// Geração do link de divulgação a partir do template da casa.
//
// A DESCOBERTA QUE ISTO EXPLORA (medida em 2026-08-02, doc do TAP by Smartico +
// dois probes na Esportiva): a tag de rastreio é um parâmetro **dinâmico
// capturado na visita do jogador**, não um recurso pré-cadastrado na casa. O
// `af2_build_link` do TAP recebe `link_id` + `affiliate_id` (+ `source_id`) e
// **não aceita `afp` como entrada** — a tag entra pela URL, por quem monta o
// link. Os probes `teste01` (28/07) e `infinitw298` (29/07) apareceram no
// Relatório de Mídia agrupado por AFP sem nunca terem sido emitidos no painel.
//
// Consequência prática: para dar link novo a um afiliado NÃO é preciso esperar
// a casa liberar a API nem cunhar tag no painel dela — basta o template de
// cadastro (`houses.registerUrlTemplate`) + uma tag nossa. Quando a API abrir,
// o que muda é a ORIGEM do template (`af2_link_op`) e a chegada automática do
// resultado (`af2_media_report_op?group_by=afp`), não este módulo.
//
// ⚠️ Provado até aqui: tag inédita é CAPTURADA (visita). Que ela credite FTD/CPA
// segue o mesmo caminho das tags `infinitw###` em produção, mas só fecha de vez
// com o primeiro FTD real numa tag gerada aqui.
//
// Núcleo PURO (sem Firebase): compartilhado entre a página do admin e a rota
// /api/affiliate-links/generate (o servidor só pode importar de src/lib).

import { TAG_PARAMS } from './linkTriage';

// Parâmetro de rastreio padrão. `afp` é o do Income Access/TAP, que é o que as
// casas BR do repo usam; Affilka (`btag`) e genéricos (`subid`) entram pelo
// argumento — a UI oferece a escolha já resolvida pelo template.
export const DEFAULT_TAG_PARAM = 'afp';

// Placeholders aceitos no template cadastrado em /casas. O `{ref}` é o que a
// própria tela de casas documenta ("URL base de cadastro com {ref}").
const PLACEHOLDER = /\{\s*(ref|tag|afp|subid)\s*\}/gi;

const MAX_TAG_LENGTH = 24;

/**
 * Reduz um texto livre (nome do afiliado, prefixo da agência) ao alfabeto que
 * sobrevive intacto numa query string e num relatório da casa: [a-z0-9]. Acento
 * é dobrado antes de cair fora — "Maurício" vira `mauricio`, não `maurcio`.
 */
export function slugifyTag(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export interface TagSeed {
  name?: string | null;
  email?: string | null;
  affiliateId?: string | null;
}

/**
 * Tag sugerida para um afiliado, estável e legível no relatório da casa (é ela
 * que o admin vai reconhecer na coluna AFP). Nome primeiro, e-mail depois; sem
 * nenhum dos dois, cai num sufixo do id — nunca devolve vazio, senão o link
 * sairia sem tag e o resultado voltaria pro balde agregado da casa.
 *
 * `taken` é o conjunto de tags JÁ em uso (links + apelidos). Colisão ganha
 * sufixo numérico em vez de erro: duas pessoas com o mesmo primeiro nome é o
 * caso comum, não a exceção.
 */
export function suggestTag(seed: TagSeed, taken?: Iterable<string> | null, prefix?: string | null): string {
  const used = new Set<string>();
  for (const t of taken ?? []) {
    const norm = slugifyTag(t);
    if (norm) used.add(norm);
  }

  const pre = slugifyTag(prefix);
  const fromName = slugifyTag(seed?.name);
  const fromEmail = slugifyTag(String(seed?.email ?? '').split('@')[0]);
  const fromId = slugifyTag(seed?.affiliateId).slice(-6);
  const body = fromName || fromEmail || (fromId ? `aff${fromId}` : '') || 'afiliado';

  // O prefixo é da agência (ex.: `infinitw`) e não pode ser comido pelo corte —
  // corta-se o corpo, que é a parte descartável.
  const room = Math.max(4, MAX_TAG_LENGTH - pre.length - 2); // -2: espaço pro sufixo
  const base = `${pre}${body.slice(0, room)}`;

  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}${Date.now().toString(36).slice(-4)}`;
}

/**
 * Injeta a tag no template de cadastro da casa. Três caminhos, nesta ordem:
 *
 *   1. template com placeholder (`{ref}`, `{tag}`, `{afp}`, `{subid}`) → substitui;
 *   2. template que já traz um parâmetro de rastreio conhecido → TROCA o valor
 *      (é o caso de colar um link pronto de outro afiliado: manter o valor
 *      antigo daria o crédito à pessoa errada);
 *   3. senão → acrescenta `?<param>=<tag>` preservando a query existente
 *      (`utm_*`, `ext_marker` e afins vivem no template da Esportiva).
 *
 * Devolve '' quando o template não é URL http(s) — quem chama recusa a linha.
 */
export function buildTaggedUrl(template: unknown, tag: unknown, param?: string | null): string {
  const raw = String(template ?? '').trim();
  const value = String(tag ?? '').trim();
  if (!raw || !value) return '';

  if (PLACEHOLDER.test(raw)) {
    PLACEHOLDER.lastIndex = 0; // regex global: `test` move o cursor
    const replaced = raw.replace(PLACEHOLDER, encodeURIComponent(value));
    return /^https?:\/\/.+/i.test(replaced) ? replaced : '';
  }

  if (!/^https?:\/\/.+/i.test(raw)) return '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }

  const existing = TAG_PARAMS.find((p) => url.searchParams.has(p));
  const chosen = existing || slugifyTag(param) || DEFAULT_TAG_PARAM;
  url.searchParams.set(chosen, value);
  return url.toString();
}

/**
 * Parâmetro que `buildTaggedUrl` usaria neste template — a UI mostra ao admin
 * qual chave a tag vai ocupar antes de ele gerar (o template da casa manda; a
 * escolha manual só vale quando o template não tem nenhum).
 */
export function tagParamForTemplate(template: unknown, fallback?: string | null): string {
  const raw = String(template ?? '').trim();
  if (PLACEHOLDER.test(raw)) {
    PLACEHOLDER.lastIndex = 0;
    return 'placeholder';
  }
  try {
    const url = new URL(raw);
    const existing = TAG_PARAMS.find((p) => url.searchParams.has(p));
    if (existing) return existing;
  } catch {
    /* template inválido: quem chama já trata pelo retorno vazio do build */
  }
  return slugifyTag(fallback) || DEFAULT_TAG_PARAM;
}
