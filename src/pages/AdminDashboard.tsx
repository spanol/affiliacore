import { motion } from 'motion/react';
import { 
  Users, 
  DollarSign, 
  BarChart3, 
  ArrowUpRight, 
  ArrowDownRight,
  UserPlus
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const metrics = [
  { label: 'Total de Afiliados', value: '1,248', trend: +12, icon: Users, color: 'brand' },
  { label: 'Conversões Hoje', value: '84', trend: +5, icon: BarChart3, color: 'green' },
  { label: 'Ganhos Acumulados', value: 'R$ 45.200,00', trend: +8, icon: DollarSign, color: 'purple' },
  { label: 'Novos Cadastros', value: '12', trend: -2, icon: UserPlus, color: 'orange' },
];

export default function AdminDashboard() {
  const { profile } = useAuth();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-light text-gray-900">Dashboard Administrativo</h1>
        <p className="text-gray-500 text-sm mt-1">Bem-vindo de volta, {profile?.name}. Aqui estão os números de hoje.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={clsx(
              "p-5 rounded-xl border shadow-sm transition-all relative overflow-hidden",
              idx === 3 
                ? "bg-gradient-to-br from-brand to-slate-800 text-white border-transparent" 
                : "bg-white border-slate-200"
            )}
          >
            <div className="flex justify-between items-start mb-1">
              <p className={clsx(
                "text-[10px] uppercase font-bold tracking-wider",
                idx === 3 ? "text-white/70" : "text-slate-500"
              )}>
                {metric.label}
              </p>
              {idx !== 3 && (
                <div className={clsx(
                  "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
                  metric.trend > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                )}>
                  {metric.trend > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {Math.abs(metric.trend)}%
                </div>
              )}
            </div>
            <h3 className="text-2xl font-bold">{metric.value}</h3>
            <div className={clsx(
              "text-[10px] mt-2 font-medium",
              idx === 3 ? "text-white/80" : "text-slate-400"
            )}>
              {idx === 3 ? "Meta mensal: 82%" : idx === 2 ? "Meta acumulada" : "Estável esta semana"}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl flex flex-col shadow-sm">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-tight">Atividade do Sistema</h3>
            <button className="text-[10px] text-brand font-bold uppercase tracking-wider hover:underline">Ver tudo</button>
          </div>
          <div className="flex-1 overflow-auto max-h-[400px]">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-6 py-3 font-bold">Evento</th>
                  <th className="px-6 py-3 font-bold">Status</th>
                  <th className="px-6 py-3 font-bold">Horário</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-50">
                {[
                  { name: 'Marco Antonio', status: 'Ativo', time: 'Hoje, 10:45', color: 'bg-orange-100 text-orange-600', initial: 'MA' },
                  { name: 'Lucas Barbosa', status: 'Pendente', time: 'Ontem, 16:20', color: 'bg-brand/10 text-brand', initial: 'LB' },
                  { name: 'Sara Rocha', status: 'Ativo', time: '12/10, 09:12', color: 'bg-purple-100 text-purple-600', initial: 'SR' },
                  { name: 'Julio Cesar', status: 'Ativo', time: '12/10, 08:30', color: 'bg-green-100 text-green-600', initial: 'JC' },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className={clsx("w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px]", row.color)}>
                        {row.initial}
                      </div>
                      <span className="font-medium text-slate-700">{row.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={clsx(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold",
                        row.status === 'Ativo' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                      )}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-medium">{row.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-sm space-y-6">
          <h3 className="font-bold text-xs text-slate-800 uppercase tracking-tight">Metas de Desempenho</h3>
          <div className="space-y-6">
            {[
              { label: 'Novos Afiliados', value: 75 },
              { label: 'Volume de Vendas', value: 42 },
              { label: 'Retenção de Clientes', value: 91 },
            ].map((meta, i) => (
              <div key={i}>
                <div className="flex justify-between text-[11px] mb-2 font-bold uppercase tracking-tight">
                  <span className="text-slate-500">{meta.label}</span>
                  <span className="text-slate-900">{meta.value}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-brand rounded-full transition-all duration-1000" 
                    style={{ width: `${meta.value}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
          
          <div className="pt-4 mt-4 border-t border-slate-50 text-[10px] text-slate-400 italic">
            * Dados atualizados automaticamente a cada 5 minutos.
          </div>
        </div>
      </div>
    </div>
  );
}

function clsx(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
