// Núcleo PURO das opções do filtro de casa do /admin — SEM Firebase, sem React.
//
// POR QUÊ (Infinity, 28/08/2026): o seletor do painel oferecia DUAS casas
// ("Esportiva Bet" e "Super Bet V2") numa instância com 17 casas cadastradas e 6
// produzindo. A lista saía de `uniqueBrands(affiliates)`, ou seja, do campo `brand`
// do mirror de afiliados, que é o modelo "1 afiliado → 1 casa" da OTG. Numa
// instância OTG-free o afiliado nasce sem `brand`: das 19 contas da Infinity só 3
// tinham o campo, sobras da migração do legado. O filtro não listava casas, listava
// a marca que sobrou em três afiliados, e escondia LEON Bet, Winhugo, BacanaPlay,
// Blaze, BetFury e Cristal Poker, todas com produção.
//
// Havia um remendo (`withKnownBrandNames`) que somava as casas do backoffice, mas
// ele lia o cache MUTÁVEL de módulo (`getKnownBrands()`) de dentro de um `useMemo`
// que só dependia de `affiliates`: o React nunca recalculava quando o cache
// chegava. E numa instância OTG-free esse cache, antes de carregar, não é "quase
// certo", é VAZIO — as duas sementes embutidas são `dataSource: 'otg'` e ficam de
// fora. Por isso aqui as casas são PARÂMETRO, não estado global lido pelas costas.

export interface FilterHouseLike {
  name?: string | null;
  active?: boolean;
  dataSource?: 'otg' | 'manual' | null;
}

const brandNameOf = (affiliate: any): string | null => {
  const b = affiliate?.brand ?? affiliate?.marca ?? affiliate?.brand_name;
  if (!b) return null;
  if (typeof b === 'string') return b.trim() || null;
  if (typeof b === 'object') {
    const name = b.name ?? b.nome ?? b.label;
    return typeof name === 'string' ? name.trim() || null : null;
  }
  return null;
};

/**
 * As casas que o filtro do painel oferece, pelo NOME (é o que o `BrandFilter`
 * exibe e a chave que o escopo das linhas manuais casa em `getKnownBrands()`).
 *
 * Duas fontes, unidas:
 *
 *  1. O CADASTRO DE CASAS, que é a fonte de verdade de quais casas existem. Só as
 *     ATIVAS: casa pausada some das visões por casa, mesma regra do resto do app.
 *     Casa `otg` fica de fora quando a instância é OTG-free, senão Superbet e
 *     SportingBet apareceriam fantasma num painel que não fala com a OTG.
 *
 *  2. As marcas do MIRROR de afiliados, por união. É o que a instância OTG usa
 *     hoje, então mantê-la garante regressão zero: lá a casa vem do `brand` do
 *     afiliado e pode nem estar no cadastro.
 *
 * Casa sem nome fica de fora: sem rótulo não há o que selecionar.
 */
export function buildBrandFilterOptions(
  houses: FilterHouseLike[] | null | undefined,
  affiliates: any[] | null | undefined,
  otgEnabled: boolean,
): string[] {
  const set = new Set<string>();

  for (const h of Array.isArray(houses) ? houses : []) {
    if (!h || h.active === false) continue;
    if (!otgEnabled && h.dataSource === 'otg') continue;
    const name = String(h.name ?? '').trim();
    if (name) set.add(name);
  }

  for (const a of Array.isArray(affiliates) ? affiliates : []) {
    const name = brandNameOf(a);
    if (name) set.add(name);
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
