import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  DollarSign, 
  BarChart3, 
  TrendingUp,
  Loader2,
  HelpCircle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import { fetchAffiliates, fetchAllResults } from '../services/affiliateService';
import DateRangePicker from '../components/DateRangePicker';
import { DateRange, getDefaultRange } from '../lib/dateRange';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const [affiliatesCount, setAffiliatesCount] = useState<number>(0);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>(() => getDefaultRange());
  const [totals, setTotals] = useState({
    commission: 0,
    cpa: 0,
    rev: 0
  });

  // Contagem de afiliados independe do período — busca uma vez.
  useEffect(() => {
    fetchAffiliates()
      .then((affiliates) => setAffiliatesCount(affiliates.length))
      .catch((err) => console.error('Error fetching affiliates for dashboard:', err));
  }, []);

  // Resultados/comissões respeitam o intervalo de datas selecionado (B2).
  useEffect(() => {
    async function getResults() {
      try {
        setLoading(true);
        const allResults = await fetchAllResults(range);
        setResults(allResults);

        // Calculate totals
        const calculatedTotals = allResults.reduce((acc, curr) => ({
          commission: acc.commission + (curr.total_commission || 0),
          cpa: acc.cpa + (curr.cpa || 0),
          rev: acc.rev + (curr.rvs || 0)
        }), { commission: 0, cpa: 0, rev: 0 });

        setTotals(calculatedTotals);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setResults([]);
        setTotals({ commission: 0, cpa: 0, rev: 0 });
      } finally {
        setLoading(false);
      }
    }
    getResults();
  }, [range.startDate, range.endDate]);

  const metrics = [
    { label: 'Total de Afiliados', value: affiliatesCount.toString(), icon: Users, color: 'brand' },
    { label: 'Total comissão', value: `R$ ${totals.commission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'green' },
    { label: 'Total CPA', value: `R$ ${totals.cpa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: BarChart3, color: 'blue' },
    { label: 'Total REV', value: `R$ ${totals.rev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: 'purple' },
  ];

  // Prepare data for the chart - top 10 affiliates by commission
  const chartData = [...results]
    .sort((a, b) => (b.total_commission || 0) - (a.total_commission || 0))
    .map(item => {
      const label = String(item.affiliate_name || item.name || item.affiliate_id || '---');
      return {
        name: label,
        Comissão: item.total_commission || 0,
        CPA: item.cpa || 0,
        REV: item.rvs || 0,
      };
    });

  const [chartPage, setChartPage] = useState(0);
  const pageSize = 5;
  const pageCount = Math.ceil(chartData.length / pageSize);
  const visibleChartData = chartData.slice(chartPage * pageSize, chartPage * pageSize + pageSize);

  useEffect(() => {
    if (chartPage > pageCount - 1) {
      setChartPage(Math.max(pageCount - 1, 0));
    }
  }, [chartPage, pageCount]);

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
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Bem-vindo de volta, {profile?.name}. Visão geral do desempenho da rede.</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={cn(
              "p-6 rounded-2xl border shadow-sm transition-all relative overflow-hidden",
              idx === 0 
                ? "bg-slate-900 text-white border-transparent" 
                : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800"
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="animate-spin text-brand" />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div className={cn(
                    "p-2.5 rounded-xl",
                    idx === 0 ? "bg-white/10" : "bg-slate-50 dark:bg-slate-800"
                  )}>
                    <metric.icon size={20} className={cn(
                      idx === 0 ? "text-white" : "text-slate-900 dark:text-slate-100"
                    )} />
                  </div>
                </div>
                
                <div>
                  <p className={cn(
                    "text-[10px] uppercase font-black tracking-widest mb-1",
                    idx === 0 ? "text-slate-400" : "text-slate-400"
                  )}>
                    {metric.label}
                  </p>
                  <h3 className="text-xl font-black dark:text-white truncate">{metric.value}</h3>
                </div>
              </>
            )}
          </motion.div>
        ))}
      </div>

      {/* Chart Section */}
      <section className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
              Desempenho por Afiliado <HelpCircle size={14} className="text-slate-500 dark:text-slate-300" />
            </h3>
            <p className="text-xs text-slate-500 font-medium">Top parceiros por volume de comissão — mostra 5 por vez, use o controle para ver os próximos.</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
             <TrendingUp size={16} className="text-slate-700 dark:text-slate-200" />
             <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-widest italic">Performance em tempo real</span>
          </div>
        </div>

        <div className="h-[400px] w-full">
          {chartData.length > 5 && !loading && (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 font-bold">
                Mostrando {chartPage * pageSize + 1} - {Math.min((chartPage + 1) * pageSize, chartData.length)} de {chartData.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChartPage((prev) => Math.max(prev - 1, 0))}
                  disabled={chartPage === 0}
                  className="px-3 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setChartPage((prev) => Math.min(prev + 1, pageCount - 1))}
                  disabled={chartPage === pageCount - 1}
                  className="px-3 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
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
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={visibleChartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
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
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={<CustomizedAxisTick />} 
                  interval={0}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: theme === 'dark' ? '#CBD5E1' : '#475569' }}
                  tickFormatter={(value) => `R$ ${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`}
                />
                <Tooltip 
                  cursor={{ fill: '#F1F5F9', radius: 10 }}
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    padding: '12px'
                  }}
                  itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                  labelStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', marginBottom: '8px' }}
                  formatter={(value: number, name: string) => [
                    `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                    name
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

    </div>
  );
}


function clsx(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
