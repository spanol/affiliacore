import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Award, Loader2, Lock, Check, Gift, Target, Trophy, Settings2, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { cn, humanizeName } from '../lib/utils';
import {
  activeTiers,
  sortTiers,
  tierProgress,
  tierMetaLabel,
  nextTier,
  canRequestTier,
  requestForTier,
  totalsFromBrandRows,
  resolveAchievementScope,
  type AchievementTotals,
} from '../lib/achievements';
import {
  AchievementTierDoc,
  AchievementRequestDoc,
  subscribeToAchievementTiers,
  fetchAchievementRequests,
  requestAchievement,
  decideAchievementRequest,
} from '../services/achievementService';
import {
  fetchAffiliateResultsByBrand,
  fetchAllResultsByBrand,
  fetchAffiliateConfigs,
  type AffiliateConfig,
} from '../services/affiliateService';
import AchievementManagerModal from '../components/AchievementManagerModal';
import AchievementCard from '../components/AchievementCard';

const formatBRL = (v: number) =>
  `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// As conquistas são ACUMULADAS (não do mês): o range vai do início da operação
// até hoje. Os presets de `dateRange` não têm "tudo" — aqui é intencional.
const ALL_TIME_START = '2020-01-01';
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Achievements() {
  const { profile } = useAuth();
  const { push } = useToast();
  const isAdmin = profile?.role === 'admin';
  const affiliateId = profile?.affiliateId ? String(profile.affiliateId) : '';
  const scope = resolveAchievementScope(profile?.role, affiliateId);
  // Especial ativo: os totais abaixo somam a rede dele. Precisa estar ESCRITO na
  // tela, senão o número não bate com o "meu desempenho" e parece erro.
  const countsNetwork = scope === 'scoped' && !!profile?.isSpecial;

  const [tiers, setTiers] = useState<AchievementTierDoc[]>([]);
  const [requests, setRequests] = useState<AchievementRequestDoc[]>([]);
  const [totals, setTotals] = useState<AchievementTotals>({ cpas: 0, commission: 0 });
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [showManager, setShowManager] = useState(false);

  useEffect(() => subscribeToAchievementTiers(setTiers, () => setTiers([])), []);

  const loadRequests = () => {
    fetchAchievementRequests().then(setRequests).catch(() => setRequests([]));
  };

  useEffect(() => {
    loadRequests();
  }, []);

  // Números que valem para a placa: breakdown POR CASA (já funde OTG + casas
  // manuais) e o repasse somado casa a casa, respeitando a taxa byBrand.
  // No modo 'scoped' NÃO passamos affiliateId: o servidor escopa sozinho e é isso
  // que faz a rede entrar para o especial (own + subs, à taxa própria dele).
  useEffect(() => {
    if (!affiliateId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const range = { startDate: ALL_TIME_START, endDate: todayISO() };
    Promise.all([
      scope === 'scoped'
        ? fetchAllResultsByBrand(range)
        : fetchAffiliateResultsByBrand(affiliateId, range),
      fetchAffiliateConfigs(),
    ])
      .then(([brandRows, configs]: [any[], Record<string, AffiliateConfig>]) => {
        if (cancelled) return;
        setTotals(totalsFromBrandRows(brandRows, configs?.[affiliateId]));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [affiliateId, scope]);

  const visibleTiers = useMemo(() => sortTiers(isAdmin ? tiers : activeTiers(tiers)), [tiers, isAdmin]);
  const myRequests = useMemo(
    () => (affiliateId ? requests.filter((r) => r.affiliateId === affiliateId) : []),
    [requests, affiliateId],
  );
  const pendingRequests = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests]);

  const unlockedCount = useMemo(
    () => activeTiers(tiers).filter((t) => tierProgress(t, totals).unlocked).length,
    [tiers, totals],
  );
  const upcoming = useMemo(() => nextTier(tiers, totals), [tiers, totals]);

  const handleRequest = async (tier: AchievementTierDoc) => {
    setRequesting(tier.id);
    try {
      await requestAchievement(tier.id, totals);
      push({ type: 'success', message: 'Prêmio solicitado! A gerência vai avaliar.' });
      loadRequests();
    } catch (err) {
      push({ type: 'error', message: err instanceof Error ? err.message : 'Falha ao solicitar o prêmio.' });
    } finally {
      setRequesting(null);
    }
  };

  const handleDecide = async (id: string, status: 'approved' | 'rejected') => {
    setDeciding(id);
    try {
      await decideAchievementRequest(id, status);
      push({ type: 'success', message: status === 'approved' ? 'Solicitação aprovada.' : 'Solicitação recusada.' });
      loadRequests();
    } catch (err) {
      push({ type: 'error', message: err instanceof Error ? err.message : 'Falha ao decidir.' });
    } finally {
      setDeciding(null);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
            Gamificação · acumulado
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
            <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
              <Award size={24} className="text-accent-500" />
            </span>
            Conquistas
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">
            {isAdmin
              ? 'Prêmios que o afiliado desbloqueia ao bater metas de faturamento — e a fila de solicitações.'
              : countsNetwork
                ? 'Seja reconhecido pelo seu trabalho: bata a meta, desbloqueie o prêmio e solicite. O faturamento conta você e a sua rede.'
                : 'Seja reconhecido pelo seu trabalho: bata a meta, desbloqueie o prêmio e solicite.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowManager(true)}
            className="flex items-center gap-2 self-start shrink-0 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:opacity-90 transition-all shadow-sm"
          >
            <Settings2 size={14} />
            Gerenciar conquistas
          </button>
        )}
      </motion.header>

      {/* Painel do afiliado: os três números do topo (molde do legado) */}
      {affiliateId && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <div className="p-6 rounded-2xl border bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest mb-2">
              <Target size={13} /> CPAs acumulados{countsNetwork ? ' · você + rede' : ''}
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {loading ? '—' : totals.cpas.toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="p-6 rounded-2xl border bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest mb-2">
              <Gift size={13} /> Próximo prêmio
            </div>
            <p className="text-sm font-black text-slate-900 dark:text-white truncate">
              {loading
                ? '—'
                : upcoming
                  ? upcoming.title
                  : activeTiers(tiers).length === 0
                    ? 'Nenhum prêmio ativo'
                    : 'Tudo conquistado!'}
            </p>
            {upcoming && (
              <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">Meta: {tierMetaLabel(upcoming)}</p>
            )}
          </div>
          <div className="p-6 rounded-2xl border bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest mb-2">
              <Trophy size={13} /> Conquistas atingidas
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {loading ? '—' : `${unlockedCount}/${activeTiers(tiers).length}`}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
              {countsNetwork ? 'Faturamento (você + rede): ' : 'Comissão acumulada: '}
              {loading ? '—' : formatBRL(totals.commission)}
            </p>
          </div>
        </motion.div>
      )}

      {/* Fila de solicitações (admin) */}
      {isAdmin && (
        <section className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-neutral-800 flex items-center gap-3">
            <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
              <Clock size={16} className="text-slate-900 dark:text-neutral-100" />
            </span>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white tracking-tight">
              Solicitações pendentes
              {pendingRequests.length > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-accent-500/10 text-accent-600 dark:text-accent-400 text-[10px] font-black">
                  {pendingRequests.length}
                </span>
              )}
            </h3>
          </div>
          {pendingRequests.length === 0 ? (
            <p className="px-6 py-8 text-center text-xs text-slate-400 dark:text-neutral-500">
              Nenhuma solicitação aguardando decisão.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-neutral-800">
              {pendingRequests.map((req) => (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-neutral-100 truncate">
                      {humanizeName(req.affiliateName || req.affiliateId)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-neutral-400 truncate">
                      {req.tierTitle || req.tierId}
                      {req.snapshot
                        ? ` · declarou ${req.snapshot.cpas} CPAs e ${formatBRL(req.snapshot.commission)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleDecide(req.id, 'rejected')}
                      disabled={deciding === req.id}
                      className="px-4 py-2 rounded-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-200 hover:border-red-300 hover:text-red-500 transition-all disabled:opacity-50"
                    >
                      Recusar
                    </button>
                    <button
                      onClick={() => handleDecide(req.id, 'approved')}
                      disabled={deciding === req.id}
                      className="px-5 py-2 rounded-full bg-accent-500 text-accent-contrast text-xs font-bold hover:bg-accent-400 transition-all shadow-sm shadow-accent-500/20 disabled:opacity-50 flex items-center gap-2"
                    >
                      {deciding === req.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Aprovar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Roadmap de conquistas */}
      {visibleTiers.length === 0 ? (
        <div className="p-16 rounded-3xl border border-dashed border-slate-200 dark:border-neutral-800 text-center">
          <Award size={40} className="mx-auto text-slate-300 dark:text-neutral-700 mb-4" />
          <p className="text-sm font-bold text-slate-500 dark:text-neutral-400">
            {isAdmin ? 'Nenhuma conquista cadastrada ainda.' : 'As premiações desta instância ainda estão sendo definidas.'}
          </p>
          {isAdmin && (
            <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">
              Use "Gerenciar conquistas" para criar a primeira.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTiers.map((tier, idx) => {
            const existing = requestForTier(myRequests, tier.id);
            const canRequest = !!affiliateId && canRequestTier(tier, totals, myRequests);

            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                className="flex"
              >
                <AchievementCard
                  tier={tier}
                  totals={totals}
                  showProgress={!!affiliateId}
                  showInactiveBadge={isAdmin}
                  className="flex-1"
                  footer={
                    existing ? (
                      <span
                        className={cn(
                          'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold',
                          existing.status === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400',
                        )}
                      >
                        {existing.status === 'approved' ? <Check size={14} /> : <Clock size={14} />}
                        {existing.status === 'approved' ? 'Prêmio aprovado' : 'Solicitação em análise'}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRequest(tier)}
                        disabled={!canRequest || requesting === tier.id}
                        className={cn(
                          'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all',
                          canRequest
                            ? 'bg-accent-500 text-accent-contrast hover:bg-accent-400 shadow-sm shadow-accent-500/20'
                            : 'bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 cursor-not-allowed',
                        )}
                      >
                        {requesting === tier.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : canRequest ? (
                          <Gift size={14} />
                        ) : (
                          <Lock size={13} />
                        )}
                        {canRequest ? 'Solicitar prêmio' : 'Bloqueado'}
                      </button>
                    )
                  }
                />
              </motion.div>
            );
          })}
        </div>
      )}

      {showManager && <AchievementManagerModal tiers={tiers} onClose={() => setShowManager(false)} />}
    </div>
  );
}
