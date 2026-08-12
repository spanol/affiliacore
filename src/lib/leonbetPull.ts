// Pull automático do relatório da casa (LEON Bet / R2D Partners, software
// Quintessence — recon em LEONBET-R2D-RECON, ver memória de sessão).
//
//   GET https://affiliates-api.r2d.partners/affiliate_statistics/reports
//        ?token=<token>&start=YYYY-MM-DD&end=YYYY-MM-DD&merchant=<id>
//
// ⚠️ Diferenças confirmadas em relação à Esportiva (esportivaPull.ts):
//   - `cpa_qualified` já vem como CONTAGEM (não em dinheiro) — sem a divisão
//     dinheiro÷régua que a Esportiva exige, então não há `cpaBase`/`cpaRemainder`.
//   - `end` é INCLUSIVO — sem o `+1` que `toApiDateTo` faz pro TAP.
//   - A janela aceita no máximo ~31 dias corridos ("Invalid date range" além
//     disso); a rodada usa `pullWindow` com poucos dias, bem dentro do limite.
//   - Atraso observado é T+1 (cadastro de teste em 11/08, só apareceu no
//     relatório com `transaction_date` 12/08) — NÃO é "quase tempo real" como
//     os reviews públicos da casa sugeriam. A janela de reprocessamento
//     (`days` em `pullWindow`) deve ser maior que a da Esportiva por causa disso.
//
// Núcleo PURO (sem Firebase, sem fetch): o servidor busca e passa as linhas aqui.

import { normalizeTag } from './houseTagImport';
import type { PullRow } from './housePull';

export const LEONBET_API_BASE = 'https://affiliates-api.r2d.partners';

export function buildStatisticsUrl(
  dateFrom: string,
  dateTo: string,
  token: string,
  merchant: string | number,
  base: string = LEONBET_API_BASE,
): string {
  const url = new URL('/affiliate_statistics/reports', base);
  url.searchParams.set('token', token);
  url.searchParams.set('start', dateFrom);
  url.searchParams.set('end', dateTo);
  url.searchParams.set('merchant', String(merchant));
  return url.toString();
}

/** Linha crua da API (só os campos que consumimos; o resto é ignorado). */
export interface LeonBetApiRow {
  transaction_date?: string;
  affiliate_id?: number;
  serial_id?: number;
  creative_id?: number;
  an_id?: string | null;
  anid1?: string | null;
  deposits?: number;
  revenue_share_profit?: number;
  cpa_profit?: number;
  profit?: number;
  deposits_count?: number;
  registration_count?: number;
  cpa_qualified?: number;
  first_deposit_count?: number;
}

const numOf = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// A API devolve o LITERAL "< empty >" (não `null`/`""`) pra tag ausente — visto
// ao vivo no recon (11/08/2026). `cleanToken`/`normalizeTag` não conhecem esse
// token (a lista deles é `— – - -- n/a null`, do formato de EXPORT da Esportiva),
// então sem este filtro "< empty >" viraria uma tag de verdade e nunca casaria
// com afiliado nenhum — um balde de pendência fantasma que nunca esvazia.
const EMPTY_PLACEHOLDER = /^<\s*empty\s*>$/i;
const sanitizeRawTag = (v: unknown): string => {
  const s = String(v ?? '').trim();
  return EMPTY_PLACEHOLDER.test(s) ? '' : s;
};

export interface AdaptResult {
  rows: PullRow[];
  skipped: number; // linhas sem data utilizável
}

/**
 * Converte a resposta da API para o shape comum (`PullRow`) que `buildPullPayload`
 * consome. `anid1` é o campo confirmado no recon (o `anid` do link vira `qtag` na
 * LEON e some ali); cai para `an_id` se `anid1` vier vazio — os dois carregaram a
 * MESMA tag no teste ao vivo, mas só `anid1` está documentado como o slot nosso.
 */
export function adaptLeonBetRows(apiRows: LeonBetApiRow[] | null | undefined): AdaptResult {
  const rows: PullRow[] = [];
  let skipped = 0;

  for (const r of Array.isArray(apiRows) ? apiRows : []) {
    const date = String(r?.transaction_date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped++;
      continue;
    }
    const tag = normalizeTag(sanitizeRawTag(r?.anid1)) || normalizeTag(sanitizeRawTag(r?.an_id));
    rows.push({
      date,
      tag,
      registrations: numOf(r?.registration_count),
      first_deposits: numOf(r?.first_deposit_count),
      qualified_cpa: numOf(r?.cpa_qualified), // já é CONTAGEM — sem régua/divisão
      rvs: numOf(r?.revenue_share_profit),
      deposit: numOf(r?.deposits),
      total_commission: numOf(r?.profit),
      // Qtd de depósitos vem da API; clique NÃO vem (`visits` fica AUSENTE de
      // propósito — ausência ≠ 0, a UI mostra "—" em vez de um zero enganoso).
      deposit_count: numOf(r?.deposits_count),
    });
  }

  return { rows, skipped };
}
