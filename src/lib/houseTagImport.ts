// Importação de resultado por TAG da casa (ex.: Esportiva Bet / TAP by Smartico).
//
// Diferente do template próprio (`houseResults`, que cruza por E-MAIL de login), o
// relatório da CASA não conhece e-mail nenhum: ele agrupa pela tag de rastreio que
// viaja no link (`?afp=infinitw02`). Este módulo faz duas coisas, ambas PURAS:
//
//   1. ADAPTA o export da casa para o cabeçalho canônico do nosso parser;
//   2. resolve tag -> afiliado, e RESUME o que sobrou sem dono para a tela de
//      vínculo (o admin liga a tag a um afiliado uma vez; vira apelido salvo).
//
// ⚠️ O PORQUÊ DO ADAPTADOR (e não de um alias de coluna): no export da Esportiva a
// coluna "CPA" é DINHEIRO (`R$ 2.760,00`), enquanto o nosso `qualified_cpa` é
// CONTAGEM — quem conta é `QFTDS`. Um alias genérico `cpa -> qualified_cpa` leria
// 2760 como "2760 CPAs qualificados" e multiplicaria o repasse por ~120. O mapa
// aqui é explícito e testado justamente para essa classe de erro não passar.

import {
  emptyMetrics,
  addMetrics,
  cleanToken,
  type Metrics,
  type ResolvedRow,
  type ResolveResult,
  type AffiliateLookup,
} from './houseResults';
import { extractTagFromUrl } from './linkTriage';

// --- Normalização da tag -----------------------------------------------------

// Tags são digitadas à mão no painel da casa: `infinitw02`, `INFINITW02`,
// ` infinitw02 ` são a mesma coisa. Case e espaço não distinguem ninguém.
//
// Passa pelo `cleanToken` de `houseResults` (mesma tabela de "sem valor" que a
// resolução usa): a Esportiva escreve `—` na linha sem tag, e sem isso o resumo
// exibiria um traço como se fosse uma tag pendente vinculável a alguém.
export function normalizeTag(raw: unknown): string {
  return cleanToken(raw).toLowerCase();
}

// --- Adaptador do export da casa --------------------------------------------

const stripHeader = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

// Cabeçalho do export -> coluna canônica do nosso parser. O que não estiver aqui é
// descartado de propósito: coluna nova da casa não pode virar métrica por acidente.
const ESPORTIVA_MAP: Record<string, string> = {
  periodo: 'data',
  afp: 'tag',
  registros: 'cadastros',
  ftds: 'ftd',
  qftds: 'cpa', // CONTAGEM de CPAs qualificados
  revshare: 'rev',
  depositovalorr: 'deposito', // "Depósito Valor (R$)"
  comissaototal: 'comissao', // CPA (R$) + RevShare — a comissão BRUTA da agência
};

// Assinatura mínima para aceitar o arquivo como relatório por tag da casa. Sem ela
// o admin subiria a planilha errada e a importação leria colunas trocadas.
const REQUIRED_HEADERS = ['periodo', 'afp', 'qftds'];

export interface AdaptResult {
  grid: string[][]; // pronto para `parseResultsCsv`/`parseResultsRows`
  ok: boolean;
  // O arquivo É o relatório da casa (tem a coluna AFP), mesmo quando `ok` é false
  // por faltar coluna. A tela usa isto para não cair calada no parser genérico: lá
  // `afp` também é apelido de tag, mas `cpa` viraria CONTAGEM — o bug de dinheiro
  // que este adaptador existe para impedir. Detectado ⇒ mostra o erro e não importa.
  detected: boolean;
  error?: string;
  mapped: string[]; // colunas reconhecidas (para a UI mostrar o que entrou)
  ignored: string[]; // colunas descartadas
}

/**
 * Converte a matriz do export da casa em uma matriz com o cabeçalho canônico,
 * mantendo só as colunas mapeadas. Não interpreta número nenhum — o
 * `parsePtNumber` do parser continua sendo a única aritmética.
 */
