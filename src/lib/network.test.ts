import { describe, it, expect } from 'vitest';
import {
  buildNetworkTree,
  buildNetworkNodes,
  uplineMapFromSpecials,
  calcNetworkPayouts,
  buildRootConfigMap,
  descendantsOf,
  resolveRepasseCap,
  exceedsRepasseCap,
  hasConfiguredRate,
  buildEligibleUpline,
  NetworkRow,
} from './network';
import type { AffiliateConfig } from './commission';

const cfg = (id: string, cpaValue: number, revPercentage = 0, byBrand?: any): AffiliateConfig =>
  ({ affiliateId: id, cpaValue, revPercentage, ...(byBrand ? { byBrand } : {}) } as AffiliateConfig);

const row = (affiliateId: string, qualified_cpa: number, extra: Partial<NetworkRow> = {}): NetworkRow => ({
  affiliateId,
  qualified_cpa,
  ...extra,
});

describe('buildNetworkTree · topologia', () => {
  it('monta pai/filhos/profundidade/topo de uma cadeia de 4 níveis', () => {
    const t = buildNetworkTree([
      { affiliateId: 'a' },
      { affiliateId: 'b', uplineId: 'a' },
      { affiliateId: 'c', uplineId: 'b' },
      { affiliateId: 'd', uplineId: 'c' },
    ]);
    expect(t.roots).toEqual(['a']);
    expect(t.depthOf).toEqual({ a: 0, b: 1, c: 2, d: 3 });
    expect(t.rootOf).toEqual({ a: 'a', b: 'a', c: 'a', d: 'a' });
    expect(t.childrenOf).toEqual({ a: ['b'], b: ['c'], c: ['d'] });
    expect(t.dropped).toEqual([]);
  });

  it('afiliado sem upline é topo de estrutura próprio', () => {
    const t = buildNetworkTree([{ affiliateId: 'x' }, { affiliateId: 'y', uplineId: null }]);
    expect(t.roots).toEqual(['x', 'y']);
    expect(t.uplineOf).toEqual({});
  });

  it('descarta auto-upline (afiliado apontando para si mesmo)', () => {
    const t = buildNetworkTree([{ affiliateId: 'a', uplineId: 'a' }]);
    expect(t.roots).toEqual(['a']);
    expect(t.dropped).toEqual([{ affiliateId: 'a', uplineId: 'a', reason: 'auto-upline' }]);
  });

  it('descarta upline fora do roster (vira topo, sem override fantasma)', () => {
    const t = buildNetworkTree([{ affiliateId: 'a', uplineId: 'fantasma' }]);
    expect(t.roots).toEqual(['a']);
    expect(t.dropped).toEqual([{ affiliateId: 'a', uplineId: 'fantasma', reason: 'upline-desconhecido' }]);
  });

  it('descarta upline SEM taxa configurada (ausência ≠ R$ 0)', () => {
    const configs = { a: cfg('a', 300) };
    const t = buildNetworkTree(
      [{ affiliateId: 'a' }, { affiliateId: 'semTaxa' }, { affiliateId: 'b', uplineId: 'semTaxa' }],
      { isEligibleUpline: buildEligibleUpline(configs as any) }
    );
    expect(t.dropped).toEqual([{ affiliateId: 'b', uplineId: 'semTaxa', reason: 'upline-inelegivel' }]);
    expect(t.roots).toContain('b');
  });

  it('quebra ciclo de forma determinística (menor id vira topo) e não trava', () => {
    const t = buildNetworkTree([
      { affiliateId: 'c', uplineId: 'b' },
      { affiliateId: 'b', uplineId: 'a' },
      { affiliateId: 'a', uplineId: 'c' },
    ]);
    expect(t.roots).toEqual(['a']);
    expect(t.dropped).toEqual([{ affiliateId: 'a', uplineId: 'c', reason: 'ciclo' }]);
    expect(t.depthOf).toEqual({ a: 0, b: 1, c: 2 });
  });

  it('quebra ciclo de 2 nós e preserva as estruturas sadias ao redor', () => {
    const t = buildNetworkTree([
      { affiliateId: 'ok' },
      { affiliateId: 'sub', uplineId: 'ok' },
      { affiliateId: 'y', uplineId: 'z' },
      { affiliateId: 'z', uplineId: 'y' },
    ]);
    expect(t.dropped).toEqual([{ affiliateId: 'y', uplineId: 'z', reason: 'ciclo' }]);
    expect(t.rootOf).toEqual({ ok: 'ok', sub: 'ok', y: 'y', z: 'y' });
  });

  it('ignora entrada inválida (não-array, id vazio, duplicado)', () => {
    expect(buildNetworkTree(null as any).ids).toEqual([]);
    const t = buildNetworkTree([
      { affiliateId: '' },
      { affiliateId: 'a' },
      { affiliateId: 'a', uplineId: 'b' },
      { affiliateId: 'b' },
    ]);
    expect(t.ids).toEqual(['a', 'b']); // a duplicata não reabre a aresta
    expect(t.uplineOf).toEqual({});
  });
});

