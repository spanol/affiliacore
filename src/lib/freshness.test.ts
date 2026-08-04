import { describe, it, expect } from 'vitest';
import { describeFreshness, toDate, DEFAULT_STALE_MINUTES } from './freshness';

const NOW = new Date('2026-08-04T15:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60000);

describe('toDate', () => {
  it('aceita os formatos que chegam do Firestore e da API', () => {
    expect(toDate(new Date('2026-08-04T14:00:00Z'))?.toISOString()).toBe('2026-08-04T14:00:00.000Z');
    expect(toDate('2026-08-04T14:00:00Z')?.toISOString()).toBe('2026-08-04T14:00:00.000Z');
    expect(toDate({ seconds: 1785855600 })).toBeInstanceOf(Date);
    expect(toDate({ _seconds: 1785855600 })).toBeInstanceOf(Date);
    expect(toDate({ toDate: () => new Date('2026-08-04T14:00:00Z') })?.toISOString()).toBe('2026-08-04T14:00:00.000Z');
  });

  it('lixo vira null (não vira "1970")', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate('nao-e-data')).toBeNull();
    expect(toDate({ toDate: () => { throw new Error('boom'); } })).toBeNull();
  });
});

describe('describeFreshness', () => {
  it('nunca sincronizado é dito com todas as letras, e conta como defasado', () => {
    expect(describeFreshness(null, NOW)).toEqual({ label: 'sem atualização ainda', minutes: null, stale: true });
  });

  it('escala de leitura humana', () => {
    expect(describeFreshness(minutesAgo(0), NOW).label).toBe('agora há pouco');
    expect(describeFreshness(minutesAgo(1), NOW).label).toBe('agora há pouco');
    expect(describeFreshness(minutesAgo(12), NOW).label).toBe('há 12 min');
    expect(describeFreshness(minutesAgo(59), NOW).label).toBe('há 59 min');
    expect(describeFreshness(minutesAgo(60), NOW).label).toBe('há 1 h');
    expect(describeFreshness(minutesAgo(60 * 5), NOW).label).toBe('há 5 h');
    expect(describeFreshness(minutesAgo(60 * 30), NOW).label).toBe('ontem');
    expect(describeFreshness(minutesAgo(60 * 24 * 4), NOW).label).toBe('há 4 dias');
  });

  it('relógio adiantado do servidor não vira idade negativa', () => {
    const futuro = new Date(NOW.getTime() + 5 * 60000);
    expect(describeFreshness(futuro, NOW)).toMatchObject({ label: 'agora há pouco', minutes: 0, stale: false });
  });

  it('marca como defasado só depois do limite (3h no padrão, 3x a janela horária)', () => {
    expect(describeFreshness(minutesAgo(DEFAULT_STALE_MINUTES), NOW).stale).toBe(false);
    expect(describeFreshness(minutesAgo(DEFAULT_STALE_MINUTES + 1), NOW).stale).toBe(true);
    // limite customizado (casa que só recebe upload manual)
    expect(describeFreshness(minutesAgo(60 * 20), NOW, 60 * 24).stale).toBe(false);
  });
});
