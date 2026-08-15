// Núcleo PURO de comissão/taxa — SEM dependência de Firebase, p/ ser importável
// tanto pelo client (services/pages) quanto pelo server.ts. Antes estas funções
// viviam em affiliateService.ts (que importa o Firebase client no topo), então o
// servidor não conseguia reusá-las e o ranking reimplementava a fórmula à mão,
// divergindo dos dashboards (R2). affiliateService re-exporta tudo daqui, então os
// call-sites antigos (`from '../services/affiliateService'`) seguem funcionando.

// B6 · comissão por casa. Par de taxas (CPA em R$, REV em %) — o mesmo shape do
// nível de topo da config, mas por marca.
export interface BrandRates {
  cpaValue: number;
  revPercentage: number;
}

export interface AffiliateConfig {
  affiliateId: string;
  // Taxas de TOPO = o default do afiliado (casa única / fallback). Retrocompat
  // total: configs antigas só têm estes campos e seguem funcionando.
  cpaValue: number;
  revPercentage: number;
  // B6 · override de comissão POR CASA (afiliado × casa). Chaveado por brandId.
  // Quando uma casa não tem override aqui, usa o CPA/REV de topo. Dev-gated na UI:
  // o editor por casa só aparece quando há ≥2 casas (hoje, com a mock multi-casa).
  byBrand?: Record<string, BrandRates>;
  updatedAt?: any;
}

// Coage valor não-finito (string não-numérica da API externa, null) p/ 0 — ANTES de
// multiplicar, p/ nunca propagar NaN aos totais de dinheiro. Um objeto NÃO-array
// (métrica malformada da API) vira 0 sem chamar Number(): `Number({toString:false})`
// — JSON válido — LANÇA "Cannot convert object to primitive value" (achado property
// 2026-06-24); blindar aqui evita o crash do cálculo de dinheiro. Arrays seguem a
// coerção nativa (Number([5])===5), e primitivos/strings ficam inalterados.
export const num = (v: any): number => {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) return 0;
  // O guard acima não basta: um ARRAY cujo conteúdo não coage também lança —
  // `Number([{}])` chama Array.prototype.toString → String({}) → "Cannot convert
  // object to primitive value" (achado property 2026-07-27, mesma classe do bug
  // de 2026-06-24, um nível abaixo). num() é a porta ÚNICA do cálculo de dinheiro
  // e não pode lançar em NENHUMA entrada: qualquer coerção que falhe vira 0.
  let n: number;
  try {
    n = Number(v);
  } catch {
    return 0;
  }
  return Number.isFinite(n) ? n : 0;
};

// Resolve as taxas efetivas de um afiliado para uma casa: usa o override de
// `byBrand[brandId]` quando existe, senão cai no CPA/REV de topo (o default).
// Sem `brandId` (ou sem `byBrand`) devolve o default — é o caminho retrocompat
// usado por todos os call-sites antigos que não conhecem casa.
export function resolveBrandRates(config?: AffiliateConfig | null, brandId?: string): BrandRates {
  const fallback: BrandRates = {
    cpaValue: Number(config?.cpaValue) || 0,
    revPercentage: Number(config?.revPercentage) || 0,
  };
  if (!brandId || !config?.byBrand) return fallback;
  const o = config.byBrand[brandId];
  if (!o) return fallback;
  return {
    cpaValue: Number.isFinite(Number(o.cpaValue)) ? Number(o.cpaValue) : fallback.cpaValue,
    revPercentage: Number.isFinite(Number(o.revPercentage)) ? Number(o.revPercentage) : fallback.revPercentage,
  };
}

// Distingue "configurado como 0" de "ainda não configurado": um 0 cru é uma taxa
// real; a AUSÊNCIA (sem cpaValue de topo e sem override por casa) NÃO deve virar
// "R$0/CPA" enganoso no display. `brandId` informado → considera o override da casa
// OU o topo; sem `brandId` (visão "Todas as casas") → só o topo. Fonte ÚNICA da
// regra a0dc467, consumida por AffiliateDetails e ClientDashboard.
export function rateStatus(
  config?: AffiliateConfig | null,
  brandId?: string
): { cpaConfigured: boolean; revConfigured: boolean } {
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const override = brandId && config?.byBrand ? config.byBrand[brandId] : undefined;
  return {
    cpaConfigured: isNum(override?.cpaValue) || isNum(config?.cpaValue),
    revConfigured: isNum(override?.revPercentage) || isNum(config?.revPercentage),
  };
}

