import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Network, Loader2, Plus, X, Check, AlertTriangle, ExternalLink, RefreshCw, Building2,
} from 'lucide-react';
import { fetchFomentoOffers, type FomentoOfferSummary } from '../services/fomentoService';
import { createHouse } from '../services/houseService';
import {
  draftHouseFromOffer, isOrphanWithTraffic, isUsableLinkTemplate,
} from '../lib/fomentoOffers';
import { findHousePresetFor, housePresetIconPath } from '../lib/housePresets';
import { pluralize } from '../lib/plural';
import { useToast } from '../contexts/ToastContext';
import { cn } from '../lib/utils';

// Tela /fomento — a fila de ativação de casas da rede Offer18.
//
// Substitui um ritual que foi feito à mão três vezes (BetFury 26/08, Cristal
// Poker 27/08, Ivibet 28/08): achar a oferta e o CPA no ledger, criar a casa no
// shape certo e conferir que o offer_id não é de outra casa. A criação NÃO ganha
// caminho de escrita novo: o botão chama o mesmo `POST /api/houses` do modal de
// /casas, que já cria o rascunho de acordo, grava a auditoria e recusa offer_id
// duplicado (409).
//
// O NOME é o único campo que o ledger não sabe — a rede não o manda no postback.
// O admin digita, e o ícone resolve sozinho quando o nome bate com uma casa do
// catálogo de presets (as licenciadas no Brasil); as demais seguem sem ícone até
// alguém subir a logo em /casas, como sempre foi.

const fmtDay = (d: string) => (d ? d.split('-').reverse().join('/') : '—');

