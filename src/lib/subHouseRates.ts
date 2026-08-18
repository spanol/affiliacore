// Núcleo PURO da comissão do sub POR CASA na tela do gerente (/network/afiliados).
// SEM Firebase, sem React.
//
// POR QUÊ (pedido Infinity, 17/08): a lista de sub-afiliados do gerente editava a
// taxa de TOPO do afiliado (`cpaValue`/`revPercentage` na raiz da config). Numa
// instância multi-casa isso é o "valor de contrato": ele vale em TODA casa que não
// tem override e, pior, na leitura o topo é o que sobra quando a casa não está no
// `byBrand` — então um gesto feito olhando uma casa reprecificava as outras. A
// regra nova é a mesma da precificação de parceria: gesto POR CASA, gravando em
// `byBrand[chave-da-casa]`. Sem casa selecionada não há gesto de dinheiro nenhum.
//
// As chaves de casa aqui são as MESMAS de `dealBrandKey`/`houseKeyOf`: brandId da
// OTG quando existe, senão o slug — é o que o `byBrand` e o `calcAffiliatePayout`
// usam. Ver PLANO-TIPOS-DE-DEAL.md §F5 e o invariante "taxa POR CASA" do CLAUDE.md.

import type { AffiliateConfig } from './commission';
import type { HouseMetricRow } from './perHousePayout';

export interface HouseLike {
  id?: string | null;
  slug?: string | null;
  brandId?: string | null;
  name?: string | null;
  active?: boolean;
  order?: number | null;
}

export interface HouseOption {
  key: string;  // chave do byBrand (brandId da OTG ou slug da casa manual)
  name: string; // rótulo exibido no seletor
}

/** Chave da casa no `byBrand` — a MESMA convenção de `dealBrandKey`. */
export const houseRateKey = (h: HouseLike | null | undefined): string =>
  String(h?.brandId || h?.slug || h?.id || '').trim();

/**
 * As casas que o seletor do gerente oferece: as ATIVAS do backoffice, na ordem do
 * backoffice e depois por nome. Casa pausada fica de fora (mesma regra do rascunho
 * de acordo em `buildHouseDraftCards`) e casa sem nome também: sem rótulo não há o
 * que selecionar.
 *
 * A fonte é o registro de casas, NÃO a marca das linhas de resultado: numa
 * instância OTG-free a linha agregada do afiliado não tem `brand`, e derivar o
 * seletor dela o deixaria vazio justamente onde ele é obrigatório para editar.
 */
export function buildHouseOptions(houses: HouseLike[] | null | undefined): HouseOption[] {
  const seen = new Map<string, HouseOption>();
  for (const h of Array.isArray(houses) ? houses : []) {
    if (!h || h.active === false) continue;
    const key = houseRateKey(h);
    const name = String(h?.name ?? '').trim();
    if (!key || !name || seen.has(key)) continue;
    seen.set(key, { key, name });
  }
  return Array.from(seen.values());
}

/** Casa selecionada pelo NOME exibido no seletor (o BrandFilter fala em nomes). */
export function houseKeyByName(
  options: HouseOption[] | null | undefined,
  name: string | null | undefined,
): string | null {
  const wanted = String(name ?? '').trim();
  if (!wanted) return null;
  const hit = (Array.isArray(options) ? options : []).find((o) => o.name === wanted);
  return hit ? hit.key : null;
}

export interface ResultParts {
  otg: any[];
  manual: HouseMetricRow[];
}

/**
 * Recorta as partes (OTG × manual) à casa selecionada, preservando a SEPARAÇÃO —
 * `buildPerHousePayout` exige as partes cruas (linha mesclada contaria o manual 2×).
 *
 * A parte OTG é do afiliado inteiro (a API externa não quebra por casa no agregado
 * por afiliado), então a casa dela é a do MIRROR (`brandIdOf`), a mesma atribuição
 * do /admin. A parte manual carrega a casa em cada linha (`houseSlug`).
 * `brandKey` nulo/vazio = sem recorte.
 */
