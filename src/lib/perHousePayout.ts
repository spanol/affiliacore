// Comissão de afiliado precificada POR CASA — fix do "R$ 280" (2026-08-12).
//
// O modelo "1 afiliado → 1 casa" (brandIdOf pelo mirror `affiliates`) vale SÓ
// para a produção OTG: lá o afiliado pertence a uma casa e o agregado dele é
// daquela casa. A produção MANUAL (house_results) carrega a casa em CADA linha
// (`houseSlug`) — precificá-la com a taxa da casa do MIRROR erra o valor no
// momento em que o afiliado produz numa casa diferente da registrada: 1 QFTD
// da Esportiva (byBrand R$ 110) saiu a R$ 280 (taxa da Super Bet do mirror) no
// painel do especial da Infinity.
//
// Aqui cada parte é precificada com a taxa da casa CERTA: a linha OTG com o
// brandId do afiliado, cada linha manual com `byBrand[houseSlug]`. A fórmula
// continua vindo SÓ de `calcAffiliatePayout` (fonte única) — como ela é LINEAR
// nas métricas, somar linha a linha == aplicar à soma (o mesmo argumento do
// `payoutOfMetrics` de network.ts, que já fazia isso no /rede do admin).

import { calcAffiliatePayout, type AffiliateConfig } from './commission';

export interface HouseMetricRow {
  houseSlug?: string | null;
  affiliateId?: string | number | null;
  qualified_cpa?: number | string | null;
  rvs?: number | string | null;
}

export interface PayoutParts {
  total: number;
  cpa: number; // parcela CPA (qualified_cpa × taxa da casa)
  rev: number; // parcela REV (rvs × % da casa)
}

const ZERO: PayoutParts = { total: 0, cpa: 0, rev: 0 };

// Partes de uma linha SEM reimplementar a fórmula: cada parcela é o próprio
// calcAffiliatePayout com a métrica alheia zerada; total = cpa + rev pela
// linearidade.
function rowParts(row: any, config: AffiliateConfig | null | undefined, brandId?: string): PayoutParts {
  const cpa = calcAffiliatePayout({ ...(row ?? {}), rvs: 0 }, config, brandId);
  const rev = calcAffiliatePayout({ ...(row ?? {}), qualified_cpa: 0 }, config, brandId);
  return { total: cpa + rev, cpa, rev };
}

function addParts(a: PayoutParts, b: PayoutParts): PayoutParts {
  return { total: a.total + b.total, cpa: a.cpa + b.cpa, rev: a.rev + b.rev };
}

/**
 * Comissão de UM afiliado: linha OTG (agregado da API externa) na taxa da casa
 * do afiliado (`otgBrandId`) + cada linha manual na taxa da casa da LINHA.
 * Linha manual sem `houseSlug` cai na taxa de topo (byBrand é no-op sem chave).
 */
export function perHousePayout(
  otgRow: unknown,
  manualRows: HouseMetricRow[] | null | undefined,
  config: AffiliateConfig | null | undefined,
  otgBrandId?: string,
): PayoutParts {
  let parts = otgRow ? rowParts(otgRow, config, otgBrandId) : ZERO;
  for (const row of Array.isArray(manualRows) ? manualRows : []) {
    const slug = String(row?.houseSlug ?? '').trim();
    parts = addParts(parts, rowParts(row, config, slug || undefined));
  }
  return parts;
}

export interface PerHousePayoutIndex {
  /**
   * Partes da comissão do afiliado à config dada — a PRÓPRIA (repasse dele) ou
   * a de um superior (pra derivar spread: breakdown(cfg do especial) −
   * breakdown(cfg do sub), por casa dos dois lados).
   */
  breakdownFor(affiliateId: string, config: AffiliateConfig | null | undefined): PayoutParts;
}

/**
 * Índice por afiliado a partir das partes SEPARADAS (OTG × manual) que
 * `fetchResultsForAffiliatesSplit` devolve. NUNCA passe as linhas MESCLADAS
 * como `otgRows` — o manual contaria duas vezes.
 */
export function buildPerHousePayout(
  otgRows: any[] | null | undefined,
  manualRows: HouseMetricRow[] | null | undefined,
  brandIdOf: (id: string) => string | undefined,
): PerHousePayoutIndex {
  const otgBy = new Map<string, any>();
  for (const r of Array.isArray(otgRows) ? otgRows : []) {
    const id = String(r?.affiliate_id ?? r?.id ?? '');
    if (id) otgBy.set(id, r);
  }
  const manualBy = new Map<string, HouseMetricRow[]>();
  for (const r of Array.isArray(manualRows) ? manualRows : []) {
    const id = String(r?.affiliateId ?? '');
    if (!id || r?.affiliateId == null) continue; // agregado da casa: não é produção de afiliado
    (manualBy.get(id) ?? manualBy.set(id, []).get(id)!).push(r);
  }
  return {
    breakdownFor(affiliateId, config) {
      const id = String(affiliateId ?? '');
      return perHousePayout(otgBy.get(id), manualBy.get(id) ?? [], config, brandIdOf(id));
    },
  };
}
