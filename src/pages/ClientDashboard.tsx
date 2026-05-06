import { motion } from 'motion/react';
import { 
  Info, 
  ExternalLink,
  Zap,
  Globe,
  Database
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function ClientDashboard() {
  const { profile } = useAuth();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-light text-gray-900 dark:text-white">Painel do Cliente</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Bem-vindo, {profile?.name}. Aqui estão as informações da sua rede.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative">
            <div className="relative z-10">
              <div className="w-10 h-10 bg-slate-900 dark:bg-slate-800 text-white rounded-lg flex items-center justify-center mb-6">
                <Zap size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">Informações da Conexão</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-md">
                Monitoramento em tempo real dos serviços parceiros.
                Acompanhe o status e a integridade da sua rede de afiliados.
              </p>
              
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Status da Conexão', value: 'Operacional', icon: Globe, statusColor: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
                  { label: 'Última Amostragem', value: 'Sincronizado há 2m', icon: Database, statusColor: 'text-brand bg-brand/10' },
                ].map((item, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg flex items-center gap-3 border border-slate-100 dark:border-slate-800">
                    <div className="p-2 bg-white dark:bg-slate-900 rounded-md shadow-sm">
                      <item.icon size={18} className="text-slate-400 dark:text-slate-500" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">{item.label}</p>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 dark:bg-slate-800/20 rounded-full translate-x-1/2 -translate-y-1/2 opacity-50" />
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-brand/10 dark:bg-brand/20 flex items-center justify-center">
                    <Info size={16} className="text-brand" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">Comunicado Institucional #{i}</h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed font-medium">
                  Informações importantes sobre as novas diretrizes da rede de afiliados para o próximo semestre. 
                </p>
                <button className="text-[10px] font-bold text-brand uppercase tracking-widest flex items-center gap-2 hover:underline">
                  Ler comunicado <ExternalLink size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-xl shadow-lg">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Ganhos Disponíveis</h4>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold">R$ 1.250,50</span>
              <span className="text-[10px] font-bold text-green-400">+4.2%</span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full mb-3 flex overflow-hidden">
              <div className="h-full bg-brand w-1/4" />
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter italic">Meta Mensal: 25% Atingida</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight mb-4">Acesso Rápido</h4>
            <div className="space-y-1">
              {['Central de Suporte', 'Base de Conhecimento', 'Material de Apoio'].map((item) => (
                <button key={item} className="w-full text-left px-3 py-2.5 rounded-md text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-brand/5 dark:hover:bg-brand/20 hover:text-brand dark:hover:text-brand border border-transparent hover:border-brand/10 transition-all flex justify-between items-center group">
                  {item}
                  <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 transition-transform" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChevronRight({ size, className }: { size: number, className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
