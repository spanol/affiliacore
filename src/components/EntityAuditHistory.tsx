import { useEffect, useState } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchEntityAuditLogs, AuditLog } from '../services/affiliateService';
import { actionLabel, actorDisplay, auditDetail } from '../lib/auditView';

interface Props {
  entityType: string;   // 'affiliate' | 'house' | 'user' | ...
  entityId: string;     // id da entidade (affiliateId, slug da casa, uid…)
  title?: string;
  limit?: number;
  className?: string;
}

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

// Timeline de auditoria de UMA entidade (ficha do afiliado, modal da casa). A rota
// /api/audit-logs é admin-only → o componente só renderiza p/ admin (afiliado vendo
// a própria ficha não dispara o fetch nem vê o histórico de gestão). [[boost-audit-trail]]
export default function EntityAuditHistory({ entityType, entityId, title = 'Histórico de auditoria', limit = 100, className = '' }: Props) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    if (!entityId) return;
    try {
      setLoading(true);
      setError('');
      const data = await fetchEntityAuditLogs(entityType, entityId, limit);
      setLogs(data);
    } catch (err: any) {
      console.error('Erro carregando histórico de auditoria', err);
      setError(err?.message || 'Não foi possível carregar o histórico.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, entityType, entityId]);

  if (!isAdmin) return null;

  return (
    <div className={`bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800 rounded-2xl ${className}`}>
      <div className="flex items-center justify-between gap-2 p-4 border-b border-slate-100 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 bg-slate-100 dark:bg-neutral-800 rounded-lg text-slate-500 dark:text-neutral-400">
            <ScrollText size={15} />
          </span>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white tracking-tight">{title}</h3>
        </div>
        <button
          onClick={load}
          disabled={loading}
          title="Atualizar"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 disabled:opacity-40 transition"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="py-6 text-center text-slate-500 dark:text-neutral-400 text-sm">Carregando…</div>
        ) : error ? (
          <div className="py-6 text-center text-rose-500 text-sm">{error}</div>
        ) : logs.length === 0 ? (
          <div className="py-6 text-center text-slate-500 dark:text-neutral-400 text-sm">Nenhuma ação registrada para esta entidade.</div>
        ) : (
          <ol className="relative border-l border-slate-200 dark:border-neutral-800 ml-1 space-y-4">
            {logs.map((log) => (
              <li key={log.id} className="ml-4">
                <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white dark:border-neutral-900" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200">
                    {actionLabel(log.action)}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-neutral-500">{fmtDate(log.createdAt)}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
                  por <span className="font-medium text-slate-600 dark:text-neutral-300">{actorDisplay(log)}</span>
                </p>
                {auditDetail(log) !== '—' && (
                  <p className="text-[13px] text-slate-600 dark:text-neutral-300 mt-1 break-words">{auditDetail(log)}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
