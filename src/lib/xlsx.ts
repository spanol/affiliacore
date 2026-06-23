// Ponte entre arquivos Excel (.xlsx/.xls) e o parser PURO de resultados manuais
// (`houseResults.ts`). Isola a dependência do SheetJS aqui — o núcleo de parsing/
// agregação continua puro e testável sem o lib. Duas funções:
//   • parseSpreadsheetFile — lê a 1ª planilha e devolve uma matriz de strings
//     locale-safe (números/datas nativos viram texto sem formatação de locale);
//   • downloadResultsTemplate — gera e baixa a planilha modelo (.xlsx).
// O SheetJS é pesado e só é usado no backoffice (admin), então é carregado sob
// demanda (import dinâmico) — fica num chunk próprio, fora do bundle inicial.
import type * as XLSX from 'xlsx';
import { TEMPLATE_HEADERS, TEMPLATE_COLUMNS, TEMPLATE_EXAMPLE_ROWS } from './houseResults';

const loadXLSX = () => import('xlsx');

// Converte uma célula nativa do SheetJS em string sem depender do locale do arquivo:
//   • Date  -> AAAA-MM-DD pelos getters UTC (o serial do Excel é lido como meia-noite
//             UTC; getters UTC evitam o off-by-one de fuso). Validada depois por
//             parseDateToISO;
//   • number -> String cru (ex.: 2400.5), que parsePtNumber lê como decimal simples —
//             sem risco de "." virar milhar de outro locale;
//   • resto  -> texto aparado.
function cellToString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return '';
  return String(v).trim();
}

// Lê um arquivo Excel no browser e devolve a 1ª planilha como matriz de strings.
// `raw: true` + `cellDates: true` preserva números/datas nativos (cellToString os
// normaliza). `blankrows: true` mantém o índice de cada linha alinhado à planilha,
// pra que os erros do parser apontem o nº de linha real.
export async function parseSpreadsheetFile(file: File): Promise<string[][]> {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!sheet) return [];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: '',
  });
  return grid.map((row) => (Array.isArray(row) ? row.map(cellToString) : []));
}

// Extensões/MIME aceitos como planilha Excel.
export function isExcelFile(file: File): boolean {
  return /\.(xlsx|xlsm|xls)$/i.test(file.name)
    || file.type.includes('spreadsheetml')
    || file.type === 'application/vnd.ms-excel';
}

// Monta a planilha modelo: aba "Resultados" (só o cabeçalho, pronta pra preencher)
// + aba "Instruções" (o que é cada coluna + exemplo). Retorna o workbook do SheetJS.
function buildTemplateWorkbook(XLSX: typeof import('xlsx'), houseName?: string): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Aba de preenchimento — apenas o cabeçalho (sem exemplos, p/ ninguém importar amostra).
  const fill = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  fill['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, fill, 'Resultados');

  // Aba de instruções — coluna, descrição, obrigatoriedade + linhas de exemplo.
  const intro: (string | number)[][] = [
    [houseName ? `Modelo de resultados — ${houseName}` : 'Modelo de resultados'],
    ['Preencha a aba "Resultados" (1 linha por dia). Afiliado vazio = total/agregado da casa no dia.'],
    [''],
    ['Coluna', 'Campo', 'Obrigatória?', 'Descrição'],
    ...TEMPLATE_COLUMNS.map((c) => [c.header, c.label, c.required ? 'Sim' : 'Não', c.help]),
    [''],
    ['Exemplo (não copie esta aba — preencha a aba "Resultados"):'],
    TEMPLATE_HEADERS,
    ...TEMPLATE_EXAMPLE_ROWS,
  ];
  const guide = XLSX.utils.aoa_to_sheet(intro);
  guide['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, guide, 'Instruções');

  return wb;
}

// Gera e dispara o download da planilha modelo (.xlsx) no browser.
export async function downloadResultsTemplate(houseName?: string): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = buildTemplateWorkbook(XLSX, houseName);
  const slug = (houseName || 'resultados').normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'resultados';
  XLSX.writeFile(wb, `modelo-${slug}.xlsx`);
}
