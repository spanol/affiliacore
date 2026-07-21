import { describe, it, expect } from 'vitest';
import { otgEnabled, marketplaceEnabled } from './instance';

describe('otgEnabled · interruptor do módulo OTG por instância (P2)', () => {
  it('ausente/vazio → LIGADA (retrocompat: instância existente não muda sem config)', () => {
    expect(otgEnabled(undefined)).toBe(true);
    expect(otgEnabled(null)).toBe(true);
    expect(otgEnabled('')).toBe(true);
    expect(otgEnabled('   ')).toBe(true);
  });

  it("só 'false' desliga (case-insensitive, com espaços)", () => {
    expect(otgEnabled('false')).toBe(false);
    expect(otgEnabled('FALSE')).toBe(false);
    expect(otgEnabled(' False ')).toBe(false);
    expect(otgEnabled(false)).toBe(false); // Vite pode coagir a boolean
  });

  it('qualquer outro valor → ligada (typo não desliga integração por acidente)', () => {
    expect(otgEnabled('true')).toBe(true);
    expect(otgEnabled('0')).toBe(true); // não é 'false' → ligada (regra estrita)
    expect(otgEnabled('off')).toBe(true);
    expect(otgEnabled(true)).toBe(true);
  });
});

describe('marketplaceEnabled · módulo opt-in por instância (P2/P3, default OFF)', () => {
  it('ausente/vazio → DESLIGADO (Boost/instância nº 0 não ganha as telas sem pedir)', () => {
    expect(marketplaceEnabled(undefined)).toBe(false);
    expect(marketplaceEnabled(null)).toBe(false);
    expect(marketplaceEnabled('')).toBe(false);
    expect(marketplaceEnabled('   ')).toBe(false);
  });

  it("só 'true' liga (case-insensitive, com espaços)", () => {
    expect(marketplaceEnabled('true')).toBe(true);
    expect(marketplaceEnabled('TRUE')).toBe(true);
    expect(marketplaceEnabled(' True ')).toBe(true);
    expect(marketplaceEnabled(true)).toBe(true); // Vite pode coagir a boolean
  });

  it('qualquer outro valor → desligado (typo não liga marketplace por acidente)', () => {
    expect(marketplaceEnabled('false')).toBe(false);
    expect(marketplaceEnabled('1')).toBe(false);
    expect(marketplaceEnabled('on')).toBe(false);
    expect(marketplaceEnabled(false)).toBe(false);
  });
});
