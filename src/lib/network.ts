// Núcleo PURO da REDE DE AFILIADOS (upline / "lucro sobre equipe") — sem Firebase,
// importável pelo client E pelo server.ts (que não pode importar services/*).
//
// POR QUE EXISTE: a plataforma legada da Infinity pagava DUAS coisas por CPA — o
// repasse direto ao afiliado que produziu E o "lucro sobre equipe" do upline (a
// diferença entre a taxa dele e a de quem está abaixo). A AffiliaCore só modelava o
// repasse direto de forma geral (o `subToSpecialConfig` cobre 2 níveis via
// special_affiliates), então o /admin somava a receita menos SÓ o repasse direto e
// superestimava o lucro em exatamente o override (R$ 6.760 de R$ 33.540 na
// migração — 20% do que o cliente paga). Ver REDE-AFILIADOS.md.
//
// MODELO (cascata clássica de MLM, confirmado pelo export do legado, onde
// `Valor bruto = CPAs de estrutura × CPA/Deal atual`, ex.: 59 × 280 = 16.520):
//   recebe(a) = CPAs de TODA a subárvore de `a` × taxa PRÓPRIA de `a`
//   paga(a)   = Σ dos filhos DIRETOS c: recebe(c)
//   ganho(a)  = próprio(a) + Σ_c [ recebe_à_taxa_de_a(c) − recebe(c) ]  ("lucro sobre equipe")
// Telescopando, Σ dos ganhos de todo mundo == Σ sobre os TOPOS de estrutura de
// recebe(topo) — nada some nem se cria no meio da árvore. É essa Σ dos topos que é
// o CUSTO REAL da agência (e, equivalente: o custo por linha é a métrica do
// afiliado × taxa do TOPO da estrutura dele — daí `buildRootConfigMap`).
//
// ⚠️ A fórmula "Σ_{d ∈ downline} cpas(d) × (taxa(a) − taxa(d))" (spread contra a taxa
// do descendente, e não contra a do filho direto) só coincide com esta em redes de
// 2 níveis; a partir de 3 ela NÃO telescopa (double-count do nível do meio).
//
// A multiplicação taxa × métrica NUNCA é reimplementada aqui: tudo passa por
// `calcAffiliatePayout` de lib/commission (fonte única), inclusive o override —
// que é a diferença entre dois `calcAffiliatePayout` sobre as MESMAS métricas.

import {
  AffiliateConfig,
  BrandRates,
  calcAffiliatePayout,
  num,
  rateStatus,
  resolveBrandRates,
} from './commission';

// --- Modelo / ingestão da árvore ---------------------------------------------

// Aresta filho → upline. `uplineId` vazio/nulo = topo de estrutura.
export interface NetworkNodeInput {
  affiliateId: string;
  uplineId?: string | null;
}

// Mapa cru filho → upline (o shape gravado em `affiliate_uplines/{affiliateId}`).
export type UplineMap = Record<string, string | null | undefined>;

export type NetworkDropReason =
  | 'auto-upline'          // o afiliado apontava para si mesmo
  | 'upline-desconhecido'  // o upline não está no roster informado
  | 'upline-inelegivel'    // o upline não tem taxa configurada (ausência ≠ R$ 0)
  | 'ciclo';               // a aresta fechava um ciclo

export interface NetworkDrop {
  affiliateId: string;
  uplineId: string;
  reason: NetworkDropReason;
}

export interface NetworkTree {
  ids: string[];                          // todos os nós conhecidos (ordem de entrada)
  uplineOf: Record<string, string>;       // aresta SANEADA filho → upline
  childrenOf: Record<string, string[]>;   // upline → filhos diretos
  rootOf: Record<string, string>;         // nó → topo da estrutura dele
  depthOf: Record<string, number>;        // 0 = topo
  roots: string[];                        // topos de estrutura
  dropped: NetworkDrop[];                 // arestas descartadas + motivo (p/ a UI avisar)
}

