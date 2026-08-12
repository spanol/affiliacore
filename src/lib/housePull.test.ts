import { describe, it, expect } from 'vitest';
import { buildPullPayload, pullWindow } from './housePull';

// Amostra ADAPTADA (já no shape PullRow) — não importa de qual casa veio, é o
// motor de agregação/atribuição que está sob teste aqui.
const ROWS = [
  { date: '2026-07-10', tag: 'infinitw280', registrations: 10, first_deposits: 8, qualified_cpa: 8, rvs: 10.5, deposit: 900, total_commission: 970.5 },
  { date: '2026-07-10', tag: 'infinitw292', registrations: 6, first_deposits: 4, qualified_cpa: 4, rvs: 5, deposit: 400, total_commission: 485 },
  { date: '2026-07-10', tag: '', registrations: 1, first_deposits: 0, qualified_cpa: 0, rvs: -20, deposit: 0, total_commission: -20 },
  { date: '2026-07-11', tag: 'infinitw280', registrations: 2, first_deposits: 2, qualified_cpa: 4, rvs: 1.5, deposit: 150, total_commission: 241.5 },
];

describe('buildPullPayload', () => {
  const index = new Map([['infinitw280', { affiliateId: 'AFF-280' }]]);

  it('o AGREGADO do dia soma TUDO — atribuído + sem tag + tag órfã', () => {
    const { rows } = buildPullPayload(ROWS, index);
    const agg = rows.find((r) => r.affiliateId === null && r.date === '2026-07-10')!;
    // 970,5 + 485 + (−20)
    expect(agg.total_commission).toBeCloseTo(1435.5, 2);
    expect(agg.registrations).toBe(17); // 10 + 6 + 1
    expect(agg.qualified_cpa).toBe(12); // 8 + 4
  });

  it('a tag com dono vira linha do afiliado; a órfã NÃO vira linha atribuída', () => {
    const { rows, attributed, pending } = buildPullPayload(ROWS, index);
    const mine = rows.filter((r) => r.affiliateId === 'AFF-280');
    expect(mine.map((r) => r.date).sort()).toEqual(['2026-07-10', '2026-07-11']);
    expect(attributed).toBe(2);
    expect(rows.some((r) => r.affiliateId === 'infinitw292')).toBe(false);
    expect(pending.map((p) => p.tag)).toEqual(['infinitw292']);
    expect(pending[0].total_commission).toBe(485);
  });

  it('pendentes vêm ordenados por DINHEIRO (é a fila da tela de vínculo)', () => {
    const rows = [
      { date: '2026-07-10', tag: 'pequena', registrations: 0, first_deposits: 0, qualified_cpa: 0, rvs: 0, deposit: 0, total_commission: 10 },
      { date: '2026-07-10', tag: 'grande', registrations: 0, first_deposits: 0, qualified_cpa: 0, rvs: 0, deposit: 0, total_commission: 900 },
    ];
    expect(buildPullPayload(rows, new Map()).pending.map((p) => p.tag)).toEqual(['grande', 'pequena']);
  });

  it('soma dias distintos da MESMA tag num só balde de pendência', () => {
    const rows = [
      { date: '2026-07-10', tag: 'orfa', registrations: 0, first_deposits: 0, qualified_cpa: 0, rvs: 0, deposit: 0, total_commission: 100 },
      { date: '2026-07-11', tag: 'orfa', registrations: 0, first_deposits: 0, qualified_cpa: 0, rvs: 0, deposit: 0, total_commission: 50 },
    ];
    const [p] = buildPullPayload(rows, new Map()).pending;
    expect(p).toMatchObject({ tag: 'orfa', days: 2, total_commission: 150 });
  });

  it('sem índice de tags, tudo fica pendente e o agregado segue completo', () => {
    const { rows, attributed, pending } = buildPullPayload(ROWS, null);
    expect(attributed).toBe(0);
    expect(pending).toHaveLength(2);
    expect(rows.every((r) => r.affiliateId === null)).toBe(true);
  });

  it('só grava as métricas canônicas (nada de tag/label vazando p/ o backend)', () => {
    const { rows } = buildPullPayload(ROWS, index);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['affiliateId', 'date', 'deposit', 'first_deposits', 'qualified_cpa', 'registrations', 'rvs', 'total_commission'].sort(),
    );
  });

  it('linha sem data é ignorada', () => {
    const rows = [{ date: '', tag: 'x', registrations: 1, first_deposits: 0, qualified_cpa: 0, rvs: 0, deposit: 0, total_commission: 0 }];
    expect(buildPullPayload(rows, new Map()).rows).toEqual([]);
  });

  it('entrada nula/indefinida não quebra', () => {
    expect(buildPullPayload(null, null).rows).toEqual([]);
    expect(buildPullPayload(undefined, null).rows).toEqual([]);
  });
});

describe('pullWindow', () => {
  it('cobre hoje e ontem por padrão (a casa corrige o dia anterior)', () => {
    expect(pullWindow('2026-08-04')).toEqual({ dateFrom: '2026-08-03', dateTo: '2026-08-04' });
  });

  it('atravessa a virada de mês', () => {
    expect(pullWindow('2026-08-01')).toEqual({ dateFrom: '2026-07-31', dateTo: '2026-08-01' });
  });

  it('janela maior para reprocessar (ex.: 7 dias)', () => {
    expect(pullWindow('2026-08-04', 7)).toEqual({ dateFrom: '2026-07-29', dateTo: '2026-08-04' });
  });

  it('days < 1 vira o próprio dia', () => {
    expect(pullWindow('2026-08-04', 0)).toEqual({ dateFrom: '2026-08-04', dateTo: '2026-08-04' });
  });
});
