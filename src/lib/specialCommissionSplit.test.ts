import { describe, it, expect } from 'vitest';
import {
  splitSpecialCommission,
  splitSpecialCommissionByHouse,
  type SpecialCommissionInput,
} from './specialCommissionSplit';
import type { AffiliateConfig } from './commission';

// O cenário da call com o Jotta (27/08/2026), com os números que ele citou:
// o gerente produz R$ 250 (sendo R$ 200 de CPA), a rede dele gera R$ 280, e o
// painel mostrava os dois somados num card só chamado "Comissão total".
const cfg = (id: string, cpa: number, rev: number): AffiliateConfig => ({
  affiliateId: id,
  cpaValue: cpa,
  revPercentage: rev,
  byBrand: {
    'bacana-play': { cpaValue: cpa, revPercentage: rev },
    blaze: { cpaValue: cpa, revPercentage: rev },
  },
});

const base = (): SpecialCommissionInput => ({
  otg: [],
  manual: [
    { affiliateId: 'ger-1', houseSlug: 'bacana-play', qualified_cpa: 2, rvs: 250 },
    { affiliateId: 'sub-1', houseSlug: 'bacana-play', qualified_cpa: 1, rvs: 200 },
    { affiliateId: 'sub-1', houseSlug: 'blaze', qualified_cpa: 1, rvs: 200 },
  ],
  ownId: 'ger-1',
  subIds: ['sub-1'],
  ownConfig: cfg('ger-1', 100, 20),
  configs: { 'ger-1': cfg('ger-1', 100, 20), 'sub-1': cfg('sub-1', 70, 10) },
  brandIdOf: () => undefined,
});

describe('splitSpecialCommission', () => {
  it('abre o R$ 530 do painel em produção própria e produção da rede', () => {
    const s = splitSpecialCommission(base());
    expect(s.propria.total).toBe(250);
    expect(s.propria.cpa).toBe(200);
    expect(s.rede.total).toBe(280);
    expect(s.total.total).toBe(530);
  });

  it('separa o que o gerente recebe do que ele apenas movimenta', () => {
    const s = splitSpecialCommission(base());
    // Dos R$ 530 exibidos, R$ 180 são repasse aos subs. O gerente recebe R$ 350.
    expect(s.repasse).toBe(180);
    expect(s.lucro).toBe(350);
    expect(s.lucro).toBe(s.total.total - s.repasse);
  });

  it('mantém "todas as casas" igual à soma das casas, card a card', () => {
    const todas = splitSpecialCommission(base());
    const casas = ['bacana-play', 'blaze'].map((houseKey) =>
      splitSpecialCommission({ ...base(), houseKey })
    );
    const soma = (pick: (s: ReturnType<typeof splitSpecialCommission>) => number) =>
      casas.reduce((acc, s) => acc + pick(s), 0);

    expect(soma((s) => s.propria.total)).toBe(todas.propria.total);
    expect(soma((s) => s.rede.total)).toBe(todas.rede.total);
    expect(soma((s) => s.total.total)).toBe(todas.total.total);
    expect(soma((s) => s.repasse)).toBe(todas.repasse);
    expect(soma((s) => s.lucro)).toBe(todas.lucro);
  });

  it('zera a produção própria na casa em que só a rede produziu', () => {
    // Era o furo do filtro: o lucro líquido ficava em R$ 350 nas DUAS casas,
    // maior que a comissão total exibida logo acima (R$ 140 na Blaze).
    const blaze = splitSpecialCommission({ ...base(), houseKey: 'blaze' });
    expect(blaze.propria.total).toBe(0);
    expect(blaze.rede.total).toBe(140);
    expect(blaze.lucro).toBe(50); // 140 gerados − 90 repassados ao sub
    expect(blaze.lucro).toBeLessThan(blaze.total.total);
  });

  it('precifica a linha manual pela casa DELA, não pela casa do mirror', () => {
    // Mesma classe do bug do R$ 280 (2026-08-12): o mirror aponta a Bacana Play,
    // a conversão é da Blaze, e a Blaze paga metade.
    const input = base();
    const s = splitSpecialCommission({
      ...input,
      manual: [{ affiliateId: 'sub-1', houseSlug: 'blaze', qualified_cpa: 1, rvs: 0 }],
      ownConfig: {
        affiliateId: 'ger-1',
        cpaValue: 0,
        revPercentage: 0,
        byBrand: { 'bacana-play': { cpaValue: 280, revPercentage: 0 }, blaze: { cpaValue: 110, revPercentage: 0 } },
      },
      brandIdOf: () => 'bacana-play',
    });
    expect(s.rede.total).toBe(110);
  });

  it('não conta o gerente duas vezes quando ele aparece na própria lista de subs', () => {
    const s = splitSpecialCommission({ ...base(), subIds: ['ger-1', 'sub-1'] });
    expect(s.propria.total).toBe(250);
    expect(s.total.total).toBe(530);
  });

  it('recorta a produção OTG pela casa do mirror do afiliado', () => {
    const input: SpecialCommissionInput = {
      ...base(),
      manual: [],
      otg: [
        { affiliate_id: 'ger-1', qualified_cpa: 1, rvs: 0 },
        { affiliate_id: 'sub-1', qualified_cpa: 1, rvs: 0 },
      ],
      brandIdOf: (id) => (id === 'ger-1' ? 'bacana-play' : 'blaze'),
    };
    const bacana = splitSpecialCommission({ ...input, houseKey: 'bacana-play' });
    expect(bacana.propria.total).toBe(100);
    expect(bacana.rede.total).toBe(0);

    const blaze = splitSpecialCommission({ ...input, houseKey: 'blaze' });
    expect(blaze.propria.total).toBe(0);
    expect(blaze.rede.total).toBe(100);
  });

  it('entrega o spread inteiro ao gerente quando o sub ainda não tem taxa', () => {
    // Ausência de taxa não é dinheiro do sub: sem config, não há repasse a pagar.
    const s = splitSpecialCommission({ ...base(), configs: { 'ger-1': cfg('ger-1', 100, 20) } });
    expect(s.repasse).toBe(0);
    expect(s.lucro).toBe(s.total.total);
  });

  it('devolve tudo zerado sem produção nenhuma', () => {
    const s = splitSpecialCommission({ ...base(), otg: [], manual: [] });
    expect(s.total).toEqual({ total: 0, cpa: 0, rev: 0 });
    expect(s.repasse).toBe(0);
    expect(s.lucro).toBe(0);
  });
});

