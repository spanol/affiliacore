// Cálculo PURO do leaderboard diário (ranking de comissão). Vive em lib (sem
// Firebase) p/ o server.ts reusar e ser testável. Antes o server.ts reimplementava
// a fórmula inline com SÓ a taxa de topo (cpaValue/revPercentage), ignorando o
// override por casa (byBrand) e divergindo dos dashboards (R2). Agora usa o MESMO
// calcAffiliatePayout, aplicando a taxa por casa quando o brandId do afiliado é
// conhecido (resolvido pelo caller a partir do mirror `affiliates`).
import { AffiliateConfig, calcAffiliatePayout, num } from './commission';

export interface RankingEntry {
  pos: number;
  affiliateId: string;
  name: string;
  commission: number;
}

export interface RankingOpts {
  // brandId do afiliado → aplica a taxa POR CASA (byBrand) dele. Sem ele, taxa de topo.
  brandIdOf?: (affiliateId: string) => string | undefined;
  nameById?: Record<string, string>;
  limit?: number; // top N (default 100)
}

// Merge ADITIVO dos resultados de casas MANUAIS (house_results do dia) nas linhas
// por-afiliado da OTG, antes do cálculo do ranking. Sem isso o ranking só via a OTG
// e saía ZERADO enquanto a produção real estava nas casas manuais (bug 2026-07-02).
// Mesma semântica do merge manual dos dashboards: soma qualified_cpa/rvs por
// afiliado; linha manual SEM atribuição (affiliateId null = agregado da casa) não
// entra — ranking é por afiliado. num() guarda métrica string/NaN.
export function mergeManualIntoRankingRows(otgRows: any[], manualRows: any[]): any[] {
  const byId = new Map<string, any>();
  for (const r of Array.isArray(otgRows) ? otgRows : []) {
    const id = String(r?.affiliate_id ?? r?.id ?? '').trim();
    if (!id) continue;
    byId.set(id, { ...r });
  }
  for (const m of Array.isArray(manualRows) ? manualRows : []) {
    const id = m?.affiliateId != null ? String(m.affiliateId).trim() : '';
    if (!id) continue;
    const cur = byId.get(id) ?? { affiliate_id: id, qualified_cpa: 0, rvs: 0 };
    cur.qualified_cpa = num(cur.qualified_cpa) + num(m?.qualified_cpa);
    cur.rvs = num(cur.rvs) + num(m?.rvs);
    byId.set(id, cur);
  }
  return [...byId.values()];
}

export function computeRankingEntries(
  rows: any[],
  configById: Record<string, AffiliateConfig | undefined>,
  opts: RankingOpts = {}
): RankingEntry[] {
  const { brandIdOf, nameById = {}, limit = 100 } = opts;
  return (Array.isArray(rows) ? rows : [])
    .map((r) => {
      const affiliateId = String(r?.affiliate_id ?? r?.id ?? '').trim();
      if (!affiliateId) return null;
      // Mesma fórmula/repasse dos dashboards: taxa por casa (byBrand) quando conhecida.
      const commission = calcAffiliatePayout(r, configById[affiliateId], brandIdOf?.(affiliateId));
      const name =
        nameById[affiliateId] ||
        String(r?.name ?? r?.label ?? r?.affiliate_name ?? `Afiliado #${affiliateId}`);
      return { affiliateId, name, commission: Math.round(commission * 100) / 100 };
    })
    .filter((e): e is { affiliateId: string; name: string; commission: number } => !!e && e.commission > 0)
    .sort((a, b) => b.commission - a.commission)
    .slice(0, limit)
    .map((e, i) => ({ pos: i + 1, ...e }));
}
