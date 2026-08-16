import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  EPOCH_DAY, isDay, addDays, prevDay,
  ratesOn, closeRateSegment, splitRangeByRate, brandRateEntry, resolveBrandRatesAt,
  type BrandRateEntry,
} from './rateHistory';
import { resolveBrandRates, calcAffiliatePayout, type AffiliateConfig } from './commission';

describe('aritmética de dia', () => {
  it('anda no calendário, inclusive virando mês e ano', () => {
    expect(addDays('2026-08-16', 1)).toBe('2026-08-17');
    expect(prevDay('2026-08-01')).toBe('2026-07-31');
    expect(prevDay('2026-01-01')).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // bissexto
  });
  it('valor que não é dia passa intacto (nunca lança)', () => {
    expect(addDays('lixo', 1)).toBe('lixo');
    expect(isDay('16/08/2026')).toBe(false);
    expect(isDay('2026-08-16')).toBe(true);
  });
});

describe('ratesOn · que taxa valia neste dia', () => {
  const entry: BrandRateEntry = {
    cpaValue: 80, revPercentage: 0, since: '2026-08-16',
    history: [{ from: '2026-06-01', to: '2026-08-15', cpaValue: 100, revPercentage: 5 }],
  };

  it('sem data devolve a taxa ATUAL (o caminho de todo consumidor de hoje)', () => {
    expect(ratesOn(entry)).toEqual({ cpaValue: 80, revPercentage: 0 });
  });
  it('dia dentro do trecho antigo devolve a taxa antiga', () => {
    expect(ratesOn(entry, '2026-07-10')).toEqual({ cpaValue: 100, revPercentage: 5 });
  });
  it('as duas pontas do trecho são INCLUSIVAS', () => {
    expect(ratesOn(entry, '2026-06-01').cpaValue).toBe(100);
    expect(ratesOn(entry, '2026-08-15').cpaValue).toBe(100);
  });
  it('o dia em que a taxa nova passou a valer já é a nova', () => {
    expect(ratesOn(entry, '2026-08-16').cpaValue).toBe(80);
    expect(ratesOn(entry, '2026-12-01').cpaValue).toBe(80);
  });
  // Devolver a ATUAL para uma data anterior a todo o histórico seria exatamente o
  // efeito retroativo que este módulo existe para impedir.
  it('data ANTERIOR a todo o histórico cai no trecho mais antigo, não na atual', () => {
    expect(ratesOn(entry, '2026-01-01').cpaValue).toBe(100);
  });
  it('entrada SEM histórico devolve a atual em qualquer data (parque de hoje)', () => {
    expect(ratesOn({ cpaValue: 50, revPercentage: 1 }, '2020-01-01')).toEqual({ cpaValue: 50, revPercentage: 1 });
  });
  it('histórico malformado é descartado sem lançar', () => {
    const sujo: any = { cpaValue: 10, revPercentage: 0, history: [{ from: 'x', to: 'y' }, null, { from: '2026-09-01', to: '2026-08-01' }] };
    expect(() => ratesOn(sujo, '2026-08-10')).not.toThrow();
    expect(ratesOn(sujo, '2026-08-10').cpaValue).toBe(10);
  });
  it('entrada nula não lança', () => {
    expect(ratesOn(null, '2026-08-10')).toEqual({ cpaValue: 0, revPercentage: 0 });
  });
});

