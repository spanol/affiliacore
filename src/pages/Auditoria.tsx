import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ScrollText, Search, RefreshCw, ChevronLeft, ChevronRight, ShieldCheck, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAuditLogs, AuditLog } from '../services/affiliateService';
import {
  actionLabel, entityTypeLabel, entityDisplay, actorDisplay, auditDetail,
  filterAuditLogs, paginate, uniqueActions, uniqueEntityTypes, uniqueActors,
  type AuditFilters,
} from '../lib/auditView';

const PAGE_SIZE = 25;
const FETCH_LIMIT = 1000; // teto que o server aceita; "mostrando os N mais recentes"

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

export default function Auditoria() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AuditFilters>({
    entityType: '', action: '', actor: '', dateFrom: '', dateTo: '', search: '',
  });

  async function load() {
    try {
      setLoading(true);
      setError('');
      const data = await fetchAuditLogs({ limit: FETCH_LIMIT });
      setLogs(data);
    } catch (err: any) {
      console.error('Erro carregando auditoria', err);
      setError(err?.message || 'Não foi possível carregar a trilha de auditoria.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role]);

  // Opções dos selects derivam dos dados carregados (só ações/tipos/atores que existem).
  const entityTypes = useMemo(() => uniqueEntityTypes(logs), [logs]);
  const actions = useMemo(() => uniqueActions(logs), [logs]);
  const actors = useMemo(() => uniqueActors(logs), [logs]);

  const filtered = useMemo(() => filterAuditLogs(logs, filters), [logs, filters]);
  const pageData = useMemo(() => paginate(filtered, page, PAGE_SIZE), [filtered, page]);

  // Qualquer mudança de filtro volta p/ a página 1.
  const setFilter = (patch: Partial<AuditFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const clearFilters = () => {
    setFilters({ entityType: '', action: '', actor: '', dateFrom: '', dateTo: '', search: '' });
    setPage(1);
  };
  const hasActiveFilters = Object.values(filters).some((v) => v);

  if (profile?.role !== 'admin') {
    return (
      <div className="p-6 text-sm text-slate-500 dark:text-neutral-400">
        Acesso restrito a administradores.
      </div>
    );
  }

  const selectCls =
    'rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm text-slate-700 dark:text-neutral-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/40';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="p-2.5 bg-accent-500/10 rounded-xl border border-accent-500/20 text-accent-500">
            <ScrollText size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">Auditoria</h2>
            <p className="text-xs text-slate-500 dark:text-neutral-400">
              Trilha server-authoritative de todas as ações administrativas.
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50 transition"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Busca livre */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilter({ search: e.target.value })}
              placeholder="Buscar (ação, entidade, autor, motivo…)"
              className={`${selectCls} w-full pl-9`}
            />
          </div>
          {/* Tipo de entidade */}
          <select value={filters.entityType} onChange={(e) => setFilter({ entityType: e.target.value })} className={`${selectCls} w-full`}>
            <option value="">Todas as entidades</option>
            {entityTypes.map((t) => <option key={t} value={t}>{entityTypeLabel(t)}</option>)}
          </select>
          {/* Ação */}
          <select value={filters.action} onChange={(e) => setFilter({ action: e.target.value })} className={`${selectCls} w-full`}>
            <option value="">Todas as ações</option>
            {actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
          {/* Autor */}
          <select value={filters.actor} onChange={(e) => setFilter({ actor: e.target.value })} className={`${selectCls} w-full`}>
            <option value="">Todos os autores</option>
            {actors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
            De
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilter({ dateFrom: e.target.value })} className={selectCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
            Até
            <input type="date" value={filters.dateTo} onChange={(e) => setFilter({ dateTo: e.target.value })} className={selectCls} />
          </label>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-neutral-300 bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 transition">
              <X size={13} /> Limpar filtros
            </button>
          )}
          <span className="ml-auto text-xs text-slate-500 dark:text-neutral-400 self-center">
            {filtered.length} de {logs.length} registros
          </span>
        </div>
      </motion.div>

      {/* Tabela / estados */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800 rounded-2xl overflow-hidden"
      >
        {loading ? (
          <div className="py-12 text-center text-slate-500 dark:text-neutral-400 text-sm">Carregando trilha…</div>
        ) : error ? (
          <div className="py-12 text-center text-rose-500 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-500 dark:text-neutral-400 text-sm">
            {logs.length === 0 ? 'Nenhum registro de auditoria ainda.' : 'Nenhum registro com esses filtros.'}
          </div>
        ) : (
          <>
            {/* sm+ : tabela */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] text-slate-400 dark:text-neutral-500 uppercase tracking-widest border-b border-slate-100 dark:border-neutral-800">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Data</th>
                    <th className="px-4 py-3">Entidade</th>
                    <th className="px-4 py-3">Ação</th>
                    <th className="px-4 py-3">Autor</th>
                    <th className="px-4 py-3">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                  {pageData.items.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors align-top">
                      <td className="px-4 py-3 text-[13px] text-slate-600 dark:text-neutral-300 whitespace-nowrap">{fmtDate(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">{entityTypeLabel(log.entityType)}</span>
                        <span className="text-slate-700 dark:text-neutral-200 break-all">{entityDisplay(log)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 whitespace-nowrap">{actionLabel(log.action)}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-neutral-300 break-words">{actorDisplay(log)}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-500 dark:text-neutral-400 break-words max-w-md">{auditDetail(log)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile : cards */}
            <div className="sm:hidden divide-y divide-slate-100 dark:divide-neutral-800">
              {pageData.items.map((log) => (
                <div key={log.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-neutral-400">{fmtDate(log.createdAt)}</span>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200">{actionLabel(log.action)}</span>
                  </div>
                  <dl className="text-xs space-y-1">
                    <div className="flex gap-2">
                      <dt className="text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-widest text-[10px] shrink-0 pt-0.5">{entityTypeLabel(log.entityType)}</dt>
                      <dd className="text-slate-700 dark:text-neutral-200 font-medium break-all">{entityDisplay(log)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-widest text-[10px] shrink-0 pt-0.5">Autor</dt>
                      <dd className="text-slate-700 dark:text-neutral-200 font-medium break-words">{actorDisplay(log)}</dd>
                    </div>
                    {auditDetail(log) !== '—' && (
                      <div className="flex gap-2">
                        <dt className="text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-widest text-[10px] shrink-0 pt-0.5">Detalhe</dt>
                        <dd className="text-slate-600 dark:text-neutral-300 break-words">{auditDetail(log)}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </div>

            {/* Paginação */}
            {pageData.totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-neutral-800">
                <span className="text-xs text-slate-500 dark:text-neutral-400">
                  Página {pageData.page} de {pageData.totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pageData.page <= 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-neutral-700 transition"
                  >
                    <ChevronLeft size={14} /> Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pageData.totalPages, p + 1))}
                    disabled={pageData.page >= pageData.totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-neutral-700 transition"
                  >
                    Próxima <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>

      {logs.length >= FETCH_LIMIT && (
        <p className="text-[11px] text-slate-400 dark:text-neutral-500 flex items-center gap-1.5">
          <ShieldCheck size={13} /> Mostrando os {FETCH_LIMIT} registros mais recentes. Use os filtros de data para janelas anteriores.
        </p>
      )}
    </div>
  );
}
