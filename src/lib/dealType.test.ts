import { describe, it, expect } from 'vitest';
import {
  DEAL_TYPES, DEAL_TYPE_POLICY, DEAL_KPI_LABEL,
  resolveDealType, dealPolicy, effectivePricedBy,
  sanitizeDealForViewer, sanitizeDealsForViewer, visibleKpis,
} from './dealType';
import type { Deal } from './deal';

const deal = (over: Partial<Deal> = {}): Deal => ({
  id: 'd1', houseId: 'esportiva', operatorName: 'Esportiva Bet', model: 'cpa',
  cpaValue: 110, revPercentage: 0, cycle: 'semanal', currency: 'BRL', geo: 'Brasil',
  active: true, ...over,
});

describe('resolveDealType · ausência = direto (dispensa migração)', () => {
  it('deal antigo sem `type` resolve como direto', () => {
    expect(resolveDealType(undefined)).toBe('direto');
    expect(resolveDealType(null)).toBe('direto');
    expect(resolveDealType('')).toBe('direto');
  });
  it('valor desconhecido cai no fallback em vez de vazar para a política', () => {
    expect(resolveDealType('xpto')).toBe('direto');
    expect(resolveDealType({} as any)).toBe('direto');
    expect(resolveDealType('xpto', 'gerenciado')).toBe('gerenciado');
  });
  it('aceita os tipos do catálogo, tolerando caixa e espaço (vem de env também)', () => {
    expect(resolveDealType('gerenciado')).toBe('gerenciado');
    expect(resolveDealType('  GERENCIADO ')).toBe('gerenciado');
  });
});

describe('catálogo de tipos · invariantes da política', () => {
  it('todo tipo declarado tem política, e a política se autoidentifica', () => {
    DEAL_TYPES.forEach((id) => {
      expect(DEAL_TYPE_POLICY[id]).toBeDefined();
      expect(DEAL_TYPE_POLICY[id].id).toBe(id);
    });
  });

  // O par showRatesToAffiliate (segurança) × kpis (layout) é redundante DE PROPÓSITO:
  // segurança não se deriva de lista de exibição. Este teste é o que impede os dois
  // de divergirem — um tipo que "esconde o CPA" mas lista `cpa` nos KPIs seria uma
  // tela pedindo um campo que o servidor cortou.
  it('tipo que esconde as taxas não pode listar cpa/revshare entre os KPIs', () => {
    DEAL_TYPES.forEach((id) => {
      const p = DEAL_TYPE_POLICY[id];
      if (!p.showRatesToAffiliate) {
        expect(p.kpis).not.toContain('cpa');
        expect(p.kpis).not.toContain('revshare');
      }
    });
  });

  it('todo KPI de toda política tem rótulo', () => {
    DEAL_TYPES.forEach((id) => {
      DEAL_TYPE_POLICY[id].kpis.forEach((k) => expect(DEAL_KPI_LABEL[k]).toBeTruthy());
    });
  });

  it('os dois modelos da entrega diferem exatamente no que a call pediu', () => {
    expect(DEAL_TYPE_POLICY.direto).toMatchObject({ showRatesToAffiliate: true, pricedBy: 'admin' });
    expect(DEAL_TYPE_POLICY.gerenciado).toMatchObject({ showRatesToAffiliate: false, pricedBy: 'upline' });
    expect(DEAL_TYPE_POLICY.gerenciado.kpis).toContain('baseline');
  });
});

describe('dealPolicy', () => {
  it('resolve pela `type` do deal e tolera deal nulo', () => {
    expect(dealPolicy(deal()).id).toBe('direto');
    expect(dealPolicy(deal({ type: 'gerenciado' })).id).toBe('gerenciado');
    expect(dealPolicy(null).id).toBe('direto');
    expect(dealPolicy(undefined).id).toBe('direto');
  });
});

describe('effectivePricedBy · fallback de quem não tem gerente', () => {
  it('gerenciado com gerente elegível fica com o gerente', () => {
    expect(effectivePricedBy(DEAL_TYPE_POLICY.gerenciado, true)).toBe('upline');
  });
  // Sem esse fallback a solicitação de um afiliado no topo da estrutura (ou cujo
  // upline deixou de ser especial ativo) ficaria presa em `requested` para sempre.
  it('gerenciado SEM gerente elegível cai na fila do admin', () => {
    expect(effectivePricedBy(DEAL_TYPE_POLICY.gerenciado, false)).toBe('admin');
  });
  it('direto é sempre do admin, tenha gerente ou não', () => {
    expect(effectivePricedBy(DEAL_TYPE_POLICY.direto, true)).toBe('admin');
    expect(effectivePricedBy(DEAL_TYPE_POLICY.direto, false)).toBe('admin');
  });
});

