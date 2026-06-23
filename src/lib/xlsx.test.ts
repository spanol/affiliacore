import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSpreadsheetFile, isExcelFile } from './xlsx';
import { parseResultsRows } from './houseResults';

// Monta um .xlsx em memória e embrulha num File (como o input do browser entregaria).
function xlsxFile(aoa: unknown[][], name = 'resultados.xlsx'): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

describe('isExcelFile', () => {
  it('reconhece .xlsx/.xls e ignora .csv', () => {
    expect(isExcelFile(new File([''], 'a.xlsx'))).toBe(true);
    expect(isExcelFile(new File([''], 'a.XLS'))).toBe(true);
    expect(isExcelFile(new File([''], 'a.csv', { type: 'text/csv' }))).toBe(false);
  });
});

describe('parseSpreadsheetFile (round-trip Excel)', () => {
  it('normaliza data nativa do Excel para AAAA-MM-DD (sem off-by-one de fuso)', async () => {
    const file = xlsxFile([
      ['data', 'afiliado', 'cadastros', 'deposito'],
      [new Date(Date.UTC(2026, 5, 1)), 'João Silva', 40, 2400.5],
    ]);
    const grid = await parseSpreadsheetFile(file);
    expect(grid[1][0]).toBe('2026-06-01'); // data nativa -> ISO correto
    const r = parseResultsRows(grid);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ date: '2026-06-01', affiliate: 'João Silva', registrations: 40, deposit: 2400.5 });
  });

  it('preserva números nativos sem ambiguidade de locale', async () => {
    const file = xlsxFile([
      ['data', 'cadastros', 'comissao'],
      ['2026-06-02', 88000, 1234567.89],
    ]);
    const r = parseResultsRows(await parseSpreadsheetFile(file));
    expect(r.rows[0]).toMatchObject({ registrations: 88000, total_commission: 1234567.89 });
  });

  it('linha sem afiliado vira agregado', async () => {
    const file = xlsxFile([
      ['data', 'afiliado', 'cadastros'],
      ['2026-06-01', '', 50],
    ]);
    const r = parseResultsRows(await parseSpreadsheetFile(file));
    expect(r.rows[0].affiliate).toBe('');
  });
});
