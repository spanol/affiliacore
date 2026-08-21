import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  adaptHouseTagReport,
  buildTagIndex,
  tagLookup,
  summarizeByTag,
  tagImportTotals,
  attributedRows,
  canImportTagReport,
} from './houseTagImport';
import { parseResultsRows, resolveAffiliates, emptyMetrics, addMetrics, composeLookup, buildAffiliateLookup } from './houseResults';

// Cabeçalho real do export da Esportiva (recortado nas colunas que importam).
const HEADER = ['Período', 'AFP', 'Registros', 'FTDs', 'QFTDS', 'Depósito Valor (R$)', 'Comissão Total', 'RevShare'];
const row = (data: string, afp: string, reg: string, ftd: string, qftd: string, dep: string, com: string, rev: string) =>
  [data, afp, reg, ftd, qftd, dep, com, rev];

describe('normalizeTag', () => {
  it('case e espaço não distinguem tag', () => {
    expect(normalizeTag(' INFINITW02 ')).toBe('infinitw02');
    expect(normalizeTag(null)).toBe('');
  });

  it('o "sem valor" da casa (— / -) é tag VAZIA, não uma tag chamada traço', () => {
    // Senão o resumo mostraria "—" como uma tag pendente, vinculável a um afiliado.
    expect(normalizeTag('—')).toBe('');
    expect(normalizeTag('-')).toBe('');
    expect(normalizeTag('N/A')).toBe('');
  });
});

describe('adaptHouseTagReport', () => {
  it('mapeia o cabeçalho da casa para o canônico', () => {
    const r = adaptHouseTagReport([HEADER, row('30/07/2026', 'infinitw02', '1', '1', '1', 'R$ 80,00', 'R$ 121,05', 'R$ 1,05')]);
    expect(r.ok).toBe(true);
    expect(r.grid[0]).toEqual(['data', 'tag', 'cadastros', 'ftd', 'cpa', 'deposito', 'comissao', 'rev']);
  });

  it('⚠️ QFTDS vira a CONTAGEM de CPA e a coluna CPA (R$) NÃO entra como contagem', () => {
    // É o bug de dinheiro que o adaptador existe para impedir: "CPA" no export é
    // R$ 2.760,00; lê-lo como qualified_cpa daria 2760 CPAs.
    const grid = adaptHouseTagReport([
      ['Período', 'AFP', 'QFTDS', 'CPA', 'Comissão Total'],
      ['30/07/2026', 'infinitw280', '23', 'R$ 2.760,00', 'R$ 2.782,48'],
    ]).grid;
    expect(grid[0]).not.toContain(undefined);
    const parsed = parseResultsRows(grid);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].qualified_cpa).toBe(23); // e não 2760
    expect(parsed.rows[0].total_commission).toBe(2782.48);
  });

  it('recusa arquivo que não é o relatório por tag', () => {
    const r = adaptHouseTagReport([['data', 'email', 'cpa'], ['30/07/2026', 'a@b.com', '2']]);
    expect(r.ok).toBe(false);
    expect(r.detected).toBe(false); // template próprio: a tela cai no parser genérico
    expect(r.error).toMatch(/AFP/i);
  });

  it('⚠️ relatório da casa INCOMPLETO é DETECTADO (a tela não pode cair no genérico)', () => {
    // Tem AFP mas falta QFTDS. No parser genérico, `afp` casaria como tag e a coluna
    // "CPA" (R$) entraria como CONTAGEM — o bug de dinheiro. `detected` faz a tela
    // mostrar o erro em vez de importar calada.
    const r = adaptHouseTagReport([['Período', 'AFP', 'CPA'], ['30/07/2026', 'infinitw02', 'R$ 2.760,00']]);
    expect(r.ok).toBe(false);
    expect(r.detected).toBe(true);
  });

  it('arquivo vazio não quebra', () => {
    expect(adaptHouseTagReport([]).ok).toBe(false);
    expect(adaptHouseTagReport([[]]).ok).toBe(false);
  });
});

