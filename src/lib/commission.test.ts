import { describe, it, expect } from 'vitest';
import { houseCommissionForRow, houseCpaCommissionForRow } from './commission';

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

  it('total_commission ZERO cai na derivação (é o caso "planilha sem a coluna")', () => {
    expect(houseCommissionForRow({ qualified_cpa: 4, total_commission: 0 }, { defaultCpa: 50 })).toBe(200);
  });

  // Rev share negativo existe nessas casas e o pull grava o número como veio. Tratá-lo
  // como ausente mandava a linha pro fallback e o prejuízo virava receita.
  it('PRESERVA comissão negativa em vez de derivar (prejuízo não vira lucro)', () => {
    const row = { qualified_cpa: 10, rvs: -800, total_commission: -500 };
    expect(houseCommissionForRow(row, { defaultCpa: 120, defaultRev: 25 })).toBe(-500);
  });

  it('comissão negativa sem taxa da casa também é preservada (não vira 0)', () => {
    expect(houseCommissionForRow({ qualified_cpa: 0, total_commission: -120 }, null)).toBe(-120);
  });
});

// Parcela CPA da comissão — usada só quando a casa está com "REV fora do lucro".
describe('houseCpaCommissionForRow', () => {
  it('usa o cpa_commission informado pela fonte (não remonta por contagem × régua)', () => {
    // A contagem do TAP nasce de uma divisão arredondada: 5.640/120 = 47 exatos, mas
    // 5.700/120 = 47,5 → 48 → 48×120 = 5.760, R$ 60 a mais que a casa pagou.
    const row = { qualified_cpa: 48, cpa_commission: 5700 };
    expect(houseCpaCommissionForRow(row, { defaultCpa: 120 })).toBe(5700);
  });

  it('cpa_commission zero é um valor, não ausência (dia sem CPA não vira régua)', () => {
    expect(houseCpaCommissionForRow({ qualified_cpa: 3, cpa_commission: 0 }, { defaultCpa: 120 })).toBe(0);
  });

  it('sem cpa_commission cai na régua da casa (planilha e linhas antigas)', () => {
    expect(houseCpaCommissionForRow({ qualified_cpa: 3 }, { defaultCpa: 120 })).toBe(360);
    expect(houseCpaCommissionForRow({ qualified_cpa: 3, cpa_commission: null }, { defaultCpa: 120 })).toBe(360);
  });

  // Caso LEON: a API entrega a contagem pronta, então a casa não tem régua cadastrada.
  // Sem o campo informado a parcela CPA dava R$ 0 com o toggle desligado.
  it('sem régua E sem cpa_commission → 0; com o campo → o valor da casa', () => {
    expect(houseCpaCommissionForRow({ qualified_cpa: 12 }, null)).toBe(0);
    expect(houseCpaCommissionForRow({ qualified_cpa: 12, cpa_commission: 1440 }, null)).toBe(1440);
  });

  it('guarda contra NaN no campo informado', () => {
    expect(houseCpaCommissionForRow({ qualified_cpa: 2, cpa_commission: 'abc' }, { defaultCpa: 100 })).toBe(0);
  });
});
