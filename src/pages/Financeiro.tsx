import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Wallet, Save, Loader2, KeyRound, FileText, MapPin, ShieldCheck, Clock, CheckCircle, DollarSign, XCircle, ArrowDownToLine, X, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  fetchMyPaymentProfile, saveMyPaymentProfile, PaymentProfile,
  fetchAffiliateResults, fetchAffiliateConfigs, calcAffiliatePayout, AffiliateConfig,
  fetchWithdrawals, requestWithdrawal, WithdrawalRequest, WITHDRAWAL_STATUS_LABEL, sumWithdrawalsByStatus,
} from '../services/affiliateService';
import DateRangePicker from '../components/DateRangePicker';
import { DateRange, getDefaultRange } from '../lib/dateRange';
import { cn } from '../lib/utils';

const PIX_TYPES = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' },
];

const STATUS_STYLE: Record<string, { icon: any; cls: string }> = {
  paid: { icon: CheckCircle, cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/70 dark:border-emerald-900/40' },
  approved: { icon: Clock, cls: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 border-sky-200/70 dark:border-sky-900/40' },
  requested: { icon: Clock, cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border-amber-200/70 dark:border-amber-900/40' },
  rejected: { icon: XCircle, cls: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200/70 dark:border-red-900/40' },
};

// B4 + Carteira/Saque (Tier 1): o afiliado vê a comissão apurada no período
// (mesma taxa/config do resto do app), acompanha as solicitações de saque e
// cadastra o PIX/NF pra onde a agência paga. SEM gateway: o admin transfere
// manualmente fora do sistema — este saque só rastreia o estado, auditado.
export default function Financeiro() {
  const { profile } = useAuth();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PaymentProfile>({
    pixKeyType: 'cpf',
    pixKey: '',
    documentType: 'cpf',
    document: '',
    legalName: '',
    address: '',
  });

  const [range, setRange] = useState<DateRange>(getDefaultRange());
  const [earned, setEarned] = useState(0);
  const [loadingEarned, setLoadingEarned] = useState(true);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchMyPaymentProfile();
        if (active && data) {
          setForm((prev) => ({
            pixKeyType: data.pixKeyType || prev.pixKeyType,
            pixKey: data.pixKey || '',
            documentType: data.documentType || 'cpf',
            document: data.document || '',
            legalName: data.legalName || '',
            address: data.address || '',
          }));
        }
      } catch (err) {
        console.error('Erro ao carregar dados de pagamento:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const loadWithdrawals = () => {
    setLoadingWithdrawals(true);
    fetchWithdrawals().then(setWithdrawals).finally(() => setLoadingWithdrawals(false));
  };
  useEffect(() => { loadWithdrawals(); }, []);

  // Comissão apurada no período (mesmo cálculo do resto do app — calcAffiliatePayout,
  // taxa de topo do afiliado; sem filtro por casa aqui, é a visão agregada).
  useEffect(() => {
    if (!profile?.affiliateId) { setLoadingEarned(false); return; }
    let active = true;
    setLoadingEarned(true);
    Promise.all([
      fetchAffiliateResults(profile.affiliateId, range).catch(() => []),
      fetchAffiliateConfigs().catch(() => ({} as Record<string, AffiliateConfig>)),
    ]).then(([results, configs]) => {
      if (!active) return;
      const rows: any[] = Array.isArray(results) ? results : (results ? [results] : []);
      const config = configs[profile.affiliateId!] || null;
      setEarned(rows.reduce((sum, r) => sum + calcAffiliatePayout(r, config), 0));
    }).finally(() => { if (active) setLoadingEarned(false); });
    return () => { active = false; };
  }, [profile?.affiliateId, range.startDate, range.endDate]);

  const totals = useMemo(() => ({
    pending: sumWithdrawalsByStatus(withdrawals, ['requested']),
    approved: sumWithdrawalsByStatus(withdrawals, ['approved']),
    paid: sumWithdrawalsByStatus(withdrawals, ['paid']),
  }), [withdrawals]);

  const set = (field: keyof PaymentProfile, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.pixKey?.trim()) {
      push({ type: 'error', message: 'Informe a chave PIX.' });
      return;
    }
    setSaving(true);
    try {
      await saveMyPaymentProfile(form);
      push({ type: 'success', message: 'Dados de pagamento salvos.' });
    } catch (err) {
      push({ type: 'error', message: err instanceof Error ? err.message : 'Falha ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRequestWithdrawal = async () => {
    const n = Number(amount.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      push({ type: 'error', message: 'Informe um valor válido.' });
      return;
    }
    if (!form.pixKey?.trim()) {
      push({ type: 'error', message: 'Cadastre sua chave PIX antes de solicitar um saque.' });
      return;
    }
    setRequesting(true);
    try {
      await requestWithdrawal(n, note.trim() || undefined);
      push({ type: 'success', message: 'Saque solicitado.' });
      setModalOpen(false);
      setAmount('');
      setNote('');
      loadWithdrawals();
    } catch (err: any) {
      push({ type: 'error', message: err?.message || 'Erro ao solicitar saque.' });
    } finally {
      setRequesting(false);
    }
  };

  // Tela exclusiva do afiliado (tem affiliateId). Admin não usa esta coleta.
  if (profile && profile.role === 'admin') return <Navigate to="/admin" replace />;
  if (profile && !profile.affiliateId) return <Navigate to="/profile" replace />;

  const inputCls =
    'w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all dark:text-white';
  const labelCls = 'text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest mb-1.5 block';
  const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-8 pb-20 max-w-3xl">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold uppercase tracking-widest">
            <Wallet size={12} /> Financeiro
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">Carteira</h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2 max-w-xl">
            Acompanhe sua comissão apurada, solicite saques e cadastre seus dados de pagamento.
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </header>

      {/* Cards da carteira */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500"><DollarSign size={12} /> Apurado no período</div>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{loadingEarned ? <Loader2 size={18} className="animate-spin" /> : fmt(earned)}</p>
        </div>
        <div className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-500"><Clock size={12} /> Pendente</div>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{loadingWithdrawals ? <Loader2 size={18} className="animate-spin" /> : fmt(totals.pending)}</p>
        </div>
        <div className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-500"><Clock size={12} /> Aprovado</div>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{loadingWithdrawals ? <Loader2 size={18} className="animate-spin" /> : fmt(totals.approved)}</p>
        </div>
        <div className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500"><CheckCircle size={12} /> Pago</div>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{loadingWithdrawals ? <Loader2 size={18} className="animate-spin" /> : fmt(totals.paid)}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent-500 text-accent-contrast text-xs font-bold hover:bg-accent-400 transition-all shadow-sm shadow-accent-500/20"
        >
          <ArrowDownToLine size={14} /> Solicitar saque
        </button>
      </div>

      {/* Histórico de solicitações */}
      <div className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-neutral-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Minhas solicitações</h3>
        </div>
        {loadingWithdrawals ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-accent-500" size={28} /></div>
        ) : withdrawals.length === 0 ? (
          <p className="p-6 text-xs text-slate-500 dark:text-neutral-400">Nenhum saque solicitado ainda.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-neutral-800">
            {withdrawals.map((w) => {
              const st = STATUS_STYLE[w.status] || STATUS_STYLE.requested;
              const Icon = st.icon;
              return (
                <div key={w.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white text-sm">{fmt(w.amount)}</p>
                    {w.note && <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-0.5">{w.note}</p>}
                  </div>
                  <span className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border shrink-0', st.cls)}>
                    <Icon size={13} /> {WITHDRAWAL_STATUS_LABEL[w.status]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={32} className="text-accent-500 animate-spin" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm p-6 md:p-8 space-y-8"
        >
          {/* PIX */}
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <KeyRound size={16} className="text-accent-500" /> Recebimento (PIX)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Tipo de chave</label>
                <select value={form.pixKeyType} onChange={(e) => set('pixKeyType', e.target.value)} className={inputCls}>
                  {PIX_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Chave PIX</label>
                <input value={form.pixKey} onChange={(e) => set('pixKey', e.target.value)} placeholder="Sua chave PIX" className={inputCls} />
              </div>
            </div>
          </section>

          {/* Dados fiscais / NF */}
          <section className="space-y-4 pt-2 border-t border-slate-100 dark:border-neutral-800">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <FileText size={16} className="text-accent-500" /> Dados para nota fiscal
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Tipo de documento</label>
                <select value={form.documentType} onChange={(e) => set('documentType', e.target.value)} className={inputCls}>
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>{form.documentType === 'cnpj' ? 'CNPJ' : 'CPF'}</label>
                <input value={form.document} onChange={(e) => set('document', e.target.value)} placeholder={form.documentType === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>{form.documentType === 'cnpj' ? 'Razão social' : 'Nome completo'}</label>
              <input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder={form.documentType === 'cnpj' ? 'Razão social da empresa' : 'Seu nome completo'} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}><MapPin size={11} className="inline -mt-0.5 mr-1" />Endereço</label>
              <input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Rua, número, bairro, cidade/UF" className={inputCls} />
            </div>
          </section>

          <div className="flex items-center justify-between gap-4 pt-2">
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-neutral-500">
              <ShieldCheck size={13} className="text-emerald-500" /> Seus dados ficam protegidos e visíveis só pra você e a agência.
            </p>
            <button
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent-500 text-accent-contrast text-xs font-bold hover:bg-accent-400 transition-all shadow-sm shadow-accent-500/20 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar dados
            </button>
          </div>
        </motion.div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !requesting && setModalOpen(false)}>
          <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-200 dark:border-neutral-800 w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Solicitar saque</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Valor (R$)</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Observação (opcional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: referente a julho" className={inputCls} />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-neutral-500">O pagamento é feito na chave PIX cadastrada acima. Confira antes de solicitar.</p>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-bold text-slate-600 dark:text-neutral-300">Cancelar</button>
              <button onClick={handleRequestWithdrawal} disabled={requesting} className="flex-1 py-2.5 rounded-xl bg-accent-500 text-accent-contrast text-sm font-bold hover:bg-accent-400 disabled:opacity-50 flex items-center justify-center gap-2">
                {requesting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