export function adaptHouseTagReport(grid: string[][]): AdaptResult {
  const rows = Array.isArray(grid) ? grid : [];
  const headerIdx = rows.findIndex((cells) => (cells ?? []).some((c) => String(c ?? '').trim() !== ''));
  if (headerIdx === -1) {
    return { grid: [], ok: false, detected: false, error: 'Arquivo vazio.', mapped: [], ignored: [] };
  }

  const header = (rows[headerIdx] ?? []).map((c) => stripHeader(String(c ?? '')));
  const detected = header.includes('afp');
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) {
    return {
      grid: [],
      ok: false,
      detected,
      error:
        'Este arquivo não parece o relatório da casa agrupado por tag. ' +
        'Exporte o Relatório de Mídia agrupando por Dia + AFP.',
      mapped: [],
      ignored: [],
    };
  }

  // índice da coluna de origem -> nome canônico de destino
  const picks: { from: number; to: string }[] = [];
  const ignored: string[] = [];
  header.forEach((h, idx) => {
    const to = ESPORTIVA_MAP[h];
    // primeira ocorrência vence (mesmo critério do parser para apelidos repetidos)
    if (to && !picks.some((p) => p.to === to)) picks.push({ from: idx, to });
    else ignored.push(String((rows[headerIdx] ?? [])[idx] ?? ''));
  });

  const out: string[][] = [picks.map((p) => p.to)];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    if (!cells.some((c) => String(c ?? '').trim() !== '')) continue;
    out.push(picks.map((p) => String(cells[p.from] ?? '')));
  }

  return { grid: out, ok: true, detected: true, mapped: picks.map((p) => p.to), ignored };
}

// --- Índice tag -> afiliado --------------------------------------------------

export interface TagSourceLink {
  affiliateId?: string | null;
  registerUrl?: string | null;
  // Tag EXPLÍCITA do doc (o import de standby aceita "Coluna A: Link, Coluna B: Tag",
  // e nesse caso a URL pode não trazer `?afp=`). Vence a extraída da URL — é a mesma
  // precedência do `parseStandbyLinks`.
  tag?: string | null;
  brandId?: string | null;
}

// Vínculo explícito feito pelo admin na tela (persistido). Vence o link, porque é
// a correção humana de um casamento que o link não cobria.
export interface TagAlias {
  tag: string;
  affiliateId: string;
  brandKey?: string | null;
}

export type TagOrigin = 'alias' | 'link';

export interface TagIndexEntry {
  affiliateId: string;
  origin: TagOrigin;
}

/**
 * Constrói o mapa tag -> afiliado a partir dos links já emitidos
 * (`affiliate_links`, cuja `registerUrl` carrega `?afp=`) mais os apelidos salvos.
 * O apelido SOBREPÕE o link: é a decisão explícita do admin.
 */
export function buildTagIndex(
  links: TagSourceLink[] | null | undefined,
  aliases: TagAlias[] | null | undefined,
): Map<string, TagIndexEntry> {
  const index = new Map<string, TagIndexEntry>();
  for (const link of Array.isArray(links) ? links : []) {
    const affiliateId = String(link?.affiliateId ?? '').trim();
    if (!affiliateId) continue; // link do pool (standby) não atribui nada
    const tag = normalizeTag(link?.tag) || normalizeTag(extractTagFromUrl(String(link?.registerUrl ?? '')));
    if (!tag || index.has(tag)) continue;
    index.set(tag, { affiliateId, origin: 'link' });
  }
  for (const alias of Array.isArray(aliases) ? aliases : []) {
    const tag = normalizeTag(alias?.tag);
    const affiliateId = String(alias?.affiliateId ?? '').trim();
    if (!tag || !affiliateId) continue;
    index.set(tag, { affiliateId, origin: 'alias' }); // vence o link
  }
  return index;
}

/** Lookup no formato que `resolveAffiliates` espera, alimentado pelo índice. */
export function tagLookup(
  index: Map<string, TagIndexEntry>,
  labelOf?: (affiliateId: string) => string | undefined,
): AffiliateLookup {
  return (token: string) => {
    const hit = index.get(normalizeTag(token));
    if (!hit) return null;
    return { id: hit.affiliateId, label: labelOf?.(hit.affiliateId) };
  };
}

// --- Resumo por tag (o que a tela de vínculo mostra) -------------------------

export interface TagSummary extends Metrics {
  tag: string;
  days: number; // em quantos dias a tag apareceu
  affiliateId: string | null; // null = ainda sem dono
  origin: TagOrigin | null;
}

interface SummarySourceRow extends Partial<Metrics> {
  tag?: string;
  date?: string;
}

