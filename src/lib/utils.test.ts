import { describe, it, expect } from 'vitest';
import { humanizeName } from './utils';

describe('humanizeName', () => {
  it('separa nomes PascalCase concatenados', () => {
    expect(humanizeName('VanesaCristinaHeinenMaciel')).toBe('Vanesa Cristina Heinen Maciel');
    expect(humanizeName('GabrielSena')).toBe('Gabriel Sena');
    expect(humanizeName('AnaClaraSantosCampos')).toBe('Ana Clara Santos Campos');
  });

  it('mantém nomes mistos que já têm espaço (curados)', () => {
    expect(humanizeName('Thales Ruan Rodrigues')).toBe('Thales Ruan Rodrigues');
    expect(humanizeName('Antonio Carlos dos santos e santos')).toBe('Antonio Carlos dos santos e santos');
  });

  it('normaliza nome TODO MAIÚSCULO pra Title Case com partículas minúsculas', () => {
    expect(humanizeName('JOÃO DA SILVA')).toBe('João da Silva');
    expect(humanizeName('MARIA DE FÁTIMA DOS SANTOS E SOUZA')).toBe('Maria de Fátima dos Santos e Souza');
    expect(humanizeName('MARIA')).toBe('Maria');
  });

  it('normaliza nome todo minúsculo pra Title Case', () => {
    expect(humanizeName('maria souza')).toBe('Maria Souza');
    expect(humanizeName('joão da silva')).toBe('João da Silva');
    expect(humanizeName("ana d'ávila")).toBe("Ana D'Ávila");
    expect(humanizeName('ana-paula lima')).toBe('Ana-Paula Lima');
  });

  it('colapsa espaços repetidos', () => {
    expect(humanizeName('  JOÃO   DA  SILVA ')).toBe('João da Silva');
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
