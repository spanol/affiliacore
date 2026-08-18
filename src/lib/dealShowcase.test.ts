import { describe, it, expect } from 'vitest';
import {
  formatDealKpiValue, dealKpiChips, dealRequestHint,
  resolvePartnershipPricedBy, partnershipNote, myCommissionChips,
} from './dealShowcase';
import { DEAL_KPI_LABEL, DEAL_TYPE_POLICY } from './dealType';
import type { Deal } from './deal';
import type { PartnershipRequest } from './partnership';

// F4 do PLANO-TIPOS-DE-DEAL: o núcleo da vitrine do afiliado. O caso que dirige o
// arquivo é o deal `gerenciado` SANITIZADO pelo servidor, que chega sem cpaValue nem
// revPercentage: nada aqui pode assumir número.

const deal = (over: Partial<Deal> = {}): Deal => ({
  id: 'd1', houseId: 'esportiva', operatorName: 'Esportiva Bet', model: 'cpa',
  cpaValue: 110, revPercentage: 0, cycle: 'mensal', currency: 'BRL', geo: 'Brasil',
  active: true, ...over,
});

// O que o `sanitizeDealForViewer` de fato entrega ao afiliado num deal gerenciado:
// os DOIS campos de taxa somem do objeto.
const sanitizado = (over: Partial<Deal> = {}): Deal => {
  const d = deal({ type: 'gerenciado', baseline: 50, rollover: 2, ggrPercentage: 30, ...over });
  delete (d as any).cpaValue;
  delete (d as any).revPercentage;
  return d;
};

describe('formatDealKpiValue', () => {
  it('formata baseline e CPA em reais', () => {
    expect(formatDealKpiValue('cpa', deal({ cpaValue: 110 }))).toBe('R$ 110,00');
    expect(formatDealKpiValue('baseline', deal({ baseline: 1250.5 }))).toBe('R$ 1.250,50');
  });

  // O acordo é escrito na moeda dele: traduzir "US$ 100" para "R$ 100" no rótulo
  // seria dizer outra coisa que não está no contrato. A conversão acontece na
  // aprovação da parceria, não aqui.
  it('usa a MOEDA do acordo nos valores em dinheiro', () => {
    expect(formatDealKpiValue('cpa', deal({ cpaValue: 100, currency: 'USD' }))).toMatch(/US\$\s?100,00/);
    expect(formatDealKpiValue('baseline', deal({ baseline: 30, currency: 'EUR' }))).toMatch(/€\s?30,00/);
  });

  it('formata rollover como multiplicador e os percentuais com %', () => {
    expect(formatDealKpiValue('rollover', deal({ rollover: 2 }))).toBe('2x');
    expect(formatDealKpiValue('ggr', deal({ ggrPercentage: 30 }))).toBe('30%');
    expect(formatDealKpiValue('revshare', deal({ revPercentage: 12.5 }))).toBe('12,5%');
  });

  it('usa o rótulo do ciclo e o texto cru do geo', () => {
    expect(formatDealKpiValue('cycle', deal({ cycle: 'semanal' }))).toBe('Semanal');
    expect(formatDealKpiValue('cycle', deal({ cycle: 'd30mais' }))).toBe('D30+');
    expect(formatDealKpiValue('geo', deal({ geo: 'México' }))).toBe('México');
  });

  // A meta é CONTAGEM: "5 CPAs", não "R$ 5,00". E concorda no singular — a régua de
  // copy do repo proíbe "1 CPA(s)".
  it('formata a meta como quantidade de CPAs, com concordância', () => {
    expect(formatDealKpiValue('cpaGoal', deal({ minCpaGoal: 5 }))).toBe('5 CPAs');
    expect(formatDealKpiValue('cpaGoal', deal({ minCpaGoal: 1 }))).toBe('1 CPA');
    expect(formatDealKpiValue('cpaGoal', deal({ minCpaGoal: 0 }))).toBeNull();
    expect(formatDealKpiValue('cpaGoal', deal())).toBeNull();
  });

  it('devolve null (não "R$ 0,00") quando o valor não veio', () => {
    const d = sanitizado();
    expect(formatDealKpiValue('cpa', d)).toBeNull();
    expect(formatDealKpiValue('revshare', d)).toBeNull();
    expect(formatDealKpiValue('ggr', deal({ ggrPercentage: null }))).toBeNull();
    expect(formatDealKpiValue('rollover', deal({ rollover: 0 }))).toBeNull();
    expect(formatDealKpiValue('geo', deal({ geo: '   ' }))).toBeNull();
  });

  it('não lança com deal nulo nem com valor malformado', () => {
    expect(formatDealKpiValue('cpa', null)).toBeNull();
    expect(formatDealKpiValue('baseline', deal({ baseline: 'abc' as any }))).toBeNull();
    expect(formatDealKpiValue('cycle', deal({ cycle: undefined as any }))).toBeNull();
  });
});

