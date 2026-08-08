import { authFetch } from '../lib/api';
import type { PublicIntegration } from '../lib/integrations';

// B7 · Integrações — o client NUNCA lê `integrations` do Firestore (a rule é
// `read, write: if false`, igual a auth_totp): tudo passa pelos endpoints admin,
// e a chave só volta MASCARADA. Mesmo padrão de payment_profiles/houses.

export type { PublicIntegration } from '../lib/integrations';

export interface IntegrationPatch {
  enabled?: boolean;
  /** string = nova chave; null = REMOVER; ausente/'' = não mexe na gravada. */
  apiKey?: string | null;
  houseId?: string | null;
  config?: Record<string, string>;
}

export async function fetchIntegrations(): Promise<PublicIntegration[]> {
  const response = await authFetch('/api/integrations', { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Erro ao carregar integrações: ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data?.integrations) ? data.integrations : [];
}

export async function saveIntegration(id: string, patch: IntegrationPatch): Promise<PublicIntegration> {
  const response = await authFetch(`/api/integrations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Erro ao salvar a integração: ${response.status}`);
  }
  return response.json();
}
