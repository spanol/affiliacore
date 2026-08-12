import { describe, it, expect } from 'vitest';
import { sumFunnelTotals, buildFunnelItems, formatFunnelValue } from './funnel';

describe('sumFunnelTotals', () => {
  it('soma as canônicas sempre e as opcionais só quando alguma linha as trouxe', () => {
    const t = sumFunnelTotals([
      { registrations: 3, first_deposits: 2, deposit: 100, qualified_cpa: 1 }, // OTG (sem funil opcional)
      { registrations: 1, first_deposits: 1, deposit: 50, qualified_cpa: 0, visits: 40, deposit_count: 5 }, // Esportiva
    ]);
    expect(t).toMatchObject({ registrations: 4, first_deposits: 3, deposit: 150, qualified_cpa: 1, visits: 40, deposit_count: 5 });
  });

  it('nenhuma linha com opcional → chave AUSENTE (não 0)', () => {
    const t = sumFunnelTotals([{ registrations: 2, first_deposits: 1, deposit: 10, qualified_cpa: 0 }]);
    expect(t.visits).toBeUndefined();
    expect(t.deposit_count).toBeUndefined();
  });

  it('entrada vazia/nula não quebra', () => {
    expect(sumFunnelTotals([])).toMatchObject({ registrations: 0, deposit: 0 });
    expect(sumFunnelTotals(null)).toMatchObject({ registrations: 0 });
  });
});

describe('buildFunnelItems — ordem do painel da Esportiva (call 12/08)', () => {
  const totals = { visits: 321, registrations: 75, first_deposits: 49, deposit_count: 120, deposit: 9800, qualified_cpa: 47 };

  it('segue a ordem: cliques → cadastros → FTD → qtd dep → valor dep → média → ticket → CPA', () => {
    expect(buildFunnelItems(totals).map((i) => i.key)).toEqual([
      'visits', 'registrations', 'first_deposits', 'deposit_count',
      'deposit', 'avg_deposit', 'avg_ticket', 'qualified_cpa',
    ]);
  });

  it('ticket médio = depósito total ÷ FTD; média de depósito = depósito total ÷ qtd', () => {
    const items = buildFunnelItems(totals);
    expect(items.find((i) => i.key === 'avg_ticket')?.value).toBeCloseTo(9800 / 49);
    expect(items.find((i) => i.key === 'avg_deposit')?.value).toBeCloseTo(9800 / 120);
  });

  it('fonte que não informa clique/qtd → null (e os derivados dela também)', () => {
    const items = buildFunnelItems({ registrations: 5, first_deposits: 2, deposit: 100, qualified_cpa: 1 });
    expect(items.find((i) => i.key === 'visits')?.value).toBeNull();
    expect(items.find((i) => i.key === 'deposit_count')?.value).toBeNull();
    expect(items.find((i) => i.key === 'avg_deposit')?.value).toBeNull(); // sem qtd não há média
    expect(items.find((i) => i.key === 'avg_ticket')?.value).toBeCloseTo(50); // FTD existe → ticket sai
  });

  it('divisor zero não vira Infinity — ticket médio sem FTD é null', () => {
    const items = buildFunnelItems({ registrations: 5, first_deposits: 0, deposit: 100, qualified_cpa: 0, deposit_count: 0 });
    expect(items.find((i) => i.key === 'avg_ticket')?.value).toBeNull();
    expect(items.find((i) => i.key === 'avg_deposit')?.value).toBeNull();
  });
});

describe('formatFunnelValue', () => {
  it('null → travessão; dinheiro em pt-BR; contagem em pt-BR', () => {
    expect(formatFunnelValue({ key: 'visits', label: 'x', kind: 'count', value: null })).toBe('—');
    expect(formatFunnelValue({ key: 'deposit', label: 'x', kind: 'money', value: 1234.5 })).toBe('R$ 1.234,50');
    expect(formatFunnelValue({ key: 'visits', label: 'x', kind: 'count', value: 4321 })).toBe('4.321');
  });
});