export default function FomentoOffers() {
  const { push } = useToast();
  const [offers, setOffers] = useState<FomentoOfferSummary[]>([]);
  const [linkTemplate, setLinkTemplate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<FomentoOfferSummary | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { offers: list, linkTemplate: t } = await fetchFomentoOffers();
      setOffers(list);
      setLinkTemplate(t);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar as ofertas.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const semCasa = useMemo(() => offers.filter((o) => !o.houseSlug), [offers]);
  const comCasa = useMemo(() => offers.filter((o) => o.houseSlug), [offers]);
  const orfasComTrafego = useMemo(() => semCasa.filter(isOrphanWithTraffic), [semCasa]);

  return (
    <div className="space-y-8 pb-16">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent-500">Casas</span>
          <div className="flex items-center gap-3 mt-1">
            <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
              <Network size={24} className="text-slate-900 dark:text-white" />
            </span>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">Fomento</h1>
          </div>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2 max-w-2xl">
            As ofertas da rede que já dispararam nesta instância. Uma oferta aparece aqui assim que o primeiro evento chega, que é justamente quando a casa precisa existir.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-neutral-700 rounded-full text-xs font-bold text-slate-600 dark:text-neutral-300 hover:opacity-90 disabled:opacity-50 shrink-0">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </motion.header>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {/* O alerta que a tela existe para dar: conversão real numa oferta sem casa
          fica retida no ledger, fora da /casas e fora do lucro, até alguém ligar. */}
      {!loading && orfasComTrafego.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-5 rounded-3xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <b>{pluralize(orfasComTrafego.length, 'oferta')} com conversão e sem casa.</b>{' '}
            O resultado fica retido no ledger e não entra em nenhum relatório enquanto a casa não existir. Depois de criar, use "Atualizar" no card da casa em Casas para trazer os dias anteriores.
          </div>
        </motion.div>
      )}

      {loading ? (
        <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-accent-500" size={40} /></div>
      ) : offers.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-16 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
          <Network className="mx-auto text-slate-300 dark:text-neutral-600 mb-3" size={40} />
          <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100">Nenhum disparo recebido ainda</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 max-w-md mx-auto">
            Cole a URL de postback desta instância no painel da Fomento (Offers, postagem global) e use o "teste de postagem" da oferta. Ela aparece aqui em seguida, já com o CPA que a rede informou.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-8">
          <Secao
            titulo="Sem casa"
            vazio="Toda oferta que disparou já tem casa."
            offers={semCasa}
            onCriar={setModal}
          />
          <Secao titulo="Já vinculadas" vazio="Nenhuma ainda." offers={comCasa} />
        </div>
      )}

      {modal && (
        <CriarCasaModal
          offer={modal}
          linkTemplate={linkTemplate}
          onClose={() => setModal(null)}
          onCriada={async (nome) => {
            push({ type: 'success', message: `Casa "${nome}" criada. Preencha o acordo em Acordos para ela aparecer na vitrine.` });
            setModal(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Secao({ titulo, vazio, offers, onCriar }: {
  titulo: string; vazio: string; offers: FomentoOfferSummary[];
  onCriar?: (o: FomentoOfferSummary) => void;
}) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
        {titulo} <span className="text-slate-300 dark:text-neutral-600">({offers.length})</span>
      </h2>
      {offers.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-neutral-500 px-1">{vazio}</p>
      ) : offers.map((o) => <OfferCard key={o.offerId} offer={o} onCriar={onCriar} />)}
    </motion.section>
  );
}

function OfferCard({ offer: o, onCriar }: { offer: FomentoOfferSummary; onCriar?: (o: FomentoOfferSummary) => void }) {
  const orfa = isOrphanWithTraffic(o);
  return (
    <div className={cn(
      'bg-white dark:bg-neutral-900/60 border rounded-3xl p-5 shadow-sm',
      orfa ? 'border-amber-300 dark:border-amber-700' : 'border-slate-200/70 dark:border-neutral-800',
    )}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">{o.offerId}</span>
            {o.houseSlug ? (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Building2 size={11} /> {o.houseName || o.houseSlug}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400">Sem casa</span>
            )}
            {o.cpaHint != null && (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 font-mono">
                {o.cpaHint} {o.currency}
              </span>
            )}
            {o.cpaConflict && (
              <span title="A rede informou mais de um payout de ftd nesta oferta. Confira no painel antes de gravar." className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                CPA divergente
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-2">
            {o.events > 0
              ? <>{pluralize(o.ftd, 'FTD')} · {pluralize(o.lead, 'cadastro')}{o.unknown > 0 && <> · {pluralize(o.unknown, 'evento')} de token desconhecido</>}</>
              : <span className="text-slate-400 dark:text-neutral-500">Só disparo de teste, nenhuma conversão</span>}
            {o.tests > 0 && <span className="text-slate-400 dark:text-neutral-500"> · {pluralize(o.tests, 'teste')} do painel</span>}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-1">
            {o.firstDay === o.lastDay ? fmtDay(o.lastDay) : <>{fmtDay(o.firstDay)} a {fmtDay(o.lastDay)}</>}
            {o.tags.length > 0 && <> · {pluralize(o.tags.length, 'tag')}</>}
            {o.unattributedTags.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {' '}({o.unattributedTags.length} sem dono: {o.unattributedTags.slice(0, 3).join(', ')}{o.unattributedTags.length > 3 ? '…' : ''})
              </span>
            )}
          </p>
        </div>
        {onCriar && (
          <button onClick={() => onCriar(o)} className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:opacity-90 shrink-0">
            <Plus size={14} /> Criar casa
          </button>
        )}
      </div>
    </div>
  );
}

function CriarCasaModal({ offer: o, linkTemplate, onClose, onCriada }: {
  offer: FomentoOfferSummary;
  linkTemplate: string | null;
  onClose: () => void;
  onCriada: (nome: string) => void | Promise<void>;
}) {
  const { push } = useToast();
  const [name, setName] = useState('');
  const [cpa, setCpa] = useState(o.cpaHint != null ? String(o.cpaHint) : '');
  const [template, setTemplate] = useState(linkTemplate ?? '');
  const [saving, setSaving] = useState(false);

  // O ícone vem do catálogo assim que o nome digitado casa com uma casa conhecida
  // — o mesmo `findHousePresetFor` que a /casas usa, então o que a prévia mostra
  // é o que a lista vai mostrar.
  const preset = useMemo(() => (name.trim() ? findHousePresetFor(name) : null), [name]);
  const templateOk = isUsableLinkTemplate(template);

  const salvar = async () => {
    setSaving(true);
    try {
      const draft = draftHouseFromOffer(o, template);
      await createHouse({
        ...draft,
        name: name.trim(),
        defaultCpa: cpa.trim() === '' ? null : Number(cpa),
        cpaCurrency: draft.cpaCurrency as any,
        active: true,
      });
      await onCriada(name.trim());
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao criar a casa.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-200 dark:border-neutral-800 w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Criar casa da oferta {o.offerId}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">Nome da casa</label>
            <div className="flex items-center gap-2 mt-1">
              {preset && <img src={housePresetIconPath(preset)} alt="" className="w-9 h-9 rounded-xl shrink-0" />}
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ivibet" className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none" />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-1.5">
              {preset
                ? <>Ícone do catálogo aplicado: <b>{preset.name}</b>.</>
                : 'A rede não manda o nome da oferta no postback, então ele vem de você. Sem ícone no catálogo: dá para subir a logo depois em Casas.'}
            </p>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">CPA da oferta ({o.currency})</label>
            <input value={cpa} onChange={(e) => setCpa(e.target.value)} inputMode="decimal" placeholder="30" className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none font-mono" />
            <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-1.5">
              {o.cpaHint != null
                ? <>Sugerido pelo payout que a rede mandou no evento de FTD. {o.cpaConflict && <b className="text-amber-600 dark:text-amber-400">A oferta trouxe mais de um valor: confira no painel.</b>}</>
                : 'A rede ainda não informou payout de FTD nesta oferta. Pegue o CPA no painel.'}
            </p>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">Link de cadastro</label>
            <input value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="https://....o18.link/c?o=<OFFER_ID>&m=...&a=...&sub_aff_id={ref}" className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs dark:text-white outline-none font-mono" />
            <p className={cn('text-[11px] mt-1.5', templateOk ? 'text-slate-400 dark:text-neutral-500' : 'text-amber-600 dark:text-amber-400')}>
              {templateOk
                ? (linkTemplate ? 'Copiado de outra casa desta rede: mesma conta, só a oferta muda.' : 'Pronto para gravar.')
                : 'Cole o link de rastreamento da oferta no painel da Fomento. Ele precisa da oferta e do sub_aff_id={ref}, que é o que atribui a conversão ao afiliado.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-bold text-slate-600 dark:text-neutral-300">Cancelar</button>
          <button onClick={salvar} disabled={saving || !name.trim() || !templateOk} className="flex-1 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Criar casa
          </button>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-3 flex items-start gap-1.5">
          <ExternalLink size={12} className="shrink-0 mt-0.5" />
          A casa nasce ativa, em {o.currency} com cotação do dia, e já com o rascunho de acordo. Os valores do acordo (CPA de repasse, baseline) você preenche em Acordos.
        </p>
      </div>
    </div>
  );
}
