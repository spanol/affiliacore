import { describe, it, expect } from 'vitest';
import {
  canTransition, isActivePartnership, selectAvailableDeals, joinPartnerships,
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

describe('isActivePartnership', () => {
  it('solicitada e aprovada são vivas; recusada e encerrada não', () => {
    expect(isActivePartnership('requested')).toBe(true);
    expect(isActivePartnership('approved')).toBe(true);
    expect(isActivePartnership('rejected')).toBe(false);
    expect(isActivePartnership('discontinued')).toBe(false);
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
