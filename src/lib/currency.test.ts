import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  eurToBrl, parseEurBrlRate, formatBrl, fetchEurBrlRate, getCachedEurBrlRate,
  FALLBACK_EUR_BRL,
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
