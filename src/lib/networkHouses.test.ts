import { describe, it, expect } from 'vitest';
import {
  hasProduction,
  networkHouseKeys,
  filterHouseOptions,
  filterBrandRows,
  linksOfAffiliates,
} from './networkHouses';
import type { HouseOption } from './subHouseRates';

const OPTIONS: HouseOption[] = [
  { key: 'winhugo', name: 'Winhugo' },
  { key: 'kto', name: 'KTO' },
  { key: 'novibet', name: 'Novibet' },
  { key: 'oleybet', name: 'OleyBet' },
];

const semCasa = () => undefined;

describe('hasProduction', () => {
  it('linha zerada não é produção', () => {
    expect(hasProduction({ registrations: 0, qualified_cpa: 0, rvs: 0, total_commission: 0 })).toBe(false);
    expect(hasProduction({})).toBe(false);
    expect(hasProduction(null)).toBe(false);
  });

  it('cadastro sem FTD JÁ conta (a rede está operando na casa)', () => {
    expect(hasProduction({ registrations: 1 })).toBe(true);
  });

  it('métrica em string (shape cru da API) conta', () => {
    expect(hasProduction({ rvs: '12.5' })).toBe(true);
  });

  it('valor não numérico não vira produção', () => {
    expect(hasProduction({ qualified_cpa: 'n/a' })).toBe(false);
  });
});

describe('networkHouseKeys', () => {
  it('link ATIVO com dono entra; link do pool e link inativo ficam de fora', () => {
    const keys = networkHouseKeys(
      [
        { affiliateId: 'a1', brandId: 'winhugo', active: true },
        { affiliateId: null, brandId: 'novibet', active: true }, // pool: de ninguém
        { affiliateId: 'a1', brandId: 'oleybet', active: false }, // desligado
      ],
      { otg: [], manual: [] },
      semCasa
    );
    expect([...keys].sort()).toEqual(['winhugo']);
  });

  it('link sem `active` conta (ausência = ativo, como no doc antigo)', () => {
    const keys = networkHouseKeys([{ affiliateId: 'a1', brandId: 'kto' }], { otg: [], manual: [] }, semCasa);
    expect(keys.has('kto')).toBe(true);
  });

  it('casa com produção MANUAL entra mesmo sem link emitido (apelido de tag)', () => {
    const keys = networkHouseKeys(
      [],
      { otg: [], manual: [{ houseSlug: 'esportiva-bet', affiliateId: 'a1', qualified_cpa: 2 }] },
      semCasa
    );
    expect([...keys]).toEqual(['esportiva-bet']);
  });

  it('linha manual ZERADA não acende a casa', () => {
    const keys = networkHouseKeys(
      [],
      { otg: [], manual: [{ houseSlug: 'novibet', affiliateId: 'a1', qualified_cpa: 0, rvs: 0 }] },
      semCasa
    );
    expect(keys.size).toBe(0);
  });

  it('produção OTG usa a casa do MIRROR (brandIdOf), como o /admin', () => {
    const keys = networkHouseKeys(
      [],
      { otg: [{ affiliate_id: 'a1', qualified_cpa: 3 }], manual: [] },
      (id) => (id === 'a1' ? 'clsuperbet000001' : undefined)
    );
    expect([...keys]).toEqual(['clsuperbet000001']);
  });

  it('afiliado sem casa no mirror não inventa chave vazia', () => {
    const keys = networkHouseKeys([], { otg: [{ affiliate_id: 'a1', qualified_cpa: 3 }], manual: [] }, semCasa);
    expect(keys.size).toBe(0);
  });

  it('une as duas pontas sem duplicar', () => {
    const keys = networkHouseKeys(
      [{ affiliateId: 'a1', brandId: 'winhugo', active: true }],
      { otg: [], manual: [{ houseSlug: 'winhugo', affiliateId: 'a1', qualified_cpa: 1 }] },
      semCasa
    );
    expect([...keys]).toEqual(['winhugo']);
  });
});