describe('ingestão · special_affiliates → arestas + precedência do upline explícito', () => {
  const specials = {
    sp1: { affiliateId: 'sp1', active: true, subAffiliateIds: ['s1', 's2'] },
    sp2: { affiliateId: 'sp2', active: false, subAffiliateIds: ['s3'] },
  };

  it('deriva filho→pai só dos especiais ATIVOS (default)', () => {
    expect(uplineMapFromSpecials(specials)).toEqual({ s1: 'sp1', s2: 'sp1' });
    expect(uplineMapFromSpecials(specials, { activeOnly: false })).toEqual({ s1: 'sp1', s2: 'sp1', s3: 'sp2' });
  });

  it('a aresta explícita de affiliate_uplines VENCE a derivada do especial', () => {
    const nodes = buildNetworkNodes({ ids: ['sp1', 's1', 's2', 'outro'], specials, uplines: { s2: 'outro' } });
    const t = buildNetworkTree(nodes);
    expect(t.uplineOf).toEqual({ s1: 'sp1', s2: 'outro' });
  });

  it('upline explícito VAZIO remove o vínculo (o afiliado volta a ser topo)', () => {
    const nodes = buildNetworkNodes({ ids: ['sp1', 's1'], specials, uplines: { s1: '' } });
    const t = buildNetworkTree(nodes);
    expect(t.uplineOf).toEqual({ s2: 'sp1' }); // s2 segue vinculado; só s1 foi solto
    expect(t.roots).toEqual(['sp1', 's1']);
  });

  it('inclui no roster ids que só aparecem nas arestas', () => {
    const nodes = buildNetworkNodes({ ids: [{ id: 'a' }], uplines: { b: 'a' } });
    expect(nodes).toEqual([
      { affiliateId: 'a', uplineId: null },
      { affiliateId: 'b', uplineId: 'a' },
    ]);
  });
});

