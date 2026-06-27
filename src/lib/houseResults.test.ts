import { describe, it, expect } from 'vitest';
import {
  parsePtNumber, parseDateToISO, parseResultsCsv, parseResultsRows, buildAffiliateLookup, resolveAffiliates,
  aggregateByHouse, aggregateByDate, aggregateByAffiliate, aggregateByAffiliateHouse,
  unattributedByHouse, emptyMetrics, addMetrics, deriveManualCommission, StoredManualRow,
  TEMPLATE_HEADERS, TEMPLATE_COLUMNS,
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

describe('parseResultsRows (matriz — caminho Excel)', () => {
  it('parseia uma matriz de células com aliases pt-BR e linha agregada (afiliado vazio)', () => {
    const grid = [
      ['data', 'afiliado', 'cadastros', 'ftd', 'cpa', 'rev', 'deposito', 'comissao'],
      ['2026-06-01', 'João Silva', '40', '18', '12', '80', '2400', '2400'],
      ['2026-06-01', '', '50', '20', '14', '90', '3000', '3000'],
    ];
    const r = parseResultsRows(grid);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: '2026-06-01', affiliate: 'João Silva', registrations: 40, deposit: 2400 });
    expect(r.rows[1].affiliate).toBe(''); // agregado
  });

  it('aceita células numéricas nativas (number) e números pt-BR em texto', () => {
    const grid = [
      ['data', 'cadastros', 'deposito'],
      ['2026-06-01', 40 as unknown as string, 2400.5 as unknown as string],
      ['2026-06-02', '88.000', 'R$ 2.400,50'],
    ];
    const r = parseResultsRows(grid);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ registrations: 40, deposit: 2400.5 });
    expect(r.rows[1]).toMatchObject({ registrations: 88000, deposit: 2400.5 });
  });

  it('pula linhas em branco mas mantém o nº de linha alinhado à planilha', () => {
    const grid = [
      ['data', 'cadastros'],
      [],                              // linha 2 em branco
      ['2026-06-01', '10'],            // linha 3
      ['99/99/9999', '5'],             // linha 4 (data inválida)
    ];
    const r = parseResultsRows(grid);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].line).toBe(3);
    expect(r.errors).toEqual([{ line: 4, raw: '99/99/9999 | 5', message: 'Data inválida: "99/99/9999".' }]);
  });

  it('erro de cabeçalho sem data / sem métrica e matriz vazia', () => {
    expect(parseResultsRows([['afiliado', 'cadastros'], ['x', '1']]).errors[0].message).toMatch(/coluna de data/i);
    expect(parseResultsRows([['data', 'afiliado'], ['2026-06-01', 'x']]).errors[0].message).toMatch(/métrica/i);
    expect(parseResultsRows([]).errors[0].message).toMatch(/Nada para importar/i);
  });

  it('parseResultsCsv e parseResultsRows concordam no mesmo conteúdo', () => {
    const viaText = parseResultsCsv('data,cadastros\n2026-06-01,10').rows;
    const viaGrid = parseResultsRows([['data', 'cadastros'], ['2026-06-01', '10']]).rows;
    expect(viaGrid[0]).toMatchObject({ date: viaText[0].date, registrations: viaText[0].registrations });
  });

  it('fill-down: linha sem data herda a última data válida acima', () => {
    const grid = [
      ['data', 'email', 'cadastros'],
      ['2026-06-01', 'a@x.com', '10'],   // data explícita
      ['', 'b@x.com', '20'],             // herda 2026-06-01
      ['2026-06-02', 'c@x.com', '30'],   // nova data
      ['', 'd@x.com', '40'],             // herda 2026-06-02
    ];
    const r = parseResultsRows(grid);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.date)).toEqual(['2026-06-01', '2026-06-01', '2026-06-02', '2026-06-02']);
  });

  it('1ª linha de dados sem data (nada pra herdar) é erro', () => {
    const r = parseResultsRows([['data', 'cadastros'], ['', '10'], ['2026-06-01', '20']]);
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 2, message: expect.stringMatching(/Data ausente/i) });
  });

  it('lê a coluna email', () => {
    const r = parseResultsRows([['data', 'afiliado', 'email', 'cadastros'], ['2026-06-01', 'João', 'joao@x.com', '5']]);
    expect(r.columns.email).toBe(2);
    expect(r.rows[0]).toMatchObject({ affiliate: 'João', email: 'joao@x.com', registrations: 5 });
  });
});

describe('planilha modelo (constantes)', () => {
  it('o cabeçalho do modelo é reconhecido pelo parser (round-trip)', () => {
    const grid = [TEMPLATE_HEADERS, ['2026-06-01', 'João Silva', 'joao@x.com', '40', '18', '12', '80', '2400', '2400']];
    const r = parseResultsRows(grid);
    expect(r.errors).toEqual([]);
    // todas as colunas do modelo foram mapeadas
    expect(Object.keys(r.columns).sort()).toEqual(TEMPLATE_COLUMNS.map((c) => c.key).sort());
    expect(r.rows[0]).toMatchObject({ date: '2026-06-01', affiliate: 'João Silva', email: 'joao@x.com', registrations: 40, total_commission: 2400 });
  });

  it('o modelo tem data obrigatória e as 6 métricas canônicas', () => {
    expect(TEMPLATE_COLUMNS.find((c) => c.key === 'date')?.required).toBe(true);
    expect(TEMPLATE_COLUMNS.some((c) => c.key === 'email')).toBe(true);
    const metricCount = TEMPLATE_COLUMNS.filter((c) => !['date', 'affiliate', 'email'].includes(c.key)).length;
    expect(metricCount).toBe(6);
  });
});

