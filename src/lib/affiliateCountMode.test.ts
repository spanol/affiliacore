import { describe, it, expect, vi } from 'vitest';
import { readAffiliateCountMode, writeAffiliateCountMode, AFFILIATE_COUNT_MODE_KEY } from './affiliateCountMode';

const fakeStore = (valor: string | null) => ({
  getItem: vi.fn(() => valor),
  setItem: vi.fn(),
});

describe('affiliateCountMode · preferência do contador', () => {
  it('sem nada salvo cai em "all" — o card não muda sozinho para quem nunca clicou', () => {
    expect(readAffiliateCountMode(fakeStore(null))).toBe('all');
  });

  it('lê "producing" quando foi o que ficou salvo', () => {
    expect(readAffiliateCountMode(fakeStore('producing'))).toBe('producing');
  });

  it('valor desconhecido no storage não vira modo inválido', () => {
    expect(readAffiliateCountMode(fakeStore('lixo'))).toBe('all');
    expect(readAffiliateCountMode(fakeStore(''))).toBe('all');
  });

  it('grava sob a chave esperada', () => {
    const store = fakeStore(null);
    writeAffiliateCountMode('producing', store);
    expect(store.setItem).toHaveBeenCalledWith(AFFILIATE_COUNT_MODE_KEY, 'producing');
  });

  it('storage que LANÇA não quebra a tela (modo restrito/SSR)', () => {
    const explode = {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('bloqueado'); },
    };
    expect(readAffiliateCountMode(explode)).toBe('all');
    expect(() => writeAffiliateCountMode('producing', explode)).not.toThrow();
  });
});
