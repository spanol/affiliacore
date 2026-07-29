import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { ShieldCheck, ShieldAlert, QrCode, AlertCircle, CheckCircle, Smartphone, KeyRound, Copy } from 'lucide-react';
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
  fetchTotpStatus,
  regenerateBackupCodes,
  type TotpEnrollmentSetup,
} from '../lib/authSecurity';

// 2FA por app autenticador (TOTP da própria AffiliaCore — ver src/lib/authSecurity).
// Três estados: desligado → configurando (QR + código) → ligado. Os códigos de backup
// aparecem UMA vez, logo após ativar ou regenerar: o servidor só guarda o hash deles.
type Mode = 'idle' | 'enrolling' | 'disabling' | 'regenerating';

export default function TwoFactorCard({ user }: { user: User | null }) {
  const [enabled, setEnabled] = useState(false);
  const [backupRemaining, setBackupRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');
  const [setup, setSetup] = useState<TotpEnrollmentSetup | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchTotpStatus()
      .then((status) => {
        if (!alive) return;
        setEnabled(status.enabled);
        setBackupRemaining(status.backupCodesRemaining);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [user]);

  const reset = () => {
    setMode('idle');
    setSetup(null);
    setCode('');
  };

  const openMode = (next: Mode) => {
    setMode(next);
    setCode('');
    setMessage(null);
    setBackupCodes(null);
  };

  // Toda ação segue a mesma forma: liga o loading, roda, traduz o erro do servidor
  // (que já vem em pt-BR pelo TotpError) e devolve o card ao estado neutro.
  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    setMessage(null);
    try {
      await fn();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Não foi possível concluir a operação.' });
    } finally {
      setLoading(false);
    }
  };

  const handleStart = () => run(async () => {
    setBackupCodes(null);
    setSetup(await beginTotpEnrollment());
    setMode('enrolling');
    setCode('');
  });

  const handleConfirm = () => run(async () => {
    const { backupCodes: codes } = await confirmTotpEnrollment(code.trim());
    setBackupCodes(codes);
    setEnabled(true);
    setBackupRemaining(codes.length);
    reset();
    setMessage({ type: 'success', text: '2FA ativado. Guarde os códigos de backup abaixo.' });
  });

  const handleDisable = () => run(async () => {
    await disableTotp(code.trim());
    setEnabled(false);
    setBackupRemaining(0);
    setBackupCodes(null);
    reset();
    setMessage({ type: 'success', text: '2FA removido da conta.' });
  });

  const handleRegenerate = () => run(async () => {
    const { backupCodes: codes } = await regenerateBackupCodes(code.trim());
    setBackupCodes(codes);
    setBackupRemaining(codes.length);
    reset();
    setMessage({ type: 'success', text: 'Novos códigos gerados. Os anteriores não valem mais.' });
  });

  const codeInput = (label: string, onSubmit: () => void, submitLabel: string) => (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-400" size={16} />
        <input
          type="text"
          inputMode="numeric"
          aria-label={label}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs dark:text-white focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || code.length < 6}
          onClick={onSubmit}
          className="px-4 py-2 rounded-full text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-neutral-900 disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={reset}
          className="px-4 py-2 rounded-full text-xs font-bold border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );

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

      {backupCodes && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-400">
            <KeyRound size={16} /> Códigos de backup — anote agora
          </div>
          <p className="text-[11px] text-amber-700 dark:text-amber-500">
            Só aparecem desta vez. Cada código substitui o app uma única vez, caso você perca o celular.
          </p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-900 dark:text-white">
            {backupCodes.map((c) => (
              <li key={c} className="bg-white dark:bg-neutral-900 rounded-lg px-3 py-2 border border-amber-100 dark:border-amber-900/40">{c}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(backupCodes.join('\n'))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border border-amber-300 dark:border-amber-900/60 text-amber-800 dark:text-amber-400"
          >
            <Copy size={12} /> Copiar todos
          </button>
        </div>
      )}

      {mode === 'enrolling' && setup ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <QrCode size={18} /> Escaneie o QR code
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-800/50 p-4 flex flex-col md:flex-row gap-4 items-center md:items-start">
            <img src={setup.qrCodeDataUrl} alt="QR code para 2FA" className="w-40 h-40 rounded-2xl bg-white p-3 border border-slate-200" />
            <div className="space-y-3 flex-1">
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                Abra seu autenticador (Google Authenticator, Authy, 1Password…), escaneie o QR code e digite o código de {setup.digits} dígitos abaixo.
              </p>
              <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 p-3">
                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 dark:text-neutral-500 mb-1">Chave manual</p>
                <p className="text-xs font-mono break-all text-slate-900 dark:text-white">{setup.secretKey}</p>
              </div>
              {codeInput('Código do autenticador', handleConfirm, 'Confirmar ativação')}
            </div>
          </div>
        </div>
      ) : mode === 'disabling' ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-neutral-400">Digite um código do autenticador para confirmar a remoção do 2FA.</p>
          {codeInput('Código para desativar o 2FA', handleDisable, 'Confirmar remoção')}
        </div>
      ) : mode === 'regenerating' ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-neutral-400">Digite um código do autenticador. Os códigos de backup atuais deixarão de valer.</p>
          {codeInput('Código para gerar novos códigos de backup', handleRegenerate, 'Gerar novos códigos')}
        </div>
      ) : enabled ? (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs">
            Seu login já está protegido com um código do autenticador.
            <span className="block mt-1 font-bold">{backupRemaining} código(s) de backup restante(s).</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => openMode('regenerating')}
              className="px-4 py-2 rounded-full text-xs font-bold border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 disabled:opacity-50"
            >
              Gerar novos códigos de backup
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => openMode('disabling')}
              className="px-4 py-2 rounded-full text-xs font-bold border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 disabled:opacity-50"
            >
              Desativar 2FA
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={loading || !user}
          onClick={handleStart}
          className="px-4 py-2 rounded-full text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-neutral-900 disabled:opacity-50"
        >
          Ativar 2FA
        </button>
      )}
    </div>
  );
}
