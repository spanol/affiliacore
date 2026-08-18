import { describe, it, expect } from 'vitest';
import {
  buildLinkTriage,
  rowsForView,
  searchRows,
  linksForBrand,
  isDeliverableLink,
  isStandbyLink,
  parseStandbyLinks,
  extractTagFromUrl,
  buildMyLinkCards,
  houseForBrandKey,
  type TriageLink,
} from './linkTriage';
import type { Deal } from './deal';

const deal = (over: Partial<Deal> = {}): Deal => ({
  id: 'd1', houseId: 'esportiva-bet', operatorName: 'Esportiva Bet', model: 'cpa',
  cpaValue: 110, revPercentage: 0, cycle: 'mensal', currency: 'BRL', geo: 'Brasil',
  active: true, ...over,
});

const link = (over: Partial<TriageLink> = {}): TriageLink => ({
  code: 'abc123',
  affiliateId: 'A1',
  brandId: null,
  registerUrl: 'https://casa.bet/cadastro',
  active: true,
  clicks: 0,
  ...over,
});

const roster = [
  { id: 'A1', name: 'Ana', email: 'ana@x.com' },
  { id: 'A2', name: 'Bruno', email: 'bruno@x.com' },
  { id: 'A3', name: 'Carla', email: 'carla@x.com' },
];

describe('isDeliverableLink / isStandbyLink', () => {
  it('entregável exige ativo E destino', () => {
    expect(isDeliverableLink(link())).toBe(true);
    expect(isDeliverableLink(link({ active: false }))).toBe(false);
    expect(isDeliverableLink(link({ registerUrl: '' }))).toBe(false);
    expect(isDeliverableLink(link({ registerUrl: null }))).toBe(false);
    expect(isDeliverableLink(null)).toBe(false);
  });
  it('standby é o link SEM dono', () => {
    expect(isStandbyLink(link({ affiliateId: null }))).toBe(true);
    expect(isStandbyLink(link({ affiliateId: '  ' }))).toBe(true);
    expect(isStandbyLink(link())).toBe(false);
  });
});

describe('linksForBrand', () => {
  const superbet = link({ code: 's', brandId: 'superbet' });
  const stake = link({ code: 'k', brandId: 'stake' });
  const semMarca = link({ code: 'n', brandId: null });

  it('sem filtro devolve tudo', () => {
    expect(linksForBrand([superbet, stake], null)).toHaveLength(2);
  });
  it('filtra pela marca e PRESERVA o link sem marca', () => {
    const r = linksForBrand([superbet, stake, semMarca], 'stake').map((l) => l.code);
    expect(r).toEqual(['k', 'n']);
  });
});

describe('buildLinkTriage — as 5 visões do legado', () => {
  const links = [
    link({ code: 'l1', affiliateId: 'A1', clicks: 5 }), // Ana: com link
    link({ code: 'l2', affiliateId: 'A2', clicks: 2 }), // Bruno: com link
    link({ code: 'pool', affiliateId: null, active: false }), // standby
  ];
  const producing = new Set(['A1']);

  it('conta cada visão como o painel legado', () => {
    const t = buildLinkTriage(roster, links, producing);
    expect(t.counts).toEqual({
      com_link: 2,
      sem_link: 1, // Carla
      standby: 1,
      com_link_sem_resultado: 1, // Bruno
      com_link_com_resultado: 1, // Ana
    });
  });

  it('separa o pool sem dono das linhas de afiliado', () => {
    const t = buildLinkTriage(roster, links, producing);
    expect(t.standby.map((l) => l.code)).toEqual(['pool']);
    expect(t.rows).toHaveLength(3);
  });

  it('link inativo ou sem destino conta como SEM link, mas é preservado p/ a UI', () => {
    const t = buildLinkTriage(roster, [link({ affiliateId: 'A1', registerUrl: '' })], new Set());
    const ana = t.rows.find((r) => r.affiliateId === 'A1')!;
    expect(ana.hasLink).toBe(false);
    expect(ana.link).not.toBeNull(); // a UI mostra o motivo em vez de um vazio mudo
    expect(t.counts.sem_link).toBe(3);
  });

  it('com vários links, vence o entregável', () => {
    const t = buildLinkTriage(
      roster,
      [link({ code: 'quebrado', affiliateId: 'A1', active: false }), link({ code: 'ok', affiliateId: 'A1' })],
      new Set(),
    );
    const ana = t.rows.find((r) => r.affiliateId === 'A1')!;
    expect(ana.hasLink).toBe(true);
    expect(ana.link?.code).toBe('ok');
  });

  it('cliques somam TODOS os links do afiliado, inclusive o desativado', () => {
    const t = buildLinkTriage(
      roster,
      [
        link({ code: 'velho', affiliateId: 'A1', active: false, clicks: 7 }),
        link({ code: 'novo', affiliateId: 'A1', clicks: 3 }),
      ],
      new Set(),
    );
    expect(t.rows.find((r) => r.affiliateId === 'A1')!.clicks).toBe(10);
  });

  it('clicks não-numérico não propaga NaN', () => {
    const t = buildLinkTriage(roster, [link({ affiliateId: 'A1', clicks: 'muitos' })], new Set());
    expect(t.rows.find((r) => r.affiliateId === 'A1')!.clicks).toBe(0);
  });

  it('escopo por casa: o link de outra marca não conta', () => {
    const t = buildLinkTriage(
      roster,
      [link({ affiliateId: 'A1', brandId: 'superbet' })],
      new Set(),
      'stake',
    );
    expect(t.counts.com_link).toBe(0);
    expect(t.counts.sem_link).toBe(3);
  });

  it('entradas nulas não quebram', () => {
    const t = buildLinkTriage(null, null, null);
    expect(t.rows).toEqual([]);
    expect(t.counts.com_link).toBe(0);
  });

  it('nome vazio cai no id (a linha nunca fica anônima)', () => {
    const t = buildLinkTriage([{ id: 'A9' }], [], new Set());
    expect(t.rows[0].name).toBe('A9');
  });
});

