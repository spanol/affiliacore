import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { ShieldCheck, ShieldAlert, QrCode, AlertCircle, CheckCircle, Smartphone } from 'lucide-react';
import { beginTotpEnrollment, confirmTotpEnrollment, disableTotpEnrollment, hasTotpEnabled, type TotpEnrollmentSetup } from '../lib/authSecurity';

export default function TwoFactorCard({ user }: { user: User | null }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [setup, setSetup] = useState<TotpEnrollmentSetup | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setEnabled(hasTotpEnabled(user));
  }, [user]);

  const handleStart = async () => {
    if (!user) return;
    setLoading(true);
    setMessage(null);
    try {
      const nextSetup = await beginTotpEnrollment(user);
      setSetup(nextSetup);
      setCode('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.code === 'auth/requires-recent-login' ? 'Saia e entre novamente antes de ativar o 2FA.' : 'Não foi possível iniciar a configuração do 2FA.' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!user || !setup) return;
    setLoading(true);
    setMessage(null);
    try {
      await confirmTotpEnrollment(user, setup, code.trim());
      setEnabled(true);
      setSetup(null);
      setCode('');
      setMessage({ type: 'success', text: '2FA ativado com sucesso.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.code === 'auth/invalid-verification-code' ? 'Código inválido. Confira o autenticador e tente novamente.' : 'Não foi possível confirmar o 2FA.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!user) return;
    setLoading(true);
    setMessage(null);
    try {
      await disableTotpEnrollment(user);
      setEnabled(false);
      setSetup(null);
      setCode('');
      setMessage({ type: 'success', text: '2FA removido da conta.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.code === 'auth/requires-recent-login' ? 'Saia e entre novamente antes de remover o 2FA.' : 'Não foi possível remover o 2FA.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900/60 p-6 rounded-3xl border border-slate-200/70 dark:border-neutral-800 shadow-sm space-y-6 hover:border-slate-300 dark:hover:border-neutral-700 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">Autenticação em dois fatores</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-2">Proteja seu acesso com código temporário do autenticador.</p>
        </div>
        {enabled ? <ShieldCheck className="text-emerald-500" size={20} /> : <ShieldAlert className="text-amber-500" size={20} />}
      </div>

      {message && (
        <div className={`p-4 rounded-2xl border flex items-center gap-2 text-[11px] font-bold ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40' : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-100 dark:border-red-900/40'}`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {setup ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <QrCode size={18} /> Escaneie o QR code
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-800/50 p-4 flex flex-col md:flex-row gap-4 items-center md:items-start">
            <img src={setup.qrCodeDataUrl} alt="QR code para 2FA" className="w-40 h-40 rounded-2xl bg-white p-3 border border-slate-200" />
            <div className="space-y-3 flex-1">
              <p className="text-xs text-slate-500 dark:text-neutral-400">Abra seu autenticador, escaneie o QR code e digite o código de {setup.codeLength} dígitos abaixo.</p>
              <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 p-3">
                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 dark:text-neutral-500 mb-1">Chave manual</p>
                <p className="text-xs font-mono break-all text-slate-900 dark:text-white">{setup.secretKey}</p>
              </div>
              <div className="relative max-w-xs">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-400" size={16} />
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, setup.codeLength))}
                  placeholder="000000"
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs dark:text-white focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={loading || code.length < setup.codeLength} onClick={handleConfirm} className="px-4 py-2 rounded-full text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-neutral-900 disabled:opacity-50">
                  Confirmar ativação
                </button>
                <button type="button" disabled={loading} onClick={() => { setSetup(null); setCode(''); }} className="px-4 py-2 rounded-full text-xs font-bold border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 disabled:opacity-50">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : enabled ? (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs">
            Seu login já está protegido com um código do autenticador.
          </div>
          <button type="button" disabled={loading} onClick={handleDisable} className="px-4 py-2 rounded-full text-xs font-bold border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 disabled:opacity-50">
            Desativar 2FA
          </button>
        </div>
      ) : (
        <button type="button" disabled={loading || !user} onClick={handleStart} className="px-4 py-2 rounded-full text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-neutral-900 disabled:opacity-50">
          Ativar 2FA
        </button>
      )}
    </div>
  );
}
