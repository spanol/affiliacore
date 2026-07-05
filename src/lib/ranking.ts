// Cálculo PURO do leaderboard diário. Vive em lib (sem Firebase) p/ o server.ts
// reusar e ser testável.
//
// MÉTRICA (decisão 2026-07-05): "quem produziu mais" = comissão BRUTA gerada para a
// agência por afiliado — a MESMA base dos dashboards. Antes o ranking recalculava o
// repasse Boost (calcAffiliatePayout, taxa CPA/REV por afiliado), mas a produção real
// da OTG é quase toda REV-share e as configs Boost são só-CPA (revPercentage=0) ou
// ausentes → a comissão dava 0 e o afiliado sumia do ranking, mesmo produzindo
// (ex.: rvs=1624 → R$0). Agora usamos `houseCommissionForRow`, a fonte ÚNICA já usada
// no /admin: linha da OTG traz `total_commission` preenchido (>0 → usado direto); linha
// MANUAL (house_results, total_commission=0) deriva pela taxa da casa (defaultCpa em
// BRL × qualified_cpa + rvs × defaultRev/100). Uma métrica só, consistente com o /admin,
// sem depender de config por afiliado.
import { HouseRate, houseCommissionForRow } from './commission';

export interface RankingEntry {
  pos: number;
  affiliateId: string;
  name: string;
  commission: number;
}

export interface RankingOpts {
  nameById?: Record<string, string>;
  // Taxa da casa JÁ EM BRL (defaultCpa convertido de EUR→BRL pelo caller), p/ derivar a
  // comissão das linhas manuais (house_results, total_commission=0). Sem ela, ou p/
  // linha da OTG (sem houseSlug), houseCommissionForRow usa o total_commission da linha.
  houseRateOf?: (houseSlug: string | undefined) => HouseRate | null | undefined;
  limit?: number; // top N (default 100)
}

// Extrai o affiliateId de uma linha, cobrindo as duas fontes: OTG usa `id`/`affiliate_id`,
// house_results usa `affiliateId`. Linha agregada da casa (affiliateId null) → '' (fora).
function rowAffiliateId(r: any): string {
  const raw = r?.affiliate_id ?? r?.affiliateId ?? r?.id;
  return raw == null ? '' : String(raw).trim();
}

// Recebe a UNIÃO das linhas OTG (total_commission preenchido) + linhas manuais
// (house_results, com houseSlug). Soma a comissão bruta por afiliado, filtra > 0,
// ordena desc e numera. Um afiliado com produção OTG E manual soma as duas.
export function computeRankingEntries(rows: any[], opts: RankingOpts = {}): RankingEntry[] {
  const { nameById = {}, houseRateOf, limit = 100 } = opts;
  const byId = new Map<string, { name: string; commission: number }>();
  for (const r of Array.isArray(rows) ? rows : []) {
    const affiliateId = rowAffiliateId(r);
    if (!affiliateId) continue;
    const commission = houseCommissionForRow(r, houseRateOf?.(r?.houseSlug));
    const cur = byId.get(affiliateId) ?? { name: '', commission: 0 };
    cur.commission += commission;
    if (!cur.name) {
      cur.name =
        nameById[affiliateId] ||
        String(r?.name ?? r?.label ?? r?.affiliate_name ?? `Afiliado #${affiliateId}`);
    }
    byId.set(affiliateId, cur);
  }
  return [...byId.entries()]
    .map(([affiliateId, v]) => ({
      affiliateId,
      name: v.name,
      commission: Math.round(v.commission * 100) / 100,
    }))
    .filter((e) => e.commission > 0)
    .sort((a, b) => b.commission - a.commission)
    .slice(0, limit)
    .map((e, i) => ({ pos: i + 1, ...e }));
}
