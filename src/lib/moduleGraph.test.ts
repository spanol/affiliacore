// @vitest-environment node
// A TRAVA do grafo de módulos rodando contra os arquivos DE VERDADE do repo.
//
// Quando um destes testes falha, o conserto NÃO é mexer no teste: é declarar a
// coleção/aresta/decisão em src/lib/moduleGraph.ts e refletir no MAPA-MODULOS.md.
// É a mesma filosofia da trava da demo — e o motivo é o incidente das casas
// "Sports": o acoplamento houses→deals só existia na cabeça de quem escreveu.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCodeCollections, parseRulesCollections } from './demoCoverage';
import {
  DELETE_CONTRACTS,
  MODULE_GRAPH,
  cascadeDecisionDiff,
  contractRouteDiff,
  danglingDependencies,
  dependentsOf,
  missingFromDoc,
  parseDeleteRoutes,
  staleGraphEntries,
  undeclaredCollections,
} from './moduleGraph';

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const serverSource = read('server.ts');

// O MESMO universo da trava da demo: rules ∪ server.ts ∪ services.
const appCollections = (() => {
  const all = new Set<string>([
    ...parseRulesCollections(read('firestore.rules')),
    ...parseCodeCollections(serverSource),
  ]);
  const servicesDir = path.join(ROOT, 'src/services');
  for (const file of fs.readdirSync(servicesDir)) {
    if (!file.endsWith('.ts') || file.includes('.test.')) continue;
    for (const name of parseCodeCollections(read(`src/services/${file}`))) all.add(name);
  }
  return [...all].sort();
})();

describe('grafo de módulos × código real', () => {
  it('toda coleção que o app usa está declarada no grafo', () => {
    expect(
      undeclaredCollections(appCollections, MODULE_GRAPH),
      'Coleção nova sem entrada no grafo. Declare-a em src/lib/moduleGraph.ts (módulo, descrição e de quem ela depende) e cite-a no MAPA-MODULOS.md.',
    ).toEqual([]);
  });

  it('o grafo não lista coleção fantasma', () => {
    expect(
      staleGraphEntries(appCollections, MODULE_GRAPH),
      'Entrada do grafo sem coleção correspondente no app. Remova-a (ou o nome está errado).',
    ).toEqual([]);
  });

  it('nenhuma aresta dependeDe aponta para coleção inexistente', () => {
    expect(danglingDependencies(MODULE_GRAPH)).toEqual([]);
  });
});

describe('contratos de exclusão × rotas do server', () => {
  const routes = parseDeleteRoutes(serverSource);

  it('há pelo menos as rotas de exclusão conhecidas (o parser não regrediu)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(9);
    expect(routes).toContain('/api/houses/:id');
  });

  it('toda rota app.delete tem contrato, e todo contrato tem rota viva', () => {
    const diff = contractRouteDiff(routes, DELETE_CONTRACTS);
    expect(
      diff.semContrato,
      'Rota de exclusão nova sem contrato em DELETE_CONTRACTS. Decida a cascata de cada dependente ANTES de a rota ir ao ar.',
    ).toEqual([]);
    expect(diff.contratoOrfao, 'Contrato apontando para rota que não existe mais.').toEqual([]);
  });

  it('todo contrato cita a coleção que de fato existe no grafo', () => {
    for (const [route, contract] of Object.entries(DELETE_CONTRACTS)) {
      expect(MODULE_GRAPH[contract.colecao], `${route}: coleção "${contract.colecao}" fora do grafo`).toBeDefined();
    }
  });

  it('cada exclusão decide o destino de TODOS os dependentes — nem mais, nem menos', () => {
    expect(
      cascadeDecisionDiff(MODULE_GRAPH, DELETE_CONTRACTS),
      'faltamDecisao = coleção que depende da apagada e ninguém decidiu a cascata (a classe do rascunho órfão das casas Sports). decisaoOrfa = cascata declarada para quem não depende.',
    ).toEqual([]);
  });
});

describe('MAPA-MODULOS.md × grafo', () => {
  const doc = read('MAPA-MODULOS.md');

  it('o mapa cita toda coleção do app', () => {
    expect(
      missingFromDoc(appCollections, doc),
      'Coleção sem menção no MAPA-MODULOS.md — o desenho descolou do código.',
    ).toEqual([]);
  });

  it('o mapa cita toda rota de exclusão', () => {
    expect(missingFromDoc(Object.keys(DELETE_CONTRACTS), doc)).toEqual([]);
  });
});

describe('derivações do grafo (sanidade)', () => {
  it('os dependentes de houses incluem o caso que motivou a trava', () => {
    expect(dependentsOf(MODULE_GRAPH, 'houses')).toContain('deals');
  });

  it('affiliates é a raiz mais referenciada (exclusão de afiliado é SÓ por script, sem rota)', () => {
    // Se um dia nascer DELETE /api/affiliates/:id, o teste de contratos vai exigir
    // a decisão para cada um destes — é muita coisa, e é exatamente o ponto.
    expect(dependentsOf(MODULE_GRAPH, 'affiliates').length).toBeGreaterThanOrEqual(10);
  });
});
