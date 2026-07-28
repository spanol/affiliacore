import { describe, it, expect } from 'vitest';
import { buildNetworkTree, buildNetworkNodes, calcNetworkPayouts, buildRootConfigMap, NetworkRow } from './network';
import type { AffiliateConfig } from './commission';

// Reconciliação com os números REAIS da migração da Infinity (MIGRACAO-INFINITY-LEGADO.md
// §2.4 + planilha de pagamentos do legado). É o teste-âncora da feature: se ele quebrar,
// o modelo de rede deixou de reproduzir o que a plataforma antiga de fato pagava.
//
//                     | Super Bet V2 |  Stake |  Esportiva |   Total
//   repasse direto     |     14.580   |  7.240 |     4.960  |  26.780
//   lucro sobre equipe |      4.180   |  2.040 |       540  |   6.760
//   total pago         |     18.760   |  9.280 |     5.500  |  33.540
//   receita das casas  |     20.100   | 10.730 |     6.000  |  36.830
//   lucro da agência   |      1.340   |  1.450 |       500  |   3.290
//
// A AffiliaCore SEM o modelo de rede calcularia 36.830 − 26.780 = R$ 10.050 de lucro:
// inflado em exatamente os R$ 6.760 de override que o cliente também paga.

interface Node {
  id: string;
  upline?: string;
  cpaRate: number;  // CPA que ESTE afiliado recebe (R$)
  ownCpas: number;  // CPAs que ele mesmo produziu
}

// Estruturas por casa. Cada uma reproduz exatamente o par (direto, override) do
// legado; a Super Bet V2 tem os 4 NÍVEIS que o painel antigo suportava.
const CASAS: Record<string, { brandId: string; houseCpa: number; nodes: Node[]; direto: number; equipe: number }> = {
  'Super Bet V2': {
    brandId: 'superbet-v2',
    houseCpa: 300, // o que a CASA paga à agência por CPA
    direto: 14580,
    equipe: 4180,
    nodes: [
      { id: 'v1', cpaRate: 280, ownCpas: 6 },                    // topo de estrutura
      { id: 'v2', upline: 'v1', cpaRate: 250, ownCpas: 12 },
      { id: 'v3', upline: 'v2', cpaRate: 200, ownCpas: 36 },
      { id: 'v4', upline: 'v3', cpaRate: 180, ownCpas: 7 },      // 4º nível
      { id: 'v5', upline: 'v1', cpaRate: 240, ownCpas: 6 },
    ],
  },
  Stake: {
    brandId: 'stake',
    houseCpa: 185,
    direto: 7240,
    equipe: 2040,
    nodes: [
      { id: 's1', cpaRate: 160, ownCpas: 4 },
      { id: 's2', upline: 's1', cpaRate: 140, ownCpas: 4 },
      { id: 's3', upline: 's1', cpaRate: 130, ownCpas: 4 },
      { id: 's4', upline: 's2', cpaRate: 120, ownCpas: 46 },
    ],
  },
  'Esportiva Bet': {
    brandId: 'esportiva',
    houseCpa: 120,
    direto: 4960,
    equipe: 540,
    nodes: [
      { id: 'e1', cpaRate: 110, ownCpas: 18 },
      { id: 'e2', upline: 'e1', cpaRate: 100, ownCpas: 10 },
      { id: 'e3', upline: 'e2', cpaRate: 90, ownCpas: 22 },
    ],
  },
};

const todosNodes = Object.values(CASAS).flatMap((c) => c.nodes);
const casaDe = (id: string) => Object.values(CASAS).find((c) => c.nodes.some((n) => n.id === id))!;

// Taxa POR CASA (byBrand) — é assim que a migração grava (as três casas têm CPA
// diferente; gravar só no topo corromperia o cálculo). [[MIGRACAO §4]]
const configs: Record<string, AffiliateConfig> = Object.fromEntries(
  todosNodes.map((n) => {
    const casa = casaDe(n.id);
    return [
      n.id,
      {
        affiliateId: n.id,
        cpaValue: n.cpaRate,
        revPercentage: 0, // REV é 0% em 100% dos cadastros do legado
        byBrand: { [casa.brandId]: { cpaValue: n.cpaRate, revPercentage: 0 } },
      } as AffiliateConfig,
    ];
  })
);

