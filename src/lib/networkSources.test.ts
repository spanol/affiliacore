import { describe, it, expect } from 'vitest';
import {
  buildNetworkSourceRows,
  summarizeNetworkSources,
  filterRowsByHouse,
  HOUSE_UNKNOWN,
} from './networkSources';
import { ALL_BRANDS } from './brand';

const HOUSES: Record<string, { name: string; brandId?: string }> = {
  'A-1': { name: 'Superbet', brandId: 'clsuperbet000001' },
  'A-2': { name: 'Superbet', brandId: 'clsuperbet000001' },
  'A-3': { name: 'Betano', brandId: 'betano' },
};
const otgHouseOf = (id: string) => HOUSES[id] ?? null;
const manualHouseOf = (slug: string) =>
  slug === 'esportiva' ? { name: 'Esportiva Bet', brandId: 'esportiva' } : null;

describe('buildNetworkSourceRows', () => {
  it('OTG pega a casa do AFILIADO; manual pega a casa da LINHA', () => {
    const rows = buildNetworkSourceRows({
      results: [{ affiliate_id: 'A-1', qualified_cpa: 2, rvs: 100 }],
      manualRows: [{ affiliateId: 'A-9', houseSlug: 'esportiva', qualified_cpa: 1, rvs: 50 } as any],
      otgHouseOf,
      manualHouseOf,
    });
    expect(rows).toEqual([
      { affiliateId: 'A-1', brandId: 'clsuperbet000001', house: 'Superbet', origin: 'otg', qualified_cpa: 2, rvs: 100 },
      { affiliateId: 'A-9', brandId: 'esportiva', house: 'Esportiva Bet', origin: 'manual', qualified_cpa: 1, rvs: 50 },
    ]);
  });

  it('leva o brandId da OTG — sem ele quem só tem taxa POR CASA cairia na de topo', () => {
    const [row] = buildNetworkSourceRows({
      results: [{ id: 'A-3', qualified_cpa: 1, rvs: 0 }],
      manualRows: [],
      otgHouseOf,
      manualHouseOf,
    });
    expect(row.brandId).toBe('betano');
  });

  it('descarta a linha AGREGADA da casa (affiliateId null) — a rede é por afiliado', () => {
    const rows = buildNetworkSourceRows({
      results: [],
      manualRows: [
        { affiliateId: null, houseSlug: 'esportiva', qualified_cpa: 99, rvs: 9 } as any,
        { affiliateId: 'A-9', houseSlug: 'esportiva', qualified_cpa: 1, rvs: 1 } as any,
      ],
      otgHouseOf,
      manualHouseOf,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].affiliateId).toBe('A-9');
  });

  it('afiliado sem casa no mirror vai p/ o balde desconhecido (não some)', () => {
    const [row] = buildNetworkSourceRows({
      results: [{ affiliate_id: 'ORFA', qualified_cpa: 5, rvs: 0 }],
      manualRows: [],
      otgHouseOf,
      manualHouseOf,
    });
    expect(row.house).toBe(HOUSE_UNKNOWN);
    expect(row.brandId).toBeUndefined();
  });

  it('casa manual fora do registro cai no slug (nome e chave), sem perder a linha', () => {
    const [row] = buildNetworkSourceRows({
      results: [],
      manualRows: [{ affiliateId: 'A-9', houseSlug: 'casa-nova', qualified_cpa: 1, rvs: 0 } as any],
      otgHouseOf,
      manualHouseOf,
    });
    expect(row).toMatchObject({ house: 'casa-nova', brandId: 'casa-nova' });
  });
});

describe('summarizeNetworkSources', () => {
  const rows = buildNetworkSourceRows({
    results: [
      { affiliate_id: 'A-1', qualified_cpa: 2, rvs: 100 },
      { affiliate_id: 'A-2', qualified_cpa: 1, rvs: 300 },
      { affiliate_id: 'A-3', qualified_cpa: 1, rvs: 10 },
    ],
    manualRows: [{ affiliateId: 'A-9', houseSlug: 'esportiva', qualified_cpa: 1, rvs: 50 } as any],
    otgHouseOf,
    manualHouseOf,
  });

  it('conta afiliados DISTINTOS por casa e soma o volume', () => {
    const byHouse = Object.fromEntries(summarizeNetworkSources(rows).map((s) => [s.house, s]));
    expect(byHouse['Superbet']).toMatchObject({ affiliates: 2, qualified_cpa: 3, rvs: 400, origin: 'otg' });
    expect(byHouse['Esportiva Bet']).toMatchObject({ affiliates: 1, rvs: 50, origin: 'manual' });
  });

  it('ordena por volume (a casa que mais produziu primeiro)', () => {
    expect(summarizeNetworkSources(rows).map((s) => s.house)).toEqual(['Superbet', 'Esportiva Bet', 'Betano']);
  });

  it('casa alimentada pelas DUAS bases é marcada como "ambas"', () => {
    const mistas = buildNetworkSourceRows({
      results: [{ affiliate_id: 'A-3', qualified_cpa: 1, rvs: 0 }],
      manualRows: [{ affiliateId: 'A-4', houseSlug: 'betano', qualified_cpa: 1, rvs: 0 } as any],
      otgHouseOf,
      manualHouseOf: (slug) => (slug === 'betano' ? { name: 'Betano', brandId: 'betano' } : null),
    });
    expect(summarizeNetworkSources(mistas)[0]).toMatchObject({ house: 'Betano', origin: 'ambas', affiliates: 2 });
  });

  it('lista vazia → nenhuma fonte (estado vazio da tela)', () => {
    expect(summarizeNetworkSources([])).toEqual([]);
  });
});

describe('filterRowsByHouse', () => {
  const rows = buildNetworkSourceRows({
    results: [{ affiliate_id: 'A-1', qualified_cpa: 2, rvs: 100 }, { affiliate_id: 'A-3', qualified_cpa: 1, rvs: 10 }],
    manualRows: [{ affiliateId: 'A-9', houseSlug: 'esportiva', qualified_cpa: 1, rvs: 50 } as any],
    otgHouseOf,
    manualHouseOf,
  });

  it('ALL_BRANDS (ou vazio) devolve tudo', () => {
    expect(filterRowsByHouse(rows, ALL_BRANDS)).toHaveLength(3);
    expect(filterRowsByHouse(rows, '')).toHaveLength(3);
  });

  it('recorta só a casa pedida, misturando OTG e manual pelo NOME', () => {
    expect(filterRowsByHouse(rows, 'Esportiva Bet').map((r) => r.affiliateId)).toEqual(['A-9']);
    expect(filterRowsByHouse(rows, 'Superbet').map((r) => r.affiliateId)).toEqual(['A-1']);
  });

  it('casa sem produção no período devolve vazio (zera os cards, não quebra)', () => {
    expect(filterRowsByHouse(rows, 'KTO')).toEqual([]);
  });
});
