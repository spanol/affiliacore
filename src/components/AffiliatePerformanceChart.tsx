import React, { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTheme } from '../contexts/ThemeContext';
import InfoTooltip from './InfoTooltip';

export interface AffiliatePerformanceDatum {
  name: string;
  Comissão: number;
  CPA: number;
  REV: number;
}

interface AffiliatePerformanceChartProps {
  data: AffiliatePerformanceDatum[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
  infoText?: string;
}

// Gráfico "Desempenho por Afiliado" — barras de Comissão/CPA/REV por afiliado,
// ordenadas por comissão, paginadas (5 por vez). Compartilhado entre o /admin
// (toda a rede) e o /network do afiliado especial (own + subs, à taxa própria —
// princípio especial = master escopado). O caller monta `data` já no escopo certo.
export default function AffiliatePerformanceChart({
  data,
  loading = false,
  title = 'Desempenho por Afiliado',
  subtitle = 'Top parceiros por volume de comissão — mostra 5 por vez, use o controle para ver os próximos.',
  infoText = 'Top afiliados por volume de comissão no período. Use os controles abaixo para navegar entre as páginas.',
}: AffiliatePerformanceChartProps) {
  const { theme } = useTheme();
  const [page, setPage] = useState(0);
  const pageSize = 5;
  const pageCount = Math.ceil(data.length / pageSize);
  const visibleData = data.slice(page * pageSize, page * pageSize + pageSize);

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(pageCount - 1, 0));
  }, [page, pageCount]);

  const CustomizedAxisTick = ({ x, y, payload }: any) => {
    const label = String(payload.value);
    return (
      <text
        x={x}
        y={y + 15}
        textAnchor="end"
        fill={theme === 'dark' ? '#CBD5E1' : '#475569'}
        fontSize={11}
        fontWeight={700}
        transform={`rotate(-45, ${x}, ${y + 15})`}
      >
        <title>{label}</title>
        {label}
      </text>
    );
  };

  return (
    <section className="relative overflow-hidden bg-white dark:bg-neutral-900/60 p-6 md:p-8 rounded-3xl border border-slate-200/70 dark:border-neutral-800 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            {title} <InfoTooltip text={infoText} align="left" />
          </h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium mt-1">{subtitle}</p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-300 uppercase tracking-widest">Performance em tempo real</span>
        </div>
      </div>

      <div className="h-[400px] w-full">
        {data.length > 5 && !loading && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 font-bold">
              Mostrando {page * pageSize + 1} - {Math.min((page + 1) * pageSize, data.length)} de {data.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
                disabled={page === 0}
                className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-200 hover:border-slate-300 dark:hover:border-neutral-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(prev + 1, pageCount - 1))}
                disabled={page === pageCount - 1}
                className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-200 hover:border-slate-300 dark:hover:border-neutral-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-slate-400 font-medium">
            Carregando dados do gráfico...
          </div>
        ) : data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visibleData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <defs>
                <linearGradient id="commissionGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.95} />
                  <stop offset="95%" stopColor="#C084FC" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="cpaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F97316" stopOpacity={0.95} />
                  <stop offset="95%" stopColor="#FDBA74" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.95} />
                  <stop offset="95%" stopColor="#7DD3FC" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#E2E8F0'} opacity={0.65} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={<CustomizedAxisTick />} interval={0} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: theme === 'dark' ? '#CBD5E1' : '#475569' }}
                tickFormatter={(value) => `R$ ${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`}
              />
              <Tooltip
                cursor={{ fill: theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : '#F1F5F9', radius: 10 }}
                contentStyle={{
                  borderRadius: '16px',
                  border: theme === 'dark' ? '1px solid #1E293B' : 'none',
                  backgroundColor: theme === 'dark' ? '#0F172A' : '#FFFFFF',
                  boxShadow: theme === 'dark' ? '0 10px 25px -5px rgb(0 0 0 / 0.6)' : '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px',
                }}
                itemStyle={{ fontSize: '12px', fontWeight: 700, color: theme === 'dark' ? '#E2E8F0' : '#334155' }}
                labelStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: theme === 'dark' ? '#94A3B8' : '#64748B', marginBottom: '8px' }}
                formatter={(value: any, name: any) => [
                  `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                  name,
                ]}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}
              />
              <Bar name="Comissão" dataKey="Comissão" fill="url(#commissionGradient)" radius={[6, 6, 0, 0]} barSize={22} />
              <Bar name="CPA" dataKey="CPA" fill="url(#cpaGradient)" radius={[6, 6, 0, 0]} barSize={22} />
              <Bar name="REV" dataKey="REV" fill="url(#revGradient)" radius={[6, 6, 0, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-4">
            <BarChart3 size={48} className="opacity-20" />
            <p className="font-bold text-sm uppercase tracking-widest">Sem dados disponíveis</p>
          </div>
        )}
      </div>
    </section>
  );
}
