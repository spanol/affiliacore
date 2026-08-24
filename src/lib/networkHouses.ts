// Casas ATIVAS para o gerente — núcleo PURO (sem Firebase, sem React).
//
// POR QUÊ (pedido Infinity, 24/08/2026): as telas do gerente listavam TODA casa
// ativa do backoffice. Numa instância com 15 casas cadastradas e 7 operadas por
// ele, o painel da rede virava uma coluna de "R$ 0,00" e o seletor de casa de
// "Meus afiliados" pedia pra rolar até achar a casa certa. Poluição pura: casa
// que ele não opera não tem número pra mostrar nem taxa pra ele definir.
//
// A REGRA. Casa é "dele" quando a REDE (ele + subs) tem link de divulgação ativo
// nela, OU quando a rede produziu nela no período. As duas pontas juntas, nunca
// só uma:
//   • só link → esconderia casa em que um sub produziu por apelido de tag, sem
//     link emitido (a Infinity tem exatamente esse caso na Esportiva);
//   • só produção → esconderia a casa recém-liberada pra ele, e ele perderia o
//     seletor justamente pra precificar o sub ANTES da 1ª conversão.
//
// INVARIANTE: nenhum card com número desaparece. O filtro de linhas guarda isso
// duas vezes — pela chave (casa da rede) e pela própria linha (`hasProduction`),
// então uma casa que veio com dinheiro passa mesmo que a chave escape do casamento.
//
// FAIL-OPEN: conjunto de casas vazio (gerente novo, sem link e sem produção) NÃO
// esvazia a tela — devolve tudo. Um seletor vazio em "Meus afiliados" seria pior
// que a poluição: sem casa selecionada não existe gesto de comissão nenhum.
//
// As chaves são as MESMAS de `houseRateKey`/`dealBrandKey`: brandId da OTG quando
// existe, senão o slug da casa. Ver src/lib/subHouseRates.ts.

import type { HouseOption } from './subHouseRates';
import type { HouseMetricRow } from './perHousePayout';

/** Link de divulgação como as telas do gerente o recebem (`affiliate_links`). */
export interface NetworkLinkLike {
  affiliateId?: string | null;
  brandId?: string | null;
  active?: boolean;
}

export interface NetworkResultParts {
  otg: any[];
  manual: HouseMetricRow[];
}

// Métricas que contam como "a casa produziu". Contagem e dinheiro juntos: uma
// casa com cadastro e nenhum FTD ainda é uma casa em que a rede está operando.
const PRODUCTION_KEYS = [
  'registrations',
  'first_deposits',
  'qualified_cpa',
  'rvs',
  'deposit',
  'total_commission',
] as const;

const numOf = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** A linha traz alguma métrica diferente de zero? */
export function hasProduction(row: unknown): boolean {
  const r = (row ?? {}) as Record<string, unknown>;
  return PRODUCTION_KEYS.some((k) => numOf(r[k]) !== 0);
}

/**
 * Recorta os links aos donos informados. `fetchAffiliateLinks` devolve o que o
 * PAPEL alcança (admin = todos; gerente = own + subs; afiliado = só os dele), e
 * uma tela de UM afiliado tem que recortar de novo — senão a página de um sub
 * aberta pelo admin acenderia a casa por causa do link de OUTRA pessoa.
 */
export function linksOfAffiliates(
  links: NetworkLinkLike[] | null | undefined,
  ids: Iterable<string> | null | undefined,
): NetworkLinkLike[] {
  const wanted = new Set<string>();
  for (const id of ids ?? []) {
    const k = String(id ?? '').trim();
    if (k) wanted.add(k);
  }
  if (wanted.size === 0) return [];
  return (Array.isArray(links) ? links : []).filter((l) => wanted.has(String(l?.affiliateId ?? '').trim()));
}

/**
 * Casas em que a rede do gerente está ativa: link de divulgação ATIVO (dele ou
 * de um sub) + casa com produção no período.
 *
 * `brandIdOf` resolve a casa da parte OTG (o agregado por afiliado da API externa
 * não quebra por casa — a casa é a do mirror, mesma atribuição do /admin); a parte
 * manual carrega a casa em cada linha (`houseSlug`).
 *
 * Link do POOL (sem `affiliateId`) não conta: é link em espera, ainda de ninguém.
 */
export function networkHouseKeys(
  links: NetworkLinkLike[] | null | undefined,
  parts: NetworkResultParts | null | undefined,
  brandIdOf: (affiliateId: string) => string | undefined,
): Set<string> {
  const keys = new Set<string>();
  const add = (v: unknown) => {
    const k = String(v ?? '').trim();
    if (k) keys.add(k);
  };

  for (const l of Array.isArray(links) ? links : []) {
    if (!l || l.active === false) continue;
    if (!String(l.affiliateId ?? '').trim()) continue;
    add(l.brandId);
  }

  for (const r of Array.isArray(parts?.otg) ? parts!.otg : []) {
    if (!hasProduction(r)) continue;
    add(brandIdOf(String((r as any)?.affiliate_id ?? (r as any)?.id ?? '')));
  }

  for (const r of Array.isArray(parts?.manual) ? parts!.manual : []) {
    if (!hasProduction(r)) continue;
    add(r?.houseSlug);
  }

  return keys;
}

/**
 * Recorta o seletor de casas do gerente às casas da rede dele. Conjunto vazio →
 * devolve tudo (fail-open, ver o cabeçalho).
 */
export function filterHouseOptions(
  options: HouseOption[] | null | undefined,
  keys: Set<string> | null | undefined,
): HouseOption[] {
  const all = Array.isArray(options) ? options : [];
  if (!keys || keys.size === 0) return all;
  const kept = all.filter((o) => keys.has(o.key));
  return kept.length > 0 ? kept : all;
}

/**
 * Recorta as linhas por casa (groupBy=brand) às casas da rede. Linha COM produção
 * passa sempre, esteja a chave no conjunto ou não — é a guarda do invariante
 * "nenhum card com número desaparece".
 *
 * `keyOf` extrai a chave da linha (por padrão o `id`, que é o brandId da OTG ou o
 * slug da casa manual — a mesma chave de `houseRateKey`).
 */
export function filterBrandRows<T>(
  rows: T[] | null | undefined,
  keys: Set<string> | null | undefined,
  keyOf: (row: T) => string = (row) => String((row as any)?.id ?? '').trim(),
): T[] {
  const all = Array.isArray(rows) ? rows : [];
  if (!keys || keys.size === 0) return all;
  const kept = all.filter((r) => keys.has(keyOf(r)) || hasProduction(r));
  return kept.length > 0 ? kept : all;
}
