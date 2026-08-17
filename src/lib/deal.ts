// Núcleo PURO de ACORDOS (deals) — SEM Firebase, importável por client e server.ts.
// Um "deal" é uma OFERTA de uma operadora (casa): termos de comissão + metadados
// (modelo/ciclo/moeda/geo). Ao APROVAR uma parceria, a taxa do deal é gravada no
// affiliate_configs.byBrand[chave-da-casa] pela rota JÁ auditada — o núcleo de
// commission.ts NÃO muda (decisão 2026-07-21: "deal alimenta byBrand"). Ver
// PESQUISA-AFFILITY.md (modelo marketplace) e [[boost-productization]].

import { num, BrandRates } from './commission';
import { resolveDealType, dealPolicy, type DealTypeId } from './dealType';
import {
  resolveMoneyCurrency, resolveFxMode, normalizeFxInput, toBrl,
  type FxMode, type FxSpec, type FxQuotes, type MoneyCurrency,
} from './currency';

// Modelo de remuneração do acordo. pt-BR no display; chave estável no dado.
export type DealModel = 'cpa' | 'revshare' | 'hybrid';
// Ciclo de fechamento/pagamento (janela). `d30mais` (pedido da Infinity, 17/08/2026)
// é o fechamento em D+30 ou mais: a casa fecha o período e só libera o pagamento a
// partir de 30 dias. NÃO é o `mensal`, que é o mês de calendário, e a diferença
// importa para o afiliado saber quando o dinheiro cai.
export type PaymentCycle = 'semanal' | 'quinzenal' | 'mensal' | 'd30mais';
// Moeda do acordo (rótulo; o cálculo de comissão segue em R$ no núcleo).
export type DealCurrency = 'BRL' | 'EUR' | 'USD' | 'crypto';

export interface Deal {
  id: string;
  houseId: string;            // doc id em `houses` (= slug nas casas manuais)
  operatorName: string;       // nome da operadora (denormalizado p/ label/exibição)
  model: DealModel;
  // OPCIONAIS DE PROPÓSITO: num deal cujo tipo esconde as taxas do afiliado, o
  // SERVIDOR remove os dois campos da resposta (sanitizeDealForViewer). O tipo
  // reflete o que de fato chega ao client; quem escreve sempre grava os dois.
  cpaValue?: number;          // R$ por CPA qualificado (0 quando revshare puro)
  revPercentage?: number;     // % de RevShare (0 quando CPA puro)
  cycle: PaymentCycle;
  currency: DealCurrency;
  geo: string;                // mercado/país (ex.: "Brasil", "México"); livre
  active: boolean;
  order?: number;
  updatedAt?: any;
  // --- tipo de deal + KPIs da vitrine (2026-08-15) ---------------------------
  type?: DealTypeId;          // ausente = 'direto' (resolvido na leitura, sem migração)
  baseline?: number;          // R$; informativo, NÃO entra no núcleo de comissão
  rollover?: number;          // multiplicador (2 = "rollover 2x"); informativo
  ggrPercentage?: number | null; // % de GGR quando a casa tem; informativo
  // Meta MÍNIMA de CPAs qualificados por ciclo (pedido da Infinity, 17/08/2026).
  // É uma QUANTIDADE, não dinheiro, e é informativa: dizer ao afiliado quantas
  // qualificações a casa espera no período. NÃO entra no núcleo de comissão — quem
  // paga segue sendo `calcAffiliatePayout` sobre o que foi produzido de fato.
  // 0/ausente = a casa não estipulou meta (ausência ≠ meta de zero na tela: o card
  // simplesmente não desenha a linha).
  minCpaGoal?: number;
  // --- câmbio (pedido Infinity, 17/08/2026) ---------------------------------
  // `currency` já existia, mas era ETIQUETA: a taxa ia crua para o `byBrand` e o
  // núcleo de comissão a lia como reais, então um acordo em dólar pagava o mesmo
  // número em real. Agora a conversão é real, e o regime diz por qual cotação:
  // 'live' (do dia) ou 'fixed' (a que a agência digitou em `fxRate`).
  //
  // AUSENTE = 'none' = NÃO converte, que é exatamente o que o dado antigo fazia.
  // Qualquer outro default reinterpretaria acordos já gravados e multiplicaria a
  // comissão de alguém por 5 ou 6 sem ninguém ter pedido. O modal cuida de nascer
  // com 'live' no acordo NOVO em moeda estrangeira.
  fxMode?: FxMode;
  fxRate?: number | null; // R$ por 1 unidade da moeda; só vale no modo 'fixed'
}

export const DEAL_MODELS: DealModel[] = ['cpa', 'revshare', 'hybrid'];
export const PAYMENT_CYCLES: PaymentCycle[] = ['semanal', 'quinzenal', 'mensal', 'd30mais'];
export const DEAL_CURRENCIES: DealCurrency[] = ['BRL', 'EUR', 'USD', 'crypto'];

