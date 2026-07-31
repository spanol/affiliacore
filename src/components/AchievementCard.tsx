import type { ReactNode } from 'react';
import { Lock, Trophy } from 'lucide-react';
import { cn } from '../lib/utils';
import { tierProgress, tierMetaLabel, type AchievementTotals } from '../lib/achievements';

const formatBRL = (v: number) =>
  `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Forma MÍNIMA que o card sabe desenhar — o form do admin (campos ainda em
// string, sem id) também a satisfaz, e é isso que permite a prévia ao vivo.
export interface AchievementCardTier {
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
  metaCpas?: number;
  metaCommission?: number;
  active?: boolean;
}

interface Props {
  tier: AchievementCardTier;
  totals: AchievementTotals;
  // Barra de progresso + números só fazem sentido para quem TEM números: o
  // afiliado (ou a prévia, com totais sintéticos). O admin vendo o roadmap não.
  showProgress?: boolean;
  showInactiveBadge?: boolean;
  // Área de ação (solicitar prêmio / status). A página passa o botão real; a
  // prévia passa uma cópia inerte.
  footer?: ReactNode;
  className?: string;
}

// Card de premiação — fonte ÚNICA do visual, compartilhada entre o roadmap do
// afiliado (`/conquistas`) e a prévia do `AchievementManagerModal`. Se divergir,
// o admin passa a desenhar um card que o afiliado não vê. Puramente
// apresentacional: todo cálculo vem de `lib/achievements`.
export default function AchievementCard({
  tier,
  totals,
  showProgress = false,
  showInactiveBadge = false,
  footer,
  className,
}: Props) {
  const progress = tierProgress(tier, totals);
  const pct = Math.round(progress.fraction * 100);
  const inactive = tier.active === false;

  return (
    <div
      className={cn(
        'p-6 rounded-2xl border shadow-sm flex flex-col gap-4 transition-all',
        progress.unlocked
          ? 'bg-accent-500/5 border-accent-500/30'
          : 'bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800',
        inactive && 'opacity-60',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {tier.imageUrl ? (
          <img
            src={tier.imageUrl}
            alt=""
            className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-neutral-700 shrink-0"
          />
        ) : (
          <span
            className={cn(
              'w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border',
              progress.unlocked
                ? 'bg-accent-500/15 border-accent-500/30 text-accent-500'
                : 'bg-slate-50 dark:bg-neutral-800/60 border-slate-100 dark:border-neutral-700/60 text-slate-300 dark:text-neutral-600',
            )}
          >
            {progress.unlocked ? <Trophy size={22} /> : <Lock size={20} />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-900 dark:text-white truncate">{tier.title}</p>
          {tier.subtitle && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent-600 dark:text-accent-400 mt-0.5 truncate">
              {tier.subtitle}
            </p>
          )}
          <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">Meta: {tierMetaLabel(tier)}</p>
        </div>
        {inactive && showInactiveBadge && (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
            Inativa
          </span>
        )}
      </div>

      {tier.description && (
        <p className="text-[11px] text-slate-500 dark:text-neutral-400 leading-relaxed">{tier.description}</p>
      )}

      {showProgress && (
        <div className="mt-auto space-y-2">
          <div className="h-2 rounded-full bg-slate-100 dark:bg-neutral-800 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progress.unlocked ? 'bg-accent-500' : 'bg-accent-500/50',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-neutral-500">
            <span>{pct}%</span>
            <span>
              {tier.metaCommission
                ? `${formatBRL(totals.commission)} / ${formatBRL(tier.metaCommission)}`
                : `${totals.cpas} / ${tier.metaCpas} CPAs`}
            </span>
          </div>
          {footer}
        </div>
      )}
    </div>
  );
}
