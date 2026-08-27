// Núcleo PURO do "extrato diário" exportável (Export CSV — convergente
// Affility+NovaEra). Monta as linhas a partir dos `results` (groupBy=date, já
// mesclados OTG+manual como o resto do app) + a comissão CALCULADA pela fonte
// única de dinheiro (calcAffiliatePayout) — NUNCA o `total_commission` cru da OTG
// (esse é receita da CASA, não o repasse ao afiliado; reimplementar isso inline
// seria a MESMA classe de bug documentada em CLAUDE.md). Sem Firebase/DOM.

import { calcAffiliatePayout, AffiliateConfig } from './commission';
import { buildCsv, CsvColumn } from './csv';

export interface DailyExtractRow {
  date: string;
  registrations: number;
  firstDeposits: number;
  qualifiedCpa: number;
  rvs: number;
  commission: number;
}

// `dailyResults` = linhas cruas do groupBy=date (id|label = data ISO). Ordena por
// data crescente (a API não garante ordem). Nunca lança p/ array inválido.
export function buildDailyExtractRows(
  dailyResults: any[],
  config?: AffiliateConfig | null,
  brandId?: string
): DailyExtractRow[] {
  const rows = Array.isArray(dailyResults) ? dailyResults : [];
  return rows
    .map((r) => ({
      date: String(r?.id ?? r?.label ?? ''),
      registrations: Number(r?.registrations) || 0,
      firstDeposits: Number(r?.first_deposits) || 0,
      qualifiedCpa: Number(r?.qualified_cpa) || 0,
      rvs: Number(r?.rvs) || 0,
      commission: calcAffiliatePayout(r, config, brandId),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const EXTRACT_COLUMNS: CsvColumn<DailyExtractRow>[] = [
  { key: 'date', label: 'Data' },
  { key: 'registrations', label: 'Cadastros' },
  { key: 'firstDeposits', label: 'Primeiros Depósitos' },
  { key: 'qualifiedCpa', label: 'CPA Qualificado' },
  { key: 'rvs', label: 'REV (unidades)' },
  { key: 'commission', label: 'Comissão (R$)', format: (r) => r.commission.toFixed(2) },
];

// `showRev = false` corta a coluna de RVS: instância que fecha só CPA
// (VITE_REV_ENABLED=false) esconde o REV dos cards, e um extrato com uma coluna
// de unidades de receita compartilhada que a tela não explica só gera dúvida. A
// coluna de comissão NÃO muda: a parcela REV continua apurada e paga se houver
// taxa. Default `true` = o extrato de sempre.
export function buildDailyExtractCsv(
  dailyResults: any[],
  config?: AffiliateConfig | null,
  brandId?: string,
  showRev = true,
): string {
  const columns = showRev ? EXTRACT_COLUMNS : EXTRACT_COLUMNS.filter((c) => c.key !== 'rvs');
  return buildCsv(columns, buildDailyExtractRows(dailyResults, config, brandId));
}
