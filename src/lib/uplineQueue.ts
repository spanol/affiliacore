// Núcleo PURO da FILA DO GERENTE — SEM Firebase, sem React.
// Num acordo do tipo `gerenciado` o afiliado solicita e quem define a comissão dele
// é o gerente (call Infinity, 15/08). Esta é a derivação que a tela do especial
// (/network/afiliados) usa para montar essa fila e para saber, ANTES de bater no
// servidor, se a taxa que ele digitou passa. Ver PLANO-TIPOS-DE-DEAL.md (F5).
//
// As regras aqui ESPELHAM as do servidor de propósito (mesma fonte pura:
// resolveRepasseCap/hasConfiguredRate). O servidor continua sendo a barreira; a tela
// só evita mandar o usuário bater numa porta que já se sabe fechada.

import { dealBrandKey } from './deal';
import { resolveRepasseCap, hasConfiguredRate } from './network';
import { num, type AffiliateConfig, type BrandRates } from './commission';
import type { PartnershipRequest } from './partnership';

export interface UplineQueueItem {
  request: PartnershipRequest;
  brandKey: string;          // chave da casa no byBrand (brandId OTG ou slug manual)
  houseName: string;
  cap: BrandRates;           // teto = a taxa PRÓPRIA do gerente NAQUELA casa
  capConfigured: boolean;    // ele tem taxa nessa casa? ausência ≠ R$ 0
}

type HouseLike = { id?: string | null; slug?: string | null; brandId?: string | null; name?: string | null };

/**
 * A fila do gerente: as solicitações dos filhos DIRETOS que esperam a comissão.
 *
 * Só `requested`, e só filho DIRETO. É a mesma fronteira que `isDirectDownline`
 * aplica na escrita: mostrar o neto aqui renderia uma fila que a rota recusa com
 * 403, e mostrar a própria solicitação do gerente o deixaria precificar a si mesmo.
 */
export function buildUplineQueue(
  requests: PartnershipRequest[] | null | undefined,
  directSubIds: string[] | null | undefined,
  houses: HouseLike[] | null | undefined,
  ownConfig: AffiliateConfig | null | undefined,
): UplineQueueItem[] {
  const diretos = new Set((Array.isArray(directSubIds) ? directSubIds : []).map(String));
  const byId = new Map<string, HouseLike>();
  for (const h of Array.isArray(houses) ? houses : []) {
    const key = String(h?.slug ?? h?.id ?? '');
    if (key) byId.set(key, h);
  }
  return (Array.isArray(requests) ? requests : [])
    .filter((r) => r?.status === 'requested' && diretos.has(String(r?.affiliateId)))
    .map((request) => {
      const house = byId.get(String(request.houseId ?? '')) ?? { slug: String(request.houseId ?? '') };
      const brandKey = dealBrandKey(house);
      return {
        request,
        brandKey,
        houseName: String(house?.name ?? request.operatorName ?? brandKey),
        cap: resolveRepasseCap(ownConfig, brandKey),
        capConfigured: hasConfiguredRate(ownConfig, brandKey),
      };
    });
}

/**
 * A taxa digitada pode ser gravada? Devolve a mensagem pt-BR do problema, ou null.
 *
 * Espelha as recusas do servidor, na MESMA ordem, para a tela não prometer algo que
 * a rota nega. O caso do gerente sem taxa na casa vem ANTES do teto: com cap zerado
 * a mensagem de teto diria "o teto é R$ 0", jogando no gerente um problema que é da
 * agência resolver (ausência ≠ R$ 0).
 */
export function pricingError(
  item: Pick<UplineQueueItem, 'cap' | 'capConfigured'>,
  rates: { cpaValue: any; revPercentage: any },
): string | null {
  if (!item?.capConfigured) {
    return 'Você ainda não tem taxa nesta casa. Peça à agência antes de definir a comissão do seu afiliado.';
  }
  const cpa = num(rates?.cpaValue);
  const rev = num(rates?.revPercentage);
  if (cpa < 0 || rev < 0) return 'Valores não podem ser negativos.';
  if (cpa > item.cap.cpaValue || rev > item.cap.revPercentage) {
    return `A comissão do afiliado não pode passar da sua taxa nesta casa (teto: R$ ${item.cap.cpaValue}/CPA e ${item.cap.revPercentage}% REV).`;
  }
  return null;
}

/** O que sobra para o gerente em cada conversão, com a taxa que ele digitou. */
export function spreadPreview(
  item: Pick<UplineQueueItem, 'cap'>,
  rates: { cpaValue: any; revPercentage: any },
): BrandRates {
  return {
    cpaValue: num(item?.cap?.cpaValue) - num(rates?.cpaValue),
    revPercentage: num(item?.cap?.revPercentage) - num(rates?.revPercentage),
  };
}