describe('buildTagIndex', () => {
  const links = [
    { affiliateId: 'A1', registerUrl: 'https://go.aff.esportiva.bet/urto4foy?afp=infinitw02' },
    { affiliateId: 'A2', registerUrl: 'https://go.aff.esportiva.bet/urto4foy?afp=INFINITW280' },
    { affiliateId: '', registerUrl: 'https://go.aff.esportiva.bet/urto4foy?afp=infinitw999' }, // standby
    { affiliateId: 'A3', registerUrl: 'https://go.aff.esportiva.bet/urto4foy' }, // sem tag
  ];

  it('extrai a tag da registerUrl e ignora link sem dono ou sem tag', () => {
    const idx = buildTagIndex(links, []);
    expect(idx.get('infinitw02')).toEqual({ affiliateId: 'A1', origin: 'link' });
    expect(idx.get('infinitw280')).toEqual({ affiliateId: 'A2', origin: 'link' }); // normalizada
    expect(idx.has('infinitw999')).toBe(false);
    expect(idx.size).toBe(2);
  });

  it('tag EXPLÍCITA do doc vence a URL (link migrado sem ?afp= na query)', () => {
    const idx = buildTagIndex([{ affiliateId: 'A9', registerUrl: 'https://go.aff.esportiva.bet/abc', tag: 'INFINITW45' }], []);
    expect(idx.get('infinitw45')).toEqual({ affiliateId: 'A9', origin: 'link' });
  });

  it('apelido do admin SOBREPÕE o link', () => {
    const idx = buildTagIndex(links, [{ tag: 'InfinitW02', affiliateId: 'OUTRO' }]);
    expect(idx.get('infinitw02')).toEqual({ affiliateId: 'OUTRO', origin: 'alias' });
  });

  it('apelido cobre a variante digitada à mão', () => {
    const idx = buildTagIndex(links, [{ tag: 'infinitw280tem', affiliateId: 'A2' }]);
    expect(idx.get('infinitw280tem')?.affiliateId).toBe('A2');
  });

  it('entradas inválidas não entram', () => {
    expect(buildTagIndex(null, null).size).toBe(0);
    expect(buildTagIndex([], [{ tag: '', affiliateId: 'A1' }]).size).toBe(0);
  });

  // Incidente Infinity 20/08/2026: link emitido com o template CRU manda o
  // literal `{tag}` para a casa. Indexado, ele daria o resultado de TODOS os
  // afiliados daquela casa ao primeiro link da ordem de leitura, e sem cair em
  // pendente ninguém veria. Fora do índice, a linha vira pendência visível.
  it('placeholder cru NÃO vira tag (senão o 1º link rouba o resultado de todos)', () => {
    const quebrados = [
      { affiliateId: 'MICKAEL', registerUrl: 'https://9behi4y9oh.com/?serial=61260&anid={tag}' },
      { affiliateId: 'JOTA', registerUrl: 'https://9behi4y9oh.com/?serial=61260&anid={tag}' },
      { affiliateId: 'LUIZ', registerUrl: 'https://fomento.o18.link/c?o=1&sub_aff_id={ref}' },
    ];
    const idx = buildTagIndex(quebrados, []);
    expect(idx.has('{tag}')).toBe(false);
    expect(idx.has('{ref}')).toBe(false);
    expect(idx.size).toBe(0);
  });

  it('placeholder na tag GRAVADA também não entra, nem por apelido', () => {
    expect(buildTagIndex([{ affiliateId: 'A1', tag: '{tag}', registerUrl: 'https://x/y' }], []).size).toBe(0);
    expect(buildTagIndex([], [{ tag: '{ref}', affiliateId: 'A1' }]).size).toBe(0);
  });

  // A guarda é do placeholder, não da chave: tag legítima com o mesmo miolo segue valendo.
  it('tag legítima que só CONTÉM a palavra "tag" continua indexada', () => {
    const idx = buildTagIndex([{ affiliateId: 'A1', tag: 'tagdojoao', registerUrl: 'https://x/y' }], []);
    expect(idx.get('tagdojoao')).toEqual({ affiliateId: 'A1', origin: 'link' });
  });
});

