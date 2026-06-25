import { describe, it, expect } from 'vitest';
import {
  analyticsDocId,
  funnelKey,
  sanitizeFunnel,
  hasFunnelActivity,
  resolveFunnelAffiliateId,
  ANALYTICS_METRICS,
} from './analyticsDoc';

describe('analyticsDocId / funnelKey · determinístico e normalizado', () => {
  it('id = nameKey__casa, ambos normalizados (idempotente p/ refresh)', () => {
    expect(analyticsDocId('LucasGuimaraes', 'SportingBet')).toBe('lucasguimaraes__sportingbet');
    // mesmo afiliado×casa com caixa/acentos diferentes → MESMO id
    expect(analyticsDocId('Lucas Guimarães', 'sportingbet')).toBe(analyticsDocId('lucasguimaraes', 'SPORTINGBET'));
  });

  it('funnelKey usa "|" e a mesma normalização da reconciliação de pending', () => {
    expect(funnelKey('LucasGuimaraes', 'SportingBet')).toBe('lucasguimaraes|sportingbet');
  });

  it('sanitiza "/" no id (proibido em doc id do Firestore)', () => {
    expect(analyticsDocId('a/b', 'c/d')).not.toContain('/');
  });
});

describe('sanitizeFunnel · coage as 7 métricas (num guarda lixo)', () => {
  it('só as 7 métricas, número, sem campos extras', () => {
    const out = sanitizeFunnel({ clicks: '20', registrations: 4, ngr: 'abc', affiliate: 'X', extra: 9 });
    expect(Object.keys(out).sort()).toEqual([...ANALYTICS_METRICS].sort());
    expect(out.clicks).toBe(20);
    expect(out.registrations).toBe(4);
    expect(out.ngr).toBe(0); // string não-numérica → 0
    expect((out as any).affiliate).toBeUndefined();
  });

  it('hasFunnelActivity = clique OU cadastro > 0 (caso Lucas: true mesmo sem comissão)', () => {
    expect(hasFunnelActivity({ clicks: 20, registrations: 4, ftd: 0, ngr: 0 })).toBe(true);
    expect(hasFunnelActivity({ clicks: 0, registrations: 0 })).toBe(false);
    expect(hasFunnelActivity({ clicks: 1 })).toBe(true);
  });
});

describe('resolveFunnelAffiliateId · real > pending > null', () => {
  const lookup = {
    realByKey: new Map([['helder|sportingbet', 'AFF-REAL-1']]),
    pendingByKey: new Map([['lucasguimaraes|sportingbet', 'pending_lucasguimaraes_sportingbet']]),
  };

  it('afiliado que produz → id real, funnelOnly=false', () => {
    expect(resolveFunnelAffiliateId({ nameKey: 'helder', house: 'sportingbet' }, lookup)).toEqual({
      affiliateId: 'AFF-REAL-1',
      funnelOnly: false,
    });
  });

  it('Lucas (só-funil, mas existe pending) → id sintético, funnelOnly=true', () => {
    expect(resolveFunnelAffiliateId({ nameKey: 'lucasguimaraes', house: 'sportingbet' }, lookup)).toEqual({
      affiliateId: 'pending_lucasguimaraes_sportingbet',
      funnelOnly: true,
    });
  });

  it('afiliado só-funil desconhecido → null, funnelOnly=true', () => {
    expect(resolveFunnelAffiliateId({ nameKey: 'novato', house: 'superbet' }, lookup)).toEqual({
      affiliateId: null,
      funnelOnly: true,
    });
  });
});
