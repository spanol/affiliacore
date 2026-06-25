import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calcAffiliatePayout, resolveBrandRates, num } from './commission';

// Property-based (fast-check) dos invariantes de dinheiro — geram centenas de
// entradas aleatórias por execução, cobrindo casos que os exemplos fixos não pegam.
// Modelo de ameaça: as MÉTRICAS vêm da API externa (podem ser lixo string/null),
// as TAXAS vêm da config do admin (sempre finitas). num() guarda as métricas.

// Métrica adversarial: número, float, string pt/€, lixo, null, NaN, Infinity.
const metricArb = fc.oneof(
  fc.integer({ min: -1000, max: 1_000_000 }),
  fc.float({ min: -1e6, max: 1e6 }),
  fc.constantFrom('2', '2.5', '2,5', 'R$ 100', '1.000,50', 'abc', '', '   ', null, undefined, NaN, Infinity, -Infinity),
);
// Taxa realista: sempre finita (admin grava Number(x)||0) ou ausente.
const rateArb = fc.oneof(
  fc.nat({ max: 1000 }),
  fc.float({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom('50', '12.5', null, undefined, NaN),
);

describe('num() · propriedade: sempre devolve número finito', () => {
  it('para QUALQUER valor JSON (domínio real: resposta da API), num() é finito e não lança', () => {
    // fc.jsonValue() = o domínio que num() de fato vê (métricas vêm de JSON.parse):
    // null/bool/number/string/array/objeto-plano — INCLUI {"toString":false}, que
    // fazia Number() lançar antes do hardening. Agora num() é total sobre JSON.
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        expect(Number.isFinite(num(v))).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('calcAffiliatePayout · propriedade: métrica-lixo nunca vira NaN/Infinity', () => {
  it('com taxa finita, o payout é SEMPRE finito (num guarda a métrica)', () => {
    fc.assert(
      fc.property(metricArb, metricArb, rateArb, rateArb, (qcpa, rvs, cpaValue, revPercentage) => {
        const r = { qualified_cpa: qcpa, rvs } as any;
        const cfg = { affiliateId: 'x', cpaValue, revPercentage } as any;
        expect(Number.isFinite(calcAffiliatePayout(r, cfg))).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('resolveBrandRates · propriedade: override byBrand finito SEMPRE sobrepõe o topo', () => {
  const finiteRate = fc.oneof(fc.nat({ max: 1000 }), fc.float({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }));
  it('byBrand[brandId] finito vence o topo; sem brandId cai no topo', () => {
    fc.assert(
      fc.property(finiteRate, finiteRate, finiteRate, finiteRate, (topCpa, topRev, ovCpa, ovRev) => {
        const cfg = {
          affiliateId: 'x',
          cpaValue: topCpa,
          revPercentage: topRev,
          byBrand: { sb: { cpaValue: ovCpa, revPercentage: ovRev } },
        } as any;
        // com brandId 'sb' → usa o override
        expect(resolveBrandRates(cfg, 'sb')).toEqual({ cpaValue: ovCpa, revPercentage: ovRev });
        // sem brandId → usa o topo
        expect(resolveBrandRates(cfg)).toEqual({ cpaValue: topCpa, revPercentage: topRev });
        // brandId sem override → cai no topo
        expect(resolveBrandRates(cfg, 'inexistente')).toEqual({ cpaValue: topCpa, revPercentage: topRev });
      }),
      { numRuns: 500 },
    );
  });
});

describe('spread do especial · propriedade: ganho ≥ 0 quando a taxa do sub ≤ a do pai', () => {
  const nn = fc.nat({ max: 100000 }); // métrica não-negativa
  const rate = fc.float({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true });
  it('payout(pai) ≥ payout(sub) sobre as MESMAS métricas quando pai≥sub (spread nunca negativo)', () => {
    fc.assert(
      fc.property(nn, nn, rate, rate, rate, rate, (qcpa, rvs, subCpa, subRev, dCpa, dRev) => {
        const parentCpa = subCpa + dCpa; // pai ≥ sub
        const parentRev = subRev + dRev;
        const r = { qualified_cpa: qcpa, rvs } as any;
        const parentCfg = { affiliateId: 'p', cpaValue: parentCpa, revPercentage: parentRev } as any;
        const subCfg = { affiliateId: 's', cpaValue: subCpa, revPercentage: subRev } as any;
        const spread = calcAffiliatePayout(r, parentCfg) - calcAffiliatePayout(r, subCfg);
        expect(spread).toBeGreaterThanOrEqual(-1e-6); // ≥ 0 a menos de erro de ponto flutuante
      }),
      { numRuns: 1000 },
    );
  });
});
