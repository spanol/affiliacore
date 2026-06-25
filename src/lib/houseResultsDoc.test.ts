import { describe, it, expect } from 'vitest';
import { hrDocId, sanitizeMetrics, HR_METRICS } from './houseResultsDoc';

describe('hrDocId (P2.8 · id determinístico = reimport idempotente)', () => {
  it('monta casa__data__afiliado', () => {
    expect(hrDocId('superbet', '2026-06-01', 'aff1')).toBe('superbet__2026-06-01__aff1');
  });

  it('afiliado null vira a linha agregada (agg)', () => {
    expect(hrDocId('superbet', '2026-06-01', null)).toBe('superbet__2026-06-01__agg');
  });

  it('é determinístico — mesmos (slug,date,aff) → mesmo id (idempotência)', () => {
    expect(hrDocId('sb', '2026-06-10', 'x')).toBe(hrDocId('sb', '2026-06-10', 'x'));
  });

  it('distingue agregado de atribuído no MESMO dia (ids diferentes, não colidem)', () => {
    expect(hrDocId('sb', '2026-06-10', null)).not.toBe(hrDocId('sb', '2026-06-10', 'aff1'));
  });

  it('distingue casas diferentes no mesmo dia (slug entra no id)', () => {
    expect(hrDocId('sb', '2026-06-10', 'x')).not.toBe(hrDocId('superbet', '2026-06-10', 'x'));
  });

  it("sanitiza '/' (proibido em doc id do Firestore)", () => {
    expect(hrDocId('casa/x', '2026-06-01', 'a/b')).toBe('casa_x__2026-06-01__a_b');
  });
});

describe('sanitizeMetrics (P2.8 · coage as 6 métricas, descarta extras)', () => {
  it('coage strings numéricas e mantém números', () => {
    const out = sanitizeMetrics({ registrations: '10', rvs: 2.5, deposit: '100.50' });
    expect(out.registrations).toBe(10);
    expect(out.rvs).toBe(2.5);
    expect(out.deposit).toBe(100.5);
  });

  it('NaN/inválido/ausente → 0 (nunca NaN)', () => {
    const out = sanitizeMetrics({ registrations: 'abc', rvs: null, deposit: undefined });
    expect(out.registrations).toBe(0);
    expect(out.rvs).toBe(0);
    expect(out.deposit).toBe(0);
    expect(out.qualified_cpa).toBe(0); // ausente
    for (const k of HR_METRICS) expect(Number.isNaN(out[k])).toBe(false);
  });

  it('preenche TODAS as 6 métricas mesmo com src vazio/null', () => {
    const out = sanitizeMetrics(null);
    expect(Object.keys(out).sort()).toEqual([...HR_METRICS].sort());
    for (const k of HR_METRICS) expect(out[k]).toBe(0);
  });

  it('descarta campos extras (não vaza affiliateLabel/line/etc.)', () => {
    const out = sanitizeMetrics({ registrations: 1, affiliateLabel: 'Fulano', line: 7, junk: 'x' });
    expect(out).not.toHaveProperty('affiliateLabel');
    expect(out).not.toHaveProperty('line');
    expect(out).not.toHaveProperty('junk');
    expect(Object.keys(out).sort()).toEqual([...HR_METRICS].sort());
  });
});
