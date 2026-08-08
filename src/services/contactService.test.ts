import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import {
  createContactInquiry,
  type ContactInquiryInput,
} from './contactService';

// O service só ESCREVE (addDoc + serverTimestamp): o leitor saiu com a /contacts
// em 2026-08-08 (B6). Mockamos `firebase/firestore`, `lib/firebase` (db) e
// `lib/api` (authFetch) — padrão dos testes de service deste repo.
vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('../lib/api', () => ({ authFetch: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'contacts-col'),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(() => '__ts'),
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

const input: ContactInquiryInput = {
  name: 'Fulano',
  email: 'fulano@ex.com',
  phone: '11999999999',
  socialMedia: '@fulano',
  affiliateExperience: 'sim',
  presentation: 'Quero ser afiliado.',
};

// =============================================================================
// createContactInquiry — addDoc com o input + createdAt do serverTimestamp
// =============================================================================
describe('createContactInquiry', () => {
  it('chama addDoc com a coleção e o corpo contendo o input + createdAt do serverTimestamp', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'novo' } as any);
    await createContactInquiry(input);
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ...input, createdAt: '__ts' }),
    );
    // Sem origem capturada, o campo `source` NÃO entra no doc (rules hasOnly).
    expect(vi.mocked(addDoc).mock.calls[0][1]).not.toHaveProperty('source');
    expect(serverTimestamp).toHaveBeenCalled();
  });

  it('carimba a origem capturada na sessão (lib/registrationSource)', async () => {
    sessionStorage.setItem('ac-reg-source', 'vitrine-affiliacore');
    vi.mocked(addDoc).mockResolvedValue({ id: 'novo' } as any);
    await createContactInquiry(input);
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ...input, source: 'vitrine-affiliacore' }),
    );
  });

  it('rules antigas (permission-denied no source) → reenvia SEM o carimbo, lead não se perde', async () => {
    sessionStorage.setItem('ac-reg-source', 'vitrine-affiliacore');
    vi.mocked(addDoc)
      .mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }))
      .mockResolvedValueOnce({ id: 'novo' } as any);
    await createContactInquiry(input);
    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(vi.mocked(addDoc).mock.calls[1][1]).not.toHaveProperty('source');
  });

  it('erro que NÃO é permission-denied propaga (sem retry silencioso)', async () => {
    sessionStorage.setItem('ac-reg-source', 'vitrine-affiliacore');
    vi.mocked(addDoc).mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await expect(createContactInquiry(input)).rejects.toThrow('offline');
    expect(addDoc).toHaveBeenCalledTimes(1);
  });
});
