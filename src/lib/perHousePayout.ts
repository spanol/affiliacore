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

import { calcAffiliatePayout, num, rateStatus, type AffiliateConfig } from './commission';

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

/** Linha de uma casa na visão "por marca" (`fetchAffiliateResultsByBrand`). */
export interface BrandMetricRow {
  id?: string | number | null;   // chave da casa (brandId da OTG ou slug da manual)
  name?: string | null;
  qualified_cpa?: number | string | null;
  rvs?: number | string | null;
}

const brandKeyOfRow = (row: BrandMetricRow | null | undefined): string =>
  String(row?.id ?? '').trim();

/**
 * Comissão do afiliado somando CASA A CASA a partir das linhas por marca.
 *
 * POR QUE existe: o painel do próprio afiliado, em "Todas as casas", multiplicava
 * as métricas AGREGADAS pela taxa de TOPO. Quem só tem taxa por casa (`byBrand`,
 * que é como a Infinity precifica) via a comissão sumir do total: o CPA aparecia
 * contado, o dinheiro não. Filtrando a casa, o mesmo número aparecia certo, porque
 * aí a taxa da casa entrava. Reportado em 25/08/2026.
 *
 * Somar por casa é o que compõe, e compõe exato porque `calcAffiliatePayout` é
 * LINEAR nas métricas (mesmo argumento do `perHousePayout` e do `payoutOfMetrics`
 * da rede). Casa sem chave cai na taxa de topo, que é o comportamento antigo.
 */
export function payoutOverBrandRows(
  rows: BrandMetricRow[] | null | undefined,
  config: AffiliateConfig | null | undefined,
): PayoutParts {
  let parts = ZERO;
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = brandKeyOfRow(row);
    parts = addParts(parts, rowParts(row, config, key || undefined));
  }
  return parts;
}

/**
 * Casas em que o afiliado PRODUZIU e para as quais não há taxa nenhuma (nem
 * override da casa, nem topo). É o que separa "configurado como zero" de "ninguém
 * configurou ainda" na visão agregada: sem isto, o painel de quem tem taxa só por
 * casa mostrava o selo de "CPA não configurado" mesmo com todas as casas
 * precificadas.
 */
export function unratedProducingBrands(
  rows: BrandMetricRow[] | null | undefined,
  config: AffiliateConfig | null | undefined,
): string[] {
  const out: string[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const produziu = num(row?.qualified_cpa) > 0 || num(row?.rvs) !== 0;
    if (!produziu) continue;
    const key = brandKeyOfRow(row);
    const { cpaConfigured, revConfigured } = rateStatus(config, key || undefined);
    if (!cpaConfigured && !revConfigured) out.push(String(row?.name ?? key ?? '').trim() || key);
  }
  return out;
}
