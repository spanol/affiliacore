import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface DailyPerformanceChartProps {
  data: any[];
}

// Renders the affiliate's daily evolution (cadastros + comissão) from the
// external API's `groupBy=date` results. Replaces the old per-client table,
// since the affiliate API exposes no per-client data.
export default function DailyPerformanceChart({ data }: DailyPerformanceChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Tokens alinhados ao tema (antes eram cores claras fixas que sumiam no dark).
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const tickColor = isDark ? '#94a3b8' : '#94a3b8';
  const barColor = isDark ? '#475569' : '#141C2A'; // slate-600 no dark, brand no light
  const lineColor = '#0ea5e9';

  const rows = (Array.isArray(data) ? data : [])
    .map((r: any) => {
      const date = String(r.id || r.label || '');
      return {
        date,
        label: date.length >= 10 ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : date,
        cadastros: Number(r.registrations || 0),
        comissao: Number(r.total_commission || 0),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2 opacity-40">
        <LineChartIcon size={32} />
        <p className="text-xs font-bold uppercase tracking-widest">Sem movimentação no período</p>
      </div>
    );
  }

  return (
    <div className="w-full h-72 px-2 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 16, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: isDark ? 'rgba(163, 163, 163, 0.12)' : '#F1F5F9' }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 12,
              // Carvão dos cards (neutral-900/800), não mais o slate azulado anterior.
              border: isDark ? '1px solid #262626' : '1px solid #e2e8f0',
              backgroundColor: isDark ? '#171717' : '#FFFFFF',
              padding: '8px 12px',
            }}
            itemStyle={{ color: isDark ? '#E5E5E5' : '#334155' }}
            labelStyle={{ color: isDark ? '#A3A3A3' : '#64748B' }}
            formatter={(value: any, name: any) =>
              name === 'comissao'
                ? [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Comissão']
                : [value, 'Cadastros']
            }
            labelFormatter={(l) => `Dia ${l}`}
          />
          <Bar yAxisId="left" dataKey="cadastros" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Line yAxisId="right" type="monotone" dataKey="comissao" stroke={lineColor} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
