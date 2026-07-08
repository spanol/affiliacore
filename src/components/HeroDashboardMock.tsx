import {
  LayoutDashboard,
  Users,
  Building2,
  Trophy,
  ScrollText,
  DollarSign,
  BarChart3,
  TrendingUp,
  UserPlus,
  Wallet,
  Target,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { BRAND } from '../lib/brandingClient';
import { OTG_ENABLED } from '../lib/instanceClient';

// LP hero: miniatura VIVA da dashboard — substitui o screenshot estático da
// Boost (a arte antiga aparecia âmbar/BOOST em qualquer instância). Montada
// com os MESMOS tokens de tema do app (accent-*/neutral-* compilam p/ var())
// e a marca da instância (BRAND), então segue VITE_BRAND_ACCENT/CANVAS/LOGO
// sozinha, sem rebuild. Sempre no look ESCURO (o hero da LP é escuro), igual
// ao screenshot que substitui.
// Puramente decorativa: números FICTÍCIOS hardcoded — nenhum serviço, nenhuma
// função de dinheiro (lucro/margem seguem exclusivos do /admin — invariante).

const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Afiliados', icon: Users, active: false },
  { label: 'Casas', icon: Building2, active: false },
  { label: 'Ranking', icon: Trophy, active: false },
  { label: 'Auditoria', icon: ScrollText, active: false },
];

const METRICS = [
  { label: 'Total de Afiliados', value: '38', icon: Users, dark: true },
  { label: 'Total comissão', value: 'R$ 24.831,90', icon: DollarSign, dark: false },
  // Espelha o card real do /admin (P5.3): CPA-dinheiro só existe com OTG —
  // instância OTG-free mostra o total depositado no 3º card.
  OTG_ENABLED
    ? { label: 'Total CPA', value: 'R$ 18.240,00', icon: BarChart3, dark: false }
    : { label: 'Total depositado', value: 'R$ 97.100,00', icon: BarChart3, dark: false },
  { label: 'Total REV', value: 'R$ 6.591,90', icon: TrendingUp, dark: false },
];

const FUNNEL = [
  { label: 'Cadastros', value: '1.204', icon: UserPlus },
  { label: 'Primeiros Depósitos', value: '312', icon: Wallet },
  { label: 'CPA Qualificado', value: '187', icon: Target },
];

// Barras do gráfico "top afiliados" (altura em % + nome fictício)
const BARS = [
  { name: 'Yago', h: 92 },
  { name: 'Ana', h: 74 },
  { name: 'Lucas', h: 61 },
  { name: 'Bia', h: 52 },
  { name: 'Rafa', h: 40 },
  { name: 'Duda', h: 31 },
  { name: 'Igor', h: 22 },
];

// Desempenho por casa — nomes já públicos na própria LP (seção de parceiros).
const HOUSES = [
  { name: 'Superbet', commission: 'R$ 14.930,10', ftds: '178 FTDs' },
  { name: 'Betano', commission: 'R$ 6.480,00', ftds: '89 FTDs' },
  { name: 'BetMGM', commission: 'R$ 3.421,80', ftds: '45 FTDs' },
];

