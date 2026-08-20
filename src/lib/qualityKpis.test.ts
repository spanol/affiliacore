import { describe, it, expect } from 'vitest';
import { sumQualityTotals, buildQualityItems, formatQualityValue, hasQualityData } from './qualityKpis';

describe('sumQualityTotals · ausência ≠ 0 (mesma regra do funil)', () => {
  it('soma canônicas sempre e opcionais só quando alguma linha as trouxe', () => {
    const t = sumQualityTotals([
      { first_deposits: 3, deposit: 300, net_deposits: 100, net_pl: 40 },
      { first_deposits: 2, deposit: 200 }, // linha OTG/antiga: sem os campos
    ]);
    expect(t.first_deposits).toBe(5);
    expect(t.deposit).toBe(500);
    expect(t.net_deposits).toBe(100);
    expect(t.net_pl).toBe(40);
  });

  it('nenhuma linha com os campos → opcionais AUSENTES (não 0)', () => {
    const t = sumQualityTotals([{ first_deposits: 1, deposit: 50 }]);
    expect(t.net_deposits).toBeUndefined();
    expect(t.net_pl).toBeUndefined();
    expect(hasQualityData(t)).toBe(false);
  });

  it('preserva o SINAL: PL e líquido negativos somam sem abs/clamp', () => {
    const t = sumQualityTotals([
      { first_deposits: 1, deposit: 1168.5, net_deposits: -600.96, net_pl: -307.13 },
      { first_deposits: 0, deposit: 0, net_deposits: 100, net_pl: 50 },
    ]);
    expect(t.net_deposits).toBeCloseTo(-500.96);
    expect(t.net_pl).toBeCloseTo(-257.13);
  });

  it('lista vazia/null → totais zerados sem opcionais', () => {
    expect(sumQualityTotals(null)).toEqual({ first_deposits: 0, deposit: 0 });
    expect(sumQualityTotals([])).toEqual({ first_deposits: 0, deposit: 0 });
  });
});

describe('buildQualityItems · derivados e sinalização', () => {
  it('deriva líquido por FTD e retenção quando há dado e divisor', () => {
    const items = buildQualityItems({ first_deposits: 4, deposit: 400, net_deposits: 200, net_pl: 80 });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.net_per_ftd.value).toBe(50);
    expect(byKey.retention.value).toBe(0.5);
    expect(byKey.net_pl.negative).toBe(false);
  });

  it('opcional ausente → valor null em tudo que depende dele (nunca 0 fabricado)', () => {
    const items = buildQualityItems({ first_deposits: 4, deposit: 400 });
    for (const i of items) expect(i.value).toBeNull();
  });

  it('divisor zero → derivado null (FTD 0 não vira líquido infinito)', () => {
    const items = buildQualityItems({ first_deposits: 0, deposit: 0, net_deposits: 100 });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.net_per_ftd.value).toBeNull();
    expect(byKey.retention.value).toBeNull();
    expect(byKey.net_deposits.value).toBe(100);
  });

  it('PL negativo é sinalizado (caça-bônus de julho/2026: a origem do card)', () => {
    const items = buildQualityItems({ first_deposits: 1, deposit: 1168.5, net_deposits: -600.96, net_pl: -307.13 });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.net_pl.negative).toBe(true);
    expect(byKey.net_deposits.negative).toBe(true);
    expect(byKey.net_per_ftd.negative).toBe(true);
    expect(byKey.retention.negative).toBe(true);
  });
});

describe('formatQualityValue', () => {
  it('formata dinheiro pt-BR, percentual e indisponível', () => {
    expect(formatQualityValue({ key: 'net_pl', label: '', kind: 'money', value: -307.13, negative: true }))
      .toBe('R$ -307,13');
    expect(formatQualityValue({ key: 'retention', label: '', kind: 'percent', value: 0.0653, negative: false }))
      .toBe('6,5%');
    expect(formatQualityValue({ key: 'net_deposits', label: '', kind: 'money', value: null, negative: false }))
      .toBe('—');
  });
});