describe('resolveAffiliates / buildAffiliateLookup', () => {
  const roster = [
    { id: '123', name: 'João Silva', email: 'joao@otg.com' },
    { id: '456', label: 'Maria Souza' },
  ];
  const lookup = buildAffiliateLookup(roster);

  it('resolve por id exato, por nome e por e-mail (acento/caixa-insensitive)', () => {
    expect(lookup('123')?.id).toBe('123');
    expect(lookup('joao silva')?.id).toBe('123');
    expect(lookup('MARIA SOUZA')?.id).toBe('456');
    expect(lookup('JOAO@OTG.COM')?.id).toBe('123'); // e-mail, caixa-insensitive
    expect(lookup('inexistente')).toBeNull();
  });

  it('linha sem afiliado vira agregado (affiliateId null); token desconhecido vai p/ unresolved', () => {
    const parsed = parseResultsCsv('data,afiliado,cadastros\n2026-06-01,João Silva,10\n2026-06-01,,5\n2026-06-01,Fulano,7').rows;
    const res = resolveAffiliates(parsed, lookup);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].affiliateId).toBe('123');
    expect(res.rows[1].affiliateId).toBeNull(); // agregado
    expect(res.unresolved).toEqual([{ line: 4, token: 'Fulano', email: '', name: 'Fulano' }]);
  });

  it('cruza por e-mail mesmo com nome divergente (e-mail tem prioridade)', () => {
    // e-mail de login (users/{uid}.email) aponta pro affiliateId; nome no roster difere do digitado
    const lk = buildAffiliateLookup([{ id: '789', name: 'Bruno Eduardo Santos', email: 'bruno@gmail.com' }]);
    const parsed = parseResultsRows([
      ['data', 'afiliado', 'email', 'cadastros'],
      ['2026-06-01', 'Bruninho (apelido)', 'bruno@gmail.com', '7'],
    ]).rows;
    const res = resolveAffiliates(parsed, lk);
    expect(res.unresolved).toEqual([]);
    expect(res.rows[0].affiliateId).toBe('789');
  });

  it('e-mail tem precedência sobre afiliado; sem e-mail cai no nome; nenhum dos dois = agregado', () => {
    const lk = buildAffiliateLookup([
      { id: 'A', name: 'Ana', email: 'ana@x.com' },
      { id: 'B', name: 'Bia' },
    ]);
    const parsed = parseResultsRows([
      ['data', 'afiliado', 'email', 'cadastros'],
      ['2026-06-01', 'lixo', 'ana@x.com', '1'], // e-mail vence -> A
      ['2026-06-01', 'Bia', '', '2'],            // sem e-mail -> nome -> B
      ['2026-06-01', '', '', '3'],               // nada -> agregado
      ['2026-06-01', 'NaoExiste', 'nao@x.com', '4'], // ambos falham -> unresolved (token = e-mail)
    ]).rows;
    const res = resolveAffiliates(parsed, lk);
    expect(res.rows.map((r) => r.affiliateId)).toEqual(['A', 'B', null]);
    expect(res.unresolved).toEqual([{ line: 5, token: 'nao@x.com', email: 'nao@x.com', name: 'NaoExiste' }]);
  });

  it('buildAffiliateLookup aceita múltiplos e-mails por afiliado (OTG + login)', () => {
    const lk = buildAffiliateLookup([{ id: 'Z', name: 'Zé', email: 'ze@otg.com', emails: ['ze.login@boost.com'] }]);
    expect(lk('ze@otg.com')?.id).toBe('Z');
    expect(lk('ze.login@boost.com')?.id).toBe('Z');
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

describe('deriveManualCommission', () => {
  const row = (p: Partial<StoredManualRow>): StoredManualRow => ({
    ...emptyMetrics(), houseSlug: 'betfair', date: '2026-06-01', affiliateId: null, ...p,
  });
  const rateOf = (slug: string) => (slug === 'betfair' ? { defaultCpa: 150, defaultRev: 25 } : null);

  it('sem coluna comissao (total_commission=0) → deriva de defaultCpa/defaultRev', () => {
    const [r] = deriveManualCommission([row({ qualified_cpa: 2, rvs: 1000 })], rateOf);
    expect(r.total_commission).toBe(2 * 150 + 1000 * 0.25); // 300 + 250 = 550
  });

  it('com comissao importada (>0) → mantém, não deriva', () => {
    const [r] = deriveManualCommission([row({ qualified_cpa: 2, rvs: 1000, total_commission: 999 })], rateOf);
    expect(r.total_commission).toBe(999);
  });

  it('casa sem taxa padrão (rateOf=null) → comissão 0 (não NaN)', () => {
    const [r] = deriveManualCommission([row({ houseSlug: 'desconhecida', qualified_cpa: 5, rvs: 100 })], rateOf);
    expect(r.total_commission).toBe(0);
  });

  it('preserva os demais campos e não muta a entrada', () => {
    const input = row({ qualified_cpa: 1, rvs: 0, registrations: 7, affiliateId: 'a1' });
    const [r] = deriveManualCommission([input], rateOf);
    expect(r.registrations).toBe(7);
    expect(r.affiliateId).toBe('a1');
    expect(input.total_commission).toBe(0); // entrada intacta (map imutável)
  });

  it('derivar por linha e somar bate com a base do lucro por casa', () => {
    const rows = [row({ qualified_cpa: 1, rvs: 100 }), row({ qualified_cpa: 3, rvs: 0 })];
    const total = deriveManualCommission(rows, rateOf).reduce((s, r) => s + r.total_commission, 0);
    expect(total).toBe((1 * 150 + 100 * 0.25) + (3 * 150)); // 175 + 450 = 625
  });
});