export interface BuildNetworkOptions {
  // Predicado de elegibilidade do UPLINE. Serve à regra "ausência de config ≠ R$ 0":
  // um upline SEM taxa configurada não pode ser cobrado da agência (viraria custo
  // R$ 0 para a estrutura inteira e inflaria o lucro). Nesse caso a aresta cai e o
  // filho vira topo — conservador: a agência paga a taxa própria dele, sem override.
  isEligibleUpline?: (affiliateId: string) => boolean;
}

const emptyTree = (): NetworkTree => ({
  ids: [],
  uplineOf: {},
  childrenOf: {},
  rootOf: {},
  depthOf: {},
  roots: [],
  dropped: [],
});

// Monta a árvore SANEADA a partir das arestas filho→upline. Toda anomalia vira
// aresta descartada + registro em `dropped` (nunca exceção, nunca laço infinito):
// auto-upline, upline fora do roster, upline sem taxa e CICLO. O corte do ciclo é
// determinístico (o membro de menor id vira topo), então dois processos com a mesma
// entrada produzem o mesmo custo.
export function buildNetworkTree(
  nodes: NetworkNodeInput[],
  opts: BuildNetworkOptions = {}
): NetworkTree {
  const tree = emptyTree();
  if (!Array.isArray(nodes)) return tree;

  const seen = new Set<string>();
  const rawUpline: Record<string, string> = {};
  for (const n of nodes) {
    const id = n?.affiliateId != null ? String(n.affiliateId).trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tree.ids.push(id);
    const up = n?.uplineId != null ? String(n.uplineId).trim() : '';
    if (up) rawUpline[id] = up;
  }

  const known = seen;
  for (const id of tree.ids) {
    const up = rawUpline[id];
    if (!up) continue;
    if (up === id) {
      tree.dropped.push({ affiliateId: id, uplineId: up, reason: 'auto-upline' });
      continue;
    }
    if (!known.has(up)) {
      tree.dropped.push({ affiliateId: id, uplineId: up, reason: 'upline-desconhecido' });
      continue;
    }
    if (opts.isEligibleUpline && !opts.isEligibleUpline(up)) {
      tree.dropped.push({ affiliateId: id, uplineId: up, reason: 'upline-inelegivel' });
      continue;
    }
    tree.uplineOf[id] = up;
  }

  // Quebra de ciclos. Grafo funcional (todo nó tem ≤ 1 pai) → cada nó pertence a no
  // máximo um ciclo, então um único passe com marcação em-progresso/pronto acha
  // todos. Cortamos a aresta do MENOR id do ciclo (determinístico).
  const state: Record<string, 1 | 2> = {};
  for (const start of tree.ids) {
    if (state[start]) continue;
    const path: string[] = [];
    let cur: string | undefined = start;
    while (cur && !state[cur]) {
      state[cur] = 1;
      path.push(cur);
      cur = tree.uplineOf[cur];
    }
    if (cur && state[cur] === 1) {
      const cycle = path.slice(path.indexOf(cur));
      const cut = [...cycle].sort()[0];
      tree.dropped.push({ affiliateId: cut, uplineId: tree.uplineOf[cut], reason: 'ciclo' });
      delete tree.uplineOf[cut];
    }
    for (const p of path) state[p] = 2;
  }

  for (const id of tree.ids) {
    const up = tree.uplineOf[id];
    if (!up) {
      tree.roots.push(id);
      continue;
    }
    (tree.childrenOf[up] ?? (tree.childrenOf[up] = [])).push(id);
  }

  // Profundidade + topo por BFS a partir das raízes (a árvore já é acíclica aqui).
  const queue = [...tree.roots];
  for (const r of tree.roots) {
    tree.depthOf[r] = 0;
    tree.rootOf[r] = r;
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const c of tree.childrenOf[id] ?? []) {
      tree.depthOf[c] = (tree.depthOf[id] ?? 0) + 1;
      tree.rootOf[c] = tree.rootOf[id];
      queue.push(c);
    }
  }
  return tree;
}

