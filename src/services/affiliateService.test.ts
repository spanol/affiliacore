import { describe, it, expect, vi } from 'vitest';

// Isola os helpers de parsing — evita os efeitos colaterais de importar o
// Firebase client (lib/firebase roda um testConnection() no import).
vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('../lib/api', () => ({ authFetch: vi.fn() }));

import {
  extractArray,
  extractApiError,
  isNoDataError,
  messageLooksLikeError,
} from './affiliateService';

describe('extractArray', () => {
  it('retorna [] para null/undefined', () => {
    expect(extractArray(null)).toEqual([]);
    expect(extractArray(undefined)).toEqual([]);
  });

  it('passa arrays direto', () => {
    expect(extractArray([{ id: 1 }])).toEqual([{ id: 1 }]);
  });

  it('encontra o array em data.data (estrutura aninhada)', () => {
    expect(extractArray({ data: { data: [{ id: 'a' }] } })).toEqual([{ id: 'a' }]);
  });

  it('encontra o array em chaves comuns (affiliates, results)', () => {
    expect(extractArray({ affiliates: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(extractArray({ results: [{ id: 2 }] })).toEqual([{ id: 2 }]);
  });

  it('faz fallback para qualquer array não-vazio aninhado', () => {
    expect(extractArray({ meta: {}, payloadX: [{ id: 9 }] })).toEqual([{ id: 9 }]);
  });

  it('retorna [] quando não há array', () => {
    expect(extractArray({ foo: 'bar', count: 0 })).toEqual([]);
  });
});

describe('isNoDataError', () => {
  it('reconhece o código 040 / 40', () => {
    expect(isNoDataError('040', '')).toBe(true);
    expect(isNoDataError('40', '')).toBe(true);
  });

  it('reconhece mensagens de "sem dados"', () => {
    expect(isNoDataError('', 'Nenhum dado encontrado')).toBe(true);
    expect(isNoDataError('', 'no data available')).toBe(true);
    expect(isNoDataError('', 'not found')).toBe(true);
  });

  it('não trata erro real como no-data', () => {
    expect(isNoDataError('500', 'internal error')).toBe(false);
  });
});

describe('messageLooksLikeError', () => {
  it('detecta palavras de erro', () => {
    expect(messageLooksLikeError('Ocorreu um erro')).toBe(true);
    expect(messageLooksLikeError('unauthorized')).toBe(true);
    expect(messageLooksLikeError('forbidden')).toBe(true);
  });

  it('ignora mensagens neutras', () => {
    expect(messageLooksLikeError('tudo certo')).toBe(false);
    expect(messageLooksLikeError('')).toBe(false);
  });
});

describe('extractApiError', () => {
  it('retorna null para não-objeto', () => {
    expect(extractApiError(null)).toBeNull();
    expect(extractApiError('texto')).toBeNull();
  });

  it('retorna null para payload de sucesso', () => {
    expect(extractApiError({ success: true, data: [{ id: 1 }] })).toBeNull();
  });

  it('marca noData=true para o código 040', () => {
    const err = extractApiError({ code: '040', message: 'Nenhum dado' });
    expect(err).not.toBeNull();
    expect(err?.noData).toBe(true);
  });

  it('marca noData=false para falha explícita real', () => {
    const err = extractApiError({ success: false, code: '500', message: 'erro interno' });
    expect(err).not.toBeNull();
    expect(err?.noData).toBe(false);
    expect(err?.message).toBe('erro interno');
  });

  it('detecta erro por mensagem mesmo sem flag de sucesso', () => {
    const err = extractApiError({ message: 'unauthorized' });
    expect(err).not.toBeNull();
  });
});
