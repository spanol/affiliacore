import React from 'react';
import { motion } from 'motion/react';
import {
  Building,
  DollarSign,
  Divide,
  Hash,
  MousePointerClick,
  Receipt,
  Shield,
  UserPlus,
} from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import { buildFunnelItems, formatFunnelValue, sumFunnelTotals, type FunnelItemKey } from '../lib/funnel';

const FUNNEL_ICONS: Record<FunnelItemKey, React.ComponentType<{ size?: number | string }>> = {
  visits: MousePointerClick,
  registrations: UserPlus,
  first_deposits: Building,
  deposit_count: Hash,
  deposit: DollarSign,
  avg_deposit: Divide,
  avg_ticket: Receipt,
  qualified_cpa: Shield,
};

interface FunnelGridProps {
  /** Linhas mescladas (OTG + manual) do recorte exibido — são somadas aqui. */
  rows: any[];
  /** Badge do card de Cadastros (ex.: <TrendBadge/> vs período anterior). */
  registrationsBadge?: React.ReactNode;
  /** Sublabel do card de Cadastros (ex.: "Clientes cadastrados na rede"). */
  registrationsSubtitle?: string;
}

// Funil de conversão na ORDEM do painel da Esportiva (call Infinity 12/08):
// cliques → cadastros → FTD → qtd de depósitos → valor depositado → média de
// depósito → ticket médio → CPA qualificado. A ordem/derivados vêm de
// `lib/funnel` (puro); aqui é só card. Métrica que a fonte não informa (clique
// na OTG, qtd em upload antigo) aparece como "—" — nunca um 0 enganoso.
export default function FunnelGrid({ rows, registrationsBadge, registrationsSubtitle }: FunnelGridProps) {
  const totals = sumFunnelTotals(rows);
  const items = buildFunnelItems(totals);

  // Conversões de etapa (mesmos % que os cards antigos mostravam).
  const convBadge = (num: number, den: number) => (
    <div className="bg-slate-100 dark:bg-neutral-800 px-2 py-1 rounded-lg">
      <span className="text-[10px] font-black text-slate-500 dark:text-neutral-400">
        {den > 0 ? ((num / den) * 100).toFixed(1) : 0}% conv.
      </span>
    </div>
  );

  const badgeFor = (key: FunnelItemKey): React.ReactNode => {
    if (key === 'registrations') return registrationsBadge ?? null;
    if (key === 'first_deposits') return convBadge(totals.first_deposits, totals.registrations);
    if (key === 'qualified_cpa') return convBadge(totals.qualified_cpa, totals.first_deposits);
    return null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {items.map((item, idx) => {
        const Icon = FUNNEL_ICONS[item.key];
        return (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="bg-white dark:bg-neutral-900 p-6 rounded-[2rem] border border-slate-100 dark:border-neutral-800 shadow-sm group hover:border-brand/20 dark:hover:border-white/10 transition-all duration-500"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-slate-50 dark:bg-neutral-800 rounded-2xl text-slate-400 group-hover:text-brand dark:group-hover:text-white transition-colors">
                <Icon size={20} />
              </div>
              {badgeFor(item.key)}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-[0.2em]">
                {item.label}
                {item.hint && <InfoTooltip text={item.hint} size={10} align="left" />}
              </div>
              <h4 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter truncate" title={formatFunnelValue(item)}>
                {formatFunnelValue(item)}
              </h4>
              {item.key === 'registrations' && registrationsSubtitle && (
                <p className="text-[10px] font-bold text-slate-400 dark:text-neutral-400 uppercase tracking-widest mt-2">{registrationsSubtitle}</p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
