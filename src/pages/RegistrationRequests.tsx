import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Navigate, Link } from 'react-router-dom';
import {
  UserPlus, Loader2, Mail, Phone, AtSign, Archive, ArchiveRestore, Link2, Sparkles,
  AlertTriangle, Inbox, Check, Clock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  fetchRegistrationRequests,
  archiveRegistrationRequest,
  linkAffiliateUser,
  createBoostAffiliates,
  fetchAffiliates,
  saveAffiliateUpline,
  CaptureRequest,
} from '../services/affiliateService';
import { fetchShowcaseConfig } from '../services/showcaseService';
import { summarizeCapture } from '../lib/registrationRequests';
import { humanizeName, cn } from '../lib/utils';

// Solicitações de cadastro (ADMIN). Fecha o buraco entre "alguém pediu para
// entrar" e "a agência ficou sabendo": até aqui o auto-cadastro do /register
// criava um login SEM afiliado — a pessoa entrava no painel e não via nada — e
// ninguém era notificado; o lead do formulário público só existia no console do
// Firestore desde que a tela de Contatos saiu (B6).
//
// A fila tem TRÊS naturezas, e é isso que decide a ação disponível:
//   · signup   → JÁ tem login. Basta vincular a um afiliado (o login passa a valer).
//   · lead     → NÃO tem login. Resolve criando o afiliado + convite de acesso.
//   · referral → indicação de um GERENTE (especial, call 12/08). Resolve como o
//     lead E vincula o novo afiliado à rede de quem indicou (upline).
export default function RegistrationRequests() {
  const { profile } = useAuth();
  const { push } = useToast();
  const isAdmin = profile?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<CaptureRequest[]>([]);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [selfRegOpen, setSelfRegOpen] = useState<boolean | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Linha com o seletor de afiliado aberto (o select lista a base inteira, então
  // só a linha em edição o monta — mesma razão da /rede).
  const [linking, setLinking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const [reqs, affs] = await Promise.all([fetchRegistrationRequests(), fetchAffiliates()]);
    setRequests(reqs);
    setAffiliates(Array.isArray(affs) ? affs : []);
  };

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    Promise.all([
      load(),
      // A vitrine é a chave que ABRE o auto-cadastro. Se estiver desligada, a fila
      // não recebe gente nova — dizer isso evita o admin achar que "parou de vir".
      fetchShowcaseConfig().then((c) => setSelfRegOpen(!!c.enabled)).catch(() => setSelfRegOpen(null)),
    ])
      .catch((e: any) => push({ type: 'error', message: e?.message || 'Não foi possível carregar as solicitações.' }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const summary = useMemo(() => summarizeCapture(requests), [requests]);
  const visible = useMemo(
    () => requests.filter((r) => (showArchived ? r.status === 'archived' : r.status !== 'archived')),
    [requests, showArchived]
  );

  const affiliateOptions = useMemo(() => {
    const collator = new Intl.Collator('pt-BR');
    return affiliates
      .map((a) => ({ id: String(a?.id ?? a?._id ?? ''), name: humanizeName(a?.name || a?.label || '') }))
      .filter((a) => a.id)
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [affiliates]);

  const runAction = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      await load();
      push({ type: 'success', message: ok });
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Não foi possível concluir a ação.' });
    } finally {
      setBusy(null);
      setLinking(null);
    }
  };

  // Vincula o LOGIN existente ao afiliado escolhido — é o que tira a pessoa do
  // painel vazio. Só faz sentido p/ signup (lead não tem conta).
  const link = (r: CaptureRequest, affiliateId: string) =>
    runAction(`link:${r.id}`, () => linkAffiliateUser(r.email, affiliateId).then(() => {}),
      `Vínculo criado para ${r.name || r.email}.`);

  // Cria o afiliado nativo com o nome/e-mail que a pessoa informou. Para o LEAD e
  // a INDICAÇÃO já sai com convite (a pessoa precisa criar a senha); para o signup,
  // que já tem conta, vinculamos o login existente logo em seguida. Indicação ainda:
  // (1) vincula o novo afiliado à REDE de quem indicou (upline — é o ponto da
  // feature: o indicado entra na equipe do gerente) e (2) tira a indicação da fila
  // (diferente do lead, o doc não some sozinho ao virar afiliado).
  const approve = (r: CaptureRequest) =>
    runAction(`approve:${r.id}`, async () => {
      const [created] = await createBoostAffiliates(
        [{ name: r.name || r.email, email: r.email }],
        { generateInvite: r.kind !== 'signup' }
      );
      if (!created?.affiliateId) throw new Error('O servidor não devolveu o afiliado criado.');
      if (r.kind === 'signup') await linkAffiliateUser(r.email, created.affiliateId);
      if (r.kind === 'referral') {
        if (r.referrerAffiliateId) await saveAffiliateUpline(created.affiliateId, r.referrerAffiliateId);
        await archiveRegistrationRequest('referral', r.id, true);
      }
    },
    r.kind === 'referral'
      ? 'Afiliado criado, convite gerado e vinculado à rede do gerente.'
      : r.kind === 'lead' ? 'Afiliado criado e convite gerado.' : 'Afiliado criado e login vinculado.');

  const archive = (r: CaptureRequest, archived: boolean) =>
    runAction(`arch:${r.id}`, () => archiveRegistrationRequest(r.kind, r.id, archived),
      archived ? 'Solicitação arquivada.' : 'Solicitação devolvida à fila.');

  if (profile && !isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
            Captação
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
            <span className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20">
              <UserPlus size={24} className="text-accent-500" />
            </span>
            Solicitações de cadastro
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2 max-w-2xl">
            Quem pediu para entrar e ainda <strong>não é afiliado</strong>: tanto quem já criou login
            na sua página de cadastro quanto quem só deixou contato pelo formulário. Vincule a um
            afiliado existente, crie um novo, ou arquive.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="p-24 flex flex-col items-center justify-center gap-4">
          <Loader2 size={40} className="text-accent-500 animate-spin" />
          <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest animate-pulse">Carregando solicitações...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {[
              { key: 'fila', label: 'Na fila', value: String(summary.pending), hint: 'aguardando decisão' },
              { key: 'login', label: 'Já com login', value: String(summary.signups), hint: 'basta vincular a um afiliado' },
              { key: 'lead', label: 'Só contato', value: String(summary.leads), hint: 'resolve com afiliado + convite' },
              { key: 'indicacoes', label: 'Indicações', value: String(summary.referrals), hint: 'de gerentes (convite + rede)' },
              { key: 'arquivadas', label: 'Arquivadas', value: String(summary.archived), hint: 'fora da fila, nada apagado' },
            ].map((c, idx) => (
              <motion.div
                key={c.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="p-6 rounded-2xl border bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800 shadow-sm"
              >
                <p className="text-[10px] uppercase font-bold tracking-widest mb-1.5 text-slate-400 dark:text-neutral-500">{c.label}</p>
                <h3 data-testid={`resumo-${c.key}`} className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{c.value}</h3>
                <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-1">{c.hint}</p>
              </motion.div>
            ))}
          </div>

          {/* Estado da chave que ABRE o auto-cadastro. Sem isto, uma fila parada
              parece falta de demanda quando na verdade a porta está fechada. */}
          {selfRegOpen === false && (
            <div className="p-4 rounded-2xl border border-amber-300/60 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 text-[12px] text-amber-900/80 dark:text-amber-200/80 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                O <strong>auto-cadastro está desligado</strong>: sua página de cadastro só aceita quem recebe
                convite, e a vitrine da AffiliaCore não exibe a agência. Nenhuma solicitação nova vai chegar
                por aqui enquanto a chave estiver fechada. Ligue em{' '}
                <Link to="/settings" className="underline decoration-dotted underline-offset-2 font-bold">Configurações</Link>.
                O formulário público de contato continua funcionando normalmente.
              </span>
            </div>
          )}

          {/* Origem da fila: é a medida do canal — a pergunta que a vitrine existe
              p/ responder ("a AffiliaCore te manda afiliados"). */}
          {summary.bySource.length > 0 && (
            <section className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mr-1">Vieram de</span>
              {summary.bySource.map((s) => (
                <span
                  key={s.source || '__direto__'}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 text-[11px] font-bold text-slate-600 dark:text-neutral-300"
                >
                  {s.label}
                  <span className="font-medium text-slate-400 dark:text-neutral-500">· {s.count}</span>
                </span>
              ))}
            </section>
          )}

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
              {showArchived ? 'Arquivadas' : 'Na fila'}
            </h2>
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200 underline decoration-dotted underline-offset-2"
            >
              {showArchived ? 'ver a fila' : `ver arquivadas (${summary.archived})`}
            </button>
          </div>

          {visible.length === 0 ? (
            <div className="p-12 rounded-2xl border border-dashed border-slate-200 dark:border-neutral-800 flex flex-col items-center gap-3 text-center">
              <Inbox size={28} className="text-slate-300 dark:text-neutral-700" />
              <p className="text-sm font-bold text-slate-500 dark:text-neutral-400">
                {showArchived ? 'Nada arquivado por aqui.' : 'Nenhuma solicitação na fila.'}
              </p>
              {!showArchived && (
                <p className="text-xs text-slate-400 dark:text-neutral-500 max-w-sm">
                  Quando alguém se cadastrar na sua página ou preencher o formulário do site, aparece aqui.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((r) => (
                <motion.article
                  key={`${r.kind}:${r.id}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 rounded-2xl border bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800 shadow-sm"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <h3 className="font-bold text-slate-900 dark:text-white truncate">{r.name || '(sem nome)'}</h3>
                        <span className={cn(
                          'px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider',
                          r.kind === 'signup'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : r.kind === 'referral'
                              ? 'bg-accent-500/10 text-accent-600 dark:text-accent-400'
                              : 'bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400'
                        )}>
                          {r.kind === 'signup' ? 'já tem login' : r.kind === 'referral' ? 'indicação' : 'só contato'}
                        </span>
                        {r.kind === 'referral' && r.referrerName && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400">
                            indicado por {humanizeName(r.referrerName)}
                          </span>
                        )}
                        {r.experienced && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-accent-500/10 text-accent-600 dark:text-accent-400">
                            já foi afiliado
                          </span>
                        )}
                        {r.sourceLabel && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400">
                            {r.sourceLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500 dark:text-neutral-400">
                        {r.email && <span className="inline-flex items-center gap-1.5"><Mail size={12} /> {r.email}</span>}
                        {r.phone && <span className="inline-flex items-center gap-1.5"><Phone size={12} /> {r.phone}</span>}
                        {r.socialMedia && <span className="inline-flex items-center gap-1.5"><AtSign size={12} /> {r.socialMedia}</span>}
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={12} /> {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : 'data não registrada'}
                        </span>
                      </div>
                      {r.presentation && (
                        <p className="mt-2 text-[12px] text-slate-600 dark:text-neutral-300 bg-slate-50 dark:bg-neutral-800/40 rounded-xl p-3 whitespace-pre-wrap">
                          {r.presentation}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end shrink-0">
                      {r.status === 'archived' ? (
                        <button
                          type="button"
                          disabled={busy === `arch:${r.id}`}
                          onClick={() => archive(r, false)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-[11px] font-bold text-slate-600 dark:text-neutral-300 hover:border-slate-300 dark:hover:border-neutral-600 transition-all disabled:opacity-50"
                        >
                          <ArchiveRestore size={13} /> Devolver à fila
                        </button>
                      ) : (
                        <>
                          {/* Só o signup tem conta para vincular; o lead precisa
                              primeiro existir como afiliado (e receber convite). */}
                          {r.kind === 'signup' && (
                            linking === r.id ? (
                              <select
                                autoFocus
                                aria-label={`Vincular ${r.name || r.email} a um afiliado`}
                                defaultValue=""
                                disabled={busy === `link:${r.id}`}
                                onChange={(e) => e.target.value && link(r, e.target.value)}
                                onBlur={() => setLinking(null)}
                                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[12px] font-semibold text-slate-700 dark:text-neutral-200 max-w-[16rem]"
                              >
                                <option value="">— escolha o afiliado —</option>
                                {affiliateOptions.map((a) => (
                                  <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setLinking(r.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-[11px] font-bold text-slate-600 dark:text-neutral-300 hover:border-accent-500/40 transition-all"
                              >
                                <Link2 size={13} /> Vincular a um afiliado
                              </button>
                            )
                          )}
                          <button
                            type="button"
                            disabled={busy === `approve:${r.id}` || !r.email}
                            title={r.email ? undefined : 'Sem e-mail não dá para criar o afiliado nem convidar.'}
                            onClick={() => approve(r)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent-500 text-accent-contrast text-[11px] font-bold hover:opacity-90 transition-all disabled:opacity-50"
                          >
                            {busy === `approve:${r.id}`
                              ? <Loader2 size={13} className="animate-spin" />
                              : r.kind === 'signup' ? <Check size={13} /> : <Sparkles size={13} />}
                            {r.kind === 'referral'
                              ? 'Aprovar indicação'
                              : r.kind === 'lead' ? 'Criar afiliado + convite' : 'Criar afiliado e vincular'}
                          </button>
                          <button
                            type="button"
                            disabled={busy === `arch:${r.id}`}
                            onClick={() => archive(r, true)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-[11px] font-bold text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 transition-all disabled:opacity-50"
                          >
                            <Archive size={13} /> Arquivar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
