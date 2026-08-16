import { describe, it, expect } from 'vitest';
import {
  canTransition, isActivePartnership, selectAvailableDeals, joinPartnerships,
  partnershipStatusLabel, PARTNERSHIP_STATUSES, PARTNERSHIP_STATUS_LABEL,
  PartnershipRequest,
} from './partnership';
import { Deal } from './deal';

const deal = (id: string, over: Partial<Deal> = {}): Deal => ({
  id, houseId: id, operatorName: id, model: 'cpa', cpaValue: 80, revPercentage: 0,
  cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true, ...over,
});
const req = (dealId: string, status: PartnershipRequest['status']): PartnershipRequest =>
  ({ id: `r_${dealId}`, affiliateId: 'a1', dealId, status });

describe('canTransition · workflow de status', () => {
  it('solicitada → aprovada/recusada; aprovada → encerrada', () => {
    expect(canTransition('requested', 'approved')).toBe(true);
    expect(canTransition('requested', 'rejected')).toBe(true);
    expect(canTransition('approved', 'discontinued')).toBe(true);
  });
  it('bloqueia transições inválidas (recusada/encerrada são terminais; não pula solicitada→encerrada)', () => {
    expect(canTransition('requested', 'discontinued')).toBe(false);
    expect(canTransition('rejected', 'approved')).toBe(false);
    expect(canTransition('discontinued', 'approved')).toBe(false);
    expect(canTransition('approved', 'rejected')).toBe(false);
  });
  it('mesmo→mesmo é permitido (idempotência)', () => {
    expect(canTransition('approved', 'approved')).toBe(true);
  });
});

describe('canTransition · acordo gerenciado passa pelo gerente', () => {
  // Sem o passo `priced` o admin aprovaria direto e reescreveria a taxa que o
  // gerente definiu. O estado do meio é o que separa "comissão definida" de
  // "link emitido".
  it('com o gerente precificando, solicitada vai para priced, não para aprovada', () => {
    expect(canTransition('requested', 'priced', 'upline')).toBe(true);
    expect(canTransition('requested', 'approved', 'upline')).toBe(false);
  });
  it('de priced a agência aprova (emite o link) ou recusa', () => {
    expect(canTransition('priced', 'approved', 'upline')).toBe(true);
    expect(canTransition('priced', 'rejected', 'upline')).toBe(true);
    expect(canTransition('priced', 'discontinued', 'upline')).toBe(false);
  });
  it('o gerente também pode recusar de cara', () => {
    expect(canTransition('requested', 'rejected', 'upline')).toBe(true);
  });
  it('sem o parâmetro, o comportamento é EXATAMENTE o de antes do tipo de deal', () => {
    expect(canTransition('requested', 'approved')).toBe(true);
    expect(canTransition('requested', 'priced')).toBe(false);
  });
  // Afiliado sem gerente elegível cai na fila do admin: com pricedBy 'admin' o
  // fluxo é o direto, mesmo o deal sendo gerenciado.
  it('fallback para admin fecha o caminho de uma tacada só', () => {
    expect(canTransition('requested', 'approved', 'admin')).toBe(true);
  });
});

describe('isActivePartnership', () => {
  it('solicitada, precificada e aprovada são vivas; recusada e encerrada não', () => {
    expect(isActivePartnership('requested')).toBe(true);
    expect(isActivePartnership('priced')).toBe(true);
    expect(isActivePartnership('approved')).toBe(true);
    expect(isActivePartnership('rejected')).toBe(false);
    expect(isActivePartnership('discontinued')).toBe(false);
  });
});

describe('partnershipStatusLabel · o mesmo estado por audiência', () => {
  it('o afiliado de um gerenciado sabe que espera o GERENTE', () => {
    expect(partnershipStatusLabel('requested', 'affiliate', 'upline')).toBe('Aguardando seu gerente');
  });
  it('o afiliado de um direto espera a agência, não um gerente inexistente', () => {
    expect(partnershipStatusLabel('requested', 'affiliate', 'admin')).toBe('Em análise');
  });
  it('o gerente vê uma chamada para ação, não um estado passivo', () => {
    expect(partnershipStatusLabel('requested', 'upline')).toBe('Defina a comissão');
  });
  it('o admin vê a fila de link', () => {
    expect(partnershipStatusLabel('priced', 'admin')).toBe('Pronta para o link');
  });
  it('cai no rótulo neutro para o que não tem variação', () => {
    expect(partnershipStatusLabel('approved', 'affiliate')).toBe('Aprovada');
    expect(partnershipStatusLabel('rejected', 'upline')).toBe('Recusada');
    expect(partnershipStatusLabel('discontinued')).toBe('Encerrada');
  });
  it('todo status do catálogo tem rótulo neutro (nenhum vaza a chave crua na tela)', () => {
    PARTNERSHIP_STATUSES.forEach((s) => {
      expect(PARTNERSHIP_STATUS_LABEL[s]).toBeTruthy();
      expect(partnershipStatusLabel(s, 'affiliate')).toBeTruthy();
    });
  });
});

describe('selectAvailableDeals · ofertas disponíveis', () => {
  const deals = [deal('d1'), deal('d2'), deal('d3', { active: false })];
  it('esconde deals inativos e os com parceria VIVA; mostra o resto', () => {
    const mine = [req('d1', 'approved')];
    expect(selectAvailableDeals(deals, mine).map((d) => d.id)).toEqual(['d2']); // d1 tomado, d3 inativo
  });
  it('parceria recusada/encerrada NÃO esconde a oferta (pode pedir de novo)', () => {
    const mine = [req('d1', 'rejected'), req('d2', 'discontinued')];
    expect(selectAvailableDeals(deals, mine).map((d) => d.id).sort()).toEqual(['d1', 'd2']);
  });
  it('parceria PRECIFICADA (esperando o link) também consome a oferta', () => {
    expect(selectAvailableDeals(deals, [req('d1', 'priced')]).map((d) => d.id)).toEqual(['d2']);
  });
  it('sem requests → todos os ativos', () => {
    expect(selectAvailableDeals(deals, []).map((d) => d.id).sort()).toEqual(['d1', 'd2']);
  });
  it('entradas inválidas não lançam', () => {
    expect(selectAvailableDeals(null as any, null as any)).toEqual([]);
  });
});

describe('joinPartnerships · enriquece request com dados do deal', () => {
  it('resolve label/operadora pelo mapa de deals', () => {
    const dealsById = { d1: deal('d1', { operatorName: 'Deuces', model: 'cpa', cycle: 'quinzenal', currency: 'crypto', geo: 'México' }) };
    const [out] = joinPartnerships([req('d1', 'approved')], dealsById);
    expect(out).toMatchObject({ operatorName: 'Deuces', dealLabel: 'Deuces - CPA - Quinzenal - crypto - México', houseId: 'd1' });
  });
  it('deal sumiu → mantém o denormalizado que já veio na request', () => {
    const r: PartnershipRequest = { ...req('dX', 'discontinued'), operatorName: 'Antiga', dealLabel: 'Antiga - CPA' };
    const [out] = joinPartnerships([r], {});
    expect(out).toMatchObject({ operatorName: 'Antiga', dealLabel: 'Antiga - CPA' });
  });
});
