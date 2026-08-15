import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { AlertTriangle, AlertCircle, Info, ChevronRight, Wrench } from 'lucide-react';
import { runSetupChecks, type SetupFinding, type SetupSeverity } from '../lib/setupChecks';
import { fetchRegisteredUsers, type SpecialAffiliate } from '../services/affiliateService';
import { fetchHouses, type House } from '../services/houseService';
import { fetchIntegrations, type PublicIntegration } from '../services/integrationService';
import { OTG_ENABLED } from '../lib/instanceClient';
import { cn } from '../lib/utils';

// Saúde da configuração (F1 de ONBOARDING-AVISOS.md): card do /admin que lista
// pendências de configuração detectadas pelo motor puro `lib/setupChecks`.
// Recebe por props o que o AdminDashboard JÁ carrega (roster, configs, especiais)
// e busca sozinho o resto (users, casas, integrações). Zero achados = não
// renderiza nada: o card só existe quando há o que corrigir.

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

function subjectsLabel(finding: SetupFinding): string {
  const shown = finding.subjects.slice(0, MAX_SUBJECTS);
  const rest = finding.subjects.length - shown.length;
  return rest > 0 ? `${shown.join(' · ')} e mais ${rest}` : shown.join(' · ');
}

export default function SetupHealthCard({ affiliates, configs, specials, loading }: SetupHealthCardProps) {
  const [users, setUsers] = useState<Awaited<ReturnType<typeof fetchRegisteredUsers>>>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [integrations, setIntegrations] = useState<PublicIntegration[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let cancelado = false;
    // Falha de qualquer fonte cai em lista vazia: o check correspondente degrada
    // para o silêncio (nunca para um falso positivo barulhento).
    Promise.all([
      fetchRegisteredUsers().catch(() => []),
      fetchHouses().catch(() => []),
      fetchIntegrations().catch(() => []),
    ])
      .then(([u, h, i]) => {
        if (cancelado) return;
        setUsers(u);
        setHouses(h);
        setIntegrations(i);
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
    });
  }, [loading, fetching, affiliates, configs, users, specials, houses, integrations]);

  if (!findings.length) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-2xl shadow-sm p-5 sm:p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40">
          <Wrench size={18} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Saúde da configuração</h2>
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            {findings.length === 1
              ? '1 pendência de configuração nesta instância.'
              : `${findings.length} pendências de configuração nesta instância.`}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
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
