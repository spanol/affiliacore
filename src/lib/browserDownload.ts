// Trigger de download client-side (Blob + link temporário) — DOM puro, sem lógica de
// negócio (essa fica em lib/csv.ts / lib/exportExtract.ts, testável isolado). Usado
// pelo botão "Exportar CSV". BOM UTF-8 no início do CSV: sem ele, o Excel BR abre
// acentuação (ç, ã, é) como lixo — não afeta outros leitores (ignoram o BOM).
export function downloadCsvFile(filename: string, csvText: string): void {
  const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
