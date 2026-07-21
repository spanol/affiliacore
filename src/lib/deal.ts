// Núcleo PURO de ACORDOS (deals) — SEM Firebase, importável por client e server.ts.
// Um "deal" é uma OFERTA de uma operadora (casa): termos de comissão + metadados
// (modelo/ciclo/moeda/geo). Ao APROVAR uma parceria, a taxa do deal é gravada no
// affiliate_configs.byBrand[chave-da-casa] pela rota JÁ auditada — o núcleo de
// commission.ts NÃO muda (decisão 2026-07-21: "deal alimenta byBrand"). Ver
// PESQUISA-AFFILITY.md (modelo marketplace) e [[boost-productization]].

import { num, BrandRates } from './commission';

// Modelo de remuneração do acordo. pt-BR no display; chave estável no dado.
export type DealModel = 'cpa' | 'revshare' | 'hybrid';
// Ciclo de fechamento/pagamento (janela).
export type PaymentCycle = 'semanal' | 'quinzenal' | 'mensal';
// Moeda do acordo (rótulo; o cálculo de comissão segue em R$ no núcleo).
export type DealCurrency = 'BRL' | 'EUR' | 'USD' | 'crypto';

export interface Deal {
  id: string;
  houseId: string;            // doc id em `houses` (= slug nas casas manuais)
  operatorName: string;       // nome da operadora (denormalizado p/ label/exibição)
  model: DealModel;
  cpaValue: number;           // R$ por CPA qualificado (0 quando revshare puro)
  revPercentage: number;      // % de RevShare (0 quando CPA puro)
  cycle: PaymentCycle;
  currency: DealCurrency;
  geo: string;                // mercado/país (ex.: "Brasil", "México"); livre
  active: boolean;
  order?: number;
  updatedAt?: any;
}

export const DEAL_MODELS: DealModel[] = ['cpa', 'revshare', 'hybrid'];
export const PAYMENT_CYCLES: PaymentCycle[] = ['semanal', 'quinzenal', 'mensal'];
export const DEAL_CURRENCIES: DealCurrency[] = ['BRL', 'EUR', 'USD', 'crypto'];

export const DEAL_MODEL_LABEL: Record<DealModel, string> = {
  cpa: 'CPA', revshare: 'RevShare', hybrid: 'Híbrido',
};
export const PAYMENT_CYCLE_LABEL: Record<PaymentCycle, string> = {
  semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal',
};

// Rótulo legível do acordo, no padrão Affility: "Operadora - Modelo - Ciclo - Moeda -
// Geo". Partes vazias somem (sem hífens órfãos). Usado em cards/links/ranking.
export function buildDealLabel(d: {
  operatorName?: string; model?: DealModel; cycle?: PaymentCycle;
  currency?: DealCurrency; geo?: string;
}): string {
  const parts = [
    (d.operatorName || '').trim(),
    d.model ? DEAL_MODEL_LABEL[d.model] : '',
    d.cycle ? PAYMENT_CYCLE_LABEL[d.cycle] : '',
    d.currency || '',
    (d.geo || '').trim(),
  ].filter((p) => p && String(p).length > 0);
  return parts.join(' - ');
}

// Chave do byBrand p/ a casa do deal. O núcleo de comissão chaveia o override por
// CASA por `brandKeyOf(slug) = brandId-conhecido ?? slug` (affiliateService:996):
// casas OTG usam o brandId real; casas MANUAIS (instância OTG-free) usam o SLUG.
// Portanto a taxa do deal aprovado tem que ir p/ byBrand[brandId ?? slug] — senão
// não casaria com a agregação por casa (lucro/ranking). houseId == slug nas manuais.
export function dealBrandKey(house: { brandId?: string | null; slug?: string | null; id?: string | null }): string {
  const brandId = house?.brandId;
  if (brandId != null && String(brandId).trim()) return String(brandId);
  return String(house?.slug ?? house?.id ?? '');
}

// Taxas que a APROVAÇÃO grava no byBrand do afiliado. O que o afiliado ganha = os
// termos do deal (CPA em R$, REV em %). num() blinda contra valor malformado.
export function dealToBrandRates(deal: Pick<Deal, 'cpaValue' | 'revPercentage'>): BrandRates {
  return { cpaValue: num(deal?.cpaValue), revPercentage: num(deal?.revPercentage) };
}

// Normaliza/valida a entrada de criação/edição de deal (server e form). Devolve o
// objeto saneado OU um erro pt-BR. cpaValue/revPercentage ≥ 0; modelo/ciclo/moeda
// restritos ao enum; houseId e operatorName obrigatórios. Não lança.
export function normalizeDealInput(raw: any): { deal?: Omit<Deal, 'id'>; error?: string } {
  const houseId = String(raw?.houseId ?? '').trim();
  if (!houseId) return { error: 'Selecione a operadora (casa) do acordo.' };
  const operatorName = String(raw?.operatorName ?? '').trim();
  if (!operatorName) return { error: 'Nome da operadora é obrigatório.' };

  const model: DealModel = DEAL_MODELS.includes(raw?.model) ? raw.model : 'cpa';
  const cycle: PaymentCycle = PAYMENT_CYCLES.includes(raw?.cycle) ? raw.cycle : 'mensal';
  const currency: DealCurrency = DEAL_CURRENCIES.includes(raw?.currency) ? raw.currency : 'BRL';

  const cpaValue = num(raw?.cpaValue);
  const revPercentage = num(raw?.revPercentage);
  if (cpaValue < 0 || revPercentage < 0) return { error: 'CPA e RevShare não podem ser negativos.' };
  if (model === 'cpa' && cpaValue <= 0) return { error: 'Acordo CPA precisa de um valor de CPA maior que zero.' };
  if (model === 'revshare' && revPercentage <= 0) return { error: 'Acordo RevShare precisa de um percentual maior que zero.' };
  if (model === 'hybrid' && cpaValue <= 0 && revPercentage <= 0) return { error: 'Acordo híbrido precisa de CPA ou RevShare.' };

  return {
    deal: {
      houseId,
      operatorName,
      model,
      cpaValue,
      revPercentage,
      cycle,
      currency,
      geo: String(raw?.geo ?? '').trim(),
      active: raw?.active !== false,
      ...(Number.isFinite(Number(raw?.order)) ? { order: Number(raw.order) } : {}),
    },
  };
}