describe('resolução ponta a ponta (adaptador -> parser -> tag)', () => {
  const grid = [
    HEADER,
    row('30/07/2026', 'infinitw02', '1', '1', '1', 'R$ 80,00', 'R$ 121,05', 'R$ 1,05'),
    row('30/07/2026', 'infinitw280', '5', '4', '4', 'R$ 400,00', 'R$ 480,00', 'R$ 0,00'),
    row('30/07/2026', 'desconhecida', '2', '0', '0', 'R$ 0,00', 'R$ 0,00', 'R$ 0,00'),
    row('30/07/2026', '—', '3', '0', '0', 'R$ 0,00', 'R$ 0,00', '-R$ 144,38'), // sem tag
  ];
  const index = buildTagIndex(
    [
      { affiliateId: 'A1', registerUrl: 'https://x/y?afp=infinitw02' },
      { affiliateId: 'A2', registerUrl: 'https://x/y?afp=infinitw280' },
    ],
    [],
  );

  const parsed = parseResultsRows(adaptHouseTagReport(grid).grid);
  const resolved = resolveAffiliates(parsed.rows, tagLookup(index));

  it('casa as tags conhecidas por afiliado', () => {
    expect(parsed.errors).toEqual([]);
    expect(resolved.rows.filter((r) => r.affiliateId === 'A1')).toHaveLength(1);
    expect(resolved.rows.filter((r) => r.affiliateId === 'A2')).toHaveLength(1);
  });

  it('tag desconhecida fica pendente, com a tag disponível para a tela de vínculo', () => {
    expect(resolved.unresolved).toHaveLength(1);
    expect(resolved.unresolved[0].tag).toBe('desconhecida');
  });

  it('a linha "—" da casa é lida como SEM tag (agregado), não como tag literal', () => {
    const aggregate = resolved.rows.filter((r) => r.affiliateId === null);
    expect(aggregate).toHaveLength(1);
    expect(aggregate[0].rvs).toBe(-144.38);
  });
});

describe('summarizeByTag', () => {
  const index = buildTagIndex([{ affiliateId: 'A1', registerUrl: 'https://x/y?afp=infinitw02' }], []);
  const rows = [
    { tag: 'infinitw02', date: '2026-07-30', qualified_cpa: 1, total_commission: 120 },
    { tag: 'infinitw02', date: '2026-07-29', qualified_cpa: 2, total_commission: 240 },
    { tag: 'infinitw280', date: '2026-07-30', qualified_cpa: 23, total_commission: 2760 },
    { tag: 'infinitw45', date: '2026-07-30', qualified_cpa: 0, total_commission: 0 },
    { tag: '', date: '2026-07-30', qualified_cpa: 0, total_commission: 0 },
  ];

  it('soma por tag e conta os dias distintos', () => {
    const s = summarizeByTag(rows, index);
    const own = s.find((x) => x.tag === 'infinitw02')!;
    expect(own.qualified_cpa).toBe(3);
    expect(own.days).toBe(2);
    expect(own.affiliateId).toBe('A1');
    expect(own.origin).toBe('link');
  });

  it('ordena por DINHEIRO entre as pendentes, e as pendentes vêm antes', () => {
    const s = summarizeByTag(rows, index);
    expect(s.map((x) => x.tag)).toEqual(['infinitw280', 'infinitw45', 'infinitw02', '']);
  });

  it('a linha sem tag vai por último e nunca tem dono', () => {
    const s = summarizeByTag(rows, index);
    expect(s[s.length - 1].tag).toBe('');
    expect(s[s.length - 1].affiliateId).toBeNull();
  });
});

