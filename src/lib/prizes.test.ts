import { describe, it, expect } from 'vitest';
import {
  PRIZE_DESCRIPTION_MAX,
  PRIZE_MAX_POSITION,
  PRIZE_TITLE_MAX,
  activePrizes,
  positionLabel,
  prizeForPosition,
  sanitizePrize,
  sanitizePrizePatch,
  sortPrizes,
} from './prizes';

// =============================================================================
// sanitizePrize — saneamento compartilhado server/client (POST /api/prizes)
// =============================================================================
describe('sanitizePrize', () => {
  it('entrada válida completa → value saneado', () => {
    const r = sanitizePrize({ position: 1, title: ' iPhone 16 Pro ', description: ' Top 1 de julho ', active: false });
    expect(r).toEqual({
      ok: true,
      value: { position: 1, title: 'iPhone 16 Pro', description: 'Top 1 de julho', active: false },
    });
  });

  it('position como STRING numérica (form) é aceita', () => {
    const r = sanitizePrize({ position: '3', title: 'R$ 1.000' });
    expect(r.ok && r.value.position).toBe(3);
  });

  it('active ausente → default true; description ausente → string vazia', () => {
    const r = sanitizePrize({ position: 2, title: 'R$ 2.000' });
    expect(r.ok && r.value.active).toBe(true);
    expect(r.ok && r.value.description).toBe('');
  });

  it.each([
    ['zero', 0],
    ['negativa', -1],
    ['decimal', 1.5],
    ['acima do teto', PRIZE_MAX_POSITION + 1],
    ['não-numérica', 'abc'],
    ['string vazia', ''],
    ['ausente', undefined],
    ['null', null],
  ])('position inválida (%s) → erro', (_label, position) => {
    const r = sanitizePrize({ position, title: 'Prêmio' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Posição inválida/);
  });

  it('title vazio/só espaços → erro', () => {
    expect(sanitizePrize({ position: 1, title: '   ' }).ok).toBe(false);
    expect(sanitizePrize({ position: 1 }).ok).toBe(false);
  });

  it('title e description são truncados nos máximos', () => {
    const r = sanitizePrize({
      position: 1,
      title: 'x'.repeat(PRIZE_TITLE_MAX + 50),
      description: 'y'.repeat(PRIZE_DESCRIPTION_MAX + 50),
    });
    expect(r.ok && r.value.title.length).toBe(PRIZE_TITLE_MAX);
    expect(r.ok && r.value.description.length).toBe(PRIZE_DESCRIPTION_MAX);
  });

  it('body não-objeto (null/undefined) não quebra → erro de posição', () => {
    expect(sanitizePrize(null).ok).toBe(false);
    expect(sanitizePrize(undefined).ok).toBe(false);
  });
});

// =============================================================================
// sanitizePrizePatch — PATCH parcial (campo presente e inválido derruba tudo)
// =============================================================================
describe('sanitizePrizePatch', () => {
  it('só os campos presentes entram no patch', () => {
    const r = sanitizePrizePatch({ active: false });
    expect(r).toEqual({ ok: true, patch: { active: false } });
  });

  it('vários campos válidos → todos saneados', () => {
    const r = sanitizePrizePatch({ position: '2', title: ' R$ 500 ', description: '', active: 1 });
    expect(r).toEqual({
      ok: true,
      patch: { position: 2, title: 'R$ 500', description: '', active: true },
    });
  });

  it('position presente e inválida → erro (não grava metade)', () => {
    const r = sanitizePrizePatch({ position: 0, active: false });
    expect(r.ok).toBe(false);
  });

  it('title presente e vazio → erro', () => {
    expect(sanitizePrizePatch({ title: '  ' }).ok).toBe(false);
  });

  it('body vazio → erro "Nada para atualizar."', () => {
    const r = sanitizePrizePatch({});
    expect(!r.ok && r.error).toBe('Nada para atualizar.');
  });
});

// =============================================================================
// sortPrizes / activePrizes / prizeForPosition — seleção pura p/ pódio e Home
// =============================================================================
describe('sortPrizes / activePrizes / prizeForPosition', () => {
  const p = (position: number, active = true, id = `${position}-${active}`) => ({
    id,
    position,
    active,
    title: `Prêmio ${position}`,
  });

  it('sortPrizes ordena por posição sem mutar o original', () => {
    const list = [p(3), p(1), p(2)];
    const sorted = sortPrizes(list);
    expect(sorted.map((x) => x.position)).toEqual([1, 2, 3]);
    expect(list.map((x) => x.position)).toEqual([3, 1, 2]);
  });

  it('activePrizes filtra os desligados', () => {
    expect(activePrizes([p(1), p(2, false)]).map((x) => x.position)).toEqual([1]);
  });

  it('prizeForPosition acha o prêmio ATIVO da posição', () => {
    const list = [p(1), p(2, false), p(3)];
    expect(prizeForPosition(list, 1)?.title).toBe('Prêmio 1');
    expect(prizeForPosition(list, 2)).toBeUndefined(); // inativo não conta
    expect(prizeForPosition(list, 9)).toBeUndefined();
  });

  it('posição duplicada → vence a primeira (estável)', () => {
    const list = [p(1, true, 'b'), p(1, true, 'a')];
    expect(prizeForPosition(list, 1)?.id).toBe('b');
  });

  it('positionLabel: ordinal pt-BR', () => {
    expect(positionLabel(1)).toBe('1º lugar');
    expect(positionLabel(12)).toBe('12º lugar');
  });
});
