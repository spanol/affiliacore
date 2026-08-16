// Ponte PURA entre o registro de afiliado especial (`special_affiliates`) e a
// ÁRVORE de rede (`affiliate_uplines`) — sem Firebase, importável pelo client E
// pelo server.ts.
//
// POR QUE EXISTE: a migração da Infinity levou as 141 arestas da estrutura para
// `affiliate_uplines`, mas a tela de equipe do afiliado (`/network`) é liberada por
// `special_affiliates` — que ficou VAZIA. Resultado medido em 2026-07-30: os 19
// topos de estrutura logavam e não viam equipe nenhuma. Ver §8 do
// MIGRACAO-INFINITY-LEGADO.md e §9 do REDE-AFILIADOS.md.
//
// DESENHO: o registro do especial ganha `fromNetwork: true` e para de guardar
// hierarquia — `subAffiliateIds` passa a ser DERIVADO da subárvore, resolvido no
// SERVIDOR a cada leitura. Isso mata a alternativa óbvia (congelar a lista no doc),
// que rotaria em silêncio a cada aresta nova.
//
// ⚠️ SEPARAÇÃO VISÃO × DINHEIRO. A lista derivada tem N níveis (o gerente enxerga
// a equipe inteira, que é o que ele espera), mas quem pode ter a TAXA definida por
// ele continua sendo só o filho DIRETO (`isDirectDownline`) — senão o gerente do
// topo mexeria no repasse de um neto e mudaria, sem avisar, o spread do gerente do
// meio. Cascata preservada.
//
// ⚠️ UM ESPECIAL `fromNetwork` NÃO É FONTE DE HIERARQUIA. A árvore é. Por isso
// `uplineMapFromSpecials` e `buildSubToSpecialConfig` PULAM esses registros: se a
// lista derivada (N níveis) voltasse a virar aresta, ela achataria a estrutura
// (neto → gerente do topo) e mudaria o custo da agência. `buildRootConfigMap`, que
// sai da árvore de verdade, já cobre todo mundo que está nela.

import {
  buildNetworkNodes,
  buildNetworkTree,
  descendantsOf,
  type NetworkTree,
  type SpecialLike,
  type UplineMap,
} from './network';

export interface SpecialRecord extends SpecialLike {
  // Quando true, `subAffiliateIds` é derivado da árvore e o doc não guarda lista.
  fromNetwork?: boolean;
}

export function isNetworkDerived(record?: SpecialRecord | null): boolean {
  return record?.fromNetwork === true;
}

// Só os registros que AINDA são fonte de hierarquia (modelo antigo de 2 níveis).
// O `fromNetwork` sai porque a hierarquia dele já está em `affiliate_uplines`.
export function hierarchySpecials<T extends SpecialRecord>(
  specials?: Record<string, T> | null
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, s] of Object.entries(specials || {})) {
    if (!s || isNetworkDerived(s)) continue;
    out[key] = s;
  }
  return out;
}

export interface ScopeTreeInput {
  uplines?: UplineMap | null;
  specials?: Record<string, SpecialRecord> | null;
  ids?: string[];
}

// Árvore usada para resolver ESCOPO/PERMISSÃO — de propósito SEM o predicado de
// elegibilidade por taxa (`isEligibleUpline`), que existe para não cobrar da
// agência um upline sem taxa. Amarrar permissão a isso faria um gerente perder a
// visão da própria equipe porque um intermediário está sem CPA configurado.
export function buildScopeTree(input: ScopeTreeInput): NetworkTree {
  return buildNetworkTree(
    buildNetworkNodes({
      ids: input.ids ?? [],
      // Retrocompat: o especial de 2 níveis que ainda guarda lista segue valendo
      // como aresta; a aresta explícita de affiliate_uplines vence (buildNetworkNodes).
      specials: hierarchySpecials(input.specials),
      uplines: input.uplines ?? null,
    })
  );
}

// A sub-rede EFETIVA do especial: derivada da árvore quando `fromNetwork`, senão a
// lista gravada no doc (modelo antigo). Nunca inclui o próprio id.
export function resolveSpecialSubIds(
  affiliateId: string,
  record: SpecialRecord | null | undefined,
  ctx: ScopeTreeInput
): string[] {
  const own = String(affiliateId || '');
  if (!own || !record) return [];
  if (!isNetworkDerived(record)) {
    return (Array.isArray(record.subAffiliateIds) ? record.subAffiliateIds : [])
      .map((s) => String(s))
      .filter((s) => s && s !== own);
  }
  const tree = buildScopeTree({ ...ctx, ids: [...(ctx.ids ?? []), own] });
  return descendantsOf(tree, own).filter((s) => s !== own);
}

// Os filhos DIRETOS — o subconjunto da sub-rede cuja taxa o especial pode definir.
// Serve à TELA (desabilitar o campo de quem ele não repassa) com a MESMA regra que
// o servidor aplica em `isDirectDownline`; sem isso a página ofereceria um input
// que o POST recusa com 403.
export function resolveDirectSubIds(
  affiliateId: string,
  record: SpecialRecord | null | undefined,
  ctx: ScopeTreeInput
): string[] {
  const own = String(affiliateId || '');
  if (!own || !record) return [];
  const subs = resolveSpecialSubIds(own, record, ctx);
  if (!isNetworkDerived(record)) return subs; // modelo antigo: a lista JÁ é 1 nível
  const tree = buildScopeTree({ ...ctx, ids: [...(ctx.ids ?? []), own] });
  return subs.filter((s) => tree.uplineOf[s] === own);
}

// `subId` é filho DIRETO de `callerId` na árvore? É a barreira da ESCRITA de taxa
// (POST /api/special/sub-config), separada da barreira de LEITURA (a subárvore
// inteira). Para o especial de 2 níveis do modelo antigo a resposta é a mesma —
// `subAffiliateIds` vira aresta direta em `buildNetworkNodes` —, então ligar esta
// checagem é regressão-zero para quem já existia.
export function isDirectDownline(
  subId: string,
  callerId: string,
  ctx: ScopeTreeInput
): boolean {
  const sub = String(subId || '');
  const caller = String(callerId || '');
  if (!sub || !caller || sub === caller) return false;
  const tree = buildScopeTree({ ...ctx, ids: [...(ctx.ids ?? []), sub, caller] });
  return tree.uplineOf[sub] === caller;
}

// O mesmo laço pelo outro lado: `isDirectDownline` pergunta "é filho de fulano?",
// este pergunta "filho de QUEM?". Devolve null para quem está no topo da estrutura.
// Existe para ROTEAR: num acordo gerenciado a solicitação do afiliado tem que cair
// na fila de um gerente específico, e sem upline ela cairia na de ninguém.
export function resolveDirectUpline(subId: string, ctx: ScopeTreeInput): string | null {
  const sub = String(subId || '');
  if (!sub) return null;
  const tree = buildScopeTree({ ...ctx, ids: [...(ctx.ids ?? []), sub] });
  return tree.uplineOf[sub] ?? null;
}
