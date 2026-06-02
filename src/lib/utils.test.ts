import { describe, it, expect } from 'vitest';
import { humanizeName } from './utils';

describe('humanizeName', () => {
  it('separa nomes PascalCase concatenados', () => {
    expect(humanizeName('VanesaCristinaHeinenMaciel')).toBe('Vanesa Cristina Heinen Maciel');
    expect(humanizeName('GabrielSena')).toBe('Gabriel Sena');
    expect(humanizeName('AnaClaraSantosCampos')).toBe('Ana Clara Santos Campos');
  });

  it('mantém nomes que já têm espaço', () => {
    expect(humanizeName('Thales Ruan Rodrigues')).toBe('Thales Ruan Rodrigues');
  });

  it('não mexe em ids, e-mails ou valores com dígitos', () => {
    expect(humanizeName('#cmovjh54t08ea19at0tapvlfw')).toBe('#cmovjh54t08ea19at0tapvlfw');
    expect(humanizeName('Fernanda2')).toBe('Fernanda2');
    expect(humanizeName('user@email.com')).toBe('user@email.com');
  });

  it('trata vazio/nulo', () => {
    expect(humanizeName('')).toBe('');
    expect(humanizeName(undefined)).toBe('');
    expect(humanizeName(null)).toBe('');
  });
});
