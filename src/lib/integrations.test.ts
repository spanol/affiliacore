import { describe, it, expect } from 'vitest';
import {
  INTEGRATION_CATALOG,
  findIntegrationSpec,
  maskSecret,
  sanitizeIntegrationPatch,
  integrationFromDoc,
  resolveConnectorSettings,
  toPublicIntegration,
  numericSetting,
} from './integrations';

const spec = findIntegrationSpec('esportiva-tap')!;

describe('catálogo', () => {
  it('é FECHADO: id desconhecido não resolve (a coleção não vira depósito)', () => {
    expect(findIntegrationSpec('esportiva-tap')?.id).toBe('esportiva-tap');
    expect(findIntegrationSpec('inventada')).toBeNull();
    expect(findIntegrationSpec(null)).toBeNull();
    expect(INTEGRATION_CATALOG.length).toBeGreaterThan(0);
  });
});

describe('maskSecret · a chave nunca sai em claro', () => {
  it('mostra só o rabicho', () => {
    expect(maskSecret('abcdef123456')).toBe('••••3456');
    expect(maskSecret('abc')).toBe('••••');
    expect(maskSecret('')).toBe('');
    expect(maskSecret(null)).toBe('');
  });
  it('a máscara não contém o miolo da chave', () => {
    expect(maskSecret('super-secreta-9999')).not.toContain('secreta');
  });
});

describe('sanitizeIntegrationPatch', () => {
  it('campo ausente = não mexe (dá pra salvar o toggle sem reenviar a chave)', () => {
    const patch = sanitizeIntegrationPatch({ enabled: false }, spec);
    expect(patch).toEqual({ enabled: false });
    expect('apiKey' in patch).toBe(false);
  });

  it('apiKey vazia/mascarada NÃO apaga a credencial gravada', () => {
    expect(sanitizeIntegrationPatch({ apiKey: '' }, spec).apiKey).toBeUndefined();
    expect(sanitizeIntegrationPatch({ apiKey: '   ' }, spec).apiKey).toBeUndefined();
  });

  it('apiKey null é o único jeito de REMOVER a chave (ato explícito)', () => {
    expect(sanitizeIntegrationPatch({ apiKey: null }, spec).apiKey).toBe('');
  });

  it('só aceita campos de config DECLARADOS no catálogo', () => {
    const patch = sanitizeIntegrationPatch({ config: { cpaBase: '150', hackeado: 'x' } }, spec);
    expect(patch.config).toEqual({ cpaBase: '150' });
  });

  it('houseId: string vazia vira null (desvincula)', () => {
    expect(sanitizeIntegrationPatch({ houseId: '  ' }, spec).houseId).toBeNull();
    expect(sanitizeIntegrationPatch({ houseId: 'esportiva-bet' }, spec).houseId).toBe('esportiva-bet');
  });

  it('ignora tipos errados em vez de gravar lixo', () => {
    expect(sanitizeIntegrationPatch({ enabled: 'sim', config: [1, 2] }, spec)).toEqual({});
    expect(sanitizeIntegrationPatch(null, spec)).toEqual({});
  });
});

describe('integrationFromDoc', () => {
  it('doc sem `enabled` explícito conta como LIGADO', () => {
    expect(integrationFromDoc('esportiva-tap', { apiKey: 'k' }).enabled).toBe(true);
  });
  it('enabled:false é respeitado', () => {
    expect(integrationFromDoc('esportiva-tap', { enabled: false }).enabled).toBe(false);
  });
  it('normaliza ausências', () => {
    const d = integrationFromDoc('esportiva-tap', null);
    expect(d).toMatchObject({ apiKey: '', houseId: null, config: {} });
  });
});

