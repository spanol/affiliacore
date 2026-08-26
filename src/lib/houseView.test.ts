import { describe, it, expect } from 'vitest';
import { HOUSE_ADMIN_ONLY_FIELDS, sanitizeHouseForViewer, sanitizeHousesForViewer } from './houseView';

// O caso que motivou a projeção (caça de 26/08): qualquer logado lia a taxa
// casa→agência e a fila de tags com dinheiro no GET /api/houses.
const CASA = {
  id: 'esportiva-bet',
  slug: 'esportiva-bet',
  name: 'Esportiva Bet',
  logo: 'data:image/svg+xml;base64,x',
  active: true,
  dataSource: 'manual',
  cpaCurrency: 'BRL',
  issPercent: 2,
  minRedeposit: 20,
  lastResultsSyncAt: '2026-08-26T12:00:00.000Z',
  lastResultsSyncSource: 'api',
  defaultCpa: 280,
  defaultRev: 5,
  fxMode: 'live',
  fxRate: null,
  revInProfit: true,
  integration: 'esportiva-tap',
  integrationExternalId: null,
  pullAvailable: true,
  pendingTags: [{ tag: 'orfa', days: 2, registrations: 1, first_deposits: 1, qualified_cpa: 1, total_commission: 280 }],
  pendingTagsAt: '2026-08-26T12:00:00.000Z',
};

describe('sanitizeHouseForViewer', () => {
  it('afiliado NÃO recebe a taxa casa→agência nem a fila de tags: campos REMOVIDOS, não zerados', () => {
    const vista = sanitizeHouseForViewer(CASA, 'client');
    for (const campo of HOUSE_ADMIN_ONLY_FIELDS) {
      expect(vista, `campo de gestão "${campo}" vazou ao afiliado`).not.toHaveProperty(campo);
    }
  });

  it('o que o afiliado PRECISA continua: logo, frescor, ISS, redepósito, moeda', () => {
    const vista = sanitizeHouseForViewer(CASA, 'client');
    expect(vista).toMatchObject({
      slug: 'esportiva-bet', name: 'Esportiva Bet', logo: CASA.logo, active: true,
      issPercent: 2, minRedeposit: 20, cpaCurrency: 'BRL',
      lastResultsSyncAt: CASA.lastResultsSyncAt, lastResultsSyncSource: 'api',
    });
  });

  it('admin recebe o objeto intacto', () => {
    expect(sanitizeHouseForViewer(CASA, 'admin')).toEqual(CASA);
  });

  it('papel ausente é tratado como não-admin (fail-closed)', () => {
    expect(sanitizeHouseForViewer(CASA, undefined)).not.toHaveProperty('defaultCpa');
    expect(sanitizeHouseForViewer(CASA, null)).not.toHaveProperty('pendingTags');
  });

  it('não muta a entrada', () => {
    sanitizeHouseForViewer(CASA, 'client');
    expect(CASA.defaultCpa).toBe(280);
    expect(CASA.pendingTags).toHaveLength(1);
  });
});

describe('sanitizeHousesForViewer', () => {
  it('projeta a lista inteira e aguenta entrada ausente', () => {
    expect(sanitizeHousesForViewer([CASA, CASA], 'client').every((h) => !('defaultCpa' in h))).toBe(true);
    expect(sanitizeHousesForViewer(null, 'client')).toEqual([]);
  });
});
