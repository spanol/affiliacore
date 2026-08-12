import { describe, it, expect } from 'vitest';
import {
  sanitizeShowcase,
  buildShowcasePayload,
  normalizeShowcaseUrl,
  resolveShowcaseLogo,
  selfRegistrationOpen,
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

  it('logo da instância entra no payload (regra do InstanceLogo: par completo → variante escura)', () => {
    const p = buildShowcasePayload(
      { enabled: true },
      {
        name: 'Infinity',
        logoUrl: '/infinity/logo.svg',
        logoLightUrl: '/infinity/logo-sidebar-dark.svg',
        logoDarkUrl: '/infinity/logo-sidebar-white.svg',
      },
    );
    expect(p).toMatchObject({ logoUrl: '/infinity/logo-sidebar-white.svg' });
  });

  it('sem logo utilizável o campo é omitido (LP cai no avatar de inicial)', () => {
    expect(buildShowcasePayload({ enabled: true }, { name: 'X' })).not.toHaveProperty('logoUrl');
  });
});

describe('resolveShowcaseLogo', () => {
  it('par incompleto conta como "sem par" → mono clássica', () => {
    expect(resolveShowcaseLogo({ logoUrl: '/x/logo.svg', logoDarkUrl: '/x/dark.svg' })).toBe('/x/logo.svg');
    expect(resolveShowcaseLogo({ logoUrl: '/x/logo.svg', logoLightUrl: '/x/light.svg' })).toBe('/x/logo.svg');
  });

  it('aceita https absoluta e caminho com raiz; rejeita esquema livre (vira src de <img> na LP)', () => {
    expect(resolveShowcaseLogo({ logoUrl: 'https://cdn.x.com/logo.svg' })).toBe('https://cdn.x.com/logo.svg');
    expect(resolveShowcaseLogo({ logoUrl: '/affiliacore/logo.svg' })).toBe('/affiliacore/logo.svg');
    expect(resolveShowcaseLogo({ logoUrl: 'javascript:alert(1)' })).toBeUndefined();
    expect(resolveShowcaseLogo({ logoUrl: '//evil.com/logo.svg' })).toBeUndefined();
    expect(resolveShowcaseLogo({ logoUrl: 'http://inseguro.com/logo.svg' })).toBeUndefined();
    expect(resolveShowcaseLogo({})).toBeUndefined();
  });

  it('par completo com variante escura inválida cai na mono em vez de sumir', () => {
    expect(
      resolveShowcaseLogo({ logoUrl: '/x/logo.svg', logoLightUrl: '/x/l.svg', logoDarkUrl: 'data:image/svg+xml,x' }),
    ).toBe('/x/logo.svg');
  });
});

describe('selfRegistrationOpen (vitrine = declaração de auto-cadastro)', () => {
  it('só um {enabled:false} explícito fecha o cadastro', () => {
    expect(selfRegistrationOpen({ enabled: false })).toBe(false);
    expect(selfRegistrationOpen({ enabled: true, name: 'X' })).toBe(true);
  });

  it('FAIL-OPEN: resposta ilegível ou sem o campo mantém o cadastro aberto', () => {
    expect(selfRegistrationOpen(null)).toBe(true); // fetch falhou
    expect(selfRegistrationOpen('<!doctype html>')).toBe(true); // build antiga → fallback SPA
    expect(selfRegistrationOpen({})).toBe(true);
    expect(selfRegistrationOpen(undefined)).toBe(true);
  });
});
