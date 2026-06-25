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

// id determinístico: casa__data__afiliado (ou 'agg' p/ a linha agregada da casa).
// Sanitiza '/' porque é proibido em doc id do Firestore. Mesmos (slug,date,aff)
// → mesmo id → reimport sobrescreve (idempotente), nunca duplica.
export function hrDocId(slug: string, date: string, affiliateId: string | null): string {
  return `${slug}__${date}__${affiliateId ?? 'agg'}`.replace(/\//g, '_');
}

// Coage as 6 métricas a número (NaN/string inválida/ausente → 0) e descarta
// quaisquer campos extras do payload (não vaza affiliateLabel/line etc.).
export function sanitizeMetrics(src: any): Record<HrMetricKey, number> {
  const out = {} as Record<HrMetricKey, number>;
  for (const k of HR_METRICS) out[k] = Number(src?.[k]) || 0;
  return out;
}
