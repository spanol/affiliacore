// Centraliza a lógica de intervalo de datas usada pelos filtros das dashboards (B2).
// Todas as datas trafegam como 'YYYY-MM-DD' (formato esperado pela API externa /results).

export interface DateRange {
  startDate: string;
  endDate: string;
}

export type DateRangePresetId =
  | 'today'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom';

// Formata uma Date no fuso LOCAL como 'YYYY-MM-DD'.
// Evita o off-by-one que toISOString() causa (ele converte para UTC antes).
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Calcula o intervalo de um preset. 'custom' não tem intervalo próprio
// (o usuário define manualmente), então retorna o mês atual como base.
export function getPresetRange(preset: DateRangePresetId, now: Date = new Date()): DateRange {
  const today = toISODate(now);

  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'last7': {
      const start = new Date(now);
      start.setDate(start.getDate() - 6); // inclui hoje => 7 dias
      return { startDate: toISODate(start), endDate: today };
    }
    case 'last30': {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { startDate: toISODate(start), endDate: today };
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: toISODate(start), endDate: today };
    }
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0); // dia 0 = último dia do mês anterior
      return { startDate: toISODate(start), endDate: toISODate(end) };
    }
    case 'custom':
    default:
      return getPresetRange('thisMonth', now);
  }
}

export const DATE_RANGE_PRESETS: Array<{ id: DateRangePresetId; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'last7', label: 'Últimos 7 dias' },
  { id: 'last30', label: 'Últimos 30 dias' },
  { id: 'thisMonth', label: 'Mês atual' },
  { id: 'lastMonth', label: 'Mês passado' },
  { id: 'custom', label: 'Personalizado' },
];

// Intervalo padrão ao abrir as dashboards: mês atual (decisão de produto, B2).
export function getDefaultRange(now: Date = new Date()): DateRange {
  return getPresetRange('thisMonth', now);
}

// Rótulo curto e legível (pt-BR) para o intervalo selecionado.
export function formatRangeLabel(range: DateRange): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  if (range.startDate === range.endDate) return fmt(range.startDate);
  return `${fmt(range.startDate)} – ${fmt(range.endDate)}`;
}

// Descobre qual preset corresponde a um intervalo (ou 'custom' se nenhum bater).
export function matchPreset(range: DateRange, now: Date = new Date()): DateRangePresetId {
  for (const { id } of DATE_RANGE_PRESETS) {
    if (id === 'custom') continue;
    const r = getPresetRange(id, now);
    if (r.startDate === range.startDate && r.endDate === range.endDate) {
      return id;
    }
  }
  return 'custom';
}
