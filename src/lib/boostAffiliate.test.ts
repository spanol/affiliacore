import { describe, it, expect } from 'vitest';
import { makeBoostAffiliateId, isBoostAffiliateId, normalizeEmailKey, buildImportRoster } from './boostAffiliate';
import { buildAffiliateLookup, resolveAffiliates, parseResultsRows } from './houseResults';

describe('id / chave de e-mail', () => {
  it('makeBoostAffiliateId/isBoostAffiliateId', () => {
    const id = makeBoostAffiliateId('abc-123');
    expect(id).toBe('boost_abc-123');
    expect(isBoostAffiliateId(id)).toBe(true);
    expect(isBoostAffiliateId('clsuperbet0001')).toBe(false);
    expect(isBoostAffiliateId(null)).toBe(false);
  });
  it('normalizeEmailKey só trim+lowercase (não mexe no ponto)', () => {
    expect(normalizeEmailKey('  Joao.Silva@Gmail.COM ')).toBe('joao.silva@gmail.com');
    expect(normalizeEmailKey(null)).toBe('');
  });
});

describe('buildImportRoster', () => {
  it('funde nome (mirror) + e-mails (login + alias) por affiliateId', () => {
    const roster = buildImportRoster(
      [{ id: 'boost_x', name: 'Vanesa Cristina' }, { id: 'cl1', name: 'OTG One', email: 'otg@x.com' }],
      [{ affiliateId: 'cl1', name: 'Login Name', email: 'login@x.com' }],
      [{ affiliateId: 'boost_x', email: 'vanesa@x.com' }]
    );
    const x = roster.find((r) => r.id === 'boost_x')!;
    expect(x.name).toBe('Vanesa Cristina');           // nome do mirror
    expect(x.emails).toEqual(['vanesa@x.com']);        // e-mail do alias
    const c = roster.find((r) => r.id === 'cl1')!;
    expect(c.name).toBe('OTG One');                    // mirror vence o nome do login
    expect(c.emails.sort()).toEqual(['login@x.com', 'otg@x.com']);
  });

  it('ignora entradas sem id/affiliateId e deduplica e-mail (case-insensitive)', () => {
    const roster = buildImportRoster(
      [{ name: 'sem id' } as any, { id: 'a', name: 'A', email: 'A@X.com' }],
      [{ affiliateId: 'a', email: 'a@x.com' }, { name: 'sem aff' }],
      []
    );
    expect(roster).toHaveLength(1);
    expect(roster[0].emails).toEqual(['a@x.com']);     // dedup
  });

  it('roster -> buildAffiliateLookup: nativo Boost (sem OTG) resolve por e-mail de alias com nome certo', () => {
    const roster = buildImportRoster(
      [{ id: 'boost_v', name: 'Vanesa Cristina' }],
      [],
      [{ affiliateId: 'boost_v', email: 'vanesa@x.com' }]
    );
    const lookup = buildAffiliateLookup(roster);
    const parsed = parseResultsRows([
      ['data', 'afiliado', 'email', 'cadastros'],
      ['2026-06-01', 'Vanesa C. heinen', 'vanesa@x.com', '3'],
    ]).rows;
    const res = resolveAffiliates(parsed, lookup);
    expect(res.unresolved).toEqual([]);
    expect(res.rows[0].affiliateId).toBe('boost_v');
    expect(res.rows[0].affiliateLabel).toBe('Vanesa Cristina'); // rótulo do mirror
  });
});
