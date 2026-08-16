import { describe, it, expect } from 'vitest';
import { resolveIssPercent, issRateMap, computeNetPayout, computeNetPayoutWindows, housesMissingIss, ISS_MAX_PERCENT } from './tax';
import type { AffiliateConfig } from './commission';
import { projectConfigAt, EPOCH_DAY } from './rateHistory';

const config = (over: Partial<AffiliateConfig> = {}): AffiliateConfig =>
  ({ affiliateId: 'A1', cpaValue: 0, revPercentage: 0, ...over } as AffiliateConfig);

describe('resolveIssPercent', () => {
  it('ausência = 0% (nunca inventa retenção)', () => {
    expect(resolveIssPercent(undefined)).toBe(0);
    expect(resolveIssPercent({})).toBe(0);
    expect(resolveIssPercent({ issPercent: null })).toBe(0);
  });
  it('valor válido passa; negativo e lixo caem para 0', () => {
    expect(resolveIssPercent({ issPercent: 5 })).toBe(5);
    expect(resolveIssPercent({ issPercent: -3 })).toBe(0);
    expect(resolveIssPercent({ issPercent: 'abc' as any })).toBe(0);
  });
  it('teto de 100%', () => {
    expect(resolveIssPercent({ issPercent: 250 })).toBe(ISS_MAX_PERCENT);
  });
});

describe('issRateMap', () => {
  it('indexa por brandId E por slug (a linha pode vir por qualquer um)', () => {
    const map = issRateMap([{ id: 'otg-1', slug: 'superbet', issPercent: 5 }]);
    expect(map['otg-1']).toBe(5);
    expect(map['superbet']).toBe(5);
  });
  it('casa sem alíquota não entra no mapa', () => {
    expect(issRateMap([{ slug: 'stake' }, { slug: 'kto', issPercent: 0 }])).toEqual({});
  });
});

describe('computeNetPayout', () => {
  // Reproduz o legado da Infinity: alíquota DIFERENTE por casa.
  const rows = [
    { id: 'superbetv2', qualified_cpa: 67, rvs: 0 },
    { id: 'stake', qualified_cpa: 58, rvs: 0 },
    { id: 'esportiva', qualified_cpa: 50, rvs: 0 },
  ];
  const cfg = config({
    cpaValue: 0,
    byBrand: { superbetv2: { cpaValue: 280 }, stake: { cpaValue: 160 }, esportiva: { cpaValue: 110 } },
  } as any);
  const iss = issRateMap([
    { slug: 'superbetv2', issPercent: 5 },
    { slug: 'stake', issPercent: 2 },
    { slug: 'esportiva', issPercent: 2 },
  ]);

  it('reconcilia com o passivo real do legado (bruto 33.540 / ISS 1.233,60 / líquido 32.306,40)', () => {
    const r = computeNetPayout(rows, cfg, iss);
    expect(r.gross).toBe(33_540);
    expect(r.iss).toBe(1_233.6);
    expect(r.net).toBe(32_306.4);
  });

  it('a alíquota é aplicada POR CASA, não uma média', () => {
    const r = computeNetPayout(rows, cfg, iss);
    const byKey = Object.fromEntries(r.lines.map((l) => [l.brandKey, l]));
    expect(byKey.superbetv2).toMatchObject({ gross: 18_760, issPercent: 5, iss: 938, net: 17_822 });
    expect(byKey.stake).toMatchObject({ gross: 9_280, issPercent: 2, iss: 185.6, net: 9_094.4 });
    expect(byKey.esportiva).toMatchObject({ gross: 5_500, issPercent: 2, iss: 110, net: 5_390 });
  });

  it('total é a SOMA das linhas exibidas (sem divergência de centavo)', () => {
    const r = computeNetPayout(
      [
        { id: 'a', qualified_cpa: 1, rvs: 0 },
        { id: 'b', qualified_cpa: 1, rvs: 0 },
        { id: 'c', qualified_cpa: 1, rvs: 0 },
      ],
      config({ cpaValue: 33.33 }),
      { a: 3.5, b: 3.5, c: 3.5 },
    );
    expect(r.iss).toBe(r.lines.reduce((s, l) => s + l.iss, 0));
    // `net` é arredondado em centavos — o float cru (gross - iss) dá
    // 96.47999999999999, e é exatamente essa sujeira que o arredondamento tira
    // da tela. Comparar com toBeCloseTo afirma o valor sem reintroduzi-la.
    expect(r.net).toBeCloseTo(r.gross - r.iss, 2);
    expect(String(r.net)).not.toMatch(/\d{5,}$/);
  });

  it('casa sem alíquota não retém nada (líquido = bruto)', () => {
    const r = computeNetPayout([{ id: 'kto', qualified_cpa: 10, rvs: 0 }], config({ cpaValue: 100 }), {});
    expect(r.lines[0]).toMatchObject({ gross: 1_000, issPercent: 0, iss: 0, net: 1_000 });
  });

  it('repasse negativo (RevShare negativo da casa) não gera imposto a reter', () => {
    const r = computeNetPayout([{ id: 'esportiva', qualified_cpa: 0, rvs: -500 }], config({ revPercentage: 30 }), {
      esportiva: 2,
    });
    expect(r.lines[0].gross).toBeLessThan(0);
    expect(r.lines[0].iss).toBe(0);
    expect(r.lines[0].net).toBe(r.lines[0].gross);
  });

  it('respeita a taxa byBrand (não reimplementa a fórmula)', () => {
    const r = computeNetPayout(
      [{ id: 'stake', qualified_cpa: 10, rvs: 0 }],
      config({ cpaValue: 100, byBrand: { stake: { cpaValue: 160 } } } as any),
      {},
    );
    expect(r.gross).toBe(1_600); // override da casa, não os 100 do topo
  });

  it('entrada vazia/nula devolve zeros', () => {
    expect(computeNetPayout(null, null, null)).toEqual({ lines: [], gross: 0, iss: 0, net: 0 });
  });
});

