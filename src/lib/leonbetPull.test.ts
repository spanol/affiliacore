import { describe, it, expect } from 'vitest';
import { buildStatisticsUrl, adaptLeonBetRows, LEONBET_API_BASE } from './leonbetPull';
import { buildPullPayload } from './housePull';

// Amostras REAIS do recon (11-12/08/2026): histórico sem tag (formato "< empty >"
// literal da API) + o teste ao vivo com anid=cgverify0811.
const API_ROWS = [
  {
    transaction_date: '2026-08-02T00:00:00.000Z', affiliate_id: 45148, serial_id: 61260, creative_id: 311,
    an_id: '< empty >', anid1: '< empty >',
    deposits: 10.38, revenue_share_profit: 2.778, cpa_profit: 0.0, profit: 2.778,
    deposits_count: 2, registration_count: 0, cpa_qualified: 0, first_deposit_count: 0,
  },
  {
    transaction_date: '2026-07-21T00:00:00.000Z', affiliate_id: 45148, serial_id: 61260, creative_id: 311,
    an_id: '< empty >', anid1: '< empty >',
    deposits: 12.83, revenue_share_profit: 3.423, cpa_profit: 17.0, profit: 20.423,
    deposits_count: 1, registration_count: 1, cpa_qualified: 1, first_deposit_count: 1,
  },
  {
    transaction_date: '2026-08-12T00:00:00.000Z', affiliate_id: 45148, serial_id: 61260, creative_id: 311,
    an_id: 'cgverify0811', anid1: 'cgverify0811',
    deposits: 0, revenue_share_profit: 0, cpa_profit: 0, profit: 0,
    deposits_count: 0, registration_count: 1, cpa_qualified: 0, first_deposit_count: 0,
  },
];

describe('buildStatisticsUrl', () => {
  it('monta o GET com token/start/end/merchant no host da API', () => {
    const url = buildStatisticsUrl('2026-08-01', '2026-08-11', 'd1705512e6de1813b33363453478e374', 1);
    expect(url.startsWith(`${LEONBET_API_BASE}/affiliate_statistics/reports`)).toBe(true);
    expect(url).toContain('token=d1705512e6de1813b33363453478e374');
    expect(url).toContain('start=2026-08-01');
    expect(url).toContain('end=2026-08-11');
    expect(url).toContain('merchant=1');
  });

  it('aceita host alternativo', () => {
    expect(buildStatisticsUrl('2026-08-01', '2026-08-02', 'tok', 1, 'https://outro.host')).toContain('https://outro.host/');
  });
});

describe('adaptLeonBetRows', () => {
  it('traduz para o shape comum — cpa_qualified já é CONTAGEM direta (sem régua)', () => {
    const { rows } = adaptLeonBetRows(API_ROWS);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      date: '2026-07-21',
      tag: '',
      registrations: 1,
      first_deposits: 1,
      qualified_cpa: 1, // veio pronto da API, não dividido de cpa_profit/régua
      rvs: 3.423,
      deposit: 12.83,
      total_commission: 20.423,
      deposit_count: 1,
    });
  });

  it('funil da call 12/08: qtd de depósitos entra; clique fica AUSENTE (a API não manda)', () => {
    const { rows } = adaptLeonBetRows(API_ROWS);
    expect(rows.map((r) => r.deposit_count)).toEqual([2, 1, 0]);
    // ausência ≠ 0: sem visits na fonte, a chave nem existe (a UI mostra "—")
    expect(rows.every((r) => r.visits === undefined)).toBe(true);
  });

  it('o literal "< empty >" da API vira tag VAZIA, não um token de verdade', () => {
    const { rows } = adaptLeonBetRows(API_ROWS);
    expect(rows[0].tag).toBe('');
    expect(rows[1].tag).toBe('');
    // sem o filtro, isso entraria como pendência fantasma que nunca casa
    const { pending } = buildPullPayload(rows, new Map());
    expect(pending.some((p) => p.tag.includes('empty'))).toBe(false);
  });

  it('anid1 populado (teste ao vivo) vira a tag, normalizada como a Esportiva', () => {
    const { rows } = adaptLeonBetRows([...API_ROWS, { ...API_ROWS[2], anid1: 'CGVERIFY0811' }]);
    expect(rows[2].tag).toBe('cgverify0811');
    expect(rows[3].tag).toBe('cgverify0811'); // maiúscula não distingue, igual afp
  });

  it('cai para an_id quando anid1 vem vazio mas an_id não', () => {
    const { rows } = adaptLeonBetRows([{ ...API_ROWS[2], anid1: null, an_id: 'fallback01' }]);
    expect(rows[0].tag).toBe('fallback01');
  });

  it('ignora linha sem data utilizável', () => {
    const { rows, skipped } = adaptLeonBetRows([{ ...API_ROWS[0], transaction_date: undefined }]);
    expect(rows).toEqual([]);
    expect(skipped).toBe(1);
  });

  it('resposta vazia/inválida não quebra', () => {
    expect(adaptLeonBetRows(null).rows).toEqual([]);
    expect(adaptLeonBetRows(undefined as any).rows).toEqual([]);
    expect(adaptLeonBetRows([]).rows).toEqual([]);
  });
});

describe('integração com buildPullPayload (housePull.ts)', () => {
  it('registro tagueado sem depósito ainda entra no agregado do dia', () => {
    const { rows } = adaptLeonBetRows(API_ROWS);
    const { rows: stored } = buildPullPayload(rows, new Map([['cgverify0811', { affiliateId: 'AFF-1' }]]));
    const mine = stored.find((r) => r.affiliateId === 'AFF-1' && r.date === '2026-08-12')!;
    expect(mine).toMatchObject({ registrations: 1, deposit: 0, total_commission: 0 });
  });
});
