import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { ShieldCheck, AlertCircle, KeyRound } from 'lucide-react';
import { auth } from '../lib/firebase';
import { verifyTotpCode } from '../lib/authSecurity';
import { useAuth } from '../contexts/AuthContext';
import InstanceLogo from './InstanceLogo';

// Segundo fator do LOGIN. Fica no ProtectedRoute (não no Login) de propósito: a
// sessão pendente sobrevive a um F5, e assim existe UM só caminho que a resolve —
// recarregar a página cai aqui de novo em vez de entregar o painel pela metade.
export default function TwoFactorChallenge() {
  const { refreshMfa } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [useBackup, setUseBackup] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await verifyTotpCode(code.trim());
      // O servidor aceitou, mas quem libera a tela é a claim no token seguinte. Se ela
      // ainda não veio, diga — em silêncio o formulário só "pisca" e o usuário fica
      // preso achando que digitou errado (o código já foi consumido, então é o próximo).
      if (!(await refreshMfa())) {
        setError('Código aceito, mas a sessão ainda não liberou. Aguarde o próximo código e tente novamente.');
        setCode('');
      }
    } catch (err: any) {
      setError(err?.message || 'Código inválido. Tente novamente.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const ready = useBackup ? code.trim().length >= 10 : code.length === 6;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900/60 p-8 md:p-10 rounded-3xl shadow-xl shadow-slate-900/5 dark:shadow-black/30 border border-slate-200/70 dark:border-neutral-800">
        <div className="text-center mb-8">
          <InstanceLogo className="h-7 w-auto mx-auto mb-4" />
          <p className="text-slate-400 dark:text-neutral-500 text-[10px] font-bold uppercase tracking-widest">
            Verificação em duas etapas
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/40 flex items-center gap-2 text-[11px] font-bold">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 bg-slate-50 dark:bg-neutral-800/50 rounded-2xl border border-slate-100 dark:border-neutral-800">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              {useBackup ? <KeyRound size={16} /> : <ShieldCheck size={16} />}
              {useBackup ? 'Código de backup' : 'Código do autenticador'}
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-2">
              {useBackup
                ? 'Digite um dos códigos de backup que você guardou ao ativar o 2FA. Cada um funciona uma única vez.'
                : 'Abra seu app autenticador e digite o código de 6 dígitos para concluir o login.'}
            </p>
          </div>

          <div className="relative">
            <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
            <input
              type="text"
              autoFocus
              autoComplete="one-time-code"
              inputMode={useBackup ? 'text' : 'numeric'}
              aria-label={useBackup ? 'Código de backup' : 'Código do autenticador'}
              value={code}
              onChange={(e) =>
                setCode(useBackup ? e.target.value.toUpperCase().slice(0, 11) : e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              required
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-auth-cta/20 focus:border-auth-cta transition-all outline-none"
              placeholder={useBackup ? 'XXXXX-XXXXX' : '000000'}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !ready}
            className="w-full py-4 rounded-2xl font-bold mt-4 flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-auth-cta text-auth-cta-text hover:bg-auth-cta-hover shadow-lg shadow-auth-cta/20 dark:bg-lp-cta dark:text-lp-cta-text dark:hover:bg-lp-cta-hover dark:shadow-lp-cta/10"
          >
            {loading ? 'Validando...' : 'Confirmar código'}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-2 text-center">
          <button
            type="button"
            onClick={() => { setUseBackup((v) => !v); setCode(''); setError(''); }}
            className="text-[11px] font-bold text-auth-cta dark:text-lp-cta hover:underline"
          >
            {useBackup ? 'Usar o código do autenticador' : 'Perdi o celular — usar código de backup'}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-[11px] font-bold text-slate-400 dark:text-neutral-500 hover:underline"
          >
            Sair e voltar ao login
          </button>
        </div>
      </div>
    </div>
  );
}
