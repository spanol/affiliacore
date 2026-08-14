import { describe, it, expect } from 'vitest';
import { resolveFirebaseConfig, resolveStorageBucket } from './firebaseConfig';

const FALLBACK = { projectId: 'agencia-boost-app', apiKey: 'AIza-fallback' };

describe('resolveFirebaseConfig · config web por instância (P4)', () => {
  it('sem env (dev local/AI Studio) → fallback do JSON commitado', () => {
    expect(resolveFirebaseConfig(undefined, FALLBACK)).toBe(FALLBACK);
    expect(resolveFirebaseConfig('', FALLBACK)).toBe(FALLBACK);
    expect(resolveFirebaseConfig('   ', FALLBACK)).toBe(FALLBACK);
  });

  it('FIREBASE_WEBAPP_CONFIG válida → a instância usa o PRÓPRIO projeto', () => {
    const raw = JSON.stringify({ projectId: 'cliente-alfa', apiKey: 'AIza-alfa', appId: '1:2:web:3' });
    expect(resolveFirebaseConfig(raw, FALLBACK)).toEqual({ projectId: 'cliente-alfa', apiKey: 'AIza-alfa', appId: '1:2:web:3' });
  });

  it('JSON inválido ou sem projectId → fallback (env quebrada não derruba o boot)', () => {
    expect(resolveFirebaseConfig('{not json', FALLBACK)).toBe(FALLBACK);
    expect(resolveFirebaseConfig('"string"', FALLBACK)).toBe(FALLBACK);
    expect(resolveFirebaseConfig('[1,2]', FALLBACK)).toBe(FALLBACK);
    expect(resolveFirebaseConfig(JSON.stringify({ apiKey: 'x' }), FALLBACK)).toBe(FALLBACK);
    expect(resolveFirebaseConfig(JSON.stringify({ projectId: '' }), FALLBACK)).toBe(FALLBACK);
  });
});

describe('resolveStorageBucket · bucket do Storage por instância', () => {
  it('FIREBASE_STORAGE_BUCKET explícita vence tudo', () => {
    expect(resolveStorageBucket({
      FIREBASE_STORAGE_BUCKET: 'infinity-affiliacore.firebasestorage.app',
      FIREBASE_WEBAPP_CONFIG: JSON.stringify({ projectId: 'outro', storageBucket: 'outro.firebasestorage.app' }),
    })).toBe('infinity-affiliacore.firebasestorage.app');
  });

  it('sem override → storageBucket da config injetada pelo App Hosting', () => {
    expect(resolveStorageBucket({
      FIREBASE_WEBAPP_CONFIG: JSON.stringify({ projectId: 'cliente-alfa', storageBucket: 'cliente-alfa.firebasestorage.app' }),
    })).toBe('cliente-alfa.firebasestorage.app');
    expect(resolveStorageBucket({
      FIREBASE_CONFIG: JSON.stringify({ projectId: 'cliente-beta', storageBucket: 'cliente-beta.appspot.com' }),
    })).toBe('cliente-beta.appspot.com');
  });

  it('config só com projectId → deriva <projectId>.firebasestorage.app', () => {
    expect(resolveStorageBucket({
      FIREBASE_WEBAPP_CONFIG: JSON.stringify({ projectId: 'cliente-alfa' }),
    })).toBe('cliente-alfa.firebasestorage.app');
  });

  it('sem configs → project_id da service account', () => {
    expect(resolveStorageBucket({
      FIREBASE_SERVICE_ACCOUNT_KEY: JSON.stringify({ project_id: 'cliente-gama', client_email: 'x@y' }),
    })).toBe('cliente-gama.firebasestorage.app');
  });

  it('placeholder "unused" (white-label em ADC) e envs quebradas → null, NUNCA o bucket da instância 0', () => {
    expect(resolveStorageBucket({ FIREBASE_SERVICE_ACCOUNT_KEY: 'unused' })).toBeNull();
    expect(resolveStorageBucket({ FIREBASE_WEBAPP_CONFIG: '{not json' })).toBeNull();
    expect(resolveStorageBucket({})).toBeNull();
    // regressão do default antigo cravado no projeto do Boost
    expect(resolveStorageBucket({})).not.toBe('agencia-boost-app.firebasestorage.app');
  });
});
