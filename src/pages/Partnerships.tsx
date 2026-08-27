import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Handshake, Loader2, Search, CheckCircle, Clock, XCircle, Ban, Copy, Check, ExternalLink, Link2 } from 'lucide-react';
import {
  fetchDeals, fetchPartnerships, requestPartnership, fetchAffiliateLinks,
  buildDealLabel, selectAvailableDeals, partnershipStatusLabel,
  buildGoUrl, DEAL_MODEL_LABEL,
  type Deal, type PartnershipRequest, type AffiliateLink,
} from '../services/affiliateService';
import { fetchHouses } from '../services/houseService';
import { useToast } from '../contexts/ToastContext';
import { houseLogoOrPreset } from '../lib/housePresets';
import {
  dealKpiChips, dealRequestHint, resolvePartnershipPricedBy, partnershipNote,
  selectOwnPartnerships,
} from '../lib/dealShowcase';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

type Tab = 'available' | 'mine';

const STATUS_STYLE: Record<string, { icon: any; cls: string }> = {
  approved: { icon: CheckCircle, cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/70 dark:border-emerald-900/40' },
  requested: { icon: Clock, cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border-amber-200/70 dark:border-amber-900/40' },
  // `priced` é o estado do meio do acordo gerenciado: o gerente já definiu a
  // comissão e a agência ainda vai emitir o link. Cor própria para não se confundir
  // com "solicitada" (onde a vez ainda é do gerente).
  priced: { icon: Link2, cls: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 border-sky-200/70 dark:border-sky-900/40' },
  rejected: { icon: XCircle, cls: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200/70 dark:border-red-900/40' },
  discontinued: { icon: Ban, cls: 'text-slate-500 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-800/60 border-slate-200 dark:border-neutral-700' },
};

export default function Partnerships() {
  const { push } = useToast();
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('available');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [allRequests, setAllRequests] = useState<PartnershipRequest[]>([]);
  const [links, setLinks] = useState<Record<string, AffiliateLink>>({});
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [d, r, allLinks, houses] = await Promise.all([fetchDeals(), fetchPartnerships(), fetchAffiliateLinks(), fetchHouses().catch(() => [])]);
      setDeals(d);
      setAllRequests(r);
      const lmap: Record<string, AffiliateLink> = {};
      allLinks.forEach((l) => { lmap[l.code] = l; });
      setLinks(lmap);
      const map: Record<string, string | null> = {};
      (houses as any[]).forEach((h) => {
        map[String(h.id)] = houseLogoOrPreset(h.logo, h.slug, h.id, h.name);
      });
      setLogos(map);
    } catch {
      push({ type: 'error', message: 'Erro ao carregar as parcerias.' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Esta tela é a vitrine DO AFILIADO, então tudo aqui sai das parcerias DELE. O
  // servidor manda a rede inteira quando quem pede é um gerente (é o que a fila
  // dele e o /acordos consomem); usar a lista crua aqui misturava a solicitação do
  // sub com a dele E escondia das ofertas a casa que o sub já tinha pedido.
  const requests = useMemo(
    () => selectOwnPartnerships(allRequests, profile?.affiliateId),
    [allRequests, profile?.affiliateId]
  );

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return selectAvailableDeals(deals, requests)
      .filter((d) => !q || d.operatorName.toLowerCase().includes(q) || (d.geo || '').toLowerCase().includes(q))
      .sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'pt-BR'));
  }, [deals, requests, search]);

  // O deal da solicitação resolve o tipo (e, por tabela, quem precifica) quando o
  // servidor ainda não manda `pricedBy` na request.
  const dealsById = useMemo(() => {
    const map: Record<string, Deal> = {};
    deals.forEach((d) => { map[String(d.id)] = d; });
    return map;
  }, [deals]);

  const handleRequest = async (deal: Deal) => {
    setBusy(deal.id);
    try {
      await requestPartnership(deal.id);
      push({ type: 'success', message: `Parceria com ${deal.operatorName} solicitada.` });
      await load();
      setTab('mine');
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao solicitar parceria.' });
    } finally {
      setBusy(null);
    }
  };

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(buildGoUrl(code));
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const OperatorAvatar = ({ houseId, name }: { houseId?: string | null; name: string }) => {
    const logo = houseId ? logos[String(houseId)] : null;
    return logo ? (
      <img src={logo} alt={name} className="w-11 h-11 rounded-xl object-contain bg-slate-50 dark:bg-neutral-800 p-1 border border-slate-100 dark:border-neutral-700" />
    ) : (
      <div className="w-11 h-11 rounded-xl bg-accent-500/15 text-accent-500 flex items-center justify-center font-black text-lg">
        {(name || '?').charAt(0).toUpperCase()}
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-16">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent-500">Crescimento</span>
        <div className="flex items-center gap-3 mt-1">
          <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
            <Handshake size={24} className="text-slate-900 dark:text-white" />
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">Parcerias</h1>
        </div>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">Explore operadoras e solicite parcerias para começar a divulgar e ganhar comissões.</p>
      </motion.header>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-neutral-800/60 rounded-2xl w-fit">
        {([['available', 'Ofertas disponíveis'], ['mine', `Minhas solicitações${requests.length ? ` (${requests.length})` : ''}`]] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn('px-4 py-2 rounded-xl text-xs font-bold transition-all',
              tab === t ? 'bg-white dark:bg-neutral-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-neutral-200')}
          >
            {label}
          </button>
        ))}
      </motion.div>

      {loading ? (
        <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-accent-500" size={40} /></div>
      ) : tab === 'available' ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar operadora ou mercado..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-full text-xs outline-none focus:ring-2 focus:ring-accent-500/30 dark:text-white"
            />
          </div>
          {available.length === 0 ? (
            <div className="p-16 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
              <Handshake className="mx-auto text-slate-300 dark:text-neutral-600 mb-3" size={40} />
              <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100">Nenhuma oferta disponível</h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">Você já solicitou os acordos ativos, ou ainda não há ofertas cadastradas.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {available.map((deal) => {
                // Os KPIs saem da POLÍTICA do deal, nunca de uma lista fixa aqui: num
                // acordo que esconde as taxas o servidor REMOVE cpaValue/revPercentage
                // da resposta, então a tela só desenha o que de fato recebeu.
                const chips = dealKpiChips(deal);
                const hint = dealRequestHint(deal);
                return (
                  <div key={deal.id} data-testid={`oferta-${deal.id}`} className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl p-5 flex flex-col gap-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <OperatorAvatar houseId={deal.houseId} name={deal.operatorName} />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-900 dark:text-white truncate">{deal.operatorName}</h3>
                        <p className="text-[11px] text-slate-400 dark:text-neutral-500 truncate">{buildDealLabel(deal)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-accent-500/15 text-accent-500 uppercase tracking-wide">{DEAL_MODEL_LABEL[deal.model]}</span>
                      {chips.map((chip) => (
                        <span key={chip.id} data-testid={`kpi-${chip.id}`} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">
                          {chip.label} {chip.value}
                        </span>
                      ))}
                    </div>
                    {hint && <p className="text-[11px] text-slate-500 dark:text-neutral-400 -mt-1">{hint}</p>}
                    <button
                      onClick={() => handleRequest(deal)}
                      disabled={busy === deal.id}
                      className="mt-auto w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {busy === deal.id ? <Loader2 size={14} className="animate-spin" /> : <Handshake size={14} />}
                      Solicitar parceria
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {requests.length === 0 ? (
            <div className="p-16 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
              <Clock className="mx-auto text-slate-300 dark:text-neutral-600 mb-3" size={40} />
              <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100">Nenhuma solicitação ainda</h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">Solicite uma oferta na aba "Ofertas disponíveis" para começar.</p>
            </div>
          ) : (
            requests.map((r) => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.requested;
              const Icon = st.icon;
              // Quem precifica vem do servidor quando ele manda; senão, da política do
              // deal. É o que separa "Aguardando seu gerente" de "Em análise".
              const pricedBy = resolvePartnershipPricedBy(r, dealsById[String(r.dealId)]);
              // Só oferece o link quando ele de fato resolve (a casa tem URL de
              // cadastro); senão o /go cairia no fallback. Mesma regra do /meus-links,
              // e é o que decide entre "copie o link" e "link em preparação".
              const link = r.code ? links[r.code] : undefined;
              const linkReady = !!(link && link.active !== false && link.registerUrl);
              return (
                <div key={r.id} data-testid={`solicitacao-${r.id}`} className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <OperatorAvatar houseId={r.houseId} name={r.operatorName || ''} />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-900 dark:text-white truncate">{r.operatorName || 'Operadora'}</h3>
                      <p className="text-[11px] text-slate-400 dark:text-neutral-500 truncate">{r.dealLabel}</p>
                    </div>
                    <span className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border', st.cls)}>
                      <Icon size={13} /> {partnershipStatusLabel(r.status, 'affiliate', pricedBy)}
                    </span>
                  </div>
                  <p data-testid={`recado-${r.id}`} className="mt-3 text-[11px] text-slate-500 dark:text-neutral-400">{partnershipNote(r.status, pricedBy, linkReady)}</p>
                  {r.status === 'approved' && r.code && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-neutral-800">
                      <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">Link de divulgação</label>
                      {linkReady ? (
                        <div className="flex items-center gap-2 mt-1.5">
                          <code className="flex-1 px-3 py-2 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs text-slate-700 dark:text-neutral-200 truncate">{buildGoUrl(r.code!)}</code>
                          <button onClick={() => copyLink(r.code!)} className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold hover:opacity-90 flex items-center gap-1.5">
                            {copied === r.code ? <Check size={14} /> : <Copy size={14} />} {copied === r.code ? 'Copiado' : 'Copiar'}
                          </button>
                          <a href={buildGoUrl(r.code!)} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-500 hover:text-accent-500"><ExternalLink size={14} /></a>
                        </div>
                      ) : (
                        <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">Link em preparação: a casa ainda não tem URL de cadastro configurada. Fale com o administrador.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </motion.div>
      )}
    </div>
  );
}
