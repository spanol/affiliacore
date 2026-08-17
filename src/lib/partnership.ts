// Núcleo PURO de PARCERIAS (partnership_requests) — SEM Firebase. Uma parceria liga
// um AFILIADO a um DEAL com um STATUS (solicitada→aprovada/rejeitada/encerrada). É o
// workflow de aprovação do marketplace (padrão Affility). O lado sensível (aplicar a
// taxa no byBrand, emitir o link) fica no server; aqui só o modelo de estados + os
// seletores das telas. Ver PESQUISA-AFFILITY.md e [[deal]].

import { Deal, buildDealLabel } from './deal';

// `priced` é o estado do meio dos acordos GERENCIADOS: o gerente já definiu a
// comissão do afiliado, falta a agência emitir o link. Não é alcançável em acordo
// direto, então nenhuma parceria existente muda de estado. Ver dealType.ts.
export type PartnershipStatus = 'requested' | 'priced' | 'approved' | 'rejected' | 'discontinued';

export const PARTNERSHIP_STATUSES: PartnershipStatus[] = ['requested', 'priced', 'approved', 'rejected', 'discontinued'];

export const PARTNERSHIP_STATUS_LABEL: Record<PartnershipStatus, string> = {
  requested: 'Solicitada',
  priced: 'Aguardando link',
  approved: 'Aprovada',
  rejected: 'Recusada',
  discontinued: 'Encerrada',
};

// O MESMO estado tem nomes diferentes conforme quem olha: "Solicitada" não diz nada
// ao gerente que precisa agir, e "Aguardando link" não diz nada ao afiliado que está
// esperando o gerente. Fonte única dos rótulos por audiência.
// `pricedBy` importa porque "Solicitada" quer dizer coisas diferentes: num acordo
// direto o afiliado espera a AGÊNCIA, num gerenciado ele espera o GERENTE dele.
// Passe o valor EFETIVO (effectivePricedBy), não o da política crua: afiliado sem
// gerente elegível espera a agência mesmo num deal gerenciado.
export type PartnershipAudience = 'admin' | 'affiliate' | 'upline';

export function partnershipStatusLabel(
  status: PartnershipStatus,
  audience: PartnershipAudience = 'admin',
  pricedBy: 'admin' | 'upline' = 'admin'
): string {
  if (audience === 'affiliate') {
    if (status === 'requested') return pricedBy === 'upline' ? 'Aguardando seu gerente' : 'Em análise';
    if (status === 'priced') return 'Aguardando o link';
  }
  if (audience === 'upline') {
    if (status === 'requested') return 'Defina a comissão';
    if (status === 'priced') return 'Aguardando o link da agência';
  }
  if (audience === 'admin' && status === 'priced') return 'Pronta para o link';
  return PARTNERSHIP_STATUS_LABEL[status] ?? '';
}

export interface PartnershipRequest {
  id: string;
  affiliateId: string;
  dealId: string;
  status: PartnershipStatus;
  code?: string | null;        // code do affiliate_links, setado na aprovação
  // QUEM precifica esta solicitação, resolvido pelo SERVIDOR no GET (não é gravado
  // no doc). O client não tem a árvore da rede em mãos, então não conseguiria
  // distinguir "acordo gerenciado" de "acordo gerenciado sem gerente elegível", que
  // é justamente a diferença entre "aguardando seu gerente" e "em análise".
  pricedBy?: 'admin' | 'upline';
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
//
// `pricedBy` vem do tipo do deal (effectivePricedBy): quando é o GERENTE quem
// precifica, `requested` NÃO vai direto para `approved` — passa por `priced`, que é
// o que separa "o gerente definiu a comissão" de "a agência emitiu o link".
// Omitir o parâmetro reproduz exatamente o comportamento de antes do tipo de deal.
export function canTransition(
  from: PartnershipStatus,
  to: PartnershipStatus,
  pricedBy: 'admin' | 'upline' = 'admin'
): boolean {
  if (from === to) return true;
  const allowed: Record<PartnershipStatus, PartnershipStatus[]> = {
    requested: pricedBy === 'upline' ? ['priced', 'rejected'] : ['approved', 'rejected'],
    priced: ['approved', 'rejected'],
    approved: ['discontinued'],
    rejected: [],
    discontinued: [],
  };
  return (allowed[from] || []).includes(to);
}

// Para onde vai o status quando o gerente define (ou REdefine) a comissão.
// Não é `canTransition`: reprecificar uma parceria APROVADA não pode mandá-la de
// volta para "aguardando link" — o link já existe e está funcionando; só a taxa
// muda, e a partir de amanhã (ver rateHistory.scheduleRateChange). `null` = a
// parceria não aceita precificação (recusada/encerrada).
export function nextStatusAfterPricing(from: PartnershipStatus): PartnershipStatus | null {
  if (from === 'requested' || from === 'priced') return 'priced';
  if (from === 'approved') return 'approved';
  return null;
}

// Uma parceria está "viva" (consome a oferta, gera link) quando solicitada,
// precificada ou aprovada. Recusada/encerrada libera o deal p/ ser solicitado de
// novo. `priced` é viva: a oferta já está com o gerente, não pode ser pedida 2×.
export function isActivePartnership(status: PartnershipStatus): boolean {
  return status === 'requested' || status === 'priced' || status === 'approved';
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