describe('closeRateSegment · a troca corta a linha do tempo', () => {
  // O caso do parque: a config nunca teve vigência. O trecho antigo TEM que ser
  // registrado, senão a taxa nova passa a valer para o passado inteiro.
  it('config sem vigência: congela o passado desde a época', () => {
    const out = closeRateSegment({ cpaValue: 100, revPercentage: 0 }, { cpaValue: 80, revPercentage: 0 }, '2026-08-16');
    expect(out).toMatchObject({ cpaValue: 80, revPercentage: 0, since: '2026-08-16' });
    expect(out.history).toEqual([{ from: EPOCH_DAY, to: '2026-08-15', cpaValue: 100, revPercentage: 0 }]);
    // e o passado continua valendo 100
    expect(ratesOn(out, '2026-07-01').cpaValue).toBe(100);
    expect(ratesOn(out, '2026-08-16').cpaValue).toBe(80);
  });

  it('o trecho fecha na VÉSPERA: o dia que já correu nunca é reprecificado', () => {
    const out = closeRateSegment({ cpaValue: 100, revPercentage: 0, since: '2026-06-01' }, { cpaValue: 80, revPercentage: 0 }, '2026-08-16');
    expect(out.history![0]).toMatchObject({ from: '2026-06-01', to: '2026-08-15' });
  });

  it('trocas sucessivas empilham trechos contíguos, sem buraco', () => {
    let e = closeRateSegment({ cpaValue: 100, revPercentage: 0, since: '2026-06-01' }, { cpaValue: 90, revPercentage: 0 }, '2026-07-01');
    e = closeRateSegment(e, { cpaValue: 80, revPercentage: 0 }, '2026-08-01');
    expect(e.history).toEqual([
      { from: '2026-06-01', to: '2026-06-30', cpaValue: 100, revPercentage: 0 },
      { from: '2026-07-01', to: '2026-07-31', cpaValue: 90, revPercentage: 0 },
    ]);
    expect(ratesOn(e, '2026-06-15').cpaValue).toBe(100);
    expect(ratesOn(e, '2026-07-15').cpaValue).toBe(90);
    expect(ratesOn(e, '2026-08-15').cpaValue).toBe(80);
  });

  it('duas trocas no MESMO dia não criam trecho de duração zero', () => {
    let e = closeRateSegment({ cpaValue: 100, revPercentage: 0, since: '2026-06-01' }, { cpaValue: 90, revPercentage: 0 }, '2026-08-16');
    e = closeRateSegment(e, { cpaValue: 85, revPercentage: 0 }, '2026-08-16');
    expect(e.cpaValue).toBe(85);
    expect(e.history).toHaveLength(1);
    expect(e.history![0]).toMatchObject({ to: '2026-08-15', cpaValue: 100 });
  });

  it('salvar o MESMO valor não polui a linha do tempo', () => {
    const e = closeRateSegment({ cpaValue: 100, revPercentage: 0, since: '2026-06-01' }, { cpaValue: 100, revPercentage: 0 }, '2026-08-16');
    expect(e.history).toEqual([]);
    expect(e.since).toBe('2026-06-01');
  });

  // Vigência retroativa reabriria justamente o problema que isto fecha.
  it('vigência PARA TRÁS (dentro de trecho já fechado) é recusada, entrada intacta', () => {
    const base = closeRateSegment({ cpaValue: 100, revPercentage: 0, since: '2026-06-01' }, { cpaValue: 80, revPercentage: 0 }, '2026-08-16');
    const tentativa = closeRateSegment(base, { cpaValue: 10, revPercentage: 0 }, '2026-07-01');
    expect(tentativa.cpaValue).toBe(80);
    expect(tentativa.history).toEqual(base.history);
  });

  it('data inválida é recusada sem corromper a entrada', () => {
    const out = closeRateSegment({ cpaValue: 100, revPercentage: 0 }, { cpaValue: 80, revPercentage: 0 }, 'amanhã');
    expect(out.cpaValue).toBe(100);
    expect(out.history).toBeUndefined();
  });
});

describe('splitRangeByRate · fatia o range nas fronteiras de vigência', () => {
  const entry: BrandRateEntry = {
    cpaValue: 80, revPercentage: 0, since: '2026-08-16',
    history: [{ from: '2026-06-01', to: '2026-08-15', cpaValue: 100, revPercentage: 0 }],
  };

  it('range que atravessa a troca sai em duas janelas contíguas', () => {
    expect(splitRangeByRate(entry, '2026-08-10', '2026-08-20')).toEqual([
      { from: '2026-08-10', to: '2026-08-15', rates: { cpaValue: 100, revPercentage: 0 } },
      { from: '2026-08-16', to: '2026-08-20', rates: { cpaValue: 80, revPercentage: 0 } },
    ]);
  });
  it('range inteiro de um lado só sai numa janela', () => {
    expect(splitRangeByRate(entry, '2026-07-01', '2026-07-31')).toHaveLength(1);
    expect(splitRangeByRate(entry, '2026-09-01', '2026-09-30')).toEqual([
      { from: '2026-09-01', to: '2026-09-30', rates: { cpaValue: 80, revPercentage: 0 } },
    ]);
  });
  it('sem histórico devolve UMA janela com a taxa atual (parque de hoje)', () => {
    expect(splitRangeByRate({ cpaValue: 50, revPercentage: 2 }, '2026-01-01', '2026-12-31')).toEqual([
      { from: '2026-01-01', to: '2026-12-31', rates: { cpaValue: 50, revPercentage: 2 } },
    ]);
  });
  it('range invertido ou inválido devolve vazio', () => {
    expect(splitRangeByRate(entry, '2026-08-20', '2026-08-10')).toEqual([]);
    expect(splitRangeByRate(entry, 'x', '2026-08-10')).toEqual([]);
  });

  // As janelas têm que COBRIR o range sem buraco nem sobreposição, senão a soma por
  // janela perde ou conta dinheiro em dobro.
  it('as janelas cobrem o range exatamente, em qualquer recorte', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 200 }),
      (a, b) => {
        const from = addDays('2026-05-01', Math.min(a, b));
        const to = addDays('2026-05-01', Math.max(a, b));
        const parts = splitRangeByRate(entry, from, to);
        expect(parts[0].from).toBe(from);
        expect(parts[parts.length - 1].to).toBe(to);
        for (let i = 1; i < parts.length; i++) {
          expect(parts[i].from).toBe(addDays(parts[i - 1].to, 1));
        }
      },
    ));
  });
});

