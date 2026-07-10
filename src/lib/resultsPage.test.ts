import { describe, it, expect } from 'vitest';
import { parseResultsPage, MAX_RESULT_PAGES } from './resultsPage';

// Regressão da discrepância OTG×Boost de jun/2026: o results é PAGINADO
// (pageSize=50) e o client lia só a página 1 — 72 afiliados no range → o
// headline do /admin perdia 22 linhas (R$ 3.646,75 na Superbet).
describe('parseResultsPage · shapes do results v2', () => {
  it('shape paginado { data: { data: [...], meta: { totalPages } } }', () => {
    const body = { data: { data: [{ id: 'a' }, { id: 'b' }], meta: { currentPage: 1, totalPages: 2, totalRows: 72, pageSize: 50 } } };
    expect(parseResultsPage(body)).toEqual({ rows: [{ id: 'a' }, { id: 'b' }], totalPages: 2 });
  });

  it('data array direto (sem meta) → 1 página', () => {
    expect(parseResultsPage({ data: [{ id: 'a' }] })).toEqual({ rows: [{ id: 'a' }], totalPages: 1 });
  });

  it('body array cru → 1 página', () => {
    expect(parseResultsPage([{ id: 'a' }])).toEqual({ rows: [{ id: 'a' }], totalPages: 1 });
  });

  it('vazio/nulo → sem linhas, 1 página', () => {
    expect(parseResultsPage(null)).toEqual({ rows: [], totalPages: 1 });
    expect(parseResultsPage({ data: [] })).toEqual({ rows: [], totalPages: 1 });
    expect(parseResultsPage({})).toEqual({ rows: [], totalPages: 1 });
  });

  it('meta malformado (totalPages 0, negativo, NaN, string não-numérica) → 1 página', () => {
    for (const tp of [0, -3, NaN, 'x', null, undefined]) {
      const body = { data: { data: [{ id: 'a' }], meta: { totalPages: tp } } };
      expect(parseResultsPage(body).totalPages).toBe(1);
    }
  });

  it('totalPages numérico como string ("2") é aceito', () => {
    const body = { data: { data: [], meta: { totalPages: '2' } } };
    expect(parseResultsPage(body).totalPages).toBe(2);
  });

  it('teto de páginas espelha o guarda do servidor', () => {
    expect(MAX_RESULT_PAGES).toBe(50);
  });
});
