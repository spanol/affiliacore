// Núcleo PURO da comissão do GERENTE separada em PRÓPRIA × REDE — sem Firebase,
// sem React. Nasceu da call com o Jotta (27/08/2026), que apontou o card
// "Comissão total" do /network somando, sem rótulo, o que o gerente produziu com
// o que a rede dele produziu: R$ 250 dele + R$ 280 da rede viravam um R$ 530 que
// ele lia como saldo a receber. Não era: dos R$ 530, R$ 180 são repasse aos subs.
//
// POR QUE UMA FONTE SÓ: a página derivava esse mesmo dinheiro em TRÊS lugares
// (`scopedParts` p/ os cards, `comissaoTotalRede` p/ a legenda, `earnings` p/ o
// lucro líquido) e só o primeiro enxergava o filtro de casa. Filtrando uma casa,
// o lucro líquido ficava MAIOR que a comissão total logo acima dele, e a legenda
// exibia um segundo "Comissão total" com outro valor na mesma tela. Com todos os
// números saindo daqui, escopar por casa é escopar TUDO junto — não há como um
// card reescopar e o outro não.
//
// A fórmula continua vindo só de `perHousePayout` → `calcAffiliatePayout` (fonte
// única). Aqui não se multiplica nada: só se escolhe QUAIS linhas entram e a QUAL
// taxa cada uma é lida.

import {
  buildPerHousePayout,
  type HouseMetricRow,
  type PayoutParts,
} from './perHousePayout';
import type { AffiliateConfig } from './commission';

const ZERO: PayoutParts = { total: 0, cpa: 0, rev: 0 };
const add = (a: PayoutParts, b: PayoutParts): PayoutParts => ({
  total: a.total + b.total,
  cpa: a.cpa + b.cpa,
  rev: a.rev + b.rev,
});

export interface SpecialCommissionSplit {
  /** Produção do PRÓPRIO gerente, à taxa dele. */
  propria: PayoutParts;
  /** Produção dos subs, lida à taxa do GERENTE (o que a rede gerou para ele). */
  rede: PayoutParts;
  /** propria + rede. É o antigo card "Comissão total" — agora rotulado como rede. */
  total: PayoutParts;
  /** O que os subs recebem: a produção deles à taxa DELES. */
  repasse: number;
  /** O que sobra para o gerente: total − repasse (= produção própria + spread). */
  lucro: number;
}

export interface SpecialCommissionInput {
  /** Linhas OTG (agregado por afiliado) — a casa vem do mirror, via `brandIdOf`. */
  otg: any[] | null | undefined;
  /** Linhas MANUAIS (house_results) — a casa vem de `houseSlug`, linha a linha. */
  manual: HouseMetricRow[] | null | undefined;
  ownId: string;
  subIds: string[] | null | undefined;
  /** Taxa própria do gerente (a que o master configurou para ele). */
  ownConfig: AffiliateConfig | null | undefined;
  /** Taxa de cada sub (a que o gerente definiu). Ausência ≠ R$ 0: ver abaixo. */
  configs: Record<string, AffiliateConfig> | null | undefined;
  /** afiliado → brandId do mirror. Só a parte OTG depende dela. */
  brandIdOf: (id: string) => string | undefined;
  /** Chave da casa a isolar. `undefined` = todas as casas. */
  houseKey?: string;
}

const rowAffiliateId = (r: any): string => String(r?.affiliate_id ?? r?.id ?? '');

/**
 * Recorta as linhas de UMA casa.
 *
 * OTG: o agregado do afiliado pertence à casa do mirror (modelo "1 afiliado → 1
 * casa"), então a linha inteira entra ou fica de fora. MANUAL: cada linha carrega
 * a própria casa em `houseSlug`, então o corte é linha a linha — é o que impede
 * de cobrar uma conversão da Esportiva à taxa da Super Bet (bug do R$ 280).
 */
