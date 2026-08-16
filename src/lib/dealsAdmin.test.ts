import { describe, it, expect } from 'vitest';
import {
  adminDealKpis, adminEditsKpi, emptyDealDraft, draftFromDeal, buildDealPayload,
  dealTypeBadge, selectAdminPartnershipQueues, partnershipDecisionMessage,
  ADMIN_ALWAYS_EDITABLE_KPIS,
} from './dealsAdmin';
import { DEAL_TYPES, DEAL_TYPE_POLICY } from './dealType';
import type { Deal } from './deal';
import type { PartnershipRequest, PartnershipStatus } from './partnership';

const deal = (over: Partial<Deal> = {}): Deal => ({
  id: 'd1', houseId: 'esportiva', operatorName: 'Esportiva Bet', model: 'cpa',
  cpaValue: 110, revPercentage: 0, cycle: 'mensal', currency: 'BRL', geo: 'Brasil',
  active: true, ...over,
});

const req = (status: PartnershipStatus, id = status): PartnershipRequest => ({
  id, affiliateId: 'AFF-1', dealId: 'd1', status,
});

describe('adminDealKpis · o que o ADMIN edita em cada tipo', () => {
  it('sempre oferece CPA e RevShare, mesmo no tipo que os esconde do afiliado', () => {
    // A política `gerenciado` não lista cpa/revshare (é o card do AFILIADO), mas o
    // admin precisa preencher o que a casa paga: é o valor que vira byBrand.
    expect(DEAL_TYPE_POLICY.gerenciado.kpis).not.toContain('cpa');
    expect(adminDealKpis('gerenciado')).toEqual(
      expect.arrayContaining(['cpa', 'revshare'])
    );
    DEAL_TYPES.forEach((t) => {
      ADMIN_ALWAYS_EDITABLE_KPIS.forEach((k) => expect(adminEditsKpi(t, k)).toBe(true));
    });
  });

  it('acrescenta os KPIs da política do tipo', () => {
    expect(adminDealKpis('direto')).toEqual(['cpa', 'revshare', 'cycle', 'geo']);
    expect(adminDealKpis('gerenciado')).toEqual(['cpa', 'revshare', 'baseline', 'rollover', 'cycle', 'ggr']);
  });

  it('baseline/rollover/GGR só no tipo cuja política os pede', () => {
    (['baseline', 'rollover', 'ggr'] as const).forEach((k) => {
      expect(adminEditsKpi('direto', k)).toBe(false);
      expect(adminEditsKpi('gerenciado', k)).toBe(true);
    });
    expect(adminEditsKpi('gerenciado', 'geo')).toBe(false);
  });

  it('tipo ausente ou desconhecido cai em direto (deal antigo, sem migração)', () => {
    expect(adminDealKpis(undefined)).toEqual(adminDealKpis('direto'));
    expect(adminDealKpis('xpto' as any)).toEqual(adminDealKpis('direto'));
  });

  it('nunca repete um KPI e nunca sai da lista do catálogo', () => {
    DEAL_TYPES.forEach((t) => {
      const kpis = adminDealKpis(t);
      expect(new Set(kpis).size).toBe(kpis.length);
      const known = new Set([...ADMIN_ALWAYS_EDITABLE_KPIS, ...DEAL_TYPE_POLICY[t].kpis]);
      kpis.forEach((k) => expect(known.has(k)).toBe(true));
    });
  });
});

describe('rascunho do formulário', () => {
  it('deal novo nasce direto e ativo', () => {
    const d = emptyDealDraft();
    expect(d.type).toBe('direto');
    expect(d.active).toBe(true);
    expect(d.id).toBeUndefined();
  });

  it('deal novo respeita o default da instância', () => {
    expect(emptyDealDraft('gerenciado').type).toBe('gerenciado');
  });

  it('edição pré-seleciona o tipo do deal', () => {
    expect(draftFromDeal(deal({ type: 'gerenciado' })).type).toBe('gerenciado');
    expect(draftFromDeal(deal()).type).toBe('direto');
  });

  it('zero vira campo vazio, para o admin não ter que apagar o zero', () => {
    const d = draftFromDeal(deal({ revPercentage: 0, baseline: 0, ggrPercentage: null }));
    expect(d.revPercentage).toBe('');
    expect(d.baseline).toBe('');
    expect(d.ggrPercentage).toBe('');
    expect(d.cpaValue).toBe('110');
  });

  it('ida e volta preserva os KPIs preenchidos', () => {
    const original = deal({ type: 'gerenciado', baseline: 50, rollover: 2, ggrPercentage: 35, model: 'hybrid', revPercentage: 20 });
    const payload = buildDealPayload(draftFromDeal(original));
    expect(payload).toMatchObject({
      type: 'gerenciado', baseline: 50, rollover: 2, ggrPercentage: 35,
      cpaValue: 110, revPercentage: 20, houseId: 'esportiva', active: true,
    });
  });
});

