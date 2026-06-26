import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSpreadsheetFile, isExcelFile } from './xlsx';
import { parseResultsRows } from './houseResults';

// Monta um .xlsx em memória e embrulha num File (como o input do browser entregaria).
// `sheets`: mapa nome-da-aba -> matriz (aoa). Mantém a ordem de inserção.
function xlsxFile(sheets: Record<string, unknown[][]>, name = 'resultados.xlsx'): File {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), sheetName);
  }
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
    const file = xlsxFile({ Resultados: [
      ['data', 'afiliado', 'cadastros', 'deposito'],
      [new Date(Date.UTC(2026, 5, 1)), 'João Silva', 40, 2400.5],
    ] });
    const { grid } = await parseSpreadsheetFile(file);
    expect(grid[1][0]).toBe('2026-06-01'); // data nativa -> ISO correto
    const r = parseResultsRows(grid);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ date: '2026-06-01', affiliate: 'João Silva', registrations: 40, deposit: 2400.5 });
  });

  it('preserva números nativos sem ambiguidade de locale', async () => {
    const file = xlsxFile({ Resultados: [
      ['data', 'cadastros', 'comissao'],
      ['2026-06-02', 88000, 1234567.89],
    ] });
    const { grid } = await parseSpreadsheetFile(file);
    const r = parseResultsRows(grid);
    expect(r.rows[0]).toMatchObject({ registrations: 88000, total_commission: 1234567.89 });
  });
});

describe('parseSpreadsheetFile — seleção de aba (workbook 1 aba por casa)', () => {
  const wb = () => xlsxFile({
    'Resultados Superbet': [['data', 'email', 'cadastros'], ['2026-06-01', 'a@x.com', 1]],
    'Resultados Betfair': [['data', 'email', 'cadastros'], ['2026-06-01', 'b@x.com', 9]],
    'Instruções': [['Modelo'], ['...']],
  });

  it('escolhe a aba que bate com o nome da casa', async () => {
    const r = await parseSpreadsheetFile(wb(), 'Betfair');
    expect(r.sheetName).toBe('Resultados Betfair');
    expect(r.matched).toBe(true);
    expect(parseResultsRows(r.grid).rows[0].registrations).toBe(9);
  });

  it('ignora a aba "Instruções" e cai na 1ª aba de dados quando nada bate', async () => {
    const r = await parseSpreadsheetFile(wb(), 'CasaInexistente');
    expect(r.sheetName).toBe('Resultados Superbet');
    expect(r.matched).toBe(false);
    expect(r.sheetNames).toContain('Instruções');
  });
});