describe('rowsForView / searchRows', () => {
  const t = buildLinkTriage(
    roster,
    [link({ affiliateId: 'A1' }), link({ code: 'l2', affiliateId: 'A2' })],
    new Set(['A1']),
  );

  it('filtra por visão', () => {
    expect(rowsForView(t.rows, 'com_link').map((r) => r.affiliateId)).toEqual(['A1', 'A2']);
    expect(rowsForView(t.rows, 'sem_link').map((r) => r.affiliateId)).toEqual(['A3']);
    expect(rowsForView(t.rows, 'com_link_com_resultado').map((r) => r.affiliateId)).toEqual(['A1']);
    expect(rowsForView(t.rows, 'com_link_sem_resultado').map((r) => r.affiliateId)).toEqual(['A2']);
  });
  it('standby não é visão de AFILIADO (é pool de links)', () => {
    expect(rowsForView(t.rows, 'standby')).toEqual([]);
  });
  it('busca por nome, e-mail, id, tag e destino', () => {
    expect(searchRows(t.rows, 'ana')).toHaveLength(1);
    expect(searchRows(t.rows, 'bruno@x.com')).toHaveLength(1);
    expect(searchRows(t.rows, 'A3')).toHaveLength(1);
    expect(searchRows(t.rows, 'l2')).toHaveLength(1);
    expect(searchRows(t.rows, 'casa.bet')).toHaveLength(2);
    expect(searchRows(t.rows, '  ')).toHaveLength(3);
  });
});

describe('extractTagFromUrl', () => {
  it.each([
    ['afp (Income Access)', 'https://go.aff.esportiva.bet/urto4foy?afp=infinitw291', 'infinitw291'],
    ['tag', 'https://casa.bet/r?tag=NakataAgency101', 'NakataAgency101'],
    ['btag (Affilka)', 'https://casa.bet/r?btag=aff42', 'aff42'],
    ['subid', 'https://casa.bet/r?subid=xyz', 'xyz'],
    ['anid (Quintessence/R2D — LEON Bet)', 'https://9behi4y9oh.com/?serial=61260&creative_id=311&anid=cgverify0811', 'cgverify0811'],
  ])('extrai de %s', (_label, url, expected) => {
    expect(extractTagFromUrl(url)).toBe(expected);
  });
  it('sem parâmetro conhecido ou URL inválida → vazio', () => {
    expect(extractTagFromUrl('https://media1.stakeaffiliates-br.com/redirect.aspx?pid=18492')).toBe('');
    expect(extractTagFromUrl('nao-e-url')).toBe('');
  });
});

describe('parseStandbyLinks — "cole os links, 1 por linha"', () => {
  it('extrai a tag da query de cada linha', () => {
    const r = parseStandbyLinks(`
      https://go.aff.esportiva.bet/urto4foy?afp=infinitw291
      https://go.aff.esportiva.bet/urto4foy?afp=infinitw292
    `);
    expect(r.invalid).toEqual([]);
    expect(r.links.map((l) => l.tag)).toEqual(['infinitw291', 'infinitw292']);
  });
  it('tag explícita (formato do XLSX Link/Tag) ganha da query', () => {
    const r = parseStandbyLinks('https://casa.bet/r?afp=antiga\tAff111');
    expect(r.links[0].tag).toBe('Aff111');
  });
  it('recusa o que não é http(s) e devolve as linhas caídas', () => {
    const r = parseStandbyLinks('javascript:alert(1)\nfoo bar\nhttps://ok.bet/r');
    expect(r.links).toHaveLength(1);
    expect(r.invalid).toEqual(['javascript:alert(1)', 'foo bar']);
  });
  it('descarta URL duplicada', () => {
    const r = parseStandbyLinks('https://casa.bet/r?afp=a\nhttps://casa.bet/r?afp=a');
    expect(r.links).toHaveLength(1);
  });
  it('texto vazio → nada, sem erro', () => {
    expect(parseStandbyLinks('')).toEqual({ links: [], invalid: [] });
    expect(parseStandbyLinks(null as any)).toEqual({ links: [], invalid: [] });
  });
});

