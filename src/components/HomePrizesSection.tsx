import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Crown, Medal, MoveRight, Trophy } from 'lucide-react';
import { cn } from '../lib/utils';
import { activePrizes, positionLabel, sortPrizes } from '../lib/prizes';
import { Prize, subscribeToPrizes } from '../services/prizeService';

// Ouro/prata/bronze do pódio são cores FIXAS (amber = ouro do pódio, mesma
// convenção do /ranking) — não seguem o accent da marca. Ganharam par claro
// quando a LP virou theme-aware: os tons do escuro (amber-400, slate-300) somem
// sobre fundo claro, então no claro cada metal desce um ou dois degraus.
const PODIUM_STYLES = [
  {
    icon: Crown,
    text: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-500/40 dark:ring-amber-400/50',
    bg: 'bg-amber-400/10',
  },
  {
    icon: Medal,
    text: 'text-slate-500 dark:text-slate-300',
    ring: 'ring-slate-400/50 dark:ring-slate-300/40',
    bg: 'bg-slate-400/15 dark:bg-slate-300/10',
  },
  {
    icon: Medal,
    text: 'text-orange-600 dark:text-orange-400',
    ring: 'ring-orange-500/40 dark:ring-orange-400/40',
    bg: 'bg-orange-400/10',
  },
];

// Seção pública de premiações do ranking (chamariz de captação). Só renderiza
// quando a instância tem prêmio ATIVO cadastrado — sem premiação a Home fica
// idêntica ao que era. Leitura DESLOGADA (regra pública em ranking_prizes);
// erro de leitura (ex.: rules antigas) → a seção simplesmente não aparece.
export default function HomePrizesSection() {
  const [prizes, setPrizes] = useState<Prize[]>([]);

  useEffect(() => subscribeToPrizes(setPrizes, () => setPrizes([])), []);

  const active = sortPrizes(activePrizes(prizes));
  if (active.length === 0) return null;

  const podium = active.slice(0, 3);
  const rest = active.slice(3);

  return (
    <section id="premiacoes" className="max-w-7xl mx-auto px-6 py-24 border-b border-slate-200 dark:border-neutral-800/50">
      <div className="text-center mb-14">
        <span className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full bg-amber-400/10 border border-amber-500/30 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 text-[11px] font-bold uppercase tracking-widest">
          <Trophy size={13} />
          Ranking premiado
        </span>
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
          Performance que <span className="text-slate-400 dark:text-neutral-500">vira prêmio</span>
        </h2>
        <p className="text-slate-600 dark:text-neutral-400 text-lg max-w-2xl mx-auto">
          Os melhores do ranking levam prêmios de verdade. Entre para a rede, gere resultado e
          dispute o pódio.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {podium.map((prize, i) => {
          const style = PODIUM_STYLES[Math.min(i, PODIUM_STYLES.length - 1)];
          const Icon = style.icon;
          return (
            <motion.div
              key={prize.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={cn(
                'p-8 rounded-3xl bg-white dark:bg-neutral-900/60 border border-slate-200 dark:border-neutral-800 ring-1 flex flex-col items-center text-center',
                style.ring,
              )}
            >
              <span className={cn('inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4', style.bg, style.text)}>
                <Icon size={24} />
              </span>
              <span className={cn('text-[11px] font-black uppercase tracking-widest mb-2', style.text)}>
                {positionLabel(prize.position)}
              </span>
              <p className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{prize.title}</p>
              {prize.description && (
                <p className="text-sm text-slate-600 dark:text-neutral-400 mt-2">{prize.description}</p>
              )}
            </motion.div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8 max-w-4xl mx-auto">
          {rest.map((prize) => (
            <span
              key={prize.id}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-neutral-900/60 border border-slate-200 dark:border-neutral-800 text-sm"
            >
              <span className="font-black text-slate-400 dark:text-neutral-500">{prize.position}º</span>
              <span className="font-semibold text-slate-700 dark:text-neutral-200">{prize.title}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-12 flex justify-center">
        <Link
          to="/register"
          className="px-8 py-4 rounded-full bg-auth-cta text-auth-cta-text hover:bg-auth-cta-hover dark:bg-lp-cta dark:text-lp-cta-text dark:hover:bg-lp-cta-hover font-semibold transition-colors flex items-center justify-center gap-2 shadow-xl shadow-auth-cta/20 dark:shadow-lp-cta/10 group"
        >
          Quero disputar o pódio
          <MoveRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </section>
  );
}
