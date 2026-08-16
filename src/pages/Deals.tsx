import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Tag, Loader2, Plus, Check, X, Ban, Power, Pencil, Inbox, Link2 } from 'lucide-react';
import {
  fetchDeals, createDeal, updateDeal, fetchPartnerships, decidePartnership, fetchAffiliates,
  buildDealLabel, DEAL_MODELS, PAYMENT_CYCLES, DEAL_CURRENCIES, DEAL_MODEL_LABEL, PAYMENT_CYCLE_LABEL,
  DEAL_TYPES, DEAL_TYPE_POLICY, DEAL_KPI_LABEL, dealPolicy, partnershipStatusLabel,
  type Deal, type DealModel, type PaymentCycle, type DealCurrency, type DealTypeId, type PartnershipRequest,
} from '../services/affiliateService';
import { fetchHouses } from '../services/houseService';
import {
  emptyDealDraft, draftFromDeal, buildDealPayload, adminEditsKpi, dealTypeBadge,
  selectAdminPartnershipQueues, partnershipDecisionMessage, type DealDraft,
} from '../lib/dealsAdmin';
import { DEAL_TYPE_DEFAULT } from '../lib/instanceClient';
import { useToast } from '../contexts/ToastContext';
import { cn, humanizeName } from '../lib/utils';

type Tab = 'deals' | 'requests' | 'links';