describe('resolveBrandRatesAt · irmã datada de resolveBrandRates', () => {
  const config: AffiliateConfig = {
    affiliateId: 'a1', cpaValue: 50, revPercentage: 1,
    byBrand: {
      betano: {
        cpaValue: 80, revPercentage: 0, since: '2026-08-16',
        history: [{ from: '2026-06-01', to: '2026-08-15', cpaValue: 100, revPercentage: 0 }],
      } as any,
    },
  };

  // O contrato que torna seguro ligar isso em qualquer call-site.
  it('SEM data é idêntica a resolveBrandRates, com e sem override', () => {
    expect(resolveBrandRatesAt(config, 'betano')).toEqual(resolveBrandRates(config, 'betano'));
    expect(resolveBrandRatesAt(config, 'superbet')).toEqual(resolveBrandRates(config, 'superbet'));
    expect(resolveBrandRatesAt(config)).toEqual(resolveBrandRates(config));
    expect(resolveBrandRatesAt(null, 'betano')).toEqual(resolveBrandRates(null, 'betano'));
  });
  it('data inválida também cai no comportamento de hoje', () => {
    expect(resolveBrandRatesAt(config, 'betano', '16/08/2026')).toEqual(resolveBrandRates(config, 'betano'));
  });
  it('com data respeita a vigência do override da casa', () => {
    expect(resolveBrandRatesAt(config, 'betano', '2026-07-10').cpaValue).toBe(100);
    expect(resolveBrandRatesAt(config, 'betano', '2026-08-20').cpaValue).toBe(80);
  });
  it('casa SEM override cai no topo, com ou sem data (mesma precedência de sempre)', () => {
    expect(resolveBrandRatesAt(config, 'superbet', '2026-07-10')).toEqual({ cpaValue: 50, revPercentage: 1 });
  });

  it('brandRateEntry espelha a precedência override > topo', () => {
    expect(brandRateEntry(config, 'betano').cpaValue).toBe(80);
    expect(brandRateEntry(config, 'inexistente').cpaValue).toBe(50);
    expect(brandRateEntry(null).cpaValue).toBe(0);
  });
});

describe('somar por janela == somar dia a dia (a linearidade que sustenta o desenho)', () => {
  // Esta é a propriedade de que tudo depende. `calcAffiliatePayout` é LINEAR nas
  // métricas, então agregar os dias DENTRO de cada janela de vigência e precificar
  // o agregado tem que dar o mesmo que precificar cada dia com a taxa daquele dia.
  // Se isto quebrasse, somar por janela na carteira criaria ou sumiria dinheiro.
  const entry: BrandRateEntry = {
    cpaValue: 80, revPercentage: 10, since: '2026-08-16',
    history: [{ from: EPOCH_DAY, to: '2026-08-15', cpaValue: 100, revPercentage: 20 }],
  };
  const cfgOf = (r: { cpaValue: number; revPercentage: number }): AffiliateConfig =>
    ({ affiliateId: 'a1', cpaValue: r.cpaValue, revPercentage: r.revPercentage });

  it('property: as duas somas batem, com a taxa mudando no meio do range', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          offset: fc.integer({ min: 0, max: 20 }),           // dias a partir de 2026-08-06
          qualified_cpa: fc.integer({ min: 0, max: 50 }),
          total_commission: fc.integer({ min: 0, max: 5000 }),
        }),
        { minLength: 1, maxLength: 40 },
      ),
      (linhas) => {
        const dias = linhas.map((l) => ({ ...l, date: addDays('2026-08-06', l.offset) }));
        const from = '2026-08-06';
        const to = '2026-08-26';

        // (a) dia a dia, cada um com a taxa do SEU dia
        const somaPorDia = dias.reduce(
          (acc, d) => acc + calcAffiliatePayout(d, cfgOf(ratesOn(entry, d.date))),
          0,
        );

        // (b) agregado por janela de vigência
        const somaPorJanela = splitRangeByRate(entry, from, to).reduce((acc, janela) => {
          const doTrecho = dias.filter((d) => d.date >= janela.from && d.date <= janela.to);
          const agregado = doTrecho.reduce(
            (m, d) => ({
              qualified_cpa: m.qualified_cpa + d.qualified_cpa,
              total_commission: m.total_commission + d.total_commission,
            }),
            { qualified_cpa: 0, total_commission: 0 },
          );
          return acc + calcAffiliatePayout(agregado, cfgOf(janela.rates));
        }, 0);

        expect(somaPorJanela).toBeCloseTo(somaPorDia, 6);
      },
    ));
  });

  it('e a soma por janela DIFERE de precificar tudo pela taxa atual (senão não haveria feature)', () => {
    const dias = [
      { date: '2026-08-10', qualified_cpa: 1, total_commission: 0 }, // taxa antiga: 100
      { date: '2026-08-20', qualified_cpa: 1, total_commission: 0 }, // taxa nova: 80
    ];
    const porDia = dias.reduce((acc, d) => acc + calcAffiliatePayout(d, cfgOf(ratesOn(entry, d.date))), 0);
    const tudoPelaAtual = calcAffiliatePayout({ qualified_cpa: 2, total_commission: 0 }, cfgOf(resolveBrandRates({ affiliateId: 'a1', cpaValue: entry.cpaValue, revPercentage: entry.revPercentage })));
    expect(porDia).toBe(180);       // 100 + 80
    expect(tudoPelaAtual).toBe(160); // 80 + 80, o retroativo que queremos evitar
  });
});
