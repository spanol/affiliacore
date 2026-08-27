// Postback S2S da Fomento (rede Offer18) — a PRIMEIRA integração por push.
//
// A Fomento é uma REDE (103 ofertas de cassino na mesma credencial, ver
// RECON-FOMENTO-OFFER18.md), não uma casa: a decisão de produto (18/08/2026) é
// "casas selecionadas" — cada oferta operada vira uma casa em /casas apontando o
// `offer_id` dela (campo `integrationExternalId` do doc da casa), e UM endpoint
// recebe os disparos de todas.
//
// Por que POSTBACK e não pull: a chave da Reports API ainda não existe (o
// operador gera no painel), e o postback NÃO é gated por ela — verificado ao
// vivo em 19/08/2026. O endpoint público `/api/postback/fomento` é gated por um
// SEGREDO na query (`s=`), guardado em `integrations/fomento-offer18` (tela
// /integracoes), porque IP atrás do Cloud Run não é barreira confiável sozinho.
//
// DESENHO DO DINHEIRO: o postback grava só CONTAGENS. O evento `lead` vira
// cadastro e o `ftd` vira FTD + CPA qualificado; `total_commission` fica em 0 e
// a comissão da casa DERIVA da taxa padrão dela (`defaultCpa` em EUR, conversão
// ao vivo na leitura — houseCommissionForRow), exatamente como toda casa EUR
// sem comissão importada já funciona. Converter na escrita congelaria uma
// cotação por evento e criaria um segundo regime de câmbio; o payout/currency
// crus ficam no LEDGER (`postback_events`) para auditoria e para a
// reconciliação futura via Reports API.
//
// O ledger é a fonte: cada evento vira um doc idempotente (id determinístico
// por offer|event|click) e as linhas de `house_results` do dia são RECOMPUTADAS
// a partir dele (mesma semântica de reescrita por data do pull — nunca duplica).
//
// Núcleo PURO (sem Firebase, sem fetch): o servidor guarda/consulta o ledger e
// delega aqui o parse, a idempotência e a agregação para `PullRow`.

import type { PullRow } from './housePull';

export const FOMENTO_INTEGRATION_ID = 'fomento-offer18';
export const FOMENTO_POSTBACK_PATH = '/api/postback/fomento';

/**
 * Template da URL a colar no postback global da Fomento (painel do afiliado).
 * Os nomes à esquerda são NOSSOS parâmetros; os tokens `{...}` são da Offer18.
 */
export const FOMENTO_POSTBACK_TEMPLATE =
  `${FOMENTO_POSTBACK_PATH}?s=SEGREDO&offer={offerid}&event={event_token}&click={aff_click_id}` +
  `&tag={sub_aff_id}&payout={payout}&currency={currency}&player={ig-user-id}`;

/** Evento como vive no ledger `postback_events` (campos que o recompute usa). */
export interface FomentoEventDoc {
  offerId: string;
  event: string;
  /** Tag NOSSA cunhada no link (`sub_aff_id`); '' = disparo sem tag. */
  tag: string;
  clickId: string;
  playerId: string;
  /** Payout/moeda CRUS do disparo — auditoria, nunca entram no house_results. */
  payout: number | null;
  currency: string;
  /** Dia BR (resolveServerToday) do RECEBIMENTO. */
  day: string;
}

export interface ParsedFomentoPostback {
  secret: string;
  offerId: string;
  event: string;
  tag: string;
  clickId: string;
  playerId: string;
  payout: number | null;
  currency: string;
}

// express entrega query como string | string[] | undefined; repetição de
// parâmetro (template colado duas vezes) fica com o primeiro valor.
const first = (v: unknown): string => {
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return typeof v === 'string' ? v.trim() : '';
};

/**
 * Lê a query do disparo. `offer` e `event` são obrigatórios: sem eles não há o
 * que contabilizar, e o 400 aparece no log de postback da própria Offer18 (é
 * como um template mal colado se denuncia). O resto é opcional de verdade:
 * disparo sem tag ainda conta no agregado da casa, igual ao tráfego órfão do pull.
 */
export function parseFomentoPostback(
  query: Record<string, unknown> | null | undefined,
): { ok: true; data: ParsedFomentoPostback } | { ok: false; error: string } {
  const q = query ?? {};
  const offerId = first(q.offer);
  if (!/^\d{1,20}$/.test(offerId)) {
    return { ok: false, error: 'Parâmetro "offer" ausente ou inválido (esperado o {offerid} da Offer18).' };
  }
  const event = first(q.event).toLowerCase();
  if (!event) {
    return { ok: false, error: 'Parâmetro "event" ausente (esperado o {event_token} da Offer18).' };
  }
  const payoutRaw = first(q.payout);
  const payoutNum = Number(payoutRaw);
  return {
    ok: true,
    data: {
      secret: first(q.s),
      offerId,
      event,
      tag: first(q.tag),
      clickId: first(q.click),
      playerId: first(q.player),
      payout: payoutRaw !== '' && Number.isFinite(payoutNum) ? payoutNum : null,
      currency: first(q.currency).toUpperCase(),
    },
  };
}

/**
 * O que cada evento SOMA nas métricas do dia. Mapa FECHADO e deliberadamente
 * conservador: evento desconhecido (a rede pode criar outros tokens) fica só no
 * ledger, sem inventar métrica — quando aparecer um novo, a decisão de contagem
 * é tomada aqui, com teste, não por coincidência de nome.
 *
 *   lead → cadastro (tier de 0 EUR da oferta; rastreado, não pago)
 *   ftd  → primeiro depósito E CPA qualificado (é o tier que paga o CPA)
 */
