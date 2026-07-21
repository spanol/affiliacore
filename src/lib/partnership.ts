// Núcleo PURO de PARCERIAS (partnership_requests) — SEM Firebase. Uma parceria liga
// um AFILIADO a um DEAL com um STATUS (solicitada→aprovada/rejeitada/encerrada). É o
// workflow de aprovação do marketplace (padrão Affility). O lado sensível (aplicar a
// taxa no byBrand, emitir o link) fica no server; aqui só o modelo de estados + os
// seletores das telas. Ver PESQUISA-AFFILITY.md e [[deal]].

import { Deal, buildDealLabel } from './deal';

export type PartnershipStatus = 'requested' | 'approved' | 'rejected' | 'discontinued';

export const PARTNERSHIP_STATUSES: PartnershipStatus[] = ['requested', 'approved', 'rejected', 'discontinued'];

export const PARTNERSHIP_STATUS_LABEL: Record<PartnershipStatus, string> = {
  requested: 'Solicitada',
  approved: 'Aprovada',
  rejected: 'Recusada',
  discontinued: 'Encerrada',
};

export interface PartnershipRequest {
  id: string;
  affiliateId: string;
  dealId: string;
  status: PartnershipStatus;
  code?: string | null;        // code do affiliate_links, setado na aprovação
  // denormalizado p/ exibir sem re-join no client:
  operatorName?: string;
  dealLabel?: string;
  houseId?: string;
  requestedAt?: any;
  decidedAt?: any;
}

// Transições válidas do status. Uma solicitação pendente pode ser aprovada ou
// recusada; uma aprovada pode ser encerrada (deal descontinuado). Nada "revive" uma
// recusada/encerrada (o afiliado solicita de novo → nova request). Barra transição
// inválida no server (fonte da regra). Idempotente: mesmo→mesmo é permitido.
export function canTransition(from: PartnershipStatus, to: PartnershipStatus): boolean {
  if (from === to) return true;
  const allowed: Record<PartnershipStatus, PartnershipStatus[]> = {
    requested: ['approved', 'rejected'],
    approved: ['discontinued'],
    rejected: [],
    discontinued: [],
  };
  return (allowed[from] || []).includes(to);
}

// Uma parceria está "viva" (consome a oferta, gera link) quando solicitada ou
// aprovada. Recusada/encerrada libera o deal p/ ser solicitado de novo.
export function isActivePartnership(status: PartnershipStatus): boolean {
  return status === 'requested' || status === 'approved';
}

// OFERTAS DISPONÍVEIS = deals ATIVOS que o afiliado ainda não tem parceria VIVA.
// (uma parceria recusada/encerrada não esconde a oferta — pode pedir de novo).
export function selectAvailableDeals(deals: Deal[], myRequests: PartnershipRequest[]): Deal[] {
  const takenDealIds = new Set(
    (Array.isArray(myRequests) ? myRequests : [])
      .filter((r) => isActivePartnership(r.status))
      .map((r) => String(r.dealId))
  );
  return (Array.isArray(deals) ? deals : []).filter(
    (d) => d && d.active !== false && !takenDealIds.has(String(d.id))
  );
}

// Enriquece as requests com dados do deal (label/operadora) p/ exibição, resolvendo
// pelo mapa de deals. Se o deal sumiu (descontinuado e removido), mantém o
// denormalizado que já veio gravado na request. Nunca lança.
export function joinPartnerships(
  requests: PartnershipRequest[],
  dealsById: Record<string, Deal>
): PartnershipRequest[] {
  const map = dealsById && typeof dealsById === 'object' ? dealsById : {};
  return (Array.isArray(requests) ? requests : []).map((r) => {
    const deal = map[String(r?.dealId)];
    return {
      ...r,
      operatorName: deal?.operatorName ?? r?.operatorName ?? '',
      dealLabel: deal ? buildDealLabel(deal) : (r?.dealLabel ?? ''),
      houseId: deal?.houseId ?? r?.houseId,
    };
  });
}
