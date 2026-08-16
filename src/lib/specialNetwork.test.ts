import { describe, it, expect } from 'vitest';
import {
  isNetworkDerived,
  hierarchySpecials,
  buildScopeTree,
  resolveSpecialSubIds,
  resolveDirectSubIds,
  isDirectDownline,
  resolveDirectUpline,
  type SpecialRecord,
} from './specialNetwork';
import { buildNetworkNodes, buildNetworkTree, uplineMapFromSpecials, buildEligibleUpline } from './network';
import { buildSubToSpecialConfig, composeAdminProfit } from '../services/affiliateService';

// Estrutura de 4 níveis, o formato real da Infinity:
//   topo → gerente → lider → ponta
const UPLINES = {
  gerente: 'topo',
  lider: 'gerente',
  ponta: 'lider',
  outro: 'topo',
};

describe('isNetworkDerived / hierarchySpecials', () => {
  it('só é derivado com a flag explícita (fail-closed)', () => {
    expect(isNetworkDerived({ fromNetwork: true })).toBe(true);
    expect(isNetworkDerived({ fromNetwork: false })).toBe(false);
    expect(isNetworkDerived({})).toBe(false);
    expect(isNetworkDerived(null)).toBe(false);
    expect(isNetworkDerived(undefined)).toBe(false);
  });

  it('o registro derivado sai das fontes de hierarquia; o antigo permanece', () => {
    const specials: Record<string, SpecialRecord> = {
      antigo: { affiliateId: 'antigo', active: true, subAffiliateIds: ['s1'] },
      novo: { affiliateId: 'novo', active: true, fromNetwork: true, subAffiliateIds: [] },
    };
    expect(Object.keys(hierarchySpecials(specials))).toEqual(['antigo']);
  });
});

describe('resolveSpecialSubIds', () => {
  it('modo derivado devolve a subárvore INTEIRA (N níveis), sem o próprio id', () => {
    const subs = resolveSpecialSubIds(
      'gerente',
      { active: true, fromNetwork: true },
      { uplines: UPLINES }
    );
    expect(subs.sort()).toEqual(['lider', 'ponta']);
  });

  it('modo derivado NÃO enxerga quem está acima nem o ramo irmão', () => {
    const subs = resolveSpecialSubIds('gerente', { active: true, fromNetwork: true }, { uplines: UPLINES });
    expect(subs).not.toContain('topo');
    expect(subs).not.toContain('outro');
  });

  it('o topo da estrutura enxerga todo mundo abaixo', () => {
    const subs = resolveSpecialSubIds('topo', { active: true, fromNetwork: true }, { uplines: UPLINES });
    expect(subs.sort()).toEqual(['gerente', 'lider', 'outro', 'ponta']);
  });

  it('sem a flag, devolve a lista GRAVADA (modelo antigo de 2 níveis)', () => {
    const subs = resolveSpecialSubIds(
      'esp',
      { active: true, subAffiliateIds: ['s1', 's2'] },
      { uplines: UPLINES }
    );
    expect(subs).toEqual(['s1', 's2']);
  });

  it('nunca devolve o próprio id (nem gravado, nem derivado)', () => {
    expect(
      resolveSpecialSubIds('esp', { active: true, subAffiliateIds: ['esp', 's1'] }, {})
    ).toEqual(['s1']);
    expect(
      resolveSpecialSubIds('solo', { active: true, fromNetwork: true }, { uplines: {} })
    ).toEqual([]);
  });

  it('sem registro → escopo vazio (fail-closed)', () => {
    expect(resolveSpecialSubIds('gerente', null, { uplines: UPLINES })).toEqual([]);
    expect(resolveSpecialSubIds('', { active: true, fromNetwork: true }, { uplines: UPLINES })).toEqual([]);
  });

  it('derivação IGNORA a taxa: um intermediário sem CPA configurado não corta a equipe', () => {
    // buildScopeTree é montada de propósito SEM isEligibleUpline — essa regra existe
    // para não cobrar da agência um upline sem taxa, não para tirar visão de ninguém.
    const subs = resolveSpecialSubIds('topo', { active: true, fromNetwork: true }, { uplines: UPLINES });
    expect(subs).toContain('ponta'); // neto do neto, com o meio sem config
  });
});

