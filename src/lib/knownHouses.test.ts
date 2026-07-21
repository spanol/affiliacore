import { describe, it, expect, vi, beforeEach } from 'vitest';

// A decisão de injetar (ou não) as casas-semente OTG depende de OTG_ENABLED
// (instanceClient). Testamos os DOIS estados isolando o módulo por reset+doMock.
describe('knownHouses — gating por OTG', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('OTG LIGADA: injeta as casas-semente OTG (Superbet/SportingBet)', async () => {
    vi.doMock('./instanceClient', () => ({ OTG_ENABLED: true }));
    const { withKnownBrandNames, withKnownHouses } = await import('./knownHouses');

    const names = withKnownBrandNames([]);
    expect(names).toContain('Superbet');
    expect(names).toContain('SportingBet');

    // linhas por casa: as conhecidas entram ZERADAS quando não vieram nos dados reais
    const rows = withKnownHouses<{ label: string }>([]);
    expect(rows.map((r) => r.label)).toEqual(expect.arrayContaining(['Superbet', 'SportingBet']));
  });

  it('OTG DESLIGADA: NÃO injeta casa OTG — some do dashboard e do filtro', async () => {
    vi.doMock('./instanceClient', () => ({ OTG_ENABLED: false }));
    const { withKnownBrandNames, withKnownHouses } = await import('./knownHouses');

    expect(withKnownBrandNames([])).toEqual([]);
    // nomes reais (afiliados/manual) passam intactos, sem ganhar as casas OTG
    expect(withKnownBrandNames(['Casa Manual'])).toEqual(['Casa Manual']);
    // nenhuma linha vazia de casa OTG é adicionada
    expect(withKnownHouses<{ label: string }>([])).toEqual([]);
  });

  it('OTG DESLIGADA: casa conhecida NÃO-otg (dataSource manual) sobrevive', async () => {
    vi.doMock('./instanceClient', () => ({ OTG_ENABLED: false }));
    const brand = await import('./brand');
    brand.setKnownBrands([{ slug: 'alfa', name: 'Casa Alfa', active: true, dataSource: 'manual' } as any]);
    const { withKnownBrandNames } = await import('./knownHouses');

    expect(withKnownBrandNames([])).toContain('Casa Alfa');
    brand.setKnownBrands(null); // restaura as sementes
  });
});
