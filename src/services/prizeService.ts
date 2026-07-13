import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { authFetch } from '../lib/api';
import type { RankingPrizeInput } from '../lib/prizes';

// Premiações do ranking (chamariz de captação). Leitura direta do Firestore —
// regra de leitura PÚBLICA (a Home deslogada exibe os prêmios p/ atrair
// afiliados); escrita via servidor (requireAdmin), espelhando notices.

export interface Prize extends RankingPrizeInput {
  id: string;
  active: boolean;
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
}

// Realtime: usado pela Home pública, pelo /ranking e pela gestão do admin.
export function subscribeToPrizes(
  onData: (prizes: Prize[]) => void,
  onError?: (error: Error) => void,
) {
  const prizesQuery = query(collection(db, 'ranking_prizes'), orderBy('position', 'asc'));

  return onSnapshot(
    prizesQuery,
    (snapshot) => {
      const prizes = snapshot.docs.map((doc) => {
        const data = doc.data() as RankingPrizeInput & {
          createdAt?: Timestamp;
          updatedAt?: Timestamp;
          active?: boolean;
        };
        return {
          id: doc.id,
          position: data.position,
          title: data.title,
          description: data.description || '',
          active: data.active ?? true,
          createdAt: (data.createdAt as Timestamp | null) ?? null,
          updatedAt: (data.updatedAt as Timestamp | null) ?? null,
        } as Prize;
      });
      onData(prizes);
    },
    (error) => {
      onError?.(error);
    },
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

export async function createPrize(input: RankingPrizeInput): Promise<void> {
  const res = await authFetch('/api/prizes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) await readError(res, 'Falha ao criar premiação.');
}

export async function updatePrize(id: string, patch: Partial<RankingPrizeInput>): Promise<void> {
  const res = await authFetch(`/api/prizes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) await readError(res, 'Falha ao atualizar premiação.');
}

export async function deletePrize(id: string): Promise<void> {
  const res = await authFetch(`/api/prizes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) await readError(res, 'Falha ao remover premiação.');
}
