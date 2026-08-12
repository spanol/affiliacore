import { describe, it, expect } from 'vitest';
import { buildMediaReportUrl, adaptEsportivaRows, toApiDateTo, ESPORTIVA_API_BASE } from './esportivaPull';
import { pullWindow } from './housePull';

// Amostra REAL da resposta de julho/2026 (valores conferidos contra o painel).
const API_ROWS = [
  { dt: '2026-07-10T00:00:00.000Z', afp: 'infinitw280', visit_count: 40, registration_count: 10, ftd_count: 8, deposit_total: 900, commissions_cpa: 960, commissions_rev_share: 10.5, commissions_total: 970.5 },
  { dt: '2026-07-10T00:00:00.000Z', afp: 'infinitw292', visit_count: 20, registration_count: 6, ftd_count: 4, deposit_total: 400, commissions_cpa: 480, commissions_rev_share: 5, commissions_total: 485 },
  { dt: '2026-07-10T00:00:00.000Z', afp: '', visit_count: 5, registration_count: 1, ftd_count: 0, deposit_total: 0, commissions_cpa: 0, commissions_rev_share: -20, commissions_total: -20 },
  { dt: '2026-07-11T00:00:00.000Z', afp: 'INFINITW280', visit_count: 10, registration_count: 2, ftd_count: 2, deposit_total: 150, commissions_cpa: 240, commissions_rev_share: 1.5, commissions_total: 241.5 },
];

describe('buildMediaReportUrl', () => {
  it('monta o GET do método de AFILIADO no host que responde', () => {
    const url = buildMediaReportUrl('2026-07-01', '2026-07-31');
    expect(url.startsWith(`${ESPORTIVA_API_BASE}/api/af2_media_report_af`)).toBe(true);
    expect(url).toContain('group_by=afp');
    expect(url).toContain('aggregation_period=DAY');
    expect(url).toContain('date_from=2026-07-01');
    expect(url).toContain('date_to=2026-07-31');
  });

  it('aceita host alternativo (a casa já trocou de host uma vez)', () => {
    expect(buildMediaReportUrl('2026-07-01', '2026-07-02', 'https://outro.host')).toContain('https://outro.host/api/');
  });
});

describe('adaptEsportivaRows', () => {
  it('traduz para o shape do import e DERIVA a contagem de CPA pela régua da casa', () => {
    const { rows } = adaptEsportivaRows(API_ROWS, { cpaBase: 120 });
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      date: '2026-07-10',
      tag: 'infinitw280',
      registrations: 10,
      first_deposits: 8,
      qualified_cpa: 8, // 960 / 120 — a API só manda o DINHEIRO
      rvs: 10.5,
      deposit: 900,
      total_commission: 970.5,
    });
  });

  it('sem régua de CPA a contagem fica em 0 — não inventa divisor (ausência ≠ zero)', () => {
    const { rows } = adaptEsportivaRows(API_ROWS, {});
    expect(rows[0].qualified_cpa).toBe(0);
    expect(rows[0].total_commission).toBe(970.5); // o dinheiro continua certo
  });

  it('denuncia régua trocada no meio do período pelo resto da divisão', () => {
    const exata = adaptEsportivaRows(API_ROWS, { cpaBase: 120 });
    expect(exata.cpaRemainder).toBe(0);
    const torta = adaptEsportivaRows([{ dt: '2026-07-10T00:00:00.000Z', afp: 'x', commissions_cpa: 250 }], { cpaBase: 120 });
    expect(torta.cpaRemainder).toBeGreaterThan(0);
  });

  it('normaliza a tag (caixa não distingue ninguém) e ignora linha sem data', () => {
    const { rows, skipped } = adaptEsportivaRows(
      [...API_ROWS, { afp: 'sem-data', commissions_cpa: 120 } as any],
      { cpaBase: 120 },
    );
    expect(rows[3].tag).toBe('infinitw280'); // veio 'INFINITW280'
    expect(skipped).toBe(1);
  });

  it('resposta vazia/inválida não quebra', () => {
    expect(adaptEsportivaRows(null).rows).toEqual([]);
    expect(adaptEsportivaRows(undefined as any).rows).toEqual([]);
  });
});

// buildPullPayload/pullWindow são genéricos (não específicos da Esportiva) —
// cobertos em housePull.test.ts desde a extração pra housePull.ts (08/2026).

describe('toApiDateTo', () => {
  it('soma 1 dia — o date_to que a API espera é EXCLUSIVO', () => {
    expect(toApiDateTo('2026-08-11')).toBe('2026-08-12');
  });

  it('atravessa virada de mês e de ano', () => {
    expect(toApiDateTo('2026-08-31')).toBe('2026-09-01');
    expect(toApiDateTo('2026-12-31')).toBe('2027-01-01');
  });

  it('composto com pullWindow: a URL da API cobre HOJE de verdade', () => {
    const { dateFrom, dateTo } = pullWindow('2026-08-11');
    const url = buildMediaReportUrl(dateFrom, toApiDateTo(dateTo));
    // date_to exclusivo em 12/08 devolve dados de 10 e 11/08 — hoje (11) entra.
    expect(url).toContain('date_from=2026-08-10');
    expect(url).toContain('date_to=2026-08-12');
  });
});