export const DEAL_MODEL_LABEL: Record<DealModel, string> = {
  cpa: 'CPA', revshare: 'RevShare', hybrid: 'Híbrido',
};
export const PAYMENT_CYCLE_LABEL: Record<PaymentCycle, string> = {
  semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', d30mais: 'D30+',
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

/**
 * Câmbio de um acordo. Moeda fora do trio conversível (o 'crypto' legado) resolve
 * como BRL e o regime ausente como 'none': os dois caminhos levam a "não converte",
 * que é o comportamento que o dado antigo já tinha.
 */
export function dealFxSpec(deal?: Partial<Pick<Deal, 'currency' | 'fxMode' | 'fxRate'>> | null): FxSpec {
  return {
    currency: resolveMoneyCurrency(deal?.currency, 'BRL'),
    fxMode: resolveFxMode(deal?.fxMode, 'none'),
    fxRate: deal?.fxRate ?? null,
  };
}

/** Moeda em que os valores do acordo estão escritos (p/ formatar na tela). */
export function dealCurrency(deal?: Partial<Pick<Deal, 'currency'>> | null): MoneyCurrency {
  return resolveMoneyCurrency(deal?.currency, 'BRL');
}

/**
 * Taxas que a APROVAÇÃO grava no byBrand do afiliado, SEMPRE em R$ — é a moeda do
 * núcleo de comissão, e é o que congela o que o afiliado ganha (decisão 17/08: a
 * casa continua flutuando, o repasse já concedido não).
 *
 * `null` quando o acordo está em moeda estrangeira com cotação fixa e sem valor:
 * quem chama tem que RECUSAR a aprovação em vez de gravar um número inventado.
 * REV é percentual e nunca converte.
 */
export function dealToBrandRates(
  deal: Partial<Pick<Deal, 'cpaValue' | 'revPercentage' | 'currency' | 'fxMode' | 'fxRate'>>,
  quotes?: FxQuotes
): BrandRates | null {
  const cpaBrl = toBrl(num(deal?.cpaValue), dealFxSpec(deal), quotes);
  if (cpaBrl == null) return null;
  return { cpaValue: cpaBrl, revPercentage: num(deal?.revPercentage) };
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

  // Tipo + KPIs da vitrine. O tipo é o eixo de POLÍTICA (quem vê a taxa, quem
  // precifica); as taxas acima seguem sendo o que a CASA paga à agência, em
  // qualquer tipo. Ver dealType.ts.
  const type = resolveDealType(raw?.type);
  const active = raw?.active !== false;
  const baseline = num(raw?.baseline);
  const rollover = num(raw?.rollover);
  const ggrPercentage = raw?.ggrPercentage == null || raw?.ggrPercentage === '' ? null : num(raw.ggrPercentage);
  if (baseline < 0 || rollover < 0 || (ggrPercentage != null && ggrPercentage < 0)) {
    return { error: 'Baseline, rollover e GGR não podem ser negativos.' };
  }
  // A meta é uma CONTAGEM de CPAs. "2,5 CPAs" não existe do lado da casa, e aceitar
  // o valor quebrado só empurraria o arredondamento para a tela, onde cada leitor
  // arredondaria de um jeito.
  const minCpaGoal = num(raw?.minCpaGoal);
  if (minCpaGoal < 0) return { error: 'A meta mínima de CPA não pode ser negativa.' };
  if (!Number.isInteger(minCpaGoal)) {
    return { error: 'A meta mínima de CPA é uma quantidade: use um número inteiro.' };
  }

  // Câmbio. O regime só é normalizado a partir do que CHEGOU (default 'none'): um
  // acordo antigo editado por outro motivo não pode ganhar conversão de brinde e
  // multiplicar o repasse de alguém. Quem escolhe converter é a tela.
  const fxMode = resolveFxMode(raw?.fxMode, 'none');
  const fx = normalizeFxInput(resolveMoneyCurrency(currency, 'BRL'), fxMode, raw?.fxRate);
  if ('error' in fx) return { error: fx.error };
  // A vitrine de um acordo que esconde as taxas é construída em torno da baseline:
  // publicar sem ela deixaria o afiliado com um card sem número nenhum. Só vale na
  // PUBLICAÇÃO — rascunho (inativo) pode estar incompleto de propósito.
  if (active && dealPolicy({ type }).kpis.includes('baseline') && baseline <= 0) {
    return { error: 'Informe a baseline antes de publicar este acordo na vitrine.' };
  }

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
      active,
      type,
      baseline,
      rollover,
      ggrPercentage,
      minCpaGoal,
      fxMode,
      fxRate: fx.fxRate,
      ...(Number.isFinite(Number(raw?.order)) ? { order: Number(raw.order) } : {}),
    },
  };
}

// Rascunho de acordo criado JUNTO com a casa (`POST /api/houses`), para o admin não
// precisar recadastrar a operadora em /acordos. Nasce INATIVO: um card sem baseline
// nem taxa na vitrine é pior que card nenhum, e é a mesma decisão que
// PESQUISA-PRESETS-DEALS.md tomou para os presets ("nunca publica direto no
// marketplace sem o admin revisar").
// NÃO passa por normalizeDealInput de propósito: o validador exige CPA > 0 para o
// modelo `cpa`, o que é certo na publicação e errado num rascunho vazio.
// Devolve null quando a casa não tem identidade (sem slug/id ou sem nome).
export function buildDraftDealFromHouse(
  house: { id?: string | null; slug?: string | null; name?: string | null },
  type: DealTypeId = 'direto'
): Omit<Deal, 'id'> | null {
  const houseId = String(house?.slug ?? house?.id ?? '').trim();
  const operatorName = String(house?.name ?? '').trim();
  if (!houseId || !operatorName) return null;
  return {
    houseId,
    operatorName,
    model: 'cpa',
    cpaValue: 0,
    revPercentage: 0,
    cycle: 'mensal',
    currency: 'BRL',
    geo: '',
    active: false,
    type: resolveDealType(type),
    baseline: 0,
    rollover: 0,
    ggrPercentage: null,
    minCpaGoal: 0,
    // Rascunho nasce em real: sem câmbio a resolver, e o admin troca no modal.
    fxMode: 'none',
    fxRate: null,
  };
}