describe('calcNetworkPayouts · cascata (repasse direto + lucro sobre equipe)', () => {
  it('2 níveis: o pai ganha o spread e o custo da agência é a taxa DELE sobre a rede', () => {
    const tree = buildNetworkTree([{ affiliateId: 'p' }, { affiliateId: 's', uplineId: 'p' }]);
    const configs = { p: cfg('p', 300), s: cfg('s', 200) };
    const r = calcNetworkPayouts(tree, [row('p', 2), row('s', 5)], configs);

    expect(r.byAffiliate.p).toMatchObject({ own: 600, team: 500, total: 1100, received: 2100, paid: 1000 });
    expect(r.byAffiliate.s).toMatchObject({ own: 1000, team: 0, total: 1000, received: 1000, paid: 0 });
    expect(r.directTotal).toBe(1600);
    expect(r.overrideTotal).toBe(500);
    expect(r.agencyCost).toBe(2100); // 7 CPAs × R$ 300 (taxa do topo)
    expect(r.directTotal + r.overrideTotal).toBe(r.agencyCost);
  });

  it('3 níveis TELESCOPAM: o spread é contra o filho DIRETO, nunca contra o neto', () => {
    const tree = buildNetworkTree([
      { affiliateId: 'R' },
      { affiliateId: 'C', uplineId: 'R' },
      { affiliateId: 'G', uplineId: 'C' },
    ]);
    const configs = { R: cfg('R', 300), C: cfg('C', 200), G: cfg('G', 100) };
    const r = calcNetworkPayouts(tree, [row('R', 1), row('C', 1), row('G', 1)], configs);

    expect(r.byAffiliate.R.team).toBe(200); // 2 CPAs abaixo × (300−200)
    expect(r.byAffiliate.C.team).toBe(100); // 1 CPA abaixo × (200−100)
    expect(r.directTotal).toBe(600);
    expect(r.overrideTotal).toBe(300);
    // A fórmula ingênua (spread contra a taxa do DESCENDENTE) daria 400 de override
    // e um custo de 1.000 — R$ 100 criados do nada no nível do meio.
    expect(r.agencyCost).toBe(900); // 3 CPAs × R$ 300
    expect(r.directTotal + r.overrideTotal).toBe(r.agencyCost);
  });

  it('respeita a taxa POR CASA (byBrand) do upline e do downline', () => {
    const tree = buildNetworkTree([{ affiliateId: 'p' }, { affiliateId: 's', uplineId: 'p' }]);
    const configs = {
      p: cfg('p', 300, 0, { casaB: { cpaValue: 150, revPercentage: 0 } }),
      s: cfg('s', 200, 0, { casaB: { cpaValue: 100, revPercentage: 0 } }),
    };
    const r = calcNetworkPayouts(tree, [row('s', 4, { brandId: 'casaB' })], configs);
    expect(r.byAffiliate.s.own).toBe(400);   // 4 × 100 (override da casa do sub)
    expect(r.byAffiliate.p.team).toBe(200);  // 4 × (150 − 100), taxa do pai NAQUELA casa
    expect(r.agencyCost).toBe(600);          // 4 × 150
  });

  it('REV entra na cascata igual ao CPA (o legado é CPA-puro, mas o modelo generaliza)', () => {
    const tree = buildNetworkTree([{ affiliateId: 'p' }, { affiliateId: 's', uplineId: 'p' }]);
    const configs = { p: cfg('p', 0, 40), s: cfg('s', 0, 25) };
    const r = calcNetworkPayouts(tree, [row('s', 0, { rvs: 1000 })], configs);
    expect(r.byAffiliate.s.own).toBe(250);
    expect(r.byAffiliate.p.team).toBe(150);
    expect(r.agencyCost).toBe(400);
  });

  it('rede em leque: cada filho é medido contra a taxa do pai isoladamente', () => {
    const tree = buildNetworkTree([
      { affiliateId: 'p' },
      { affiliateId: 'a', uplineId: 'p' },
      { affiliateId: 'b', uplineId: 'p' },
    ]);
    const configs = { p: cfg('p', 280), a: cfg('a', 250), b: cfg('b', 200) };
    const r = calcNetworkPayouts(tree, [row('a', 10), row('b', 10)], configs);
    expect(r.byAffiliate.p.team).toBe(10 * 30 + 10 * 80);
    expect(r.agencyCost).toBe(20 * 280);
  });

  it('afiliado sem produção não gera custo nem override', () => {
    const tree = buildNetworkTree([{ affiliateId: 'p' }, { affiliateId: 's', uplineId: 'p' }]);
    const r = calcNetworkPayouts(tree, [], { p: cfg('p', 300), s: cfg('s', 200) });
    expect(r.agencyCost).toBe(0);
    expect(r.overrideTotal).toBe(0);
    expect(r.anomalies).toEqual([]);
  });

  it('linha de afiliado FORA da árvore conta como topo isolado (não some do custo)', () => {
    const tree = buildNetworkTree([{ affiliateId: 'p' }]);
    const r = calcNetworkPayouts(tree, [row('avulso', 3)], { avulso: cfg('avulso', 100) });
    expect(r.byAffiliate.avulso).toMatchObject({ own: 300, team: 0, isRoot: true });
    expect(r.agencyCost).toBe(300);
  });

  it('métrica-lixo da API não propaga NaN (num() na porta de entrada)', () => {
    const tree = buildNetworkTree([{ affiliateId: 'p' }, { affiliateId: 's', uplineId: 'p' }]);
    const configs = { p: cfg('p', 300), s: cfg('s', 200) };
    const rows = [
      { affiliateId: 's', qualified_cpa: 'abc' as any },
      { affiliateId: 's', qualified_cpa: null as any, rvs: { toString: false } as any },
      { affiliateId: 's', qualified_cpa: 5 },
    ];
    const r = calcNetworkPayouts(tree, rows, configs);
    expect(Number.isFinite(r.agencyCost)).toBe(true);
    expect(r.agencyCost).toBe(1500);
    expect(r.overrideTotal).toBe(500);
  });
});