describe('dealKpiChips', () => {
  it('segue a política do tipo direto (CPA, RevShare, ciclo, geo)', () => {
    const chips = dealKpiChips(deal({ cpaValue: 110, revPercentage: 20 }));
    expect(chips.map((c) => c.id)).toEqual(['cpa', 'revshare', 'cycle', 'geo']);
    expect(chips[0]).toEqual({ id: 'cpa', label: DEAL_KPI_LABEL.cpa, value: 'R$ 110,00' });
  });

  it('no gerenciado sanitizado devolve só baseline, rollover, ciclo e GGR', () => {
    const chips = dealKpiChips(sanitizado());
    expect(chips.map((c) => c.id)).toEqual(['baseline', 'rollover', 'cycle', 'ggr']);
    expect(chips.some((c) => c.id === 'cpa' || c.id === 'revshare')).toBe(false);
  });

  it('omite o KPI sem valor em vez de mostrar zero (GGR ausente)', () => {
    const chips = dealKpiChips(sanitizado({ ggrPercentage: null }));
    expect(chips.map((c) => c.id)).toEqual(['baseline', 'rollover', 'cycle']);
  });

  it('não lança com deal nulo', () => {
    expect(dealKpiChips(null)).toEqual([]);
  });
});

describe('dealRequestHint', () => {
  it('avisa que o gerente precifica quando a política é upline', () => {
    expect(dealRequestHint(deal({ type: 'gerenciado' }))).toContain('gerente');
  });

  it('fica calado no acordo direto', () => {
    expect(dealRequestHint(deal())).toBeNull();
    expect(dealRequestHint(null)).toBeNull();
  });
});

describe('resolvePartnershipPricedBy', () => {
  const req = (over: any = {}): PartnershipRequest =>
    ({ id: 'p1', affiliateId: 'AFF-1', dealId: 'd1', status: 'requested', ...over });

  it('prefere o pricedBy que veio do servidor', () => {
    expect(resolvePartnershipPricedBy(req({ pricedBy: 'upline' }), deal())).toBe('upline');
    // deal gerenciado, mas o afiliado não tem gerente elegível: o servidor já
    // resolveu isso com effectivePricedBy e manda 'admin'.
    expect(resolvePartnershipPricedBy(req({ pricedBy: 'admin' }), deal({ type: 'gerenciado' }))).toBe('admin');
  });

  it('cai na política do deal enquanto o campo não vier (server antigo)', () => {
    expect(resolvePartnershipPricedBy(req(), deal({ type: 'gerenciado' })))
      .toBe(DEAL_TYPE_POLICY.gerenciado.pricedBy);
    expect(resolvePartnershipPricedBy(req(), deal())).toBe('admin');
  });

  it('ignora valor lixo e não lança sem request nem deal', () => {
    expect(resolvePartnershipPricedBy(req({ pricedBy: 'qualquer' }), deal({ type: 'gerenciado' }))).toBe('upline');
    expect(resolvePartnershipPricedBy(null, null)).toBe('admin');
    expect(resolvePartnershipPricedBy(undefined, undefined)).toBe('admin');
  });
});

