import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  Calendar, 
  Globe, 
  TrendingUp, 
  Shield, 
  ExternalLink,
  Loader2,
  AlertCircle,
  Clock,
  User,
  Building,
  Activity,
  HelpCircle,
  ArrowDownRight
} from 'lucide-react';
import { fetchAffiliateById, fetchAffiliateResults, fetchAffiliateConfigs, AffiliateConfig } from '../services/affiliateService';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function AffiliateDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [affiliate, setAffiliate] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [config, setConfig] = useState<AffiliateConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadDetails(id);
    }
  }, [id]);

  const loadDetails = async (affId: string) => {
    try {
      setLoading(true);
      const [detailsData, resultsData, allConfigs] = await Promise.all([
        fetchAffiliateById(affId),
        fetchAffiliateResults(affId).catch(err => {
          console.error('Error fetching results:', err);
          return [];
        }),
        fetchAffiliateConfigs()
      ]);
      setAffiliate(detailsData);
      setResults(Array.isArray(resultsData) ? resultsData : []);
      setConfig(allConfigs[affId] || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-brand animate-spin" />
        <p className="text-slate-500 font-medium">Carregando informações realistas...</p>
      </div>
    );
  }

  if (error || !affiliate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center">
          <AlertCircle size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Ops! Algo deu errado</h2>
          <p className="text-slate-500 max-w-md">{error || 'Afiliado não encontrado'}</p>
        </div>
        <button 
          onClick={() => navigate('/affiliates')}
          className="flex items-center gap-2 px-6 py-2 bg-slate-900 dark:bg-slate-800 text-white rounded-xl hover:bg-slate-800 transition-all font-medium"
        >
          <ArrowLeft size={18} /> Voltar para lista
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/affiliates')}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-brand transition-all shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {affiliate.name || affiliate.label || 'Sem Nome'}
              </h1>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                (affiliate.status === 'active' || affiliate.status === 'Ativo' || affiliate.status === 1) 
                  ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" 
                  : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
              )}>
                {affiliate.status || 'Pendente'}
              </span>
            </div>
            <p className="text-slate-500 font-mono text-xs uppercase tracking-widest mt-1">ID Externo: #{affiliate.id}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8">
        <div className="space-y-8">
          {results.length > 0 ? (
            results.map((res: any, idx: number) => {
              // Calculate custom commissions based on config
              const calculatedCpa = (res.qualified_cpa || 0) * (config?.cpaValue || 0);
              const calculatedRev = (res.rvs || 0) * ((config?.revPercentage || 0) / 100);
              const totalCommission = calculatedCpa + calculatedRev;

              return (
                <div key={idx} className="space-y-8">
                  {/* Commissions Overview */}
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-6">
                    <div>
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-2">
                        Comissão total <HelpCircle size={14} className="text-slate-300" />
                      </div>
                      <div className="flex items-baseline gap-4">
                        <h2 className="text-4xl font-black text-slate-900 dark:text-white">
                          R$ {totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h2>
                        <div className="flex items-center gap-1 text-brand font-bold text-sm bg-brand/5 px-2 py-0.5 rounded-lg">
                          <TrendingUp size={16} /> Configurado
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between group hover:border-brand/20 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-brand transition-colors shadow-sm text-xs font-black">
                            R$
                          </div>
                          <div>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                              CPA Calculado (R$ {config?.cpaValue || 0}/CPA) <HelpCircle size={10} />
                            </div>
                            <p className="text-xl font-black text-slate-800 dark:text-white">
                              R$ {calculatedCpa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between group hover:border-brand/20 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-brand transition-colors shadow-sm">
                            <TrendingUp size={20} />
                          </div>
                          <div>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                              REV Share ({config?.revPercentage || 0}%) <HelpCircle size={10} />
                            </div>
                            <p className="text-xl font-black text-slate-800 dark:text-white">
                              R$ {calculatedRev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Conversion Funnel */}
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-10">Funil de conversão</h3>
                    
                    <div className="relative">
                      {/* Data Row */}
                      <div className="grid grid-cols-3 gap-4 relative z-10 mb-10">
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-slate-400">Cadastros</p>
                          <div className="flex items-center gap-3">
                            <span className="text-4xl font-black text-slate-900 dark:text-white">{res.registrations || 0}</span>
                            <div className="flex items-center gap-1 text-green-500 font-black text-[11px] bg-green-50 dark:bg-green-900/10 px-2 py-0.5 rounded-lg">
                              <TrendingUp size={12} className="rotate-45" /> 1767.0%
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 relative">
                          {/* Conversion Point 1 */}
                          <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex items-center justify-center">
                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-1.5 rounded-2xl shadow-sm text-[10px] font-black text-slate-400 flex items-center gap-1 z-20">
                              46.4% <ExternalLink size={10} />
                            </div>
                          </div>

                          <p className="text-xs font-bold text-slate-400">FTDs</p>
                          <div className="flex items-center gap-3">
                            <span className="text-4xl font-black text-slate-900 dark:text-white">{res.first_deposits || 0}</span>
                            <div className="flex items-center gap-1 text-green-500 font-black text-[11px] bg-green-50 dark:bg-green-900/10 px-2 py-0.5 rounded-lg">
                              <TrendingUp size={12} className="rotate-45" /> 900.0%
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 relative">
                          {/* Conversion Point 2 */}
                          <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex items-center justify-center">
                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-1.5 rounded-2xl shadow-sm text-[10px] font-black text-slate-400 flex items-center gap-1 z-20">
                              13.3% <ExternalLink size={10} />
                            </div>
                          </div>

                          <p className="text-xs font-bold text-slate-400">CPA Qualificados</p>
                          <div className="flex items-center gap-3">
                            <span className="text-4xl font-black text-slate-900 dark:text-white">{res.qualified_cpa || 0}</span>
                            <div className="flex items-center gap-1 text-green-500 font-black text-[11px] bg-green-50 dark:bg-green-900/10 px-2 py-0.5 rounded-lg">
                              <TrendingUp size={12} className="rotate-45" /> 767.0%
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Funnel Visualisation - Wave Pattern */}
                      <div className="h-40 w-full relative group p-1 -mx-8">
                        <div className="absolute inset-0 flex items-end">
                          {/* Stage 1 Area */}
                          <div className="h-full w-1/3 relative overflow-hidden flex flex-col justify-end">
                            <div className="absolute inset-0 bg-slate-50 dark:bg-slate-800/10 opacity-50"></div>
                            <div className="h-[80%] w-full bg-slate-400/40 dark:bg-slate-700/40 rounded-t-[3rem] transform translate-y-10 group-hover:translate-y-6 transition-all duration-700"></div>
                            <div className="h-[60%] w-full bg-slate-500/60 dark:bg-slate-600/60 rounded-t-[3rem] transform translate-y-8 group-hover:translate-y-4 transition-all duration-1000"></div>
                            <div className="h-[40%] w-full bg-slate-900/80 dark:bg-slate-500/80 rounded-t-[3rem] relative z-10"></div>
                          </div>
                          {/* Stage 2 Area */}
                          <div className="h-full w-1/3 relative overflow-hidden flex flex-col justify-end">
                            <div className="absolute inset-0 bg-slate-100/30 dark:bg-slate-800/20"></div>
                            <div className="h-[40%] w-full bg-slate-400/40 dark:bg-slate-700/40 rounded-t-[2rem] transform translate-y-4 group-hover:translate-y-2 transition-all duration-700"></div>
                            <div className="h-[30%] w-full bg-slate-500/60 dark:bg-slate-600/60 rounded-t-[2rem] transform translate-y-3 group-hover:translate-y-1 transition-all duration-1000"></div>
                            <div className="h-[20%] w-full bg-slate-900/80 dark:bg-slate-500/80 rounded-t-[2rem] relative z-10"></div>
                          </div>
                          {/* Stage 3 Area */}
                          <div className="h-full w-1/3 relative overflow-hidden flex flex-col justify-end">
                            <div className="absolute inset-0 bg-slate-50 dark:bg-slate-800/10 opacity-50"></div>
                            <div className="h-[35%] w-full bg-slate-400/40 dark:bg-slate-700/40 rounded-t-[1.5rem] transform translate-y-2 translate-x-2 group-hover:translate-y-0 transition-all duration-700"></div>
                            <div className="h-[25%] w-full bg-slate-500/60 dark:bg-slate-600/60 rounded-t-[1.5rem] transform translate-y-2 translate-x-2 group-hover:translate-y-0 transition-all duration-1000"></div>
                            <div className="h-[15%] w-full bg-slate-900/80 dark:bg-slate-500/80 rounded-t-[1.5rem] relative z-10"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Charts par Casa */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
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

                  {/* Clients Table Section */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl flex flex-col shadow-sm overflow-hidden mb-20">
                    <div className="p-6 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center bg-slate-50/50">
                      <h3 className="font-black text-xs text-slate-800 dark:text-white uppercase tracking-widest">Lista de Clientes</h3>
                      <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Filtrar por Casa
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] text-slate-400 uppercase tracking-widest sticky top-0 backdrop-blur-sm z-10 border-b border-slate-100 dark:border-slate-800">
                          <tr>
                            <th className="px-8 py-5 font-black">Nome</th>
                            <th className="px-8 py-5 font-black">Valor do primeiro depósito</th>
                            <th className="px-8 py-5 font-black">Data de cadastro</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Using empty state for now */}
                          <tr>
                            <td colSpan={3} className="px-8 py-20 text-center">
                              <div className="flex flex-col items-center gap-2 opacity-30">
                                <User size={32} />
                                <p className="text-xs font-bold uppercase tracking-widest">Nenhum cliente registrado</p>
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-300 mb-4 shadow-sm">
                <Clock size={32} />
              </div>
              <p className="text-lg text-slate-500 font-bold max-w-sm px-6">
                Nenhum dado de performance disponível para este afiliado no momento.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
