import { describe, it, expect } from 'vitest';
import {
  parsePtNumber, parseDateToISO, parseResultsCsv, buildAffiliateLookup, resolveAffiliates,
  aggregateByHouse, aggregateByDate, aggregateByAffiliate, aggregateByAffiliateHouse,
  unattributedByHouse, emptyMetrics, addMetrics, StoredManualRow,
} from './houseResults';

describe('parsePtNumber', () => {
  it('pt-BR com milhar e decimal', () => {
    expect(parsePtNumber('R$ 2.400,50')).toBe(2400.5);
    expect(parsePtNumber('1.234.567,89')).toBeCloseTo(1234567.89);
  });
  it('só vírgula = decimal', () => {
    expect(parsePtNumber('12,5')).toBe(12.5);
  });
  it('só ponto em grupos de 3 = milhar (inteiro)', () => {
    expect(parsePtNumber('88.000')).toBe(88000);
    expect(parsePtNumber('1.234')).toBe(1234);
  });
  it('ponto decimal simples', () => {
    expect(parsePtNumber('12.5')).toBe(12.5);
    expect(parsePtNumber('40')).toBe(40);
  });
  it('vazio = 0; inválido = null', () => {
    expect(parsePtNumber('')).toBe(0);
    expect(parsePtNumber('  ')).toBe(0);
    expect(parsePtNumber('abc')).toBeNull();
  });
  it('número direto e negativo', () => {
    expect(parsePtNumber(2400)).toBe(2400);
    expect(parsePtNumber('-30,5')).toBe(-30.5);
  });
});

describe('parseDateToISO', () => {
  it('aceita ISO', () => expect(parseDateToISO('2026-06-01')).toBe('2026-06-01'));
  it('aceita DD/MM/YYYY e DD-MM-YYYY', () => {
    expect(parseDateToISO('01/06/2026')).toBe('2026-06-01');
    expect(parseDateToISO('1-6-2026')).toBe('2026-06-01');
  });
  it('aceita DD/MM/YY (assume 20YY)', () => expect(parseDateToISO('01/06/26')).toBe('2026-06-01'));
  it('rejeita data impossível e lixo', () => {
    expect(parseDateToISO('31/02/2026')).toBeNull();
    expect(parseDateToISO('2026-13-01')).toBeNull();
    expect(parseDateToISO('foo')).toBeNull();
    expect(parseDateToISO('')).toBeNull();
  });
});

describe('parseResultsCsv', () => {
  it('parseia colado do Excel (TAB) com aliases pt-BR e linha agregada (afiliado vazio)', () => {
    const text = [
      'data\tafiliado\tcadastros\tftd\tcpa\trev\tdeposito\tcomissao',
      '2026-06-01\tJoão Silva\t40\t18\t12\t80\t2.400,00\t2400',
      '2026-06-01\t\t50\t20\t14\t90\t3.000,00\t3000', // agregado (sem afiliado)
    ].join('\n');
    const r = parseResultsCsv(text);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: '2026-06-01', affiliate: 'João Silva', registrations: 40, first_deposits: 18, qualified_cpa: 12, rvs: 80, deposit: 2400, total_commission: 2400 });
    expect(r.rows[1].affiliate).toBe(''); // agregado
    expect(r.rows[1].deposit).toBe(3000);
  });

  it('aceita delimitador ; e ,', () => {
    expect(parseResultsCsv('data;cadastros\n2026-06-01;10').rows[0].registrations).toBe(10);
    expect(parseResultsCsv('data,cadastros\n2026-06-01,10').rows[0].registrations).toBe(10);
  });

  it('erro quando falta coluna de data ou de métrica', () => {
    expect(parseResultsCsv('afiliado,cadastros\nx,1').errors[0].message).toMatch(/coluna de data/i);
    expect(parseResultsCsv('data,afiliado\n2026-06-01,x').errors[0].message).toMatch(/métrica/i);
  });

  it('reporta data/número inválidos por linha sem derrubar as válidas', () => {
    const text = 'data,cadastros\n2026-06-01,10\n99/99/9999,5\n2026-06-02,abc';
    const r = parseResultsCsv(text);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].registrations).toBe(10);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0].message).toMatch(/Data inválida/);
    expect(r.errors[1].message).toMatch(/inválido/);
  });
});

