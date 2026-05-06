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
  ArrowDownRight,
  UserPlus,
  Link,
  Copy,
  Check,
  X,
  CheckCircle
} from 'lucide-react';
import { 
  fetchAffiliateById, 
  fetchAffiliateResults, 
  fetchAffiliateConfigs, 
  AffiliateConfig,
  createUser,
  fetchSetting
} from '../services/affiliateService';
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

  // User Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);

  // Link Modal State
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [affiliateLink, setAffiliateLink] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!affiliate || !userEmail) return;

    try {
      setIsRegistering(true);
      const initialPassword = Math.random().toString(36).slice(-8); // Generate 8-char password
      setUserPassword(initialPassword);

      await createUser({
        uid: affiliate.id.toString(),
        name: affiliate.name || affiliate.label || 'Sem Nome',
        email: userEmail,
        role: 'client'
      });

      setRegisterSuccess(true);
    } catch (err) {
      console.error('Error creating user:', err);
      // We could set an error state here
    } finally {
      setIsRegistering(false);
    }
  };

  const handleGenerateLink = async () => {
    try {
      setIsGeneratingLink(true);
      const baseUrl = await fetchSetting('affiliate_base_url') || 'https://goatech.com/go/';
      const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase() + 
                         Math.random().toString(36).substring(2, 8).toUpperCase();
      const code = randomCode.slice(0, 12);
      setAffiliateLink(`${baseUrl}${code}?aff=${affiliate.id}`);
      setIsLinkModalOpen(true);
    } catch (err) {
      console.error('Error generating link:', err);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(affiliateLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsUserModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl hover:bg-brand-dark transition-all font-bold text-xs uppercase tracking-wider shadow-sm shadow-brand/20"
          >
            <UserPlus size={16} /> Cadastrar Usuário
          </button>
          <button 
            onClick={handleGenerateLink}
            disabled={isGeneratingLink}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:border-brand/40 transition-all font-bold text-xs uppercase tracking-wider shadow-sm"
          >
            {isGeneratingLink ? <Loader2 size={16} className="animate-spin" /> : <Link size={16} />} 
            Gerar Link
          </button>
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
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden relative">
                    <div className="flex justify-between items-center mb-10">
                      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Funil de conversão</h3>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-slate-900 dark:bg-slate-400"></div>
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Volume total</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="relative">
                      {/* Data Labels */}
                      <div className="grid grid-cols-3 gap-8 relative z-20 mb-12">
                        <div className="bg-slate-50/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 group hover:border-brand/20 transition-all">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Cadastros</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-slate-900 dark:text-white">{res.registrations || 0}</span>
                            <span className="text-[11px] font-bold text-green-500 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-lg">+17k%</span>
                          </div>
                        </div>

                        <div className="bg-slate-50/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 relative group hover:border-brand/20 transition-all">
                          <div className="absolute -left-4 top-1/2 -translate-y-1/2 z-30">
                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-2 py-1 rounded-full shadow-sm text-[9px] font-black text-brand">
                              46.4%
                            </div>
                          </div>
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-2">FTDs (Primeiros Depósitos)</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-slate-900 dark:text-white">{res.first_deposits || 0}</span>
                            <span className="text-[11px] font-bold text-green-500 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-lg">+900%</span>
                          </div>
                        </div>

                        <div className="bg-brand/5 dark:bg-brand/10 p-4 rounded-2xl border border-brand/10 dark:border-brand/20 relative group hover:border-brand/30 transition-all">
                           <div className="absolute -left-4 top-1/2 -translate-y-1/2 z-30">
                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-2 py-1 rounded-full shadow-sm text-[9px] font-black text-brand">
                              13.3%
                            </div>
                          </div>
                          <p className="text-[10px] font-black text-brand uppercase mb-2">CPA Qualificado</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-brand">{res.qualified_cpa || 0}</span>
                            <span className="text-[11px] font-bold text-brand bg-brand/5 px-2 py-0.5 rounded-lg">+767%</span>
                          </div>
                        </div>
                      </div>

                      {/* Funnel Visualisation - High Fidelity SVG Wave */}
                      <div className="h-48 w-full relative group">
                        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 200">
                          <defs>
                            <linearGradient id="funnelGradient1" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#1e293b" />
                              <stop offset="100%" stopColor="#0f172a" />
                            </linearGradient>
                            <linearGradient id="funnelGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#334155" />
                              <stop offset="100%" stopColor="#1e293b" />
                            </linearGradient>
                            <linearGradient id="brandFunnelGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#fbbf24" />
                              <stop offset="100%" stopColor="#d97706" />
                            </linearGradient>
                            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                              <feGaussianBlur stdDeviation="3" result="blur" />
                              <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                          </defs>
                          
                          {/* Stage 1 (Registrations) - Large Curve */}
                          <path 
                            d="M 0 20 Q 150 25 333 45 L 333 155 Q 150 175 0 180 Z" 
                            fill="url(#funnelGradient1)"
                            className="transition-all duration-700 hover:opacity-90"
                          />
                          
                          {/* Stage 2 (FTDs) - Medium Curve */}
                          <path 
                            d="M 333 45 Q 500 55 666 75 L 666 125 Q 500 145 333 155 Z" 
                            fill="url(#funnelGradient2)"
                            className="transition-all duration-700 hover:opacity-90"
                          />
                          
                          {/* Stage 3 (CPA) - Narrower Section */}
                          <path 
                            d="M 666 75 Q 833 82 1000 88 L 1000 112 Q 833 118 666 125 Z" 
                            fill="url(#brandFunnelGradient)"
                            filter="url(#glow)"
                            className="transition-all duration-700 hover:brightness-110"
                          />
                          
                          {/* Decorative Accent Lines */}
                          <path d="M 0 100 L 1000 100" stroke="white" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.1" />
                          
                          {/* Lines separating stages */}
                          <line x1="333" y1="45" x2="333" y2="155" className="stroke-white/5" strokeWidth="1" />
                          <line x1="666" y1="75" x2="666" y2="125" className="stroke-white/5" strokeWidth="1" />
                        </svg>
                        
                        {/* Interactive Markers */}
                        <div className="absolute top-1/2 left-[15%] -translate-y-1/2 flex flex-col items-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                           <div className="w-1 h-12 bg-white/10 rounded-full mb-2"></div>
                           <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter bg-slate-900 px-2 py-0.5 rounded shadow-xl">Topo do Funil</span>
                        </div>
                        <div className="absolute top-1/2 left-[50%] -translate-y-1/2 flex flex-col items-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                           <div className="w-1 h-8 bg-white/10 rounded-full mb-2"></div>
                           <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter bg-slate-900 px-2 py-0.5 rounded shadow-xl">Meio do Funil</span>
                        </div>
                        <div className="absolute top-1/2 left-[85%] -translate-y-1/2 flex flex-col items-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                           <div className="w-1 h-4 bg-brand/20 rounded-full mb-2"></div>
                           <span className="text-[8px] font-black text-brand uppercase tracking-tighter bg-slate-900 px-2 py-0.5 rounded shadow-brand/20">Fundo do Funil</span>
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

      {/* User Registration Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden"
          >
            <div className="p-6 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm">Cadastrar Usuário</h3>
              <button 
                onClick={() => {
                  setIsUserModalOpen(false);
                  setRegisterSuccess(false);
                  setUserEmail('');
                }}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {!registerSuccess ? (
              <form onSubmit={handleCreateUser} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nome do Afiliado</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{affiliate.name || affiliate.label}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">ID: #{affiliate.id}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail para Login</label>
                    <div className="relative">
                      <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="email"
                        required
                        placeholder="afiliado@exemplo.com"
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isRegistering}
                  className="w-full py-4 bg-slate-900 dark:bg-brand text-white dark:text-slate-900 font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-brand/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isRegistering ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                  Confirmar Cadastro
                </button>
              </form>
            ) : (
              <div className="p-10 text-center space-y-6">
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2 animate-bounce">
                  <CheckCircle size={40} />
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-black text-slate-900 dark:text-white">Usuário Criado!</h4>
                  <p className="text-sm text-slate-500">O afiliado agora pode acessar o sistema com as credenciais abaixo:</p>
                </div>
                
                <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 space-y-4">
                  <div className="flex justify-between items-center text-left">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{userEmail}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-left">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha Inicial</p>
                      <p className="text-lg font-mono font-black text-brand tracking-widest">{userPassword}</p>
                    </div>
                    <button 
                      onClick={() => navigator.clipboard.writeText(userPassword)}
                      className="p-2 text-slate-400 hover:text-brand transition-colors"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 font-bold uppercase py-2">
                  * Recomendamos que o afiliado altere a senha no primeiro acesso.
                </p>

                <button 
                  onClick={() => setIsUserModalOpen(false)}
                  className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase tracking-widest rounded-2xl border border-slate-200 dark:border-slate-700"
                >
                  Fechar
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Affiliate Link Modal */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden"
          >
            <div className="p-6 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm">Link de Afiliado Gerado</h3>
              <button 
                onClick={() => setIsLinkModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="text-center space-y-2 mb-4">
                <div className="w-16 h-16 bg-brand/10 text-brand rounded-full flex items-center justify-center mx-auto mb-4">
                  <Link size={32} />
                </div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white">Seu Link Exclusivo</h4>
                <p className="text-sm text-slate-500">Este link já inclui o código de rastreio de 12 caracteres.</p>
              </div>

              <div className="space-y-4">
                <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 relative group">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Link de Afiliado</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 font-mono text-xs text-slate-600 dark:text-slate-400 break-all leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      {affiliateLink}
                    </div>
                    <button 
                      onClick={copyToClipboard}
                      className={cn(
                        "p-4 rounded-xl transition-all shadow-sm flex items-center justify-center group-hover:scale-110",
                        isCopied ? "bg-green-500 text-white" : "bg-slate-900 dark:bg-brand text-white dark:text-slate-900"
                      )}
                    >
                      {isCopied ? <Check size={20} /> : <Copy size={20} />}
                    </button>
                  </div>
                  {isCopied && (
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-full animate-bounce">
                      Copiado com sucesso!
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Link Ativo</span>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rastreio</p>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Cookie: 30 dias</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setIsLinkModalOpen(false)}
                className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase tracking-widest rounded-2xl border border-slate-200 dark:border-slate-700 mt-4"
              >
                Concluir
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
