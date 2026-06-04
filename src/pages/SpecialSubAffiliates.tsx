import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Loader2, Users, ArrowUpRight, UserPlus, Wallet, Target, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchSpecialAffiliates,
  fetchAllResults,
  fetchAffiliateConfigs,
  calcAffiliatePayout,
  SpecialAffiliate,
  AffiliateConfig,
} from '../services/affiliateService';
import DateRangePicker from '../components/DateRangePicker';
import { DateRange, getDefaultRange } from '../lib/dateRange';
import { humanizeName } from '../lib/utils';

const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Passo 3 · Lista de sub-afiliados do afiliado especial — espelha o "Afiliados" do
// master, capado à própria rede. Cada sub abre a AffiliateDetails escopada
// (/affiliates/:id) — o proxy libera o especial a ler os subs, e as rules liberam
// nome (affiliates) e config (affiliate_configs) a signed-in.
export default function SpecialSubAffiliates() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState<DateRange>(() => getDefaultRange());
  const [loading, setLoading] = useState(true);
  const [special, setSpecial] = useState<SpecialAffiliate | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [configs, setConfigs] = useState<Record<string, AffiliateConfig>>({});

  const ownId = profile?.affiliateId ? String(profile.affiliateId) : '';

  useEffect(() => {
    if (!ownId) return;
    (async () => {
      try {
        setLoading(true);
        const [specials, rows, cfgs] = await Promise.all([
          fetchSpecialAffiliates(),
          fetchAllResults(range),
          fetchAffiliateConfigs(),
        ]);
        setSpecial(specials[ownId] || null);
        setResults(Array.isArray(rows) ? rows : []);
        setConfigs(cfgs);
      } catch (e) {
        console.error('Erro ao carregar sub-afiliados:', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownId, range.startDate, range.endDate]);

  const ownConfig = useMemo<AffiliateConfig>(() => ({
    affiliateId: ownId,
    cpaValue: configs[ownId]?.cpaValue || 0,
    revPercentage: configs[ownId]?.revPercentage || 0,
  }), [ownId, configs]);

  const rowById = (id: string) => results.find((r) => String(r.affiliate_id ?? r.id ?? '') === String(id));
  const subIds = special?.subAffiliateIds?.map(String) || [];

  if (profile && !profile.isSpecial) return <Navigate to="/dashboard" replace />;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={40} className="text-amber-500 animate-spin" />
        <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest animate-pulse">Carregando seus afiliados...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Sua rede
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
            <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Users size={24} className="text-amber-500" />
            </span>
            Meus afiliados
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">{subIds.length} sub-afiliado(s) vinculado(s). Clique para ver os dados de cada um.</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </header>

      {subIds.length === 0 ? (
        <div className="p-16 text-center rounded-3xl border border-slate-200/70 dark:border-neutral-800 bg-white dark:bg-neutral-900/60">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl border border-slate-100 dark:border-neutral-700/60 bg-slate-50 dark:bg-neutral-800/60 text-slate-500 dark:text-neutral-300 mb-4">
            <Users size={24} />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100 mb-1">Nenhum sub-afiliado vinculado</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Fale com o administrador para vincular afiliados à sua rede.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subIds.map((id, idx) => {
            const r = rowById(id) || {};
            const name = humanizeName(r.affiliate_name || r.name || r.label || `#${id}`);
            // Seu ganho com este sub = spread (taxa própria − taxa do sub) sobre a produção dele.
            const spread = calcAffiliatePayout(r, ownConfig) - calcAffiliatePayout(r, configs[id]);
            const stats = [
              { label: 'Cadastros', value: (r.registrations || 0).toLocaleString('pt-BR'), icon: UserPlus },
              { label: 'Depósitos', value: (r.first_deposits || 0).toLocaleString('pt-BR'), icon: Wallet },
              { label: 'CPA Qualif.', value: (r.qualified_cpa || 0).toLocaleString('pt-BR'), icon: Target },
            ];
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => navigate(`/affiliates/${id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/affiliates/${id}`); } }}
                className="group relative overflow-hidden p-6 rounded-2xl border bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800 shadow-sm hover:border-amber-300/70 dark:hover:border-amber-800 hover:shadow-md transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{name}</p>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-neutral-500 mt-0.5 truncate">Sub #{id}</p>
                  </div>
                  <span className="shrink-0 p-2 rounded-xl border bg-slate-50 dark:bg-neutral-800/60 border-slate-100 dark:border-neutral-700/60 text-slate-400 dark:text-neutral-500 group-hover:text-amber-500 group-hover:border-amber-500/30 transition-colors">
                    <ArrowUpRight size={16} />
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {stats.map((s) => (
                    <div key={s.label}>
                      <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 dark:text-neutral-500">{s.label}</span>
                      <p className="font-bold text-base text-slate-800 dark:text-white mt-0.5 truncate">{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-4 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    <Crown size={11} /> Seu ganho
                  </span>
                  <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 tabular-nums">{brl(spread)}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
