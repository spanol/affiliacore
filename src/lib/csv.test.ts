import { describe, it, expect } from 'vitest';
import { buildCsv, buildCsvFilename } from './csv';

describe('buildCsv · escaping RFC4180 + ordem de colunas', () => {
  it('monta cabeçalho + linhas na ordem das colunas', () => {
    const csv = buildCsv(
      [{ key: 'date', label: 'Data' }, { key: 'commission', label: 'Comissão' }],
      [{ date: '2026-07-01', commission: 100 }, { date: '2026-07-02', commission: 50.5 }]
    );
    expect(csv).toBe('Data,Comissão\r\n2026-07-01,100\r\n2026-07-02,50.5');
  });

  it('escapa campo com vírgula/aspas/quebra de linha (aspas dobradas)', () => {
    const csv = buildCsv([{ key: 'name', label: 'Nome' }], [{ name: 'Silva, João "Rei"' }, { name: 'linha\nquebrada' }]);
    expect(csv).toBe('Nome\r\n"Silva, João ""Rei"""\r\n"linha\nquebrada"');
  });

  it('escapa ; também (Excel BR usa ; como separador alternativo em algumas locales)', () => {
    expect(buildCsv([{ key: 'x', label: 'X' }], [{ x: 'a;b' }])).toBe('X\r\n"a;b"');
  });

  it('valor ausente vira campo vazio, nunca "undefined"/"null"', () => {
    const csv = buildCsv([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], [{ a: undefined, b: null }]);
    expect(csv).toBe('A,B\r\n,');
  });

  it('format() customizado tem prioridade sobre o valor bruto', () => {
    const csv = buildCsv([{ key: 'v', label: 'Valor', format: (r: any) => (r.v / 100).toFixed(2) }], [{ v: 12345 }]);
    expect(csv).toBe('Valor\r\n123.45');
  });

  it('sem linhas → só o cabeçalho; sem colunas/linhas não lança', () => {
    expect(buildCsv([{ key: 'a', label: 'A' }], [])).toBe('A');
    expect(buildCsv([], [])).toBe('');
    expect(buildCsv(null as any, null as any)).toBe('');
  });
});

describe('buildCsvFilename', () => {
  it('monta prefixo-stamp.csv, sanitizando caracteres inválidos', () => {
    expect(buildCsvFilename('extrato_afiliado', '2026-07-21')).toBe('extrato_afiliado-2026-07-21.csv');
    expect(buildCsvFilename('a/b c', '2026/07/21')).toBe('a-b-c-2026-07-21.csv');
  });
  it('sem stamp, omite o hífen', () => {
    expect(buildCsvFilename('extrato', '')).toBe('extrato.csv');
  });
  it('sem prefixo, cai no default "extrato"', () => {
    expect(buildCsvFilename('', '2026-07-21')).toBe('extrato-2026-07-21.csv');
  });
});
