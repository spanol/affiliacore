import { describe, it, expect } from 'vitest';
import { normalizeLegalDocInput, computeNextVersion, hasAcceptedLatest } from './legal';

describe('normalizeLegalDocInput', () => {
  it('aceita entrada válida e normaliza o slug (lowercase, só a-z0-9-)', () => {
    const { doc, error } = normalizeLegalDocInput({ slug: 'Acordo De Afiliação!', title: 'Acordo de Afiliação', content: 'Texto...' });
    expect(error).toBeUndefined();
    expect(doc).toMatchObject({ slug: 'acordo-de-afilia--o-', title: 'Acordo de Afiliação', content: 'Texto...', active: true });
  });
  it('sem slug/título/conteúdo → erro pt-BR', () => {
    expect(normalizeLegalDocInput({ title: 'X', content: 'Y' }).error).toMatch(/slug/i);
    expect(normalizeLegalDocInput({ slug: 'x', content: 'Y' }).error).toMatch(/título/i);
    expect(normalizeLegalDocInput({ slug: 'x', title: 'Y' }).error).toMatch(/conteúdo/i);
  });
  it('active default true; false explícito é respeitado', () => {
    expect(normalizeLegalDocInput({ slug: 'x', title: 'T', content: 'C' }).doc?.active).toBe(true);
    expect(normalizeLegalDocInput({ slug: 'x', title: 'T', content: 'C', active: false }).doc?.active).toBe(false);
  });
});

describe('computeNextVersion · versão é DERIVADA, nunca digitada', () => {
  it('documento novo (sem "before") → versão 1', () => {
    expect(computeNextVersion(null, 'texto novo')).toBe(1);
    expect(computeNextVersion(undefined, 'texto novo')).toBe(1);
  });
  it('conteúdo mudou → +1 (invalida aceites antigos)', () => {
    expect(computeNextVersion({ content: 'v1', version: 1 }, 'v2')).toBe(2);
    expect(computeNextVersion({ content: 'v2', version: 5 }, 'v3')).toBe(6);
  });
  it('conteúdo IGUAL → mantém a versão (editar só título/active não invalida aceite)', () => {
    expect(computeNextVersion({ content: 'v1', version: 3 }, 'v1')).toBe(3);
  });
  it('"before" sem version válida (doc legado/corrompido) → trata como 1 antes de incrementar', () => {
    expect(computeNextVersion({ content: 'v1', version: undefined as any }, 'v2')).toBe(2);
    expect(computeNextVersion({ content: 'v1', version: 0 }, 'v1')).toBe(1);
  });
});

describe('hasAcceptedLatest · aceite só vale pra versão EXATA', () => {
  it('versão do aceite bate com a do doc → true', () => {
    expect(hasAcceptedLatest({ uid: 'u1', slug: 's', version: 2 }, { version: 2 })).toBe(true);
  });
  it('doc foi editado (versão subiu) → aceite antigo fica obsoleto', () => {
    expect(hasAcceptedLatest({ uid: 'u1', slug: 's', version: 1 }, { version: 2 })).toBe(false);
  });
  it('sem aceite ou sem doc → false, nunca lança', () => {
    expect(hasAcceptedLatest(null, { version: 1 })).toBe(false);
    expect(hasAcceptedLatest({ uid: 'u1', slug: 's', version: 1 }, null)).toBe(false);
  });
});
