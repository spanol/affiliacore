// Núcleo PURO da v1 analítica da OTG (cliques + funil inicial). Mapeia a resposta
// de `GET /api/v1/agency/{casa}-analytics` para linhas normalizadas, casáveis com os
// pré-cadastros/afiliados do Boost por `nameKey|casa` (mesma normalização da
// reconciliação — normalizeNameKey). Diferente da v2 externa (x-api-key), a v1 traz
// CLIQUES/handle/NGR e TODOS os afiliados (inclui os só-funil, que a v2 esconde).
// Ver SPIKE-OTG-V1-ANALYTICS.md. Função pura/testável — sem fetch, sem auth.

import { num } from './commission';
import { normalizeNameKey } from './affiliateName';

// Shape cru de uma linha de `data.rows` (groupBy afiliado).
export interface RawAnalyticsRow {
  affiliate?: string;
  name?: string;
  campaign?: string | null;
  clicks?: unknown;
  registrations?: unknown;
  ftd?: unknown;
  cpa_qual?: unknown;
  deposits?: unknown;
  bet_amount?: unknown;
  ngr?: unknown;
}

// Linha normalizada do funil, por afiliado×casa.
export interface FunnelRow {
  nameKey: string; // chave de casamento (= normalizeNameKey do nome)
  affiliate: string; // nome cru do relatório (PascalCase, ex.: 'LucasGuimaraes')
  house: string; // slug da casa (ex.: 'sportingbet')
  clicks: number;
  registrations: number;
  ftd: number;
  cpaQual: number;
  deposits: number;
  betAmount: number;
  ngr: number;
}

// Mapeia as linhas cruas de uma casa para FunnelRow[]. Ignora linhas sem nome.
export function mapAnalyticsRows(rows: unknown, house: string): FunnelRow[] {
  const slug = String(house ?? '').trim();
  return (Array.isArray(rows) ? (rows as RawAnalyticsRow[]) : [])
    .map((r) => {
      const name = String(r?.affiliate ?? r?.name ?? '').trim();
      if (!name) return null;
      return {
        nameKey: normalizeNameKey(name),
        affiliate: name,
        house: slug,
        clicks: num(r?.clicks),
        registrations: num(r?.registrations),
        ftd: num(r?.ftd),
        cpaQual: num(r?.cpa_qual),
        deposits: num(r?.deposits),
        betAmount: num(r?.bet_amount),
        ngr: num(r?.ngr),
      } as FunnelRow;
    })
    .filter((r): r is FunnelRow => r !== null);
}

// Indexa por `nameKey|casa` para lookup O(1) na tela do afiliado / reconciliação.
// Se a mesma chave repetir (não deveria), soma as métricas (agregação defensiva).
export function indexFunnelByKey(rows: FunnelRow[]): Record<string, FunnelRow> {
  const out: Record<string, FunnelRow> = {};
  for (const r of rows) {
    const key = `${r.nameKey}|${normalizeNameKey(r.house)}`;
    const prev = out[key];
    out[key] = prev
      ? {
          ...prev,
          clicks: prev.clicks + r.clicks,
          registrations: prev.registrations + r.registrations,
          ftd: prev.ftd + r.ftd,
          cpaQual: prev.cpaQual + r.cpaQual,
          deposits: prev.deposits + r.deposits,
          betAmount: prev.betAmount + r.betAmount,
          ngr: prev.ngr + r.ngr,
        }
      : r;
  }
  return out;
}
