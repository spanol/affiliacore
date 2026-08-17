import { useEffect, useMemo, useState } from 'react';
import { plural } from '../lib/plural';
import { motion } from 'motion/react';
import { Wallet, Loader2, Check, X, Banknote, Clock, CheckCircle, XCircle } from 'lucide-react';
import {
  fetchWithdrawals, decideWithdrawal, fetchAffiliates,
  WITHDRAWAL_STATUS_LABEL, sumWithdrawalsByStatus, withdrawalHouseName,
  type WithdrawalRequest,
} from '../services/affiliateService';
import { useToast } from '../contexts/ToastContext';
import BrandFilter from '../components/BrandFilter';
import BrandLogo from '../components/BrandLogo';
import { ALL_BRANDS } from '../lib/brand';
import { cn, humanizeName } from '../lib/utils';

type Tab = 'requested' | 'approved' | 'paid' | 'rejected';

const STATUS_STYLE: Record<string, { icon: any; cls: string }> = {
  paid: { icon: CheckCircle, cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/70 dark:border-emerald-900/40' },
  approved: { icon: Clock, cls: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 border-sky-200/70 dark:border-sky-900/40' },
  requested: { icon: Clock, cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border-amber-200/70 dark:border-amber-900/40' },
  rejected: { icon: XCircle, cls: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200/70 dark:border-red-900/40' },
};

export default function WithdrawalsAdmin() {
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('requested');
  const [houseFilter, setHouseFilter] = useState<string>(ALL_BRANDS);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [w, affs] = await Promise.all([fetchWithdrawals(), fetchAffiliates().catch(() => [])]);
      setWithdrawals(w);
      const nm: Record<string, string> = {};
      (affs as any[]).forEach((a) => { const id = String(a.id ?? a._id ?? ''); if (id) nm[id] = a.name || a.label || id; });
      setNames(nm);
    } catch {
      push({ type: 'error', message: 'Erro ao carregar saques.' });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Filtro por casa (pedido da Infinity): recorta abas, contadores e o total
  // pendente juntos — nada à vista fica fora do recorte. Solicitações antigas
  // sem casa só aparecem em "Todas as casas".
  const houseNames = useMemo(
    () => Array.from(new Set(withdrawals.map((w) => withdrawalHouseName(w)).filter((h): h is string => !!h))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [withdrawals],
  );
  const visible = useMemo(
    () => (houseFilter === ALL_BRANDS ? withdrawals : withdrawals.filter((w) => withdrawalHouseName(w) === houseFilter)),
    [withdrawals, houseFilter],
  );
  const filtered = useMemo(() => visible.filter((w) => w.status === tab), [visible, tab]);
  const counts = useMemo(() => ({
    requested: visible.filter((w) => w.status === 'requested').length,
    approved: visible.filter((w) => w.status === 'approved').length,
    paid: visible.filter((w) => w.status === 'paid').length,
    rejected: visible.filter((w) => w.status === 'rejected').length,
  }), [visible]);
  const pendingTotal = sumWithdrawalsByStatus(visible, ['requested']);

  const decide = async (w: WithdrawalRequest, status: 'approved' | 'rejected' | 'paid') => {
    setBusy(w.id);
    try {
      await decideWithdrawal(w.id, status);
      push({ type: 'success', message: status === 'approved' ? 'Saque aprovado.' : status === 'paid' ? 'Marcado como pago.' : 'Saque rejeitado.' });
      await load();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao decidir o saque.' });
    } finally { setBusy(null); }
  };

  const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-8 pb-16">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent-500">Financeiro</span>
        <div className="flex items-center gap-3 mt-1">
          <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
            <Wallet size={24} className="text-slate-900 dark:text-white" />
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">Saques</h1>
        </div>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">
          Fila de solicitações de saque dos afiliados. {pendingTotal > 0 && <b className="text-amber-600 dark:text-amber-400">{fmt(pendingTotal)} {plural(pendingTotal, 'pendente')} de aprovação.</b>} Sem gateway: o pagamento (PIX) é feito manualmente fora do sistema; marque "Pago" depois de transferir.
        </p>
      </motion.header>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-neutral-800/60 rounded-2xl w-fit overflow-x-auto">
          {([['requested', 'Pendentes'], ['approved', 'Aprovados'], ['paid', 'Pagos'], ['rejected', 'Rejeitados']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn('px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap',
                tab === t ? 'bg-white dark:bg-neutral-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-neutral-200')}
            >
              {label}{counts[t] ? ` (${counts[t]})` : ''}
            </button>
          ))}
        </div>
        <BrandFilter brands={houseNames} value={houseFilter} onChange={setHouseFilter} />
      </motion.div>

      {loading ? (
        <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-accent-500" size={40} /></div>
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-16 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
          <Wallet className="mx-auto text-slate-300 dark:text-neutral-600 mb-3" size={40} />
          <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100">Nada por aqui</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">Nenhuma solicitação {WITHDRAWAL_STATUS_LABEL[tab as any]?.toLowerCase()}.</p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {filtered.map((w) => {
            const st = STATUS_STYLE[w.status] || STATUS_STYLE.requested;
            const Icon = st.icon;
            const pix = (w as any).pixSnapshot;
            const house = withdrawalHouseName(w);
            return (
              <div key={w.id} className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl p-5 shadow-sm">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate">{humanizeName(names[String(w.affiliateId)] || w.affiliateId)}</h3>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{fmt(w.amount)}</p>
                    {/* De QUAL casa são os ganhos deste pedido (pedido da Infinity).
                        Pedido antigo, sem casa, mostra o placeholder — nunca some. */}
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
                      {house ? (<><BrandLogo name={house} size={14} /> {house}</>) : 'Casa não informada'}
                    </p>
                    {w.note && <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-1">{w.note}</p>}
                    {pix?.pixKey && (
                      <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1 flex items-center gap-1.5 font-mono">
                        <Banknote size={12} /> {pix.pixKeyType?.toUpperCase()}: {pix.pixKey}
                      </p>
                    )}
                  </div>
                  <span className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border shrink-0', st.cls)}>
                    <Icon size={13} /> {WITHDRAWAL_STATUS_LABEL[w.status]}
                  </span>
                </div>
                {w.status === 'requested' && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-neutral-800">
                    <button onClick={() => decide(w, 'approved')} disabled={busy === w.id} className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">{busy === w.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />} Aprovar</button>
                    <button onClick={() => decide(w, 'rejected')} disabled={busy === w.id} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 text-xs font-bold hover:text-red-500 hover:border-red-300 disabled:opacity-50 flex items-center gap-1.5"><X size={14} /> Rejeitar</button>
                  </div>
                )}
                {w.status === 'approved' && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-neutral-800">
                    <button onClick={() => decide(w, 'paid')} disabled={busy === w.id} className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">{busy === w.id ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={14} />} Marcar como pago</button>
                    <button onClick={() => decide(w, 'rejected')} disabled={busy === w.id} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 text-xs font-bold hover:text-red-500 hover:border-red-300 disabled:opacity-50 flex items-center gap-1.5"><X size={14} /> Rejeitar</button>
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
