import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Info, 
  ExternalLink,
  DollarSign,
  TrendingUp,
  HelpCircle,
  ArrowDownRight,
  ChevronRight,
  Clock,
  Activity,
  Zap,
  Globe,
  Database
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAffiliates, fetchAffiliateResults } from '../services/affiliateService';
import { cn } from '../lib/utils';

export default function ClientDashboard() {
  const { profile } = useAuth();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.email) {
      loadClientData(profile.email);
    }
  }, [profile?.email]);

  const loadClientData = async (email: string) => {
    try {
      setLoading(true);
      // First find the affiliate ID by email
      const allAffiliates = await fetchAffiliates();
      const myAffiliate = allAffiliates.find((a: any) => a.email?.toLowerCase() === email.toLowerCase());
      
      if (myAffiliate) {
        const resultsData = await fetchAffiliateResults(myAffiliate.id).catch(err => {
          console.error('Error fetching results:', err);
          return [];
        });
        setResults(Array.isArray(resultsData) ? resultsData : []);
      }
      setError(null);
    } catch (err) {
      console.error('Error loading client dashboard data:', err);
      // We don't set error here to allow showing the empty state gracefully
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Painel do Parceiro</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Bem-vindo, {profile?.name}. Aqui estão seus números de performance.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-800">
          <Clock size={16} className="text-brand" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Atualizado: Agora</span>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Zap className="w-10 h-10 text-brand animate-pulse" />
          <p className="text-slate-500 font-medium">Sincronizando dados...</p>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-8">
          {results.map((res: any, idx: number) => (
            <div key={idx} className="space-y-8">
              {/* Commissions Overview */}
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-6">
                <div>
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-2">
                    Comissão total <HelpCircle size={14} className="text-slate-300" />
                  </div>
                  <div className="flex items-baseline gap-4">
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white">
                      R$ {res.total_commission?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}
                    </h2>
                    <div className="flex items-center gap-1 text-red-500 font-bold text-sm">
                      <ArrowDownRight size={16} /> 63%
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between group hover:border-brand/20 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-brand transition-colors shadow-sm">
                        <DollarSign size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                          CPA (R$) <HelpCircle size={10} />
                        </div>
                        <p className="text-xl font-black text-slate-800 dark:text-white">
                          R$ {res.cpa?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-red-500 font-bold text-xs">
                      <ArrowDownRight size={14} /> 62%
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between group hover:border-brand/20 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-brand transition-colors shadow-sm">
                        <TrendingUp size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                          REV (R$) <HelpCircle size={10} />
                        </div>
                        <p className="text-xl font-black text-slate-800 dark:text-white">
                          R$ {res.rvs?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-red-500 font-bold text-xs">
                      <ArrowDownRight size={14} /> 87%
                    </div>
                  </div>
                </div>
              </div>

              {/* Conversion Funnel */}
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-8">Funil de conversão</h3>
                
                <div className="relative">
                  <div className="grid grid-cols-3 gap-0 relative z-10">
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-400">Cadastros</p>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-slate-900 dark:text-white">{res.registrations || 0}</span>
                        <div className="flex items-center gap-0.5 text-red-500 font-bold text-[10px]">
                          <ArrowDownRight size={12} /> 73.0%
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 pl-8 border-l border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-400">FTDs</p>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-slate-900 dark:text-white">{res.first_deposits || 0}</span>
                        <div className="flex items-center gap-0.5 text-red-500 font-bold text-[10px]">
                          <ArrowDownRight size={12} /> 62.0%
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 pl-8 border-l border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-400">CPA Qualificados</p>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-slate-900 dark:text-white">{res.qualified_cpa || 0}</span>
                        <div className="flex items-center gap-0.5 text-red-500 font-bold text-[10px]">
                          <ArrowDownRight size={12} /> 62.0%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Funnel Visualisation Background */}
                  <div className="mt-8 h-32 w-full relative overflow-hidden rounded-xl">
                    <div className="absolute inset-0 flex items-end">
                      <div className="h-full w-1/3 bg-slate-100 dark:bg-slate-800/40 relative">
                        <div className="absolute top-0 right-0 h-full w-px bg-slate-200 dark:bg-slate-700"></div>
                        <div className="absolute bottom-0 left-0 w-full h-[70%] bg-brand/20 dark:bg-brand/10 rounded-t-lg"></div>
                        <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 px-2 py-1 rounded-full border border-slate-100 dark:border-slate-800 text-[9px] font-bold text-slate-400 shadow-sm z-20">
                          35.7% →
                        </div>
                      </div>
                      <div className="h-full w-1/3 bg-slate-50 dark:bg-slate-800/20 relative">
                        <div className="absolute top-0 right-0 h-full w-px bg-slate-200 dark:bg-slate-700"></div>
                        <div className="absolute bottom-0 left-0 w-full h-[55%] bg-brand/30 dark:bg-brand/20 rounded-t-lg"></div>
                        <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 px-2 py-1 rounded-full border border-slate-100 dark:border-slate-800 text-[9px] font-bold text-slate-400 shadow-sm z-20">
                          16.7% →
                        </div>
                      </div>
                      <div className="h-full w-1/3 bg-slate-100 dark:bg-slate-800/40 relative">
                        <div className="absolute bottom-0 left-0 w-full h-[50%] bg-brand/40 dark:bg-brand/30 rounded-t-lg"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts par Casa */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center gap-1 text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-8">
                    REV (R$) por Casa <HelpCircle size={14} className="text-slate-300" />
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded bg-red-600 flex items-center justify-center text-white font-black text-[10px]">S</div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Superbet</span>
                        </div>
                        <span className="text-xs font-bold text-slate-400">R$ {res.rvs?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}</span>
                      </div>
                      <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                         <div className="h-full bg-slate-700 dark:bg-slate-600 rounded-full w-[90%]"></div>
                         <div className="absolute inset-0 flex justify-between px-4 items-center">
                           <span className="text-[10px] text-slate-400">0</span>
                           <span className="text-[10px] text-slate-400">7.5</span>
                           <span className="text-[10px] text-slate-400">15</span>
                           <span className="text-[10px] text-slate-400">22.5</span>
                           <span className="text-[10px] text-slate-100">30</span>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-1 text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">
                      CPA (R$) por Casa <HelpCircle size={14} className="text-slate-300" />
                    </div>
                    <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-lg border border-slate-100 dark:border-slate-700">
                      <button className="px-3 py-1 bg-white dark:bg-slate-700 text-[10px] font-bold text-slate-900 dark:text-white rounded shadow-sm">R$</button>
                      <button className="px-3 py-1 text-[10px] font-bold text-slate-400">Qtd.</button>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded bg-red-600 flex items-center justify-center text-white font-black text-[10px]">S</div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Superbet</span>
                        </div>
                        <span className="text-xs font-bold text-slate-400">R$ 4,5k</span>
                      </div>
                      <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                         <div className="h-full bg-slate-700 dark:bg-slate-600 rounded-full w-[95%]"></div>
                         <div className="absolute inset-0 flex justify-between px-4 items-center">
                           <span className="text-[10px] text-slate-400">0</span>
                           <span className="text-[10px] text-slate-400">1,3k</span>
                           <span className="text-[10px] text-slate-400">2,5k</span>
                           <span className="text-[10px] text-slate-400">3,8k</span>
                           <span className="text-[10px] text-slate-100">5k</span>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
               <div className="relative z-10">
                 <div className="w-12 h-12 bg-slate-900 dark:bg-slate-800 text-white rounded-xl flex items-center justify-center mb-6">
                   <Zap size={24} />
                 </div>
                 <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2 tracking-tight">Status da sua Conta</h3>
                 <p className="text-sm text-slate-500 max-w-md">
                   Sua conta está ativa, mas ainda não detectamos conversões no período selecionado. 
                   Aguarde a atualização do sistema parceiro.
                 </p>
                 
                 <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                   {[
                     { label: 'Status da Rede', value: 'Operacional', icon: Globe },
                     { label: 'Último Sync', value: 'Há 5 minutos', icon: Database },
                   ].map((item, idx) => (
                     <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex items-center gap-4 border border-slate-100 dark:border-slate-800">
                       <div className="p-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
                         <item.icon size={20} className="text-brand" />
                       </div>
                       <div>
                         <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{item.label}</p>
                         <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.value}</p>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
            </section>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                      <Info size={18} className="text-brand" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">Comunicado #{i}</h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed font-medium">
                    Consulte as novas regras de CPA e Revenue Share vigentes para parceiros Bronze.
                  </p>
                  <button className="text-[10px] font-bold text-brand uppercase tracking-widest flex items-center gap-2 hover:underline">
                    Ler agora <ExternalLink size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Acesso Rápido</h4>
              <div className="space-y-1">
                {['Materiais de Apoio', 'Suporte Técnico', 'Regras da Gota'].map((item) => (
                  <button key={item} className="w-full text-left px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-brand/5 transition-all flex justify-between items-center group">
                    {item}
                    <ChevronRight size={14} className="text-slate-300 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
