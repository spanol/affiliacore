// Funil de conversão na ORDEM do painel da Esportiva (call Infinity 12/08/2026):
// clique → cadastro → FTD → depósitos (qtd e valor) → derivados (média de depósito,
// ticket médio) → CPA qualificado. Puro e testável — as páginas (ClientDashboard,
// SpecialDashboard, AffiliateDetails) só escolhem ícone e formatam.
//
// Métricas OPCIONAIS (visits/deposit_count — ver OPTIONAL_METRIC_KEYS em
// houseResults.ts): a OTG não as manda e upload antigo não as tem, então aqui a
// AUSÊNCIA vira `null` ("—" na UI), nunca um 0 fabricado. Derivada com divisor
// ausente/zero também é `null` — divisão por zero não vira ticket médio infinito.

// Opcionais que são DO FUNIL. Deliberadamente uma lista própria, e não o
// `OPTIONAL_METRIC_KEYS` de houseResults.ts: aquele cresceu para além do funil
// (ganhou `cpa_commission`, que é dinheiro) e iterá-lo aqui somaria um valor em R$
// dentro dos totais de contagem. Mesma regra de ausência ≠ 0, escopo diferente.
const FUNNEL_OPTIONAL_KEYS = ['visits', 'deposit_count'] as const;
type FunnelOptionalKey = (typeof FUNNEL_OPTIONAL_KEYS)[number];

export interface FunnelTotals {
  /** Cliques/visitas — `undefined` = nenhuma fonte do período informou. */
  visits?: number;
  registrations: number;
  first_deposits: number;
  /** Quantidade de depósitos — `undefined` = nenhuma fonte do período informou. */
  deposit_count?: number;
  deposit: number;
  qualified_cpa: number;
}

/**
 * Soma linhas (merge OTG+manual, qualquer groupBy) nos totais do funil. As
 * canônicas somam sempre (ausente coage a 0, como nas grades de métricas); as
 * opcionais só existem no total se AO MENOS UMA linha as trouxe.
 */
export function sumFunnelTotals(rows: any[] | null | undefined): FunnelTotals {
  const out: FunnelTotals = { registrations: 0, first_deposits: 0, deposit: 0, qualified_cpa: 0 };
  for (const r of Array.isArray(rows) ? rows : []) {
    out.registrations += Number(r?.registrations) || 0;
    out.first_deposits += Number(r?.first_deposits) || 0;
    out.deposit += Number(r?.deposit) || 0;
    out.qualified_cpa += Number(r?.qualified_cpa) || 0;
    for (const k of FUNNEL_OPTIONAL_KEYS as readonly FunnelOptionalKey[]) {
      const v = r?.[k];
      if (v === undefined || v === null) continue;
      out[k] = (out[k] ?? 0) + (Number(v) || 0);
    }
  }
  return out;
}

export type FunnelItemKey =
  | 'visits'
  | 'registrations'
  | 'first_deposits'
  | 'deposit_count'
  | 'deposit'
  | 'avg_deposit'
  | 'avg_ticket'
  | 'qualified_cpa';

export interface FunnelItem {
  key: FunnelItemKey;
  label: string;
  kind: 'count' | 'money';
  /** `null` = indisponível (fonte não informa / divisor zero) → UI mostra "—". */
  value: number | null;
  hint?: string;
}

const div = (num: number, den: number | undefined | null): number | null => {
  const d = Number(den) || 0;
  return d > 0 ? num / d : null;
};

/** Cards do funil na ordem do painel da Esportiva, com os derivados da call 12/08. */
export function buildFunnelItems(t: FunnelTotals): FunnelItem[] {
  return [
    { key: 'visits', label: 'Cliques', kind: 'count', value: t.visits ?? null, hint: 'Visitas no link. Disponível quando a casa informa (ex.: Esportiva).' },
    { key: 'registrations', label: 'Cadastros', kind: 'count', value: t.registrations },
    { key: 'first_deposits', label: 'Primeiros Depósitos', kind: 'count', value: t.first_deposits },
    { key: 'deposit_count', label: 'Qtd. de Depósitos', kind: 'count', value: t.deposit_count ?? null, hint: 'Quantidade de depósitos. Disponível quando a casa informa.' },
    { key: 'deposit', label: 'Valor Depositado', kind: 'money', value: t.deposit },
    { key: 'avg_deposit', label: 'Média de Depósito', kind: 'money', value: div(t.deposit, t.deposit_count), hint: 'Valor depositado ÷ quantidade de depósitos.' },
    { key: 'avg_ticket', label: 'Ticket Médio', kind: 'money', value: div(t.deposit, t.first_deposits), hint: 'Valor depositado ÷ primeiros depósitos (FTD).' },
    { key: 'qualified_cpa', label: 'CPA Qualificado', kind: 'count', value: t.qualified_cpa },
  ];
}

/** Formata o valor de um item ('—' quando indisponível). */
export function formatFunnelValue(item: FunnelItem): string {
  if (item.value === null) return '—';
  if (item.kind === 'money') {
    return `R$ ${item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return item.value.toLocaleString('pt-BR');
}
