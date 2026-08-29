// Ofertas da Fomento vistas pelo LEDGER — o núcleo da tela /fomento.
//
// POR QUE ESTA TELA EXISTE: ativar uma casa da rede era um ritual manual de três
// passos (achar a oferta e o CPA, criar a casa no shape certo, conferir se o
// offer_id já não era de outra casa). Foi feito à mão para BetFury (26/08),
// Cristal Poker (27/08) e Ivibet (28/08), sempre lendo o mesmo sinal: um disparo
// chegou numa oferta que ainda não tem casa.
//
// A FONTE É O LEDGER, não a Offers API. A chave da Reports/Offers API da Offer18
// ainda não existe (o operador a gera no painel — ver RECON-FOMENTO-OFFER18.md),
// então não dá para listar as 103 ofertas aprovadas da conta. O que dá, e é o que
// interessa na prática, é listar as ofertas que JÁ DISPARARAM: é exatamente o
// momento em que a casa precisa existir. Quando a chave aparecer, o adapter da
// Offers API preenche o MESMO shape (nome e logo da oferta entram como campos
// novos) sem mexer na tela.
//
// O ACHADO QUE JUSTIFICA O DESTAQUE: oferta com conversão REAL e sem casa é
// dinheiro chegando sem onde pousar. O evento fica retido no ledger (a rota
// responde `unmapped` e não recomputa), ninguém vê na /casas, e só entra quando
// alguém liga a casa e reprocessa. Hoje isso é invisível; aqui é a primeira linha.

import { isFomentoTestFire, type FomentoEventDoc } from './fomentoPostback';

export interface FomentoOfferSummary {
  offerId: string;
  /** Casa já vinculada a esta oferta, se houver. */
  houseSlug: string | null;
  houseName: string | null;
  /** Eventos que contam métrica (exclui os disparos de teste do painel). */
  events: number;
  /** Disparos de teste do painel: provam alcance, não são conversão. */
  tests: number;
  ftd: number;
  lead: number;
  /** Token que o mapa de eventos não conhece: fica no ledger, fora das métricas. */
  unknown: number;
  /**
   * CPA sugerido = payout observado nos eventos `ftd`, que é o tier que paga.
   * `lead` vem com 0 na rede e envenenaria a média, então não entra.
   */
  cpaHint: number | null;
  currency: string;
  /** Mais de um payout de `ftd` observado: a sugestão não é confiável sozinha. */
  cpaConflict: boolean;
  firstDay: string;
  lastDay: string;
  /** Tags vistas em evento que conta (sem as de teste), ordenadas. */
  tags: string[];
  /** Subconjunto de `tags` que nenhum link/apelido reivindica. */
  unattributedTags: string[];
}

export interface FomentoOfferHouse {
  slug: string;
  name?: string | null;
  integration?: string | null;
  integrationExternalId?: string | null;
}

const FOMENTO = 'fomento-offer18';

/** Mapa offer_id → casa, só entre as casas que declaram a integração da Fomento. */
export function houseByOfferMap(
  houses: FomentoOfferHouse[] | null | undefined,
): Map<string, FomentoOfferHouse> {
  const map = new Map<string, FomentoOfferHouse>();
  for (const h of Array.isArray(houses) ? houses : []) {
    if (String(h?.integration ?? '').trim() !== FOMENTO) continue;
    const offer = String(h?.integrationExternalId ?? '').trim();
    if (offer) map.set(offer, h);
  }
  return map;
}

/**
 * Agrupa o ledger por oferta. `tagIndex` é o MESMO do import/recompute (links +
 * apelidos): passar ausente só faz toda tag aparecer como não atribuída, nunca
 * inventa dono.
 *
 * Ordem: primeiro o que exige ação (oferta SEM casa, mais recente antes), depois
 * as já vinculadas. É a fila de trabalho da tela, não um relatório alfabético.
 */