describe('sanitizeDealForViewer · esconder o CPA é do servidor', () => {
  it('admin recebe o deal inteiro em qualquer tipo', () => {
    const d = deal({ type: 'gerenciado' });
    expect(sanitizeDealForViewer(d, 'admin')).toEqual(d);
  });

  it('afiliado NÃO recebe as taxas de um deal gerenciado', () => {
    const out = sanitizeDealForViewer(deal({ type: 'gerenciado', baseline: 10 }), 'affiliate');
    expect('cpaValue' in out).toBe(false);
    expect('revPercentage' in out).toBe(false);
    expect(out).toMatchObject({ operatorName: 'Esportiva Bet', baseline: 10 });
  });

  // Zerar em vez de remover reintroduziria "ausência ≠ R$ 0" do outro lado: o
  // consumidor leria `0` como "taxa configurada igual a zero".
  it('os campos são REMOVIDOS, não zerados', () => {
    const out: any = sanitizeDealForViewer(deal({ type: 'gerenciado' }), 'affiliate');
    expect(out.cpaValue).toBeUndefined();
    expect(Object.keys(out)).not.toContain('cpaValue');
  });

  it('afiliado recebe as taxas de um deal direto (regressão zero)', () => {
    const out = sanitizeDealForViewer(deal({ type: 'direto' }), 'affiliate');
    expect(out.cpaValue).toBe(110);
  });

  it('deal antigo sem `type` continua abrindo as taxas para o afiliado', () => {
    expect(sanitizeDealForViewer(deal(), 'affiliate').cpaValue).toBe(110);
  });

  it('não muta a entrada', () => {
    const d = deal({ type: 'gerenciado' });
    sanitizeDealForViewer(d, 'affiliate');
    expect(d.cpaValue).toBe(110);
  });

  it('entrada inválida não lança', () => {
    expect(() => sanitizeDealForViewer(null as any, 'affiliate')).not.toThrow();
    expect(sanitizeDealsForViewer(null as any, 'affiliate')).toEqual([]);
  });

  it('a versão de lista sanitiza item a item', () => {
    const out = sanitizeDealsForViewer([deal({ type: 'gerenciado' }), deal({ id: 'd2' })], 'affiliate');
    expect('cpaValue' in out[0]).toBe(false);
    expect(out[1].cpaValue).toBe(110);
  });
});

describe('visibleKpis · card não mostra KPI sem valor', () => {
  it('gerenciado completo mostra baseline, rollover, ciclo e GGR', () => {
    const d = deal({ type: 'gerenciado', baseline: 10, rollover: 2, ggrPercentage: 30 });
    expect(visibleKpis(d)).toEqual(['baseline', 'rollover', 'cycle', 'ggr']);
  });
  it('GGR ausente ("se tiver") some do card', () => {
    const d = deal({ type: 'gerenciado', baseline: 10, rollover: 2, ggrPercentage: null });
    expect(visibleKpis(d)).toEqual(['baseline', 'rollover', 'cycle']);
  });
  it('direto mostra as taxas que existem e omite as zeradas', () => {
    expect(visibleKpis(deal({ cpaValue: 110, revPercentage: 0 }))).toEqual(['cpa', 'cycle', 'geo']);
  });
  it('deal sanitizado (sem taxas) não tenta mostrar cpa', () => {
    const d = sanitizeDealForViewer(deal({ type: 'direto' }), 'affiliate');
    delete (d as any).cpaValue; // simula o corte de um tipo futuro que esconda taxa em direto
    expect(visibleKpis(d)).not.toContain('cpa');
  });
  it('deal nulo não lança', () => {
    expect(() => visibleKpis(null)).not.toThrow();
  });
});

describe('meta mínima de CPA · KPI dos dois tipos', () => {
  it('aparece no card quando o acordo tem meta, em direto e em gerenciado', () => {
    expect(visibleKpis(deal({ minCpaGoal: 5 }))).toContain('cpaGoal');
    expect(visibleKpis(deal({ type: 'gerenciado', baseline: 10, minCpaGoal: 5 }))).toContain('cpaGoal');
  });
  it('acordo sem meta não ganha a linha (0/ausente ≠ meta de zero)', () => {
    expect(visibleKpis(deal())).not.toContain('cpaGoal');
    expect(visibleKpis(deal({ minCpaGoal: 0 }))).not.toContain('cpaGoal');
  });
  // A meta é termo da OFERTA, não taxa. O que o tipo gerenciado esconde é quanto a
  // casa paga; esconder também a meta deixaria o afiliado sem saber o que a casa
  // espera dele, que é justamente o motivo do campo existir.
  it('sobrevive à sanitização do acordo que esconde as taxas', () => {
    const visto = sanitizeDealForViewer(deal({ type: 'gerenciado', baseline: 10, minCpaGoal: 5 }), 'affiliate');
    expect(visto.cpaValue).toBeUndefined();
    expect(visto.minCpaGoal).toBe(5);
  });
});