describe('resolveDirectSubIds (o que a TELA deixa editar)', () => {
  it('derivado: subconjunto de 1 nível do que ele vê', () => {
    const ctx = { uplines: UPLINES };
    const record = { active: true, fromNetwork: true };
    expect(resolveSpecialSubIds('gerente', record, ctx).sort()).toEqual(['lider', 'ponta']);
    expect(resolveDirectSubIds('gerente', record, ctx)).toEqual(['lider']);
  });

  it('modelo antigo: a lista gravada JÁ é 1 nível — direto == visível', () => {
    const record = { active: true, subAffiliateIds: ['s1', 's2'] };
    expect(resolveDirectSubIds('esp', record, {})).toEqual(['s1', 's2']);
  });

  it('sem registro → vazio', () => {
    expect(resolveDirectSubIds('gerente', null, { uplines: UPLINES })).toEqual([]);
  });
});

describe('resolveDirectUpline (roteia a solicitação para a fila do gerente)', () => {
  const ctx = { uplines: UPLINES };

  it('devolve o pai direto, não a raiz da estrutura', () => {
    expect(resolveDirectUpline('ponta', ctx)).toBe('lider');
    expect(resolveDirectUpline('lider', ctx)).toBe('gerente');
  });

  it('topo da estrutura → null (a solicitação cai na fila do admin)', () => {
    expect(resolveDirectUpline('topo', ctx)).toBeNull();
    expect(resolveDirectUpline('desconhecido', ctx)).toBeNull();
    expect(resolveDirectUpline('', ctx)).toBeNull();
  });

  it('é o espelho exato de isDirectDownline', () => {
    expect(isDirectDownline('ponta', resolveDirectUpline('ponta', ctx)!, ctx)).toBe(true);
  });

  it('modelo antigo: o vínculo de special_affiliates também é aresta', () => {
    const specials: Record<string, SpecialRecord> = {
      esp: { affiliateId: 'esp', active: true, subAffiliateIds: ['s1'] },
    };
    expect(resolveDirectUpline('s1', { specials })).toBe('esp');
  });
});

describe('isDirectDownline (barreira da ESCRITA de taxa)', () => {
  const ctx = { uplines: UPLINES };

  it('filho direto → pode', () => {
    expect(isDirectDownline('lider', 'gerente', ctx)).toBe(true);
  });

  it('NETO → não pode (quem paga o neto é o gerente do meio)', () => {
    expect(isDirectDownline('ponta', 'gerente', ctx)).toBe(false);
    // ...mesmo estando na sub-rede que ele ENXERGA — visão ≠ dinheiro.
    expect(
      resolveSpecialSubIds('gerente', { active: true, fromNetwork: true }, ctx)
    ).toContain('ponta');
  });

  it('ramo irmão, upline e si mesmo → não pode', () => {
    expect(isDirectDownline('outro', 'gerente', ctx)).toBe(false);
    expect(isDirectDownline('topo', 'gerente', ctx)).toBe(false);
    expect(isDirectDownline('gerente', 'gerente', ctx)).toBe(false);
  });

  it('REGRESSÃO-ZERO no modelo antigo: sub de `subAffiliateIds` conta como direto', () => {
    // Sem nenhuma aresta em affiliate_uplines, o vínculo de special_affiliates
    // ainda vira aresta (buildNetworkNodes) — o especial de 2 níveis do Boost
    // continua podendo definir a taxa dos subs dele.
    const specials: Record<string, SpecialRecord> = {
      esp: { affiliateId: 'esp', active: true, subAffiliateIds: ['s1', 's2'] },
    };
    expect(isDirectDownline('s1', 'esp', { specials })).toBe(true);
    expect(isDirectDownline('s3', 'esp', { specials })).toBe(false);
  });

  it('a aresta EXPLÍCITA vence o vínculo de especial: sub reapontado sai do alcance', () => {
    const specials: Record<string, SpecialRecord> = {
      esp: { affiliateId: 'esp', active: true, subAffiliateIds: ['s1'] },
    };
    expect(isDirectDownline('s1', 'esp', { specials, uplines: { s1: 'outro-esp' } })).toBe(false);
  });

  it('id vazio → negado', () => {
    expect(isDirectDownline('', 'gerente', ctx)).toBe(false);
    expect(isDirectDownline('lider', '', ctx)).toBe(false);
  });
});

