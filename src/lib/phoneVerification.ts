// Validação de telefone por SMS (OTP) — núcleo PURO da verificação.
//
// Item 7 do backlog da Infinity (2026-08-12): o afiliado confirma o número de
// celular digitando um código de 6 dígitos recebido por SMS, nos DOIS pontos de
// entrada (auto-cadastro /register e aceite de convite). Ver PESQUISA-SMS-OTP.md.
//
// Mesmo padrão do 2FA (src/lib/totp.ts):
//   • o código NUNCA é armazenado em claro — só o hash (sha-256, amarrado ao
//     telefone p/ um dump de `phone_verifications` não servir a outro número);
//   • comparação em tempo constante;
//   • toda a decisão (expirou? estourou tentativas? código bate?) é pura e
//     testável — o server.ts só orquestra Firestore + provedor de SMS.
//
// ATENÇÃO — módulo SERVER-ONLY (usa `node:crypto`). Não importe de página/
// componente: o client fala com /api/phone/*. As constantes que a UI precisa
// (cooldown/expiração) viajam na RESPOSTA de /api/phone/send-code.
import crypto from 'node:crypto';

/** Código de 6 dígitos — o padrão do mercado p/ OTP por SMS. */
export const OTP_LENGTH = 6;
/** O código expira em 10 minutos. */
export const OTP_TTL_MS = 10 * 60 * 1000;
/** Máximo de tentativas de digitação por código enviado. */
export const OTP_MAX_ATTEMPTS = 5;
/** Cooldown entre reenvios (SMS custa dinheiro; OTP é alvo de SMS pumping). */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
/** Máximo de SMS por desafio (o contador zera quando o desafio anterior expira). */
export const OTP_MAX_SENDS = 5;
/** O token de verificação (prova "este telefone foi confirmado") vale 30 min. */
export const VERIFICATION_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Normaliza um telefone BR para E.164: `+55DD9XXXXXXXX`.
 *
 * Aceita máscara "(11) 98765-4321", dígitos crus com/sem DDI (`5511987654321`,
 * `+55 11 98765-4321`). Exige DDD válido (2 dígitos, nenhum deles zero) e
 * CELULAR (9 dígitos começando com 9) — SMS não chega em fixo. Inválido → null.
 */
export function normalizeBrPhone(input: unknown): string | null {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (!digits) return null;
  // Remove o DDI 55 quando presente (13 dígitos = 55 + DDD + 9 dígitos).
  const national = digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length !== 11) return null;
  const ddd = national.slice(0, 2);
  const number = national.slice(2);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  if (!number.startsWith('9')) return null;
  return `+55${national}`;
}

/** Id do doc em `phone_verifications` (Firestore não aceita '+'-friendly? aceita, mas padronizamos sem). */
export function phoneDocId(e164: string): string {
  return e164.replace(/^\+/, '');
}

/** Máscara p/ logs/auditoria: nunca logue o telefone inteiro (PII). `+5511*****4321`. */
export function maskPhoneForLog(e164: string): string {
  const s = String(e164 ?? '');
  if (s.length < 8) return '***';
  return `${s.slice(0, 5)}*****${s.slice(-4)}`;
}

/** Código aleatório de 6 dígitos (crypto, não Math.random — uniforme e imprevisível). */
export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

/** Só dígitos — o usuário cola "123 456" o tempo todo (mesma regra do TOTP). */
export function normalizeOtpCode(code: unknown): string {
  return String(code ?? '').replace(/\D/g, '');
}

/**
 * Hash do código AMARRADO ao telefone: sha256("+5511...:123456"). Amarrar
 * impede que o hash de um desafio sirva pra validar outro número.
 */
