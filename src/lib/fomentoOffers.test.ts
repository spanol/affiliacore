import { describe, it, expect } from 'vitest';
import {
  summarizeFomentoOffers,
  houseByOfferMap,
  isOrphanWithTraffic,
  draftHouseFromOffer,
  deriveFomentoLinkTemplate,
  isUsableLinkTemplate,
  type FomentoOfferHouse,
} from './fomentoOffers';
import type { FomentoEventDoc } from './fomentoPostback';

const ev = (over: Partial<FomentoEventDoc> = {}): FomentoEventDoc => ({
  offerId: '21982469',
  event: 'ftd',
  tag: 'kratosthebest8',
  clickId: '',
  playerId: '',
  payout: 30,
  currency: 'EUR',
  day: '2026-08-27',
  ...over,
});

const casa = (over: Partial<FomentoOfferHouse> = {}): FomentoOfferHouse => ({
  slug: 'cristal-poker',
  name: 'Cristal Poker',
  integration: 'fomento-offer18',
  integrationExternalId: '21982469',
  ...over,
});

describe('houseByOfferMap', () => {
  it('indexa por offer_id, ignorando casa de outra integração ou sem oferta', () => {
    const map = houseByOfferMap([
      casa(),
      casa({ slug: 'esportiva-bet', integration: 'esportiva-tap', integrationExternalId: '999' }),
      casa({ slug: 'stake', integration: null, integrationExternalId: null }),
    ]);
    expect([...map.keys()]).toEqual(['21982469']);
    expect(map.get('21982469')?.slug).toBe('cristal-poker');
  });
});

describe('summarizeFomentoOffers', () => {
  it('agrupa por oferta e separa disparo de teste da conversão real', () => {
    const [o] = summarizeFomentoOffers(
      [ev(), ev(), ev({ clickId: 'replace_it', tag: 'replace_it' })],
      [casa()],
    );
    expect(o).toMatchObject({
      offerId: '21982469', houseSlug: 'cristal-poker', houseName: 'Cristal Poker',
      events: 2, ftd: 2, tests: 1, lead: 0,
    });
    // A tag de placeholder não polui a lista de tags da oferta.
    expect(o.tags).toEqual(['kratosthebest8']);
  });

  it('CPA sugerido sai só dos `ftd`: o `lead` paga 0 na rede e envenenaria a média', () => {
    const [o] = summarizeFomentoOffers(
      [ev({ payout: 25 }), ev({ event: 'lead', payout: 0, tag: 'jota3' })],
      [],
    );
    expect(o.cpaHint).toBe(25);
    expect(o.cpaConflict).toBe(false);
    expect(o).toMatchObject({ ftd: 1, lead: 1 });
  });

  it('payout de ftd divergente sinaliza conflito e devolve o maior, sem decidir por maioria', () => {
    const [o] = summarizeFomentoOffers([ev({ payout: 25 }), ev({ payout: 30 }), ev({ payout: 25 })], []);
    expect(o.cpaConflict).toBe(true);
    expect(o.cpaHint).toBe(30);
  });

  it('o teste do painel serve de pista de CPA quando é o ÚNICO evento da oferta', () => {
    // Foi assim que Cristal Poker (30 EUR) e Ivibet (10 EUR) foram precificadas
    // antes de existir qualquer conversão real.
    const [o] = summarizeFomentoOffers(
      [ev({ offerId: '22019151', clickId: 'replace_it', tag: 'replace_it', payout: 10 })],
      [],
    );
    expect(o).toMatchObject({ offerId: '22019151', events: 0, tests: 1, cpaHint: 10, currency: 'EUR' });
  });

  it('marca a tag que nenhum link/apelido reivindica', () => {
    const idx = new Map([['kratosthebest8', { affiliateId: 'AFF-1' }]]);
    const [o] = summarizeFomentoOffers([ev(), ev({ tag: 'semdono' })], [], idx);
    expect(o.tags).toEqual(['kratosthebest8', 'semdono']);
    expect(o.unattributedTags).toEqual(['semdono']);
  });

  it('sem índice de tags nenhuma tag ganha dono inventado', () => {
    const [o] = summarizeFomentoOffers([ev()], []);
    expect(o.unattributedTags).toEqual(['kratosthebest8']);
  });

  it('primeiro e último dia saem ordenados, não pela ordem de chegada', () => {
    const [o] = summarizeFomentoOffers(
      [ev({ day: '2026-08-28' }), ev({ day: '2026-08-25' }), ev({ day: '2026-08-27' })],
      [],
    );
    expect(o.firstDay).toBe('2026-08-25');
    expect(o.lastDay).toBe('2026-08-28');
  });

  it('evento de token desconhecido conta à parte, sem virar ftd nem cadastro', () => {
    const [o] = summarizeFomentoOffers([ev({ event: 'install' })], []);
    expect(o).toMatchObject({ unknown: 1, ftd: 0, lead: 0, events: 1 });
  });

  it('ordena a FILA DE TRABALHO: oferta sem casa primeiro, mais recente antes', () => {
    const rows = summarizeFomentoOffers(
      [
        ev({ offerId: '111', day: '2026-08-28' }),                 // com casa
        ev({ offerId: '222', day: '2026-08-20' }),                 // sem casa, antiga
        ev({ offerId: '333', day: '2026-08-28' }),                 // sem casa, recente
      ],
      [casa({ slug: 'com-casa', integrationExternalId: '111' })],
    );
    expect(rows.map((r) => r.offerId)).toEqual(['333', '222', '111']);
  });

  it('evento sem offerId é descartado; lista vazia devolve lista vazia', () => {
    expect(summarizeFomentoOffers([ev({ offerId: '' })], [])).toEqual([]);
    expect(summarizeFomentoOffers([], [])).toEqual([]);
    expect(summarizeFomentoOffers(null, null)).toEqual([]);
  });
});

