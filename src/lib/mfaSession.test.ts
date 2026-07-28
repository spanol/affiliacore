import { describe, it, expect } from 'vitest';
import {
  buildMfaDisabledClaims,
  buildMfaVerifiedClaims,
  mergeCustomClaims,
  mfaEnabledInToken,
  mfaPending,
  mfaSatisfied,
} from './mfaSession';

const AUTH_TIME = 1_700_000_000;

describe('mfaEnabledInToken', () => {
  it('só o booleano true liga o 2FA (string/1 não contam)', () => {
    expect(mfaEnabledInToken({ totpEnabled: true })).toBe(true);
    expect(mfaEnabledInToken({ totpEnabled: 'true' })).toBe(false);
    expect(mfaEnabledInToken({ totpEnabled: 1 })).toBe(false);
    expect(mfaEnabledInToken({})).toBe(false);
    expect(mfaEnabledInToken(null)).toBe(false);
  });
});

describe('mfaSatisfied', () => {
  it('quem não tem 2FA passa direto', () => {
    expect(mfaSatisfied({ auth_time: AUTH_TIME })).toBe(true);
    expect(mfaSatisfied(null)).toBe(true);
  });

  it('passa quando a verificação foi feita NESTA sessão (mfaAuthTime == auth_time)', () => {
    expect(mfaSatisfied({ totpEnabled: true, mfaAuthTime: AUTH_TIME, auth_time: AUTH_TIME })).toBe(true);
  });

  it('BLOQUEIA um login novo com a claim da sessão anterior', () => {
    // Atacante com a senha: sign-in novo → auth_time novo; a claim antiga não serve.
    expect(mfaSatisfied({ totpEnabled: true, mfaAuthTime: AUTH_TIME, auth_time: AUTH_TIME + 3600 })).toBe(false);
  });

  it('bloqueia sessão sem a claim de verificação (fail-closed)', () => {
    expect(mfaSatisfied({ totpEnabled: true, auth_time: AUTH_TIME })).toBe(false);
    expect(mfaSatisfied({ totpEnabled: true, mfaAuthTime: null, auth_time: AUTH_TIME })).toBe(false);
  });

  it('bloqueia token sem auth_time (fail-closed)', () => {
    expect(mfaSatisfied({ totpEnabled: true, mfaAuthTime: AUTH_TIME })).toBe(false);
  });

  it('aceita o carimbo vindo como string numérica', () => {
    expect(mfaSatisfied({ totpEnabled: true, mfaAuthTime: String(AUTH_TIME), auth_time: AUTH_TIME })).toBe(true);
  });

  it('mfaPending é o inverso', () => {
    expect(mfaPending({ totpEnabled: true, auth_time: AUTH_TIME })).toBe(true);
    expect(mfaPending({ totpEnabled: true, mfaAuthTime: AUTH_TIME, auth_time: AUTH_TIME })).toBe(false);
    expect(mfaPending({})).toBe(false);
  });
});

describe('buildMfaVerifiedClaims', () => {
  it('amarra a claim ao auth_time do token e carimba o instante', () => {
    expect(buildMfaVerifiedClaims(AUTH_TIME, 1_700_000_123_456)).toEqual({
      totpEnabled: true,
      mfaAuthTime: AUTH_TIME,
      mfaVerifiedAt: 1_700_000_123,
    });
  });

  it('as claims geradas satisfazem a própria checagem', () => {
    const claims = buildMfaVerifiedClaims(AUTH_TIME, Date.now());
    expect(mfaSatisfied({ ...claims, auth_time: AUTH_TIME })).toBe(true);
  });
});

describe('mergeCustomClaims', () => {
  it('preserva claims alheias ao ligar o 2FA (setCustomUserClaims sobrescreve tudo)', () => {
    const merged = mergeCustomClaims({ tenant: 'infinity' }, buildMfaVerifiedClaims(AUTH_TIME, 0));
    expect(merged).toMatchObject({ tenant: 'infinity', totpEnabled: true, mfaAuthTime: AUTH_TIME });
  });

  it('null apaga a chave — desligar o 2FA não deixa resíduo no token', () => {
    const ligado = mergeCustomClaims({ tenant: 'infinity' }, buildMfaVerifiedClaims(AUTH_TIME, 0));
    const desligado = mergeCustomClaims(ligado, buildMfaDisabledClaims());
    expect(desligado).toEqual({ tenant: 'infinity' });
    expect(mfaSatisfied({ ...desligado, auth_time: AUTH_TIME })).toBe(true);
  });

  it('lida com o usuário sem claim nenhuma', () => {
    expect(mergeCustomClaims(null, { totpEnabled: true })).toEqual({ totpEnabled: true });
    expect(mergeCustomClaims(undefined, buildMfaDisabledClaims())).toEqual({});
  });
});