const tree = buildNetworkTree(
  buildNetworkNodes({
    ids: todosNodes.map((n) => n.id),
    uplines: Object.fromEntries(todosNodes.filter((n) => n.upline).map((n) => [n.id, n.upline!])),
  })
);

const rows: NetworkRow[] = todosNodes.map((n) => ({
  affiliateId: n.id,
  brandId: casaDe(n.id).brandId,
  qualified_cpa: n.ownCpas,
  rvs: 0,
}));

const RECEITA_CASAS = Object.values(CASAS).reduce(
  (s, c) => s + c.nodes.reduce((t, n) => t + n.ownCpas, 0) * c.houseCpa,
  0
);

describe('reconciliação com o legado da Infinity · por casa', () => {
  for (const [nome, casa] of Object.entries(CASAS)) {
    it(`${nome}: repasse direto R$ ${casa.direto} + lucro sobre equipe R$ ${casa.equipe}`, () => {
      const ids = new Set(casa.nodes.map((n) => n.id));
      const r = calcNetworkPayouts(
        tree,
        rows.filter((x) => ids.has(x.affiliateId)),
        configs
      );
      expect(r.directTotal).toBe(casa.direto);
      expect(r.overrideTotal).toBe(casa.equipe);
      expect(r.agencyCost).toBe(casa.direto + casa.equipe);
      // O total pago é a Σ dos CPAs da estrutura × a taxa do TOPO — a identidade
      // que o export do legado mostra como "CPAs de estrutura × CPA/Deal atual".
      const cpasEstrutura = casa.nodes.reduce((s, n) => s + n.ownCpas, 0);
      const taxaTopo = casa.nodes.find((n) => !n.upline)!.cpaRate;
      expect(r.agencyCost).toBe(cpasEstrutura * taxaTopo);
    });
  }
});

describe('reconciliação com o legado da Infinity · consolidado', () => {
  const r = calcNetworkPayouts(tree, rows, configs);

  it('repasse direto = R$ 26.780', () => {
    expect(r.directTotal).toBe(26780);
  });

  it('lucro sobre equipe (override) = R$ 6.760', () => {
    expect(r.overrideTotal).toBe(6760);
  });

  it('total pago aos afiliados = R$ 33.540 (o passivo bruto do legado)', () => {
    expect(r.agencyCost).toBe(33540);
    expect(r.directTotal + r.overrideTotal).toBe(r.agencyCost);
  });

  it('receita das casas = R$ 36.830 e o lucro REAL da agência = R$ 3.290', () => {
    expect(RECEITA_CASAS).toBe(36830);
    expect(RECEITA_CASAS - r.agencyCost).toBe(3290);
  });

  it('sem o modelo de rede o lucro sairia R$ 10.050 — inflado nos R$ 6.760 do override', () => {
    expect(RECEITA_CASAS - r.directTotal).toBe(10050);
    expect(RECEITA_CASAS - r.directTotal - (RECEITA_CASAS - r.agencyCost)).toBe(6760);
  });

  it('a árvore tem 4 níveis e 3 topos de estrutura (um por casa)', () => {
    expect(Math.max(...Object.values(tree.depthOf))).toBe(3); // profundidade 0..3 = 4 níveis
    expect(tree.roots.sort()).toEqual(['e1', 's1', 'v1']);
    expect(tree.dropped).toEqual([]);
  });

  it('o caminho do /admin (taxa do TOPO por linha) chega no mesmo R$ 33.540', () => {
    const rootCfg = buildRootConfigMap(tree, configs);
    const viaAdmin = rows.reduce((s, row) => {
      const cfg = rootCfg[row.affiliateId] || configs[row.affiliateId];
      const rate = cfg.byBrand?.[row.brandId!]?.cpaValue ?? cfg.cpaValue;
      return s + rate * Number(row.qualified_cpa);
    }, 0);
    expect(viaAdmin).toBe(33540);
  });

  it('o ganho individual do topo da Super Bet V2 bate com o painel do legado', () => {
    // v1: 6 CPAs próprios × 280 + spread sobre os filhos diretos (v2 com 55 na
    // estrutura, v5 com 6) = 1.680 + 55×30 + 6×40.
    expect(r.byAffiliate.v1).toMatchObject({
      own: 1680,
      team: 1890,
      total: 3570,
      received: 67 * 280, // "Valor bruto" = CPAs de estrutura × CPA/Deal atual
      paid: 55 * 250 + 6 * 240,
    });
  });
});
