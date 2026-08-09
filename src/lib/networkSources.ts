// De QUAIS CASAS vêm os números da /rede — e como olhar só uma.
//
// A rede mistura duas bases de propósito (OTG + casas manuais) e a tela só
// mostrava o total somado: não dava p/ saber se o "custo da agência" era de uma
// casa ou de cinco, nem isolar uma. Aqui a linha de produção passa a CARREGAR a
// casa de origem, o que permite (a) listar as fontes do período e (b) filtrar.
//
// Atribuição casa→linha, a MESMA do /admin (modelo "1 afiliado → 1 casa"):
//   · OTG    → a casa do AFILIADO (campo `brand` do mirror; groupBy=affiliate não
//              quebra por casa, então é o afiliado que carrega a marca);
//   · manual → a casa da LINHA (`houseSlug` de house_results).
// Núcleo puro, sem Firebase — o caller injeta os resolvedores.
import { NetworkRow } from './network';
import { StoredManualRow } from './houseResults';
import { ALL_BRANDS } from './brand';

// Casa não identificada (afiliado sem `brand` no mirror). Fica num balde próprio
// em vez de sumir: produção órfã é justamente o que o admin precisa enxergar.
export const HOUSE_UNKNOWN = '';

export interface HouseRef {
  name: string;      // nome exibível da casa
  brandId?: string;  // chave do byBrand (brandId da OTG ou o slug) — seleciona a taxa POR CASA
}

export type SourceOrigin = 'otg' | 'manual';

export interface NetworkSourceRow extends NetworkRow {
  house: string;        // nome da casa ('' = não identificada)
  origin: SourceOrigin; // de onde o dado veio (API da OTG ou planilha/pull da casa)
}

export interface NetworkSource {
  house: string;
  affiliates: number;       // afiliados COM produção nesta casa no período
  qualified_cpa: number;
  rvs: number;
  origin: SourceOrigin | 'ambas';
}

// Linhas de produção da rede com a casa de origem anexada. `brandId` sai do MESMO
// resolvedor que o /admin usa: sem ele, quem só tem taxa POR CASA (byBrand) seria
// pago pela taxa de topo — divergindo do lucro do /admin sobre a mesma produção.
export function buildNetworkSourceRows(opts: {
  results: any[];
  manualRows: StoredManualRow[];
  otgHouseOf: (affiliateId: string) => HouseRef | null;
  manualHouseOf: (houseSlug: string) => HouseRef | null;
}): NetworkSourceRow[] {
  const out: NetworkSourceRow[] = [];
  for (const r of Array.isArray(opts.results) ? opts.results : []) {
    const id = String(r?.affiliate_id ?? r?.id ?? '');
    if (!id) continue;
    const house = opts.otgHouseOf(id);
    out.push({
      affiliateId: id,
      brandId: house?.brandId,
      house: house?.name || HOUSE_UNKNOWN,
      origin: 'otg',
      qualified_cpa: r?.qualified_cpa,
      rvs: r?.rvs,
    });
  }
  for (const r of Array.isArray(opts.manualRows) ? opts.manualRows : []) {
    // Linha AGREGADA da casa (affiliateId null) não entra: a rede é por afiliado.
    if (!r || r.affiliateId === null || r.affiliateId === undefined) continue;
    const house = opts.manualHouseOf(r.houseSlug);
    out.push({
      affiliateId: String(r.affiliateId),
      brandId: house?.brandId ?? r.houseSlug,
      house: house?.name || r.houseSlug || HOUSE_UNKNOWN,
      origin: 'manual',
      qualified_cpa: r.qualified_cpa,
      rvs: r.rvs,
    });
  }
  return out;
}

// Fontes do período: uma entrada por casa que PRODUZIU, ordenada por volume. É o
// que a tela lista p/ tornar explícito de onde vieram os números.
export function summarizeNetworkSources(rows: NetworkSourceRow[]): NetworkSource[] {
  const acc = new Map<string, NetworkSource & { ids: Set<string> }>();
  for (const r of Array.isArray(rows) ? rows : []) {
    const key = r?.house ?? HOUSE_UNKNOWN;
    let e = acc.get(key);
    if (!e) {
      e = { house: key, affiliates: 0, qualified_cpa: 0, rvs: 0, origin: r.origin, ids: new Set() };
      acc.set(key, e);
    }
    // Mesma casa alimentada pelas DUAS bases (ex.: migração em curso) é sinal, não
    // detalhe: o admin precisa saber que metade do número veio de planilha.
    if (e.origin !== r.origin) e.origin = 'ambas';
    e.ids.add(String(r.affiliateId));
    e.qualified_cpa += toNum(r.qualified_cpa);
    e.rvs += toNum(r.rvs);
  }
  return [...acc.values()]
    .map(({ ids, ...s }) => ({ ...s, affiliates: ids.size }))
    .sort((a, b) => b.rvs + b.qualified_cpa - (a.rvs + a.qualified_cpa)
      || a.house.localeCompare(b.house, 'pt-BR'));
}

// Recorta as linhas por casa. `ALL_BRANDS` (ou vazio) devolve tudo — o filtro NÃO
// mexe na árvore, só na produção: a estrutura de uplines é a mesma, o dinheiro é
// que passa a ser o daquela casa.
export function filterRowsByHouse(rows: NetworkSourceRow[], house: string): NetworkSourceRow[] {
  const list = Array.isArray(rows) ? rows : [];
  if (!house || house === ALL_BRANDS) return list;
  return list.filter((r) => (r?.house ?? HOUSE_UNKNOWN) === house);
}

// Coerção local (o núcleo de dinheiro guarda de novo em num(); aqui é só p/ somar
// o volume exibido, sem propagar NaN a partir de string/objeto da API).
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