describe('partnershipNote', () => {
  it('diferencia esperar o gerente de esperar a agência', () => {
    expect(partnershipNote('requested', 'upline')).toContain('gerente');
    expect(partnershipNote('requested', 'admin')).toContain('agência');
  });

  it('cobre priced, recusada e encerrada', () => {
    expect(partnershipNote('priced')).toContain('link');
    expect(partnershipNote('rejected')).toContain('recusada');
    expect(partnershipNote('discontinued')).toContain('encerrado');
  });

  it('aprovada só manda copiar o link quando o link resolve', () => {
    expect(partnershipNote('approved', 'admin', true)).toContain('Copie o link');
    expect(partnershipNote('approved', 'admin', false)).toContain('sendo preparado');
  });

  it('nenhum recado usa travessão no meio da frase', () => {
    const todos = (['requested', 'priced', 'approved', 'rejected', 'discontinued'] as const)
      .flatMap((s) => [
        partnershipNote(s, 'admin'), partnershipNote(s, 'upline'),
        partnershipNote(s, 'admin', true), partnershipNote(s, 'upline', true),
      ]);
    todos.forEach((t) => expect(t).not.toContain('—'));
    expect(dealRequestHint(deal({ type: 'gerenciado' }))).not.toContain('—');
  });
});

describe('myCommissionChips · a comissão do PRÓPRIO afiliado no card (/meus-links)', () => {
  const config = (over: any = {}) => ({ affiliateId: 'a1', cpaValue: undefined, revPercentage: undefined, ...over });

  it('acordo gerenciado + taxa do gerente no byBrand → "Seu CPA" e "Seu RevShare" em reais', () => {
    const cfg = config({ byBrand: { esportiva: { cpaValue: 110, revPercentage: 12.5 } } });
    const chips = myCommissionChips(sanitizado(), cfg as any, 'esportiva');
    expect(chips).toEqual([
      { id: 'myCpa', label: 'Seu CPA', value: 'R$ 110,00' },
      { id: 'myRev', label: 'Seu RevShare', value: '12,5%' },
    ]);
  });

  it('acordo DIRETO nunca ganha o chip: o CPA do card já é a comissão do afiliado', () => {
    const cfg = config({ byBrand: { esportiva: { cpaValue: 110, revPercentage: 0 } } });
    expect(myCommissionChips(deal(), cfg as any, 'esportiva')).toEqual([]);
  });

  it('ausência ≠ R$ 0: sem taxa configurada (ou configurada em zero) não sai chip', () => {
    expect(myCommissionChips(sanitizado(), config() as any, 'esportiva')).toEqual([]);
    expect(myCommissionChips(sanitizado(), null, 'esportiva')).toEqual([]);
    const zerada = config({ byBrand: { esportiva: { cpaValue: 0, revPercentage: 0 } } });
    expect(myCommissionChips(sanitizado(), zerada as any, 'esportiva')).toEqual([]);
  });

  it('sem override da casa, cai na taxa de TOPO (é a taxa efetiva do afiliado ali)', () => {
    const cfg = config({ cpaValue: 80, revPercentage: 0 });
    expect(myCommissionChips(sanitizado(), cfg as any, 'esportiva')).toEqual([
      { id: 'myCpa', label: 'Seu CPA', value: 'R$ 80,00' },
    ]);
  });

  it('deal ausente ou brandKey vazio não lançam', () => {
    const cfg = config({ byBrand: { esportiva: { cpaValue: 110, revPercentage: 0 } } });
    expect(myCommissionChips(null, cfg as any, 'esportiva')).toEqual([]);
    expect(myCommissionChips(sanitizado(), cfg as any, '')).toEqual([]);
  });

  it('copy sem travessão no meio de frase', () => {
    const cfg = config({ byBrand: { esportiva: { cpaValue: 110, revPercentage: 12.5 } } });
    myCommissionChips(sanitizado(), cfg as any, 'esportiva')
      .forEach((c) => expect(`${c.label} ${c.value}`).not.toContain('—'));
  });
});
