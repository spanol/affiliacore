// Pull automático do relatório da casa (Esportiva Bet / TAP by Smartico).
//
// Substitui o export manual do painel pela API — mesma fonte, mesmo dado
// (reconciliado tag a tag em julho/2026, ver MIGRACAO-INFINITY-LEGADO.md §9.5).
//
//   GET https://boapi3.smartico.ai/api/af2_media_report_af
//        ?aggregation_period=DAY&group_by=afp&date_from=…&date_to=…
//   header: authorization: <chave>      (cru, sem "Bearer")
//
// ⚠️ O HOST importa: `api.aff.esportiva.bet` e `boapi.smartico.ai` estão atrás de
// Cloudflare / respondem "label not allowed". O `boapi3` responde limpo.
// ⚠️ A chave da instância é de AFILIADO — método `_af`. Os `_op` são negados.
//
// Núcleo PURO (sem Firebase, sem fetch): o servidor busca e passa as linhas aqui.

import { METRIC_KEYS, emptyMetrics, addMetrics, type Metrics } from './houseResults';
import { normalizeTag } from './houseTagImport';

export const ESPORTIVA_API_BASE = 'https://boapi3.smartico.ai';
export const ESPORTIVA_REPORT_METHOD = 'af2_media_report_af';

/** Linha crua da API (só os campos que consumimos; o resto é ignorado). */
export interface EsportivaApiRow {
  dt?: string;
  afp?: string | null;
  visit_count?: number;
  registration_count?: number;
  ftd_count?: number;
  deposit_total?: number;
  commissions_cpa?: number;
  commissions_rev_share?: number;
  commissions_total?: number;
}

export interface PullRow extends Metrics {
  date: string;
  tag: string; // '' = tráfego sem tag (órfão da casa)
}

export function buildMediaReportUrl(
  dateFrom: string,
  dateTo: string,
  base: string = ESPORTIVA_API_BASE,
): string {
  const url = new URL(`/api/${ESPORTIVA_REPORT_METHOD}`, base);
  url.searchParams.set('aggregation_period', 'DAY');
  url.searchParams.set('group_by', 'afp');
  url.searchParams.set('date_from', dateFrom);
  url.searchParams.set('date_to', dateTo);
  return url.toString();
}

const numOf = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface AdaptOptions {
  /** Valor do CPA praticado pela casa, em R$. Sem ele não há como contar CPAs. */
  cpaBase?: number | null;
}

export interface AdaptResult {
  rows: PullRow[];
  /** Soma dos restos da divisão comissão/base — > 0 denuncia régua de CPA mudada. */
  cpaRemainder: number;
  skipped: number; // linhas sem data utilizável
}

/**
 * Converte a resposta da API para o MESMO shape que o import por planilha produz.
 *
 * ⚠️ A ARMADILHA CENTRAL: a API **não devolve contagem de CPA** — só
 * `commissions_cpa` em REAIS. O nosso `qualified_cpa` é CONTAGEM (é ele que
 * multiplica a taxa do afiliado no repasse), então a contagem só sai dividindo
 * pela régua da casa: em julho/2026, `5.640 / 120 = 47`, o mesmo número do
 * painel. É a prima da armadilha do CSV ("CPA é dinheiro"), com uma volta a mais
 * — e ela QUEBRA se a casa mudar o valor do CPA no meio do período, por isso o
 * resto da divisão é devolvido em `cpaRemainder` em vez de sumir no arredondamento.
 *
 * Sem `cpaBase` a contagem fica em 0 (ausência ≠ zero inventado): o dinheiro
 * continua correto em `total_commission`, e o repasse por CPA não é fabricado a
 * partir de um divisor chutado.
 */
export function adaptEsportivaRows(
  apiRows: EsportivaApiRow[] | null | undefined,
  options: AdaptOptions = {},
): AdaptResult {
  const base = numOf(options.cpaBase);
  const rows: PullRow[] = [];
  let cpaRemainder = 0;
  let skipped = 0;

  for (const r of Array.isArray(apiRows) ? apiRows : []) {
    const date = String(r?.dt ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped++;
      continue;
    }
    const cpaMoney = numOf(r?.commissions_cpa);
    let qualified = 0;
    if (base > 0) {
      qualified = Math.round(cpaMoney / base);
      cpaRemainder += Math.abs(cpaMoney - qualified * base);
    }
    rows.push({
      date,
      tag: normalizeTag(r?.afp),
      registrations: numOf(r?.registration_count),
      first_deposits: numOf(r?.ftd_count),
      qualified_cpa: qualified,
      rvs: numOf(r?.commissions_rev_share),
      deposit: numOf(r?.deposit_total),
      total_commission: numOf(r?.commissions_total),
    });
  }

  return { rows, cpaRemainder, skipped };
}

