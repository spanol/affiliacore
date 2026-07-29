import { describe, it, expect } from 'vitest';
import { groupDropsByReason, NetworkDrop } from './network';

const d = (affiliateId: string, uplineId: string, reason: NetworkDrop['reason']): NetworkDrop =>
  ({ affiliateId, uplineId, reason });

describe('groupDropsByReason · painel de anomalias da /rede', () => {
  it('agrupa por motivo preservando a ordem de gravidade', () => {
    const g = groupDropsByReason([
      d('a', 'b', 'upline-inelegivel'),
      d('c', 'd', 'ciclo'),
      d('e', 'f', 'auto-upline'),
      d('g', 'h', 'upline-desconhecido'),
    ]);
    expect(g.map((x) => x.reason)).toEqual(['ciclo', 'auto-upline', 'upline-desconhecido', 'upline-inelegivel']);
    expect(g.every((x) => x.items.length === 1)).toBe(true);
  });

  it('junta todas as arestas do mesmo motivo num grupo só — o caso da Infinity', () => {
    // 141 arestas caídas por falta de taxa viravam 141 avisos idênticos.
    const muitos = Array.from({ length: 141 }, (_, i) => d(`f${i}`, 'topo', 'upline-inelegivel'));
    const g = groupDropsByReason(muitos);
    expect(g).toHaveLength(1);
    expect(g[0].reason).toBe('upline-inelegivel');
    expect(g[0].items).toHaveLength(141);
  });

  it('não perde motivo desconhecido (se um novo for adicionado ao núcleo)', () => {
    const g = groupDropsByReason([d('a', 'b', 'motivo-novo' as any), d('c', 'd', 'ciclo')]);
    expect(g.map((x) => x.reason)).toEqual(['ciclo', 'motivo-novo']);
  });

  it('entrada vazia, nula ou com item malformado não quebra', () => {
    expect(groupDropsByReason([])).toEqual([]);
    expect(groupDropsByReason(null)).toEqual([]);
    expect(groupDropsByReason(undefined)).toEqual([]);
    expect(groupDropsByReason([{ affiliateId: 'a', uplineId: 'b' } as any])).toEqual([]);
  });

  it('a soma dos grupos preserva TODAS as arestas descartadas', () => {
    const entrada = [
      d('a', 'x', 'ciclo'), d('b', 'x', 'upline-inelegivel'), d('c', 'x', 'upline-inelegivel'),
      d('e', 'x', 'auto-upline'), d('f', 'x', 'ciclo'),
    ];
    const total = groupDropsByReason(entrada).reduce((s, g) => s + g.items.length, 0);
    expect(total).toBe(entrada.length);
  });
});
