import { describe, it, expect } from 'vitest';
import { houseCommissionForRow } from './commission';

// Comissão BRUTA da casa (receita da agência) por linha manual: usa o total_commission
// importado quando houver; senão deriva da taxa PADRÃO da casa (defaultCpa/defaultRev).
describe('houseCommissionForRow', () => {
  it('usa o total_commission importado quando > 0 (ignora a taxa da casa)', () => {
    const row = { qualified_cpa: 5, rvs: 100, total_commission: 1250 };
    expect(houseCommissionForRow(row, { defaultCpa: 200, defaultRev: 30 })).toBe(1250);
  });

  it('deriva da taxa da casa quando comissao vem vazia (total_commission=0)', () => {
    const row = { qualified_cpa: 5, rvs: 0, total_commission: 0 };
    // 5 CPA × R$110 + 0 REV = 550
    expect(houseCommissionForRow(row, { defaultCpa: 110, defaultRev: 0 })).toBe(550);
  });

  it('deriva CPA + REV: cpa×defaultCpa + rvs×(defaultRev/100)', () => {
    const row = { qualified_cpa: 3, rvs: 200, total_commission: 0 };
    // 3×100 + 200×(25/100) = 300 + 50 = 350
    expect(houseCommissionForRow(row, { defaultCpa: 100, defaultRev: 25 })).toBe(350);
  });

  it('sem taxa da casa (null/ausente) e sem comissao → 0 (não inventa receita)', () => {
    const row = { qualified_cpa: 7, rvs: 50, total_commission: 0 };
    expect(houseCommissionForRow(row, null)).toBe(0);
    expect(houseCommissionForRow(row, undefined)).toBe(0);
    expect(houseCommissionForRow(row, { defaultCpa: null, defaultRev: null })).toBe(0);
  });

  it('guarda contra NaN/ausência (métrica string ou faltando → 0)', () => {
    expect(houseCommissionForRow({ qualified_cpa: 'x', total_commission: 0 }, { defaultCpa: 100 })).toBe(0);
    expect(houseCommissionForRow({}, { defaultCpa: 100, defaultRev: 10 })).toBe(0);
    expect(houseCommissionForRow({ qualified_cpa: 2, total_commission: 'abc' }, { defaultCpa: 100 })).toBe(200);
  });

  it('total_commission negativo/zero cai na derivação (fallback só conta > 0)', () => {
    expect(houseCommissionForRow({ qualified_cpa: 4, total_commission: 0 }, { defaultCpa: 50 })).toBe(200);
  });
});
