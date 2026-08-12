import React, { useEffect, useRef, useState } from 'react';
import { Phone, ShieldCheck, MessageSquareText, Loader2 } from 'lucide-react';
import { maskPhone } from '../lib/validators';

// Campo de telefone com verificação por SMS (OTP) — usado nos DOIS pontos de
// entrada de afiliado (Register e InviteAccept).
//
// A feature é POR INSTÂNCIA (GET /api/phone/status). FAIL-OPEN de propósito:
// erro de rede ou build antiga do servidor → o campo vira um input de telefone
// comum e o cadastro segue como sempre (a falta do provedor de SMS nunca pode
// trancar o cadastro). Quem ENFORÇA a verificação quando ligada é o servidor
// (accept-invite exige o token); aqui é UX.
//
// O código NUNCA passa por aqui além do que o usuário digita: o servidor só
// devolve um token opaco de uso único após o verify — é ele que o cadastro envia.

export interface PhoneVerificationState {
  /** A instância exige verificação por SMS? */
  required: boolean;
  /** O telefone atual já foi confirmado pelo código? */
  verified: boolean;
  /** Token de uso único que prova a verificação (vai no submit do cadastro). */
  token: string | null;
}

/**
 * Bailout estrutural p/ o setState do PAI: `onVerificationChange` emite um
 * objeto NOVO a cada notificação — sem comparar, todo mount re-renderiza o pai
 * à toa (e sob o mock de `motion` dos testes, que remonta a subárvore a cada
 * render, virava loop infinito de fetch). Use como updater:
 *   setPhoneVerification((prev) => mergePhoneVerificationState(prev, next))
 */
export function mergePhoneVerificationState(
  prev: PhoneVerificationState,
  next: PhoneVerificationState,
): PhoneVerificationState {
  return prev.required === next.required && prev.verified === next.verified && prev.token === next.token
    ? prev
    : next;
}

interface Props {
  value: string;
  onChange: (masked: string) => void;
  onVerificationChange: (state: PhoneVerificationState) => void;
  label?: string;
  placeholder?: string;
}

const INPUT_CLASS =
  'w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-auth-cta/20 focus:border-auth-cta transition-all outline-none';

export default function PhoneVerificationField({ value, onChange, onVerificationChange, label = 'Telefone', placeholder = '(11) 98765-4321' }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [sent, setSent] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/phone/status', { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((payload) => {
        if (alive) {
          const on = payload?.enabled === true;
          setEnabled(on);
          onVerificationChange({ required: on, verified: false, token: null });
        }
      })
      .catch(() => {
        // FAIL-OPEN: sem resposta = feature desligada, cadastro segue.
        if (alive) setEnabled(false);
      });
    return () => {
      alive = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCooldown = (ms: number) => {
    const until = Date.now() + ms;
    setCooldown(Math.ceil(ms / 1000));
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setCooldown(left);
      if (left <= 0 && timerRef.current) clearInterval(timerRef.current);
    }, 500);
  };

  const resetVerification = () => {
    if (verified || sent) {
      setVerified(false);
      setSent(false);
      setCode('');
      setFeedback(null);
      onVerificationChange({ required: enabled, verified: false, token: null });
    }
  };

  const handleSend = async () => {
    setFeedback(null);
    setSending(true);
    try {
      const response = await fetch('/api/phone/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ phone: value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 503) {
        // A instância desligou a feature no meio do caminho: solta o gate.
        setEnabled(false);
        onVerificationChange({ required: false, verified: false, token: null });
        return;
      }
      if (!response.ok) {
        setFeedback(payload?.error || 'Não foi possível enviar o código. Tente novamente.');
        if (typeof payload?.retryInMs === 'number') startCooldown(payload.retryInMs);
        return;
      }
      setSent(true);
      setDevMode(payload?.dev === true);
      startCooldown(typeof payload?.cooldownMs === 'number' ? payload.cooldownMs : 60_000);
      setFeedback(null);
    } catch {
      setFeedback('Falha de conexão ao enviar o código. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    setFeedback(null);
    setChecking(true);
    try {
      const response = await fetch('/api/phone/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ phone: value, code }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(payload?.error || 'Código inválido. Tente novamente.');
        return;
      }
      setVerified(true);
      setFeedback(null);
      onVerificationChange({ required: true, verified: true, token: String(payload?.verificationToken || '') || null });
    } catch {
      setFeedback('Falha de conexão ao verificar o código. Tente novamente.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">{label}</label>
      <div className="relative">
        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
        <input
          type="tel"
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            onChange(maskPhone(e.target.value));
            resetVerification();
          }}
          required
          className={INPUT_CLASS}
          placeholder={placeholder}
        />
        {enabled && verified && (
          <ShieldCheck className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500" size={16} aria-label="Telefone verificado" />
        )}
      </div>

      {enabled && !verified && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || cooldown > 0 || value.replace(/\D/g, '').length < 11}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all disabled:opacity-50 bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-700"
            >
              {sending ? <Loader2 size={13} className="animate-spin" /> : <MessageSquareText size={13} />}
              {sent ? (cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código') : 'Enviar código por SMS'}
            </button>
            {sent && (
              <span className="text-[10px] text-slate-400 dark:text-neutral-500">Código enviado por SMS.</span>
            )}
          </div>

          {sent && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm tracking-[0.3em] font-bold dark:text-white focus:ring-2 focus:ring-auth-cta/20 focus:border-auth-cta transition-all outline-none"
                placeholder="000000"
                aria-label="Código de verificação recebido por SMS"
              />
              <button
                type="button"
                onClick={handleVerify}
                disabled={checking || code.length !== 6}
                className="px-4 py-3 rounded-xl text-[11px] font-bold uppercase tracking-wide transition-all disabled:opacity-50 bg-auth-cta text-auth-cta-text hover:bg-auth-cta-hover dark:bg-lp-cta dark:text-lp-cta-text dark:hover:bg-lp-cta-hover"
              >
                {checking ? <Loader2 size={13} className="animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          )}

          {devMode && sent && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Instância sem provedor de SMS: o código está no log do servidor (modo de demonstração).
            </p>
          )}
          {feedback && (
            <p className="text-[11px] font-bold text-red-600 dark:text-red-400">{feedback}</p>
          )}
        </div>
      )}

      {enabled && verified && (
        <p className="text-[10px] font-bold text-green-600 dark:text-green-400 ml-1">Telefone verificado por SMS.</p>
      )}
    </div>
  );
}
