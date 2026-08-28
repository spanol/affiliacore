import { describe, it, expect } from 'vitest';
import { buildBrandFilterOptions } from './brandFilterOptions';

// O caso que dirige o arquivo é a Infinity (28/08/2026): instância OTG-free, 17
// casas manuais no cadastro e afiliados nativos SEM o campo `brand`.

const casasInfinity = [
  { name: 'Esportiva Bet', active: true, dataSource: 'manual' as const },
  { name: 'LEON Bet', active: true, dataSource: 'manual' as const },
  { name: 'Winhugo', active: true, dataSource: 'manual' as const },
  { name: 'BetFury', active: true, dataSource: 'manual' as const },
];

describe('buildBrandFilterOptions · instância OTG-free (Infinity)', () => {
  it('oferece as casas do CADASTRO, não a marca que sobrou em três afiliados', () => {
    // 19 afiliados, só 3 com `brand` (sobra da migração do legado).
    const afiliados = [
      { id: 'a1', brand: null }, { id: 'a2', brand: null },
      { id: 'a3', brand: { name: 'Super Bet V2' } },
    ];
    expect(buildBrandFilterOptions(casasInfinity, afiliados, false))
      .toEqual(['BetFury', 'Esportiva Bet', 'LEON Bet', 'Super Bet V2', 'Winhugo']);
  });

  it('sem casa nenhuma no cadastro, o comportamento de hoje se mantém', () => {
    const afiliados = [{ id: 'a1', brand: { name: 'Esportiva Bet' } }];
    expect(buildBrandFilterOptions([], afiliados, false)).toEqual(['Esportiva Bet']);
  });

  it('casa PAUSADA fica de fora', () => {
    const casas = [...casasInfinity, { name: 'JonBet', active: false, dataSource: 'manual' as const }];
    expect(buildBrandFilterOptions(casas, [], false)).not.toContain('JonBet');
  });

  it('casa da OTG não vira fantasma numa instância que não fala com a OTG', () => {
    // As duas casas-semente embutidas no bundle são `dataSource: 'otg'`.
    const casas = [
      ...casasInfinity,
      { name: 'Superbet', active: true, dataSource: 'otg' as const },
      { name: 'SportingBet', active: true, dataSource: 'otg' as const },
    ];
    const nomes = buildBrandFilterOptions(casas, [], false);
    expect(nomes).not.toContain('Superbet');
    expect(nomes).not.toContain('SportingBet');
    expect(nomes).toContain('LEON Bet');
  });
});

describe('buildBrandFilterOptions · instância OTG (regressão zero)', () => {
  it('com a OTG ligada a casa dela entra normalmente', () => {
    const casas = [{ name: 'Superbet', active: true, dataSource: 'otg' as const }];
    expect(buildBrandFilterOptions(casas, [], true)).toEqual(['Superbet']);
  });

  it('marca que só existe no afiliado continua no filtro', () => {
    // Na OTG a casa vem do `brand` do afiliado e pode nem estar no cadastro.
    const afiliados = [{ id: 'a1', brand: { name: 'SportingBet' } }];
    expect(buildBrandFilterOptions([], afiliados, true)).toEqual(['SportingBet']);
  });

  it('não duplica quando a casa está nas duas fontes', () => {
    const casas = [{ name: 'Superbet', active: true, dataSource: 'otg' as const }];
    const afiliados = [{ id: 'a1', brand: { name: 'Superbet' } }];
    expect(buildBrandFilterOptions(casas, afiliados, true)).toEqual(['Superbet']);
  });
});

describe('buildBrandFilterOptions · shapes e bordas', () => {
  it('tolera os vários formatos do campo brand da API', () => {
    const afiliados = [
      { id: 'a1', brand: 'Betano' },
      { id: 'a2', marca: { nome: 'KTO' } },
      { id: 'a3', brand_name: 'Stake' },
      { id: 'a4', brand: { label: 'Blaze' } },
    ];
    expect(buildBrandFilterOptions([], afiliados, true)).toEqual(['Betano', 'Blaze', 'KTO', 'Stake']);
  });

  it('ordena em pt-BR', () => {
    const casas = [{ name: 'Ômega', active: true }, { name: 'Alfa', active: true }, { name: 'Ácido', active: true }];
    expect(buildBrandFilterOptions(casas, [], false)).toEqual(['Ácido', 'Alfa', 'Ômega']);
  });

  it('casa e marca sem nome ficam de fora, e nada lança', () => {
    expect(buildBrandFilterOptions([{ name: '   ', active: true }, null as any], [{ id: 'a', brand: '  ' }], false)).toEqual([]);
    expect(buildBrandFilterOptions(null, null, false)).toEqual([]);
    expect(buildBrandFilterOptions(undefined, undefined, true)).toEqual([]);
  });
});