describe('o registro derivado NÃO altera a árvore nem o custo da agência', () => {
  const derivedSpecials: Record<string, SpecialRecord> = {
    gerente: {
      affiliateId: 'gerente',
      active: true,
      fromNetwork: true,
      // a sub-rede EFETIVA que o servidor devolve ao client: N níveis
      subAffiliateIds: ['lider', 'ponta'],
    },
  };

  it('uplineMapFromSpecials pula o derivado — senão o neto viraria filho direto', () => {
    // Sem o skip, `ponta → gerente` entraria no mapa e ACHATARIA a estrutura de 4
    // níveis; a aresta explícita salva o caso, mas a defesa não pode depender disso.
    expect(uplineMapFromSpecials(derivedSpecials)).toEqual({});
  });

  it('a árvore é idêntica com e sem o registro derivado', () => {
    const semEspecial = buildNetworkTree(buildNetworkNodes({ uplines: UPLINES }));
    const comEspecial = buildNetworkTree(
      buildNetworkNodes({ uplines: UPLINES, specials: derivedSpecials })
    );
    expect(comEspecial.uplineOf).toEqual(semEspecial.uplineOf);
    expect(comEspecial.rootOf).toEqual(semEspecial.rootOf);
  });

  it('buildSubToSpecialConfig pula o derivado (quem cobre é buildRootConfigMap)', () => {
    const configs = { gerente: { affiliateId: 'gerente', cpaValue: 200, revPercentage: 0 } };
    expect(buildSubToSpecialConfig(derivedSpecials as any, configs)).toEqual({});
  });
});

describe('buildScopeTree', () => {
  it('mantém a aresta de um upline SEM taxa (permissão não depende de dinheiro)', () => {
    const tree = buildScopeTree({ uplines: UPLINES });
    expect(tree.uplineOf.ponta).toBe('lider');
    expect(tree.dropped).toEqual([]);
  });

  it('ciclo é cortado sem exceção, pelo MENOR id (corte determinístico)', () => {
    const ciclo = { a: 'b', b: 'a' };
    const tree = buildScopeTree({ uplines: ciclo });
    expect(tree.dropped.some((d) => d.reason === 'ciclo')).toBe(true);
    // 'a' vira topo → sobra a aresta b→a. A permissão segue o mesmo corte que o
    // dinheiro, então os dois lados nunca discordam de quem manda em quem.
    expect(isDirectDownline('b', 'a', { uplines: ciclo })).toBe(true);
    expect(isDirectDownline('a', 'b', { uplines: ciclo })).toBe(false);
  });
});

