import { describe, it, expect } from 'vitest';
import {
  adminDealKpis, adminEditsKpi, emptyDealDraft, draftFromDeal, buildDealPayload,
  adminDealCardRows, selectAdminPartnershipQueues, partnershipDecisionMessage,
  ADMIN_ALWAYS_EDITABLE_KPIS, buildHouseDraftCards, draftFromHouse, type DraftHouse,
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
    expect(adminDealKpis('direto')).toEqual(['cpa', 'revshare', 'redeposit', 'cpaGoal', 'cycle', 'geo']);
    expect(adminDealKpis('gerenciado')).toEqual(['cpa', 'revshare', 'baseline', 'rollover', 'redeposit', 'cpaGoal', 'cycle', 'ggr']);
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

  it('a meta mínima faz a ida e volta como quantidade, e zero vira campo vazio', () => {
    expect(draftFromDeal(deal({ minCpaGoal: 5 })).minCpaGoal).toBe('5');
    expect(draftFromDeal(deal({ minCpaGoal: 0 })).minCpaGoal).toBe('');
    expect(buildDealPayload({ ...emptyDealDraft(), minCpaGoal: '5' }).minCpaGoal).toBe(5);
    expect(buildDealPayload({ ...emptyDealDraft(), minCpaGoal: '' }).minCpaGoal).toBe(0);
  });

  it('o câmbio faz a ida e volta; acordo antigo abre em "não converte"', () => {
    // Acordo gravado antes de 17/08 não tem regime: o modal tem que mostrar "sem
    // conversão", que é o que o número dele de fato significa hoje.
    expect(draftFromDeal(deal({ currency: 'USD' })).fxMode).toBe('none');
    const comFx = draftFromDeal(deal({ currency: 'USD', fxMode: 'fixed', fxRate: 5.4 }));
    expect(comFx.fxMode).toBe('fixed');
    expect(comFx.fxRate).toBe('5.4');
    expect(buildDealPayload(comFx)).toMatchObject({ fxMode: 'fixed', fxRate: 5.4 });
  });

  it('cotação vazia vai como null, nunca como zero real por dólar', () => {
    expect(buildDealPayload({ ...emptyDealDraft(), currency: 'USD', fxMode: 'live', fxRate: '' }).fxRate).toBeNull();
  });

  it('aceita a cotação digitada em pt-BR (vírgula)', () => {
    expect(buildDealPayload({ ...emptyDealDraft(), currency: 'USD', fxMode: 'fixed', fxRate: '5,42' }).fxRate).toBe(5.42);
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

describe('adminDealCardRows · as linhas do card, no formato do card de casa', () => {
  it('abre pelo Tipo, com o rótulo do catálogo', () => {
    expect(adminDealCardRows(deal({ type: 'gerenciado' }))[0])
      .toEqual({ id: 'tipo', label: 'Tipo', value: DEAL_TYPE_POLICY.gerenciado.label });
    expect(adminDealCardRows(deal())[0].value).toBe(DEAL_TYPE_POLICY.direto.label);
  });

  it('as linhas seguintes saem da POLÍTICA do tipo, não de lista fixa', () => {
    const gerenciado = adminDealCardRows(deal({ type: 'gerenciado', model: 'hybrid' })).map((r) => r.id);
    expect(gerenciado).toEqual(['tipo', 'cpa', 'revshare', 'baseline', 'rollover', 'redeposit', 'cpaGoal', 'cycle', 'ggr']);
    const direto = adminDealCardRows(deal({ type: 'direto', model: 'hybrid' })).map((r) => r.id);
    expect(direto).toEqual(['tipo', 'cpa', 'revshare', 'redeposit', 'cpaGoal', 'cycle', 'geo']);
  });

  // Para o ADMIN o vazio é informação (baseline em branco é o que impede publicar),
  // ao contrário do card do afiliado, onde a linha some. Mesma escolha do card de
  // casa, que mostra "URL de cadastro —".
  it('valor ausente vira null para a tela desenhar o travessão, e a linha FICA', () => {
    const rows = adminDealCardRows(deal({ type: 'gerenciado', baseline: 0, ggrPercentage: null }));
    expect(rows.find((r) => r.id === 'baseline')).toMatchObject({ value: null });
    expect(rows.find((r) => r.id === 'ggr')).toMatchObject({ value: null });
  });

  it('a taxa que o MODELO não usa some (linha "RevShare —" seria ruído)', () => {
    expect(adminDealCardRows(deal({ model: 'cpa' })).map((r) => r.id)).not.toContain('revshare');
    expect(adminDealCardRows(deal({ model: 'revshare' })).map((r) => r.id)).not.toContain('cpa');
  });

  it('formata os valores como a vitrine (fonte única de formatação)', () => {
    const rows = adminDealCardRows(deal({ type: 'gerenciado', model: 'cpa', cpaValue: 110, baseline: 10, rollover: 2, cycle: 'semanal' }));
    const val = (id: string) => rows.find((r) => r.id === id)?.value;
    expect(val('cpa')).toBe('R$ 110,00');
    expect(val('baseline')).toBe('R$ 10,00');
    expect(val('rollover')).toBe('2x');
    expect(val('cycle')).toBe('Semanal');
  });

  it('deal nulo não lança', () => {
    expect(() => adminDealCardRows(null)).not.toThrow();
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

// ---------------------------------------------------------------------------
// Rascunhos das casas que ainda não têm acordo (/acordos abre com a sugestão)
// ---------------------------------------------------------------------------

const casa = (over: Partial<DraftHouse> = {}): DraftHouse => ({
  id: 'esportiva', slug: 'esportiva', name: 'Esportiva Bet', active: true, ...over,
});

describe('draftFromHouse · o rascunho já vem com o que a casa tem configurado', () => {
  it('copia a taxa padrão da casa para os campos do acordo', () => {
    const d = draftFromHouse(casa({ defaultCpa: 110, defaultRev: 25, cpaCurrency: 'BRL' }));
    expect(d.houseId).toBe('esportiva');
    expect(d.operatorName).toBe('Esportiva Bet');
    expect(d.cpaValue).toBe('110');
    expect(d.revPercentage).toBe('25');
    // CPA e REV juntos = híbrido; só REV = revshare; o resto cai em CPA.
    expect(d.model).toBe('hybrid');
    expect(draftFromHouse(casa({ defaultRev: 30 })).model).toBe('revshare');
    expect(draftFromHouse(casa({ defaultCpa: 110 })).model).toBe('cpa');
    expect(draftFromHouse(casa()).model).toBe('cpa');
  });

  it('casa sem taxa padrão abre com os campos VAZIOS, nunca com zero', () => {
    // Ausência ≠ R$ 0: um "0" pré-digitado seria lido como taxa configurada e
    // ainda obrigaria o admin a apagar antes de escrever o valor real.
    const d = draftFromHouse(casa());
    expect(d.cpaValue).toBe('');
    expect(d.revPercentage).toBe('');
    expect(d.baseline).toBe('');
    expect(d.ggrPercentage).toBe('');
  });

  it('a moeda acompanha o CPA copiado (casa sem moeda declarada paga em EUR)', () => {
    expect(draftFromHouse(casa({ defaultCpa: 30 })).currency).toBe('EUR');
    expect(draftFromHouse(casa({ defaultCpa: 110, cpaCurrency: 'BRL' })).currency).toBe('BRL');
    // Sem número copiado não há moeda a herdar: fica no default do formulário.
    expect(draftFromHouse(casa({ cpaCurrency: 'EUR' })).currency).toBe('BRL');
  });

  it('nasce ATIVO e com o tipo da instância (há um humano revisando no modal)', () => {
    const d = draftFromHouse(casa(), 'gerenciado');
    expect(d.active).toBe(true);
    expect(d.type).toBe('gerenciado');
    expect(draftFromHouse(casa()).type).toBe('direto');
  });
});

describe('buildHouseDraftCards · quais casas viram sugestão em /acordos', () => {
  const houses: DraftHouse[] = [
    casa({ id: 'leon', slug: 'leon', name: 'LEON Bet', order: 2 }),
    casa({ id: 'esportiva', slug: 'esportiva', name: 'Esportiva Bet', order: 1, defaultCpa: 110, cpaCurrency: 'BRL' }),
    casa({ id: 'superbet', slug: 'superbet', name: 'Superbet', order: 3 }),
  ];

  it('sugere só as casas sem acordo, na ordem do backoffice de casas', () => {
    const cards = buildHouseDraftCards(houses, [{ houseId: 'superbet' }]);
    expect(cards.map((c) => c.key)).toEqual(['esportiva', 'leon']);
  });

  it('casa PAUSADA fica de fora (o acordo dela não apareceria na vitrine)', () => {
    const cards = buildHouseDraftCards([...houses, casa({ id: 'pausada', slug: 'pausada', name: 'Pausada', active: false })], []);
    expect(cards.map((c) => c.key)).not.toContain('pausada');
  });

  it('casa sem nome ou sem slug não vira acordo', () => {
    const cards = buildHouseDraftCards(
      [casa({ id: 'x', slug: 'x', name: '  ' }), casa({ id: '', slug: '', name: 'Sem chave' })],
      [],
    );
    expect(cards).toEqual([]);
  });

  it('acordo já existente pelo SLUG ou pelo ID tira a casa da lista', () => {
    expect(buildHouseDraftCards([casa()], [{ houseId: 'esportiva' }])).toEqual([]);
    expect(buildHouseDraftCards([casa({ id: 'doc-1', slug: 'esportiva' })], [{ houseId: 'doc-1' }])).toEqual([]);
  });

  it('as linhas do card são as MESMAS do card de acordo, já com a sugestão', () => {
    const [card] = buildHouseDraftCards(houses, []);
    const rows = Object.fromEntries(card.rows.map((r) => [r.id, r.value]));
    expect(rows.cpa).toBe('R$ 110,00');
    // O que a casa não tem aparece vazio (a tela desenha o placeholder), nunca R$ 0.
    expect(rows.geo).toBeNull();
    expect(card.rows.map((r) => r.id)).toEqual(adminDealCardRows({ ...card.draft, id: '', cpaValue: 110, revPercentage: 0 } as any).map((r) => r.id));
  });

  it('entrada nula ou vazia não quebra', () => {
    expect(buildHouseDraftCards(null, null)).toEqual([]);
    expect(buildHouseDraftCards(undefined, [{ houseId: 'x' }])).toEqual([]);
  });
});
