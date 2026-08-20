// KPIs de QUALIDADE da produção (pedido Infinity 19/08/2026): a régua que a CASA
// usa para decidir se paga — depósitos líquidos (depósitos − saques), resultado
// dos jogadores (PL) e os derivados por FTD. Nasceu do caso real de julho/2026:
// a casa recusou o pagamento do mês alegando KPI não batido, e a visão por
// afiliado mostrou que o problema era identificável (duas origens negativas
// puxando um mês positivo para baixo).
//
// Puro e testável, no molde de lib/funnel.ts — e com a MESMA regra de ausência:
// `net_deposits`/`net_pl` são métricas OPCIONAIS (OPTIONAL_METRIC_KEYS), a OTG
// não as manda e linhas antigas não as têm, então aqui a AUSÊNCIA vira `null`
// ("indisponível" na UI), nunca um 0 fabricado.
//
// ⚠️ SINAL: `net_pl` negativo = os jogadores ganharam da casa. É informação, não
// erro — nada aqui pode fazer abs/clamp, e a UI o pinta como alerta.
//
// Visibilidade: é dado de GESTÃO (mede o afiliado, não informa o afiliado) — a
// página deve gate-á-lo com `canViewAffiliateNetProfit`, o mesmo gate do lucro.

const QUALITY_OPTIONAL_KEYS = ['net_deposits', 'net_pl'] as const;
type QualityOptionalKey = (typeof QUALITY_OPTIONAL_KEYS)[number];

export interface QualityTotals {
  first_deposits: number;
  deposit: number;
  /** Depósitos − saques — `undefined` = nenhuma fonte do período informou. */
  net_deposits?: number;
  /** Resultado dos jogadores p/ a casa (pode ser negativo) — `undefined` = não informado. */
  net_pl?: number;
}

/**
 * Soma linhas (merge OTG+manual, qualquer groupBy) nos totais de qualidade.
 * Mesmo contrato de `sumFunnelTotals`: canônicas somam sempre; opcionais só
 * existem no total se AO MENOS UMA linha as trouxe.
 */
export function sumQualityTotals(rows: any[] | null | undefined): QualityTotals {
  const out: QualityTotals = { first_deposits: 0, deposit: 0 };
  for (const r of Array.isArray(rows) ? rows : []) {
    out.first_deposits += Number(r?.first_deposits) || 0;
    out.deposit += Number(r?.deposit) || 0;
    for (const k of QUALITY_OPTIONAL_KEYS as readonly QualityOptionalKey[]) {
      const v = r?.[k];
      if (v === undefined || v === null) continue;
      out[k] = (out[k] ?? 0) + (Number(v) || 0);
    }
  }
  return out;
}

export type QualityItemKey = 'net_deposits' | 'net_pl' | 'net_per_ftd' | 'retention';

export interface QualityItem {
  key: QualityItemKey;
  label: string;
  kind: 'money' | 'percent';
  /** `null` = indisponível (fonte não informa / divisor zero) → UI mostra "—". */
  value: number | null;
  /** Sinaliza valor ruim p/ a casa (PL/líquido negativo) — a UI pinta de alerta. */
  negative: boolean;
  hint?: string;
}

const div = (num: number | undefined, den: number | undefined | null): number | null => {
  if (num === undefined) return null;
  const d = Number(den) || 0;
  return d > 0 ? num / d : null;
};

/** Cards de qualidade. Ordem: o que a casa olha primeiro (líquido) → derivados. */
export function buildQualityItems(t: QualityTotals): QualityItem[] {
  const netDep = t.net_deposits ?? null;
  const pl = t.net_pl ?? null;
  // Retenção do depósito: quanto do valor depositado FICOU na casa após saques.
  // Denominador é o depósito BRUTO (canônico) — só deriva se o líquido existir.
  const retention = t.net_deposits !== undefined && t.deposit > 0 ? t.net_deposits / t.deposit : null;
  return [
    {
      key: 'net_deposits', label: 'Depósito Líquido', kind: 'money', value: netDep,
      negative: netDep !== null && netDep < 0,
      hint: 'Depósitos menos saques no período. Disponível quando a casa informa (ex.: Esportiva).',
    },
    {
      key: 'net_pl', label: 'Resultado (PL)', kind: 'money', value: pl,
      negative: pl !== null && pl < 0,
      hint: 'Resultado dos jogadores para a casa. Negativo significa que os jogadores ganharam.',
    },
    {
      key: 'net_per_ftd', label: 'Líquido por FTD', kind: 'money', value: div(t.net_deposits, t.first_deposits),
      negative: t.net_deposits !== undefined && t.net_deposits < 0 && t.first_deposits > 0,
      hint: 'Depósito líquido dividido pelos primeiros depósitos: qualidade média de cada lead.',
    },
    {
      key: 'retention', label: 'Retenção de Depósito', kind: 'percent', value: retention,
      negative: retention !== null && retention < 0,
      hint: 'Depósito líquido sobre o depositado: quanto ficou na casa depois dos saques.',
    },
  ];
}

/** Formata o valor de um item ('—' quando indisponível). */
export function formatQualityValue(item: QualityItem): string {
  if (item.value === null) return '—';
  if (item.kind === 'percent') {
    return `${(item.value * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }
  return `R$ ${item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A seção só aparece quando há AO MENOS um dado de qualidade no período. */
export function hasQualityData(t: QualityTotals): boolean {
  return t.net_deposits !== undefined || t.net_pl !== undefined;
}
