import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';

// Pílula de troca de tema. Nasceu inline no DashboardLayout e foi extraída
// quando a LP pública virou theme-aware (P5.6) — o pedido era "o mesmo switch
// que existe dentro da dashboard", então tem que ser o MESMO componente, não uma
// cópia que diverge na próxima mudança de estilo.
//
// `compact` esconde o rótulo (só o ícone). Nasceu para a nav da landing, onde o
// rótulo espremia os CTAs no mobile, e passou a valer também no header do app
// (o texto competia com o sino e o título da página por atenção). O modo COM
// rótulo continua aqui para quem precisar do switch explicado.
export default function ThemeToggle({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className={cn(
        'flex items-center gap-2 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border border-transparent dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-all shadow-sm',
        compact ? 'p-2' : 'px-3 py-1.5',
        className,
      )}
    >
      {theme === 'light' ? (
        <Moon size={14} className="text-slate-600 dark:text-neutral-400" />
      ) : (
        <Sun size={14} className="text-amber-500" />
      )}
      {!compact && (
        <span className="text-[10px] font-bold uppercase tracking-wider">
          {theme === 'light' ? 'Tema Escuro' : 'Tema Claro'}
        </span>
      )}
    </button>
  );
}
