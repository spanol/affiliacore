import { authFetch } from '../lib/api';
import type { FomentoOfferSummary } from '../lib/fomentoOffers';

// Ofertas da rede Fomento vistas pelo ledger. O client NUNCA lê `postback_events`
// direto (coleção server-only, sem rule): tudo passa pelo endpoint admin, mesmo
// padrão de `integrations` e `payment_profiles`.

export type { FomentoOfferSummary } from '../lib/fomentoOffers';

export interface FomentoOffersResponse {
  offers: FomentoOfferSummary[];
  /**
   * Template de link derivado de uma casa Fomento que já existe nesta instância.
   * `null` = label estreando na rede: a tela pede o template ao admin em vez de
   * montar um com a conta de outro cliente.
   */
  linkTemplate: string | null;
}

export async function fetchFomentoOffers(): Promise<FomentoOffersResponse> {
  const response = await authFetch('/api/fomento/offers', { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).error || `Erro ao carregar as ofertas: ${response.status}`);
  }
  const data = await response.json();
  return {
    offers: Array.isArray(data?.offers) ? data.offers : [],
    linkTemplate: typeof data?.linkTemplate === 'string' ? data.linkTemplate : null,
  };
}
