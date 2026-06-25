import { describe, it, expect } from 'vitest';
import { mapAnalyticsRows, indexFunnelByKey } from './otgAnalytics';

// Shape REAL capturado de GET /api/v1/agency/sportingbet-analytics (2026-06-25).
const realRows = [
  { affiliate: 'HelderDosSantosCavalheiro', campaign: null, clicks: 164, registrations: 47, ftd: 12, cpa_qual: 10, deposits: 4645.05, bet_amount: 62332.32, ngr: 1467.96 },
  { affiliate: 'LucasGuimaraes', campaign: null, clicks: 20, registrations: 4, ftd: 0, cpa_qual: 0, deposits: 0, bet_amount: 0, ngr: 0 },
];

describe('mapAnalyticsRows · normaliza o funil da v1 analítica', () => {
  it('mapeia a linha do Lucas (só-funil) com nameKey casável ao pré-cadastro', () => {
    const rows = mapAnalyticsRows(realRows, 'sportingbet');
    expect(rows).toHaveLength(2);
    const lucas = rows.find((r) => r.nameKey === 'lucasguimaraes')!;
    expect(lucas).toMatchObject({
      nameKey: 'lucasguimaraes', // == nameKey do pending_lucasguimaraes_sportingbet
      affiliate: 'LucasGuimaraes',
      house: 'sportingbet',
      clicks: 20,
      registrations: 4,
      ftd: 0,
      cpaQual: 0,
      ngr: 0,
    });
  });

  it('preserva métricas monetizadas (NGR, depósitos, handle) de quem produziu', () => {
    const helder = mapAnalyticsRows(realRows, 'sportingbet')[0];
    expect(helder).toMatchObject({ clicks: 164, registrations: 47, ftd: 12, cpaQual: 10, deposits: 4645.05, betAmount: 62332.32, ngr: 1467.96 });
  });

  it('coage métrica-lixo e ignora linha sem nome (num guarda NaN/objeto)', () => {
    const rows = mapAnalyticsRows([
      { affiliate: 'X', clicks: '12', registrations: null, ngr: 'abc' },
      { affiliate: '   ' }, // sem nome → descartada
      { clicks: 5 }, // sem nome → descartada
    ], 'superbet');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ affiliate: 'X', house: 'superbet', clicks: 12, registrations: 0, ngr: 0 });
  });

  it('entrada não-array → []', () => {
    expect(mapAnalyticsRows(null, 'sportingbet')).toEqual([]);
    expect(mapAnalyticsRows(undefined, 'sportingbet')).toEqual([]);
    expect(mapAnalyticsRows({} as any, 'sportingbet')).toEqual([]);
  });
});

describe('indexFunnelByKey · lookup por nameKey|casa', () => {
  it('indexa por nameKey|casa-normalizada', () => {
    const idx = indexFunnelByKey(mapAnalyticsRows(realRows, 'SportingBet'));
    expect(idx['lucasguimaraes|sportingbet'].clicks).toBe(20);
    expect(idx['helderdossantoscavalheiro|sportingbet'].ngr).toBe(1467.96);
  });

  it('chave repetida agrega as métricas (defensivo)', () => {
    const idx = indexFunnelByKey([
      { nameKey: 'a', affiliate: 'A', house: 'sportingbet', clicks: 3, registrations: 1, ftd: 0, cpaQual: 0, deposits: 0, betAmount: 0, ngr: 0 },
      { nameKey: 'a', affiliate: 'A', house: 'sportingbet', clicks: 2, registrations: 1, ftd: 1, cpaQual: 0, deposits: 0, betAmount: 0, ngr: 0 },
    ]);
    expect(idx['a|sportingbet']).toMatchObject({ clicks: 5, registrations: 2, ftd: 1 });
  });
});