describe('isOrphanWithTraffic', () => {
  it('oferta sem casa com conversão real é dinheiro sem onde pousar', () => {
    const [comTrafego] = summarizeFomentoOffers([ev({ offerId: '777' })], []);
    expect(isOrphanWithTraffic(comTrafego)).toBe(true);
  });

  it('só o disparo de teste NÃO conta como tráfego órfão', () => {
    const [soTeste] = summarizeFomentoOffers(
      [ev({ offerId: '777', clickId: 'replace_it', tag: 'replace_it' })], [],
    );
    expect(isOrphanWithTraffic(soTeste)).toBe(false);
  });

  it('oferta já vinculada nunca é órfã, por mais tráfego que tenha', () => {
    const [comCasa] = summarizeFomentoOffers([ev(), ev()], [casa()]);
    expect(isOrphanWithTraffic(comCasa)).toBe(false);
  });
});

describe('deriveFomentoLinkTemplate', () => {
  const url = 'https://fomentoindustriesltd10525901.o18.link/c?o=21982469&m=7910&a=703626&sub_aff_id={ref}';

  it('troca só a oferta e preserva domínio, mid e aid da LABEL', () => {
    const t = deriveFomentoLinkTemplate([{ ...casa(), registerUrlTemplate: url } as any]);
    expect(t).toBe('https://fomentoindustriesltd10525901.o18.link/c?o=<OFFER_ID>&m=7910&a=703626&sub_aff_id={ref}');
  });

  it('label estreando na rede (sem casa irmã) devolve null em vez de inventar conta', () => {
    expect(deriveFomentoLinkTemplate([])).toBeNull();
    expect(deriveFomentoLinkTemplate([casa()] as any)).toBeNull();          // casa sem template
    expect(deriveFomentoLinkTemplate([
      { slug: 'x', integration: 'esportiva-tap', registerUrlTemplate: url } as any,
    ])).toBeNull();                                                          // outra integração
  });
});

describe('isUsableLinkTemplate', () => {
  it('exige a oferta E o placeholder da tag: link sem {ref} não atribui a ninguém', () => {
    expect(isUsableLinkTemplate('https://x.o18.link/c?o=<OFFER_ID>&sub_aff_id={ref}')).toBe(true);
    expect(isUsableLinkTemplate('https://x.o18.link/c?o=123&sub_aff_id={ref}')).toBe(true);
    expect(isUsableLinkTemplate('https://x.o18.link/c?o=<OFFER_ID>')).toBe(false);
    expect(isUsableLinkTemplate('https://x.o18.link/c?sub_aff_id={ref}')).toBe(false);
    expect(isUsableLinkTemplate('')).toBe(false);
    expect(isUsableLinkTemplate(null)).toBe(false);
  });
});

describe('draftHouseFromOffer', () => {
  it('monta o cadastro com o que o ledger sabe, e o NOME fica de fora', () => {
    const [o] = summarizeFomentoOffers([ev({ payout: 30 })], []);
    const draft = draftHouseFromOffer(o, 'https://x.o18.link/c?o=<OFFER_ID>&sub_aff_id={ref}');
    expect(draft).toEqual({
      integration: 'fomento-offer18',
      integrationExternalId: '21982469',
      dataSource: 'manual',
      defaultCpa: 30,
      cpaCurrency: 'EUR',
      fxMode: 'live',
      registerUrlTemplate: 'https://x.o18.link/c?o=21982469&sub_aff_id={ref}',
    });
    expect(draft).not.toHaveProperty('name');
  });

  it('sem pista de CPA o campo vai NULO, nunca zero (ausência != R$ 0)', () => {
    const [o] = summarizeFomentoOffers([ev({ event: 'lead', payout: 0 })], []);
    const draft = draftHouseFromOffer(o, 'https://x.o18.link/c?o=<OFFER_ID>&sub_aff_id={ref}');
    expect(draft.defaultCpa).toBeNull();
  });
});