describe('computeNetPayoutWindows · apuração somando janelas de vigência', () => {
  const iss = issRateMap([{ slug: 'esportiva', issPercent: 2 }]);

  it('uma janela só devolve exatamente o mesmo que computeNetPayout (o parque de hoje)', () => {
    const rows = [{ id: 'esportiva', qualified_cpa: 10, rvs: 0 }];
    const cfg = config({ byBrand: { esportiva: { cpaValue: 110 } } } as any);
    expect(computeNetPayoutWindows([{ rows, config: cfg }], iss)).toEqual(computeNetPayout(rows, cfg, iss));
  });

  // O caso que a feature existe para resolver: o gerente baixou a comissão de 110
  // para 80, e o que o afiliado gerou ANTES continua valendo 110.
  it('soma cada janela com a taxa que valia nela', () => {
    const cfg = config({
      byBrand: {
        esportiva: {
          cpaValue: 80, since: '2026-08-16',
          history: [{ from: EPOCH_DAY, to: '2026-08-15', cpaValue: 110 }],
        },
      },
    } as any);
    const r = computeNetPayoutWindows([
      { rows: [{ id: 'esportiva', qualified_cpa: 10, rvs: 0 }], config: projectConfigAt(cfg, '2026-08-01') },
      { rows: [{ id: 'esportiva', qualified_cpa: 10, rvs: 0 }], config: projectConfigAt(cfg, '2026-08-16') },
    ], iss);
    expect(r.gross).toBe(1_900); // 10×110 + 10×80, e não 10×80 + 10×80
    // e o detalhamento continua sendo UMA linha por casa, não uma por casa×janela
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ brandKey: 'esportiva', gross: 1_900 });
    expect(r.net).toBe(1_862); // ISS 2% sobre o bruto somado
  });

  it('funde as linhas por casa entre janelas, sem duplicar casa', () => {
    const cfg = config({ byBrand: { esportiva: { cpaValue: 100 }, leon: { cpaValue: 50 } } } as any);
    const r = computeNetPayoutWindows([
      { rows: [{ id: 'esportiva', qualified_cpa: 1, rvs: 0 }, { id: 'leon', qualified_cpa: 1, rvs: 0 }], config: cfg },
      { rows: [{ id: 'esportiva', qualified_cpa: 2, rvs: 0 }], config: cfg },
    ], iss);
    expect(r.lines.map((l) => l.brandKey).sort()).toEqual(['esportiva', 'leon']);
    expect(r.lines.find((l) => l.brandKey === 'esportiva')!.gross).toBe(300);
    expect(r.gross).toBe(350);
  });

  it('entrada vazia/nula devolve zeros', () => {
    expect(computeNetPayoutWindows(null, null)).toEqual({ lines: [], gross: 0, iss: 0, net: 0 });
    expect(computeNetPayoutWindows([], {})).toEqual({ lines: [], gross: 0, iss: 0, net: 0 });
  });
});

describe('housesMissingIss', () => {
  it('lista as ativas sem alíquota e ignora as inativas', () => {
    const out = housesMissingIss([
      { slug: 'a', issPercent: 5, active: true },
      { slug: 'b', active: true },
      { slug: 'c', active: false },
    ]);
    expect(out.map((h) => h.slug)).toEqual(['b']);
  });
});
