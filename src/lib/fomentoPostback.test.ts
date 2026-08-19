import { describe, it, expect } from 'vitest';
import {
  parseFomentoPostback,
  fomentoEventDeltas,
  fomentoPostbackDocId,
  fomentoEventsToPullRows,
  FOMENTO_POSTBACK_TEMPLATE,
  type FomentoEventDoc,
} from './fomentoPostback';

const ev = (over: Partial<FomentoEventDoc> = {}): FomentoEventDoc => ({
  offerId: '22007840',
  event: 'ftd',
  tag: 'mauricio',
  clickId: 'clk1',
  playerId: 'p1',
  payout: 35,
  currency: 'EUR',
  day: '2026-08-19',
  ...over,
});

describe('parseFomentoPostback', () => {
  it('lê o disparo completo do template recomendado', () => {
    const r = parseFomentoPostback({
      s: 'seg', offer: '22007840', event: 'FTD', click: 'abc', tag: 'mauricio',
      payout: '35', currency: 'eur', player: 'jog-9',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({
      secret: 'seg', offerId: '22007840', event: 'ftd', clickId: 'abc',
      tag: 'mauricio', payout: 35, currency: 'EUR', playerId: 'jog-9',
    });
  });

  it('offer ausente ou não numérico é erro (template mal colado se denuncia no log da rede)', () => {
    expect(parseFomentoPostback({ event: 'ftd' }).ok).toBe(false);
    expect(parseFomentoPostback({ offer: '{offerid}', event: 'ftd' }).ok).toBe(false);
  });

  it('event ausente é erro; tag/click/payout ausentes NÃO são (disparo sem tag conta no agregado)', () => {
    expect(parseFomentoPostback({ offer: '1' }).ok).toBe(false);
    const r = parseFomentoPostback({ offer: '1', event: 'lead' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.tag).toBe('');
    expect(r.data.clickId).toBe('');
    expect(r.data.payout).toBeNull();
  });

  it('parâmetro repetido fica com o primeiro valor; payout não numérico vira null', () => {
    const r = parseFomentoPostback({ offer: ['7', '8'], event: 'ftd', payout: '{payout}' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.offerId).toBe('7');
    expect(r.data.payout).toBeNull();
  });
});

describe('fomentoEventDeltas', () => {
  it('lead vira cadastro; ftd vira FTD e CPA qualificado', () => {
    expect(fomentoEventDeltas('lead')).toEqual({ registrations: 1 });
    expect(fomentoEventDeltas('FTD')).toEqual({ first_deposits: 1, qualified_cpa: 1 });
  });

  it('evento desconhecido NÃO conta em métrica nenhuma (fica só no ledger)', () => {
    expect(fomentoEventDeltas('install')).toBeNull();
    expect(fomentoEventDeltas('')).toBeNull();
  });
});

describe('fomentoPostbackDocId', () => {
  it('mesmo (oferta, evento, click) gera o mesmo id: retry da rede sobrescreve, nunca duplica', () => {
    const a = fomentoPostbackDocId({ offerId: '1', event: 'ftd', clickId: 'x' });
    const b = fomentoPostbackDocId({ offerId: '1', event: 'ftd', clickId: 'x' });
    expect(a).toBe(b);
    expect(a).toBe('fpb__1__ftd__x');
  });

  it('sem aff_click_id não há âncora de dedupe: devolve null e o chamador usa id automático', () => {
    expect(fomentoPostbackDocId({ offerId: '1', event: 'ftd', clickId: '' })).toBeNull();
    expect(fomentoPostbackDocId({ offerId: '1', event: 'ftd', clickId: '  ' })).toBeNull();
  });

  it('sanitiza "/" (proibido em id de doc) e limita o tamanho de cada parte', () => {
    const id = fomentoPostbackDocId({ offerId: '1', event: 'ftd', clickId: 'a/b/c'.padEnd(300, 'z') });
    expect(id).not.toContain('/');
    expect(id!.length).toBeLessThan(400);
  });
});

describe('fomentoEventsToPullRows', () => {
  it('agrega por dia × tag no shape que buildPullPayload consome', () => {
    const { rows, counted, ignored } = fomentoEventsToPullRows([
      ev({ event: 'lead', clickId: 'c1' }),
      ev({ event: 'ftd', clickId: 'c1' }),
      ev({ event: 'ftd', clickId: 'c2', tag: 'outra' }),
    ]);
    expect(counted).toBe(3);
    expect(ignored).toBe(0);
    expect(rows).toHaveLength(2);
    const mau = rows.find((r) => r.tag === 'mauricio')!;
    expect(mau).toMatchObject({
      date: '2026-08-19', registrations: 1, first_deposits: 1, qualified_cpa: 1,
      rvs: 0, deposit: 0, total_commission: 0,
    });
  });

  it('dinheiro NUNCA entra nas linhas: payout do disparo fica só no ledger', () => {
    const { rows } = fomentoEventsToPullRows([ev({ payout: 35 })]);
    expect(rows[0].total_commission).toBe(0);
    expect(rows[0].rvs).toBe(0);
  });

  it('evento desconhecido é ignorado e contado como tal; dia inválido é descartado', () => {
    const { rows, counted, ignored } = fomentoEventsToPullRows([
      ev({ event: 'install' }),
      ev({ day: 'não-é-dia' }),
      ev({}),
    ]);
    expect(rows).toHaveLength(1);
    expect(counted).toBe(1);
    expect(ignored).toBe(1);
  });

  it('tag agrupa case-insensitive mas preserva a grafia da primeira ocorrência', () => {
    const { rows } = fomentoEventsToPullRows([
      ev({ tag: 'Mauricio', clickId: 'c1' }),
      ev({ tag: 'mauricio', clickId: 'c2' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_deposits).toBe(2);
  });

  it('disparo sem tag agrega na linha de tag vazia (tráfego órfão da casa)', () => {
    const { rows } = fomentoEventsToPullRows([ev({ tag: '' })]);
    expect(rows[0].tag).toBe('');
  });
});

describe('FOMENTO_POSTBACK_TEMPLATE', () => {
  it('carrega os tokens da Offer18 que o parse espera', () => {
    for (const token of ['{offerid}', '{event_token}', '{aff_click_id}', '{sub_aff_id}', '{payout}', '{currency}', '{ig-user-id}']) {
      expect(FOMENTO_POSTBACK_TEMPLATE).toContain(token);
    }
  });
});
