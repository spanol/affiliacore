import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  buildNetworkTree,
  calcNetworkPayouts,
  buildRootConfigMap,
  buildEligibleUpline,
  NetworkNodeInput,
  NetworkRow,
} from './network';
import { calcAffiliatePayout, AffiliateConfig } from './commission';

// Property-based (fast-check) da rede de afiliados. Os exemplos fixos provam a
// cascata em árvores desenhadas à mão; aqui geramos FLORESTAS aleatórias (com
// ciclos, auto-upline, uplines fantasma, taxas fora de ordem e métricas-lixo) e
// exigimos que o dinheiro FECHE em todas elas.

// Floresta aleatória: cada nó pode apontar para qualquer id do universo (inclusive
// para si mesmo ou para um id inexistente) — é o pior caso do dado migrado.
const forestArb = fc
  .integer({ min: 1, max: 12 })
  .chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => `a${i}`);
    return fc.record({
      ids: fc.constant(ids),
      uplines: fc.array(fc.oneof(fc.constantFrom(...ids, 'fantasma'), fc.constant('')), {
        minLength: n,
        maxLength: n,
      }),
    });
  })
  .map(({ ids, uplines }): NetworkNodeInput[] =>
    ids.map((id, i) => ({ affiliateId: id, uplineId: uplines[i] || null }))
  );

const rateArb = fc.nat({ max: 500 });
const metricArb = fc.oneof(
  fc.nat({ max: 200 }),
  fc.constantFrom('7', 'abc', '', null, undefined, NaN, Infinity, { toString: false }, [3]),
);

function configsFor(ids: string[], rates: number[], revs: number[]): Record<string, AffiliateConfig> {
  const out: Record<string, AffiliateConfig> = {};
  ids.forEach((id, i) => {
    out[id] = { affiliateId: id, cpaValue: rates[i % rates.length], revPercentage: revs[i % revs.length] };
  });
  return out;
}

describe('rede · propriedade CENTRAL: Σ(ganhos) == Σ(topos de estrutura)', () => {
  it('em QUALQUER floresta, repasse direto + lucro sobre equipe == custo da agência', () => {
    fc.assert(
      fc.property(
        forestArb,
        fc.array(rateArb, { minLength: 1, maxLength: 12 }),
        fc.array(fc.nat({ max: 60 }), { minLength: 1, maxLength: 12 }),
        fc.array(metricArb, { minLength: 1, maxLength: 12 }),
        (nodes, rates, revs, metrics) => {
          const tree = buildNetworkTree(nodes);
          const configs = configsFor(tree.ids, rates, revs);
          const rows: NetworkRow[] = tree.ids.map((id, i) => ({
            affiliateId: id,
            qualified_cpa: metrics[i % metrics.length] as any,
            rvs: metrics[(i + 1) % metrics.length] as any,
          }));
          const r = calcNetworkPayouts(tree, rows, configs);

          expect(Number.isFinite(r.agencyCost)).toBe(true);
          expect(r.directTotal + r.overrideTotal).toBeCloseTo(r.agencyCost, 6);
          // Nenhum afiliado é criado nem some: Σ dos "total" individuais == custo.
          const somaIndividual = Object.values(r.byAffiliate).reduce((s, p) => s + p.total, 0);
          expect(somaIndividual).toBeCloseTo(r.agencyCost, 6);
        }
      ),
      { numRuns: 400 }
    );
  });

  it('o custo pela taxa do TOPO (buildRootConfigMap, o caminho do /admin) == a cascata', () => {
    fc.assert(
      fc.property(
        forestArb,
        fc.array(rateArb, { minLength: 1, maxLength: 12 }),
        fc.array(fc.nat({ max: 60 }), { minLength: 1, maxLength: 12 }),
        fc.array(metricArb, { minLength: 1, maxLength: 12 }),
        (nodes, rates, revs, metrics) => {
          const tree = buildNetworkTree(nodes);
          const configs = configsFor(tree.ids, rates, revs);
          const rows: NetworkRow[] = tree.ids.map((id, i) => ({
            affiliateId: id,
            qualified_cpa: metrics[i % metrics.length] as any,
            rvs: metrics[(i + 2) % metrics.length] as any,
          }));
          const rootCfg = buildRootConfigMap(tree, configs);
          // Exatamente o que calcAgencyNetProfit faz com o subToSpecialConfig.
          const viaRoot = rows.reduce(
            (s, row) => s + calcAffiliatePayout(row, rootCfg[row.affiliateId] || configs[row.affiliateId]),
            0
          );
          expect(viaRoot).toBeCloseTo(calcNetworkPayouts(tree, rows, configs).agencyCost, 6);
        }
      ),
      { numRuns: 400 }
    );
  });
});

