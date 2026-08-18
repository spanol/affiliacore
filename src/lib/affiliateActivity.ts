// Atividade ("produziu no período") de um afiliado — definição ÚNICA.
//
// Antes isto vivia INLINE em `SpecialSubAffiliates.tsx` e olhava só as linhas da
// OTG. Numa instância OTG-free (100% casas manuais, como a Infinity) isso marcava
// TODO afiliado como parado, porque a produção inteira mora em `house_results`.
// Mesma classe do invariante de dinheiro: o merge manual tem que valer em TODA
// visão, não só no /admin. Ver CLAUDE.md · "Boost-first / resultados manuais".
//
// A coerção numérica passa por `num` (guarda NaN/Infinity/objeto não-array) para
// não divergir do resto do domínio.
import { num } from './commission';

// Aceita tanto a linha da OTG (`affiliate_id`) quanto a manual (`affiliateId`);
// os NOMES DAS MÉTRICAS são os mesmos nas duas fontes (ver `METRIC_KEYS`).
export interface ActivityRow {
  registrations?: unknown;
  first_deposits?: unknown;
  qualified_cpa?: unknown;
  total_commission?: unknown;
  deposit?: unknown;
}

/**
 * Produziu = tem QUALQUER sinal no período: funil (cadastro/FTD/CPA) **ou**
 * dinheiro (comissão/depósito).
 *
 * ⚠️ Inclui dinheiro de propósito, ampliando a regra antiga (que era só funil):
 * no import manual existe linha cuja única evidência é a comissão — o afiliado
 * produziu e apareceria como parado. Ausência de sinal ≠ afiliado inativo: isto
 * é "sem produção NO PERÍODO", não status de ativação (esse é admin-only).
 */
export function isProducingRow(row: ActivityRow | null | undefined): boolean {
  if (!row || typeof row !== 'object') return false;
  return (
    num(row.registrations) > 0 ||
    num(row.first_deposits) > 0 ||
    num(row.qualified_cpa) > 0 ||
    num(row.total_commission) > 0 ||
    num(row.deposit) > 0
  );
}

/** Id do afiliado numa linha da OTG (v2 usa `affiliate_id`; alguns shapes, `id`). */
function otgIdOf(row: any): string {
  return String(row?.affiliate_id ?? row?.id ?? '').trim();
}

/**
 * Conjunto de affiliateIds com produção no período, UNINDO as duas fontes.
 *
 * As linhas manuais são POR DIA: basta uma com sinal para o afiliado contar.
 * Linha manual com `affiliateId` nulo é o agregado da casa naquele dia — não
 * pertence a ninguém e é descartada (senão inventaria produção para o id vazio).
 */
export function producingAffiliateIds(
  otgRows: any[] | null | undefined,
  manualRows: Array<{ affiliateId?: string | number | null } & ActivityRow> | null | undefined
): Set<string> {
  const ids = new Set<string>();
  for (const row of Array.isArray(otgRows) ? otgRows : []) {
    if (!isProducingRow(row)) continue;
    const id = otgIdOf(row);
    if (id) ids.add(id);
  }
  for (const row of Array.isArray(manualRows) ? manualRows : []) {
    if (!row?.affiliateId) continue;
    if (!isProducingRow(row)) continue;
    const id = String(row.affiliateId).trim();
    if (id) ids.add(id);
  }
  return ids;
}
