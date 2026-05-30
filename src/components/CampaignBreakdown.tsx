import React from 'react';
import { Megaphone, HelpCircle } from 'lucide-react';

export interface CampaignDisplayRow {
  name: string;
  registrations: number;
  firstDeposits: number;
  deposit: number;
  qualifiedCpa: number;
  commission: number;
}

interface CampaignBreakdownProps {
  rows: CampaignDisplayRow[];
  // Rótulo da coluna de comissão — "Comissão (casa)" no admin, "Sua comissão" no afiliado.
  commissionLabel: string;
  title?: string;
  subtitle?: string;
}

const formatBRL = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatInt = (value: number) => value.toLocaleString('pt-BR');

// Tabela de desempenho por campanha (dados reais de results?groupBy=campaign).
// Presentational: recebe linhas já normalizadas/calculadas pelo chamador.
export default function CampaignBreakdown({
  rows,
  commissionLabel,
  title = 'Desempenho por Campanha',
  subtitle,
}: CampaignBreakdownProps) {
  const data = Array.isArray(rows) ? rows : [];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl flex flex-col shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-50 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50 dark:bg-transparent">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
            <Megaphone size={16} />
          </div>
          <div>
            <h3 className="font-black text-xs text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-1">
              {title} <HelpCircle size={12} className="text-slate-400 dark:text-slate-500" />
            </h3>
            {subtitle && (
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {formatInt(data.length)} {data.length === 1 ? 'campanha' : 'campanhas'}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 text-slate-300 dark:text-slate-600">
          <Megaphone size={40} className="opacity-30" />
          <p className="text-xs font-bold uppercase tracking-widest opacity-60">Sem dados por campanha no período</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4 font-black">Campanha</th>
                <th className="px-6 py-4 font-black text-right">Cadastros</th>
                <th className="px-6 py-4 font-black text-right">1ºs Depósitos</th>
                <th className="px-6 py-4 font-black text-right">Valor Depositado</th>
                <th className="px-6 py-4 font-black text-right">CPA Qualif.</th>
                <th className="px-6 py-4 font-black text-right">{commissionLabel}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr
                  key={idx}
                  className="border-b border-slate-50 dark:border-slate-800/60 last:border-0 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 shrink-0 rounded-lg bg-brand/10 text-brand flex items-center justify-center font-black text-[11px]">
                        {row.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-600 dark:text-slate-300">{formatInt(row.registrations)}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-600 dark:text-slate-300">{formatInt(row.firstDeposits)}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-600 dark:text-slate-300">{formatBRL(row.deposit)}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-600 dark:text-slate-300">{formatInt(row.qualifiedCpa)}</td>
                  <td className="px-6 py-4 text-right text-xs font-black text-slate-900 dark:text-white">{formatBRL(row.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
