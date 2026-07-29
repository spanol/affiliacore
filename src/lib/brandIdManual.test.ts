import { describe, it, expect, beforeEach } from 'vitest';
import { buildBrandIdOf } from './brand';
import { syncKnownBrandsFrom } from '../services/houseService';
import { buildEligibleUpline, buildNetworkTree, buildRootConfigMap } from './network';

// Casa MANUAL = sem `brandId` da OTG. É o caso de toda instância OTG-free.
const CASAS_MANUAIS = [
  { id: 'super-bet-v2', slug: 'super-bet-v2', name: 'Super Bet V2', dataSource: 'manual' as const, brandId: null },
  { id: 'stake', slug: 'stake', name: 'Stake', dataSource: 'manual' as const, brandId: null },
];

describe('buildBrandIdOf · casa MANUAL resolve pelo slug', () => {
  beforeEach(() => { syncKnownBrandsFrom(CASAS_MANUAIS as any); });

  it('afiliado de casa manual recebe o SLUG como brandId', () => {
    // Parar em `meta.id` devolvia undefined e o byBrand[slug] nunca era achado.
    const f = buildBrandIdOf([{ id: 'a1', brand: { name: 'Super Bet V2' } }]);
    expect(f('a1')).toBe('super-bet-v2');
  });

  it('`brand.id` explícito continua vencendo (retrocompat OTG)', () => {
    const f = buildBrandIdOf([{ id: 'a1', brand: { id: 'clsuperbet000001', name: 'Super Bet V2' } }]);
    expect(f('a1')).toBe('clsuperbet000001');
  });

  it('afiliado sem casa continua sem brandId', () => {
    const f = buildBrandIdOf([{ id: 'a1' }, { id: 'a2', brand: null }]);
    expect(f('a1')).toBeUndefined();
    expect(f('a2')).toBeUndefined();
  });
});

describe('elegibilidade de upline com taxa SÓ por casa', () => {
  beforeEach(() => { syncKnownBrandsFrom(CASAS_MANUAIS as any); });

  const configs = {
    // topo: taxa apenas POR CASA — nenhuma taxa de topo, que é como a migração grava
    topo: { affiliateId: 'topo', byBrand: { 'super-bet-v2': { cpaValue: 280 } } },
    filho: { affiliateId: 'filho', byBrand: { 'super-bet-v2': { cpaValue: 270 } } },
  } as any;
  const afiliados = [
    { id: 'topo', brand: { name: 'Super Bet V2' } },
    { id: 'filho', brand: { name: 'Super Bet V2' } },
  ];

  it('SEM brandIdOf o upline é lido como "sem taxa" e a aresta cai', () => {
    // Regressão da migração da Infinity: as 141 arestas caíam com as taxas gravadas.
    const t = buildNetworkTree(
      [{ affiliateId: 'filho', uplineId: 'topo' }, { affiliateId: 'topo', uplineId: null }],
      { isEligibleUpline: buildEligibleUpline(configs) }
    );
    expect(t.dropped.map((x) => x.reason)).toContain('upline-inelegivel');
    expect(t.uplineOf.filho).toBeUndefined();
  });

  it('COM brandIdOf a aresta sobrevive e o custo sai pela taxa do TOPO', () => {
    const t = buildNetworkTree(
      [{ affiliateId: 'filho', uplineId: 'topo' }, { affiliateId: 'topo', uplineId: null }],
      { isEligibleUpline: buildEligibleUpline(configs, buildBrandIdOf(afiliados)) }
    );
    expect(t.dropped).toHaveLength(0);
    expect(t.uplineOf.filho).toBe('topo');
    // o filho passa a ser custeado pela config do TOPO (280), não pela própria (270)
    const raiz = buildRootConfigMap(t, configs);
    expect(raiz.filho?.byBrand?.['super-bet-v2']?.cpaValue).toBe(280);
  });
});
