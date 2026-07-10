// Paginação do `results` v2 da OTG. O endpoint entrega pageSize=50 e o shape
// paginado é { data: { data: [...], meta: { totalPages } } } — sem ler o meta,
// qualquer consulta com >50 linhas volta TRUNCADA na página 1. Foi a causa da
// discrepância OTG×Boost de jun/2026: o headline do /admin (groupBy=affiliate,
// 50 de 72 linhas) saía R$ 3.646,75 menor que o card por casa (groupBy=brand,
// 2 linhas, sem corte) — e groupBy=date com range >50 dias cortava o gráfico.
// O servidor (computeAndStoreRanking) já paginava com este mesmo contrato.

// Teto de páginas contra meta malformado/looping — o MESMO guarda do servidor.
export const MAX_RESULT_PAGES = 50;

// Extrai as linhas e o totalPages de UMA página do results, tolerando os shapes
// conhecidos da API (paginado data.data + data.meta; data array direto; body
// array cru). meta ausente/inválido → 1 página (comportamento antigo, seguro).
export function parseResultsPage(body: any): { rows: any[]; totalPages: number } {
  const d = body?.data;
  const rows = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : Array.isArray(body) ? body : [];
  const tp = Number(d?.meta?.totalPages);
  return { rows, totalPages: Number.isFinite(tp) && tp > 0 ? tp : 1 };
}