describe('splitSpecialCommissionByHouse', () => {
  const houses = [
    { key: 'bacana-play', name: 'Bacana Play' },
    { key: 'blaze', name: 'Blaze' },
    { key: 'casa-sem-producao', name: 'Casa parada' },
  ];

  it('detalha cada casa em própria e rede, da maior para a menor', () => {
    const linhas = splitSpecialCommissionByHouse(base(), houses);
    expect(linhas.map((l) => l.name)).toEqual(['Bacana Play', 'Blaze']);
    expect(linhas[0].split.propria.total).toBe(250);
    expect(linhas[0].split.rede.total).toBe(140);
    expect(linhas[1].split.propria.total).toBe(0);
    expect(linhas[1].split.rede.total).toBe(140);
  });

  it('fecha com os cards de resumo, que é a razão de sair da mesma função', () => {
    const geral = splitSpecialCommission(base());
    const linhas = splitSpecialCommissionByHouse(base(), houses);
    const soma = (pick: (l: (typeof linhas)[number]) => number) =>
      linhas.reduce((acc, l) => acc + pick(l), 0);

    expect(soma((l) => l.split.propria.total)).toBe(geral.propria.total);
    expect(soma((l) => l.split.rede.total)).toBe(geral.rede.total);
    expect(soma((l) => l.split.total.total)).toBe(geral.total.total);
    expect(soma((l) => l.split.lucro)).toBe(geral.lucro);
  });

  it('ordena pelo que o gerente recebe, não pelo bruto que passou pela casa', () => {
    // Casa cara: a rede produz muito e ele repassa quase tudo. Casa boa: produz
    // menos e é toda dele. Ordenar pelo bruto poria a casa cara em primeiro.
    const input: SpecialCommissionInput = {
      ...base(),
      manual: [
        { affiliateId: 'sub-1', houseSlug: 'bacana-play', qualified_cpa: 10, rvs: 0 }, // 1000 bruto
        { affiliateId: 'ger-1', houseSlug: 'blaze', qualified_cpa: 3, rvs: 0 },        // 300, todo dele
      ],
      configs: {
        'ger-1': cfg('ger-1', 100, 20),
        'sub-1': cfg('sub-1', 99, 0), // repassa 990 dos 1000
      },
    };
    const linhas = splitSpecialCommissionByHouse(input, houses);
    expect(linhas.map((l) => l.name)).toEqual(['Blaze', 'Bacana Play']);
    expect(linhas[0].split.lucro).toBe(300);
    expect(linhas[1].split.lucro).toBe(10);
    expect(linhas[1].split.rede.total).toBe(1000); // o bruto segue disponível
  });

  it('mantém na lista a casa em que a rede produziu e a margem saiu zero', () => {
    // Ele não ganha nada ali, mas houve movimento: sumir com a linha esconderia
    // uma casa inteira da rede dele.
    const input: SpecialCommissionInput = {
      ...base(),
      manual: [{ affiliateId: 'sub-1', houseSlug: 'blaze', qualified_cpa: 1, rvs: 0 }],
      configs: { 'ger-1': cfg('ger-1', 100, 20), 'sub-1': cfg('sub-1', 100, 20) },
    };
    const linhas = splitSpecialCommissionByHouse(input, houses);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].name).toBe('Blaze');
    expect(linhas[0].split.lucro).toBe(0);
    expect(linhas[0].split.rede.total).toBe(100);
  });

  it('não lista casa sem produção nenhuma no período', () => {
    const linhas = splitSpecialCommissionByHouse(base(), houses);
    expect(linhas.some((l) => l.key === 'casa-sem-producao')).toBe(false);
  });
});