// Repasse devido ao afiliado DECOMPOSTO em parcelas (CPA × REV). É a fonte única
// da fórmula — `calcAffiliatePayout` delega aqui, e o toggle "REV fora do lucro"
// (call Infinity 12/08) consome só a parcela `cpa` sem reimplementar nada.
export function calcAffiliatePayoutParts(
  result: any,
  config?: AffiliateConfig | null,
  brandId?: string
): { cpa: number; rev: number; total: number } {
  const { cpaValue, revPercentage } = resolveBrandRates(config, brandId);
  const cpa = num(result?.qualified_cpa) * cpaValue;
  const rev = num(result?.rvs) * (revPercentage / 100);
  return { cpa, rev, total: cpa + rev };
}

// Repasse devido ao afiliado para um result: CPA qualificado × valor de CPA + REV ×
// (percentual / 100). `brandId` opcional → usa a taxa POR CASA (byBrand) do afiliado;
// sem ele, a taxa de topo (retrocompat). num() impede NaN de métrica string.
export function calcAffiliatePayout(result: any, config?: AffiliateConfig | null, brandId?: string): number {
  return calcAffiliatePayoutParts(result, config, brandId).total;
}

// Lucro líquido da agência para um result: comissão da casa − repasse ao afiliado.
export function calcNetProfit(result: any, config?: AffiliateConfig | null, brandId?: string): number {
  const houseCommission = num(result?.total_commission);
  return houseCommission - calcAffiliatePayout(result, config, brandId);
}

// Taxa PADRÃO de uma casa = quanto a CASA paga à AGÊNCIA por CPA/REV (receita).
// Definida no backoffice /casas (BrandMeta.defaultCpa/defaultRev), só faz sentido p/
// casas 'manual'. CPA em R$, REV em %.
export interface HouseRate {
  defaultCpa?: number | null;
  defaultRev?: number | null;
}

// Comissão BRUTA da casa (receita da agência) para UMA linha manual (house_results).
// Usa o `total_commission` importado quando houver; senão DERIVA da taxa PADRÃO
// da casa: cpa_qualificado × defaultCpa + rvs × (defaultRev/100). É FALLBACK — não
// sobrescreve comissão importada. Sem isso, planilha só com contagem de CPA (sem a
// coluna `comissao`) dá comissão 0 e o lucro do master fica NEGATIVO (0 − repasse).
// num() guarda contra NaN/ausência. Fonte ÚNICA da derivação (consumida no /admin).
//
// ⚠️ "Houver" é `!== 0`, NÃO `> 0`: comissão NEGATIVA é um número real (rev share
// negativo existe nessas casas e o pull o grava como veio da API), e tratá-la como
// ausente mandava a linha pro fallback — o prejuízo virava 0 quando a casa não tem
// taxa padrão e, pior, virava LUCRO quando tem (`qualified_cpa × defaultCpa`). O 0
// segue caindo na derivação, que é exatamente o caso "planilha sem a coluna".
export function houseCommissionForRow(row: any, houseRate?: HouseRate | null): number {
  const imported = num(row?.total_commission);
  if (imported !== 0) return imported;
  return num(row?.qualified_cpa) * num(houseRate?.defaultCpa)
    + num(row?.rvs) * (num(houseRate?.defaultRev) / 100);
}

// Comissão da casa SÓ do eixo CPA — usada quando a casa está com "REV fora do
// lucro" (toggle da call Infinity 12/08). IGNORA o `total_commission` de propósito:
// ele embute o REV (na Esportiva, `commissions_total` = CPA + rev share) e não há
// como separá-lo depois.
//
// PREFERE o dinheiro de CPA que a própria fonte informou (`cpa_commission`, métrica
// opcional): os dois conectores o entregam EXATO (`commissions_cpa` no TAP,
// `cpa_profit` na R2D) e reconstruí-lo por `contagem × régua` era um round-trip
// lossy — a contagem do TAP já NASCE de uma divisão arredondada, e na LEON não há
// régua nenhuma (o `defaultCpa` da casa fica vazio → a parcela CPA dava R$ 0).
// Ausência ≠ 0: sem o campo (planilha, linha antiga) cai na régua da casa, que é o
// comportamento de sempre.
export function houseCpaCommissionForRow(row: any, houseRate?: HouseRate | null): number {
  const informed = row?.cpa_commission;
  if (informed !== undefined && informed !== null) return num(informed);
  return num(row?.qualified_cpa) * num(houseRate?.defaultCpa);
}
