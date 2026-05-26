import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Building,
  HelpCircle,
  Loader2,
  Shield,
  TrendingUp,
  User,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  AffiliateConfig,
  fetchAffiliateById,
  fetchAffiliateConfigs,
  fetchAffiliateResults,
  fetchAffiliates,
} from '../services/affiliateService';
import { cn } from '../lib/utils';

export default function ClientDashboard() {
  const { profile } = useAuth();
  const [affiliate, setAffiliate] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [config, setConfig] = useState<AffiliateConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.affiliateId || profile?.email) {
      loadClientData();
    }
  }, [profile?.affiliateId, profile?.email]);

  const loadClientData = async () => {
    try {
      setLoading(true);

      let affiliateId = profile?.affiliateId || '';
      let affiliateDetails: any = null;
      let allConfigs: Record<string, AffiliateConfig> = {};
      let resultsData: any[] = [];

      if (affiliateId) {
        affiliateDetails = await fetchAffiliateById(affiliateId).catch(() => null);
      }

      if (!affiliateDetails && profile?.email) {
        const allAffiliates = await fetchAffiliates().catch(() => []);
        affiliateDetails = allAffiliates.find(
          (item: any) => item.email?.toLowerCase() === profile.email?.toLowerCase()
        );
        affiliateId = String(affiliateDetails?.id || affiliateDetails?._id || affiliateId || '');
      }

      if (affiliateId) {
        [resultsData, allConfigs] = await Promise.all([
          fetchAffiliateResults(affiliateId).catch((err) => {
            console.error('Error fetching results:', err);
            return [];
          }),
          fetchAffiliateConfigs().catch((err) => {
            console.error('Error fetching configs:', err);
            return {};
          }),
        ]);
      }

      const fallbackAffiliate = {
        id: affiliateId || profile?.affiliateId || profile?.uid || 'N/A',
        name: profile?.name || 'Sem Nome',
        label: profile?.name || 'Sem Nome',
        email: profile?.email || '',
        status: 'Ativo',
      };

      setAffiliate(affiliateDetails || fallbackAffiliate);
      setResults(Array.isArray(resultsData) ? resultsData : []);
      setConfig(affiliateId ? allConfigs[affiliateId] || null : null);
      setError(null);
    } catch (err) {
      console.error('Error loading client dashboard data:', err);
      setAffiliate({
        id: profile?.affiliateId || profile?.uid || 'N/A',
        name: profile?.name || 'Sem Nome',
        label: profile?.name || 'Sem Nome',
        email: profile?.email || '',
        status: 'Ativo',
      });
      setResults([]);
      setConfig(null);
      setError(null);
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

  if (!affiliate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-brand animate-spin" />
        <p className="text-slate-500 font-medium">Preparando dashboard...</p>
      </div>
    );
  }

  const emptyResult = {
    registrations: 0,
    first_deposits: 0,
    qualified_cpa: 0,
    rvs: 0,
  };
  const clientRows: Array<{ name: string; firstDeposit: string; createdAt: string }> = [];
  const resultsToRender = results.length > 0 ? results : [emptyResult];

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Bem-vindo, {profile?.name || affiliate.name || affiliate.label || 'parceiro'}.
          </p>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {affiliate.name || affiliate.label || profile?.name || 'Sem Nome'}
            </h1>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                affiliate.status === 'active' || affiliate.status === 'Ativo' || affiliate.status === 1
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
              )}
            >
              {affiliate.status || 'Pendente'}
            </span>
          </div>
          <p className="text-slate-500 font-mono text-xs uppercase tracking-widest mt-1">
            ID Externo: #{affiliate.id}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8">
        <div className="space-y-8">
          {resultsToRender.map((res: any, idx: number) => {
            const calculatedCpa = (res.qualified_cpa || 0) * (config?.cpaValue || 0);
            const calculatedRev = (res.rvs || 0) * ((config?.revPercentage || 0) / 100);
            const totalCommission = calculatedCpa + calculatedRev;

            return (
              <div key={idx} className="space-y-8">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-6">
                  <div>
                    <div className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-2">
                      Comissão total <HelpCircle size={14} className="text-slate-500 dark:text-slate-300" />
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
                          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-widest mb-1">
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
                          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-widest mb-1">
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm group hover:border-brand/20 transition-all duration-500"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-400 group-hover:text-brand transition-colors">
                        <UserPlus size={20} />
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-black text-green-500 bg-green-500/10 px-2 py-1 rounded-lg">
                        <TrendingUp size={10} /> +12%
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cadastros</p>
                      <h4 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{res.registrations || 0}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Leads Qualificados</p>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm group hover:border-brand/20 transition-all duration-500"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-400 group-hover:text-brand transition-colors">
                        <Building size={20} />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                          <span className="text-[10px] font-black text-slate-500">
                            {res.registrations > 0 ? ((res.first_deposits / res.registrations) * 100).toFixed(1) : 0}% conv.
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Primeiros Depósitos</p>
                      <h4 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{res.first_deposits || 0}</h4>
                      <div className="flex items-center gap-1.5 mt-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse"></div>
                        <p className="text-[10px] font-bold text-brand uppercase tracking-widest leading-none">Contas Ativas</p>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm group hover:border-brand/20 transition-all duration-500"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-400 group-hover:text-brand transition-colors">
                        <Shield size={20} />
                      </div>
                      <div className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                        <span className="text-[10px] font-black text-slate-500">
                          {res.first_deposits > 0 ? ((res.qualified_cpa / res.first_deposits) * 100).toFixed(1) : 0}% conv.
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">CPA Qualificado</p>
                      <h4 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{res.qualified_cpa || 0}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 opacity-60">Meta Alcançada</p>
                    </div>
                  </motion.div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center gap-1 text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-8">
                      REV (R$) por Casa <HelpCircle size={14} className="text-slate-500 dark:text-slate-300" />
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded bg-red-600 flex items-center justify-center text-white font-black text-[10px]">S</div>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Superbet</span>
                          </div>
                          <span className="text-xs font-bold text-slate-400">
                            R$ {Number(res.rvs || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
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
                        CPA (R$) por Casa <HelpCircle size={14} className="text-slate-500 dark:text-slate-300" />
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
                          <span className="text-xs font-bold text-slate-400">
                            R$ {calculatedCpa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
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
            );
          })}

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl flex flex-col shadow-sm overflow-hidden mb-20">
            <div className="p-6 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-xs text-slate-800 dark:text-white uppercase tracking-widest">Lista de Clientes</h3>
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {clientRows.length} registros
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
                  {clientRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-20 text-center">
                        <div className="flex flex-col items-center gap-2 opacity-30">
                          <User size={32} />
                          <p className="text-xs font-bold uppercase tracking-widest">Lista zerada ate associar os clientes ao ID</p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
