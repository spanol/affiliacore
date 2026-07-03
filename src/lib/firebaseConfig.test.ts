import { describe, it, expect } from 'vitest';
import { resolveFirebaseConfig } from './firebaseConfig';

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
