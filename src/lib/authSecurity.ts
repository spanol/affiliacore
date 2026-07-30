import type { Auth } from 'firebase/auth';
import { confirmPasswordReset, sendPasswordResetEmail, verifyPasswordResetCode } from 'firebase/auth';
import QRCode from 'qrcode';
import { auth as firebaseAuth } from './firebase';
import { authFetch } from './api';
import { mfaPending, type MfaClaims } from './mfaSession';

// 2FA por app autenticador (TOTP), implementado pela PRÓPRIA AffiliaCore — não pelo
// Firebase Multi-Factor/Identity Platform, que exigia upgrade pago do projeto em cada
// label. O segredo e a verificação vivem no servidor (/api/auth/totp); aqui só há
// chamadas HTTP + o desenho do QR.
//
// Como a sessão é barrada: o `signInWithEmailAndPassword` conclui sozinho, então quem
// bloqueia é o gate do servidor (403 MFA_REQUIRED) + o ProtectedRoute, que lê as claims
// do ID token pela regra pura de `mfaSession.ts`. Depois de verificar/ativar/desativar
// é OBRIGATÓRIO renovar o token (getIdToken(true)) — senão o token em mãos continua
// sem as claims novas.

export interface TotpStatus {
  enabled: boolean;
  verified: boolean;
  backupCodesRemaining: number;
}

export interface TotpEnrollmentSetup {
  secretKey: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  digits: number;
  periodSeconds: number;
}

export class TotpError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'TotpError';
    this.code = code;
  }
}

async function totpRequest<T>(path: string, body?: unknown): Promise<T> {
  const res = await authFetch(`/api/auth/totp/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const payload = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new TotpError(payload?.error || 'Não foi possível concluir a operação.', payload?.code);
  }
  return payload as T;
}

/** Renova o ID token p/ ele carregar as claims que o servidor acabou de gravar. */
export async function refreshMfaClaims(): Promise<void> {
  await firebaseAuth.currentUser?.getIdToken(true);
}

/** Lê as claims do token atual — `true` quando falta o segundo fator nesta sessão. */
export async function readMfaPending(): Promise<boolean> {
  const user = firebaseAuth.currentUser;
  if (!user || typeof user.getIdTokenResult !== 'function') return false;
  try {
    const result = await user.getIdTokenResult();
    return mfaPending(result?.claims as MfaClaims);
  } catch {
    // Sem conseguir ler as claims não trancamos a UI — o servidor segue barrando.
    return false;
  }
}

export function fetchTotpStatus(): Promise<TotpStatus> {
  return totpRequest<TotpStatus>('status');
}

/** Passo 1: pede o segredo pendente e transforma a otpauth:// em QR code. */
export async function beginTotpEnrollment(): Promise<TotpEnrollmentSetup> {
  const setup = await totpRequest<Omit<TotpEnrollmentSetup, 'qrCodeDataUrl'>>('setup', {});
  return { ...setup, qrCodeDataUrl: await QRCode.toDataURL(setup.otpauthUrl) };
}

/** Passo 2: confirma com o código do app e devolve os códigos de backup (uma vez só). */
export async function confirmTotpEnrollment(code: string): Promise<{ backupCodes: string[] }> {
  const result = await totpRequest<{ backupCodes: string[] }>('activate', { code });
  await refreshMfaClaims();
  return result;
}

/** Segundo fator do login. Aceita o código do app ou um código de backup. */
export async function verifyTotpCode(code: string): Promise<{ usedBackupCode: boolean; backupCodesRemaining: number }> {
  const result = await totpRequest<{ usedBackupCode: boolean; backupCodesRemaining: number }>('verify', { code });
  await refreshMfaClaims();
  return result;
}

export function regenerateBackupCodes(code: string): Promise<{ backupCodes: string[] }> {
  return totpRequest<{ backupCodes: string[] }>('backup-codes', { code });
}

export async function disableTotp(code: string): Promise<void> {
  await totpRequest('disable', { code });
  await refreshMfaClaims();
}

// --- Senha (fluxo de recuperação, inalterado) --------------------------------

export function normalizeAuthEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

// `url` aqui é o **continueUrl**: para onde o Firebase manda o usuário DEPOIS de
// concluir a ação, não onde a ação acontece. Quem processa o `oobCode` é a página
// do handler — por padrão a do Google (`<project>.firebaseapp.com/__/auth/action`),
// e só vira a NOSSA `/reset-password` quando o projeto tem "URL de ação
// personalizada" configurada no console (Authentication → Templates).
//
// Por isso o destino é `/login`: apontar para `/reset-password` mandava quem
// acabou de trocar a senha para uma tela que, sem `oobCode` na query, exibe
// "Link de redefinição inválido ou incompleto" — erro no fim de um fluxo que deu
// certo (medido na Infinity em 2026-07-30). Com a URL de ação personalizada o
// e-mail já leva direto à nossa tela COM o código, e este continueUrl deixa de
// ser usado; `/login` está correto nos dois mundos.
export function buildPasswordResetSettings() {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';
  return {
    url: `${origin}/login`,
    handleCodeInApp: true,
  };
}

export async function requestPasswordReset(auth: Auth, email: string): Promise<void> {
  await sendPasswordResetEmail(auth, normalizeAuthEmail(email), buildPasswordResetSettings());
}

export async function readPasswordResetEmail(auth: Auth, oobCode: string): Promise<string> {
  return verifyPasswordResetCode(auth, oobCode);
}

export async function applyPasswordReset(auth: Auth, oobCode: string, newPassword: string): Promise<void> {
  await confirmPasswordReset(auth, oobCode, newPassword);
}
