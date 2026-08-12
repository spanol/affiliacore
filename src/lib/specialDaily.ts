// Série diária do painel do ESPECIAL com a linha de PRODUÇÃO PRÓPRIA separada —
// clone do gráfico "minhas comissões" do painel legado da Infinity (call 12/08).
//
// A regra de dinheiro é a MESMA do gráfico atual (nunca reimplementada): comissão
// exibida = calcAffiliatePayout à taxa PRÓPRIA do especial (regra do lucro líquido,
// nunca a comissão bruta da casa). Este módulo só JUNTA as duas séries groupBy=date
// já buscadas — rede (own + subs, escopada pelo proxy) e própria (só o ownId) — e
// carimba `own_commission` por dia para o gráfico desenhar a segunda linha.
//
// ⚠️ Pendência conhecida (fora deste escopo): a série diária precifica à taxa de
// topo do especial, não por casa (perHousePayout) — igual ao comportamento atual.

import { calcAffiliatePayout, type AffiliateConfig } from './commission';

const dateOf = (r: any): string => String(r?.id ?? r?.label ?? '');

/**
 * Mescla rede × própria por dia. Todo dia da rede sai com `own_commission`
 * (0 quando o especial não produziu no dia — aqui zero é zero de verdade: a
 * série própria foi consultada e não tinha linha). Dia que só aparece na série
 * própria (borda defensiva) entra com a produção própria como o total do dia.
 */
export function buildSpecialDailySeries(
  networkDaily: any[] | null | undefined,
  ownDaily: any[] | null | undefined,
  ownConfig: AffiliateConfig | null | undefined,
): any[] {
  const byDate = new Map<string, any>();

  for (const r of Array.isArray(networkDaily) ? networkDaily : []) {
    const d = dateOf(r);
    if (!d) continue;
    byDate.set(d, { ...r, total_commission: calcAffiliatePayout(r, ownConfig) });
  }

  for (const o of Array.isArray(ownDaily) ? ownDaily : []) {
    const d = dateOf(o);
    if (!d) continue;
    const own = calcAffiliatePayout(o, ownConfig);
    const cur = byDate.get(d);
    if (cur) {
      cur.own_commission = own;
    } else {
      byDate.set(d, { ...o, id: d, label: d, total_commission: own, own_commission: own });
    }
  }

  for (const row of byDate.values()) {
    if (row.own_commission === undefined) row.own_commission = 0;
  }
  return [...byDate.values()];
}
