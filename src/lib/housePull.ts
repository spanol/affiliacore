// Motor genérico de PULL automático por tag — extraído de esportivaPull.ts
// (08/2026) quando a LEON Bet ganhou seu próprio conector (leonbetPull.ts) e
// ficou claro que nada aqui é específico da Esportiva: qualquer casa que
// devolva linhas com [data, tag, métricas] usa o MESMO motor de agregação e
// atribuição por tag. O que muda por casa é só o adaptador (buildXxxRows) que
// traduz a API dela para `PullRow`.
//
// Núcleo PURO (sem Firebase, sem fetch): o servidor busca e adapta, este
// módulo só agrega e resolve tag -> afiliado.

import { METRIC_KEYS, OPTIONAL_METRIC_KEYS, emptyMetrics, addMetrics, type Metrics } from './houseResults';
import { normalizeTag } from './houseTagImport';

export interface PullRow extends Metrics {
  date: string;
  tag: string; // '' = tráfego sem tag (órfão da casa)
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
// campo de UI não pode vazar para o backend. Métrica opcional (visits/deposit_count)
// só entra quando a fonte a trouxe — ausência ≠ 0.
function pick(m: Metrics): Metrics {
  const out = emptyMetrics();
  for (const k of METRIC_KEYS) out[k] = m[k] ?? 0;
  for (const k of OPTIONAL_METRIC_KEYS) if (m[k] !== undefined) out[k] = m[k];
  return out;
}

/**
 * Janela do pull. Cobre HOJE e os `days - 1` dias anteriores — a maioria das
 * casas fecha o relatório com atraso e ainda corrige o(s) dia(s) anterior(es),
 * então reler essa borda a cada rodada é o que mantém o número certo — e como o
 * upload REESCREVE as datas presentes, reler não duplica nada. O tamanho certo
 * da janela (2 dias pra Esportiva, mais pra LEON) depende do atraso observado
 * em cada casa — quem chama decide via `days`.
 *
 * `dateTo` aqui é o limite INCLUSIVO (uso humano: auditoria, resposta da rota).
 * Casas cuja API trata o fim como EXCLUSIVO (ex.: TAP by Smartico) precisam de
 * uma conversão própria antes de montar a URL — ver `toApiDateTo` em
 * esportivaPull.ts.
 */
export function pullWindow(today: string, days = 2): { dateFrom: string; dateTo: string } {
  const span = Math.max(1, Math.floor(days));
  const end = new Date(`${today}T12:00:00Z`);
  const start = new Date(end.getTime() - (span - 1) * 24 * 60 * 60 * 1000);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: today };
}

/** O que fica GRAVADO na casa para a tela mostrar a fila de tags sem dono. */
export interface StoredPendingTag {
  tag: string;
  days: number;
  registrations: number;
  first_deposits: number;
  qualified_cpa: number;
  total_commission: number;
}

/** Teto do que vai para o doc da casa. Fila maior que isso é problema de operação, não de tela. */
export const MAX_STORED_PENDING_TAGS = 20;

/**
 * Resume a fila de pendentes para GRAVAR no doc da casa.
 *
 * POR QUE existe: até 24/08/2026 o `pending` do pull só era escrito no `metadata`
 * do log de auditoria, que ninguém abre. A LEON passou dias reportando a tag
 * `%7btag%7d` (o placeholder `{tag}` percent-encoded, de um link cru que circulou
 * fora da plataforma) sem que nenhuma tela dissesse nada, e um CPA qualificado
 * ficou sem dono. O import por planilha sempre teve essa fila à vista; o pull não.
 *
 * Guarda só as métricas que a fila usa para PRIORIZAR (dinheiro, CPA, cadastros),
 * não o `Metrics` inteiro: é campo de leitura de tela, e o doc da casa não é lugar
 * de acumular série histórica. Já vem ordenado por dinheiro, o mesmo critério do
 * `buildPullPayload`, e cortado no teto — a cauda longa não muda a decisão de
 * quem vai vincular a tag.
 */
export function summarizePendingTags(
  pending: PendingTag[] | null | undefined,
  limit: number = MAX_STORED_PENDING_TAGS,
): StoredPendingTag[] {
  const teto = Math.max(0, Math.floor(limit));
  return (Array.isArray(pending) ? pending : [])
    .filter((p) => !!normalizeTag(p?.tag))
    .map((p) => ({
      tag: normalizeTag(p.tag),
      days: Number(p.days) || 0,
      registrations: Number(p.registrations) || 0,
      first_deposits: Number(p.first_deposits) || 0,
      qualified_cpa: Number(p.qualified_cpa) || 0,
      total_commission: Number(p.total_commission) || 0,
    }))
    .sort((a, b) => b.total_commission - a.total_commission || b.qualified_cpa - a.qualified_cpa || a.tag.localeCompare(b.tag))
    .slice(0, teto);
}

/**
 * Tira uma tag da fila gravada. É o que faz o aviso sumir no instante em que o
 * admin vincula o dono, sem esperar a próxima rodada do pull.
 */
export function removePendingTag(
  stored: StoredPendingTag[] | null | undefined,
  tag: string | null | undefined,
): StoredPendingTag[] {
  const alvo = normalizeTag(tag);
  if (!alvo) return Array.isArray(stored) ? stored : [];
  return (Array.isArray(stored) ? stored : []).filter((p) => normalizeTag(p?.tag) !== alvo);
}
