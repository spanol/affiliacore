// Decisão ÚNICA de "esta sessão já passou pelo 2FA?" — pura, sem node nem firebase,
// porque os DOIS lados dependem dela: o servidor (gate do requireAuth/requireAdmin) e
// o client (AuthContext/ProtectedRoute, que precisa mostrar o desafio ao recarregar a
// página com uma sessão pela metade). Nunca reescreva a regra inline.
//
// Como o 2FA é enforçado, já que o `signInWithEmailAndPassword` conclui sozinho:
//
//   1. o servidor grava DUAS custom claims no usuário quando o código é aceito —
//      `totpEnabled` (tem 2FA ligado) e `mfaAuthTime` (o `auth_time` do token
//      apresentado na hora da verificação);
//   2. `auth_time` é o instante do SIGN-IN e não muda quando o ID token é
//      renovado — muda só quando alguém autentica de novo;
//   3. logo, `mfaAuthTime === auth_time` prova que o 2FA foi feito NESTA sessão.
//      Um login novo (atacante com a senha) nasce com `auth_time` diferente e a
//      claim antiga não serve — sem depender de relógio nem de expiração.
//
// `mfaVerifiedAt` (epoch em segundos) fica só p/ exibição/auditoria.

export const MFA_CLAIM_ENABLED = 'totpEnabled';
export const MFA_CLAIM_AUTH_TIME = 'mfaAuthTime';
export const MFA_CLAIM_VERIFIED_AT = 'mfaVerifiedAt';

/** Código devolvido pelo servidor quando a sessão está autenticada mas sem 2FA. */
export const MFA_REQUIRED_CODE = 'MFA_REQUIRED';

export interface MfaClaims {
  [MFA_CLAIM_ENABLED]?: unknown;
  [MFA_CLAIM_AUTH_TIME]?: unknown;
  [MFA_CLAIM_VERIFIED_AT]?: unknown;
  auth_time?: unknown;
  [key: string]: unknown;
}

function toEpochSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed);
  }
  return null;
}

/** O usuário tem 2FA ligado, segundo o token. */
export function mfaEnabledInToken(claims: MfaClaims | null | undefined): boolean {
  return claims?.[MFA_CLAIM_ENABLED] === true;
}

/**
 * Esta sessão pode seguir? `true` p/ quem não tem 2FA (a esmagadora maioria) e p/
 * quem já digitou o código nesta sessão. Fail-CLOSED: claim faltando/ilegível com
 * o 2FA ligado → bloqueado.
 */
export function mfaSatisfied(claims: MfaClaims | null | undefined): boolean {
  if (!mfaEnabledInToken(claims)) return true;
  const bound = toEpochSeconds(claims?.[MFA_CLAIM_AUTH_TIME]);
  const authTime = toEpochSeconds(claims?.auth_time);
  if (bound === null || authTime === null) return false;
  return bound === authTime;
}

/** Inverso de `mfaSatisfied` — o nome que o client usa (mostrar o desafio). */
export function mfaPending(claims: MfaClaims | null | undefined): boolean {
  return !mfaSatisfied(claims);
}

/**
 * Claims a gravar quando o código é aceito. `auth_time` vem do token apresentado
 * (nunca do corpo do request) e `nowMs` do relógio do servidor.
 */
export function buildMfaVerifiedClaims(authTime: unknown, nowMs: number) {
  return {
    [MFA_CLAIM_ENABLED]: true,
    [MFA_CLAIM_AUTH_TIME]: toEpochSeconds(authTime),
    [MFA_CLAIM_VERIFIED_AT]: Math.floor(nowMs / 1000),
  };
}

/** Claims a gravar ao DESLIGAR o 2FA — apaga as três (undefined some do token). */
export function buildMfaDisabledClaims() {
  return {
    [MFA_CLAIM_ENABLED]: null,
    [MFA_CLAIM_AUTH_TIME]: null,
    [MFA_CLAIM_VERIFIED_AT]: null,
  };
}

/**
 * Mescla claims novas por cima das existentes, DESCARTANDO as de valor null.
 * `setCustomUserClaims` sobrescreve o objeto inteiro — sem o merge, ligar o 2FA
 * apagaria qualquer outra claim do usuário.
 */
export function mergeCustomClaims(
  current: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(current || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}
