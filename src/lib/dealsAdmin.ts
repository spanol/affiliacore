// Núcleo PURO da tela de ACORDOS do admin (/acordos) — SEM Firebase, sem React.
// O que mora aqui é o que a página DECIDE: o rascunho do formulário (ida e volta
// entre o Deal e os campos de texto), quais KPIs o admin edita em cada tipo, o
// badge do card e o recorte das filas de parceria. Regra do repo: lógica testável
// sai do JSX. Ver PLANO-TIPOS-DE-DEAL.md (F3) e dealType.ts.

import {
  DEAL_TYPE_POLICY, DEAL_KPI_LABEL, resolveDealType,
  type DealTypeId, type DealKpiId,
} from './dealType';
import { formatDealKpiValue } from './dealShowcase';
import { num } from './commission';
import { resolveCpaCurrency, resolveFxMode, parseHouseCpaInput, type FxMode } from './currency';
import type { Deal, DealModel, PaymentCycle, DealCurrency } from './deal';
import type { PartnershipRequest, PartnershipStatus } from './partnership';

// Rascunho do modal. Os números viram STRING de propósito: um <input type="number">
// vazio precisa ser distinguível de zero (GGR vazio grava `null`, "a casa não tem
// GGR", e zero seria lido como "tem GGR de 0%").
export interface DealDraft {
  id?: string;
  houseId: string;
  operatorName: string;
  type: DealTypeId;
  model: DealModel;
  cpaValue: string;
  revPercentage: string;
  baseline: string;
  rollover: string;
  ggrPercentage: string;
  redepositRate: string;
  minCpaGoal: string;
  cycle: PaymentCycle;
  currency: DealCurrency;
  // Regime da cotação + a cotação fixa (texto no input, número no payload). Só
  // valem em moeda estrangeira; em real o câmbio não existe.
  fxMode: FxMode;
  fxRate: string;
  geo: string;
  active: boolean;
}

// CPA e RevShare do deal são o que a CASA paga à AGÊNCIA. O tipo `gerenciado` os
// esconde do AFILIADO (o servidor corta os campos em sanitizeDealForViewer), o que é
// outra coisa: para o admin eles seguem sempre editáveis, senão o valor que alimenta
// o byBrand na aprovação ficaria sem tela para ser preenchido.
export const ADMIN_ALWAYS_EDITABLE_KPIS: DealKpiId[] = ['cpa', 'revshare'];

// KPIs que o FORMULÁRIO do admin oferece para um tipo: os da política, mais os que o
// admin sempre edita. Sai da política, nunca de uma lista hardcoded na página, para
// um 3º tipo de deal aparecer sozinho.
export function adminDealKpis(type?: DealTypeId | null): DealKpiId[] {
  const policy = DEAL_TYPE_POLICY[resolveDealType(type)];
  const out: DealKpiId[] = [...ADMIN_ALWAYS_EDITABLE_KPIS];
  (policy?.kpis ?? []).forEach((k) => { if (!out.includes(k)) out.push(k); });
  return out;
}

export function adminEditsKpi(type: DealTypeId | null | undefined, kpi: DealKpiId): boolean {
  return adminDealKpis(type).includes(kpi);
}

export function emptyDealDraft(type: DealTypeId = 'direto'): DealDraft {
  return {
    houseId: '', operatorName: '', type: resolveDealType(type), model: 'cpa',
    cpaValue: '', revPercentage: '', baseline: '', rollover: '', ggrPercentage: '', redepositRate: '',
    minCpaGoal: '', cycle: 'mensal', currency: 'BRL', geo: '', active: true,
    fxMode: 'none', fxRate: '',
  };
}

// Zero vira campo VAZIO (e não "0") em todo número: o formulário mostra placeholder
// em vez de um zero que o admin teria que apagar antes de digitar.
const numToField = (v: any) => (v == null || Number(v) === 0 ? '' : String(v));

