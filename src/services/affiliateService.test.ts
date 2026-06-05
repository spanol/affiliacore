import { describe, it, expect, vi } from 'vitest';

// Isola os helpers de parsing — evita os efeitos colaterais de importar o
// Firebase client (lib/firebase roda um testConnection() no import).
vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('../lib/api', () => ({ authFetch: vi.fn() }));

import {
  extractArray,
  extractApiError,
  isNoDataError,
  messageLooksLikeError,
  aggregateByCampaign,
  buildSubToSpecialConfig,
  calcAgencyNetProfit,
} from './affiliateService';

describe('extractArray', () => {
  it('retorna [] para null/undefined', () => {
    expect(extractArray(null)).toEqual([]);
    expect(extractArray(undefined)).toEqual([]);
  });

  it('passa arrays direto', () => {
    expect(extractArray([{ id: 1 }])).toEqual([{ id: 1 }]);
  });

  it('encontra o array em data.data (estrutura aninhada)', () => {
    expect(extractArray({ data: { data: [{ id: 'a' }] } })).toEqual([{ id: 'a' }]);
  });

  it('encontra o array em chaves comuns (affiliates, results)', () => {
    expect(extractArray({ affiliates: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(extractArray({ results: [{ id: 2 }] })).toEqual([{ id: 2 }]);
  });

  it('faz fallback para qualquer array não-vazio aninhado', () => {
    expect(extractArray({ meta: {}, payloadX: [{ id: 9 }] })).toEqual([{ id: 9 }]);
  });

  it('retorna [] quando não há array', () => {
    expect(extractArray({ foo: 'bar', count: 0 })).toEqual([]);
  });
});

describe('isNoDataError', () => {
  it('reconhece o código 040 / 40', () => {
    expect(isNoDataError('040', '')).toBe(true);
    expect(isNoDataError('40', '')).toBe(true);
  });

  it('reconhece mensagens de "sem dados"', () => {
    expect(isNoDataError('', 'Nenhum dado encontrado')).toBe(true);
    expect(isNoDataError('', 'no data available')).toBe(true);
    expect(isNoDataError('', 'not found')).toBe(true);
  });

  it('não trata erro real como no-data', () => {
    expect(isNoDataError('500', 'internal error')).toBe(false);
  });
});

describe('messageLooksLikeError', () => {
  it('detecta palavras de erro', () => {
    expect(messageLooksLikeError('Ocorreu um erro')).toBe(true);
    expect(messageLooksLikeError('unauthorized')).toBe(true);
    expect(messageLooksLikeError('forbidden')).toBe(true);
  });

  it('ignora mensagens neutras', () => {
    expect(messageLooksLikeError('tudo certo')).toBe(false);
    expect(messageLooksLikeError('')).toBe(false);
  });
});

describe('extractApiError', () => {
  it('retorna null para não-objeto', () => {
    expect(extractApiError(null)).toBeNull();
    expect(extractApiError('texto')).toBeNull();
  });

  it('retorna null para payload de sucesso', () => {
    expect(extractApiError({ success: true, data: [{ id: 1 }] })).toBeNull();
  });

  it('marca noData=true para o código 040', () => {
    const err = extractApiError({ code: '040', message: 'Nenhum dado' });
    expect(err).not.toBeNull();
    expect(err?.noData).toBe(true);
  });

  it('marca noData=false para falha explícita real', () => {
    const err = extractApiError({ success: false, code: '500', message: 'erro interno' });
    expect(err).not.toBeNull();
    expect(err?.noData).toBe(false);
    expect(err?.message).toBe('erro interno');
  });

  it('detecta erro por mensagem mesmo sem flag de sucesso', () => {
    const err = extractApiError({ message: 'unauthorized' });
    expect(err).not.toBeNull();
  });
});

describe('aggregateByCampaign', () => {
  it('retorna [] para entrada não-array / vazia', () => {
    expect(aggregateByCampaign(null as any)).toEqual([]);
    expect(aggregateByCampaign([])).toEqual([]);
  });

  it('soma as métricas de linhas da mesma campanha', () => {
    const rows = [
      { campaign_id: 'c1', campaign_name: 'Black Friday', total_commission: 100, registrations: 5, first_deposits: 3, deposit: 250, qualified_cpa: 2, rvs: 40 },
      { campaign_id: 'c1', campaign_name: 'Black Friday', total_commission: 50, registrations: 2, first_deposits: 1, deposit: 100, qualified_cpa: 1, rvs: 10 },
    ];
    const result = aggregateByCampaign(rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'c1',
      name: 'Black Friday',
      total_commission: 150,
      registrations: 7,
      first_deposits: 4,
      deposit: 350,
      qualified_cpa: 3,
      rvs: 50,
    });
  });

  it('mantém campanhas distintas separadas e ordena por comissão desc', () => {
    const rows = [
      { campaign_id: 'low', total_commission: 10 },
      { campaign_id: 'high', total_commission: 90 },
      { campaign_id: 'mid', total_commission: 40 },
    ];
    expect(aggregateByCampaign(rows).map((c) => c.id)).toEqual(['high', 'mid', 'low']);
  });

  it('faz fallback entre variações de nome de campo para id/nome', () => {
    const rows = [{ campaign: 'Promo X', total_commission: 5 }];
    const [row] = aggregateByCampaign(rows);
    expect(row.name).toBe('Promo X');
    expect(row.id).toBe('Promo X');
  });

  it('converte campos numéricos ausentes/inválidos para zero', () => {
    const rows = [{ campaign_id: 'c1', total_commission: 'oops', registrations: undefined }];
    const [row] = aggregateByCampaign(rows);
    expect(row.total_commission).toBe(0);
    expect(row.registrations).toBe(0);
  });
});

describe('buildSubToSpecialConfig', () => {
  const specials = {
    sp1: { affiliateId: 'sp1', active: true, subAffiliateIds: ['subA', 'subB'] },
    sp2: { affiliateId: 'sp2', active: false, subAffiliateIds: ['subC'] },
  } as any;
  const configs = {
    sp1: { affiliateId: 'sp1', cpaValue: 200, revPercentage: 10 },
    sp2: { affiliateId: 'sp2', cpaValue: 150, revPercentage: 5 },
  } as any;

  it('mapeia cada sub para a config do especial-pai (só ativos por padrão)', () => {
    const map = buildSubToSpecialConfig(specials, configs);
    expect(map.subA).toEqual(configs.sp1);
    expect(map.subB).toEqual(configs.sp1);
    expect(map.subC).toBeUndefined(); // sp2 inativo
  });

  it('inclui especiais inativos quando activeOnly=false', () => {
    const map = buildSubToSpecialConfig(specials, configs, { activeOnly: false });
    expect(map.subC).toEqual(configs.sp2);
  });

  it('ignora especial sem config de taxa', () => {
    const map = buildSubToSpecialConfig(specials, { sp2: configs.sp2 } as any);
    expect(map.subA).toBeUndefined();
  });
});

describe('calcAgencyNetProfit', () => {
  // Cluster de especial: pai sp1 (R$200/CPA) com 1 sub a R$30/CPA. A agência paga
  // o sub pela taxa do PAI (R$200), não a R$30 → repasse maior, lucro menor.
  const results = [
    { id: 'sp1', total_commission: 1000, qualified_cpa: 2, rvs: 0 },   // pai: repasse 2×200 = 400
    { id: 'subA', total_commission: 500, qualified_cpa: 3, rvs: 0 },   // sub: 3×200 = 600 (não 3×30=90)
    { id: 'x', total_commission: 100, qualified_cpa: 1, rvs: 0 },      // avulso: 1×50 = 50
  ];
  const configs = {
    sp1: { affiliateId: 'sp1', cpaValue: 200, revPercentage: 0 },
    subA: { affiliateId: 'subA', cpaValue: 30, revPercentage: 0 },
    x: { affiliateId: 'x', cpaValue: 50, revPercentage: 0 },
  } as any;

  it('cobra o sub pela taxa do especial-pai (corrige a superestimativa do lucro)', () => {
    const subMap = buildSubToSpecialConfig(
      { sp1: { affiliateId: 'sp1', active: true, subAffiliateIds: ['subA'] } } as any,
      configs
    );
    const r = calcAgencyNetProfit(results, configs, subMap);
    expect(r.commission).toBe(1600);          // 1000+500+100
    expect(r.payout).toBe(400 + 600 + 50);     // sub a R$200, não R$30
    expect(r.netProfit).toBe(1600 - 1050);     // 550
  });

  it('sem mapa de sub, cobra cada um pela própria taxa (sub a R$30)', () => {
    const r = calcAgencyNetProfit(results, configs, {});
    expect(r.payout).toBe(400 + 90 + 50);      // sub a R$30
    expect(r.netProfit).toBe(1600 - 540);      // 1060 (superestimado vs 550)
  });

  it('cada afiliado entra uma vez (sem double-count) e tolera entrada vazia', () => {
    expect(calcAgencyNetProfit([], configs, {})).toEqual({ commission: 0, payout: 0, netProfit: 0 });
    expect(calcAgencyNetProfit(null as any, configs, {}).netProfit).toBe(0);
  });
});
