import { describe, it, expect } from 'vitest';
import { buildAffiliateDailySeries } from './affiliateDailySeries';
import type { AffiliateConfig } from './commission';

// O caso real (Infinity): CPA do contrato R$ 110, casa pagando R$ 280 à agência.
// O gráfico plotava os 280 com o rótulo "Comissão".
describe('buildAffiliateDailySeries', () => {
  const cfg: AffiliateConfig = { affiliateId: 'x', cpaValue: 110, revPercentage: 0 };
  const dia = { id: '2026-08-25', registrations: 1, first_deposits: 1, qualified_cpa: 1, rvs: 0, total_commission: 280 };

  it('troca a receita da casa pela comissão do AFILIADO', () => {
    const [serie] = buildAffiliateDailySeries([dia], cfg);
    expect(serie.total_commission).toBe(110);
  });

  it('preserva as demais métricas do dia (o gráfico também plota cadastros/FTDs)', () => {
    const [serie] = buildAffiliateDailySeries([dia], cfg);
    expect(serie).toMatchObject({ id: '2026-08-25', registrations: 1, first_deposits: 1, qualified_cpa: 1 });
  });

  it('sem config, o dinheiro vai a ZERO — nunca cai de volta no bruto da casa', () => {
    const [serie] = buildAffiliateDailySeries([dia], null);
    expect(serie.total_commission).toBe(0);
  });

  it('REV entra pela fórmula única', () => {
    const comRev: AffiliateConfig = { affiliateId: 'x', cpaValue: 0, revPercentage: 20 };
    const [serie] = buildAffiliateDailySeries([{ ...dia, rvs: 300 }], comRev);
    expect(serie.total_commission).toBe(60);
  });

  it('entrada ausente vira lista vazia', () => {
    expect(buildAffiliateDailySeries(null, cfg)).toEqual([]);
    expect(buildAffiliateDailySeries(undefined, cfg)).toEqual([]);
  });
});
