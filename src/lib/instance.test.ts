import { describe, it, expect } from 'vitest';
import { otgEnabled } from './instance';

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