export function summarizeFomentoOffers(
  events: FomentoEventDoc[] | null | undefined,
  houses: FomentoOfferHouse[] | null | undefined,
  tagIndex?: Map<string, { affiliateId: string }> | null,
): FomentoOfferSummary[] {
  const byOffer = houseByOfferMap(houses);
  const index = tagIndex instanceof Map ? tagIndex : new Map<string, { affiliateId: string }>();

  interface Acc {
    offerId: string;
    events: number; tests: number; ftd: number; lead: number; unknown: number;
    ftdPayouts: Set<number>;
    currency: string;
    days: string[];
    tags: Set<string>;
  }
  const acc = new Map<string, Acc>();

  for (const ev of Array.isArray(events) ? events : []) {
    const offerId = String(ev?.offerId ?? '').trim();
    if (!offerId) continue;
    const cur = acc.get(offerId) ?? acc.set(offerId, {
      offerId, events: 0, tests: 0, ftd: 0, lead: 0, unknown: 0,
      ftdPayouts: new Set<number>(), currency: '', days: [], tags: new Set<string>(),
    }).get(offerId)!;

    const day = String(ev?.day ?? '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) cur.days.push(day);

    // Teste do painel entra na contagem PRÓPRIA: some da métrica mas continua
    // visível, porque é ele que prova que o postback daquela oferta chega aqui.
    if (isFomentoTestFire(ev)) {
      cur.tests++;
      // O teste carrega o payout configurado na oferta — é a melhor pista de CPA
      // que existe antes de a Offers API abrir, e foi assim que Cristal (30 EUR) e
      // Ivibet (10 EUR) foram precificadas.
      const p = Number(ev?.payout);
      if (String(ev?.event ?? '').toLowerCase() === 'ftd' && Number.isFinite(p) && p > 0) cur.ftdPayouts.add(p);
      if (!cur.currency && ev?.currency) cur.currency = String(ev.currency).toUpperCase();
      continue;
    }

    cur.events++;
    const event = String(ev?.event ?? '').trim().toLowerCase();
    if (event === 'ftd') {
      cur.ftd++;
      const p = Number(ev?.payout);
      if (Number.isFinite(p) && p > 0) cur.ftdPayouts.add(p);
    } else if (event === 'lead') {
      cur.lead++;
    } else {
      cur.unknown++;
    }
    if (!cur.currency && ev?.currency) cur.currency = String(ev.currency).toUpperCase();
    const tag = String(ev?.tag ?? '').trim();
    if (tag) cur.tags.add(tag);
  }

  const rows: FomentoOfferSummary[] = [];
  for (const a of acc.values()) {
    const house = byOffer.get(a.offerId) ?? null;
    const days = a.days.slice().sort();
    const tags = [...a.tags].sort((x, y) => x.localeCompare(y));
    const payouts = [...a.ftdPayouts];
    rows.push({
      offerId: a.offerId,
      houseSlug: house?.slug ?? null,
      houseName: house?.name ?? null,
      events: a.events,
      tests: a.tests,
      ftd: a.ftd,
      lead: a.lead,
      unknown: a.unknown,
      // Conflito não escolhe por maioria: devolve o MAIOR e sinaliza, para o admin
      // conferir no painel em vez de a tela decidir dinheiro sozinha.
      cpaHint: payouts.length ? Math.max(...payouts) : null,
      cpaConflict: payouts.length > 1,
      currency: a.currency || 'EUR',
      firstDay: days[0] ?? '',
      lastDay: days[days.length - 1] ?? '',
      tags,
      unattributedTags: tags.filter((t) => !index.get(t.toLowerCase())?.affiliateId),
    });
  }

  return rows.sort((x, y) => {
    const xPend = x.houseSlug ? 1 : 0;
    const yPend = y.houseSlug ? 1 : 0;
    if (xPend !== yPend) return xPend - yPend;      // sem casa primeiro
    if (x.lastDay !== y.lastDay) return y.lastDay.localeCompare(x.lastDay);
    return x.offerId.localeCompare(y.offerId);
  });
}

/** Oferta sem casa que já recebeu conversão REAL: dinheiro sem onde pousar. */
export function isOrphanWithTraffic(o: FomentoOfferSummary): boolean {
  return !o.houseSlug && o.events > 0;
}

/**
 * Sugestão de cadastro a partir do que o ledger sabe. O NOME não sai daqui: o
 * ledger não guarda o nome da oferta, e chutar viraria o nome que o afiliado lê
 * na vitrine. Quem digita é o admin, e o ícone resolve sozinho pelo preset quando
 * o nome bate com uma casa conhecida (findHousePresetFor).
 */
export function draftHouseFromOffer(
  o: FomentoOfferSummary,
  linkTemplate: string,
): { integration: string; integrationExternalId: string; dataSource: 'manual'; defaultCpa: number | null; cpaCurrency: string; fxMode: 'live'; registerUrlTemplate: string } {
  return {
    integration: FOMENTO,
    integrationExternalId: o.offerId,
    dataSource: 'manual',
    defaultCpa: o.cpaHint,
    cpaCurrency: o.currency || 'EUR',
    fxMode: 'live',
    registerUrlTemplate: linkTemplate.replace('<OFFER_ID>', o.offerId),
  };
}

/**
 * Template do link de cadastro, DERIVADO de uma casa Fomento que já existe: troca
 * só o `o=<offer_id>` e preserva domínio, `m` (mid), `a` (aid) e o param de tag
 * exatamente como aquela instância os usa.
 *
 * Por que derivar em vez de montar: o domínio e a conta são da LABEL, não do
 * produto (o link da Infinity carrega `m=7910&a=703626`). Montar com a conta de
 * um cliente embutida no código emitiria link válido apontando para a conta
 * ERRADA numa label nova — erro silencioso, do tipo que só aparece no fechamento.
 * Sem casa irmã (label estreando na rede) devolve `null` e a tela pede o template
 * ao admin, que o copia do botão "link de rastreamento" do painel.
 */
export function deriveFomentoLinkTemplate(
  houses: FomentoOfferHouse[] | null | undefined,
): string | null {
  for (const h of Array.isArray(houses) ? houses : []) {
    if (String(h?.integration ?? '').trim() !== FOMENTO) continue;
    const url = String((h as any)?.registerUrlTemplate ?? '').trim();
    if (!url || !/[?&]o=\d+/.test(url)) continue;
    return url.replace(/([?&]o=)\d+/, `$1<OFFER_ID>`);
  }
  return null;
}

/** O template serve se aponta uma oferta e ainda carrega o placeholder da tag. */
export function isUsableLinkTemplate(template: string | null | undefined): boolean {
  const t = String(template ?? '').trim();
  if (!t) return false;
  return /[?&]o=(<OFFER_ID>|\d+)/.test(t) && /\{ref\}/.test(t);
}