describe('buildMyLinkCards (ponta do afiliado)', () => {
  const houses = [
    { id: 'esportiva-bet', slug: 'esportiva-bet', name: 'Esportiva Bet', brandId: null },
    { id: 'superbet', slug: 'superbet', name: 'Super Bet V2', brandId: '77' },
  ];

  it('une parceria aprovada + link atribuído sem parceria', () => {
    const cards = buildMyLinkCards(
      [{ id: 'p1', code: 'AAA', operatorName: 'Super Bet V2', dealLabel: 'CPA R$ 300', houseId: 'superbet' }],
      [
        { code: 'AAA', affiliateId: 'aff1', brandId: '77', registerUrl: 'https://sb.bet/r', active: true, clicks: 4 },
        { code: 'BBB', affiliateId: 'aff1', brandId: 'esportiva-bet', registerUrl: 'https://go.aff.esportiva.bet/x?afp=infinitw01', active: true, clicks: 2 },
      ],
      houses,
    );
    expect(cards).toHaveLength(2);
    const migrado = cards.find((c) => c.code === 'BBB')!;
    expect(migrado.source).toBe('assigned');
    expect(migrado.title).toBe('Esportiva Bet');
    expect(migrado.houseId).toBe('esportiva-bet');
    expect(migrado.clicks).toBe(2);
    expect(migrado.deliverable).toBe(true);
  });

  it('link de parceria NÃO duplica ao aparecer nas duas listas', () => {
    const cards = buildMyLinkCards(
      [{ id: 'p1', code: 'AAA', operatorName: 'Super Bet V2', houseId: 'superbet' }],
      [{ code: 'AAA', affiliateId: 'aff1', brandId: '77', registerUrl: 'https://sb.bet/r', active: true }],
      houses,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].source).toBe('partnership');
  });

  it('link do POOL (standby, sem dono) não vira cartão do afiliado', () => {
    const cards = buildMyLinkCards(
      [],
      [{ code: 'POOL1', affiliateId: '', brandId: 'esportiva-bet', registerUrl: 'https://go.aff.esportiva.bet/x?afp=infinitw291', active: false }],
      houses,
    );
    expect(cards).toEqual([]);
  });

  it('parceria sem link emitido não vira cartão', () => {
    expect(buildMyLinkCards([{ id: 'p1', code: null, operatorName: 'Casa' }], [], houses)).toEqual([]);
  });

  it('link inativo ou sem destino aparece, mas não entregável (a UI explica o motivo)', () => {
    const cards = buildMyLinkCards(
      [],
      [
        { code: 'INAT', affiliateId: 'aff1', brandId: 'esportiva-bet', registerUrl: 'https://x.bet/r', active: false },
        { code: 'SEMURL', affiliateId: 'aff1', brandId: 'esportiva-bet', registerUrl: '', active: true },
      ],
      houses,
    );
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.deliverable === false)).toBe(true);
  });

  it('casa desconhecida cai na própria chave de marca, sem quebrar', () => {
    const cards = buildMyLinkCards([], [{ code: 'X', affiliateId: 'a', brandId: 'kto', registerUrl: 'https://kto.bet/r', active: true }], houses);
    expect(cards[0].title).toBe('kto');
    expect(cards[0].houseId).toBeNull();
  });

  it('entradas nulas não quebram', () => {
    expect(buildMyLinkCards(null, null, null)).toEqual([]);
  });

  // A chave é a MESMA que a precificação/aprovação grava no byBrand (dealBrandKey):
  // errar aqui faria a tela buscar a comissão do afiliado na casa errada.
  it('brandKey segue a convenção do byBrand: brandId da OTG, slug da manual, houseId quando a casa sumiu', () => {
    const cards = buildMyLinkCards(
      [
        { id: 'p1', code: 'AAA', operatorName: 'Super Bet V2', houseId: 'superbet' },
        { id: 'p2', code: 'CCC', operatorName: 'Esportiva Bet', houseId: 'esportiva-bet' },
        { id: 'p3', code: 'DDD', operatorName: 'Sumida', houseId: 'casa-removida' },
      ],
      [
        { code: 'AAA', affiliateId: 'aff1', brandId: '77', registerUrl: 'https://sb.bet/r', active: true },
        { code: 'CCC', affiliateId: 'aff1', brandId: 'esportiva-bet', registerUrl: 'https://e.bet/r', active: true },
        { code: 'DDD', affiliateId: 'aff1', brandId: null, registerUrl: 'https://s.bet/r', active: true },
        { code: 'BBB', affiliateId: 'aff1', brandId: 'esportiva-bet', registerUrl: 'https://e.bet/r2', active: true },
      ],
      houses,
    );
    const byCode = Object.fromEntries(cards.map((c) => [c.code, c.brandKey]));
    expect(byCode.AAA).toBe('77');            // casa OTG → brandId
    expect(byCode.CCC).toBe('esportiva-bet'); // casa manual → slug
    expect(byCode.DDD).toBe('casa-removida'); // casa sumida → o próprio houseId (nas manuais é o slug)
    expect(byCode.BBB).toBe('esportiva-bet'); // link atribuído → pela casa resolvida do brandId
  });

  it('cartão de parceria carrega o ACORDO pelo dealId, sem adivinhar', () => {
    const cards = buildMyLinkCards(
      [{ id: 'p1', code: 'AAA', dealId: 'd9', operatorName: 'Super Bet V2', dealLabel: 'CPA', houseId: 'superbet' }],
      [{ code: 'AAA', affiliateId: 'aff1', brandId: '77', registerUrl: 'https://sb.bet/r', active: true }],
      houses,
      [deal({ id: 'd9', houseId: 'superbet', minCpaGoal: 5 }), deal({ id: 'd8', houseId: 'esportiva-bet' })],
    );
    expect(cards[0].deal?.id).toBe('d9');
    expect(cards[0].deal?.minCpaGoal).toBe(5);
  });

  it('parceria cujo acordo saiu da vitrine fica sem acordo, não com o de outra casa', () => {
    const cards = buildMyLinkCards(
      [{ id: 'p1', code: 'AAA', dealId: 'apagado', operatorName: 'Super Bet V2', houseId: 'superbet' }],
      [{ code: 'AAA', affiliateId: 'aff1', brandId: '77', registerUrl: 'https://sb.bet/r', active: true }],
      houses,
      [deal({ id: 'd8', houseId: 'esportiva-bet' })],
    );
    expect(cards[0].deal).toBeNull();
  });

  it('link SEM parceria pega o acordo da casa quando a casa tem UM só', () => {
    const cards = buildMyLinkCards(
      [],
      [{ code: 'BBB', affiliateId: 'aff1', brandId: 'esportiva-bet', registerUrl: 'https://e.bet/r', active: true }],
      houses,
      [deal({ id: 'd8', houseId: 'esportiva-bet', operatorName: 'Esportiva Bet', cycle: 'd30mais' })],
    );
    expect(cards[0].deal?.id).toBe('d8');
    // o rótulo do acordo vira o subtítulo: melhor que o genérico "Link de divulgação"
    expect(cards[0].subtitle).toBe('Esportiva Bet - CPA - D30+ - BRL - Brasil');
  });

  // Duas ofertas na mesma operadora (modelos diferentes) e o link não guarda qual
  // delas foi combinada. Publicar uma das duas seria mostrar ao afiliado termos que
  // talvez não sejam os dele.
  it('casa com MAIS DE UM acordo não resolve acordo nenhum', () => {
    const cards = buildMyLinkCards(
      [],
      [{ code: 'BBB', affiliateId: 'aff1', brandId: 'esportiva-bet', registerUrl: 'https://e.bet/r', active: true }],
      houses,
      [deal({ id: 'd8', houseId: 'esportiva-bet' }), deal({ id: 'd7', houseId: 'esportiva-bet', model: 'revshare' })],
    );
    expect(cards[0].deal).toBeNull();
    expect(cards[0].subtitle).toBe('Link de divulgação');
  });

  it('sem acordos (instância sem marketplace) o cartão sai como antes', () => {
    const cards = buildMyLinkCards(
      [{ id: 'p1', code: 'AAA', dealId: 'd9', operatorName: 'Super Bet V2', dealLabel: 'CPA', houseId: 'superbet' }],
      [{ code: 'AAA', affiliateId: 'aff1', brandId: '77', registerUrl: 'https://sb.bet/r', active: true }],
      houses,
    );
    expect(cards[0].deal).toBeNull();
    expect(cards[0].subtitle).toBe('CPA');
  });

  it('houseForBrandKey resolve por brandId, slug e id — e devolve null sem chave', () => {
    expect(houseForBrandKey(houses, '77')?.name).toBe('Super Bet V2');
    expect(houseForBrandKey(houses, 'esportiva-bet')?.name).toBe('Esportiva Bet');
    expect(houseForBrandKey(houses, '')).toBeNull();
    expect(houseForBrandKey(houses, null)).toBeNull();
  });
});
