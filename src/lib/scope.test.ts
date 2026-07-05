import { describe, it, expect } from 'vitest';
import { resolveIsSpecial, resolveServerToday, resolveServerYesterday, resolveScopedAffiliateIds } from './scope';

describe('resolveIsSpecial · definição única (R7)', () => {
  it('só é especial com active === true', () => {
    expect(resolveIsSpecial({ active: true })).toBe(true);
    expect(resolveIsSpecial({ active: false })).toBe(false);
  });

  it('doc sem o campo active NÃO é especial (fail-closed; corrige a divergência do active!==false)', () => {
    expect(resolveIsSpecial({})).toBe(false);
    expect(resolveIsSpecial({ subAffiliateIds: ['a'] })).toBe(false);
  });

  it('null/undefined → não especial, sem quebrar', () => {
    expect(resolveIsSpecial(null)).toBe(false);
    expect(resolveIsSpecial(undefined)).toBe(false);
  });
});

describe('resolveServerToday · fuso BR, não UTC (R12)', () => {
  it('23:30 BR (02:30Z do dia seguinte) ainda é o dia BR, não o UTC', () => {
    // 2026-06-24T23:30-03:00 == 2026-06-25T02:30Z. UTC daria 2026-06-25 (bug).
    expect(resolveServerToday(new Date('2026-06-25T02:30:00Z'))).toBe('2026-06-24');
  });

  it('meio-dia BR resolve o dia corrente', () => {
    expect(resolveServerToday(new Date('2026-06-24T15:00:00Z'))).toBe('2026-06-24'); // 12:00 BR
  });

  it('respeita o timeZone informado', () => {
    expect(resolveServerToday(new Date('2026-06-25T02:30:00Z'), 'UTC')).toBe('2026-06-25');
  });
});

describe('resolveServerYesterday · último dia FECHADO no fuso BR', () => {
  it('meio-dia BR → ontem', () => {
    expect(resolveServerYesterday(new Date('2026-07-04T15:00:00Z'))).toBe('2026-07-03'); // 12:00 BR
  });

  it('23:30 BR (02:30Z do dia seguinte) → ontem-BR, não ontem-UTC', () => {
    // 2026-07-04T23:30 BR: hoje-BR=04 → ontem=03 (UTC daria hoje=05 → ontem=04: bug).
    expect(resolveServerYesterday(new Date('2026-07-05T02:30:00Z'))).toBe('2026-07-03');
  });

  it('vira o mês corretamente (01 → último dia do mês anterior)', () => {
    expect(resolveServerYesterday(new Date('2026-07-01T15:00:00Z'))).toBe('2026-06-30');
  });
});

describe('resolveScopedAffiliateIds · barreira de IDOR do proxy (R4)', () => {
  const base = { endpoint: 'results', ownAffiliateId: 'me', special: null } as const;

  it('admin não é filtrado (scoped null, sem denied)', () => {
    expect(resolveScopedAffiliateIds({ role: 'admin', endpoint: 'affiliates' })).toEqual({ scoped: null });
  });

  it('não-admin em endpoint != results → negado', () => {
    expect(resolveScopedAffiliateIds({ ...base, role: 'client', endpoint: 'affiliates' }).denied).toMatchObject({ status: 403 });
  });

  it('não-admin com :id no path → negado (não pode pedir id específico)', () => {
    expect(resolveScopedAffiliateIds({ ...base, role: 'client', id: 'outro' }).denied).toMatchObject({ status: 403 });
  });

  it('sem affiliateId vinculado → negado', () => {
    const r = resolveScopedAffiliateIds({ role: 'client', endpoint: 'results', ownAffiliateId: '' });
    expect(r.denied).toMatchObject({ status: 403, error: expect.stringContaining('vinculada') });
  });

  it('comum sem pedido → escopa ao próprio id', () => {
    expect(resolveScopedAffiliateIds({ ...base, role: 'client' })).toEqual({ scoped: ['me'] });
  });

  it('comum pedindo o PRÓPRIO id → passa', () => {
    expect(resolveScopedAffiliateIds({ ...base, role: 'client', requestedAffiliateIds: 'me' })).toEqual({ scoped: ['me'] });
  });

  it('comum pedindo id de OUTRO → interseção vazia → negado (bloqueia IDOR)', () => {
    expect(resolveScopedAffiliateIds({ ...base, role: 'client', requestedAffiliateIds: 'outro' }).denied).toMatchObject({ status: 403 });
  });

  it('comum pedindo próprio + outro → mantém só o próprio (descarta o alheio)', () => {
    expect(resolveScopedAffiliateIds({ ...base, role: 'client', requestedAffiliateIds: 'me,outro' })).toEqual({ scoped: ['me'] });
  });

  it('especial ativo → escopo da sub-rede (own + subs), coage ids a string', () => {
    const special = { active: true, subAffiliateIds: ['s1', 2 as any] };
    expect(resolveScopedAffiliateIds({ ...base, role: 'client', special })).toEqual({ scoped: ['me', 's1', '2'] });
  });

  it('especial ativo pedindo um sub válido → passa só o sub', () => {
    const special = { active: true, subAffiliateIds: ['s1', 's2'] };
    expect(resolveScopedAffiliateIds({ ...base, role: 'client', special, requestedAffiliateIds: 's2' })).toEqual({ scoped: ['s2'] });
  });

  it('especial ativo pedindo id fora da rede → filtrado (negado se sobra vazio)', () => {
    const special = { active: true, subAffiliateIds: ['s1'] };
    expect(resolveScopedAffiliateIds({ ...base, role: 'client', special, requestedAffiliateIds: 'estranho' }).denied).toMatchObject({ status: 403 });
  });

  it('especial INATIVO não amplia escopo (cai no próprio id)', () => {
    const special = { active: false, subAffiliateIds: ['s1', 's2'] };
    expect(resolveScopedAffiliateIds({ ...base, role: 'client', special, requestedAffiliateIds: 's1' }).denied).toMatchObject({ status: 403 });
  });

  it('aceita affiliateIds como array (formato repetido) e CSV com espaços', () => {
    const special = { active: true, subAffiliateIds: ['s1', 's2'] };
    expect(resolveScopedAffiliateIds({ ...base, role: 'client', special, requestedAffiliateIds: ['me', 's1'] })).toEqual({ scoped: ['me', 's1'] });
    expect(resolveScopedAffiliateIds({ ...base, role: 'client', special, requestedAffiliateIds: ' me , s2 ' })).toEqual({ scoped: ['me', 's2'] });
  });
});
