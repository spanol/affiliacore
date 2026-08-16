// Núcleo PURO da tela de ACORDOS do admin (/acordos) — SEM Firebase, sem React.
// O que mora aqui é o que a página DECIDE: o rascunho do formulário (ida e volta
// entre o Deal e os campos de texto), quais KPIs o admin edita em cada tipo, o
// badge do card e o recorte das filas de parceria. Regra do repo: lógica testável
// sai do JSX. Ver PLANO-TIPOS-DE-DEAL.md (F3) e dealType.ts.

import {
  DEAL_TYPE_POLICY, resolveDealType,
  type DealTypeId, type DealKpiId,
} from './dealType';
import type { Deal, DealModel, PaymentCycle, DealCurrency } from './deal';
import type { PartnershipRequest, PartnershipStatus } from './partnership';

// Rascunho do modal. Os números viram STRING de propósito: um <input type="number">
// vazio precisa ser distinguível de zero (GGR vazio grava `null`, "a casa não tem
// GGR", e zero seria lido como "tem GGR de 0%").
export interface DealDraft {
  id?: string;
  houseId: string;
  operatorName: string;
  type: DealTypeId;
  model: DealModel;
  cpaValue: string;
  revPercentage: string;
  baseline: string;
  rollover: string;
  ggrPercentage: string;
  cycle: PaymentCycle;
  currency: DealCurrency;
  geo: string;
  active: boolean;
}

// CPA e RevShare do deal são o que a CASA paga à AGÊNCIA. O tipo `gerenciado` os
// esconde do AFILIADO (o servidor corta os campos em sanitizeDealForViewer), o que é
// outra coisa: para o admin eles seguem sempre editáveis, senão o valor que alimenta
// o byBrand na aprovação ficaria sem tela para ser preenchido.
export const ADMIN_ALWAYS_EDITABLE_KPIS: DealKpiId[] = ['cpa', 'revshare'];

// KPIs que o FORMULÁRIO do admin oferece para um tipo: os da política, mais os que o
// admin sempre edita. Sai da política, nunca de uma lista hardcoded na página, para
// um 3º tipo de deal aparecer sozinho.
export function adminDealKpis(type?: DealTypeId | null): DealKpiId[] {
  const policy = DEAL_TYPE_POLICY[resolveDealType(type)];
  const out: DealKpiId[] = [...ADMIN_ALWAYS_EDITABLE_KPIS];
  (policy?.kpis ?? []).forEach((k) => { if (!out.includes(k)) out.push(k); });
  return out;
}

export function adminEditsKpi(type: DealTypeId | null | undefined, kpi: DealKpiId): boolean {
  return adminDealKpis(type).includes(kpi);
}

export function emptyDealDraft(type: DealTypeId = 'direto'): DealDraft {
  return {
    houseId: '', operatorName: '', type: resolveDealType(type), model: 'cpa',
    cpaValue: '', revPercentage: '', baseline: '', rollover: '', ggrPercentage: '',
    cycle: 'mensal', currency: 'BRL', geo: '', active: true,
  };
}

// Zero vira campo VAZIO (e não "0") em todo número: o formulário mostra placeholder
// em vez de um zero que o admin teria que apagar antes de digitar.
const numToField = (v: any) => (v == null || Number(v) === 0 ? '' : String(v));

// O GGR é o ÚNICO campo em que vazio significa `null` ("a casa não tem GGR") em vez
// de zero. Por isso ele não pode usar `numToField`: um GGR gravado como 0% viraria
// campo vazio e, ao salvar de novo, `null` — o formulário apagaria em silêncio uma
// distinção que o resto do módulo faz questão de manter. Só a AUSÊNCIA esvazia.
const ggrToField = (v: any) => (v == null ? '' : String(v));

export function draftFromDeal(deal: Deal): DealDraft {
  return {
    id: deal.id,
    houseId: deal.houseId,
    operatorName: deal.operatorName,
    type: resolveDealType(deal.type),
    model: deal.model,
    cpaValue: numToField(deal.cpaValue),
    revPercentage: numToField(deal.revPercentage),
    baseline: numToField(deal.baseline),
    rollover: numToField(deal.rollover),
    ggrPercentage: ggrToField(deal.ggrPercentage),
    cycle: deal.cycle,
    currency: deal.currency,
    geo: deal.geo,
    active: deal.active,
  };
}

const fieldToNum = (v: string) => Number(String(v ?? '').trim()) || 0;
const isBlank = (v: string) => String(v ?? '').trim() === '';

// Payload de criação/edição. `ggrPercentage` vazio vai como `null` ("a casa não tem
// GGR"), NUNCA como 0: o normalizador do servidor guarda os dois valores e o card
// distingue ausência de zero. Os demais números caem em 0, que é o que o validador
// por modelo/tipo já sabe recusar quando for obrigatório.
export function buildDealPayload(draft: DealDraft): Partial<Deal> {
  return {
    houseId: draft.houseId,
    operatorName: draft.operatorName,
    type: resolveDealType(draft.type),
    model: draft.model,
    cpaValue: fieldToNum(draft.cpaValue),
    revPercentage: fieldToNum(draft.revPercentage),
    baseline: fieldToNum(draft.baseline),
    rollover: fieldToNum(draft.rollover),
    ggrPercentage: isBlank(draft.ggrPercentage) ? null : fieldToNum(draft.ggrPercentage),
    cycle: draft.cycle,
    currency: draft.currency,
    geo: draft.geo,
    active: draft.active,
  };
}

// Badge de tipo no card. `direto` é o default de todo deal antigo (o tipo se resolve
// na leitura, sem migração), então carimbar a lista inteira com "Acordo direto" seria
// ruído: só o que FOGE do default ganha selo.
export function dealTypeBadge(deal?: Pick<Deal, 'type'> | null): string | null {
  const type = resolveDealType(deal?.type);
  return type === 'direto' ? null : (DEAL_TYPE_POLICY[type]?.label ?? null);
}

export interface AdminPartnershipQueues {
  pending: PartnershipRequest[];      // `requested`: esperando a decisão da agência
  awaitingLink: PartnershipRequest[]; // `priced`: o gerente precificou, falta o link
  decided: PartnershipRequest[];      // aprovada/recusada/encerrada
}

// `priced` NÃO é uma parceria decidida: ela ainda espera uma ação do admin (emitir o
// link). Jogá-la no balaio de "decididas" esconderia a fila justamente de quem tem
// que atendê-la, que é o ponto da aba nova.
export function selectAdminPartnershipQueues(requests: PartnershipRequest[]): AdminPartnershipQueues {
  const list = Array.isArray(requests) ? requests : [];
  return {
    pending: list.filter((r) => r?.status === 'requested'),
    awaitingLink: list.filter((r) => r?.status === 'priced'),
    decided: list.filter((r) => r?.status !== 'requested' && r?.status !== 'priced'),
  };
}

// Mensagem do toast depois de decidir. Aprovar a partir de `priced` NÃO reescreve a
// taxa: quem precificou foi o gerente e o servidor preserva o valor dele. Dizer
// "taxa aplicada" ali seria mentira na tela sobre o dinheiro que foi gravado.
export function partnershipDecisionMessage(
  from: PartnershipStatus,
  to: 'approved' | 'rejected' | 'discontinued'
): string {
  if (to === 'rejected') return 'Parceria recusada.';
  if (to === 'discontinued') return 'Parceria encerrada.';
  return from === 'priced'
    ? 'Link emitido. A comissão definida pelo gerente foi mantida.'
    : 'Parceria aprovada. Taxa aplicada e link emitido.';
}
