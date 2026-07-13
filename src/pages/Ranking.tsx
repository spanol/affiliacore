import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Trophy, Crown, Loader2, RefreshCw, Medal, Gift } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { cn, humanizeName } from '../lib/utils';
import { formatRangeLabel, resolveRankingDate } from '../lib/dateRange';
import { activePrizes, positionLabel, prizeForPosition } from '../lib/prizes';
import {
  DailyRanking,
  RankingEntry,
  subscribeToDailyRanking,
  computeDailyRanking,
  yesterdayISO,
} from '../services/rankingService';
import { Prize, subscribeToPrizes } from '../services/prizeService';
import PrizeManagerModal from '../components/PrizeManagerModal';

const formatBRL = (v: number) =>
  `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PODIUM = [
  { ring: 'ring-amber-400', bg: 'bg-amber-500/10', text: 'text-amber-500', icon: Crown },
  { ring: 'ring-slate-300', bg: 'bg-slate-400/10', text: 'text-slate-400', icon: Medal },
  { ring: 'ring-orange-400', bg: 'bg-orange-500/10', text: 'text-orange-500', icon: Medal },
];

export default function Ranking() {
  const { profile } = useAuth();
  const { push } = useToast();
  const isAdmin = profile?.role === 'admin';
  // Dia exibido: ONTEM (último dia FECHADO) por padrão — a OTG só finaliza os resultados
  // de um dia no dia seguinte. Admin inspeciona/recalcula outro (inclusive hoje) via
  // ?date=YYYY-MM-DD.
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const displayDate = resolveRankingDate(dateParam, yesterdayISO());

  const [ranking, setRanking] = useState<DailyRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  // Premiações por posição (chamariz): pills no pódio/lista + gestão do admin.
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [showPrizeManager, setShowPrizeManager] = useState(false);

  useEffect(() => subscribeToPrizes(setPrizes, () => setPrizes([])), []);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToDailyRanking(
      displayDate,
      (data) => {
        setRanking(data);
        setLoading(false);
      },
      (err) => {
        console.error('Erro ao carregar ranking:', err);
        setError('Não foi possível carregar o ranking no momento.');
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [displayDate]);

  const handleCompute = async () => {
    setComputing(true);
    try {
      const { count } = await computeDailyRanking(displayDate);
      push({ type: 'success', message: `Ranking atualizado (${count} afiliado${count === 1 ? '' : 's'}).` });
    } catch (err) {
      push({ type: 'error', message: err instanceof Error ? err.message : 'Falha ao calcular o ranking.' });
    } finally {
      setComputing(false);
    }
  };

  const entries = ranking?.entries ?? [];
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  // Posição do próprio afiliado (se estiver no ranking).
  const myEntry = useMemo(
    () => (profile?.affiliateId ? entries.find((e) => e.affiliateId === String(profile.affiliateId)) : undefined),
    [entries, profile?.affiliateId],
  );

  const generatedLabel = ranking?.generatedAt
    ? new Date(ranking.generatedAt.toDate()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
            Gamificação · {formatRangeLabel({ startDate: displayDate, endDate: displayDate })}
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
            <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
              <Trophy size={24} className="text-accent-500" />
            </span>
            Ranking diário
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">
            Os maiores geradores de comissão do dia.{generatedLabel ? ` Atualizado às ${generatedLabel}.` : ''}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 self-start shrink-0">
            <button
              onClick={() => setShowPrizeManager(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-200 rounded-full text-xs font-bold hover:border-slate-300 dark:hover:border-neutral-600 transition-all shadow-sm"
            >
              <Gift size={14} />
              Premiações
            </button>
            <button
              onClick={handleCompute}
              disabled={computing}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
            >
              {computing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {ranking ? 'Atualizar ranking' : 'Gerar ranking do dia'}
            </button>
          </div>
        )}
      </header>

      {/* Faixa com a posição do próprio afiliado */}
      {myEntry && (
        <div className="rounded-2xl border border-accent-500/30 bg-accent-500/10 px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-500 text-accent-contrast font-black text-sm shadow">#{myEntry.pos}</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-accent-600 dark:text-accent-400">Sua posição no dia</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{humanizeName(myEntry.name)}</p>
            </div>
          </div>
          <span className="text-base font-black text-slate-900 dark:text-white">{formatBRL(myEntry.commission)}</span>
        </div>
      )}

      {loading ? (
        <div className="p-24 flex flex-col items-center justify-center gap-4">
          <Loader2 size={40} className="text-accent-500 animate-spin" />
          <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest animate-pulse">Carregando...</p>
        </div>
      ) : error ? (
        <div className="py-20 text-center text-red-500">{error}</div>
      ) : !ranking || entries.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm p-20 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl border border-slate-100 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-accent-500 mb-4">
            <Trophy size={24} />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100 mb-1">
            {ranking ? 'Sem comissão registrada neste dia' : 'Ranking ainda não calculado para este dia'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            {ranking
              ? 'Nenhum afiliado gerou comissão neste dia.'
              : isAdmin
                ? 'Clique em "Gerar ranking do dia" para calcular a partir dos resultados.'
                : 'Aguarde o ciclo de atualização — a plataforma calcula a partir dos resultados do dia.'}
          </p>
          {/* Prêmios em jogo: mesmo sem ranking calculado, o chamariz aparece. */}
          {activePrizes(prizes).length > 0 && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <span className="w-full text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-1">
                Prêmios em jogo
              </span>
              {activePrizes(prizes).map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[11px] font-bold"
                >
                  <Gift size={12} />
                  {positionLabel(p.position)} · {p.title}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Pódio Top 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {podium.map((entry, i) => {
              const style = PODIUM[i];
              const Icon = style.icon;
              const prize = prizeForPosition(prizes, entry.pos);
              const isMe = profile?.affiliateId && entry.affiliateId === String(profile.affiliateId);
              return (
                <motion.div
                  key={entry.affiliateId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={cn(
                    'relative p-6 rounded-3xl border bg-white dark:bg-neutral-900/60 shadow-sm flex flex-col items-center text-center ring-1',
                    style.ring,
                    isMe ? 'border-accent-500/50' : 'border-slate-200/70 dark:border-neutral-800',
                  )}
                >
                  <span className={cn('inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3', style.bg, style.text)}>
                    <Icon size={24} />
                  </span>
                  <span className={cn('text-[11px] font-black uppercase tracking-widest mb-1', style.text)}>{entry.pos}º lugar</span>
                  <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{humanizeName(entry.name)}</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white mt-2">{formatBRL(entry.commission)}</p>
                  {prize && (
                    <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[11px] font-bold">
                      <Gift size={12} />
                      {prize.title}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Restante da lista */}
          {rest.length > 0 && (
            <div className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-neutral-800">
              {rest.map((entry: RankingEntry) => {
                const isMe = profile?.affiliateId && entry.affiliateId === String(profile.affiliateId);
                const prize = prizeForPosition(prizes, entry.pos);
                return (
                  <div
                    key={entry.affiliateId}
                    className={cn(
                      'flex items-center gap-4 px-5 py-3.5 transition-colors',
                      isMe ? 'bg-accent-500/10' : 'hover:bg-slate-50/70 dark:hover:bg-white/[0.03]',
                    )}
                  >
                    <span className="w-8 text-center text-sm font-black text-slate-400 dark:text-neutral-500">{entry.pos}</span>
                    <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 dark:text-neutral-100 truncate">
                      {humanizeName(entry.name)}
                      {isMe && <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-accent-600 dark:text-accent-400">você</span>}
                    </span>
                    {prize && (
                      <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold shrink-0">
                        <Gift size={11} />
                        {prize.title}
                      </span>
                    )}
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{formatBRL(entry.commission)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showPrizeManager && (
        <PrizeManagerModal prizes={prizes} onClose={() => setShowPrizeManager(false)} />
      )}
    </div>
  );
}
