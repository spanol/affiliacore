// Visão POR AFILIADO do /admin (gráfico "Desempenho por Afiliado" + os rankings
// de top especiais/subs). PURO, sem rede.
//
// Por que existe: a fonte OTG (`results`, groupBy=affiliate) e as casas MANUAIS
// são duas bases separadas de propósito — o manual fica FORA de `results` p/ não
// contaminar a atribuição por casa. Todo consumidor por-afiliado precisa somar as
// duas, e o /admin não somava: montava as barras só de `results`. Numa instância
// OTG-free (VITE_OTG_ENABLED=false, `fetchAffiliateApi` devolve `{data:[]}`
// sintético) isso deixava o gráfico em "sem dados" com o headline cheio — a
// Infinity em prod mostrava "5 produziram no período" e nenhuma barra.
//
// ⚠️ NÃO conserte isto mesclando o manual dentro de `fetchAllResults`: o headline
// (`totals`) e o lucro (`composeAdminProfit`) já somam o manual POR FORA, então o
// manual entraria duas vezes e todo o topo do painel inflaria. O merge é aqui, no
// consumidor por-afiliado.
//
// Invariante (testado): quando a planilha traz SÓ linhas por afiliado, Σ das
// linhas daqui == headline, exatamente.
//
// ⚠️ A exceção conhecida é a LINHA AGREGADA DA CASA (`affiliateId: null`, emitida
// quando a planilha não tem coluna de e-mail/afiliado — ver `resolveAffiliates`).
// No headline, `dailyAggregate` deixa essa linha VENCER e descarta as linhas por
// afiliado do mesmo `casa|dia` (anti double-count de quem sobe os dois formatos);
// já `aggregateByAffiliate` soma todas as atribuídas, sem olhar o dia. Ou seja:
// num dia que tenha as duas formas, gráfico e headline divergem POR DESIGN do
// helper. Não é regressão deste módulo — vale p/ todo consumidor de
// `aggregateByAffiliate` (o /afiliados/:id já era assim). Quem não casa com
// afiliado nenhum nem chega aqui: vira `unresolved` e não é gravado.

import { num } from './commission';
import { humanizeName } from './utils';
import type { Metrics } from './houseResults';

export interface AffiliatePerfRow {
  id: string;
  name: string;
  /** Comissão da CASA no período (visão do master, antes do repasse). */
  commission: number;
  /** CPA em R$. Só a OTG reporta — no manual v1 o upload não coleta (fica 0). */
  cpa: number;
  rev: number;
}

const idOf = (row: any): string => String(row?.affiliate_id ?? row?.id ?? '').trim();

// Mesma cadeia de fallback que o /admin já usava nas barras (a API externa nomeia
// o afiliado ora em `label`, ora em `name`), agora com o mapa id→nome no fim —
// afiliado que só tem resultado MANUAL não tem linha na OTG p/ carregar o nome.
const nameOf = (row: any, id: string, nameById: Record<string, string>): string =>
  humanizeName(
    String(row?.affiliate_name || row?.name || row?.label || nameById[id] || id || '---'),
  );

/**
 * Linhas por afiliado = OTG + casas manuais, ordenadas por comissão (desc).
 *
 * @param otgRows           `results` da OTG já no escopo da marca (scopedResults).
 * @param manualByAffiliate saída de `aggregateByAffiliate(manualScoped)` — só
 *                          linhas ATRIBUÍDAS, chaveadas por affiliateId.
 * @param nameById          mapa id→nome do mirror `affiliates`.
 */
export function buildAffiliatePerformance(
  otgRows: any[],
  manualByAffiliate: Record<string, Metrics>,
  nameById: Record<string, string> = {},
): AffiliatePerfRow[] {
  const byId = new Map<string, AffiliatePerfRow>();
  const take = (id: string, name: string): AffiliatePerfRow => {
    let row = byId.get(id);
    if (!row) byId.set(id, (row = { id, name, commission: 0, cpa: 0, rev: 0 }));
    return row;
  };

  for (const raw of Array.isArray(otgRows) ? otgRows : []) {
    const id = idOf(raw);
    if (!id) continue;
    const row = take(id, nameOf(raw, id, nameById));
    row.commission += num(raw?.total_commission);
    row.cpa += num(raw?.cpa);
    row.rev += num(raw?.rvs);
  }

  for (const [id, m] of Object.entries(manualByAffiliate ?? {})) {
    const key = String(id).trim();
    if (!key) continue;
    const row = take(key, nameOf(null, key, nameById));
    row.commission += num(m?.total_commission);
    row.rev += num(m?.rvs);
    // cpa (R$) de propósito NÃO somado: espelha o `totals` do /admin, que também
    // só conta `cpa` da OTG. Somar aqui quebraria "gráfico == headline".
  }

  return [...byId.values()].sort((a, b) => b.commission - a.commission);
}

/** Índice id→linha, p/ os rankings lerem a MESMA base do gráfico. */
export function indexPerformanceById(
  rows: AffiliatePerfRow[],
): Record<string, AffiliatePerfRow> {
  const out: Record<string, AffiliatePerfRow> = {};
  for (const r of rows) out[r.id] = r;
  return out;
}