// Deriva as arestas do modelo ATUAL de especial+sub-rede (`special_affiliates`,
// pai→filhos). É a ponte de retrocompatibilidade: a rede de 2 níveis que já existe
// vira árvore sem migração de dado, e passa a suportar aninhamento (especial de
// especial) — que o `buildSubToSpecialConfig` cobrava errado (usava a taxa do pai
// imediato, não a do topo, subestimando o custo).
export interface SpecialLike {
  affiliateId?: string;
  active?: boolean;
  subAffiliateIds?: unknown[];
}
export function uplineMapFromSpecials(
  specials: Record<string, SpecialLike> | null | undefined,
  opts: { activeOnly?: boolean } = {}
): UplineMap {
  const activeOnly = opts.activeOnly !== false; // default: só especiais ativos
  const map: UplineMap = {};
  for (const [key, s] of Object.entries(specials || {})) {
    if (!s) continue;
    if (activeOnly && s.active !== true) continue;
    const parent = String(s.affiliateId ?? key);
    for (const sub of Array.isArray(s.subAffiliateIds) ? s.subAffiliateIds : []) {
      const sid = String(sub);
      if (sid && sid !== parent) map[sid] = parent;
    }
  }
  return map;
}

// Compõe a lista de nós a partir das fontes de ingestão, em ordem de precedência:
// `uplines` (a aresta explícita de `affiliate_uplines`, que sobrevive ao sync do
// mirror) VENCE o vínculo derivado de `special_affiliates`. `ids` garante que todo
// afiliado do roster esteja na árvore (sem upline = topo de estrutura próprio).
export function buildNetworkNodes(input: {
  ids?: Array<string | { id?: any; _id?: any }>;
  specials?: Record<string, SpecialLike> | null;
  uplines?: UplineMap | null;
  activeSpecialsOnly?: boolean;
}): NetworkNodeInput[] {
  const fromSpecials = uplineMapFromSpecials(input.specials, {
    activeOnly: input.activeSpecialsOnly !== false,
  });
  const explicit = input.uplines || {};
  const merged: UplineMap = { ...fromSpecials };
  for (const [child, up] of Object.entries(explicit)) {
    const c = String(child).trim();
    if (!c) continue;
    const u = up != null ? String(up).trim() : '';
    if (u) merged[c] = u;
    else delete merged[c]; // aresta explicitamente removida ("virou topo")
  }

  const order: string[] = [];
  const seen = new Set<string>();
  const push = (v: any) => {
    const id = typeof v === 'string' ? v.trim() : String(v?.id ?? v?._id ?? '').trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  };
  for (const v of input.ids || []) push(v);
  for (const child of Object.keys(merged)) push(child);
  for (const up of Object.values(merged)) push(up);

  return order.map((id) => ({ affiliateId: id, uplineId: merged[id] ?? null }));
}

// --- "Limite de repasse" (teto do upline) ------------------------------------

// Teto que um upline pode conceder a um downline = a taxa PRÓPRIA dele (por casa,
// quando há override). Fonte única da regra que o legado chamava de "Limite de
// repasse" e que a rota /api/special/sub-config já aplicava inline.
export function resolveRepasseCap(uplineConfig?: AffiliateConfig | null, brandId?: string): BrandRates {
  return resolveBrandRates(uplineConfig, brandId);
}

// O par de taxas do downline estoura o teto do upline? (spread negativo garantido).
export function exceedsRepasseCap(rates: Partial<BrandRates>, cap: BrandRates): boolean {
  return num(rates?.cpaValue) > cap.cpaValue || num(rates?.revPercentage) > cap.revPercentage;
}

// Um afiliado só pode ser UPLINE (ser cobrado da agência pela rede) se tiver taxa
// configurada. `rateStatus` distingue "0 configurado" de "ausente" — usar
// `cpaValue || 0` aqui criaria uma estrutura de custo R$ 0 e inflaria o lucro.
export function hasConfiguredRate(config?: AffiliateConfig | null, brandId?: string): boolean {
  const s = rateStatus(config, brandId);
  return s.cpaConfigured || s.revConfigured;
}

export function buildEligibleUpline(
  configs: Record<string, AffiliateConfig | undefined>,
  brandIdOf?: (affiliateId: string) => string | undefined
): (affiliateId: string) => boolean {
  return (id: string) => hasConfiguredRate(configs?.[id], brandIdOf?.(id));
}

