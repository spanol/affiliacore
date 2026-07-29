import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// AuthContext assina onAuthStateChanged (firebase/auth) e, por usuário logado, um
// onSnapshot do doc users/{uid} (firebase/firestore). Capturamos esses callbacks p/
// dirigir login/logout/troca-de-conta e provar o invariante do R14: na troca A→B o
// loading volta a true e o perfil obsoleto é limpo (senão o ProtectedRoute roteia com
// o papel errado). Estado compartilhado via vi.hoisted (factories de mock são içadas).
const h = vi.hoisted(() => ({
  authCallbacks: [] as any[],
  authUnsub: vi.fn(),
  snapshotRegs: [] as Array<{ onNext: any; onError: any; unsub: any }>,
  handleFirestoreError: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: any, cb: any) => {
    h.authCallbacks.push(cb);
    return h.authUnsub;
  },
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...a: any[]) => ({ __doc: a })),
  getDocFromServer: vi.fn(),
  onSnapshot: (_ref: any, onNext: any, onError: any) => {
    const unsub = vi.fn();
    h.snapshotRegs.push({ onNext, onError, unsub });
    return unsub;
  },
}));
vi.mock('../lib/firebase', () => ({
  auth: {},
  db: {},
  handleFirestoreError: (...a: any[]) => h.handleFirestoreError(...a),
  OperationType: { GET: 'GET' },
}));

function Consumer() {
  const { user, profile, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? (user as any).uid : 'null'}</span>
      <span data-testid="role">{profile ? (profile as any).role : 'null'}</span>
    </div>
  );
}

const state = () => ({
  loading: screen.getByTestId('loading').textContent,
  user: screen.getByTestId('user').textContent,
  role: screen.getByTestId('role').textContent,
});

// Dispara o callback do onAuthStateChanged (é async no AuthContext) dentro de act.
async function fireAuth(user: any) {
  await act(async () => {
    await h.authCallbacks[h.authCallbacks.length - 1](user);
  });
}
async function fireSnapshot(idx: number, snap: any) {
  await act(async () => {
    h.snapshotRegs[idx].onNext(snap);
  });
}
const docExists = (data: any) => ({ exists: () => true, data: () => data });
const docMissing = { exists: () => false, data: () => undefined };

beforeEach(() => {
  h.authCallbacks.length = 0;
  h.snapshotRegs.length = 0;
  vi.clearAllMocks();
});

describe('AuthProvider (R14)', () => {
  it('estado inicial: loading=true até o auth resolver', () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(state()).toEqual({ loading: 'true', user: 'null', role: 'null' });
  });

  it('sem login → user/profile null, loading false', async () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    await fireAuth(null);
    expect(state()).toEqual({ loading: 'false', user: 'null', role: 'null' });
    // sem usuário, nenhum onSnapshot de profile é assinado
    expect(h.snapshotRegs).toHaveLength(0);
  });

  it('login → snapshot seta o profile e encerra o loading', async () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    await fireAuth({ uid: 'u1' });
    expect(state().user).toBe('u1');
    await fireSnapshot(0, docExists({ role: 'client', uid: 'u1' }));
    expect(state()).toEqual({ loading: 'false', user: 'u1', role: 'client' });
  });

  it('doc de profile inexistente → profile null, loading false', async () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    await fireAuth({ uid: 'u1' });
    await fireSnapshot(0, docMissing);
    expect(state()).toEqual({ loading: 'false', user: 'u1', role: 'null' });
  });

  it('erro no snapshot → handleFirestoreError, profile null, loading não trava', async () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    await fireAuth({ uid: 'u1' });
    await act(async () => {
      h.snapshotRegs[0].onError(new Error('permission-denied'));
    });
    expect(h.handleFirestoreError).toHaveBeenCalledTimes(1);
    expect(state()).toEqual({ loading: 'false', user: 'u1', role: 'null' });
  });

  it('troca A→B: desinscreve o profile de A antes de assinar B + reseta loading e limpa o perfil obsoleto (R14)', async () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    // login A (admin) já carregado
    await fireAuth({ uid: 'A' });
    await fireSnapshot(0, docExists({ role: 'admin', uid: 'A' }));
    expect(state()).toEqual({ loading: 'false', user: 'A', role: 'admin' });

    // troca para B (ainda sem o snapshot de B)
    await fireAuth({ uid: 'B' });
    // desinscreveu o listener de profile de A (logo, snapshot tardio de A não chega)
    expect(h.snapshotRegs[0].unsub).toHaveBeenCalledTimes(1);
    expect(h.snapshotRegs).toHaveLength(2);
    // R14: NÃO expõe o perfil/loading de A enquanto B não carrega
    expect(state()).toEqual({ loading: 'true', user: 'B', role: 'null' });

    // snapshot de B chega → papel de B, loading encerra
    await fireSnapshot(1, docExists({ role: 'client', uid: 'B' }));
    expect(state()).toEqual({ loading: 'false', user: 'B', role: 'client' });
  });

  it('unmount → desinscreve o auth e o profile', async () => {
    const { unmount } = render(<AuthProvider><Consumer /></AuthProvider>);
    await fireAuth({ uid: 'u1' });
    unmount();
    expect(h.authUnsub).toHaveBeenCalledTimes(1);
    expect(h.snapshotRegs[0].unsub).toHaveBeenCalledTimes(1);
  });
});