describe('filterHouseOptions', () => {
  it('recorta o seletor às casas da rede', () => {
    const keys = new Set(['winhugo', 'kto']);
    expect(filterHouseOptions(OPTIONS, keys).map((o) => o.name)).toEqual(['Winhugo', 'KTO']);
  });

  it('FAIL-OPEN: rede sem casa nenhuma devolve o catálogo inteiro', () => {
    // Seletor vazio aqui não é tela limpa: sem casa selecionada o gerente perde o
    // gesto de comissão por casa.
    expect(filterHouseOptions(OPTIONS, new Set())).toHaveLength(4);
    expect(filterHouseOptions(OPTIONS, null)).toHaveLength(4);
  });

  it('FAIL-OPEN: chave que não casa com nenhuma casa devolve o catálogo', () => {
    expect(filterHouseOptions(OPTIONS, new Set(['casa-que-saiu']))).toHaveLength(4);
  });

  it('lista vazia continua vazia', () => {
    expect(filterHouseOptions([], new Set(['winhugo']))).toEqual([]);
    expect(filterHouseOptions(null, new Set(['winhugo']))).toEqual([]);
  });
});

describe('filterBrandRows', () => {
  const rows = [
    { id: 'winhugo', label: 'Winhugo', qualified_cpa: 2, total_commission: 300 },
    { id: 'kto', label: 'KTO', qualified_cpa: 0, total_commission: 0 },
    { id: 'novibet', label: 'Novibet', qualified_cpa: 0, total_commission: 0 },
  ];

  it('mantém só as casas da rede quando as demais estão zeradas', () => {
    const kept = filterBrandRows(rows, new Set(['winhugo', 'kto']));
    expect(kept.map((r) => r.id)).toEqual(['winhugo', 'kto']);
  });

  it('INVARIANTE: linha COM número passa mesmo fora do conjunto de chaves', () => {
    const kept = filterBrandRows(
      [...rows, { id: 'estranha', label: 'Casa Estranha', qualified_cpa: 1, total_commission: 99 }],
      new Set(['kto'])
    );
    // `winhugo` também passa: tem número. É o mesmo motivo, pela outra porta.
    expect(kept.map((r) => r.id)).toEqual(['winhugo', 'kto', 'estranha']);
  });

  it('conjunto vazio devolve tudo (fail-open)', () => {
    expect(filterBrandRows(rows, new Set())).toHaveLength(3);
  });

  it('nenhuma linha sobrando devolve tudo em vez de tela vazia', () => {
    const zeradas = [{ id: 'kto', qualified_cpa: 0 }, { id: 'novibet', qualified_cpa: 0 }];
    expect(filterBrandRows(zeradas, new Set(['winhugo']))).toHaveLength(2);
  });

  it('aceita extrator de chave próprio', () => {
    const kept = filterBrandRows(
      [{ slug: 'winhugo' }, { slug: 'novibet' }],
      new Set(['winhugo']),
      (r) => r.slug
    );
    expect(kept).toEqual([{ slug: 'winhugo' }]);
  });
});

describe('linksOfAffiliates', () => {
  const links = [
    { affiliateId: 'a1', brandId: 'winhugo', active: true },
    { affiliateId: 'a2', brandId: 'kto', active: true },
    { affiliateId: null, brandId: 'blaze', active: true },
  ];

  it('recorta ao dono — o GET do admin devolve os links de TODO MUNDO', () => {
    expect(linksOfAffiliates(links, ['a1'])).toEqual([links[0]]);
  });

  it('aceita mais de um dono (visão de rede do especial)', () => {
    expect(linksOfAffiliates(links, ['a1', 'a2'])).toHaveLength(2);
  });

  it('sem dono informado não devolve NADA (nunca cai em "todos")', () => {
    expect(linksOfAffiliates(links, [])).toEqual([]);
    expect(linksOfAffiliates(links, null)).toEqual([]);
    expect(linksOfAffiliates(links, [''])).toEqual([]);
  });

  it('a casa do afiliado sai do link DELE, não do link do vizinho', () => {
    const keys = networkHouseKeys(linksOfAffiliates(links, ['a1']), { otg: [], manual: [] }, () => undefined);
    expect([...keys]).toEqual(['winhugo']);
  });
});