describe('resolveAffiliates / buildAffiliateLookup', () => {
  const roster = [
    { id: '123', name: 'João Silva' },
    { id: '456', label: 'Maria Souza' },
  ];
  const lookup = buildAffiliateLookup(roster);

  it('resolve por id exato e por nome (acento/caixa-insensitive)', () => {
    expect(lookup('123')?.id).toBe('123');
    expect(lookup('joao silva')?.id).toBe('123');
    expect(lookup('MARIA SOUZA')?.id).toBe('456');
    expect(lookup('inexistente')).toBeNull();
  });

  it('linha sem afiliado vira agregado (affiliateId null); token desconhecido vai p/ unresolved', () => {
    const parsed = parseResultsCsv('data,afiliado,cadastros\n2026-06-01,João Silva,10\n2026-06-01,,5\n2026-06-01,Fulano,7').rows;
    const res = resolveAffiliates(parsed, lookup);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].affiliateId).toBe('123');
    expect(res.rows[1].affiliateId).toBeNull(); // agregado
    expect(res.unresolved).toEqual([{ line: 4, token: 'Fulano' }]);
  });
});

describe('agregações (merge)', () => {
  const rows: StoredManualRow[] = [
    // dia 01: agregado explícito 100 cad + duas linhas atribuídas (40+30=70) -> 30 não atribuído
    { houseSlug: 'betano', date: '2026-06-01', affiliateId: null, ...m({ registrations: 100, total_commission: 1000 }) },
    { houseSlug: 'betano', date: '2026-06-01', affiliateId: '123', ...m({ registrations: 40, total_commission: 400 }) },
    { houseSlug: 'betano', date: '2026-06-01', affiliateId: '456', ...m({ registrations: 30, total_commission: 300 }) },
    // dia 02: SEM agregado -> agregado = soma das atribuídas (20)
    { houseSlug: 'betano', date: '2026-06-02', affiliateId: '123', ...m({ registrations: 20, total_commission: 200 }) },
  ];

  it('aggregateByHouse usa o agregado explícito (não soma em cima das atribuídas)', () => {
    const byHouse = aggregateByHouse(rows);
    // dia01 = 100 (explícito, não 100+70), dia02 = 20 (soma) -> 120
    expect(byHouse.betano.registrations).toBe(120);
    expect(byHouse.betano.total_commission).toBe(1200);
  });

  it('aggregateByDate soma os agregados por dia', () => {
    const byDate = aggregateByDate(rows);
    expect(byDate['2026-06-01'].registrations).toBe(100);
    expect(byDate['2026-06-02'].registrations).toBe(20);
  });

  it('aggregateByAffiliate soma só as atribuídas', () => {
    const byAff = aggregateByAffiliate(rows);
    expect(byAff['123'].registrations).toBe(60); // 40 + 20
    expect(byAff['456'].registrations).toBe(30);
    expect(byAff['__aggregate__']).toBeUndefined();
  });

  it('aggregateByAffiliateHouse chaveia por afiliado×casa', () => {
    const byAH = aggregateByAffiliateHouse(rows);
    expect(byAH['123|betano'].registrations).toBe(60);
    expect(byAH['456|betano'].total_commission).toBe(300);
  });

  it('unattributedByHouse = agregado − Σ atribuídos (clamp 0)', () => {
    const un = unattributedByHouse(rows);
    // casa total 120, atribuído 40+30+20=90 -> 30 não atribuído
    expect(un.betano.registrations).toBe(30);
    expect(un.betano.total_commission).toBe(300);
  });
});

function m(p: Partial<ReturnType<typeof emptyMetrics>>) {
  return addMetrics(emptyMetrics(), p);
}
