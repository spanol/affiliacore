import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resolveScopedAffiliateIds } from './scope';

// Property-based da BARREIRA de IDOR do proxy (R4): o invariante de segurança é que
// um não-admin NUNCA recebe, no conjunto `scoped`, um affiliateId fora da própria
// rede ({own} ∪ subs do especial ativo) — independente do que ele peça em
// `?affiliateIds`. Centenas de combinações aleatórias por execução.

// Pool pequeno de ids → força sobreposição real entre o pedido e o escopo permitido.
const idArb = fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H');

describe('resolveScopedAffiliateIds · propriedade de não-vazamento (R4)', () => {
  it('não-admin: todo id no scoped pertence a {own} ∪ subs (nunca um id de fora)', () => {
    fc.assert(
      fc.property(
        idArb,
        fc.array(idArb, { maxLength: 5 }),
        fc.boolean(),
        fc.array(idArb, { maxLength: 8 }),
        (ownId, subs, active, requested) => {
          const special = { active, subAffiliateIds: subs };
          const allowed = new Set<string>([ownId, ...(active ? subs : [])]);
          const res = resolveScopedAffiliateIds({
            role: 'client',
            endpoint: 'results',
            ownAffiliateId: ownId,
            special,
            requestedAffiliateIds: requested,
          });
          if (res.denied) {
            expect(res.scoped).toBeNull(); // negar é sempre seguro
            return;
          }
          for (const idr of res.scoped ?? []) {
            expect(allowed.has(idr)).toBe(true); // NUNCA vaza id fora do escopo
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('não-admin que pede ids: o scoped é a interseção (subconjunto do pedido E do permitido)', () => {
    fc.assert(
      fc.property(idArb, fc.array(idArb, { maxLength: 5 }), fc.array(idArb, { minLength: 1, maxLength: 8 }), (ownId, subs, requested) => {
        const allowed = new Set<string>([ownId, ...subs]);
        const res = resolveScopedAffiliateIds({
          role: 'client',
          endpoint: 'results',
          ownAffiliateId: ownId,
          special: { active: true, subAffiliateIds: subs },
          requestedAffiliateIds: requested,
        });
        if (res.denied) return;
        const reqSet = new Set<string>(requested);
        for (const idr of res.scoped ?? []) {
          expect(allowed.has(idr) && reqSet.has(idr)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('admin nunca é filtrado (scoped null, sem deny) qualquer que seja o pedido', () => {
    fc.assert(
      fc.property(fc.array(idArb, { maxLength: 8 }), (requested) => {
        const res = resolveScopedAffiliateIds({ role: 'admin', endpoint: 'results', requestedAffiliateIds: requested });
        expect(res.denied).toBeUndefined();
        expect(res.scoped).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  it('não-admin em qualquer endpoint != results é sempre negado (403)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s !== 'results'),
        idArb,
        (endpoint, ownId) => {
          const res = resolveScopedAffiliateIds({ role: 'client', endpoint, ownAffiliateId: ownId });
          expect(res.denied?.status).toBe(403);
          expect(res.scoped).toBeNull();
        },
      ),
      { numRuns: 300 },
    );
  });
});