function scopeToHouse(
  otg: any[] | null | undefined,
  manual: HouseMetricRow[] | null | undefined,
  brandIdOf: (id: string) => string | undefined,
  houseKey?: string,
): { otg: any[]; manual: HouseMetricRow[] } {
  const otgRows = Array.isArray(otg) ? otg : [];
  const manualRows = Array.isArray(manual) ? manual : [];
  if (!houseKey) return { otg: otgRows, manual: manualRows };
  return {
    otg: otgRows.filter((r) => String(brandIdOf(rowAffiliateId(r)) ?? '') === houseKey),
    manual: manualRows.filter((r) => String(r?.houseSlug ?? '').trim() === houseKey),
  };
}

/**
 * A comissão do gerente aberta em própria × rede, opcionalmente numa casa só.
 *
 * Somar por casa fecha com "todas as casas" porque cada linha tem UMA casa e
 * `calcAffiliatePayout` é LINEAR nas métricas — o mesmo argumento do
 * `perHousePayout`. A única linha que não entra em casa nenhuma é a OTG de
 * afiliado sem casa no mirror, que também não entra em "todas" com taxa de casa.
 *
 * `subIds` é a subárvore INTEIRA (o servidor já a deriva para o gerente de modo
 * automático), e o próprio gerente é descartado dela: contá-lo dos dois lados
 * dobraria a produção dele no total.
 *
 * Sub sem config NÃO vira repasse zero por conta própria: `breakdownFor` com
 * config ausente devolve o que `resolveBrandRates` resolver (0 quando não há taxa
 * nenhuma), e é assim que o lucro do gerente já era calculado. Ausência ≠ R$ 0
 * continua sendo decisão de EXIBIÇÃO, de quem chama — aqui só se soma dinheiro.
 */
export function splitSpecialCommission(input: SpecialCommissionInput): SpecialCommissionSplit {
  const ownId = String(input?.ownId ?? '');
  const subs = (Array.isArray(input?.subIds) ? input.subIds : [])
    .map(String)
    .filter((id) => id && id !== ownId);

  const scoped = scopeToHouse(input?.otg, input?.manual, input.brandIdOf, input?.houseKey);
  const payoutOf = buildPerHousePayout(scoped.otg, scoped.manual, input.brandIdOf);

  const ownConfig = input?.ownConfig ?? null;
  const configs = input?.configs ?? {};

  const propria = ownId ? payoutOf.breakdownFor(ownId, ownConfig) : ZERO;

  let rede = ZERO;
  let repasse = 0;
  for (const id of subs) {
    rede = add(rede, payoutOf.breakdownFor(id, ownConfig));
    repasse += payoutOf.breakdownFor(id, configs[id] ?? null).total;
  }

  const total = add(propria, rede);
  return { propria, rede, total, repasse, lucro: total.total - repasse };
}

export interface HouseSplitRow {
  key: string;
  name: string;
  split: SpecialCommissionSplit;
}

/**
 * O mesmo recorte, casa a casa — a visão "por casa" do painel do gerente.
 *
 * Sai daqui, e não de uma segunda conta sobre as linhas por marca, justamente
 * para o detalhamento não poder divergir dos cards de resumo: é a MESMA função,
 * chamada uma vez por casa.
 *
 * Ordena pelo que o gerente RECEBE de cada casa (`lucro`), que é o número que a
 * tela destaca; ordenar pelo bruto colocaria no topo a casa onde ele mais repassa.
 * Já o corte é pela PRODUÇÃO: casa em que a rede produziu e a margem dele saiu
 * zero continua na lista, porque o movimento existiu e ele precisa vê-lo. Só some
 * a casa sem número nenhum, que não informa nada e afasta o que informa.
 */
export function splitSpecialCommissionByHouse(
  input: Omit<SpecialCommissionInput, 'houseKey'>,
  houses: Array<{ key: string; name: string }> | null | undefined,
): HouseSplitRow[] {
  return (Array.isArray(houses) ? houses : [])
    .map(({ key, name }) => ({ key, name, split: splitSpecialCommission({ ...input, houseKey: key }) }))
    .filter((row) => row.split.total.total !== 0)
    .sort((a, b) => b.split.lucro - a.split.lucro);
}