describe('buildDealPayload · GGR vazio é null, não zero', () => {
  it('manda null quando o campo está vazio', () => {
    const payload = buildDealPayload({ ...emptyDealDraft('gerenciado'), ggrPercentage: '' });
    expect(payload.ggrPercentage).toBeNull();
  });

  it('manda null quando o campo tem só espaço', () => {
    expect(buildDealPayload({ ...emptyDealDraft(), ggrPercentage: '   ' }).ggrPercentage).toBeNull();
  });

  it('manda o número quando preenchido, inclusive zero digitado', () => {
    expect(buildDealPayload({ ...emptyDealDraft(), ggrPercentage: '35' }).ggrPercentage).toBe(35);
    expect(buildDealPayload({ ...emptyDealDraft(), ggrPercentage: '0' }).ggrPercentage).toBe(0);
  });

  // Sem isto, abrir e salvar um acordo com GGR 0% o converteria em `null` em
  // silêncio: o campo é o único em que vazio e zero significam coisas diferentes,
  // então ele não pode passar pelo esvaziamento de zero dos outros números.
  it('GGR 0% sobrevive ao ida e volta do formulário (só a AUSÊNCIA esvazia)', () => {
    const zerado = draftFromDeal(deal({ ggrPercentage: 0 }));
    expect(zerado.ggrPercentage).toBe('0');
    expect(buildDealPayload(zerado).ggrPercentage).toBe(0);

    const ausente = draftFromDeal(deal({ ggrPercentage: null }));
    expect(ausente.ggrPercentage).toBe('');
    expect(buildDealPayload(ausente).ggrPercentage).toBeNull();
  });

  it('campo numérico vazio ou lixo vira 0 sem propagar NaN', () => {
    const payload = buildDealPayload({ ...emptyDealDraft(), cpaValue: '', revPercentage: 'abc', baseline: '', rollover: '' });
    expect(payload.cpaValue).toBe(0);
    expect(payload.revPercentage).toBe(0);
    expect(payload.baseline).toBe(0);
    expect(payload.rollover).toBe(0);
    expect(Number.isNaN(payload.cpaValue as number)).toBe(false);
  });
});

describe('dealTypeBadge', () => {
  it('não carimba o tipo default', () => {
    expect(dealTypeBadge(deal())).toBeNull();
    expect(dealTypeBadge(deal({ type: 'direto' }))).toBeNull();
    expect(dealTypeBadge(null)).toBeNull();
  });

  it('usa o rótulo do catálogo para os demais tipos', () => {
    expect(dealTypeBadge(deal({ type: 'gerenciado' }))).toBe(DEAL_TYPE_POLICY.gerenciado.label);
  });
});

describe('filas de parceria do admin', () => {
  const all = [req('requested'), req('priced'), req('approved'), req('rejected'), req('discontinued')];

  it('priced sai da fila de pendentes e NÃO cai em decididas', () => {
    const q = selectAdminPartnershipQueues(all);
    expect(q.pending.map((r) => r.id)).toEqual(['requested']);
    expect(q.awaitingLink.map((r) => r.id)).toEqual(['priced']);
    expect(q.decided.map((r) => r.id)).toEqual(['approved', 'rejected', 'discontinued']);
  });

  it('particiona sem perder nem duplicar nenhuma parceria', () => {
    const q = selectAdminPartnershipQueues(all);
    expect(q.pending.length + q.awaitingLink.length + q.decided.length).toBe(all.length);
  });

  it('aguenta entrada inválida', () => {
    const q = selectAdminPartnershipQueues(null as any);
    expect(q.pending).toEqual([]);
    expect(q.awaitingLink).toEqual([]);
    expect(q.decided).toEqual([]);
  });
});

describe('partnershipDecisionMessage', () => {
  it('aprovar vindo de priced não promete taxa aplicada (quem precificou foi o gerente)', () => {
    const msg = partnershipDecisionMessage('priced', 'approved');
    expect(msg).toContain('Link emitido');
    expect(msg).not.toContain('Taxa aplicada');
  });

  it('aprovar vindo de requested segue dizendo que a taxa do acordo foi aplicada', () => {
    expect(partnershipDecisionMessage('requested', 'approved')).toContain('Taxa aplicada');
  });

  it('recusa e encerramento têm mensagem própria', () => {
    expect(partnershipDecisionMessage('priced', 'rejected')).toBe('Parceria recusada.');
    expect(partnershipDecisionMessage('approved', 'discontinued')).toBe('Parceria encerrada.');
  });

  it('nenhuma mensagem usa travessão (regra de copy do repo)', () => {
    const msgs = [
      partnershipDecisionMessage('priced', 'approved'),
      partnershipDecisionMessage('requested', 'approved'),
      partnershipDecisionMessage('requested', 'rejected'),
      partnershipDecisionMessage('approved', 'discontinued'),
    ];
    msgs.forEach((m) => expect(m).not.toMatch(/—/));
  });
});
