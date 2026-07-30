import { describe, it, expect } from 'vitest';
import {
  isNetworkDerived,
  hierarchySpecials,
  buildScopeTree,
  resolveSpecialSubIds,
  resolveDirectSubIds,
  isDirectDownline,
  type SpecialRecord,
} from './specialNetwork';
import { buildNetworkNodes, buildNetworkTree, uplineMapFromSpecials } from './network';
import { buildSubToSpecialConfig } from '../services/affiliateService';

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
