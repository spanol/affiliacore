// Helpers PUROS da persistência do funil da v1 analítica (coleção `affiliate_analytics`).
//
// Espelha o padrão de `houseResultsDoc.ts`: 1 doc por afiliado×casa, id determinístico
// → o refresh é IDEMPOTENTE (sobrescreve, não duplica). O `affiliate_analytics` é a
// FONTE do funil (cliques/cadastros/FTD/NGR) que a v2 esconde; a junção com os afiliados
// reais/pendentes é por `nameKey|casa` (mesma chave da reconciliação de pending). Núcleo
// sem Firebase — testável isolado. Ver otgAnalytics.ts (FunnelRow) e SPIKE-OTG-V1-ANALYTICS.

import { num } from './commission';
import { normalizeNameKey } from './affiliateName';

export const ANALYTICS_METRICS = [
  'clicks',
  'registrations',
  'ftd',
  'cpaQual',
  'deposits',
  'betAmount',
  'ngr',
] as const;

export type AnalyticsMetricKey = (typeof ANALYTICS_METRICS)[number];

// Chave de junção afiliado×casa (mesma normalização da reconciliação de pending).
export const funnelKey = (nameKey: string, house: string): string =>
  `${normalizeNameKey(nameKey)}|${normalizeNameKey(house)}`;

// id determinístico do doc (nameKey__casa, ambos normalizados). Sanitiza '/' porque é
// proibido em doc id do Firestore. Mesmo (nameKey,casa) → mesmo id → refresh sobrescreve.
export const analyticsDocId = (nameKey: string, house: string): string =>
  `${normalizeNameKey(nameKey)}__${normalizeNameKey(house)}`.replace(/\//g, '_');

// Coage as 7 métricas do funil a número (num guarda NaN/Infinity/objeto → 0) e descarta
// campos extras. true se a linha tem alguma atividade de funil (clique ou cadastro).
export const sanitizeFunnel = (row: any): Record<AnalyticsMetricKey, number> => {
  const out = {} as Record<AnalyticsMetricKey, number>;
  for (const k of ANALYTICS_METRICS) out[k] = num(row?.[k]);
  return out;
};

export const hasFunnelActivity = (row: any): boolean =>
  num(row?.clicks) > 0 || num(row?.registrations) > 0;

// Resolve o affiliateId de uma linha do funil:
//  - REAL (afiliado do mirror que já produz/foi reconciliado) tem prioridade;
//  - senão o id do PENDING (sintético `pending_<nameKey>_<casa>` ou já o real);
//  - senão null (afiliado SÓ-funil ainda desconhecido do Boost).
// funnelOnly = NÃO está no relatório v2 (não produz comissão) — caso "Lucas".
export interface FunnelLookup {
  realByKey: Map<string, string>; // funnelKey -> affiliateId real
  pendingByKey: Map<string, string>; // funnelKey -> id do pending (sintético ou real)
}

export const resolveFunnelAffiliateId = (
  row: { nameKey: string; house: string },
  lookup: FunnelLookup
): { affiliateId: string | null; funnelOnly: boolean } => {
  const key = funnelKey(row.nameKey, row.house);
  const real = lookup.realByKey.get(key);
  if (real) return { affiliateId: real, funnelOnly: false };
  const pend = lookup.pendingByKey.get(key);
  if (pend) return { affiliateId: pend, funnelOnly: true };
  return { affiliateId: null, funnelOnly: true };
};
