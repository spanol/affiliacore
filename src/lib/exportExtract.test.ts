import { describe, it, expect } from 'vitest';
import { buildDailyExtractRows, buildDailyExtractCsv } from './exportExtract';

const cfg = { affiliateId: 'a1', cpaValue: 100, revPercentage: 20 };

describe('buildDailyExtractRows · usa calcAffiliatePayout (NUNCA total_commission cru)', () => {
  it('calcula a comissão pela taxa do afiliado, não pelo total_commission da OTG', () => {
    // total_commission=9999 é receita da CASA — tem que ser IGNORADO no cálculo do
    // repasse; a coluna usa qualified_cpa×cpaValue + rvs×rev%, igual ao core.
    const rows = buildDailyExtractRows([{ id: '2026-07-01', qualified_cpa: 2, rvs: 50, total_commission: 9999, registrations: 5, first_deposits: 3 }], cfg);
    expect(rows).toEqual([{ date: '2026-07-01', registrations: 5, firstDeposits: 3, qualifiedCpa: 2, rvs: 50, commission: 2 * 100 + 50 * 0.2 }]);
  });

  it('ordena por data crescente mesmo se a API devolver fora de ordem', () => {
    const rows = buildDailyExtractRows([{ id: '2026-07-03' }, { id: '2026-07-01' }, { id: '2026-07-02' }], cfg);
    expect(rows.map((r) => r.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });

  it('taxa por casa (byBrand) quando brandId é passado', () => {
    const cfgByBrand = { ...cfg, byBrand: { superbet: { cpaValue: 200, revPercentage: 0 } } };
    const rows = buildDailyExtractRows([{ id: '2026-07-01', qualified_cpa: 1, rvs: 0 }], cfgByBrand, 'superbet');
    expect(rows[0].commission).toBe(200);
  });

  it('sem config → comissão 0 (não lança, ausência≠crash)', () => {
    expect(buildDailyExtractRows([{ id: '2026-07-01', qualified_cpa: 5 }], null)[0].commission).toBe(0);
  });

  it('array inválido → []', () => {
    expect(buildDailyExtractRows(null as any, cfg)).toEqual([]);
    expect(buildDailyExtractRows(undefined as any, cfg)).toEqual([]);
  });
});

describe('buildDailyExtractCsv', () => {
  it('monta o CSV com cabeçalho pt-BR e comissão com 2 casas decimais', () => {
    const csv = buildDailyExtractCsv([{ id: '2026-07-01', qualified_cpa: 1, rvs: 10, registrations: 2, first_deposits: 1 }], cfg);
    expect(csv).toBe('Data,Cadastros,Primeiros Depósitos,CPA Qualificado,REV (unidades),Comissão (R$)\r\n2026-07-01,2,1,1,10,102.00');
  });

  it('sem linhas → só o cabeçalho', () => {
    expect(buildDailyExtractCsv([], cfg)).toBe('Data,Cadastros,Primeiros Depósitos,CPA Qualificado,REV (unidades),Comissão (R$)');
  });
});
