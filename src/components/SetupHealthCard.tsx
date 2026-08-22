import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { AlertTriangle, AlertCircle, Info, ChevronRight, ChevronDown, Wrench } from 'lucide-react';
import { runSetupChecks, type SetupFinding, type SetupSeverity } from '../lib/setupChecks';
import { fetchRegisteredUsers, fetchDeals, type SpecialAffiliate, type Deal } from '../services/affiliateService';
import { fetchHouses, type House } from '../services/houseService';
import { fetchIntegrations, type PublicIntegration } from '../services/integrationService';
import { OTG_ENABLED, MARKETPLACE_ENABLED } from '../lib/instanceClient';
import { cn } from '../lib/utils';

// Saúde da configuração (F1 de ONBOARDING-AVISOS.md): card do /admin que lista
// pendências de configuração detectadas pelo motor puro `lib/setupChecks`.
// Recebe por props o que o AdminDashboard JÁ carrega (roster, configs, especiais)
// e busca sozinho o resto (users, casas, integrações). Zero achados = não
// renderiza nada: o card só existe quando há o que corrigir.
//
// RETRÁTIL e FECHADO por padrão: a lista aberta empurrava o painel inteiro para
// baixo no primeiro carregamento, e numa instância recém-provisionada são muitos
// achados de uma vez. Fechado ele vira uma linha que diz QUANTAS pendências há e
// de que gravidade, que é o suficiente para decidir se abre agora. A escolha de
// quem abriu fica no localStorage por INSTÂNCIA do navegador: reabrir a cada F5
// atrapalha justamente quem está no meio da correção.

interface SetupHealthCardProps {
  affiliates: any[];
  configs: Record<string, any>;
  specials: Record<string, SpecialAffiliate>;
  /** Loading da página: os checks só rodam com a base pronta (evita falso positivo). */
  loading: boolean;
}

const SEVERITY_STYLE: Record<SetupSeverity, { icon: typeof Info; badge: string; iconColor: string }> = {
  critical: {
    icon: AlertCircle,
    badge: 'bg-red-50 dark:bg-red-950/30 border-red-200/70 dark:border-red-900/50',
    iconColor: 'text-red-600 dark:text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    badge: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200/70 dark:border-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    icon: Info,
    badge: 'bg-slate-50 dark:bg-white/5 border-slate-200/70 dark:border-neutral-800',
    iconColor: 'text-slate-500 dark:text-neutral-400',
  },
};

const MAX_SUBJECTS = 3;

