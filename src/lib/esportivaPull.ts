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
//
// O motor de agregação/atribuição por tag (PullRow, buildPullPayload,
// pullWindow) mora em `housePull.ts` — é genérico, não específico da
// Esportiva (extraído em 08/2026 quando a LEON Bet ganhou seu próprio
// conector e passou a precisar do mesmo motor).

import { normalizeTag } from './houseTagImport';
import type { PullRow } from './housePull';

export const ESPORTIVA_API_BASE = 'https://boapi3.smartico.ai';
export const ESPORTIVA_REPORT_METHOD = 'af2_media_report_af';

/** Linha crua da API (só os campos que consumimos; o resto é ignorado). */
export interface EsportivaApiRow {
  dt?: string;
  afp?: string | null;
  visit_count?: number;
  registration_count?: number;
  ftd_count?: number;
  deposit_count?: number;
  deposit_total?: number;
  commissions_cpa?: number;
  commissions_rev_share?: number;
  commissions_total?: number;
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
      // O dinheiro de CPA EXATO, preservado. Ele é o dividendo da conta acima, e
      // até 08/2026 era descartado depois de virar contagem — quem precisava da
      // parcela CPA (o toggle "REV fora do lucro") a remontava por
      // `contagem × régua`, ou seja pela divisão desfeita, arredondamento e tudo.
      cpa_commission: cpaMoney,
      // Funil (call Infinity 12/08): a API manda clique e QUANTIDADE de depósitos
      // por linha — alimentam os cards de funil e o ticket médio/média de depósito.
      visits: numOf(r?.visit_count),
      deposit_count: numOf(r?.deposit_count),
    });
  }

  return { rows, cpaRemainder, skipped };
}

/**
 * Converte um `dateTo` INCLUSIVO (o que `pullWindow` de `housePull.ts` devolve)
 * pro limite que a API espera. Doc oficial do TAP: "date_from is inclusive" / "date_to is exclusive" —
 * `date_from=2022-07-12, date_to=2022-07-14` devolve só 12 e 13/07. Sem este +1,
 * `dateTo: hoje` nunca inclui HOJE (só ontem em diante), não importa quantas vezes
 * a rodada horária rode — era a causa real do "atraso de ~1 dia" observado em
 * produção (achado 11/08/2026, verificação contra a wallet real da Infinity).
 */
export function toApiDateTo(dateToInclusive: string): string {
  const d = new Date(`${dateToInclusive}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