describe('calcNetworkPayouts · casos de borda de dinheiro', () => {
  it('spread NEGATIVO é permitido no cálculo (não vira R$ 0) e sinalizado como anomalia', () => {
    const tree = buildNetworkTree([{ affiliateId: 'p' }, { affiliateId: 's', uplineId: 'p' }]);
    const configs = { p: cfg('p', 100), s: cfg('s', 150) }; // sub ganha MAIS que o pai
    const r = calcNetworkPayouts(tree, [row('s', 2)], configs);

    expect(r.byAffiliate.p.team).toBe(-100); // o pai paga do próprio bolso
    expect(r.agencyCost).toBe(200);          // a agência segue pagando a taxa do TOPO
    expect(r.directTotal + r.overrideTotal).toBe(r.agencyCost);
    expect(r.anomalies).toEqual([{ kind: 'spread-negativo', affiliateId: 'p', uplineId: 's', amount: -100 }]);
  });

  it('afiliado com produção e SEM taxa vira anomalia (custo 0 é engano, não verdade)', () => {
    const tree = buildNetworkTree([{ affiliateId: 'x' }]);
    const r = calcNetworkPayouts(tree, [row('x', 10)], {});
    expect(r.agencyCost).toBe(0);
    expect(r.anomalies).toEqual([{ kind: 'sem-taxa', affiliateId: 'x' }]);
  });

  it('upline inelegível: a estrutura NÃO fica de graça — o filho vira topo pela taxa própria', () => {
    const configs = { s: cfg('s', 200) }; // o pai 'p' não tem config
    const tree = buildNetworkTree([{ affiliateId: 'p' }, { affiliateId: 's', uplineId: 'p' }], {
      isEligibleUpline: buildEligibleUpline(configs as any),
    });
    const r = calcNetworkPayouts(tree, [row('s', 5)], configs);
    expect(r.agencyCost).toBe(1000); // 5 × 200, e não 5 × 0
    expect(r.overrideTotal).toBe(0);
  });

  it('taxa 0 EXPLÍCITA do downline é respeitada (0 configurado ≠ ausente)', () => {
    const configs = { p: cfg('p', 300), s: cfg('s', 0) };
    const tree = buildNetworkTree([{ affiliateId: 'p' }, { affiliateId: 's', uplineId: 'p' }], {
      isEligibleUpline: buildEligibleUpline(configs as any),
    });
    const r = calcNetworkPayouts(tree, [row('s', 4)], configs);
    expect(r.byAffiliate.s.own).toBe(0);
    expect(r.byAffiliate.p.team).toBe(1200); // o pai fica com tudo
    expect(r.agencyCost).toBe(1200);
  });
});

