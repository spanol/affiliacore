import { describe, it, expect } from 'vitest';
import { plural, pluralize } from './plural';

describe('plural · a palavra no número certo', () => {
  it('1 é singular, o resto é plural', () => {
    expect(plural(1, 'casa')).toBe('casa');
    expect(plural(2, 'casa')).toBe('casas');
  });

  // Em pt-BR zero leva plural ("0 casas"), ao contrário do que um `n > 1` faria.
  it('zero é plural', () => {
    expect(plural(0, 'casa')).toBe('casas');
  });

  it('negativo segue o valor absoluto', () => {
    expect(plural(-1, 'dia')).toBe('dia');
    expect(plural(-3, 'dia')).toBe('dias');
  });

  it('aceita a forma plural explícita para o que não é só +s', () => {
    expect(plural(2, 'casa manual', 'casas manuais')).toBe('casas manuais');
    expect(plural(1, 'casa manual', 'casas manuais')).toBe('casa manual');
    expect(plural(3, 'nível', 'níveis')).toBe('níveis');
    expect(plural(2, 'já existia', 'já existiam')).toBe('já existiam');
  });

  it('valor não numérico cai no plural, nunca em NaN', () => {
    expect(plural(undefined, 'casa')).toBe('casas');
    expect(plural(null, 'casa')).toBe('casas');
    expect(plural('abc', 'casa')).toBe('casas');
  });

  // '1' vindo de um input/querystring é 1: comparar como número evita "1 casas".
  it('número em string funciona', () => {
    expect(plural('1', 'casa')).toBe('casa');
    expect(plural('4', 'casa')).toBe('casas');
  });
});

describe('pluralize · número + palavra', () => {
  it('junta o número formatado em pt-BR com a palavra', () => {
    expect(pluralize(1, 'afiliado')).toBe('1 afiliado');
    expect(pluralize(0, 'afiliado')).toBe('0 afiliados');
    expect(pluralize(2400, 'linha')).toBe('2.400 linhas');
  });

  it('valor ausente vira 0 em vez de "NaN afiliados"', () => {
    expect(pluralize(undefined, 'afiliado')).toBe('0 afiliados');
    expect(pluralize(NaN, 'afiliado')).toBe('0 afiliados');
  });

  it('respeita a forma plural explícita', () => {
    expect(pluralize(3, 'afiliado especial', 'afiliados especiais')).toBe('3 afiliados especiais');
    expect(pluralize(1, 'afiliado especial', 'afiliados especiais')).toBe('1 afiliado especial');
  });

  // A regra de copy do repo: nada de travessão no meio de frase.
  it('não introduz travessão', () => {
    expect(pluralize(3, 'casa')).not.toMatch(/—/);
  });
});