// --- Cálculo em cascata -------------------------------------------------------

// Linha de produção já atribuída a um afiliado e a uma casa. Cobre tanto o
// `results` da OTG (groupBy=affiliate) quanto `house_results` (manual) — o caller
// resolve o `brandId` do MESMO jeito que o /admin (houseOf / slug da casa).
export interface NetworkRow {
  affiliateId: string;
  brandId?: string;
  qualified_cpa?: any;
  rvs?: any;
}

export type NetworkAnomalyKind = 'spread-negativo' | 'sem-taxa';

export interface NetworkAnomaly {
  kind: NetworkAnomalyKind;
  affiliateId: string;      // quem sofre (upline no spread negativo; o próprio no sem-taxa)
  uplineId?: string;        // no spread negativo: o downline que estoura o teto
  amount?: number;          // valor negativo do spread (R$)
}

export interface NetworkAffiliatePayout {
  affiliateId: string;
  own: number;       // repasse pelas métricas PRÓPRIAS, à taxa própria
  team: number;      // "lucro sobre equipe" (override em cascata); pode ser negativo
  total: number;     // own + team = o que ESTE afiliado leva pra casa
  received: number;  // subárvore × taxa própria (o que o upline lhe paga)
  paid: number;      // Σ recebe(filho direto) — o que ele repassa
  isRoot: boolean;
}

export interface NetworkPayoutResult {
  byAffiliate: Record<string, NetworkAffiliatePayout>;
  directTotal: number;    // Σ own — o repasse direto
  overrideTotal: number;  // Σ team — o "lucro sobre equipe" de toda a rede
  agencyCost: number;     // Σ recebe(topo) — o que a agência DE FATO paga
  anomalies: NetworkAnomaly[];
}

interface MetricBucket { qualified_cpa: number; rvs: number }
type BrandMetrics = Record<string, MetricBucket>;
const BRAND_NONE = '';

function bucket(target: BrandMetrics, key: string): MetricBucket {
  return target[key] ?? (target[key] = { qualified_cpa: 0, rvs: 0 });
}

function addRowMetrics(target: BrandMetrics, row: NetworkRow): void {
  const b = bucket(target, row?.brandId ? String(row.brandId) : BRAND_NONE);
  b.qualified_cpa += num(row?.qualified_cpa);
  b.rvs += num(row?.rvs);
}

function mergeMetrics(target: BrandMetrics, src: BrandMetrics): void {
  for (const k of Object.keys(src)) {
    const b = bucket(target, k);
    b.qualified_cpa += src[k].qualified_cpa;
    b.rvs += src[k].rvs;
  }
}

// Repasse de um agregado de métricas a uma dada config. A fórmula segue vindo
// SÓ de `calcAffiliatePayout` — como ela é LINEAR nas métricas, aplicar à soma é
// idêntico a somar linha a linha, e mantém a taxa POR CASA (byBrand) intacta.
function payoutOfMetrics(metrics: BrandMetrics, config?: AffiliateConfig | null): number {
  let total = 0;
  for (const key of Object.keys(metrics)) {
    total += calcAffiliatePayout(metrics[key], config, key || undefined);
  }
  return total;
}

