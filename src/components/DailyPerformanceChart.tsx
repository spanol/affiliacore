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

interface DailyPerformanceChartProps {
  data: any[];
}

// Renders the affiliate's daily evolution (cadastros + comissão) from the
// external API's `groupBy=date` results. Replaces the old per-client table,
// since the affiliate API exposes no per-client data.
export default function DailyPerformanceChart({ data }: DailyPerformanceChartProps) {
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
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0', padding: '8px 12px' }}
            formatter={(value: any, name: any) =>
              name === 'comissao'
                ? [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Comissão']
                : [value, 'Cadastros']
            }
            labelFormatter={(l) => `Dia ${l}`}
          />
          <Bar yAxisId="left" dataKey="cadastros" fill="#141C2A" radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Line yAxisId="right" type="monotone" dataKey="comissao" stroke="#0ea5e9" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
