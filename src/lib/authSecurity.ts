import type { Auth, MultiFactorInfo, MultiFactorResolver, User } from 'firebase/auth';
import {
  TotpMultiFactorGenerator,
  confirmPasswordReset,
  getMultiFactorResolver,
  multiFactor,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
} from 'firebase/auth';
import QRCode from 'qrcode';
import { BRAND } from './brandingClient';

export interface TotpSignInChallenge {
  resolver: MultiFactorResolver;
  hint: MultiFactorInfo;
}

export interface TotpEnrollmentSetup {
  secret: Awaited<ReturnType<typeof TotpMultiFactorGenerator.generateSecret>>;
  qrCodeDataUrl: string;
  qrCodeUrl: string;
  secretKey: string;
  codeLength: number;
  codeIntervalSeconds: number;
}

export function normalizeAuthEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function buildPasswordResetSettings() {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';
  return {
    url: `${origin}/reset-password`,
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

export function isMfaRequiredError(error: any): boolean {
  return error?.code === 'auth/multi-factor-auth-required';
}

export function createTotpSignInChallenge(auth: Auth, error: any): TotpSignInChallenge {
  const resolver = getMultiFactorResolver(auth, error);
  const hint = resolver.hints.find((item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID) ?? resolver.hints[0];
  if (!hint) {
    throw new Error('Nenhum fator de autenticação disponível para concluir o login.');
  }
  return { resolver, hint };
}

export async function resolveTotpSignIn(challenge: TotpSignInChallenge, code: string) {
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(challenge.hint.uid, code);
  return challenge.resolver.resolveSignIn(assertion);
}

export async function beginTotpEnrollment(user: User): Promise<TotpEnrollmentSetup> {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const qrCodeUrl = secret.generateQrCodeUrl(user.email ?? undefined, BRAND.shortName);
  const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl);
  return {
    secret,
    qrCodeDataUrl,
    qrCodeUrl,
    secretKey: secret.secretKey,
    codeLength: secret.codeLength,
    codeIntervalSeconds: secret.codeIntervalSeconds,
  };
}

export async function confirmTotpEnrollment(user: User, setup: TotpEnrollmentSetup, code: string): Promise<void> {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(setup.secret, code);
  await multiFactor(user).enroll(assertion, BRAND.shortName);
  await user.reload();
}

export async function disableTotpEnrollment(user: User): Promise<void> {
  const factor = multiFactor(user).enrolledFactors.find((item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!factor) {
    throw new Error('Nenhum 2FA ativo para remover.');
  }
  await multiFactor(user).unenroll(factor.uid);
  await user.reload();
}

export function hasTotpEnabled(user: User | null): boolean {
  if (!user) return false;
  return multiFactor(user).enrolledFactors.some((item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}
