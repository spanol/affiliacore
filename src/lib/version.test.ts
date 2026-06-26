import { describe, it, expect } from 'vitest';
import { isOutdated, buildVersionPayload } from './version';

// =============================================================================
// isOutdated — decide se o banner de atualização aparece (puro)
// =============================================================================
describe('isOutdated', () => {
  it('versões diferentes (ambas conhecidas) -> desatualizado', () => {
    expect(isOutdated('2026.06.26-100000', '2026.06.26-110000')).toBe(true);
    // a direção não importa: o servidor só publica a versão atual, qualquer
    // diferença = bundle velho.
    expect(isOutdated('2026.06.26-110000', '2026.06.26-100000')).toBe(true);
  });

  it('versões iguais -> atualizado', () => {
    expect(isOutdated('2026.06.26-100000', '2026.06.26-100000')).toBe(false);
  });

  it('remota ausente/vazia (sem doc publicado ainda) -> não alerta', () => {
    expect(isOutdated('2026.06.26-100000', null)).toBe(false);
    expect(isOutdated('2026.06.26-100000', undefined)).toBe(false);
    expect(isOutdated('2026.06.26-100000', '')).toBe(false);
  });

  it('local "dev" ou vazio (sem build) -> nunca alerta (sem banner falso no dev)', () => {
    expect(isOutdated('dev', '2026.06.26-100000')).toBe(false);
    expect(isOutdated('', '2026.06.26-100000')).toBe(false);
  });
});

// =============================================================================
// buildVersionPayload — shape do doc publicado no Firestore (puro)
// =============================================================================
describe('buildVersionPayload', () => {
  it('normaliza campos opcionais ausentes p/ string vazia', () => {
    expect(buildVersionPayload({ version: 'v1' })).toEqual({
      version: 'v1',
      buildTime: '',
      commit: '',
    });
  });

  it('preserva buildTime/commit quando presentes', () => {
    expect(
      buildVersionPayload({ version: 'v1', buildTime: '2026-06-26T10:00:00.000Z', commit: 'abc1234' }),
    ).toEqual({ version: 'v1', buildTime: '2026-06-26T10:00:00.000Z', commit: 'abc1234' });
  });
});