describe('resolveConnectorSettings · Firestore vence, env é fallback', () => {
  const env = {
    ESPORTIVA_API_KEY: 'chave-do-env',
    ESPORTIVA_HOUSE_SLUG: 'esportiva-bet',
    ESPORTIVA_CPA_BASE: '120',
  };

  it('SEM doc = comportamento antigo (100% env) — instância que não abriu a tela não para', () => {
    const s = resolveConnectorSettings(spec, null, env);
    expect(s.apiKey).toBe('chave-do-env');
    expect(s.houseSlug).toBe('esportiva-bet');
    expect(s.config.cpaBase).toBe('120');
    expect(s.configured).toBe(true);
    expect(s.keyFromEnv).toBe(true);
  });

  it('doc sobrepõe o env campo a campo', () => {
    const doc = integrationFromDoc('esportiva-tap', {
      apiKey: 'chave-da-tela', houseId: 'outra-casa', config: { cpaBase: '150' },
    });
    const s = resolveConnectorSettings(spec, doc, env);
    expect(s.apiKey).toBe('chave-da-tela');
    expect(s.houseSlug).toBe('outra-casa');
    expect(s.config.cpaBase).toBe('150');
    expect(s.keyFromEnv).toBe(false);
  });

  it('doc PARCIAL cai no env no que não declarou', () => {
    const doc = integrationFromDoc('esportiva-tap', { config: { cpaBase: '99' } });
    const s = resolveConnectorSettings(spec, doc, env);
    expect(s.apiKey).toBe('chave-do-env'); // sem chave no doc → env
    expect(s.config.cpaBase).toBe('99');
  });

  it('DESLIGAR pela tela desconfigura o conector mesmo com a chave no env (o ganho da feature)', () => {
    const doc = integrationFromDoc('esportiva-tap', { enabled: false });
    const s = resolveConnectorSettings(spec, doc, env);
    expect(s.enabled).toBe(false);
    expect(s.configured).toBe(false);
    expect(s.apiKey).toBe('chave-do-env'); // a chave continua lá, só não é usada
  });

  it('sem chave em lugar nenhum → não configurado', () => {
    expect(resolveConnectorSettings(spec, null, {}).configured).toBe(false);
  });

  it('env ausente e doc completo funciona (instância 100% Firestore)', () => {
    const doc = integrationFromDoc('esportiva-tap', { apiKey: 'k', houseId: 'casa-x' });
    const s = resolveConnectorSettings(spec, doc, {});
    expect(s.configured).toBe(true);
    expect(s.houseSlug).toBe('casa-x');
  });

  it('sem doc e sem env de casa, cai no default do conector', () => {
    const s = resolveConnectorSettings(spec, null, { ESPORTIVA_API_KEY: 'k' }, { houseSlug: 'esportiva-bet' });
    expect(s.houseSlug).toBe('esportiva-bet');
  });
});

describe('toPublicIntegration · o que chega ao browser', () => {
  const env = { ESPORTIVA_API_KEY: 'chave-secreta-1234' };

  it('devolve máscara, NUNCA a chave', () => {
    const pub = toPublicIntegration(spec, null, env);
    expect(pub.keyMask).toBe('••••1234');
    expect(pub.hasKey).toBe(true);
    expect(JSON.stringify(pub)).not.toContain('chave-secreta-1234');
  });

  it('sinaliza que a chave vem do env (Secret Manager), não da tela', () => {
    expect(toPublicIntegration(spec, null, env).keyFromEnv).toBe(true);
    const doc = integrationFromDoc('esportiva-tap', { apiKey: 'da-tela' });
    expect(toPublicIntegration(spec, doc, env).keyFromEnv).toBe(false);
  });

  it('carrega o catálogo (label/campos) junto do estado', () => {
    const pub = toPublicIntegration(spec, null, {});
    expect(pub.label).toContain('Esportiva');
    expect(pub.fields.map((f) => f.key)).toContain('cpaBase');
    expect(pub.hasKey).toBe(false);
    expect(pub.configured).toBe(false);
  });
});

describe('numericSetting', () => {
  it('usa o valor quando é número positivo; senão o default', () => {
    expect(numericSetting({ cpaBase: '150' }, 'cpaBase', 120)).toBe(150);
    expect(numericSetting({ cpaBase: '0' }, 'cpaBase', 120)).toBe(120);
    expect(numericSetting({ cpaBase: 'abc' }, 'cpaBase', 120)).toBe(120);
    expect(numericSetting(undefined, 'cpaBase', 120)).toBe(120);
  });
});
