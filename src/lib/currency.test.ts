import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  eurToBrl, parseEurBrlRate, formatBrl, fetchEurBrlRate, getCachedEurBrlRate,
  FALLBACK_EUR_BRL, resolveCpaCurrency, houseCpaToBrl, parseHouseCpaInput,
  convertHouseCpaInput,
} from './currency';

describe('eurToBrl', () => {
  it('multiplica EUR pela cotação', () => {
    expect(eurToBrl(30, 5.9)).toBeCloseTo(177);
    expect(eurToBrl(150, 6)).toBe(900);
  });

  it('guarda contra null/NaN/objeto (nunca propaga NaN)', () => {
    expect(eurToBrl(null, 6)).toBe(0);
    expect(eurToBrl(undefined, 6)).toBe(0);
    expect(eurToBrl(10, NaN)).toBe(0);
    expect(eurToBrl('abc' as any, 6)).toBe(0);
    expect(eurToBrl({} as any, 6)).toBe(0);
  });
});

describe('parseEurBrlRate', () => {
  it('extrai o bid da resposta da AwesomeAPI', () => {
    expect(parseEurBrlRate({ EURBRL: { bid: '5.91017', ask: '5.92417' } })).toBeCloseTo(5.91017);
  });

  it('cai p/ ask quando não há bid', () => {
    expect(parseEurBrlRate({ EURBRL: { ask: '6.10' } })).toBeCloseTo(6.1);
  });

  it('devolve null quando a forma não bate ou o valor é inválido', () => {
    expect(parseEurBrlRate({})).toBeNull();
    expect(parseEurBrlRate(null)).toBeNull();
    expect(parseEurBrlRate({ EURBRL: { bid: 'x' } })).toBeNull();
    expect(parseEurBrlRate({ EURBRL: { bid: '0' } })).toBeNull();
  });
});

describe('resolveCpaCurrency', () => {
  it('AUSÊNCIA = EUR (o defaultCpa histórico está todo em euro)', () => {
    expect(resolveCpaCurrency(undefined)).toBe('EUR');
    expect(resolveCpaCurrency(null)).toBe('EUR');
    expect(resolveCpaCurrency('')).toBe('EUR');
    expect(resolveCpaCurrency('lixo')).toBe('EUR');
  });

  it('só BRL explícito (qualquer caixa) tira a casa da conversão', () => {
    expect(resolveCpaCurrency('BRL')).toBe('BRL');
    expect(resolveCpaCurrency('brl')).toBe('BRL');
    expect(resolveCpaCurrency(' Brl ')).toBe('BRL');
    expect(resolveCpaCurrency('EUR')).toBe('EUR');
  });
});

describe('houseCpaToBrl', () => {
  it('EUR converte pela cotação; BRL é o valor exato', () => {
    expect(houseCpaToBrl(30, 'EUR', 5.9)).toBeCloseTo(177);
    expect(houseCpaToBrl(120, 'BRL', 5.9)).toBe(120);
  });

  it('casa antiga (sem moeda) segue convertendo — nenhum valor muda de sentido', () => {
    expect(houseCpaToBrl(40, undefined, 6)).toBe(240);
  });

  it('BRL não depende da cotação (nem quebra com cotação inválida)', () => {
    expect(houseCpaToBrl(120.5, 'BRL', NaN)).toBe(120.5);
    expect(houseCpaToBrl(null, 'BRL', 6)).toBe(0);
  });
});

describe('parseHouseCpaInput', () => {
  it('EUR é inteiro; BRL aceita centavos', () => {
    expect(parseHouseCpaInput('30', 'EUR')).toBe(30);
    expect(parseHouseCpaInput('30.9', 'EUR')).toBe(30);
    expect(parseHouseCpaInput('120.50', 'BRL')).toBe(120.5);
  });

  it('aceita vírgula pt-BR (num() só entende ponto)', () => {
    expect(parseHouseCpaInput('120,50', 'BRL')).toBe(120.5);
  });

  it('vazio/inválido é null, NUNCA 0 (ausência ≠ R$0)', () => {
    expect(parseHouseCpaInput('', 'BRL')).toBeNull();
    expect(parseHouseCpaInput('   ', 'EUR')).toBeNull();
    expect(parseHouseCpaInput('abc', 'BRL')).toBeNull();
    expect(parseHouseCpaInput('-10', 'BRL')).toBeNull();
  });
});

describe('convertHouseCpaInput', () => {
  it('preserva o R$ efetivo ao trocar a moeda do campo', () => {
    expect(convertHouseCpaInput('30', 'EUR', 'BRL', 5.9)).toBe('177');
    expect(convertHouseCpaInput('177', 'BRL', 'EUR', 5.9)).toBe('30');
  });

  it('arredonda a volta p/ euro (177 ÷ 5,9 = 29,99… não pode virar 29)', () => {
    expect(convertHouseCpaInput('120,50', 'BRL', 'EUR', 6)).toBe('20');
  });

  it('mesma moeda ou campo vazio não inventa valor', () => {
    expect(convertHouseCpaInput('30', 'EUR', 'EUR', 5.9)).toBe('30');
    expect(convertHouseCpaInput('', 'EUR', 'BRL', 5.9)).toBe('');
  });

  it('sem cotação válida mantém o valor (não zera o CPA da casa)', () => {
    expect(convertHouseCpaInput('30', 'EUR', 'BRL', 0)).toBe('30');
    expect(convertHouseCpaInput('30', 'EUR', 'BRL', NaN)).toBe('30');
  });
});

describe('formatBrl', () => {
  it('formata em R$ pt-BR e guarda NaN', () => {
    expect(formatBrl(887)).toContain('887,00');
    expect(formatBrl(null)).toContain('0,00');
  });
});

describe('fetchEurBrlRate', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('em falha mantém o fallback (não quebra a tela)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const q = await fetchEurBrlRate(true);
    expect(q.rate).toBe(FALLBACK_EUR_BRL);
    expect(q.live).toBe(false);
  });

  it('atualiza o cache com a cotação ao vivo no sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ EURBRL: { bid: '5.85' } }),
    }));
    const q = await fetchEurBrlRate(true);
    expect(q.rate).toBeCloseTo(5.85);
    expect(q.live).toBe(true);
    expect(getCachedEurBrlRate()).toBeCloseTo(5.85);
  });

  it('reusa o cache dentro do TTL (não refaz o fetch)', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ EURBRL: { bid: '5.70' } }) });
    vi.stubGlobal('fetch', spy);
    await fetchEurBrlRate(true);     // popula o cache (1 chamada)
    await fetchEurBrlRate();          // dentro do TTL → sem novo fetch
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