// O GGR é o ÚNICO campo em que vazio significa `null` ("a casa não tem GGR") em vez
// de zero. Por isso ele não pode usar `numToField`: um GGR gravado como 0% viraria
// campo vazio e, ao salvar de novo, `null` — o formulário apagaria em silêncio uma
// distinção que o resto do módulo faz questão de manter. Só a AUSÊNCIA esvazia.
const ggrToField = (v: any) => (v == null ? '' : String(v));

export function draftFromDeal(deal: Deal): DealDraft {
  return {
    id: deal.id,
    houseId: deal.houseId,
    operatorName: deal.operatorName,
    type: resolveDealType(deal.type),
    model: deal.model,
    cpaValue: numToField(deal.cpaValue),
    revPercentage: numToField(deal.revPercentage),
    baseline: numToField(deal.baseline),
    rollover: numToField(deal.rollover),
    ggrPercentage: ggrToField(deal.ggrPercentage),
    redepositRate: numToField(deal.redepositRate),
    minCpaGoal: numToField(deal.minCpaGoal),
    // Acordo ANTIGO não tem regime e resolve como 'none': o modal abre mostrando
    // "não converter", e é o admin que decide ligar a conversão. Ver deal.ts.
    fxMode: resolveFxMode(deal.fxMode, 'none'),
    fxRate: deal.fxRate != null ? String(deal.fxRate) : '',
    cycle: deal.cycle,
    currency: deal.currency,
    geo: deal.geo,
    active: deal.active,
  };
}

const fieldToNum = (v: string) => Number(String(v ?? '').trim()) || 0;
const isBlank = (v: string) => String(v ?? '').trim() === '';

// Payload de criação/edição. `ggrPercentage` vazio vai como `null` ("a casa não tem
// GGR"), NUNCA como 0: o normalizador do servidor guarda os dois valores e o card
// distingue ausência de zero. Os demais números caem em 0, que é o que o validador
// por modelo/tipo já sabe recusar quando for obrigatório.
export function buildDealPayload(draft: DealDraft): Partial<Deal> {
  return {
    houseId: draft.houseId,
    operatorName: draft.operatorName,
    type: resolveDealType(draft.type),
    model: draft.model,
    cpaValue: fieldToNum(draft.cpaValue),
    revPercentage: fieldToNum(draft.revPercentage),
    baseline: fieldToNum(draft.baseline),
    rollover: fieldToNum(draft.rollover),
    ggrPercentage: isBlank(draft.ggrPercentage) ? null : fieldToNum(draft.ggrPercentage),
    redepositRate: fieldToNum(draft.redepositRate),
    minCpaGoal: fieldToNum(draft.minCpaGoal),
    fxMode: draft.fxMode,
    // Vazio vira null (e o validador recusa 'fixed' sem cotação) — nunca 0, que
    // seria uma cotação configurada de zero real por dólar.
    fxRate: isBlank(draft.fxRate) ? null : parseHouseCpaInput(draft.fxRate, 'BRL'),
    cycle: draft.cycle,
    currency: draft.currency,
    geo: draft.geo,
    active: draft.active,
  };
}

export interface DealCardRow {
  id: DealKpiId | 'tipo';
  label: string;
  value: string | null;   // null = a tela desenha o placeholder de vazio
}

// As linhas de fato do card do acordo, no mesmo formato `<dl>` do card de CASA
// (/casas): rótulo à esquerda, valor à direita, uma linha por informação. Sai da
// POLÍTICA do tipo, então um 3º tipo de deal traz as linhas dele sozinho.
//
// Diferente do card do AFILIADO, aqui o valor ausente NÃO some: para o admin
// "Baseline —" é informação (é o que falta para publicar na vitrine), enquanto para
// o afiliado seria só uma linha vazia. Mesma decisão do card de casa, que mostra
// "URL de cadastro —".
//
// A única linha que some é a taxa que o MODELO não usa: num acordo CPA puro, uma
// linha "RevShare —" é ruído, não informação.
export function adminDealCardRows(deal?: Deal | null): DealCardRow[] {
  const type = resolveDealType(deal?.type);
  const rows: DealCardRow[] = [
    { id: 'tipo', label: 'Tipo', value: DEAL_TYPE_POLICY[type].label },
  ];
  for (const kpi of adminDealKpis(type)) {
    if (kpi === 'revshare' && deal?.model === 'cpa') continue;
    if (kpi === 'cpa' && deal?.model === 'revshare') continue;
    rows.push({ id: kpi, label: DEAL_KPI_LABEL[kpi], value: formatDealKpiValue(kpi, deal) });
  }
  return rows;
}

