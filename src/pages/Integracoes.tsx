import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Plug, Loader2, Save, Check, KeyRound, AlertCircle, Link2, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { fetchIntegrations, saveIntegration, type PublicIntegration } from '../services/integrationService';
import { fetchHouses, type House } from '../services/houseService';
import { cn } from '../lib/utils';

// B7 · Integrações. Antes, ligar/desligar uma integração ou trocar a chave exigia
// mexer em secret do Secret Manager + REDEPLOY (o conector lia process.env direto).
// Aqui a fonte passa a ser `integrations/{id}` no Firestore, com o env de fallback:
// o toggle vale na hora. A chave chega MASCARADA do servidor — o campo nasce vazio
// e só é enviado quando o admin digita algo (salvar sem digitar não apaga nada).

type Draft = { apiKey: string; houseId: string; config: Record<string, string> };

const draftFrom = (item: PublicIntegration): Draft => ({
  apiKey: '',
  houseId: item.houseId ?? '',
  config: Object.fromEntries(item.fields.map((f) => [f.key, item.config?.[f.key] ?? ''])),
});

export default function Integracoes() {
  const { profile } = useAuth();
  const { push } = useToast();
  const isAdmin = profile?.role === 'admin';

  const [items, setItems] = useState<PublicIntegration[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [list, hs] = await Promise.all([fetchIntegrations(), fetchHouses().catch(() => [] as House[])]);
      setItems(list);
      setHouses(hs);
      setDrafts(Object.fromEntries(list.map((i) => [i.id, draftFrom(i)])));
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar as integrações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const patchDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const applySaved = (saved: PublicIntegration) => {
    setItems((list) => list.map((i) => (i.id === saved.id ? saved : i)));
    // Zera só o campo de chave: o resto reflete o que o servidor devolveu.
    setDrafts((d) => ({ ...d, [saved.id]: draftFrom(saved) }));
  };

  // O toggle salva SOZINHO (é o ganho da feature: desligar sem redeploy e sem
  // depender de o admin lembrar de clicar em Salvar).
  const toggle = async (item: PublicIntegration) => {
    setSaving(item.id);
    try {
      const saved = await saveIntegration(item.id, { enabled: !item.enabled });
      applySaved(saved);
      push({ type: 'success', message: saved.enabled ? `${saved.label} ligada.` : `${saved.label} desligada.` });
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Falha ao alterar a integração.' });
    } finally {
      setSaving(null);
    }
  };

  const save = async (item: PublicIntegration) => {
    const draft = drafts[item.id];
    setSaving(item.id);
    try {
      const saved = await saveIntegration(item.id, {
        // Campo vazio = "não mexe na chave gravada" (o servidor também trava isso).
        ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
        houseId: draft.houseId || null,
        config: draft.config,
      });
      applySaved(saved);
      push({ type: 'success', message: 'Integração salva.' });
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Falha ao salvar a integração.' });
    } finally {
      setSaving(null);
    }
  };

  const removeKey = async (item: PublicIntegration) => {
    setSaving(item.id);
    try {
      const saved = await saveIntegration(item.id, { apiKey: null });
      applySaved(saved);
      push({ type: 'success', message: 'Chave removida.' });
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Falha ao remover a chave.' });
    } finally {
      setSaving(null);
    }
  };

  if (profile && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="p-4 rounded-2xl border border-slate-200/70 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900/60">
          <ShieldCheck size={40} className="text-slate-500 dark:text-neutral-300" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-white">Acesso Restrito</h2>
          <p className="text-slate-500 dark:text-neutral-400 text-sm">Esta página está disponível apenas para administradores.</p>
        </div>
      </div>
    );
  }

  const inputCls =
    'w-full px-4 py-3 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all outline-none';
  const labelCls = 'text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest ml-1 block mb-2';

  return (
    <div className="max-w-4xl space-y-8 pb-16">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent-500">Plataforma</span>
        <div className="flex items-center gap-3 mt-1">
          <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
            <Plug size={24} className="text-slate-900 dark:text-white" />
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">Integrações</h1>
        </div>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2 max-w-2xl">
          Conectores que puxam resultados direto da casa, sem planilha. Ligar, desligar ou trocar a chave
          vale na hora — não exige nova publicação do sistema.
        </p>
      </motion.header>

      {loading ? (
        <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-accent-500" size={40} /></div>
      ) : error ? (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      ) : items.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
          <Plug className="mx-auto text-slate-300 dark:text-neutral-600 mb-3" size={40} />
          <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100">Nenhuma integração disponível</h3>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="space-y-6">
          {items.map((item) => {
            const draft = drafts[item.id];
            const busy = saving === item.id;
            return (
              <section
                key={item.id}
                className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden"
              >
                <div className="p-5 border-b border-slate-100 dark:border-neutral-800 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60 shrink-0">
                      <Plug size={16} className="text-slate-900 dark:text-neutral-100" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm font-bold text-slate-800 dark:text-white tracking-tight">{item.label}</h2>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider',
                            item.configured
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                              : 'bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400',
                          )}
                        >
                          {item.configured ? 'Ativa' : item.enabled ? 'Sem chave' : 'Desligada'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.enabled}
                    aria-label={`${item.enabled ? 'Desligar' : 'Ligar'} ${item.label}`}
                    disabled={busy}
                    onClick={() => toggle(item)}
                    className={cn(
                      'relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50',
                      item.enabled ? 'bg-accent-500' : 'bg-slate-200 dark:bg-neutral-700',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all',
                        item.enabled ? 'left-6' : 'left-1',
                      )}
                    />
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  <div>
                    <label className={labelCls}>Chave da API</label>
                    <div className="relative">
                      <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" />
                      <input
                        type="password"
                        value={draft.apiKey}
                        onChange={(e) => patchDraft(item.id, { apiKey: e.target.value })}
                        placeholder={item.hasKey ? `Chave salva (${item.keyMask}) — digite para trocar` : 'Cole a chave fornecida pela casa'}
                        className={cn(inputCls, 'pl-9')}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
                      <p className="text-[11px] text-slate-400 dark:text-neutral-500">
                        {item.keyFromEnv
                          ? 'A chave em uso vem da configuração de ambiente da instância. Salvar uma aqui passa a valer no lugar dela.'
                          : 'A chave nunca é exibida de volta — salvar sem digitar mantém a atual.'}
                      </p>
                      {item.hasKey && !item.keyFromEnv && (
                        <button
                          type="button"
                          onClick={() => removeKey(item)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 size={12} /> Remover chave
                        </button>
                      )}
                    </div>
                  </div>

                  {item.scope === 'house' && (
                    <div>
                      <label className={labelCls}>Casa vinculada</label>
                      <div className="relative">
                        <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" />
                        <select
                          value={draft.houseId}
                          onChange={(e) => patchDraft(item.id, { houseId: e.target.value })}
                          className={cn(inputCls, 'pl-9')}
                        >
                          <option value="">— nenhuma —</option>
                          {houses.map((h) => (
                            <option key={h.slug ?? h.id} value={h.slug ?? h.id}>{h.name}</option>
                          ))}
                        </select>
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-2">
                        É a casa que recebe os resultados puxados — e a que ganha o botão "Atualizar" em Casas.
                      </p>
                    </div>
                  )}

                  {item.fields.map((f) => (
                    <div key={f.key}>
                      <label className={labelCls}>{f.label}</label>
                      <input
                        type={f.type === 'number' ? 'number' : 'text'}
                        value={draft.config[f.key] ?? ''}
                        onChange={(e) => patchDraft(item.id, { config: { ...draft.config, [f.key]: e.target.value } })}
                        placeholder={f.placeholder}
                        className={inputCls}
                      />
                      {f.hint && <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-2">{f.hint}</p>}
                    </div>
                  ))}

                  <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                    <p className="text-[11px] text-slate-400 dark:text-neutral-500">
                      {item.updatedAt ? `Atualizada em ${new Date(item.updatedAt).toLocaleString('pt-BR')}` : 'Nunca configurada por aqui.'}
                    </p>
                    <button
                      onClick={() => save(item)}
                      disabled={busy}
                      className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </motion.div>
      )}

      <p className="text-[11px] text-slate-400 dark:text-neutral-500 flex items-center gap-1.5 px-1">
        <Check size={12} /> As chaves ficam guardadas no servidor e nunca são enviadas de volta ao navegador.
      </p>
    </div>
  );
}
