import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchHouses, type House } from '../services/houseService';
import { describeFreshness } from '../lib/freshness';
import { houseLogoOrPreset } from '../lib/housePresets';
import { cn } from '../lib/utils';

// "Atualização dos dados" — quando cada casa foi atualizada pela última vez.
//
// Existe porque o painel MISTURA dois relógios: o clique é nosso e conta na hora,
// mas cadastro/FTD/CPA vêm da casa (pull horário ou upload) e ela ainda fecha o
// dia com atraso. Sem esse carimbo o afiliado lê tudo como tempo real e cobra o
// que o número não promete. Pedido nominalmente pela Infinity (04/08/2026).
export default function DataFreshness({ className }: { className?: string }) {
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  // Re-render por minuto: sem isto, "há 3 min" congela numa aba aberta o dia todo.
  const [, setTick] = useState(0);

  useEffect(() => {
    fetchHouses()
      .then((data) => setHouses(Array.isArray(data) ? data.filter((h) => h.active !== false) : []))
      .catch(() => setHouses([]))
      .finally(() => setLoading(false));
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  if (loading || houses.length === 0) return null;

  return (
    <section className={cn('bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 p-6 shadow-sm', className)}>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-300">
          <RefreshCw size={14} />
        </div>
        <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">
          Atualização dos dados
        </h3>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {houses.map((h) => {
          const f = describeFreshness(h.lastResultsSyncAt);
          const logo = houseLogoOrPreset(h.logo, h.slug, h.id, h.name);
          return (
            <li
              key={h.id}
              className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-neutral-800/50 border border-slate-100 dark:border-neutral-800"
            >
              {logo ? (
                <img src={logo} alt={h.name} className="w-8 h-8 rounded-lg object-contain bg-white dark:bg-neutral-800 p-0.5" />
              ) : (
                <span className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-800 flex items-center justify-center text-[11px] font-black text-slate-400">
                  {h.name.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-700 dark:text-neutral-200 truncate">{h.name}</p>
                <p className={cn('text-[11px] font-semibold', f.stale ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-neutral-500')}>
                  {f.label}
                  {h.lastResultsDate ? ` · cobre até ${h.lastResultsDate.split('-').reverse().join('/')}` : ''}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-4 leading-relaxed">
        Cliques no seu link são contados na hora. Cadastros, depósitos e CPA vêm do relatório da casa —
        que é atualizado ao longo do dia e pode fechar o dia anterior com algumas horas de atraso.
      </p>
    </section>
  );
}