export default function HeroDashboardMock() {
  return (
    <div
      role="img"
      aria-label={`Prévia do painel ${BRAND.shortName}`}
      className="w-full bg-neutral-950 flex items-stretch text-left select-none pointer-events-none overflow-hidden"
    >
      {/* Sidebar em miniatura */}
      <div className="hidden sm:flex w-[21%] max-w-[200px] flex-col gap-3 border-r border-neutral-800/80 p-3 md:p-4" aria-hidden="true">
        <img src={BRAND.logoUrl} alt="" className="h-4 md:h-5 w-auto self-start" />
        <div className="mt-1">
          <p className="px-1.5 text-[6px] md:text-[8px] uppercase tracking-widest font-bold text-neutral-500 mb-1">
            Principal
          </p>
          <div className="space-y-0.5">
            {NAV.map((item) => (
              <div
                key={item.label}
                className={cn(
                  'flex items-center gap-1.5 px-1.5 py-1 md:py-1.5 rounded-lg text-[7px] md:text-[9px] font-medium border border-transparent',
                  item.active
                    ? 'bg-accent-500/15 text-accent-500 font-bold border-accent-500/30'
                    : 'text-neutral-400',
                )}
              >
                <item.icon className={cn('w-2.5 h-2.5 md:w-3 md:h-3', item.active ? 'text-accent-500' : 'text-neutral-300')} />
                {item.label}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-auto flex items-center gap-1.5 p-1.5 bg-white/5 rounded-lg border border-neutral-800">
          <span className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-accent-500/20 text-accent-400 text-[6px] md:text-[7px] font-bold flex items-center justify-center">
            AD
          </span>
          <span className="text-[6px] md:text-[8px] text-neutral-400 truncate">Admin · {BRAND.shortName}</span>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 p-3 md:p-5 space-y-2 md:space-y-3.5" aria-hidden="true">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mb-1 rounded-full bg-white/5 border border-white/10 text-neutral-300 text-[5px] md:text-[7px] font-bold uppercase tracking-widest">
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              Visão geral
            </span>
            <h3 className="text-xs md:text-lg font-bold text-white tracking-tighter leading-none">Dashboard</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-1 rounded-full border border-neutral-800 text-neutral-400 text-[6px] md:text-[8px] font-medium">
              Últimos 30 dias
            </span>
            <span className="px-2 py-1 rounded-full bg-accent-500 text-accent-contrast text-[6px] md:text-[8px] font-bold">
              Convidar afiliado
            </span>
          </div>
        </div>

        {/* Cards de métricas (eco do /admin: 1º card escuro, demais translúcidos) */}
        <div className="grid grid-cols-4 gap-1.5 md:gap-2.5">
          {METRICS.map((m) => (
            <div
              key={m.label}
              className={cn(
                'rounded-lg md:rounded-xl border p-1.5 md:p-2.5',
                m.dark ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-900/60 border-neutral-800',
              )}
            >
              <m.icon className="w-2 h-2 md:w-3 md:h-3 text-neutral-300 mb-1 md:mb-1.5" />
              <p className="text-[5px] md:text-[7px] uppercase font-bold tracking-widest text-neutral-500 mb-0.5 truncate">
                {m.label}
              </p>
              <p className="text-[8px] md:text-xs font-bold text-white tracking-tight truncate">{m.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-1.5 md:gap-2.5">
          {/* Top afiliados por comissão — barras no accent da instância */}
          <div className="col-span-3 rounded-lg md:rounded-xl border border-neutral-800 bg-neutral-900/60 p-1.5 md:p-2.5">
            <p className="text-[5px] md:text-[7px] uppercase font-bold tracking-widest text-neutral-500 mb-1 md:mb-2">
              Top afiliados por comissão
            </p>
            <div className="flex items-end gap-1 md:gap-1.5 h-12 md:h-20">
              {BARS.map((b, i) => (
                <div key={b.name} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                  <div
                    className={cn('w-full rounded-t-sm', i === 0 ? 'bg-accent-400' : 'bg-accent-500/70')}
                    style={{ height: `${b.h}%` }}
                  />
                  <span className="text-[4px] md:text-[6px] text-neutral-500 truncate max-w-full">{b.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Funil da rede */}
          <div className="col-span-2 rounded-lg md:rounded-xl border border-neutral-800 bg-neutral-900/60 p-1.5 md:p-2.5">
            <p className="text-[5px] md:text-[7px] uppercase font-bold tracking-widest text-neutral-500 mb-1 md:mb-2">
              Funil da rede
            </p>
            <div className="space-y-1 md:space-y-1.5">
              {FUNNEL.map((f) => (
                <div
                  key={f.label}
                  className="flex items-center gap-1 md:gap-1.5 border-b border-neutral-800/60 last:border-0 pb-1 md:pb-1.5 last:pb-0"
                >
                  <span className="p-0.5 md:p-1 rounded-md bg-neutral-800/60 border border-neutral-700/60">
                    <f.icon className="w-2 h-2 md:w-2.5 md:h-2.5 text-neutral-300" />
                  </span>
                  <span className="text-[5px] md:text-[7px] text-neutral-400 truncate flex-1">{f.label}</span>
                  <span className="text-[6px] md:text-[9px] font-bold text-white">{f.value}</span>
                </div>
              ))}
            </div>
            <p className="mt-1 md:mt-1.5 text-[5px] md:text-[7px] text-accent-400 font-medium">+12,4% vs. período anterior</p>
          </div>
        </div>

        {/* Desempenho por casa (eco da seção homônima do /admin) */}
        <div>
          <p className="text-[5px] md:text-[7px] uppercase font-bold tracking-widest text-neutral-500 mb-1 md:mb-1.5 px-0.5">
            Desempenho por casa
          </p>
          <div className="grid grid-cols-3 gap-1.5 md:gap-2.5">
            {HOUSES.map((h) => (
              <div key={h.name} className="rounded-lg md:rounded-xl border border-neutral-800 bg-neutral-900/60 p-1.5 md:p-2.5 flex items-center gap-1.5 md:gap-2">
                <span className="w-4 h-4 md:w-6 md:h-6 rounded-md md:rounded-lg bg-neutral-800/80 border border-neutral-700/60 text-neutral-300 text-[6px] md:text-[8px] font-bold flex items-center justify-center shrink-0">
                  {h.name.slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="block text-[5px] md:text-[7px] text-neutral-400 truncate">{h.name} · {h.ftds}</span>
                  <span className="block text-[7px] md:text-[10px] font-bold text-white tracking-tight truncate">{h.commission}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
