// Série DIÁRIA do afiliado com a comissão DELE — nunca o `total_commission` cru.
//
// POR QUE EXISTE (caça de bugs 26/08/2026, achado ALTA confirmado): o card
// "Evolução Diária" do painel do afiliado (ClientDashboard e /afiliados/:id, que
// é a home do afiliado comum) passava `dailyResults` cru ao gráfico, e o chart
// plota `total_commission` com o rótulo "Comissão". Só que `total_commission` é a
// receita da CASA/agência (doutrina do exportExtract.ts: "NUNCA o cru — é receita
// da CASA"). Na Infinity: afiliado com CPA de R$ 110 via o card do topo dizer
// R$ 110 e o gráfico logo abaixo dizer R$ 280 — número errado na MESMA tela e a
// margem da agência derivável por subtração. O painel do especial já fazia o
// certo (buildSpecialDailySeries); as duas views do afiliado tinham ficado de fora.
//
// LIMITAÇÃO DECLARADA (mesma do extrato CSV, §13 do BACKLOG): a linha diária não
// carrega casa, então a taxa aplicada é a de TOPO do contrato. Afiliado só-byBrand
// vê R$ 0 no gráfico — errado para menos, que é o lado seguro; o conserto
// definitivo é a leitura dia×casa.

import { calcAffiliatePayout, type AffiliateConfig } from './commission';

/**
 * Reprecifica cada dia pela fonte única de dinheiro (`calcAffiliatePayout`),
 * preservando as demais métricas do row (o gráfico também plota cadastros/FTDs).
 */
export function buildAffiliateDailySeries(
  dailyResults: any[] | null | undefined,
  config?: AffiliateConfig | null,
): any[] {
  return (Array.isArray(dailyResults) ? dailyResults : []).map((r) => ({
    ...r,
    total_commission: calcAffiliatePayout(r, config),
  }));
}
