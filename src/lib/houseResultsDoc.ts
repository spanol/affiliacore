// Helpers puros dos RESULTADOS MANUAIS por casa (coleção `house_results`).
//
// Cada doc = uma linha (casa, data, afiliado|null=agregado) com as 6 métricas
// no mesmo shape de `results` da OTG. O id é determinístico para que reimportar
// o mesmo dia seja IDEMPOTENTE (sobrescreve em vez de duplicar). Extraído de
// `server.ts` (era closure dentro de `createApp`) para ficar testável isolado.

export const HR_METRICS = [
  'registrations',
  'first_deposits',
  'qualified_cpa',
  'rvs',
  'deposit',
  'total_commission',
] as const;

export type HrMetricKey = (typeof HR_METRICS)[number];

// Métricas OPCIONAIS do funil (visits/deposit_count — call Infinity 12/08): só são
// gravadas quando o payload as trouxe (ausência ≠ 0, e `undefined` não pode ir ao
// Firestore). Espelha OPTIONAL_METRIC_KEYS de houseResults.ts.
export const HR_OPTIONAL_METRICS = ['visits', 'deposit_count'] as const;
export type HrOptionalMetricKey = (typeof HR_OPTIONAL_METRICS)[number];

// id determinístico: casa__data__afiliado (ou 'agg' p/ a linha agregada da casa).
// Sanitiza '/' porque é proibido em doc id do Firestore. Mesmos (slug,date,aff)
// → mesmo id → reimport sobrescreve (idempotente), nunca duplica.
export function hrDocId(slug: string, date: string, affiliateId: string | null): string {
  return `${slug}__${date}__${affiliateId ?? 'agg'}`.replace(/\//g, '_');
}

// Coage as 6 métricas a número (NaN/string inválida/ausente → 0) e descarta
// quaisquer campos extras do payload (não vaza affiliateLabel/line etc.). As
// opcionais só entram quando PRESENTES no payload — nunca viram 0 fabricado nem
// `undefined` no doc.
export function sanitizeMetrics(
  src: any
): Record<HrMetricKey, number> & Partial<Record<HrOptionalMetricKey, number>> {
  const out = {} as Record<HrMetricKey, number> & Partial<Record<HrOptionalMetricKey, number>>;
  for (const k of HR_METRICS) out[k] = Number(src?.[k]) || 0;
  for (const k of HR_OPTIONAL_METRICS) {
    if (src?.[k] === undefined || src?.[k] === null) continue;
    out[k] = Number(src[k]) || 0;
  }
  return out;
}