// 2FA (TOTP próprio): o AuthContext lê as claims do ID token e publica `mfaPending`,
// que o ProtectedRoute usa p/ trocar a rota inteira pelo desafio. É de UX — quem
// ENFORÇA é o servidor —, então erro ao ler as claims NÃO pode trancar a tela.
function MfaConsumer() {
  const { mfaPending } = useAuth();
  return <span data-testid="mfa">{String(mfaPending)}</span>;
}
const mfa = () => screen.getByTestId('mfa').textContent;

/** Usuário com as claims que o Firebase devolveria no getIdTokenResult(). */
const userWithClaims = (uid: string, claims: any) => ({
  uid,
  getIdTokenResult: async () => ({ claims }),
});

describe('AuthProvider · 2FA pendente', () => {
  it('sem 2FA ligado → não pendente', async () => {
    render(<AuthProvider><MfaConsumer /></AuthProvider>);
    await fireAuth(userWithClaims('u1', { auth_time: 1000 }));
    expect(mfa()).toBe('false');
  });

  it('2FA ligado e ainda não confirmado nesta sessão → pendente', async () => {
    render(<AuthProvider><MfaConsumer /></AuthProvider>);
    await fireAuth(userWithClaims('u1', { totpEnabled: true, auth_time: 1000 }));
    expect(mfa()).toBe('true');
  });

  it('2FA já confirmado nesta sessão (mfaAuthTime == auth_time) → não pendente', async () => {
    render(<AuthProvider><MfaConsumer /></AuthProvider>);
    await fireAuth(userWithClaims('u1', { totpEnabled: true, mfaAuthTime: 1000, auth_time: 1000 }));
    expect(mfa()).toBe('false');
  });

  it('login NOVO com a claim da sessão anterior → volta a pendente', async () => {
    render(<AuthProvider><MfaConsumer /></AuthProvider>);
    await fireAuth(userWithClaims('u1', { totpEnabled: true, mfaAuthTime: 1000, auth_time: 5000 }));
    expect(mfa()).toBe('true');
  });

  it('logout limpa o estado', async () => {
    render(<AuthProvider><MfaConsumer /></AuthProvider>);
    await fireAuth(userWithClaims('u1', { totpEnabled: true, auth_time: 1000 }));
    expect(mfa()).toBe('true');
    await fireAuth(null);
    expect(mfa()).toBe('false');
  });

  it('falha ao ler as claims NÃO tranca a tela (o servidor segue barrando)', async () => {
    render(<AuthProvider><MfaConsumer /></AuthProvider>);
    await fireAuth({ uid: 'u1', getIdTokenResult: async () => { throw new Error('offline'); } });
    expect(mfa()).toBe('false');
  });
});
