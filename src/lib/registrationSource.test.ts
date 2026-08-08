import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeRegistrationSource,
  extractRegistrationSource,
  registrationSourceLabel,
  captureRegistrationSource,
  readStoredRegistrationSource,
  REGISTRATION_SOURCE_KEY,
  REGISTRATION_SOURCE_MAX,
  VITRINE_SOURCE,
} from './registrationSource';

beforeEach(() => {
  sessionStorage.clear();
});

describe('normalizeRegistrationSource', () => {
  it('aceita slug minúsculo e normaliza caixa/espaços', () => {
    expect(normalizeRegistrationSource('  Vitrine-AffiliaCore ')).toBe('vitrine-affiliacore');
    expect(normalizeRegistrationSource('ig_bio')).toBe('ig_bio'); // underscore é comum em utm_source
    expect(normalizeRegistrationSource('ig.bio')).toBe('ig.bio');
  });

  it('rejeita vazio, formato livre e acima do teto', () => {
    expect(normalizeRegistrationSource('')).toBeNull();
    expect(normalizeRegistrationSource(null)).toBeNull();
    expect(normalizeRegistrationSource('<script>alert(1)</script>')).toBeNull();
    expect(normalizeRegistrationSource('-comeca-com-hifen')).toBeNull();
    expect(normalizeRegistrationSource('a'.repeat(REGISTRATION_SOURCE_MAX + 1))).toBeNull();
  });
});

describe('extractRegistrationSource', () => {
  it('src explícito vence utm_source; utm_source cobre quando src falta', () => {
    expect(extractRegistrationSource('?src=vitrine-affiliacore&utm_source=instagram')).toBe('vitrine-affiliacore');
    expect(extractRegistrationSource('?utm_source=Instagram')).toBe('instagram');
    expect(extractRegistrationSource('?foo=bar')).toBeNull();
    expect(extractRegistrationSource('')).toBeNull();
  });

  it('src inválido cai no utm_source válido', () => {
    expect(extractRegistrationSource('?src=<x>&utm_source=fb')).toBe('fb');
  });
});

describe('captura + leitura na sessionStorage', () => {
  it('captura, persiste e lê de volta', () => {
    captureRegistrationSource(`?src=${VITRINE_SOURCE}`);
    expect(readStoredRegistrationSource()).toBe(VITRINE_SOURCE);
  });

  it('first-touch: origem já capturada não é sobrescrita', () => {
    captureRegistrationSource(`?src=${VITRINE_SOURCE}`);
    captureRegistrationSource('?src=outra-origem');
    expect(readStoredRegistrationSource()).toBe(VITRINE_SOURCE);
  });

  it('query sem origem não grava nada', () => {
    captureRegistrationSource('?foo=bar');
    expect(sessionStorage.getItem(REGISTRATION_SOURCE_KEY)).toBeNull();
    expect(readStoredRegistrationSource()).toBeNull();
  });

  it('valor adulterado na storage sai saneado na leitura', () => {
    sessionStorage.setItem(REGISTRATION_SOURCE_KEY, '<img onerror=x>');
    expect(readStoredRegistrationSource()).toBeNull();
  });
});

describe('registrationSourceLabel', () => {
  it('vitrine ganha rótulo amigável; origem desconhecida sai crua; inválida sai vazia', () => {
    expect(registrationSourceLabel(VITRINE_SOURCE)).toBe('Vitrine AffiliaCore');
    expect(registrationSourceLabel('instagram')).toBe('instagram');
    expect(registrationSourceLabel('<x>')).toBe('');
    expect(registrationSourceLabel(null)).toBe('');
  });
});
