import { useEffect, useState } from 'react';
import { Scale, Loader2, CheckCircle, FileText } from 'lucide-react';
import {
  fetchLegalDocuments, fetchMyLegalAcceptances, acceptLegalDocument, hasAcceptedLatest,
  type LegalDocument, type LegalAcceptance,
} from '../services/affiliateService';
import { useToast } from '../contexts/ToastContext';

// Modo SOFT (Tier 1): visualização + registro de aceite, mas NADA aqui bloqueia
// login/uso — ver PLANO-INTEGRACAO-AFFILITY.md. Qualquer papel logado pode ver.
export default function Terms() {
  const { push } = useToast();
  const [docs, setDocs] = useState<LegalDocument[]>([]);
  const [acceptances, setAcceptances] = useState<LegalAcceptance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [d, a] = await Promise.all([fetchLegalDocuments(), fetchMyLegalAcceptances()]);
      setDocs(d);
      setAcceptances(a);
    } catch {
      push({ type: 'error', message: 'Erro ao carregar os documentos.' });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const acceptanceFor = (slug: string) => acceptances.find((a) => a.slug === slug) || null;

  const handleAccept = async (doc: LegalDocument) => {
    setBusy(doc.slug);
    try {
      await acceptLegalDocument(doc.slug);
      push({ type: 'success', message: `"${doc.title}" aceito.` });
      await load();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao registrar o aceite.' });
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-8 pb-16">
      <header>
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent-500">Conta</span>
        <div className="flex items-center gap-3 mt-1">
          <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
            <Scale size={24} className="text-slate-900 dark:text-white" />
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">Termos</h1>
        </div>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">Acordo de Afiliação, Código de Conduta e demais documentos da parceria.</p>
      </header>

      {loading ? (
        <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-accent-500" size={40} /></div>
      ) : docs.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
          <FileText className="mx-auto text-slate-300 dark:text-neutral-600 mb-3" size={40} />
          <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100">Nenhum documento publicado ainda</h3>
        </div>
      ) : (
        <div className="space-y-4">
          {docs.map((doc) => {
            const accepted = hasAcceptedLatest(acceptanceFor(doc.slug), doc);
            return (
              <div key={doc.id} className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-lg text-slate-900 dark:text-white">{doc.title}</h2>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 font-mono">v{doc.version}</span>
                  </div>
                  {accepted ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-900/40">
                      <CheckCircle size={13} /> Aceito
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAccept(doc)}
                      disabled={busy === doc.slug}
                      className="px-4 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {busy === doc.slug ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />} Aceitar
                    </button>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-neutral-800 text-sm text-slate-600 dark:text-neutral-300 whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {doc.content}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