export default function Deals() {
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('deals');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [requests, setRequests] = useState<PartnershipRequest[]>([]);
  const [houses, setHouses] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<DealDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [d, r, h, affs] = await Promise.all([
        fetchDeals(), fetchPartnerships(), fetchHouses().catch(() => []), fetchAffiliates().catch(() => []),
      ]);
      setDeals(d);
      setRequests(r);
      setHouses(h as any[]);
      const nm: Record<string, string> = {};
      (affs as any[]).forEach((a) => { const id = String(a.id ?? a._id ?? ''); if (id) nm[id] = a.name || a.label || id; });
      setNames(nm);
    } catch {
      push({ type: 'error', message: 'Erro ao carregar acordos.' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // `priced` (o gerente já precificou) NÃO é uma parceria decidida: ela espera o
  // link da agência e por isso tem fila própria. Recorte puro em lib/dealsAdmin.
  const { pending, awaitingLink, decided } = useMemo(() => selectAdminPartnershipQueues(requests), [requests]);

  // Política do tipo escolhido no modal: dirige quais campos de KPI aparecem e o
  // aviso de que as taxas ficam ocultas para o afiliado.
  const policy = useMemo(() => dealPolicy(modal ? { type: modal.type } : null), [modal?.type]);
  const shows = (kpi: Parameters<typeof adminEditsKpi>[1]) => adminEditsKpi(modal?.type, kpi);

  const saveDeal = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      const payload = buildDealPayload(modal);
      if (modal.id) await updateDeal(modal.id, payload);
      else await createDeal(payload);
      push({ type: 'success', message: modal.id ? 'Acordo atualizado.' : 'Acordo criado.' });
      setModal(null);
      await load();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao salvar acordo.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleDeal = async (deal: Deal) => {
    setBusy(deal.id);
    try {
      await updateDeal(deal.id, { active: !deal.active });
      await load();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao alterar o acordo.' });
    } finally { setBusy(null); }
  };

  const decide = async (r: PartnershipRequest, status: 'approved' | 'rejected' | 'discontinued') => {
    setBusy(r.id);
    try {
      await decidePartnership(r.id, status);
      push({ type: 'success', message: partnershipDecisionMessage(r.status, status) });
      await load();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao decidir a parceria.' });
    } finally { setBusy(null); }
  };

  const openNew = () => setModal(emptyDealDraft(DEAL_TYPE_DEFAULT));
  const openEdit = (d: Deal) => setModal(draftFromDeal(d));

  const requestRow = (r: PartnershipRequest, actions: ReactNode) => (
    <div key={r.id} className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl p-4 flex items-center gap-3 shadow-sm">
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-slate-900 dark:text-white truncate">{humanizeName(names[String(r.affiliateId)] || r.affiliateId)}</h3>
        <p className="text-[11px] text-slate-400 dark:text-neutral-500 truncate">{r.dealLabel}</p>
      </div>
      {actions}
    </div>
  );

  return (
    <div className="space-y-8 pb-16">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent-500">Marketplace</span>
          <div className="flex items-center gap-3 mt-1">
            <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
              <Tag size={24} className="text-slate-900 dark:text-white" />
            </span>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">Acordos</h1>
          </div>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">Ofertas das operadoras e aprovação das parcerias solicitadas pelos afiliados.</p>
        </div>
        {tab === 'deals' && (
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:opacity-90 shadow-sm">
            <Plus size={15} /> Novo acordo
          </button>
        )}
      </motion.header>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-neutral-800/60 rounded-2xl w-fit">
        {([
          ['deals', 'Acordos'],
          ['requests', `Solicitações${pending.length ? ` (${pending.length})` : ''}`],
          ['links', `Aguardando link${awaitingLink.length ? ` (${awaitingLink.length})` : ''}`],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={cn('px-4 py-2 rounded-xl text-xs font-bold transition-all', tab === t ? 'bg-white dark:bg-neutral-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-neutral-200')}>{label}</button>
        ))}
      </motion.div>

      {loading ? (
        <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-accent-500" size={40} /></div>
      ) : tab === 'deals' ? (
        deals.length === 0 ? (
          <div className="p-16 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
            <Tag className="mx-auto text-slate-300 dark:text-neutral-600 mb-3" size={40} />
            <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100">Nenhum acordo cadastrado</h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">Crie o primeiro acordo para os afiliados começarem a solicitar parcerias.</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {deals.map((deal) => (
              <div key={deal.id} className={cn('bg-white dark:bg-neutral-900/60 border rounded-3xl p-5 shadow-sm flex flex-col gap-3', deal.active ? 'border-slate-200/70 dark:border-neutral-800' : 'border-slate-200/70 dark:border-neutral-800 opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate">{deal.operatorName}</h3>
                    <p className="text-[11px] text-slate-400 dark:text-neutral-500 truncate">{buildDealLabel(deal)}</p>
                  </div>
                  <span className={cn('shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold', deal.active ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400')}>{deal.active ? 'Ativo' : 'Inativo'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-accent-500/15 text-accent-500">{DEAL_MODEL_LABEL[deal.model]}</span>
                  {dealTypeBadge(deal) && (
                    <span data-testid="badge-tipo" className="px-2 py-1 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300">{dealTypeBadge(deal)}</span>
                  )}
                  {(deal.cpaValue ?? 0) > 0 && <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">CPA R$ {Number(deal.cpaValue).toFixed(2)}</span>}
                  {(deal.revPercentage ?? 0) > 0 && <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">RevShare {deal.revPercentage}%</span>}
                  {(deal.baseline ?? 0) > 0 && <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">{DEAL_KPI_LABEL.baseline} R$ {Number(deal.baseline).toFixed(2)}</span>}
                  {(deal.rollover ?? 0) > 0 && <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">{DEAL_KPI_LABEL.rollover} {deal.rollover}x</span>}
                  {(deal.ggrPercentage ?? 0) > 0 && <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">{DEAL_KPI_LABEL.ggr} {deal.ggrPercentage}%</span>}
                </div>
                <div className="mt-auto flex items-center gap-2 pt-2">
                  <button onClick={() => openEdit(deal)} className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-300 hover:border-accent-500/40 hover:text-accent-500 flex items-center justify-center gap-1.5"><Pencil size={13} /> Editar</button>
                  <button onClick={() => toggleDeal(deal)} disabled={busy === deal.id} className={cn('flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50', deal.active ? 'border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 hover:text-red-500 hover:border-red-300' : 'bg-emerald-500 text-white')}>
                    {busy === deal.id ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />} {deal.active ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            ))}
          </motion.div>
        )
      ) : tab === 'links' ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-neutral-400 max-w-2xl">
            Nestas parcerias o gerente já definiu a comissão do afiliado. Falta a agência emitir o link de divulgação. Emitir o link aqui não altera a comissão que o gerente definiu.
          </p>
          {awaitingLink.length === 0 ? (
            <div className="p-10 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
              <Link2 className="mx-auto text-slate-300 dark:text-neutral-600 mb-2" size={32} />
              <p className="text-xs text-slate-500 dark:text-neutral-400">Nenhuma parceria esperando link.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {awaitingLink.map((r) => requestRow(r, (
                <>
                  <span className="hidden sm:inline px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">{partnershipStatusLabel(r.status, 'admin')}</span>
                  <button onClick={() => decide(r, 'approved')} disabled={busy === r.id} className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">{busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={14} />} Emitir link</button>
                  <button onClick={() => decide(r, 'rejected')} disabled={busy === r.id} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 text-xs font-bold hover:text-red-500 hover:border-red-300 disabled:opacity-50 flex items-center gap-1.5"><X size={14} /> Recusar</button>
                </>
              )))}
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-3">Pendentes de aprovação</h2>
            {pending.length === 0 ? (
              <div className="p-10 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
                <Inbox className="mx-auto text-slate-300 dark:text-neutral-600 mb-2" size={32} />
                <p className="text-xs text-slate-500 dark:text-neutral-400">Nenhuma solicitação pendente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((r) => requestRow(r, (
                  <>
                    <button onClick={() => decide(r, 'approved')} disabled={busy === r.id} className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">{busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />} Aprovar</button>
                    <button onClick={() => decide(r, 'rejected')} disabled={busy === r.id} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 text-xs font-bold hover:text-red-500 hover:border-red-300 disabled:opacity-50 flex items-center gap-1.5"><X size={14} /> Recusar</button>
                  </>
                )))}
              </div>
            )}
          </section>

          {decided.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-3">Decididas</h2>
              <div className="space-y-3">
                {decided.map((r) => requestRow(r, (
                  <>
                    <span className={cn('px-3 py-1.5 rounded-full text-[11px] font-bold', r.status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400')}>{partnershipStatusLabel(r.status, 'admin')}</span>
                    {r.status === 'approved' && (
                      <button onClick={() => decide(r, 'discontinued')} disabled={busy === r.id} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 text-xs font-bold hover:text-red-500 hover:border-red-300 disabled:opacity-50 flex items-center gap-1.5">{busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />} Encerrar</button>
                    )}
                  </>
                )))}
              </div>
            </section>
          )}
        </motion.div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setModal(null)}>
          {/* max-h + scroll próprio: sem isso, num painel mais alto que a
              janela o `items-center` do pai joga metade do modal p/ FORA da
              viewport e nem topo nem rodapé ficam alcançáveis (não há scroll
              nenhum). Mesma correção do LegalAdmin. */}
          <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-200 dark:border-neutral-800 w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{modal.id ? 'Editar acordo' : 'Novo acordo'}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">Operadora (casa)</label>
                <select data-testid="campo-casa" value={modal.houseId} onChange={(e) => { const h = houses.find((x) => String(x.id) === e.target.value); setModal({ ...modal, houseId: e.target.value, operatorName: h?.name || modal.operatorName }); }} className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-accent-500/30">
                  <option value="">Selecione a casa…</option>
                  {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>

              {/* TIPO DE ACORDO. A lista sai do catálogo (DEAL_TYPES/DEAL_TYPE_POLICY),
                  nunca hardcoded aqui: um 3º tipo aparece sozinho na tela. */}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">Tipo de acordo</label>
                <div className="mt-1.5 grid gap-2">
                  {DEAL_TYPES.map((t) => {
                    const p = DEAL_TYPE_POLICY[t];
                    const selected = modal.type === t;
                    return (
                      <label key={t} data-testid={`tipo-${t}`} className={cn('flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition-all', selected ? 'border-accent-500/60 bg-accent-500/5' : 'border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600')}>
                        <input type="radio" name="deal-type" value={t} checked={selected} onChange={() => setModal({ ...modal, type: t as DealTypeId })} className="mt-0.5 w-4 h-4 shrink-0 accent-accent-500" />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-slate-800 dark:text-neutral-100">{p.label}</span>
                          <span className="block text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5">{p.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">Modelo</label>
                  <select data-testid="campo-modelo" value={modal.model} onChange={(e) => setModal({ ...modal, model: e.target.value as DealModel })} className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none">
                    {DEAL_MODELS.map((m) => <option key={m} value={m}>{DEAL_MODEL_LABEL[m]}</option>)}
                  </select>
                </div>
                {shows('cycle') && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">{DEAL_KPI_LABEL.cycle}</label>
                    <select data-testid="campo-cycle" value={modal.cycle} onChange={(e) => setModal({ ...modal, cycle: e.target.value as PaymentCycle })} className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none">
                      {PAYMENT_CYCLES.map((c) => <option key={c} value={c}>{PAYMENT_CYCLE_LABEL[c]}</option>)}
                    </select>
                  </div>
                )}
                {/* CPA e RevShare são o que a CASA paga à AGÊNCIA: seguem sempre
                    editáveis pelo admin. O tipo `gerenciado` os esconde do AFILIADO,
                    e quem faz isso é o servidor (sanitizeDealForViewer). */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">CPA (R$)</label>
                  <input data-testid="campo-cpa" type="number" min="0" step="0.01" value={modal.cpaValue} onChange={(e) => setModal({ ...modal, cpaValue: e.target.value })} placeholder="0,00" className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">RevShare (%)</label>
                  <input data-testid="campo-revshare" type="number" min="0" step="0.1" value={modal.revPercentage} onChange={(e) => setModal({ ...modal, revPercentage: e.target.value })} placeholder="0" className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none" />
                </div>
                {!policy.showRatesToAffiliate && (
                  <p data-testid="aviso-taxas-ocultas" className="col-span-2 text-[11px] text-slate-500 dark:text-neutral-400 -mt-1">
                    Taxas do acordo: o afiliado não vê CPA nem RevShare neste tipo, o servidor remove os dois da resposta dele. Preencha o que a casa paga à agência.
                  </p>
                )}
                {shows('baseline') && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">{DEAL_KPI_LABEL.baseline} (R$)</label>
                    <input data-testid="campo-baseline" type="number" min="0" step="0.01" value={modal.baseline} onChange={(e) => setModal({ ...modal, baseline: e.target.value })} placeholder="0,00" className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none" />
                    <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1">Obrigatória para publicar na vitrine.</p>
                  </div>
                )}
                {shows('rollover') && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">{DEAL_KPI_LABEL.rollover} (x)</label>
                    <input data-testid="campo-rollover" type="number" min="0" step="0.1" value={modal.rollover} onChange={(e) => setModal({ ...modal, rollover: e.target.value })} placeholder="2" className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none" />
                    <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1">Multiplicador de rollover. 2 aparece como 2x no card.</p>
                  </div>
                )}
                {shows('ggr') && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">{DEAL_KPI_LABEL.ggr} (%)</label>
                    <input data-testid="campo-ggr" type="number" min="0" step="0.1" value={modal.ggrPercentage} onChange={(e) => setModal({ ...modal, ggrPercentage: e.target.value })} placeholder="opcional" className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none" />
                    <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1">Deixe vazio se a casa não tem GGR.</p>
                  </div>
                )}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">Moeda</label>
                  <select data-testid="campo-moeda" value={modal.currency} onChange={(e) => setModal({ ...modal, currency: e.target.value as DealCurrency })} className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none">
                    {DEAL_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {shows('geo') && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">{DEAL_KPI_LABEL.geo} / Geo</label>
                    <input data-testid="campo-geo" value={modal.geo} onChange={(e) => setModal({ ...modal, geo: e.target.value })} placeholder="Brasil" className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none" />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-neutral-300">
                <input type="checkbox" checked={modal.active} onChange={(e) => setModal({ ...modal, active: e.target.checked })} className="accent-accent-500 w-4 h-4" /> Acordo ativo (visível no marketplace)
              </label>
              <p className="text-[11px] text-slate-400 dark:text-neutral-500">Prévia do rótulo: <b className="text-slate-600 dark:text-neutral-300">{buildDealLabel({ operatorName: modal.operatorName, model: modal.model, cycle: modal.cycle, currency: modal.currency, geo: modal.geo }) || '—'}</b></p>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-bold text-slate-600 dark:text-neutral-300">Cancelar</button>
              <button onClick={saveDeal} disabled={saving || !modal.houseId} className="flex-1 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