export function fomentoEventDeltas(
  event: string,
): Partial<Record<'registrations' | 'first_deposits' | 'qualified_cpa', number>> | null {
  const e = String(event ?? '').trim().toLowerCase();
  if (e === 'lead') return { registrations: 1 };
  if (e === 'ftd') return { first_deposits: 1, qualified_cpa: 1 };
  return null;
}

/**
 * DISPARO DE TESTE do painel × conversão de verdade.
 *
 * O painel da Offer18 tem "teste de postagem" por oferta, e ele substitui só o
 * `{offerid}` e o `{event_token}`: os demais tokens saem CRUS, com o texto
 * `replace_it` que a tela usa de placeholder. O `parseFomentoPostback` não tem
 * como recusar (offer e event chegam válidos), então o teste entrava no ledger
 * como um `ftd` qualquer e viraria 1 FTD + 1 CPA no próximo recompute — dinheiro
 * de uma conversão que não existiu, e margem CHEIA, porque a tag de placeholder
 * não é de ninguém e não gera repasse. Aconteceu duas vezes: BetFury (26/08) e
 * Cristal Poker (27/08), ambas ativações de casa nova.
 *
 * O discriminador é o CLICK ID, nunca a tag. Conversão real sempre carrega o
 * `aff_click_id` que a rede gerou no clique; um click id de placeholder só
 * existe se ninguém clicou. A tag NÃO serve para isso: tag órfã (`ref`, apelido
 * não cadastrado) acontece em conversão LEGÍTIMA cuja atribuição se perdeu, que
 * deve continuar contando no agregado e caindo na fila de pendentes.
 *
 * O evento segue GRAVADO no ledger de propósito: foi um disparo de teste que
 * revelou qual das duas ofertas clonadas da BetFury o tráfego usa. Ele só não
 * conta métrica.
 */
const PLACEHOLDER_CLICK_IDS = new Set(['replace_it']);

export function isFomentoTestFire(
  data: Pick<ParsedFomentoPostback, 'clickId'> | Pick<FomentoEventDoc, 'clickId'> | null | undefined,
): boolean {
  const click = String((data as any)?.clickId ?? '').trim().toLowerCase();
  if (!click) return false; // disparo sem click id é aceito e documentado
  // Token não resolvido ({aff_click_id}) ou o placeholder literal da tela.
  return /^\{.*\}$/.test(click) || PLACEHOLDER_CLICK_IDS.has(click);
}

// Id de doc do Firestore: sem '/', e com folga ampla sob o limite de 1500 bytes.
const sanitizeIdPart = (v: string): string => v.replace(/\//g, '_').slice(0, 120);

/**
 * Id determinístico do evento no ledger: mesmo (oferta, evento, click) → mesmo
 * doc, então o retry da Offer18 SOBRESCREVE em vez de duplicar — é a mesma
 * idempotência do `hrDocId` do import. Sem `aff_click_id` não há âncora de
 * dedupe e o chamador usa id automático (aceito e documentado: o template
 * recomendado sempre inclui `click={aff_click_id}`).
 */
export function fomentoPostbackDocId(data: Pick<ParsedFomentoPostback, 'offerId' | 'event' | 'clickId'>): string | null {
  const click = String(data?.clickId ?? '').trim();
  if (!click) return null;
  return `fpb__${sanitizeIdPart(data.offerId)}__${sanitizeIdPart(data.event)}__${sanitizeIdPart(click)}`;
}

export interface FomentoRowsResult {
  rows: PullRow[];
  /** Eventos que contaram em alguma métrica. */
  counted: number;
  /** Eventos de token desconhecido: ficam no ledger, fora das métricas. */
  ignored: number;
}

/**
 * Agrega o ledger em linhas `PullRow` (dia × tag) — o MESMO shape que os
 * conectores de pull entregam a `buildPullPayload`, que resolve tag → afiliado
 * pelo índice compartilhado com o import manual. Daqui para frente o caminho é
 * idêntico ao da Esportiva/LEON: agregado do dia + linhas atribuídas + fila de
 * tags pendentes.
 */
export function fomentoEventsToPullRows(events: FomentoEventDoc[] | null | undefined): FomentoRowsResult {
  const byKey = new Map<string, PullRow>();
  let counted = 0;
  let ignored = 0;

  for (const ev of Array.isArray(events) ? events : []) {
    const day = String(ev?.day ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    // Teste do painel: fica no ledger, fora das métricas. A guarda mora AQUI (e
    // não só na rota) porque este é o único caminho ledger -> dinheiro, então
    // ela vale também para evento já gravado antes do fix.
    if (isFomentoTestFire(ev)) {
      ignored++;
      continue;
    }
    const deltas = fomentoEventDeltas(ev?.event ?? '');
    if (!deltas) {
      ignored++;
      continue;
    }
    counted++;
    const tag = String(ev?.tag ?? '').trim();
    const key = `${day}|${tag.toLowerCase()}`;
    const row =
      byKey.get(key) ??
      byKey
        .set(key, {
          date: day,
          tag,
          registrations: 0,
          first_deposits: 0,
          qualified_cpa: 0,
          rvs: 0,
          deposit: 0,
          total_commission: 0,
        })
        .get(key)!;
    for (const [k, v] of Object.entries(deltas)) {
      (row as any)[k] += v;
    }
  }

  return { rows: [...byKey.values()], counted, ignored };
}