// --- Rascunhos das casas que ainda não têm acordo ---------------------------
// `POST /api/houses` já cria o acordo junto com a casa NOVA (rascunho inativo).
// Isso não alcança as casas que a agência configurou ANTES disso, nem a casa cujo
// rascunho o admin apagou: elas ficam invisíveis em /acordos e só reaparecem se
// alguém lembrar de clicar em "Novo acordo".
//
// A sugestão é VIRTUAL de propósito: nada é gravado até o admin abrir o modal e
// salvar. Materializar um doc por casa na leitura criaria acordo em nome de quem
// não pediu, e desfazer isso seria apagar dado em produção. Aqui, ativar/pausar
// uma casa faz a sugestão aparecer e sumir sem tocar em nada.

export interface DraftHouse {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  active?: boolean;
  order?: number | null;
  defaultCpa?: number | null;
  defaultRev?: number | null;
  cpaCurrency?: string | null;
  fxMode?: string | null;
  fxRate?: number | null;
}

// Chave da casa no acordo. O `houseId` do deal é o SLUG (= doc id das casas), e é
// também o `value` do select do modal, então os dois lados casam.
const houseKey = (h: DraftHouse): string => String(h?.id ?? h?.slug ?? '').trim();

// A casa pode aparecer no deal pelo slug OU pelo id (iguais na prática, doc id =
// slug); comparar os dois evita sugerir um acordo que já existe.
function houseHasDeal(house: DraftHouse, dealHouseIds: Set<string>): boolean {
  return [house?.id, house?.slug]
    .map((v) => String(v ?? '').trim())
    .some((v) => v !== '' && dealHouseIds.has(v));
}

// Rascunho do formulário pré-preenchido com o que a agência JÁ configurou na casa.
// O CPA/REV padrão da casa é a comissão casa→agência (houseService.defaultCpa), que
// é exatamente o que `cpaValue`/`revPercentage` do acordo significam, então copiar
// é o ponto da sugestão. A MOEDA acompanha o número copiado (a casa guarda em qual
// moeda paga o CPA, e ausente = EUR no núcleo de dinheiro): mandar o valor sem a
// moeda dele seria trocar a unidade em silêncio.
// Nasce `active: true`, ao contrário do rascunho que o servidor cria sozinho: aqui
// há um humano no modal revisando antes de salvar, e o validador de publicação
// ainda barra o que estiver incompleto (ex.: baseline no tipo gerenciado).
export function draftFromHouse(house: DraftHouse, type: DealTypeId = 'direto'): DealDraft {
  const cpa = num(house?.defaultCpa);
  const rev = num(house?.defaultRev);
  const model: DealModel = cpa > 0 && rev > 0 ? 'hybrid' : cpa <= 0 && rev > 0 ? 'revshare' : 'cpa';
  return {
    ...emptyDealDraft(type),
    houseId: houseKey(house),
    operatorName: String(house?.name ?? '').trim(),
    model,
    cpaValue: cpa > 0 ? String(cpa) : '',
    revPercentage: rev > 0 ? String(rev) : '',
    currency: cpa > 0 ? (resolveCpaCurrency(house?.cpaCurrency) as DealCurrency) : 'BRL',
    // O REGIME acompanha a moeda copiada: sugerir "US$ 100" sem dizer por qual
    // cotação deixaria o acordo em `none`, ou seja, US$ 100 pagos como R$ 100.
    fxMode: cpa > 0 ? resolveFxMode(house?.fxMode, 'live') : 'none',
    fxRate: house?.fxRate != null ? String(house.fxRate) : '',
  };
}