// Resumo por gravidade mostrado com o card fechado. Só as gravidades PRESENTES
// entram, e a ordem é a mesma da lista aberta (crítico primeiro).
const SEVERITY_SUMMARY: Array<{ key: SetupSeverity; one: string; many: string; chip: string }> = [
  { key: 'critical', one: 'crítica', many: 'críticas', chip: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200/70 dark:border-red-900/50' },
  { key: 'warning', one: 'aviso', many: 'avisos', chip: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-amber-200/70 dark:border-amber-900/40' },
  { key: 'info', one: 'informativo', many: 'informativos', chip: 'text-slate-500 dark:text-neutral-400 bg-slate-50 dark:bg-white/5 border-slate-200/70 dark:border-neutral-800' },
];

const OPEN_STORAGE_KEY = 'affiliacore_setup_health_open';

// Leitura defensiva: navegador com armazenamento bloqueado LANÇA no acesso, e um
// card de diagnóstico não pode ser o que derruba o painel. Falha = fechado.
function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function subjectsLabel(finding: SetupFinding): string {
  const shown = finding.subjects.slice(0, MAX_SUBJECTS);
  const rest = finding.subjects.length - shown.length;
  return rest > 0 ? `${shown.join(' · ')} e mais ${rest}` : shown.join(' · ');
}

export default function SetupHealthCard({ affiliates, configs, specials, loading }: SetupHealthCardProps) {
  const [users, setUsers] = useState<Awaited<ReturnType<typeof fetchRegisteredUsers>>>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [integrations, setIntegrations] = useState<PublicIntegration[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [fetching, setFetching] = useState(true);
  const [open, setOpen] = useState<boolean>(readStoredOpen);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try { localStorage.setItem(OPEN_STORAGE_KEY, next ? '1' : '0'); } catch { /* sem persistência, só a sessão */ }
      return next;
    });
  };

  useEffect(() => {
    let cancelado = false;
    // Falha de qualquer fonte cai em lista vazia: o check correspondente degrada
    // para o silêncio (nunca para um falso positivo barulhento). Os acordos só são
    // buscados com o marketplace ligado (a rota responde 404 sem ele).
    Promise.all([
      fetchRegisteredUsers().catch(() => []),
      fetchHouses().catch(() => []),
      fetchIntegrations().catch(() => []),
      MARKETPLACE_ENABLED ? fetchDeals().catch(() => []) : Promise.resolve([]),
    ])
      .then(([u, h, i, d]) => {
        if (cancelado) return;
        setUsers(u);
        setHouses(h);
        setIntegrations(i);
        setDeals(d);
      })
      .finally(() => { if (!cancelado) setFetching(false); });
    return () => { cancelado = true; };
  }, []);

  const findings = useMemo(() => {
    if (loading || fetching) return [];
    return runSetupChecks({
      affiliates,
      configs,
      users,
      specials,
      houses,
      integrations,
      otgEnabled: OTG_ENABLED,
      deals,
      marketplaceEnabled: MARKETPLACE_ENABLED,
    });
  }, [loading, fetching, affiliates, configs, users, specials, houses, integrations, deals]);

  const resumo = useMemo(
    () =>
      SEVERITY_SUMMARY.map(({ key, one, many, chip }) => ({
        key,
        chip,
        count: findings.filter((f) => f.severity === key).length,
        label: (n: number) => (n === 1 ? one : many),
      })).filter((s) => s.count > 0),
    [findings],
  );

  if (!findings.length) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-2xl shadow-sm p-5 sm:p-6"
    >
      {/* O cabeçalho INTEIRO é o gatilho: com o card fechado ele é a única coisa
          na tela, e um alvo de clique do tamanho de um chevron seria um convite a
          errar a mira. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="setup-health-list"
        className={cn(
          'w-full flex items-center gap-3 text-left rounded-xl transition-colors',
          'hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
          open && 'mb-4',
        )}
      >
        <div className="shrink-0 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40">
          <Wrench size={18} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Saúde da configuração</h2>
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            {findings.length === 1
              ? '1 pendência de configuração nesta instância.'
              : `${findings.length} pendências de configuração nesta instância.`}
          </p>
        </div>
        {/* Fechado, os chips são o conteúdo: dizem a GRAVIDADE do que está
            escondido. Abertos viram redundância com a lista, e saem. */}
        {!open && (
          <span className="hidden sm:flex items-center gap-1.5 shrink-0">
            {resumo.map((s) => (
              <span
                key={s.key}
                className={cn('px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider', s.chip)}
              >
                {s.count} {s.label(s.count)}
              </span>
            ))}
          </span>
        )}
        <ChevronDown
          size={18}
          className={cn(
            'shrink-0 text-slate-400 dark:text-neutral-500 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      <ul id="setup-health-list" className={cn('space-y-2', !open && 'hidden')}>
        {findings.map((f) => {
          const style = SEVERITY_STYLE[f.severity];
          const Icon = style.icon;
          return (
            <li
              key={f.id}
              className={cn('flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border p-3.5', style.badge)}
            >
              <Icon size={18} className={cn('shrink-0 mt-0.5 sm:mt-0', style.iconColor)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">{f.title}</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">{f.detail}</p>
                {f.subjects.length > 0 && (
                  <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1 truncate" title={f.subjects.join(' · ')}>
                    {subjectsLabel(f)}
                  </p>
                )}
              </div>
              <Link
                to={f.fixRoute}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-700 dark:text-neutral-200 hover:border-accent-500/40 transition-all"
              >
                {f.fixLabel}
                <ChevronRight size={14} />
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