export function scopePartsToHouse(
  parts: ResultParts | null | undefined,
  brandIdOf: (affiliateId: string) => string | undefined,
  brandKey: string | null | undefined,
): ResultParts {
  const otg = Array.isArray(parts?.otg) ? parts!.otg : [];
  const manual = Array.isArray(parts?.manual) ? parts!.manual : [];
  const key = String(brandKey ?? '').trim();
  if (!key) return { otg, manual };
  return {
    otg: otg.filter((r) => brandIdOf(String(r?.affiliate_id ?? r?.id ?? '')) === key),
    manual: manual.filter((r) => String(r?.houseSlug ?? '').trim() === key),
  };
}

export interface SubFunnel {
  registrations: number;
  first_deposits: number;
  qualified_cpa: number;
}

const numOf = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Funil por afiliado dentro do recorte (OTG + manual somados). É o que as colunas
 * Cadastros/Depósitos/CPA Qualif. mostram quando o gerente filtra por uma casa:
 * exibir o total da rede ao lado de uma taxa que vale só naquela casa faz a linha
 * mentir sobre de onde vem o número.
 *
 * Linha manual sem afiliado (`affiliateId` nulo) é o agregado da CASA e fica de
 * fora — somá-la contaria a produção duas vezes.
 */
export function funnelByAffiliate(parts: ResultParts | null | undefined): Record<string, SubFunnel> {
  const out: Record<string, SubFunnel> = {};
  const add = (id: string, row: any) => {
    if (!id) return;
    const cur = out[id] ?? (out[id] = { registrations: 0, first_deposits: 0, qualified_cpa: 0 });
    cur.registrations += numOf(row?.registrations);
    cur.first_deposits += numOf(row?.first_deposits);
    cur.qualified_cpa += numOf(row?.qualified_cpa);
  };
  for (const r of Array.isArray(parts?.otg) ? parts!.otg : []) {
    add(String(r?.affiliate_id ?? r?.id ?? ''), r);
  }
  for (const r of Array.isArray(parts?.manual) ? parts!.manual : []) {
    if (r?.affiliateId == null) continue;
    add(String(r.affiliateId), r);
  }
  return out;
}

export interface RateDraft {
  cpaValue: string;
  revPercentage: string;
}

export const EMPTY_RATE_DRAFT: RateDraft = { cpaValue: '', revPercentage: '' };

/**
 * Valor inicial dos campos: o override da casa quando existe, VAZIO quando não.
 *
 * Ausência ≠ R$ 0. Pré-preencher com a taxa de topo (ou com 0) faria o gerente
 * salvar sem perceber uma taxa que ele nunca digitou para aquela casa — que era
 * exatamente o efeito colateral do editor de topo que este gesto substitui.
 */
export function houseRateDraft(
  config: AffiliateConfig | null | undefined,
  brandKey: string | null | undefined,
): RateDraft {
  const key = String(brandKey ?? '').trim();
  const entry = key ? (config as any)?.byBrand?.[key] : null;
  const show = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  return { cpaValue: show(entry?.cpaValue), revPercentage: show(entry?.revPercentage) };
}

/**
 * Falta preencher CPA ou REV? A gravação por casa é um PAR: o campo em branco
 * viraria 0 no `byBrand`, e `rateStatus` leria esse 0 como "taxa configurada" —
 * o zero enganoso que `buildBrandConfigTopPayload` evita do lado do admin. Exigir
 * os dois faz o zero ser sempre um zero DIGITADO, e mantém o teto do gerente
 * valendo sobre as duas pontas (um REV deixado em branco herdaria o contrato do
 * afiliado e poderia passar da taxa do gerente sem ninguém ver).
 */
export function isIncompleteRateDraft(draft: RateDraft | null | undefined): boolean {
  return String(draft?.cpaValue ?? '').trim() === '' || String(draft?.revPercentage ?? '').trim() === '';
}
