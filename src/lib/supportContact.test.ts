import { describe, it, expect } from 'vitest';
import {
  normalizeWhatsappPhone,
  sanitizeSupportContact,
  buildWhatsappUrl,
  formatSupportPhone,
  SUPPORT_LABEL_DEFAULT,
} from './supportContact';

describe('normalizeWhatsappPhone', () => {
  it('celular BR com DDD e máscara recebe o 55', () => {
    expect(normalizeWhatsappPhone('(11) 98888-7777')).toBe('5511988887777');
  });
  it('fixo BR de 10 dígitos também recebe o 55', () => {
    expect(normalizeWhatsappPhone('1138887777')).toBe('551138887777');
  });
  it('número já com DDI é preservado (não duplica o 55)', () => {
    expect(normalizeWhatsappPhone('+55 11 98888-7777')).toBe('5511988887777');
    expect(normalizeWhatsappPhone('+351 912 345 678')).toBe('351912345678');
  });
  it('vazio → string vazia (desliga o contato), não erro', () => {
    expect(normalizeWhatsappPhone('')).toBe('');
    expect(normalizeWhatsappPhone('   ')).toBe('');
    expect(normalizeWhatsappPhone(undefined)).toBe('');
  });
  it.each([
    ['curto demais', '99999'],
    ['9 dígitos (sem DDD)', '988887777'],
    ['longo demais', '1234567890123456'],
  ])('inválido (%s) → null', (_label, v) => {
    expect(normalizeWhatsappPhone(v)).toBeNull();
  });
});

describe('sanitizeSupportContact', () => {
  it('entrada válida → normalizado com defaults', () => {
    const r = sanitizeSupportContact({ phone: '(11) 98888-7777' });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({
      phone: '5511988887777',
      message: '',
      label: SUPPORT_LABEL_DEFAULT,
      active: true,
    });
  });
  it('telefone inválido → erro', () => {
    const r = sanitizeSupportContact({ phone: '123' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/telefone/i);
  });
  it('sem telefone o contato fica INATIVO mesmo pedindo active:true', () => {
    const r = sanitizeSupportContact({ phone: '', active: true });
    expect(r.ok).toBe(true);
    expect(r.value?.active).toBe(false);
  });
  it('rótulo vazio cai no default; mensagem é truncada', () => {
    const r = sanitizeSupportContact({ phone: '11988887777', label: '  ', message: 'x'.repeat(500) });
    expect(r.value?.label).toBe(SUPPORT_LABEL_DEFAULT);
    expect(r.value?.message).toHaveLength(300);
  });
});

describe('buildWhatsappUrl', () => {
  it('monta o deep link com a mensagem codificada', () => {
    expect(
      buildWhatsappUrl({ phone: '5511988887777', message: 'Olá, preciso de ajuda', active: true }),
    ).toBe('https://wa.me/5511988887777?text=Ol%C3%A1%2C%20preciso%20de%20ajuda');
  });
  it('sem mensagem → link sem query', () => {
    expect(buildWhatsappUrl({ phone: '5511988887777', active: true })).toBe(
      'https://wa.me/5511988887777',
    );
  });
  it.each([
    ['inativo', { phone: '5511988887777', active: false }],
    ['sem telefone', { phone: '', active: true }],
    ['nulo', null],
  ])('%s → string vazia (a sidebar não renderiza o item)', (_label, contact) => {
    expect(buildWhatsappUrl(contact as any)).toBe('');
  });
});

describe('formatSupportPhone', () => {
  it('formata celular e fixo BR', () => {
    expect(formatSupportPhone('5511988887777')).toBe('+55 (11) 98888-7777');
    expect(formatSupportPhone('551138887777')).toBe('+55 (11) 3888-7777');
  });
  it('estrangeiro sai só com +, sem inventar formato', () => {
    expect(formatSupportPhone('351912345678')).toBe('+351912345678');
  });
  it('vazio → vazio', () => {
    expect(formatSupportPhone('')).toBe('');
    expect(formatSupportPhone(null)).toBe('');
  });
});
