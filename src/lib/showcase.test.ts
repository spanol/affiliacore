import { describe, it, expect } from 'vitest';
import {
  sanitizeShowcase,
  buildShowcasePayload,
  normalizeShowcaseUrl,
  SHOWCASE_DESCRIPTION_MAX,
} from './showcase';

describe('normalizeShowcaseUrl', () => {
  it('aceita vazio (sem link) e https absoluta', () => {
    expect(normalizeShowcaseUrl('')).toBe('');
    expect(normalizeShowcaseUrl(undefined)).toBe('');
    expect(normalizeShowcaseUrl('  https://suaagencia.com.br  ')).toBe('https://suaagencia.com.br');
  });

  it('rejeita http cru, esquema estranho e URL quebrada', () => {
    expect(normalizeShowcaseUrl('http://inseguro.com')).toBeNull();
    expect(normalizeShowcaseUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeShowcaseUrl('suaagencia.com.br')).toBeNull();
    expect(normalizeShowcaseUrl('https://')).toBeNull();
  });
});

describe('sanitizeShowcase', () => {
  it('normaliza o input do admin (trim, teto de tamanho, enabled só com true literal)', () => {
    const r = sanitizeShowcase({
      enabled: true,
      description: `  ${'x'.repeat(SHOWCASE_DESCRIPTION_MAX + 50)}  `,
      siteUrl: 'https://agencia.bet',
    });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ enabled: true, siteUrl: 'https://agencia.bet' });
    expect(r.value!.description).toHaveLength(SHOWCASE_DESCRIPTION_MAX);
  });

  it('corpo vazio vira config desligada sem erro', () => {
    const r = sanitizeShowcase({});
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ enabled: false, description: '', siteUrl: '' });
  });

  it('enabled truthy-mas-não-true não liga a vitrine', () => {
    expect(sanitizeShowcase({ enabled: 'true' }).value!.enabled).toBe(false);
    expect(sanitizeShowcase({ enabled: 1 }).value!.enabled).toBe(false);
  });

  it('URL inválida derruba o save com mensagem', () => {
    const r = sanitizeShowcase({ enabled: true, siteUrl: 'ftp://x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/https/);
  });
});

describe('buildShowcasePayload', () => {
  const brand = { name: 'Infinity Affiliates', accent: '#7C3AED' };

  it('sem doc ou desligado → só {enabled:false}, sem vazar rascunho', () => {
    expect(buildShowcasePayload(null, brand)).toEqual({ enabled: false });
    expect(
      buildShowcasePayload({ enabled: false, description: 'rascunho secreto', siteUrl: 'https://x.com' }, brand),
    ).toEqual({ enabled: false });
  });

  it('ligado → nome da marca + apresentação + site + accent', () => {
    expect(
      buildShowcasePayload({ enabled: true, description: 'Agência com 80+ afiliados.', siteUrl: 'https://inf.agency' }, brand),
    ).toEqual({
      enabled: true,
      name: 'Infinity Affiliates',
      description: 'Agência com 80+ afiliados.',
      siteUrl: 'https://inf.agency',
      accent: '#7C3AED',
    });
  });

  it('accent fora do formato hex NÃO entra (vai pra style na LP)', () => {
    const p = buildShowcasePayload({ enabled: true }, { name: 'X', accent: 'red; background:url(x)' });
    expect(p).not.toHaveProperty('accent');
  });

  it('doc com lixo (siteUrl não-https gravada por fora) sai saneado', () => {
    const p = buildShowcasePayload({ enabled: true, siteUrl: 'javascript:alert(1)' } as any, { name: 'X' });
    expect(p).toMatchObject({ enabled: true, siteUrl: '' });
  });

  it('marca sem nome cai no default do produto', () => {
    expect(buildShowcasePayload({ enabled: true }, { name: '' })).toMatchObject({ name: 'AffiliaCore' });
  });
});
