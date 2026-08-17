// Núcleo PURO da VITRINE do afiliado (/parcerias) — SEM Firebase, sem React.
// O que mora aqui é o que a Loja de Deals DECIDE: como cada KPI da política vira
// texto no card, quem está precificando a solicitação e o recado que o afiliado lê
// em cada estado. Regra do repo: lógica testável sai do JSX.
// Ver PLANO-TIPOS-DE-DEAL.md (F4), dealType.ts (a política) e dealsAdmin.ts (o lado
// admin da mesma feature).
//
// INVARIANTE que dirige o arquivo inteiro: num acordo cujo tipo esconde as taxas, o
// SERVIDOR remove `cpaValue`/`revPercentage` da resposta (sanitizeDealForViewer). Os
// campos chegam AUSENTES, não zerados, então nada aqui pode assumir número: toda
// formatação devolve `null` quando o valor não veio, e o card simplesmente não
// desenha a linha.

import { num } from './commission';
import { pluralize } from './plural';
import { PAYMENT_CYCLE_LABEL, type Deal } from './deal';
import { DEAL_KPI_LABEL, dealPolicy, visibleKpis, type DealKpiId } from './dealType';
import type { PartnershipRequest, PartnershipStatus } from './partnership';

const brl = (v: any) =>
  `R$ ${num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (v: any) => `${num(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

// Valor de UM KPI já formatado para a tela, ou `null` quando o deal não traz aquele
// valor (campo cortado pelo servidor, zero ou texto vazio). `null` é o sinal de "não
// desenhe" — imprimir "R$ 0,00" num campo ausente reintroduziria o velho
// "ausência ≠ R$ 0" do lado do afiliado.
export function formatDealKpiValue(kpi: DealKpiId, deal?: Deal | null): string | null {
  const positive = (v: any) => (v != null && v !== '' && num(v) > 0 ? num(v) : null);
  switch (kpi) {
    case 'cpa': {
      const v = positive(deal?.cpaValue);
      return v == null ? null : brl(v);
    }
    case 'revshare': {
      const v = positive(deal?.revPercentage);
      return v == null ? null : pct(v);
    }
    case 'baseline': {
      const v = positive(deal?.baseline);
      return v == null ? null : brl(v);
    }
    case 'rollover': {
      const v = positive(deal?.rollover);
      return v == null ? null : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x`;
    }
    case 'ggr': {
      const v = positive(deal?.ggrPercentage);
      return v == null ? null : pct(v);
    }
    // Meta é CONTAGEM, não dinheiro: "5 CPAs", nunca "R$ 5,00". O período fica na
    // linha do Ciclo, ao lado, então repetir "por mês" aqui seria redundância.
    case 'cpaGoal': {
      const v = positive(deal?.minCpaGoal);
      return v == null ? null : pluralize(v, 'CPA');
    }
    case 'cycle': {
      const cycle = deal?.cycle;
      if (!cycle) return null;
      return PAYMENT_CYCLE_LABEL[cycle] ?? String(cycle);
    }
    case 'geo': {
      const geo = String(deal?.geo ?? '').trim();
      return geo || null;
    }
    default:
      return null;
  }
}

export interface DealKpiChip {
  id: DealKpiId;
  label: string;
  value: string;
}

// Chips do card, na ordem da POLÍTICA do deal (nunca de uma lista fixa na página: um
// 3º tipo de deal aparece sozinho). `visibleKpis` já omite KPI sem valor; o filtro do
// fim é o cinto de segurança para o valor que não consegue virar texto.
export function dealKpiChips(deal?: Deal | null): DealKpiChip[] {
  return visibleKpis(deal ?? null)
    .map((id) => ({ id, label: DEAL_KPI_LABEL[id], value: formatDealKpiValue(id, deal) }))
    .filter((c): c is DealKpiChip => c.value != null && c.value !== '');
}

// Linha de ajuda no card de oferta. Só existe quando quem precifica NÃO é a agência:
// no acordo direto os números do card já são o que o afiliado ganha e explicar isso
// seria ruído.
export function dealRequestHint(deal?: Deal | null): string | null {
  return dealPolicy(deal ?? null).pricedBy === 'upline'
    ? 'Sua comissão nesta casa é definida pelo seu gerente.'
    : null;
}

export type PricedBy = 'admin' | 'upline';

// Quem está precificando ESTA solicitação. O servidor é a fonte boa (ele sabe se o
// afiliado tem gerente elegível, via effectivePricedBy) e manda `pricedBy` na
// request; enquanto o campo não vier, a política do deal é a melhor aproximação
// disponível no client. Deal sumido cai em `direto`, ou seja, agência.
export function resolvePartnershipPricedBy(
  request?: (PartnershipRequest & { pricedBy?: unknown }) | null,
  deal?: Deal | null
): PricedBy {
  const raw = String((request as any)?.pricedBy ?? '').trim().toLowerCase();
  if (raw === 'upline' || raw === 'admin') return raw;
  return dealPolicy(deal ?? null).pricedBy;
}

// Recado curto por estado, na voz do AFILIADO. O rótulo do badge
// (partnershipStatusLabel) diz ONDE a solicitação está; esta frase diz o que
// acontece agora e de quem é a vez.
// `linkReady` existe porque uma parceria APROVADA tem dois desfechos na tela: com o
// link resolvido (a casa tem URL de cadastro) ou com o aviso de link em preparação.
// Mandar "use o link abaixo" no segundo caso seria mentira na tela.
export function partnershipNote(
  status: PartnershipStatus,
  pricedBy: PricedBy = 'admin',
  linkReady = false
): string {
  switch (status) {
    case 'requested':
      return pricedBy === 'upline'
        ? 'Seu gerente vai definir a sua comissão nesta casa. Depois disso a agência emite o link.'
        : 'A agência está analisando a sua solicitação.';
    case 'priced':
      return 'Sua comissão já foi definida. Falta a agência emitir o seu link de divulgação.';
    case 'approved':
      return linkReady
        ? 'Parceria aprovada. Copie o link de divulgação abaixo e comece a divulgar.'
        : 'Parceria aprovada. Seu link de divulgação ainda está sendo preparado.';
    case 'rejected':
      return 'Solicitação recusada. Fale com o seu gerente ou com a agência para saber o motivo.';
    case 'discontinued':
      return 'Este acordo foi encerrado pela operadora.';
    default:
      return '';
  }
}
