import React from 'react';
import { Store } from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import BrandLogo from './BrandLogo';
import type { HouseSplitRow } from '../lib/specialCommissionSplit';

interface NetworkHouseBreakdownProps {
  rows: HouseSplitRow[];
}

const brl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Detalhamento POR CASA do painel do gerente, com a produção dele separada da
// produção da rede (call com o Jotta, 27/08/2026). Substituiu o BrandBreakdown
// nesta tela: lá a barra por casa era a rede inteira à taxa do gerente, um número
// certo com rótulo que não dizia de quem era. As linhas vêm prontas de
// `splitSpecialCommissionByHouse` — a MESMA função dos cards de resumo, para o
// detalhamento não poder divergir do topo da página.
export default function NetworkHouseBreakdown({ rows }: NetworkHouseBreakdownProps) {
  const max = Math.max(1, ...rows.map((r) => r.split.total.total));

  return (
    <div className="bg-white dark:bg-neutral-900 p-8 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-sm">
      <div className="flex items-center gap-2 mb-8">
        <div className="p-2 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-300">
          <Store size={16} />
        </div>
        <div className="flex items-center gap-1 text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">
          Comissão por casa
          <InfoTooltip
            text="Quanto cada casa gerou no período, à sua taxa. A parte própria é a sua produção; a da rede é a dos seus afiliados, e dela ainda sai o repasse a eles."
            align="left"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs font-bold text-slate-400 dark:text-neutral-400 uppercase tracking-widest py-6 text-center opacity-50">
          Sem produção no período
        </p>
      ) : (
        <div className="space-y-7">
          {rows.map(({ key, name, split }) => {
            const total = split.total.total;
            const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
            const largura = Math.max(2, Math.round((total / max) * 100));
            return (
              <div key={key} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <BrandLogo name={name} brandId={key} size={24} />
                    <span className="text-xs font-bold text-slate-700 dark:text-neutral-300 truncate">{name}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-neutral-200 shrink-0">{brl(total)}</span>
                </div>

                {/* Barra em duas partes: o tamanho compara as casas entre si, a
                    divisão interna mostra quanto daquela casa é produção própria. */}
                <div className="h-6 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${largura}%` }}>
                    <div className="h-full bg-brand dark:bg-neutral-500" style={{ width: `${pct(split.propria.total)}%` }} />
                    <div className="h-full bg-brand/40 dark:bg-neutral-700" style={{ width: `${pct(split.rede.total)}%` }} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] font-bold">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand dark:bg-neutral-500" />
                    Própria {brl(split.propria.total)}
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand/40 dark:bg-neutral-700" />
                    Rede {brl(split.rede.total)}
                  </span>
                  <span className="text-slate-400 dark:text-neutral-500">
                    CPA próprio {brl(split.propria.cpa)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
