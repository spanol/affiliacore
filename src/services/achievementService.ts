import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { authFetch } from '../lib/api';
import type { AchievementTierInput, AchievementTotals } from '../lib/achievements';

// Conquistas por meta individual (o "Ranking de Conquistas" do legado).
// CATÁLOGO (`achievement_tiers`): leitura direta do Firestore — regra
// signed-in-read, é o roadmap que o afiliado persegue; escrita via servidor.
// SOLICITAÇÕES: server-only nas rules (carregam o snapshot de ganhos do
// afiliado) — tudo pelo endpoint escopado por papel.

export interface AchievementTierDoc extends AchievementTierInput {
  id: string;
  active: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AchievementRequestDoc {
  id: string;
  tierId: string;
  tierTitle?: string;
  affiliateId: string;
  affiliateName?: string;
  status: 'pending' | 'approved' | 'rejected';
  snapshot?: AchievementTotals;
  note?: string;
  createdAt?: Timestamp | null;
  decidedAt?: Timestamp | null;
}

// Realtime: usado pela tela do afiliado e pela gestão do admin. Sem orderBy no
// servidor — a ordenação do roadmap é a pura `sortTiers` (order → dificuldade),
// que o Firestore não expressa num índice simples.
export function subscribeToAchievementTiers(
  onData: (tiers: AchievementTierDoc[]) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(db, 'achievement_tiers')),
    (snapshot) => {
      onData(
        snapshot.docs.map((doc) => {
          const data = doc.data() as any;
          return {
            id: doc.id,
            title: data.title ?? '',
            subtitle: data.subtitle ?? '',
            description: data.description ?? '',
            metaCpas: Number(data.metaCpas) || 0,
            metaCommission: Number(data.metaCommission) || 0,
            order: Number(data.order) || 0,
            active: data.active ?? true,
            imageUrl: data.imageUrl ?? '',
            createdAt: (data.createdAt as Timestamp | null) ?? null,
            updatedAt: (data.updatedAt as Timestamp | null) ?? null,
          } as AchievementTierDoc;
        }),
      );
    },
    (error) => onError?.(error),
  );
}

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const data = await res.json();
    if (data?.error) message = data.error;
  } catch {
    /* corpo não-JSON */
  }
  throw new Error(message);
}

export async function createAchievementTier(input: AchievementTierInput): Promise<void> {
  const res = await authFetch('/api/achievement-tiers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) await readError(res, 'Falha ao criar conquista.');
}

export async function updateAchievementTier(
  id: string,
  patch: Partial<AchievementTierInput>,
): Promise<void> {
  const res = await authFetch(`/api/achievement-tiers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) await readError(res, 'Falha ao atualizar conquista.');
}

export async function deleteAchievementTier(id: string): Promise<void> {
  const res = await authFetch(`/api/achievement-tiers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) await readError(res, 'Falha ao remover conquista.');
}

// Admin → todas; afiliado → só as próprias (escopo no servidor).
export async function fetchAchievementRequests(): Promise<AchievementRequestDoc[]> {
  try {
    const res = await authFetch('/api/achievement-requests', { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.requests) ? data.requests : [];
  } catch (error) {
    console.error('Error fetching achievement requests:', error);
    return [];
  }
}

export async function requestAchievement(tierId: string, snapshot: AchievementTotals): Promise<void> {
  const res = await authFetch('/api/achievement-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tierId, snapshot }),
  });
  if (!res.ok) await readError(res, 'Falha ao solicitar o prêmio.');
}

export async function decideAchievementRequest(
  id: string,
  status: 'approved' | 'rejected',
  note?: string,
): Promise<void> {
  const res = await authFetch(`/api/achievement-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note: note ?? '' }),
  });
  if (!res.ok) await readError(res, 'Falha ao decidir a solicitação.');
}
