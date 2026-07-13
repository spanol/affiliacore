import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, orderBy } from 'firebase/firestore';
import { authFetch } from '../lib/api';
import {
  subscribeToPrizes,
  createPrize,
  updatePrize,
  deletePrize,
} from './prizeService';

// O service lê o Firestore direto (onSnapshot, regra pública) e escreve via
// authFetch (requireAdmin no servidor). Mock-padrão dos services deste repo:
// `firebase/firestore` + `lib/firebase` (db) + `lib/api` (authFetch).
vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('../lib/api', () => ({ authFetch: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'ranking-prizes-col'),
  query: vi.fn((...args: any[]) => ({ __query: args })),
  orderBy: vi.fn((field: string, dir: string) => ({ __orderBy: [field, dir] })),
  onSnapshot: vi.fn(() => vi.fn()),
  Timestamp: class {},
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// subscribeToPrizes — mapper do snapshot + ordenação + propagação de erro
// =============================================================================
describe('subscribeToPrizes', () => {
  it('ordena por position asc na query', () => {
    subscribeToPrizes(vi.fn());
    expect(vi.mocked(orderBy)).toHaveBeenCalledWith('position', 'asc');
  });

  it('mapeia docs (active default true, description default "", timestamps null)', () => {
    const onData = vi.fn();
    subscribeToPrizes(onData);
    const onNext = vi.mocked(onSnapshot).mock.calls[0][1] as any;
    onNext({
      docs: [
        { id: 'p1', data: () => ({ position: 1, title: 'iPhone 16 Pro' }) },
        { id: 'p2', data: () => ({ position: 2, title: 'R$ 2.000', description: 'Top 2', active: false }) },
      ],
    });
    const prizes = onData.mock.calls[0][0];
    expect(prizes).toHaveLength(2);
    expect(prizes[0]).toMatchObject({
      id: 'p1',
      position: 1,
      title: 'iPhone 16 Pro',
      description: '',
      active: true,
      createdAt: null,
    });
    expect(prizes[1]).toMatchObject({ id: 'p2', active: false, description: 'Top 2' });
  });

  it('propaga erro para onError (Home deslogada esconde a seção)', () => {
    const onError = vi.fn();
    subscribeToPrizes(vi.fn(), onError);
    const errCb = vi.mocked(onSnapshot).mock.calls[0][2] as any;
    const err = new Error('permission-denied');
    errCb(err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('retorna a função de unsubscribe do onSnapshot', () => {
    expect(typeof subscribeToPrizes(vi.fn())).toBe('function');
  });
});

// =============================================================================
// CRUD via authFetch — URL/método/body + erro do servidor
// =============================================================================
describe('createPrize / updatePrize / deletePrize (authFetch)', () => {
  const input = { position: 1, title: 'iPhone 16 Pro', description: 'Top 1 de julho' };

  it('createPrize: POST /api/prizes com o corpo serializado', async () => {
    vi.mocked(authFetch).mockResolvedValue({ ok: true } as any);
    await createPrize(input);
    expect(authFetch).toHaveBeenCalledWith('/api/prizes', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(input),
    }));
  });

  it('updatePrize: PATCH com id encodado', async () => {
    vi.mocked(authFetch).mockResolvedValue({ ok: true } as any);
    await updatePrize('a/b', { active: false });
    expect(authFetch).toHaveBeenCalledWith('/api/prizes/a%2Fb', expect.objectContaining({ method: 'PATCH' }));
  });

  it('deletePrize: DELETE', async () => {
    vi.mocked(authFetch).mockResolvedValue({ ok: true } as any);
    await deletePrize('p1');
    expect(authFetch).toHaveBeenCalledWith('/api/prizes/p1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('resposta !ok → lança com a mensagem de erro do servidor', async () => {
    vi.mocked(authFetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Posição inválida — use um número inteiro entre 1 e 100.' }),
    } as any);
    await expect(createPrize(input)).rejects.toThrow('Posição inválida');
  });

  it('resposta !ok com corpo não-JSON → usa o fallback', async () => {
    vi.mocked(authFetch).mockResolvedValue({
      ok: false,
      json: async () => { throw new Error('not json'); },
    } as any);
    await expect(deletePrize('p1')).rejects.toThrow('Falha ao remover premiação.');
  });
});