// Núcleo da feature: distribui a produção da rede em repasse direto + override.
//
// INVARIANTE (testado por property): directTotal + overrideTotal === agencyCost.
// O dinheiro não é criado nem destruído no meio da árvore — o que a agência paga é
// exatamente a Σ dos topos de estrutura.
export function calcNetworkPayouts(
  tree: NetworkTree,
  rows: NetworkRow[],
  configs: Record<string, AffiliateConfig | undefined>
): NetworkPayoutResult {
  const ownM: Record<string, BrandMetrics> = {};
  const subM: Record<string, BrandMetrics> = {};
  const extraRoots: string[] = [];
  const ensure = (id: string) => {
    if (!ownM[id]) {
      ownM[id] = {};
      subM[id] = {};
      if (!(id in tree.depthOf)) extraRoots.push(id); // afiliado fora da árvore = topo isolado
    }
  };
  for (const id of tree.ids) ensure(id);
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row?.affiliateId != null ? String(row.affiliateId) : '';
    if (!id) continue;
    ensure(id);
    addRowMetrics(ownM[id], row);
  }

  // Mais fundo primeiro: quando chegamos num nó, os filhos já agregaram a subárvore.
  const allIds = Object.keys(ownM);
  const order = [...allIds].sort((a, b) => (tree.depthOf[b] ?? 0) - (tree.depthOf[a] ?? 0));
  for (const id of order) {
    mergeMetrics(subM[id], ownM[id]);
    for (const c of tree.childrenOf[id] ?? []) mergeMetrics(subM[id], subM[c] ?? {});
  }

  const byAffiliate: Record<string, NetworkAffiliatePayout> = {};
  const anomalies: NetworkAnomaly[] = [];
  const received: Record<string, number> = {};
  for (const id of allIds) received[id] = payoutOfMetrics(subM[id], configs?.[id]);

  let directTotal = 0;
  let overrideTotal = 0;
  for (const id of allIds) {
    const cfg = configs?.[id];
    const own = payoutOfMetrics(ownM[id], cfg);
    let team = 0;
    let paid = 0;
    for (const c of tree.childrenOf[id] ?? []) {
      // O que o filho custaria à taxa do PAI menos o que o pai de fato lhe paga.
      const atParent = payoutOfMetrics(subM[c] ?? {}, cfg);
      const spread = atParent - (received[c] ?? 0);
      team += spread;
      paid += received[c] ?? 0;
      if (spread < 0) {
        anomalies.push({ kind: 'spread-negativo', affiliateId: id, uplineId: c, amount: spread });
      }
    }
    const hasProduction = Object.values(subM[id]).some((m) => m.qualified_cpa !== 0 || m.rvs !== 0);
    if (hasProduction && !hasConfiguredRate(cfg)) {
      anomalies.push({ kind: 'sem-taxa', affiliateId: id });
    }
    byAffiliate[id] = {
      affiliateId: id,
      own,
      team,
      total: own + team,
      received: received[id] ?? 0,
      paid,
      isRoot: !tree.uplineOf[id],
    };
    directTotal += own;
    overrideTotal += team;
  }

  const roots = [...tree.roots, ...extraRoots];
  const agencyCost = roots.reduce((s, r) => s + (received[r] ?? 0), 0);
  return { byAffiliate, directTotal, overrideTotal, agencyCost, anomalies };
}

// Custo da agência por afiliado = métrica dele × taxa do TOPO da estrutura dele
// (é a forma telescopada da cascata). Devolvido como um mapa afiliado→config no
// MESMO shape do `subToSpecialConfig` do /admin, então liga a rede N-níveis nos
// cálculos existentes (calcAgencyNetProfit / calcNetProfitByHouse) sem tocar na
// fórmula deles — e, com isso, o headline e os cards por casa continuam saindo da
// mesma base (invariante "agregado == Σ dos cards").
// Só mapeia quem tem topo DIFERENTE de si e cujo topo tem config (ausência ≠ R$ 0).
export function buildRootConfigMap(
  tree: NetworkTree,
  configs: Record<string, AffiliateConfig | undefined>
): Record<string, AffiliateConfig> {
  const map: Record<string, AffiliateConfig> = {};
  for (const id of tree.ids) {
    const root = tree.rootOf[id];
    if (!root || root === id) continue;
    const cfg = configs?.[root];
    if (!cfg) continue;
    map[id] = cfg;
  }
  return map;
}

// Sub-rede COMPLETA (todos os níveis) de um afiliado — o análogo N-níveis do
// `subAffiliateIds`. Não inclui o próprio id.
export function descendantsOf(tree: NetworkTree, affiliateId: string): string[] {
  const out: string[] = [];
  const queue = [...(tree.childrenOf[String(affiliateId)] ?? [])];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const c of tree.childrenOf[id] ?? []) queue.push(c);
  }
  return out;
}