export interface HouseDraftCard {
  key: string;            // slug da casa; chave de lista e do modal
  house: DraftHouse;
  draft: DealDraft;       // o que o modal abre ao clicar em "Criar acordo"
  rows: DealCardRow[];    // as MESMAS linhas do card de acordo, já com a sugestão
}

// Casas configuradas que ainda não têm acordo, na ordem do card de casa (/casas).
//
// Casa PAUSADA fica de fora: o acordo dela não apareceria na vitrine de ninguém
// (o GET /api/deals filtra casa inativa), então sugerir a oferta agora é ruído.
// Reativar a casa traz a sugestão de volta, sem migração nem dado tocado.
// Casa sem nome também fica de fora, pela mesma razão que
// `buildDraftDealFromHouse` devolve null: acordo sem operadora não é acordo.
export function buildHouseDraftCards(
  houses: DraftHouse[] | null | undefined,
  deals: Array<Pick<Deal, 'houseId'>> | null | undefined,
  type: DealTypeId = 'direto',
): HouseDraftCard[] {
  const dealHouseIds = new Set(
    (Array.isArray(deals) ? deals : [])
      .map((d) => String(d?.houseId ?? '').trim())
      .filter(Boolean),
  );
  return (Array.isArray(houses) ? houses : [])
    .filter((h) => houseKey(h) && String(h?.name ?? '').trim() && h?.active !== false)
    .filter((h) => !houseHasDeal(h, dealHouseIds))
    .sort((a, b) => num(a?.order) - num(b?.order)
      || String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'pt-BR'))
    .map((house) => {
      const draft = draftFromHouse(house, type);
      // O card mostra as linhas do acordo que SERIA criado, com os mesmos rótulos
      // e a mesma ordem do card de acordo. `id` vazio: este deal não existe.
      const virtual = { id: '', ...buildDealPayload(draft) } as Deal;
      return { key: houseKey(house), house, draft, rows: adminDealCardRows(virtual) };
    });
}

export interface AdminPartnershipQueues {
  pending: PartnershipRequest[];      // `requested`: esperando a decisão da agência
  awaitingLink: PartnershipRequest[]; // `priced`: o gerente precificou, falta o link
  decided: PartnershipRequest[];      // aprovada/recusada/encerrada
}

// `priced` NÃO é uma parceria decidida: ela ainda espera uma ação do admin (emitir o
// link). Jogá-la no balaio de "decididas" esconderia a fila justamente de quem tem
// que atendê-la, que é o ponto da aba nova.
export function selectAdminPartnershipQueues(requests: PartnershipRequest[]): AdminPartnershipQueues {
  const list = Array.isArray(requests) ? requests : [];
  return {
    pending: list.filter((r) => r?.status === 'requested'),
    awaitingLink: list.filter((r) => r?.status === 'priced'),
    decided: list.filter((r) => r?.status !== 'requested' && r?.status !== 'priced'),
  };
}

// Mensagem do toast depois de decidir. Aprovar a partir de `priced` NÃO reescreve a
// taxa: quem precificou foi o gerente e o servidor preserva o valor dele. Dizer
// "taxa aplicada" ali seria mentira na tela sobre o dinheiro que foi gravado.
export function partnershipDecisionMessage(
  from: PartnershipStatus,
  to: 'approved' | 'rejected' | 'discontinued'
): string {
  if (to === 'rejected') return 'Parceria recusada.';
  if (to === 'discontinued') return 'Parceria encerrada.';
  return from === 'priced'
    ? 'Link emitido. A comissão definida pelo gerente foi mantida.'
    : 'Parceria aprovada. Taxa aplicada e link emitido.';
}