// Regressão do susto de 2026-07-30 em produção (Infinity): logo depois de registrar
// um gerente como especial `fromNetwork`, o headline do /admin foi lido como
// R$ 1.020,00 contra R$ 480,00 de minutos antes — exatamente o "lucro sobre equipe"
// inteiro (R$ 540,00) desaparecendo. A pergunta que isso levanta é objetiva:
// REGISTRAR um especial derivado pode mexer no lucro da agência?
//
// Não pode. O registro não é fonte de hierarquia (a árvore já existia) e o custo sai
// de `buildRootConfigMap`, que lê a árvore. Este teste amarra a resposta ponta a
// ponta — pelo `composeAdminProfit`, não só pelos blocos isolados.
describe('registrar um especial fromNetwork NÃO mexe no lucro da agência', () => {
  const UP = { filho: 'gerente', neto: 'filho' };
  const results = [
    { id: 'gerente', total_commission: 1000, qualified_cpa: 5, rvs: 0 },
    { id: 'filho', total_commission: 600, qualified_cpa: 3, rvs: 0 },
    { id: 'neto', total_commission: 400, qualified_cpa: 2, rvs: 0 },
  ];
  const configs = {
    gerente: { affiliateId: 'gerente', cpaValue: 100, revPercentage: 0 },
    filho: { affiliateId: 'filho', cpaValue: 60, revPercentage: 0 },
    neto: { affiliateId: 'neto', cpaValue: 40, revPercentage: 0 },
  } as any;
  const houseOf = (id: string) =>
    ({ gerente: { key: 'Casa', brandId: 'c' }, filho: { key: 'Casa', brandId: 'c' }, neto: { key: 'Casa', brandId: 'c' } } as any)[id] ?? null;

  const profitCom = (specials: Record<string, SpecialRecord>) => {
    const tree = buildNetworkTree(
      buildNetworkNodes({ ids: ['gerente', 'filho', 'neto'], specials, uplines: UP }),
      { isEligibleUpline: buildEligibleUpline(configs) }
    );
    return composeAdminProfit(
      results,
      [],
      configs,
      buildSubToSpecialConfig(specials as any, configs),
      houseOf,
      tree
    );
  };

  it('antes e depois do registro, o lucro e a decomposição são IDÊNTICOS', () => {
    const antes = profitCom({});
    // o que o servidor devolve depois do registro: flag + a subárvore JÁ resolvida
    const depois = profitCom({
      gerente: {
        affiliateId: 'gerente',
        active: true,
        fromNetwork: true,
        subAffiliateIds: ['filho', 'neto'],
      },
    });

    expect(depois.netProfit).toBe(antes.netProfit);
    expect(depois.directPayout).toBe(antes.directPayout);
    expect(depois.overridePayout).toBe(antes.overridePayout);
    expect(depois.byHouseTotal).toBe(antes.byHouseTotal);
  });

  it('e o "lucro sobre equipe" continua existindo (não colapsa para zero)', () => {
    const p = profitCom({
      gerente: { affiliateId: 'gerente', active: true, fromNetwork: true, subAffiliateIds: ['filho', 'neto'] },
    });
    // toda a subárvore é cobrada à taxa do TOPO (100), não à taxa própria de cada um
    expect(p.overridePayout).toBeGreaterThan(0);
    expect(p.directPayout + p.overridePayout).toBe(10 * 100);
  });

  it('CONTRASTE — sem taxa no topo, a estrutura inteira cai e o lucro INFLA', () => {
    // Ausência ≠ R$ 0: um upline sem taxa perde a aresta (isEligibleUpline), cada um
    // vira topo próprio e o override some. É o mecanismo que faria o headline pular
    // sem que ninguém tivesse mexido na rede — e ele NÃO depende do registro.
    const semTaxaNoTopo = { ...configs, gerente: undefined } as any;
    const tree = buildNetworkTree(
      buildNetworkNodes({ ids: ['gerente', 'filho', 'neto'], uplines: UP }),
      { isEligibleUpline: buildEligibleUpline(semTaxaNoTopo) }
    );
    const p = composeAdminProfit(results, [], semTaxaNoTopo, {}, houseOf, tree);
    const comTaxa = profitCom({});
    // A aresta filho→gerente cai (gerente sem taxa) e o gerente sai da conta; sobra só
    // o override de neto→filho. O custo da estrutura DESPENCA e o lucro sobe — sem que
    // ninguém tenha tocado na rede.
    expect(tree.dropped.some((d) => d.reason === 'upline-inelegivel')).toBe(true);
    expect(p.overridePayout).toBeLessThan(comTaxa.overridePayout);
    expect(p.netProfit).toBeGreaterThan(comTaxa.netProfit);
  });
});