describe('tagImportTotals', () => {
  it('atribuído + não atribuído == total do arquivo (invariante da tela)', () => {
    const index = buildTagIndex([{ affiliateId: 'A1', registerUrl: 'https://x/y?afp=t1' }], []);
    const rows = [
      { tag: 't1', date: '2026-07-01', qualified_cpa: 3, total_commission: 360 },
      { tag: 't2', date: '2026-07-01', qualified_cpa: 5, total_commission: 600 },
      { tag: '', date: '2026-07-01', qualified_cpa: 0, total_commission: 40 },
    ];
    const summaries = summarizeByTag(rows, index);
    const t = tagImportTotals(summaries);
    expect(t.attributed.total_commission).toBe(360);
    expect(t.unattributed.total_commission).toBe(640);
    expect(t.pendingTags).toBe(1); // só a t2; a linha sem tag não é vinculável

    const fileTotal = rows.reduce((acc, r) => addMetrics(acc, r), emptyMetrics());
    expect(t.attributed.total_commission + t.unattributed.total_commission).toBe(fileTotal.total_commission);
    expect(t.attributed.qualified_cpa + t.unattributed.qualified_cpa).toBe(fileTotal.qualified_cpa);
  });

  it('lista vazia devolve zeros', () => {
    expect(tagImportTotals(null)).toEqual({ attributed: emptyMetrics(), unattributed: emptyMetrics(), pendingTags: 0 });
  });
});

describe('attributedRows', () => {
  it('só grava linha COM dono — o resíduo não vira agregado do dia', () => {
    const resolved = [
      { line: 2, date: '2026-07-30', affiliateId: 'A1', ...emptyMetrics() },
      { line: 3, date: '2026-07-30', affiliateId: null, ...emptyMetrics() },
    ];
    expect(attributedRows(resolved)).toHaveLength(1);
    expect(attributedRows(resolved)[0].affiliateId).toBe('A1');
  });
});

describe('canImportTagReport', () => {
  const row = (affiliateId: string | null) => ({ line: 2, date: '2026-07-30', affiliateId, ...emptyMetrics() });

  it('tag pendente NÃO bloqueia: importa o que tem dono e deixa o resto para depois', () => {
    const analysis = { rows: [row('A1')], unresolved: [{ line: 3, token: 'desconhecida', tag: 'desconhecida' }] };
    expect(canImportTagReport(analysis, [])).toBe(true);
  });

  it('erro de FORMATO bloqueia', () => {
    expect(canImportTagReport({ rows: [row('A1')], unresolved: [] }, [{ line: 2 }])).toBe(false);
  });

  it('sem nenhuma linha com dono não há o que importar', () => {
    expect(canImportTagReport({ rows: [row(null)], unresolved: [] }, [])).toBe(false);
    expect(canImportTagReport(null, [])).toBe(false);
  });
});

// A tela compõe os dois cruzamentos; esta é a ordem que ela usa.
describe('lookup composto (tag primeiro, roster por e-mail depois)', () => {
  const index = buildTagIndex([{ affiliateId: 'A1', registerUrl: 'https://x/y?afp=infinitw02' }], []);
  const roster = [{ id: 'A9', name: 'Maria', emails: ['maria@x.com'] }];
  const lookup = composeLookup(tagLookup(index, (id) => (id === 'A1' ? 'João' : undefined)), buildAffiliateLookup(roster));

  it('a tag resolve pelo índice, o e-mail pelo roster', () => {
    expect(lookup('INFINITW02')).toEqual({ id: 'A1', label: 'João' });
    expect(lookup('maria@x.com')).toEqual({ id: 'A9', label: 'Maria' });
    expect(lookup('ninguem')).toBeNull();
  });

  it('a linha "—" da casa não vira tag pendente no resumo', () => {
    const parsed = parseResultsRows(
      adaptHouseTagReport([
        ['Período', 'AFP', 'QFTDS', 'Comissão Total'],
        ['30/07/2026', '—', '0', 'R$ 0,00'],
        ['30/07/2026', 'infinitw02', '1', 'R$ 120,00'],
      ]).grid,
    );
    const summaries = summarizeByTag(parsed.rows, index);
    expect(summaries.map((s) => s.tag)).toEqual(['infinitw02', '']);
    expect(tagImportTotals(summaries).pendingTags).toBe(0);
  });
});