describe('rede · propriedade: saneamento da árvore é total (nunca trava, nunca perde nó)', () => {
  it('toda floresta vira árvore acíclica com topo definido para cada nó', () => {
    fc.assert(
      fc.property(forestArb, (nodes) => {
        const tree = buildNetworkTree(nodes);
        expect(tree.ids.length).toBe(nodes.length);
        for (const id of tree.ids) {
          expect(typeof tree.depthOf[id]).toBe('number');
          expect(tree.rootOf[id]).toBeTruthy();
          // Subir a partir de qualquer nó chega ao topo em ≤ N passos (sem ciclo).
          let cur = id;
          let steps = 0;
          while (tree.uplineOf[cur]) {
            cur = tree.uplineOf[cur];
            steps++;
            expect(steps).toBeLessThanOrEqual(tree.ids.length);
          }
          expect(cur).toBe(tree.rootOf[id]);
          expect(tree.roots).toContain(cur);
        }
      }),
      { numRuns: 500 }
    );
  });
});

describe('rede · propriedade: taxa monótona (limite de repasse) ⇒ ninguém ganha negativo', () => {
  it('quando a taxa NUNCA sobe descendo a árvore, todo lucro sobre equipe é ≥ 0', () => {
    fc.assert(
      fc.property(
        forestArb,
        fc.array(fc.nat({ max: 200 }), { minLength: 1, maxLength: 12 }),
        (nodes, metrics) => {
          const tree = buildNetworkTree(nodes);
          // Taxa = teto do pai − 1 por nível: respeita o "Limite de repasse".
          const configs: Record<string, AffiliateConfig> = {};
          for (const id of tree.ids) {
            const cpaValue = Math.max(0, 500 - (tree.depthOf[id] ?? 0) * 10);
            configs[id] = { affiliateId: id, cpaValue, revPercentage: Math.max(0, 50 - (tree.depthOf[id] ?? 0)) };
          }
          const rows: NetworkRow[] = tree.ids.map((id, i) => ({
            affiliateId: id,
            qualified_cpa: metrics[i % metrics.length],
            rvs: metrics[(i + 1) % metrics.length],
          }));
          const r = calcNetworkPayouts(tree, rows, configs);
          for (const p of Object.values(r.byAffiliate)) {
            expect(p.team).toBeGreaterThanOrEqual(-1e-6);
            expect(p.own).toBeGreaterThanOrEqual(0);
          }
          expect(r.anomalies.filter((a) => a.kind === 'spread-negativo')).toEqual([]);
        }
      ),
      { numRuns: 300 }
    );
  });
});

describe('rede · propriedade: upline sem taxa nunca vira estrutura de custo R$ 0', () => {
  it('com isEligibleUpline, TODO upline (e todo topo de quem tem upline) tem taxa', () => {
    fc.assert(
      fc.property(
        forestArb,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }),
        fc.array(fc.nat({ max: 100 }), { minLength: 1, maxLength: 12 }),
        (nodes, hasCfg, metrics) => {
          const bare = buildNetworkTree(nodes);
          const configs: Record<string, AffiliateConfig> = {};
          bare.ids.forEach((id, i) => {
            if (hasCfg[i % hasCfg.length]) configs[id] = { affiliateId: id, cpaValue: 100 + i, revPercentage: 0 };
          });
          const tree = buildNetworkTree(nodes, { isEligibleUpline: buildEligibleUpline(configs) });
          const rootCfg = buildRootConfigMap(tree, configs);
          for (const id of tree.ids) {
            const up = tree.uplineOf[id];
            if (!up) continue;
            // A aresta só sobrevive se o pai tem taxa — e o topo, idem. Sem isso a
            // estrutura inteira sairia a R$ 0 e inflaria o lucro do /admin.
            expect(configs[up]).toBeDefined();
            expect(rootCfg[id]).toBeDefined();
          }
          const rows: NetworkRow[] = tree.ids.map((id, i) => ({
            affiliateId: id,
            qualified_cpa: metrics[i % metrics.length],
          }));
          const r = calcNetworkPayouts(tree, rows, configs);
          expect(Number.isFinite(r.agencyCost)).toBe(true);
          // Quem não tem taxa nunca é cobrado como se fosse R$ 0 escondido: ele
          // aparece como anomalia explícita quando produz.
          const semTaxaProduzindo = tree.ids.filter(
            (id, i) => !configs[id] && metrics[i % metrics.length] > 0
          );
          for (const id of semTaxaProduzindo) {
            expect(r.anomalies.some((a) => a.kind === 'sem-taxa' && a.affiliateId === id)).toBe(true);
          }
        }
      ),
      { numRuns: 300 }
    );
  });
});