export function hashOtpCode(code: unknown, phoneE164: string): string {
  return crypto.createHash('sha256').update(`${phoneE164}:${normalizeOtpCode(code)}`).digest('hex');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Shape do doc `phone_verifications/{phoneDocId}` (server-only, rule `if false`). */
export interface PhoneChallenge {
  phone?: string;
  codeHash?: string | null;
  /** epoch ms — expiração do CÓDIGO. */
  expiresAtMs?: number | null;
  attempts?: number | null;
  lastSentAtMs?: number | null;
  sendCount?: number | null;
  verified?: boolean;
  /** epoch ms — quando o código foi aceito (ancora o TTL do token). */
  verifiedAtMs?: number | null;
  /** hash do token de verificação devolvido ao client (uso único). */
  tokenHash?: string | null;
  /** epoch ms — quando o token foi consumido (accept-invite/attach). */
  consumedAtMs?: number | null;
}

export type OtpFailureReason = 'not_found' | 'expired' | 'too_many_attempts' | 'wrong_code';

/**
 * Decide UMA tentativa de código. Ordem importa: tentativas esgotadas ganham de
 * "código certo" (senão brute-force até acertar ignorando o teto), e expiração
 * ganha de tudo. Não muta nada — quem incrementa `attempts` é o chamador.
 */
export function evaluateOtpAttempt(
  challenge: PhoneChallenge | null | undefined,
  phoneE164: string,
  code: unknown,
  nowMs: number,
): { ok: true } | { ok: false; reason: OtpFailureReason } {
  if (!challenge || typeof challenge.codeHash !== 'string' || !challenge.codeHash) {
    return { ok: false, reason: 'not_found' };
  }
  const expiresAt = typeof challenge.expiresAtMs === 'number' ? challenge.expiresAtMs : 0;
  if (nowMs > expiresAt) return { ok: false, reason: 'expired' };
  const attempts = typeof challenge.attempts === 'number' ? challenge.attempts : 0;
  if (attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  const normalized = normalizeOtpCode(code);
  if (normalized.length !== OTP_LENGTH) return { ok: false, reason: 'wrong_code' };
  if (!timingSafeEqualStr(hashOtpCode(normalized, phoneE164), challenge.codeHash)) {
    return { ok: false, reason: 'wrong_code' };
  }
  return { ok: true };
}

/**
 * Pode (re)enviar um SMS agora? Cooldown de 60s entre envios + teto de envios
 * por desafio. Desafio EXPIRADO libera (o contador zera no envio novo).
 */
export function canSendOtp(
  challenge: PhoneChallenge | null | undefined,
  nowMs: number,
): { ok: true } | { ok: false; reason: 'cooldown' | 'send_limit'; retryInMs: number } {
  if (!challenge) return { ok: true };
  const lastSent = typeof challenge.lastSentAtMs === 'number' ? challenge.lastSentAtMs : 0;
  const expiresAt = typeof challenge.expiresAtMs === 'number' ? challenge.expiresAtMs : 0;
  const expired = nowMs > expiresAt;
  const sinceLast = nowMs - lastSent;
  if (lastSent > 0 && sinceLast < OTP_RESEND_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown', retryInMs: OTP_RESEND_COOLDOWN_MS - sinceLast };
  }
  const sendCount = typeof challenge.sendCount === 'number' ? challenge.sendCount : 0;
  if (!expired && sendCount >= OTP_MAX_SENDS) {
    // Só destrava quando o desafio atual expirar.
    return { ok: false, reason: 'send_limit', retryInMs: Math.max(0, expiresAt - nowMs) };
  }
  return { ok: true };
}

/** Desafio novo (ou reenvio). `previous` expirado/inexistente zera o contador de envios. */
export function buildChallenge(
  previous: PhoneChallenge | null | undefined,
  phoneE164: string,
  code: string,
  nowMs: number,
): PhoneChallenge {
  const previousExpired = !previous || nowMs > (typeof previous.expiresAtMs === 'number' ? previous.expiresAtMs : 0);
  const sendCount = previousExpired ? 1 : ((typeof previous?.sendCount === 'number' ? previous.sendCount : 0) + 1);
  return {
    phone: phoneE164,
    codeHash: hashOtpCode(code, phoneE164),
    expiresAtMs: nowMs + OTP_TTL_MS,
    attempts: 0,
    lastSentAtMs: nowMs,
    sendCount,
    verified: false,
    verifiedAtMs: null,
    tokenHash: null,
    consumedAtMs: null,
  };
}

/** Token opaco que prova "este telefone acabou de ser verificado" (uso único). */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashVerificationToken(token: unknown): string {
  return crypto.createHash('sha256').update(String(token ?? '')).digest('hex');
}

/**
 * O token apresentado (accept-invite / attach) ainda vale? Exige desafio
 * verificado, hash batendo (tempo constante), não consumido e dentro do TTL.
 */
export function verificationTokenValid(
  challenge: PhoneChallenge | null | undefined,
  token: unknown,
  nowMs: number,
): boolean {
  if (!challenge || challenge.verified !== true) return false;
  if (typeof challenge.tokenHash !== 'string' || !challenge.tokenHash) return false;
  if (challenge.consumedAtMs != null) return false;
  const verifiedAt = typeof challenge.verifiedAtMs === 'number' ? challenge.verifiedAtMs : 0;
  if (nowMs > verifiedAt + VERIFICATION_TOKEN_TTL_MS) return false;
  const raw = String(token ?? '');
  if (!raw) return false;
  return timingSafeEqualStr(hashVerificationToken(raw), challenge.tokenHash);
}
