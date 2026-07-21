// Núcleo PURO de geração de CSV — SEM Firebase, sem DOM. Usado pelo export de
// extrato (Relatórios/Export CSV, convergente Affility+NovaEra). Escaping RFC4180:
// campo com vírgula/aspas/quebra de linha vai entre aspas, aspas internas dobram.

function escapeCsvField(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r;]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Monta o texto CSV a partir de cabeçalhos + linhas de objetos. `columns` define a
// ORDEM e o rótulo de cada coluna: `{ key: 'date', label: 'Data' }`. Valor ausente
// vira campo vazio (nunca "undefined"/"null" literal). Números não são formatados
// aqui (a pt-BR fica pro chamador, se quiser) — CSV cru é mais portável p/ Excel.
export interface CsvColumn<T> {
  key: keyof T | string;
  label: string;
  // Formatador opcional (ex.: número → "12.50", data → "2026-07-21"). Sem ele,
  // usa o valor bruto coagido a string.
  format?: (row: T) => unknown;
}

export function buildCsv<T extends Record<string, any>>(columns: CsvColumn<T>[], rows: T[]): string {
  const cols = Array.isArray(columns) ? columns : [];
  const data = Array.isArray(rows) ? rows : [];
  const header = cols.map((c) => escapeCsvField(c.label)).join(',');
  const lines = data.map((row) =>
    cols.map((c) => escapeCsvField(c.format ? c.format(row) : row?.[c.key as string])).join(',')
  );
  // CRLF (RFC4180) — Excel Windows/BR é o consumidor mais comum aqui.
  return [header, ...lines].join('\r\n');
}

// Nome de arquivo seguro (sem barras/caracteres de controle) com a data embutida.
// `stamp` vem de fora (o chamador não tem acesso a Date.now() em contexto de
// workflow/teste determinístico) — aqui é só formatação.
export function buildCsvFilename(prefix: string, stamp: string): string {
  const safePrefix = String(prefix || 'extrato').replace(/[^a-zA-Z0-9_-]/g, '-');
  const safeStamp = String(stamp || '').replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${safePrefix}${safeStamp ? `-${safeStamp}` : ''}.csv`;
}