/**
 * Agrupa as linhas do relatório por tag e anexa o dono, quando já houver.
 *
 * Ordena por **dinheiro em jogo** (comissão, depois CPAs) entre as NÃO resolvidas,
 * que vêm primeiro: numa lista de dezenas de tags, o admin tem que ver antes a que
 * carrega R$ 2.760 e não a que teve uma visita. Linha sem tag é agrupada sob '' e
 * devolvida junto — a tela precisa mostrar quanto ficou sem dono.
 */
export function summarizeByTag(
  rows: SummarySourceRow[] | null | undefined,
  index: Map<string, TagIndexEntry>,
): TagSummary[] {
  const acc = new Map<string, { metrics: Metrics; dates: Set<string> }>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const tag = normalizeTag(row?.tag);
    const cur = acc.get(tag) ?? { metrics: emptyMetrics(), dates: new Set<string>() };
    addMetrics(cur.metrics, row ?? {});
    if (row?.date) cur.dates.add(String(row.date));
    acc.set(tag, cur);
  }

  const out: TagSummary[] = [];
  for (const [tag, { metrics, dates }] of acc) {
    const hit = tag ? index.get(tag) : undefined;
    out.push({
      tag,
      days: dates.size,
      affiliateId: hit?.affiliateId ?? null,
      origin: hit?.origin ?? null,
      ...metrics,
    });
  }

  return out.sort((a, b) => {
    // sem dono primeiro; a linha sem tag por último (não é vinculável a ninguém)
    const rank = (s: TagSummary) => (!s.tag ? 2 : s.affiliateId ? 1 : 0);
    return (
      rank(a) - rank(b) ||
      b.total_commission - a.total_commission ||
      b.qualified_cpa - a.qualified_cpa ||
      a.tag.localeCompare(b.tag)
    );
  });
}

// --- Totais de conferência ---------------------------------------------------

export interface TagImportTotals {
  attributed: Metrics; // vai virar linha por afiliado
  unattributed: Metrics; // tag sem dono + linhas sem tag: NÃO é gravado
  pendingTags: number; // quantas tags aguardam vínculo
}

/**
 * Fecha a conta antes de gravar. O invariante da tela é
 * `attributed + unattributed == total do arquivo` — é ele que prova ao admin que
 * nada evaporou entre o relatório da casa e o que entrou no painel.
 */
export function tagImportTotals(summaries: TagSummary[] | null | undefined): TagImportTotals {
  const attributed = emptyMetrics();
  const unattributed = emptyMetrics();
  let pendingTags = 0;
  for (const s of Array.isArray(summaries) ? summaries : []) {
    if (s.affiliateId) addMetrics(attributed, s);
    else {
      addMetrics(unattributed, s);
      if (s.tag) pendingTags++;
    }
  }
  return { attributed, unattributed, pendingTags };
}

// --- Linhas prontas para gravar ---------------------------------------------

/**
 * Só as linhas COM dono viram resultado gravado.
 *
 * ⚠️ Linha sem dono NÃO vira `affiliateId: null`. No modelo, a linha nula é o
 * *agregado do dia* e, quando existe, `dailyAggregate` DESCARTA as atribuídas do
 * mesmo casa|dia (anti-double-count). Gravar o resíduo sem tag como agregado
 * apagaria do total da casa justamente o que foi atribuído. O resíduo aparece na
 * tela como "sem vínculo" e fica de fora até alguém dar dono a ele.
 */
export function attributedRows(resolved: ResolvedRow[] | null | undefined): ResolvedRow[] {
  return (Array.isArray(resolved) ? resolved : []).filter((r) => !!r.affiliateId);
}

/**
 * Gatilho do botão "Importar" no modo TAG.
 *
 * Diferente do `canImport` do template próprio, tag pendente **não bloqueia**: no
 * relatório da casa é normal chegar tag sem dono conhecido (o admin ainda vai
 * perguntar de quem é), e travar tudo por causa dela deixaria de fora o que já está
 * atribuído. O que entra é só `attributedRows`; o resíduo fica visível na tela com o
 * total, e entra quando alguém der dono a ele. Erro de FORMATO segue bloqueando.
 */
export function canImportTagReport(
  analysis: ResolveResult | null,
  parseErrors: ReadonlyArray<unknown>,
): boolean {
  return !!analysis && parseErrors.length === 0 && attributedRows(analysis.rows).length > 0;
}
