import { useEffect, useState } from 'react';
import { Scale, Loader2, Plus, Pencil, Trash2, X, Check, Eye, EyeOff } from 'lucide-react';
import {
  fetchLegalDocuments, createLegalDocument, updateLegalDocument, deleteLegalDocument,
  type LegalDocument,
} from '../services/affiliateService';
import { useToast } from '../contexts/ToastContext';

type Draft = { id?: string; slug: string; title: string; content: string; active: boolean };
const emptyDraft = (): Draft => ({ slug: '', title: '', content: '', active: true });

export default function LegalAdmin() {
  const { push } = useToast();
  const [docs, setDocs] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setDocs(await fetchLegalDocuments()); }
    catch { push({ type: 'error', message: 'Erro ao carregar documentos.' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      if (modal.id) await updateLegalDocument(modal.id, { title: modal.title, content: modal.content, active: modal.active });
      else await createLegalDocument({ slug: modal.slug, title: modal.title, content: modal.content, active: modal.active });
      push({ type: 'success', message: modal.id ? 'Documento atualizado.' : 'Documento criado.' });
      setModal(null);
      await load();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao salvar documento.' });
    } finally { setSaving(false); }
  };

  const toggleActive = async (d: LegalDocument) => {
    setBusy(d.id);
    try { await updateLegalDocument(d.id, { active: !d.active }); await load(); }
    catch (e: any) { push({ type: 'error', message: e?.message || 'Erro ao alterar.' }); }
    finally { setBusy(null); }
  };

  const remove = async (d: LegalDocument) => {
    setBusy(d.id);
    try { await deleteLegalDocument(d.id); push({ type: 'success', message: 'Documento removido.' }); await load(); }
    catch (e: any) { push({ type: 'error', message: e?.message || 'Erro ao remover.' }); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-8 pb-16">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent-500">Conta</span>
          <div className="flex items-center gap-3 mt-1">
            <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
              <Scale size={24} className="text-slate-900 dark:text-white" />
            </span>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">Jurídico</h1>
          </div>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2 max-w-2xl">
            Acordo de Afiliação, Código de Conduta e demais documentos que os afiliados veem em "Termos". <b>Revise com um advogado antes de publicar</b> — o conteúdo aqui é o que fica visível/aceitável, mas não é assessoria jurídica.
          </p>
        </div>
        <button onClick={() => setModal(emptyDraft())} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:opacity-90 shadow-sm shrink-0">
          <Plus size={15} /> Novo documento
        </button>
      </header>

      {loading ? (
        <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-accent-500" size={40} /></div>
      ) : docs.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
          <Scale className="mx-auto text-slate-300 dark:text-neutral-600 mb-3" size={40} />
          <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100">Nenhum documento cadastrado</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">Crie o Acordo de Afiliação ou outro documento para os afiliados verem em "Termos".</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
            <div key={d.id} className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-900 dark:text-white">{d.title}</h3>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 font-mono">v{d.version}</span>
                    <span className={d.active ? 'px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400'}>
                      {d.active ? 'Publicado' : 'Rascunho'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-neutral-500 font-mono mt-1">slug: {d.slug}</p>
                  <p className="text-xs text-slate-500 dark:text-neutral-400 mt-2 line-clamp-2 whitespace-pre-wrap">{d.content}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setModal({ id: d.id, slug: d.slug, title: d.title, content: d.content, active: d.active })} title="Editar" className="p-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-500 hover:text-accent-500"><Pencil size={14} /></button>
                  <button onClick={() => toggleActive(d)} disabled={busy === d.id} title={d.active ? 'Despublicar' : 'Publicar'} className="p-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-500 hover:text-accent-500 disabled:opacity-50">
                    {busy === d.id ? <Loader2 size={14} className="animate-spin" /> : d.active ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => remove(d)} disabled={busy === d.id} title="Remover" className="p-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-500 hover:text-red-500 hover:border-red-300 disabled:opacity-50"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setModal(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-200 dark:border-neutral-800 w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{modal.id ? 'Editar documento' : 'Novo documento'}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              {!modal.id && (
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">Slug (identificador estável — não muda depois)</label>
                  <input value={modal.slug} onChange={(e) => setModal({ ...modal, slug: e.target.value })} placeholder="acordo-de-afiliacao" className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none font-mono" />
                </div>
              )}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">Título</label>
                <input value={modal.title} onChange={(e) => setModal({ ...modal, title: e.target.value })} placeholder="Acordo de Afiliação" className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest">Conteúdo (texto puro)</label>
                <textarea value={modal.content} onChange={(e) => setModal({ ...modal, content: e.target.value })} rows={10} placeholder="Texto do documento..." className="mt-1 w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white outline-none font-mono" />
                {modal.id && <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">Editar o conteúdo aumenta a versão — afiliados que já aceitaram precisam aceitar de novo.</p>}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-neutral-300">
                <input type="checkbox" checked={modal.active} onChange={(e) => setModal({ ...modal, active: e.target.checked })} className="accent-accent-500 w-4 h-4" /> Publicado (visível em "Termos" para os afiliados)
              </label>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-bold text-slate-600 dark:text-neutral-300">Cancelar</button>
              <button onClick={save} disabled={saving || !modal.title.trim() || !modal.content.trim() || (!modal.id && !modal.slug.trim())} className="flex-1 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
