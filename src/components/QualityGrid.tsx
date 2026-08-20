import React from 'react';
import { motion } from 'motion/react';
import { Activity, Percent, PiggyBank, UserCheck } from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import {
  buildQualityItems,
  formatQualityValue,
  hasQualityData,
  sumQualityTotals,
  type QualityItemKey,
} from '../lib/qualityKpis';

const QUALITY_ICONS: Record<QualityItemKey, React.ComponentType<{ size?: number | string }>> = {
  net_deposits: PiggyBank,
  net_pl: Activity,
  net_per_ftd: UserCheck,
  retention: Percent,
};

interface QualityGridProps {
  /** Linhas mescladas (OTG + manual) do recorte exibido — são somadas aqui. */
  rows: any[];
}

// Qualidade da produção (pedido Infinity 19/08): a régua que a CASA usa para
// decidir pagamento — depósito líquido, resultado dos jogadores (PL) e derivados.
// Dado de GESTÃO: a página que renderiza é responsável pelo gate (o mesmo
// `canViewAffiliateNetProfit` do lucro) — o afiliado não vê a própria régua.
// Sem NENHUM dado de qualidade no período o componente não renderiza nada
// (casa que não informa não ganha uma fileira de "—").
export default function QualityGrid({ rows }: QualityGridProps) {
  const totals = sumQualityTotals(rows);
  if (!hasQualityData(totals)) return null;
  const items = buildQualityItems(totals);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4">
        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Qualidade da produção</h3>
        <InfoTooltip
          text="Indicadores que a casa usa para avaliar o tráfego. Valor negativo em vermelho: os jogadores ganharam da casa no período."
          size={12}
          align="left"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {items.map((item, idx) => {
          const Icon = QUALITY_ICONS[item.key];
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
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-[0.2em]">
                  {item.label}
                  {item.hint && <InfoTooltip text={item.hint} size={10} align="left" />}
                </div>
                <h4
                  className={
                    item.negative
                      ? 'text-3xl font-black text-rose-600 dark:text-rose-400 tracking-tighter truncate'
                      : 'text-3xl font-black text-slate-900 dark:text-white tracking-tighter truncate'
                  }
                  title={formatQualityValue(item)}
                >
                  {formatQualityValue(item)}
                </h4>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
