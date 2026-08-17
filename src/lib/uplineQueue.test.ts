import { describe, it, expect } from 'vitest';
import { buildUplineQueue, pricingError, spreadPreview } from './uplineQueue';
import type { PartnershipRequest } from './partnership';
import type { AffiliateConfig } from './commission';

const req = (over: Partial<PartnershipRequest> = {}): PartnershipRequest => ({
  id: 'p1', affiliateId: 'filho', dealId: 'dg', status: 'requested',
  houseId: 'esportiva', operatorName: 'Esportiva Bet', ...over,
});
const houses = [
  { slug: 'esportiva', name: 'Esportiva Bet', brandId: null },
  { slug: 'superbet', name: 'Superbet', brandId: 'sb-brand' },
];
// O gerente recebe 110 na Esportiva. É o caso da call: ele repassa 80 e fica com 30.
const ownConfig: AffiliateConfig = {
  affiliateId: 'gerente', cpaValue: 0, revPercentage: 0,
  byBrand: { esportiva: { cpaValue: 110, revPercentage: 0 } },
};

describe('buildUplineQueue · a fila do gerente', () => {
  it('traz a solicitação do filho DIRETO com a casa e o teto resolvidos', () => {
    const [item] = buildUplineQueue([req()], ['filho'], houses, ownConfig);
    expect(item).toMatchObject({
      brandKey: 'esportiva', houseName: 'Esportiva Bet', capConfigured: true,
    });
    expect(item.cap).toEqual({ cpaValue: 110, revPercentage: 0 });
  });

  // A mesma fronteira que `isDirectDownline` aplica na escrita: mostrar o neto
  // renderia uma fila que a rota de precificação recusa com 403.
  it('NETO e afiliado de fora não entram na fila', () => {
    expect(buildUplineQueue([req({ affiliateId: 'neto' })], ['filho'], houses, ownConfig)).toEqual([]);
    expect(buildUplineQueue([req({ affiliateId: 'estranho' })], ['filho'], houses, ownConfig)).toEqual([]);
  });

  it('só `requested` entra: o resto já saiu da mão dele', () => {
    const outros = (['priced', 'approved', 'rejected', 'discontinued'] as const)
      .map((status) => req({ id: status, status }));
    expect(buildUplineQueue(outros, ['filho'], houses, ownConfig)).toEqual([]);
  });

  it('casa OTG resolve o teto pelo brandId, não pelo slug', () => {
    const cfg: AffiliateConfig = { ...ownConfig, byBrand: { 'sb-brand': { cpaValue: 90, revPercentage: 0 } } };
    const [item] = buildUplineQueue([req({ houseId: 'superbet' })], ['filho'], houses, cfg);
    expect(item.brandKey).toBe('sb-brand');
    expect(item.cap.cpaValue).toBe(90);
  });

  // Ausência ≠ R$ 0: sem taxa própria na casa ele não tem o que repassar, e isso é
  // diferente de "o teto dele é zero". Note que o topo AUSENTE é o que caracteriza a
  // ausência: um topo gravado como 0 é taxa REAL e vale como teto (zero).
  it('gerente sem taxa nenhuma na casa entra na fila com capConfigured false', () => {
    const semTopo = { affiliateId: 'gerente', byBrand: { esportiva: { cpaValue: 110, revPercentage: 0 } } } as any;
    const [item] = buildUplineQueue([req({ houseId: 'superbet' })], ['filho'], houses, semTopo);
    expect(item.capConfigured).toBe(false);
  });

  it('topo gravado como 0 CONTA como configurado (0 é taxa real, e o teto é zero)', () => {
    const [item] = buildUplineQueue([req({ houseId: 'superbet' })], ['filho'], houses, ownConfig);
    expect(item.capConfigured).toBe(true);
    expect(item.cap).toEqual({ cpaValue: 0, revPercentage: 0 });
  });

  it('casa desconhecida não derruba a fila (cai no id da própria request)', () => {
    const [item] = buildUplineQueue([req({ houseId: 'sumiu' })], ['filho'], houses, ownConfig);
    expect(item.brandKey).toBe('sumiu');
    expect(item.houseName).toBe('Esportiva Bet'); // cai no operatorName denormalizado
  });

  it('entradas nulas não lançam', () => {
    expect(buildUplineQueue(null, null, null, null)).toEqual([]);
  });
});

describe('pricingError · espelha as recusas do servidor', () => {
  const item = { cap: { cpaValue: 110, revPercentage: 20 }, capConfigured: true };

  it('dentro do teto passa', () => {
    expect(pricingError(item, { cpaValue: 80, revPercentage: 10 })).toBeNull();
    expect(pricingError(item, { cpaValue: 110, revPercentage: 20 })).toBeNull(); // no limite
  });
  it('acima do teto, em qualquer uma das duas taxas, é barrado', () => {
    expect(pricingError(item, { cpaValue: 120, revPercentage: 0 })).toMatch(/teto/i);
    expect(pricingError(item, { cpaValue: 0, revPercentage: 25 })).toMatch(/teto/i);
  });
  it('negativo é barrado', () => {
    expect(pricingError(item, { cpaValue: -1, revPercentage: 0 })).toMatch(/negativ/i);
  });
  // A ordem importa: com cap zerado a mensagem de teto diria "o teto é R$ 0",
  // jogando no gerente um problema que é da agência resolver.
  it('sem taxa na casa vem a mensagem própria, e ANTES da de teto', () => {
    const semTaxa = { cap: { cpaValue: 0, revPercentage: 0 }, capConfigured: false };
    expect(pricingError(semTaxa, { cpaValue: 50, revPercentage: 0 })).toMatch(/ainda não tem taxa nesta casa/i);
  });
  it('valor não numérico não propaga NaN', () => {
    expect(pricingError(item, { cpaValue: 'abc', revPercentage: null })).toBeNull();
  });
});

describe('spreadPreview · o que sobra para o gerente', () => {
  it('é a diferença entre a taxa dele e a que ele repassa (o caso da call)', () => {
    expect(spreadPreview({ cap: { cpaValue: 110, revPercentage: 20 } }, { cpaValue: 80, revPercentage: 5 }))
      .toEqual({ cpaValue: 30, revPercentage: 15 });
  });
  it('campo vazio conta como zero repassado, não como NaN', () => {
    expect(spreadPreview({ cap: { cpaValue: 110, revPercentage: 0 } }, { cpaValue: '', revPercentage: '' }))
      .toEqual({ cpaValue: 110, revPercentage: 0 });
  });
});
