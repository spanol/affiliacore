import { describe, it, expect } from 'vitest';
import { buildAuditSnapshot, MAX_FIELD_CHARS, MAX_TOTAL_CHARS } from './auditSnapshot';

// Doc de casa como o Admin SDK entrega: campos de negócio + timestamps + logo base64.
const casa = () => ({
  slug: 'betnacional',
  name: 'Betnacional',
  brandId: null,
  active: true,
  order: 3,
  dataSource: 'manual',
  integration: 'fomento',
  integrationExternalId: '4821',
  defaultCpa: 45,
  defaultRev: 0,
  cpaCurrency: 'EUR',
  fxMode: 'live',
  fxRate: null,
  issPercent: 2,
  minRedeposit: 20,
  registerUrlTemplate: 'https://betnacional.example/?aff={tag}',
});

describe('buildAuditSnapshot · o que a exclusão não pode perder', () => {
  it('guarda os campos de integração e comissão inteiros, sem inventar nem sumir com nada', () => {
    const snap = buildAuditSnapshot(casa())!;
    expect(snap).toMatchObject(casa());
    expect(Object.keys(snap).sort()).toEqual(Object.keys(casa()).sort());
  });

  it('preserva valores falsos que não são ausência (false, 0, null, string vazia)', () => {
    const snap = buildAuditSnapshot({ active: false, defaultCpa: 0, brandId: null, geo: '' })!;
    expect(snap).toEqual({ active: false, defaultCpa: 0, brandId: null, geo: '' });
  });

  it('desce em objeto aninhado e em array sem achatar', () => {
    const snap = buildAuditSnapshot({ byBrand: { betano: { cpaValue: 110 } }, tags: ['a', 'b'] })!;
    expect(snap.byBrand).toEqual({ betano: { cpaValue: 110 } });
    expect(snap.tags).toEqual(['a', 'b']);
  });
});

describe('buildAuditSnapshot · campo grande (o logo em data URL)', () => {
  const logo = `data:image/png;base64,${'A'.repeat(200_000)}`;

  it('troca o logo de ~200KB por um marcador com tamanho e prefixo', () => {
    const snap = buildAuditSnapshot({ ...casa(), logo })!;
    expect(snap.logo).toEqual({
      truncated: true,
      chars: logo.length,
      preview: logo.slice(0, 64),
    });
    // O prefixo ainda diz que tipo de imagem era.
    expect((snap.logo as any).preview.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('truncar o logo não contamina os outros campos', () => {
    const snap = buildAuditSnapshot({ ...casa(), logo })!;
    expect(snap).toMatchObject(casa());
  });

  it('string logo abaixo do limite passa inteira', () => {
    const curta = 'x'.repeat(MAX_FIELD_CHARS - 1);
    expect(buildAuditSnapshot({ logo: curta })!.logo).toBe(curta);
  });

  it('respeita o limite por campo passado na chamada', () => {
    const snap = buildAuditSnapshot({ content: 'abcdef' }, { maxFieldChars: 3 })!;
    expect(snap.content).toEqual({ truncated: true, chars: 6, preview: 'abcdef' });
  });

  it('muitos campos médios não estouram o teto do doc de auditoria', () => {
    const gordo: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) gordo[`campo${i}`] = 'y'.repeat(MAX_FIELD_CHARS - 1);
    gordo.integrationExternalId = '4821';
    const snap = buildAuditSnapshot(gordo)!;
    expect(JSON.stringify(snap).length).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
    // O campo pequeno que importa na restauração sobrevive ao corte.
    expect(snap.integrationExternalId).toBe('4821');
  });
});

describe('buildAuditSnapshot · timestamps do Firestore', () => {
  it('normaliza o Timestamp com toDate() para ISO', () => {
    const ts = { toDate: () => new Date('2026-08-24T12:00:00.000Z') };
    expect(buildAuditSnapshot({ createdAt: ts })!.createdAt).toBe('2026-08-24T12:00:00.000Z');
  });

  it('normaliza a forma crua {_seconds,_nanoseconds} para ISO', () => {
    const snap = buildAuditSnapshot({ updatedAt: { _seconds: 1_756_000_000, _nanoseconds: 500_000_000 } })!;
    expect(snap.updatedAt).toBe(new Date(1_756_000_000_000 + 500).toISOString());
  });

  it('normaliza Date nativo e ignora data inválida', () => {
    const snap = buildAuditSnapshot({ a: new Date('2026-01-02T03:04:05.000Z'), b: new Date('nao-e-data') })!;
    expect(snap.a).toBe('2026-01-02T03:04:05.000Z');
    expect(snap.b).toBeNull();
  });

  it('o snapshot inteiro sobrevive a um JSON round-trip', () => {
    const snap = buildAuditSnapshot({ ...casa(), createdAt: { toDate: () => new Date('2026-08-24T12:00:00.000Z') } })!;
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});

describe('buildAuditSnapshot · nada a guardar', () => {
  it('doc ausente, vazio ou não-objeto devolve null (a rota não grava snapshot)', () => {
    expect(buildAuditSnapshot(undefined)).toBeNull();
    expect(buildAuditSnapshot(null)).toBeNull();
    expect(buildAuditSnapshot({})).toBeNull();
    expect(buildAuditSnapshot('betnacional')).toBeNull();
    expect(buildAuditSnapshot(42)).toBeNull();
    expect(buildAuditSnapshot([1, 2])).toBeNull();
  });
});

describe('buildAuditSnapshot · valores que o Firestore recusaria', () => {
  it('descarta undefined e função, e zera NaN/Infinity', () => {
    const snap = buildAuditSnapshot({
      name: 'Betnacional', sumiu: undefined, metodo: () => 1, nan: NaN, inf: Infinity,
    })!;
    expect('sumiu' in snap).toBe(false);
    expect('metodo' in snap).toBe(false);
    expect(snap.nan).toBeNull();
    expect(snap.inf).toBeNull();
    expect(snap.name).toBe('Betnacional');
  });

  it('referência cíclica não derruba a gravação do log', () => {
    const doc: any = { name: 'Betnacional' };
    doc.eu = doc;
    const snap = buildAuditSnapshot(doc)!;
    expect(snap.name).toBe('Betnacional');
    expect(() => JSON.stringify(snap)).not.toThrow();
  });
});