describe('buildRootConfigMap · ponte com o lucro do /admin', () => {
  it('mapeia TODO nó para a config do TOPO da estrutura (não a do pai imediato)', () => {
    const tree = buildNetworkTree([
      { affiliateId: 'R' },
      { affiliateId: 'C', uplineId: 'R' },
      { affiliateId: 'G', uplineId: 'C' },
    ]);
    const configs = { R: cfg('R', 300), C: cfg('C', 200), G: cfg('G', 100) };
    const map = buildRootConfigMap(tree, configs);
    expect(map).toEqual({ C: configs.R, G: configs.R });
    expect(map.R).toBeUndefined(); // o topo usa a própria config
  });

  it('em 2 níveis reproduz exatamente o subToSpecialConfig de hoje (sub → config do especial)', () => {
    const specials = { sp1: { affiliateId: 'sp1', active: true, subAffiliateIds: ['subA', 'subB'] } };
    const configs = { sp1: cfg('sp1', 300), subA: cfg('subA', 200), subB: cfg('subB', 150) };
    const tree = buildNetworkTree(buildNetworkNodes({ ids: Object.keys(configs), specials }));
    expect(buildRootConfigMap(tree, configs)).toEqual({ subA: configs.sp1, subB: configs.sp1 });
  });

  it('não mapeia quando o topo não tem config (ausência ≠ R$ 0)', () => {
    const tree = buildNetworkTree([{ affiliateId: 'p' }, { affiliateId: 's', uplineId: 'p' }]);
    expect(buildRootConfigMap(tree, { s: cfg('s', 200) })).toEqual({});
  });

  it('o custo via rootConfig bate com o agencyCost da cascata', () => {
    const tree = buildNetworkTree([
      { affiliateId: 'R' },
      { affiliateId: 'C', uplineId: 'R' },
      { affiliateId: 'G', uplineId: 'C' },
    ]);
    const configs: Record<string, AffiliateConfig> = { R: cfg('R', 300), C: cfg('C', 200), G: cfg('G', 100) };
    const rows = [row('R', 1), row('C', 2), row('G', 3)];
    const map = buildRootConfigMap(tree, configs);
    // É exatamente o que o /admin faz: repasse da linha = métrica × taxa do topo.
    const viaRoot = rows.reduce(
      (s, r) => s + (map[r.affiliateId] ?? configs[r.affiliateId]).cpaValue * Number(r.qualified_cpa),
      0
    );
    expect(viaRoot).toBe(calcNetworkPayouts(tree, rows, configs).agencyCost);
  });
});

describe('descendantsOf · sub-rede de TODOS os níveis', () => {
  it('devolve a subárvore inteira, sem o próprio id', () => {
    const tree = buildNetworkTree([
      { affiliateId: 'R' },
      { affiliateId: 'C', uplineId: 'R' },
      { affiliateId: 'G', uplineId: 'C' },
      { affiliateId: 'X', uplineId: 'R' },
    ]);
    expect(descendantsOf(tree, 'R').sort()).toEqual(['C', 'G', 'X']);
    expect(descendantsOf(tree, 'C')).toEqual(['G']);
    expect(descendantsOf(tree, 'G')).toEqual([]);
    expect(descendantsOf(tree, 'inexistente')).toEqual([]);
  });
});

describe('Limite de repasse (teto do upline)', () => {
  it('o teto é a taxa própria do upline, com override por casa', () => {
    const c = cfg('p', 280, 10, { casaB: { cpaValue: 120, revPercentage: 5 } });
    expect(resolveRepasseCap(c)).toEqual({ cpaValue: 280, revPercentage: 10 });
    expect(resolveRepasseCap(c, 'casaB')).toEqual({ cpaValue: 120, revPercentage: 5 });
  });

  it('detecta estouro de CPA e de REV isoladamente', () => {
    const cap = { cpaValue: 280, revPercentage: 10 };
    expect(exceedsRepasseCap({ cpaValue: 280, revPercentage: 10 }, cap)).toBe(false);
    expect(exceedsRepasseCap({ cpaValue: 281, revPercentage: 10 }, cap)).toBe(true);
    expect(exceedsRepasseCap({ cpaValue: 280, revPercentage: 11 }, cap)).toBe(true);
    expect(exceedsRepasseCap({ cpaValue: 'lixo' as any, revPercentage: 0 }, cap)).toBe(false); // num() → 0
  });

  it('hasConfiguredRate distingue ausência de zero', () => {
    expect(hasConfiguredRate(undefined)).toBe(false);
    expect(hasConfiguredRate({ affiliateId: 'x' } as any)).toBe(false);
    expect(hasConfiguredRate(cfg('x', 0))).toBe(true);
    expect(hasConfiguredRate({ affiliateId: 'x', byBrand: { b: { cpaValue: 10, revPercentage: 0 } } } as any, 'b')).toBe(true);
  });
});