export interface StoredRow extends Metrics {
  date: string;
  affiliateId: string | null;
}

export interface PendingTag extends Metrics {
  tag: string;
  days: number;
}

export interface PullPayload {
  /** O que vai para `house_results`: agregados diários + linhas por afiliado. */
  rows: StoredRow[];
  dates: string[];
  attributed: number;
  pending: PendingTag[];
}

/**
 * Monta o que será gravado, resolvendo tag → afiliado pelo MESMO índice do
 * import manual (`buildTagIndex`: links emitidos + apelidos salvos).
 *
 * ⚠️ Duas decisões que sustentam o invariante "agregado == Σ dos cards":
 *
 * 1. **O agregado do dia (`affiliateId: null`) soma TODAS as linhas**, inclusive
 *    as atribuídas e o tráfego sem tag. `dailyAggregate` descarta as atribuídas
 *    do mesmo casa|dia quando existe agregado explícito, então gravar só o
 *    resíduo órfão faria o total da casa DESABAR para o que ninguém trouxe.
 * 2. **Tag sem dono não vira linha atribuída** — ela vive só dentro do agregado e
 *    é devolvida em `pending` para a tela de vínculo. Inventar um dono aqui
 *    colocaria dinheiro no extrato da pessoa errada.
 */
export function buildPullPayload(
  pullRows: PullRow[] | null | undefined,
  tagIndex: Map<string, { affiliateId: string }> | null | undefined,
): PullPayload {
  const index = tagIndex instanceof Map ? tagIndex : new Map<string, { affiliateId: string }>();
  const aggregate = new Map<string, Metrics>(); // date -> total do dia
  const byAffiliate = new Map<string, Metrics>(); // `date|affiliateId`
  const pending = new Map<string, PendingTag>();

  for (const row of Array.isArray(pullRows) ? pullRows : []) {
    const date = row?.date;
    if (!date) continue;

    addMetrics(aggregate.get(date) ?? aggregate.set(date, emptyMetrics()).get(date)!, row);

    const tag = normalizeTag(row.tag);
    if (!tag) continue; // tráfego sem tag: só entra no agregado

    const hit = index.get(tag);
    if (!hit?.affiliateId) {
      const cur = pending.get(tag) ?? { tag, days: 0, ...emptyMetrics() };
      addMetrics(cur, row);
      cur.days += 1;
      pending.set(tag, cur);
      continue;
    }
    const key = `${date}|${hit.affiliateId}`;
    addMetrics(byAffiliate.get(key) ?? byAffiliate.set(key, emptyMetrics()).get(key)!, row);
  }

  const rows: StoredRow[] = [];
  for (const [date, metrics] of aggregate) rows.push({ date, affiliateId: null, ...pick(metrics) });
  for (const [key, metrics] of byAffiliate) {
    const [date, affiliateId] = key.split('|');
    rows.push({ date, affiliateId, ...pick(metrics) });
  }

  return {
    rows,
    dates: [...aggregate.keys()].sort(),
    attributed: byAffiliate.size,
    // Pendentes por DINHEIRO: é a fila de trabalho da tela de vínculo.
    pending: [...pending.values()].sort((a, b) => b.total_commission - a.total_commission),
  };
}

// Copia só as métricas canônicas — o mesmo cuidado de `buildImportPayload`:
// campo de UI não pode vazar para o backend.
function pick(m: Metrics): Metrics {
  const out = emptyMetrics();
  for (const k of METRIC_KEYS) out[k] = m[k] ?? 0;
  return out;
}

/**
 * Janela do pull. Cobre HOJE e os `days - 1` dias anteriores: o relatório da casa
 * fecha com atraso (~1 dia) e ainda corrige o dia anterior, então reler D−1 a cada
 * rodada é o que mantém o número certo — e como o upload REESCREVE as datas
 * presentes, reler não duplica nada.
 */
export function pullWindow(today: string, days = 2): { dateFrom: string; dateTo: string } {
  const span = Math.max(1, Math.floor(days));
  const end = new Date(`${today}T12:00:00Z`);
  const start = new Date(end.getTime() - (span - 1) * 24 * 60 * 60 * 1000);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: today };
}
