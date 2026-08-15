// @vitest-environment node
//
// Roda em env NODE (não jsdom): importar server.ts puxa `vite`→esbuild, cujo
// invariante de TextEncoder quebra sob jsdom ("incorrectly false"). Estes testes são
// server-side puros (supertest + mocks) e não precisam de DOM.
/**
 * Testes de integração das rotas do server.ts via supertest (P1.4).
 *
 * Tese (REVIEW-TEST-PLAN.md §0.1): a AUTORIZAÇÃO e o ESCOPO viviam embutidos nas
 * rotas do server.ts (1900 linhas, 0 teste de rota). As funções puras (scope.ts)
 * já têm teste, mas o WIRING — a rota chamar resolveScopedAffiliateIds, forçar os
 * affiliateIds, devolver 403, filtrar linhas — nunca era exercitado. Aqui montamos
 * o app real via `createApp(deps)` com Firestore/Auth/fetch MOCKADOS (sem rede nem
 * Firebase real) e batemos nas rotas de verdade.
 *
 * Cobre: R4 (IDOR do proxy externo), R13 (requireAdmin fail-closed), R16 (escopo do
 * house-results — agregado não vaza), R20 (convite público TTL/single-use + rate
 * limit), R25 (create-user valida o enum de role).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from './server';
import { generateTotpSecret, hashBackupCode, totpCode } from './src/lib/totp';

// Segredo fixo p/ os testes de 2FA — os códigos são gerados de verdade (RFC 6238).
const SECRET = generateTotpSecret();

// =============================================================================
// Doubles em memória — Firestore + Admin Auth. Cobrem só o que as rotas testadas
// usam: collection/doc/get/set + where/get; auth().verifyIdToken/createUser.
// =============================================================================
function makeFirestore(seed: Record<string, Record<string, any>> = {}): any {
  const store = new Map<string, Map<string, any>>();
  for (const [col, docs] of Object.entries(seed)) {
    store.set(col, new Map(Object.entries(docs)));
  }
  let autoId = 0; // p/ doc() sem id (audit_logs/user_notifications)
  const getCol = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const docRef = (col: string, id: string): any => ({
    id,
    __col: col, // usado pelo batch() p/ saber a coleção do ref
    get ref() {
      return this;
    },
    async get() {
      const m = getCol(col);
      const data = m.get(id);
      return { exists: m.has(id), id, data: () => data, ref: docRef(col, id) };
    },
    async set(data: any, opts?: any) {
      const m = getCol(col);
      if (opts?.merge) m.set(id, { ...(m.get(id) || {}), ...data });
      else m.set(id, data);
    },
    async delete() {
      getCol(col).delete(id);
    },
  });
  const query = (
    col: string,
    filters: Array<[string, string, any]> = [],
    order: [string, string] | null = null,
    lim: number | null = null,
  ): any => ({
    where(field: string, op: string, val: any) {
      return query(col, [...filters, [field, op, val]], order, lim);
    },
    orderBy(field: string, dir: string = 'asc') {
      return query(col, filters, [field, dir], lim);
    },
    limit(n?: number) {
      return query(col, filters, order, typeof n === 'number' ? n : lim);
    },
    doc(id?: string) {
      return docRef(col, id ?? `auto-${++autoId}`);
    },
    async add(data: any) {
      const m = getCol(col);
      const id = `auto-${m.size + 1}`;
      m.set(id, data);
      return { id, ref: docRef(col, id) };
    },
    async get() {
      const m = getCol(col);
      let docs = [...m.entries()].map(([id, data]) => ({
        id,
        data: () => data,
        ref: docRef(col, id),
      }));
      for (const [field, op, val] of filters) {
        docs = docs.filter(({ data }) => {
          const v = (data() as any)?.[field];
          if (op === '==') return v === val;
          if (op === '>=') return v >= val;
          if (op === '<=') return v <= val;
          return true;
        });
      }
      if (order) {
        const [field, dir] = order;
        docs = [...docs].sort((a, b) => {
          const av = (a.data() as any)?.[field];
          const bv = (b.data() as any)?.[field];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return dir === 'desc' ? -cmp : cmp;
        });
      }
      if (lim != null) docs = docs.slice(0, lim);
      return { docs, empty: docs.length === 0, size: docs.length, forEach: (cb: any) => docs.forEach(cb) };
    },
  });
  return {
    collection: (name: string) => query(name),
    batch: () => {
      const writes: Array<() => void> = [];
      return {
        set(ref: any, data: any, opts?: any) {
          writes.push(() => {
            const m = getCol(ref.__col);
            if (opts?.merge) m.set(ref.id, { ...(m.get(ref.id) || {}), ...data });
            else m.set(ref.id, data);
          });
        },
        delete(ref: any) {
          writes.push(() => getCol(ref.__col).delete(ref.id));
        },
        async commit() {
          writes.forEach((fn) => fn());
        },
      };
    },
    __store: store,
  };
}

function makeAdminApp(opts: {
  verify?: (token: string) => any;
  createUser?: (props: any) => any;
  getUserByEmail?: (email: string) => any;
  // Custom claims por uid (2FA/TOTP): as rotas leem as atuais e regravam mescladas.
  claims?: Map<string, Record<string, any>>;
} = {}): any {
  const claims = opts.claims ?? new Map<string, Record<string, any>>();
  return {
    __claims: claims,
    auth: () => ({
      // Por default, o token Bearer É o uid (mock simples). requireAuth/requireAdmin
      // resolvem role/affiliateId lendo users/{uid} no Firestore mockado.
      verifyIdToken: async (token: string) =>
        opts.verify ? opts.verify(token) : { uid: token, email: `${token}@test` },
      createUser: async (props: any) =>
        opts.createUser ? opts.createUser(props) : { uid: 'new-uid', ...props },
      getUserByEmail: async (email: string) =>
        opts.getUserByEmail ? opts.getUserByEmail(email) : { uid: 'existing-uid', email },
      getUser: async (uid: string) => ({ uid, customClaims: claims.get(uid) ?? {} }),
      setCustomUserClaims: async (uid: string, next: Record<string, any>) => {
        claims.set(uid, next);
      },
    }),
  };
}

function buildApp(args: { seed?: any; adminAppOpts?: any; fetchImpl?: any } = {}) {
  return createApp({
    adminApp: makeAdminApp(args.adminAppOpts),
    adminDb: makeFirestore(args.seed),
    fetchImpl: args.fetchImpl,
  });
}

// fetch mock que devolve uma Response-like e captura a URL chamada (p/ o proxy).
function captureFetch() {
  const calls: string[] = [];
  const fetchImpl = async (url: any) => {
    const u = String(url);
    calls.push(u);
    // Cotação EUR→BRL das casas manuais (ranking): bid FIXO 5 (≠ FALLBACK_EUR_BRL=6) p/
    // provar que a conversão usa a cotação BUSCADA, não o fallback. Demais URLs (OTG) → vazio.
    if (u.includes('awesomeapi')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ EURBRL: { bid: '5' } }) } as any;
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [] }) } as any;
  };
  return { fetchImpl, calls };
}

// =============================================================================
// R13 — requireAdmin fail-closed (rota admin-only /api/affiliate-statuses)
// =============================================================================
describe('requireAdmin (R13)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client' } },
  };

  it('sem token → 401', async () => {
    await request(buildApp({ seed })).get('/api/affiliate-statuses').expect(401);
  });

  it('token de usuário client → 403', async () => {
    await request(buildApp({ seed }))
      .get('/api/affiliate-statuses')
      .set('Authorization', 'Bearer client-uid')
      .expect(403);
  });

  it('token de admin → 200', async () => {
    await request(buildApp({ seed }))
      .get('/api/affiliate-statuses')
      .set('Authorization', 'Bearer admin-uid')
      .expect(200);
  });
});

// =============================================================================
// Premiações do ranking (ranking_prizes) — CRUD admin com saneamento puro
// =============================================================================
describe('premiações do ranking (/api/prizes)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client' } },
  };

  it('sem token → 401; client → 403 (requireAdmin fail-closed)', async () => {
    await request(buildApp({ seed })).post('/api/prizes').send({ position: 1, title: 'X' }).expect(401);
    await request(buildApp({ seed }))
      .post('/api/prizes')
      .set('Authorization', 'Bearer client-uid')
      .send({ position: 1, title: 'X' })
      .expect(403);
  });

  it('POST válido → 201, grava saneado (trim, active default true)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .post('/api/prizes')
      .set('Authorization', 'Bearer admin-uid')
      .send({ position: '1', title: ' iPhone 16 Pro ', description: ' Top 1 de julho ' })
      .expect(201);
    expect(res.body).toMatchObject({ position: 1, title: 'iPhone 16 Pro', active: true });
    const rows = [...(db.__store.get('ranking_prizes')?.values() ?? [])];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ position: 1, title: 'iPhone 16 Pro', description: 'Top 1 de julho', active: true });
  });

  it('POST com posição inválida ou sem título → 400 e NÃO grava', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/prizes')
      .set('Authorization', 'Bearer admin-uid')
      .send({ position: 0, title: 'X' })
      .expect(400);
    await request(app)
      .post('/api/prizes')
      .set('Authorization', 'Bearer admin-uid')
      .send({ position: 1, title: '   ' })
      .expect(400);
    expect(db.__store.get('ranking_prizes')?.size ?? 0).toBe(0);
  });

  it('PATCH parcial (active:false) faz merge; body vazio → 400', async () => {
    const db = makeFirestore({ ...seed, ranking_prizes: { P1: { position: 1, title: 'iPhone', active: true } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .patch('/api/prizes/P1')
      .set('Authorization', 'Bearer admin-uid')
      .send({ active: false })
      .expect(200);
    expect(db.__store.get('ranking_prizes')?.get('P1')).toMatchObject({ position: 1, title: 'iPhone', active: false });
    await request(app)
      .patch('/api/prizes/P1')
      .set('Authorization', 'Bearer admin-uid')
      .send({})
      .expect(400);
  });

  it('DELETE remove o prêmio', async () => {
    const db = makeFirestore({ ...seed, ranking_prizes: { P1: { position: 1, title: 'iPhone' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .delete('/api/prizes/P1')
      .set('Authorization', 'Bearer admin-uid')
      .expect(200);
    expect(db.__store.get('ranking_prizes')?.has('P1')).toBe(false);
  });
});

// =============================================================================
// Auditoria (Fase 1) — o status do afiliado vira log SERVER-AUTHORITATIVE
// =============================================================================
describe('auditoria — status do afiliado grava audit_logs server-side', () => {
  const seed = { users: { 'admin-uid': { role: 'admin', name: 'Master Boost' } } };

  it('desativar grava log com entidade, ação, autor (do token) e motivo', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .patch('/api/affiliates/AFF-1')
      .set('Authorization', 'Bearer admin-uid')
      .send({ status: 'inactive', reason: 'suspeita de fraude' })
      .expect(200);

    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entityType: 'affiliate',
      entityId: 'AFF-1',
      action: 'affiliate.deactivate',
      actorId: 'admin-uid',
      actorName: 'Master Boost',
      reason: 'suspeita de fraude',
      affiliateId: 'AFF-1', // espelho p/ a tabela legada
    });
  });

  it('ativar usa affiliate.activate e motivo vazio vira null', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .patch('/api/affiliates/AFF-9')
      .set('Authorization', 'Bearer admin-uid')
      .send({ status: 'active' })
      .expect(200);
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs[0]).toMatchObject({ action: 'affiliate.activate', entityId: 'AFF-9', reason: null });
  });

  it('status inválido → 400 e NÃO grava log', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .patch('/api/affiliates/AFF-1')
      .set('Authorization', 'Bearer admin-uid')
      .send({ status: 'nope' })
      .expect(400);
    expect(db.__store.get('audit_logs')?.size ?? 0).toBe(0);
  });
});

// =============================================================================
// Fase 2 — import de resultados: auditoria atômica + notificação ao afiliado
// =============================================================================
describe('import de resultados grava log + notifica o afiliado atribuído', () => {
  const seed = {
    users: {
      'admin-uid': { role: 'admin', name: 'Master' },
      'aff-login-1': { role: 'client', affiliateId: 'AFF-1', name: 'Lucas' },
    },
    houses: { betano: { slug: 'betano', name: 'Betano', dataSource: 'manual' } },
  };

  it('grava resultados + audit house_results.import + 1 notificação de contagens', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .post('/api/house-results/import')
      .set('Authorization', 'Bearer admin-uid')
      .send({
        houseSlug: 'betano',
        rows: [
          { date: '2026-06-20', affiliateId: 'AFF-1', registrations: 3, first_deposits: 1, qualified_cpa: 2 },
          { date: '2026-06-20', affiliateId: null, registrations: 10 }, // agregado → não notifica
        ],
      })
      .expect(200);
    expect(res.body).toMatchObject({ ok: true, imported: 2, notified: 1 });
    expect(db.__store.get('house_results')?.size ?? 0).toBe(2);

    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entityType: 'house_results', entityId: 'betano', action: 'house_results.import', actorId: 'admin-uid' });
    expect(logs[0].metadata).toMatchObject({ imported: 2, attributedAffiliates: 1 });

    const notifs = [...(db.__store.get('user_notifications')?.values() ?? [])];
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ recipientUid: 'aff-login-1', affiliateId: 'AFF-1', type: 'results_updated', houseSlug: 'betano' });
    expect(notifs[0].body).toContain('3 novos cadastros');
    expect(notifs[0].body).not.toContain('R$'); // variante 'counts' (default)
  });

  it('afiliado SEM login vinculado → notified=0, mas o import ainda é auditado', async () => {
    const db = makeFirestore({ users: { 'admin-uid': { role: 'admin' } }, houses: seed.houses });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .post('/api/house-results/import')
      .set('Authorization', 'Bearer admin-uid')
      .send({ houseSlug: 'betano', rows: [{ date: '2026-06-20', affiliateId: 'AFF-1', registrations: 3 }] })
      .expect(200);
    expect(res.body.notified).toBe(0);
    expect(db.__store.get('user_notifications')?.size ?? 0).toBe(0);
    expect(db.__store.get('audit_logs')?.size ?? 0).toBe(1);
  });
});

// =============================================================================
// Fase 3 — comissão (CPA/REV) gravada pelo SERVIDOR com trilha config.update
// =============================================================================
describe('PATCH /api/affiliate-configs/:id — escrita de comissão auditada', () => {
  const seed = {
    users: {
      'admin-uid': { role: 'admin', name: 'Master' },
      'client-uid': { role: 'client', affiliateId: 'AFF-1' },
    },
    affiliates: { 'AFF-1': { id: 'AFF-1', name: 'Lucas' } },
    affiliate_configs: {
      'AFF-1': { affiliateId: 'AFF-1', cpaValue: 200, byBrand: { sb: { cpaValue: 300 } } },
    },
  };

  it('não-admin → 403 e nada é gravado', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .patch('/api/affiliate-configs/AFF-1')
      .set('Authorization', 'Bearer client-uid')
      .send({ cpaValue: 999 })
      .expect(403);
    expect(db.__store.get('affiliate_configs')?.get('AFF-1')?.cpaValue).toBe(200);
    expect(db.__store.get('audit_logs')?.size ?? 0).toBe(0);
  });

  it('grava topo com merge (byBrand preservado) + audit config.update antes→depois', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .patch('/api/affiliate-configs/AFF-1')
      .set('Authorization', 'Bearer admin-uid')
      .send({ cpaValue: 250 })
      .expect(200);
    expect(res.body).toMatchObject({ affiliateId: 'AFF-1', changed: 1 });

    const cfg = db.__store.get('affiliate_configs')?.get('AFF-1');
    expect(cfg.cpaValue).toBe(250);
    expect(cfg.byBrand).toEqual({ sb: { cpaValue: 300 } }); // merge preservou o override

    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entityType: 'affiliate_config', entityId: 'AFF-1', entityLabel: 'Lucas',
      action: 'config.update', actorId: 'admin-uid', actorName: 'Master',
    });
    expect(logs[0].changes).toEqual([{ field: 'cpaValue', before: 200, after: 250 }]);
  });

  it('ausência≠R$0: PATCH só de REV em afiliado sem config NÃO cria cpaValue', async () => {
    const db = makeFirestore({ users: seed.users });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .patch('/api/affiliate-configs/AFF-9')
      .set('Authorization', 'Bearer admin-uid')
      .send({ revPercentage: 12 })
      .expect(200);
    const cfg = db.__store.get('affiliate_configs')?.get('AFF-9');
    expect(cfg.revPercentage).toBe(12);
    expect('cpaValue' in cfg).toBe(false); // nada de 0 fantasma
  });

  it('sem mudança real → grava (updatedAt) mas NÃO loga', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .patch('/api/affiliate-configs/AFF-1')
      .set('Authorization', 'Bearer admin-uid')
      .send({ cpaValue: 200 })
      .expect(200);
    expect(res.body.changed).toBe(0);
    expect(db.__store.get('audit_logs')?.size ?? 0).toBe(0);
  });

  it('body vazio/valor inválido → 400; cpaValue 0 é VÁLIDO (taxa real, ausência≠R$0)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const patchReq = () => request(app).patch('/api/affiliate-configs/AFF-1').set('Authorization', 'Bearer admin-uid');
    await patchReq().send({}).expect(400);
    await patchReq().send({ cpaValue: 'abc' }).expect(400);
    await patchReq().send({ cpaValue: -5 }).expect(400);
    await patchReq().send({ byBrand: { sb: { cpaValue: 'x' } } }).expect(400);
    expect(db.__store.get('audit_logs')?.size ?? 0).toBe(0); // nenhum 400 logou
    await patchReq().send({ cpaValue: 0 }).expect(200);
    expect(db.__store.get('audit_logs')?.size ?? 0).toBe(1); // 200→0 é mudança real
  });

  it('byBrand: campo omitido no override não vira 0 e o diff loga o mapa', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .patch('/api/affiliate-configs/AFF-1')
      .set('Authorization', 'Bearer admin-uid')
      .send({ byBrand: { sb: { cpaValue: 350 }, bf: { revPercentage: 25 } } })
      .expect(200);
    const cfg = db.__store.get('affiliate_configs')?.get('AFF-1');
    expect(cfg.byBrand).toEqual({ sb: { cpaValue: 350 }, bf: { revPercentage: 25 } });
    expect(cfg.cpaValue).toBe(200); // topo preservado pelo merge
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs).toHaveLength(1);
    expect(logs[0].changes[0].field).toBe('byBrand');
  });
});

describe('POST /api/special/sub-config — taxa do sub também vira config.update', () => {
  const seed = {
    users: { 'esp-uid': { role: 'client', affiliateId: 'ESP-1', name: 'Especial' } },
    special_affiliates: { 'ESP-1': { active: true, subAffiliateIds: ['SUB-1'] } },
    affiliate_configs: {
      'ESP-1': { cpaValue: 400, revPercentage: 30 },
      'SUB-1': { affiliateId: 'SUB-1', cpaValue: 100, revPercentage: 10 },
    },
    affiliates: { 'SUB-1': { id: 'SUB-1', name: 'Sub Um' } },
  };

  it('grava a taxa e loga config.update com autor = especial (via metadata)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/special/sub-config')
      .set('Authorization', 'Bearer esp-uid')
      .send({ subAffiliateId: 'SUB-1', cpaValue: 150, revPercentage: 10 })
      .expect(200);
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entityType: 'affiliate_config', entityId: 'SUB-1', entityLabel: 'Sub Um',
      action: 'config.update', actorId: 'esp-uid',
      metadata: { via: 'special/sub-config', specialAffiliateId: 'ESP-1' },
    });
    expect(logs[0].changes).toEqual([{ field: 'cpaValue', before: 100, after: 150 }]);
  });

  it('taxa igual → grava mas NÃO loga (diff vazio)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/special/sub-config')
      .set('Authorization', 'Bearer esp-uid')
      .send({ subAffiliateId: 'SUB-1', cpaValue: 100, revPercentage: 10 })
      .expect(200);
    expect(db.__store.get('audit_logs')?.size ?? 0).toBe(0);
  });

  it('taxa do sub ACIMA do teto do especial ("Limite de repasse") → 400', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const resp = await request(app)
      .post('/api/special/sub-config')
      .set('Authorization', 'Bearer esp-uid')
      .send({ subAffiliateId: 'SUB-1', cpaValue: 401, revPercentage: 10 })
      .expect(400);
    expect(resp.body.error).toContain('teto');
    // Nada gravado: a taxa do sub segue a original.
    expect(db.__store.get('affiliate_configs')?.get('SUB-1')?.cpaValue).toBe(100);
  });
});

// =============================================================================
// Especial com sub-rede DERIVADA da árvore (fromNetwork) — visão N níveis,
// escrita de taxa só no filho DIRETO. Ver src/lib/specialNetwork.ts e §9 do
// REDE-AFILIADOS.md.
// =============================================================================
describe('special_affiliates com fromNetwork — visão N níveis, dinheiro 1 nível', () => {
  // O teste do proxy externo (IDOR) precisa da chave no ambiente — sem ela a
  // rota devolve 500 antes do escopo. Antes vinha implícita do .env da máquina
  // (quebrava em checkout limpo/worktree); agora segue o padrão dos demais
  // testes de proxy: seta e restaura.
  const PREV_KEY = process.env.AFFILIATE_API_KEY;
  beforeAll(() => { process.env.AFFILIATE_API_KEY = 'test-key'; });
  afterAll(() => {
    if (PREV_KEY === undefined) delete process.env.AFFILIATE_API_KEY;
    else process.env.AFFILIATE_API_KEY = PREV_KEY;
  });

  // topo → GER (o gerente) → LID → PONTA
  const seed = {
    users: {
      'ger-uid': { role: 'client', affiliateId: 'GER', name: 'Gerente' },
      'admin-uid': { role: 'admin', name: 'Master' },
      'plain-uid': { role: 'client', affiliateId: 'PONTA', name: 'Ponta' },
    },
    special_affiliates: { GER: { active: true, fromNetwork: true, subAffiliateIds: [] } },
    affiliate_uplines: {
      GER: { uplineId: 'TOPO' },
      LID: { uplineId: 'GER' },
      PONTA: { uplineId: 'LID' },
      OUTRO: { uplineId: 'TOPO' },
    },
    affiliate_configs: {
      GER: { cpaValue: 400, revPercentage: 30 },
      LID: { affiliateId: 'LID', cpaValue: 100, revPercentage: 10 },
      PONTA: { affiliateId: 'PONTA', cpaValue: 50, revPercentage: 5 },
    },
    affiliates: { LID: { id: 'LID', name: 'Lider' }, PONTA: { id: 'PONTA', name: 'Ponta' } },
  };
  const mk = () => {
    const db = makeFirestore(seed);
    return { db, app: createApp({ adminApp: makeAdminApp(), adminDb: db }) };
  };

  it('GET devolve a subárvore INTEIRA do gerente (o doc não guarda lista)', async () => {
    const { app } = mk();
    const resp = await request(app)
      .get('/api/special-affiliates')
      .set('Authorization', 'Bearer ger-uid')
      .expect(200);
    expect(resp.body.specials.GER.fromNetwork).toBe(true);
    expect([...resp.body.specials.GER.subAffiliateIds].sort()).toEqual(['LID', 'PONTA']);
    // ...e a tela recebe, separado, quem ele pode REPASSAR (só o filho direto).
    expect(resp.body.specials.GER.directSubAffiliateIds).toEqual(['LID']);
  });

  it('GET não vaza o organograma: o gerente não vê o ramo irmão nem quem está acima', async () => {
    const { app } = mk();
    const resp = await request(app)
      .get('/api/special-affiliates')
      .set('Authorization', 'Bearer ger-uid')
      .expect(200);
    const visto = resp.body.specials.GER.subAffiliateIds as string[];
    expect(visto).not.toContain('TOPO');
    expect(visto).not.toContain('OUTRO');
  });

  it('GET: afiliado comum (não especial) recebe mapa VAZIO', async () => {
    const { app } = mk();
    const resp = await request(app)
      .get('/api/special-affiliates')
      .set('Authorization', 'Bearer plain-uid')
      .expect(200);
    expect(resp.body.specials).toEqual({});
  });

  it('GET: admin recebe o mapa inteiro, já resolvido', async () => {
    const { app } = mk();
    const resp = await request(app)
      .get('/api/special-affiliates')
      .set('Authorization', 'Bearer admin-uid')
      .expect(200);
    expect([...resp.body.specials.GER.subAffiliateIds].sort()).toEqual(['LID', 'PONTA']);
  });

  it('define a taxa do FILHO DIRETO → 200', async () => {
    const { db, app } = mk();
    await request(app)
      .post('/api/special/sub-config')
      .set('Authorization', 'Bearer ger-uid')
      .send({ subAffiliateId: 'LID', cpaValue: 150, revPercentage: 10 })
      .expect(200);
    expect(db.__store.get('affiliate_configs')?.get('LID')?.cpaValue).toBe(150);
  });

  it('define a taxa do NETO → 403, mesmo ele estando na sub-rede que o gerente VÊ', async () => {
    const { db, app } = mk();
    const resp = await request(app)
      .post('/api/special/sub-config')
      .set('Authorization', 'Bearer ger-uid')
      .send({ subAffiliateId: 'PONTA', cpaValue: 999, revPercentage: 10 })
      .expect(403);
    expect(resp.body.error).toContain('direto');
    // O spread do gerente do meio (LID) fica intacto.
    expect(db.__store.get('affiliate_configs')?.get('PONTA')?.cpaValue).toBe(50);
  });

  it('POST fromNetwork grava a FLAG e lista vazia, e responde com a sub-rede efetiva', async () => {
    const db = makeFirestore({
      users: { 'admin-uid': { role: 'admin' }, 'ger-uid': { role: 'client', affiliateId: 'GER' } },
      affiliate_uplines: seed.affiliate_uplines,
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const resp = await request(app)
      .post('/api/special-affiliates')
      .set('Authorization', 'Bearer admin-uid')
      // manda uma lista à mão junto: o modo derivado tem que IGNORAR
      .send({ affiliateId: 'GER', active: true, fromNetwork: true, subAffiliateIds: ['X9'] })
      .expect(200);
    const doc = db.__store.get('special_affiliates')?.get('GER');
    expect(doc.fromNetwork).toBe(true);
    expect(doc.subAffiliateIds).toEqual([]); // lista congelada rotaria a cada aresta nova
    expect([...resp.body.subAffiliateIds].sort()).toEqual(['LID', 'PONTA']);
    // e o papel foi espelhado no login vinculado
    expect(db.__store.get('users')?.get('ger-uid')?.isSpecial).toBe(true);
  });

  it('o proxy externo escopa pela subárvore derivada (IDOR)', async () => {
    const { fetchImpl, calls } = captureFetch();
    const app = buildApp({ seed, fetchImpl });
    await request(app)
      .get('/api/external/results?affiliateIds=GER,LID,PONTA,OUTRO')
      .set('Authorization', 'Bearer ger-uid')
      .expect(200);
    const sent = decodeURIComponent(calls[0] ?? '');
    expect(sent).toContain('GER');
    expect(sent).toContain('PONTA'); // neto: dentro do escopo de LEITURA
    expect(sent).not.toContain('OUTRO'); // ramo irmão: fora
  });
});

// =============================================================================
// Rede de afiliados — aresta filho→upline (affiliate_uplines), admin-only
// =============================================================================
describe('/api/affiliate-uplines — rede de afiliados (N níveis)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client', affiliateId: 'A' } },
    affiliate_uplines: { B: { affiliateId: 'B', uplineId: 'A' } },
  };

  it('GET exige admin (afiliado comum não lê a estrutura comercial da rede)', async () => {
    await request(buildApp({ seed })).get('/api/affiliate-uplines').expect(401);
    await request(buildApp({ seed }))
      .get('/api/affiliate-uplines')
      .set('Authorization', 'Bearer client-uid')
      .expect(403);
  });

  it('GET devolve o mapa filho→upline (ignora doc com upline nulo)', async () => {
    const db = makeFirestore({ ...seed, affiliate_uplines: { ...seed.affiliate_uplines, C: { uplineId: null } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const resp = await request(app).get('/api/affiliate-uplines').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(resp.body.uplines).toEqual({ B: 'A' });
  });

  it('POST grava a aresta', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'C', uplineId: 'B' })
      .expect(200);
    expect(db.__store.get('affiliate_uplines')?.get('C')).toMatchObject({ affiliateId: 'C', uplineId: 'B' });
  });

  it('POST com uplineId vazio SOLTA o afiliado (vira topo de estrutura)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const resp = await request(app)
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'B', uplineId: '' })
      .expect(200);
    expect(resp.body).toEqual({ affiliateId: 'B', uplineId: null });
    expect(db.__store.get('affiliate_uplines')?.get('B')?.uplineId).toBeNull();
  });

  it('POST recusa auto-upline', async () => {
    const resp = await request(buildApp({ seed }))
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'A', uplineId: 'A' })
      .expect(400);
    expect(resp.body.error).toContain('si mesmo');
  });

  it('POST recusa CICLO (A→B→A) e não grava nada', async () => {
    const db = makeFirestore(seed); // já existe B→A
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const resp = await request(app)
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'A', uplineId: 'B' })
      .expect(400);
    expect(resp.body.error).toContain('ciclo');
    expect(db.__store.get('affiliate_uplines')?.has('A')).toBe(false);
  });

  it('POST recusa ciclo INDIRETO de 3 níveis (A→B→C→A)', async () => {
    const db = makeFirestore({ ...seed, affiliate_uplines: { B: { uplineId: 'A' }, C: { uplineId: 'B' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'A', uplineId: 'C' })
      .expect(400);
    expect(db.__store.get('affiliate_uplines')?.has('A')).toBe(false);
  });

  // Mudar upline MUDA DINHEIRO (o repasse passa a sair da taxa do TOPO da
  // estrutura) → tem que deixar trilha, no mesmo batch da escrita.
  it('POST loga network.set_upline com antes→depois do uplineId, no MESMO batch', async () => {
    const db = makeFirestore({ ...seed, affiliates: { C: { id: 'C', name: 'Carla Sub' }, B: { id: 'B', name: 'Bruno Upline' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'C', uplineId: 'B' })
      .expect(200);

    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entityType: 'affiliate_network',
      entityId: 'C',
      entityLabel: 'Carla Sub',
      action: 'network.set_upline',
      actorId: 'admin-uid',
    });
    // NOME primeiro (é o que a /auditoria mostra), id logo atrás (verdade auditável).
    expect(logs[0].changes).toEqual([
      { field: 'upline', before: null, after: 'Bruno Upline' },
      { field: 'uplineId', before: null, after: 'B' },
    ]);
    // Atômico: a aresta e a trilha saíram do mesmo commit.
    expect(db.__store.get('affiliate_uplines')?.get('C')?.uplineId).toBe('B');
  });

  it('POST loga a REMOÇÃO do vínculo (network.clear_upline) — também é mudança de dinheiro', async () => {
    const db = makeFirestore({ ...seed, affiliates: { B: { id: 'B', name: 'Bruno' }, A: { id: 'A', name: 'Ana Topo' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'B', uplineId: null })
      .expect(200);

    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entityType: 'affiliate_network',
      entityId: 'B',
      entityLabel: 'Bruno',
      action: 'network.clear_upline',
    });
    expect(logs[0].changes).toEqual([
      { field: 'upline', before: 'Ana Topo', after: null },
      { field: 'uplineId', before: 'A', after: null },
    ]);
  });

  it('POST que troca de upline registra o anterior no antes→depois', async () => {
    const db = makeFirestore({ ...seed, affiliate_uplines: { C: { affiliateId: 'C', uplineId: 'A' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'C', uplineId: 'B' })
      .expect(200);
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs[0].changes).toEqual([
      { field: 'upline', before: null, after: null }, // sem mirror `affiliates` no seed
      { field: 'uplineId', before: 'A', after: 'B' },
    ]);
  });

  it('re-gravar o MESMO upline grava mas NÃO loga (diff vazio, não polui a trilha)', async () => {
    const db = makeFirestore(seed); // B já aponta p/ A
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'B', uplineId: 'A' })
      .expect(200);
    expect(db.__store.get('audit_logs')?.size ?? 0).toBe(0);
  });

  it('POST recusado (ciclo) NÃO deixa trilha — nada mudou', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'A', uplineId: 'B' })
      .expect(400);
    expect(db.__store.get('audit_logs')?.size ?? 0).toBe(0);
  });

  it('POST sem affiliateId → 400; POST de não-admin → 403', async () => {
    await request(buildApp({ seed }))
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer admin-uid')
      .send({ uplineId: 'A' })
      .expect(400);
    await request(buildApp({ seed }))
      .post('/api/affiliate-uplines')
      .set('Authorization', 'Bearer client-uid')
      .send({ affiliateId: 'C', uplineId: 'A' })
      .expect(403);
  });
});

// =============================================================================
// Apelido de TAG -> afiliado (/api/tag-aliases) — import do relatório da CASA.
// A casa atribui pela tag do link (?afp=), não por e-mail: este é o vínculo que o
// admin salva para a tag que nenhum link nosso cobre.
// =============================================================================
// Captação: as duas portas de entrada (auto-cadastro no /register e lead do
// formulário público) nunca tiveram leitor no app. O dado é PII, então a rota é
// admin-only e é ela que faz a triagem — nunca o cliente lendo a coleção.
describe('/api/registration-requests (admin-only)', () => {
  const seed = {
    users: {
      'admin-uid': { role: 'admin', name: 'Agência' },
      'client-uid': { role: 'client', affiliateId: 'AFF-1', name: 'Já vinculado' },
      'novo-uid': { role: 'client', name: 'Guilherme', email: 'g@x.com', phone: '11999', source: 'vitrine-affiliacore' },
      'arquivado-uid': { role: 'client', name: 'Sumiu', email: 's@x.com', requestStatus: 'archived' },
    },
    contacts: {
      lead1: { name: 'Ana', email: 'a@x.com', presentation: 'Trabalho com tráfego', affiliateExperience: 'sim' },
    },
  };
  const logsOf = (db: any, action: string) =>
    [...(db.__store.get('audit_logs')?.values() ?? [])].filter((l: any) => l.action === action);

  it('lista quem NÃO tem afiliado + os leads, e nunca o admin nem quem já é afiliado', async () => {
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(seed) });
    const res = await request(app)
      .get('/api/registration-requests')
      .set('Authorization', 'Bearer admin-uid')
      .expect(200);
    const byId = Object.fromEntries(res.body.requests.map((r: any) => [r.id, r]));
    expect(Object.keys(byId).sort()).toEqual(['arquivado-uid', 'lead1', 'novo-uid']);
    expect(byId['novo-uid']).toMatchObject({ kind: 'signup', name: 'Guilherme', source: 'vitrine-affiliacore', status: 'pending' });
    expect(byId['lead1']).toMatchObject({ kind: 'lead', experienced: true, status: 'pending' });
    // O arquivado VOLTA na lista (com status) — a tela decide se mostra; some do
    // servidor seria perder a chance de desarquivar.
    expect(byId['arquivado-uid'].status).toBe('archived');
  });

  it('arquivar grava o status e a trilha, sem tocar em papel ou vínculo', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/registration-requests/archive')
      .set('Authorization', 'Bearer admin-uid')
      .send({ kind: 'signup', id: 'novo-uid' })
      .expect(200);
    const doc = db.__store.get('users')?.get('novo-uid');
    expect(doc).toMatchObject({ requestStatus: 'archived', role: 'client' });
    expect(doc.affiliateId).toBeUndefined();
    expect(logsOf(db, 'request.archive')[0]).toMatchObject({
      entityType: 'user', entityId: 'novo-uid', entityLabel: 'Guilherme',
      changes: [{ field: 'requestStatus', before: 'pending', after: 'archived' }],
    });
  });

  it('desarquivar volta o lead p/ a fila (archived:false)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/registration-requests/archive')
      .set('Authorization', 'Bearer admin-uid')
      .send({ kind: 'lead', id: 'lead1', archived: false })
      .expect(200);
    expect(db.__store.get('contacts')?.get('lead1')).toMatchObject({ requestStatus: 'pending' });
    expect(logsOf(db, 'request.restore')).toHaveLength(1);
  });

  it('arquivar login JÁ vinculado → 409 (sinal de id trocado, não é da fila)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/registration-requests/archive')
      .set('Authorization', 'Bearer admin-uid')
      .send({ kind: 'signup', id: 'client-uid' })
      .expect(409);
    expect(db.__store.get('users')?.get('client-uid')?.requestStatus).toBeUndefined();
  });

  it('kind inválido → 400; id inexistente → 404', async () => {
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(seed) });
    const post = (body: any) =>
      request(app).post('/api/registration-requests/archive').set('Authorization', 'Bearer admin-uid').send(body);
    await post({ kind: 'outro', id: 'novo-uid' }).expect(400);
    await post({ kind: 'signup' }).expect(400);
    await post({ kind: 'signup', id: 'naoexiste' }).expect(404);
  });

  it('não-admin → 403 nas duas rotas (é PII de candidato)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).get('/api/registration-requests').set('Authorization', 'Bearer client-uid').expect(403);
    await request(app)
      .post('/api/registration-requests/archive')
      .set('Authorization', 'Bearer client-uid')
      .send({ kind: 'signup', id: 'novo-uid' })
      .expect(403);
    expect(db.__store.get('users')?.get('novo-uid')?.requestStatus).toBeUndefined();
  });
});

// Indicação de afiliado pelo ESPECIAL (call Infinity 12/08 · item 5): o gerente
// indica, o master confirma em /solicitacoes. PII server-only (rule fechada) —
// o escopo (admin = tudo; especial = as próprias) vive NA ROTA.
describe('/api/affiliate-referrals (indicação do gerente)', () => {
  const seed = {
    users: {
      'admin-uid': { role: 'admin', name: 'Agência' },
      'esp-uid': { role: 'client', affiliateId: 'AFF-ESP', isSpecial: true },
      'sub-uid': { role: 'client', affiliateId: 'AFF-1' },
      'inativo-uid': { role: 'client', affiliateId: 'AFF-OFF' },
    },
    special_affiliates: {
      'AFF-ESP': { active: true },
      'AFF-OFF': { active: false }, // registro existe mas NÃO está ativo
    },
    affiliates: { 'AFF-ESP': { name: 'Gerente Um' } },
  };

  it('especial cria a indicação com o carimbo de quem indicou (nome do mirror)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-referrals')
      .set('Authorization', 'Bearer esp-uid')
      .send({ name: 'Novo Sub', email: 'Novo@X.com', phone: '11 98888', note: 'da minha equipe' })
      .expect(200);
    const docs = [...(db.__store.get('affiliate_referrals')?.values() ?? [])];
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      name: 'Novo Sub',
      email: 'novo@x.com', // normalizado
      referrerAffiliateId: 'AFF-ESP',
      referrerName: 'Gerente Um',
      requestStatus: 'pending',
    });
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])].filter((l: any) => l.action === 'referral.create');
    expect(logs).toHaveLength(1);
  });

  it('sub comum e especial INATIVO → 403; sem e-mail válido → 400 (o convite depende dele)', async () => {
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(seed) });
    await request(app)
      .post('/api/affiliate-referrals')
      .set('Authorization', 'Bearer sub-uid')
      .send({ name: 'X', email: 'x@x.com' })
      .expect(403);
    await request(app)
      .post('/api/affiliate-referrals')
      .set('Authorization', 'Bearer inativo-uid')
      .send({ name: 'X', email: 'x@x.com' })
      .expect(403);
    await request(app)
      .post('/api/affiliate-referrals')
      .set('Authorization', 'Bearer esp-uid')
      .send({ name: 'Sem Email', email: 'nao-e-email' })
      .expect(400);
  });

  it('GET escopa: especial vê SÓ as próprias; admin vê todas', async () => {
    const db = makeFirestore({
      ...seed,
      affiliate_referrals: {
        r1: { name: 'Meu', email: 'a@x.com', referrerAffiliateId: 'AFF-ESP' },
        r2: { name: 'De outro', email: 'b@x.com', referrerAffiliateId: 'AFF-OUTRO' },
      },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const mine = await request(app).get('/api/affiliate-referrals').set('Authorization', 'Bearer esp-uid').expect(200);
    expect(mine.body.referrals.map((r: any) => r.id)).toEqual(['r1']);
    const all = await request(app).get('/api/affiliate-referrals').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(all.body.referrals.map((r: any) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('a indicação entra na fila do /api/registration-requests como kind "referral" e arquiva por lá', async () => {
    const db = makeFirestore({
      ...seed,
      affiliate_referrals: {
        r1: { name: 'Indicado', email: 'i@x.com', referrerAffiliateId: 'AFF-ESP', referrerName: 'Gerente Um' },
      },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app).get('/api/registration-requests').set('Authorization', 'Bearer admin-uid').expect(200);
    const ref = res.body.requests.find((r: any) => r.kind === 'referral');
    expect(ref).toMatchObject({ id: 'r1', name: 'Indicado', referrerAffiliateId: 'AFF-ESP', referrerName: 'Gerente Um', status: 'pending' });
    await request(app)
      .post('/api/registration-requests/archive')
      .set('Authorization', 'Bearer admin-uid')
      .send({ kind: 'referral', id: 'r1' })
      .expect(200);
    expect(db.__store.get('affiliate_referrals')?.get('r1')).toMatchObject({ requestStatus: 'archived' });
  });
});

describe('/api/tag-aliases (admin-only)', () => {
  const seed = { users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client', affiliateId: 'AFF-1' } } };
  const logsOf = (db: any, action: string) =>
    [...(db.__store.get('audit_logs')?.values() ?? [])].filter((l: any) => l.action === action);

  it('POST normaliza a tag (doc id) e grava a trilha affiliate.link_tag', async () => {
    const db = makeFirestore({ ...seed, affiliates: { 'AFF-7': { name: 'Maurício' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/tag-aliases')
      .set('Authorization', 'Bearer admin-uid')
      .send({ tag: '  InfinitW280TEM ', affiliateId: 'AFF-7', houseSlug: 'esportiva' })
      .expect(200);

    const doc = db.__store.get('affiliate_tag_aliases')?.get('infinitw280tem');
    expect(doc).toMatchObject({ tag: 'infinitw280tem', affiliateId: 'AFF-7', houseSlug: 'esportiva' });
    const logs = logsOf(db, 'affiliate.link_tag');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entityType: 'affiliate', entityId: 'AFF-7', entityLabel: 'Maurício',
      metadata: { tag: 'infinitw280tem', house: 'esportiva' },
    });
  });

  it('GET lista os apelidos; DELETE desfaz e loga affiliate.unlink_tag', async () => {
    const db = makeFirestore({ ...seed, affiliate_tag_aliases: { infinitw02: { tag: 'infinitw02', affiliateId: 'AFF-2' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const list = await request(app).get('/api/tag-aliases').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(list.body.aliases).toEqual([{ tag: 'infinitw02', affiliateId: 'AFF-2', houseSlug: null }]);

    await request(app).delete('/api/tag-aliases/INFINITW02').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(db.__store.get('affiliate_tag_aliases')?.has('infinitw02')).toBe(false);
    expect(logsOf(db, 'affiliate.unlink_tag')[0]).toMatchObject({ entityId: 'AFF-2', metadata: { tag: 'infinitw02' } });
  });

  it('tag/afiliado ausente → 400; apelido inexistente → 404', async () => {
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(seed) });
    await request(app).post('/api/tag-aliases').set('Authorization', 'Bearer admin-uid').send({ tag: 'x' }).expect(400);
    await request(app).post('/api/tag-aliases').set('Authorization', 'Bearer admin-uid').send({ affiliateId: 'A' }).expect(400);
    // "—" (o "sem valor" da casa) não é tag: normaliza p/ vazio e cai no 400.
    await request(app).post('/api/tag-aliases').set('Authorization', 'Bearer admin-uid').send({ tag: '—', affiliateId: 'A' }).expect(400);
    await request(app).delete('/api/tag-aliases/naoexiste').set('Authorization', 'Bearer admin-uid').expect(404);
  });

  it('não-admin → 403 nas três rotas (o vínculo define de quem é o dinheiro)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).get('/api/tag-aliases').set('Authorization', 'Bearer client-uid').expect(403);
    await request(app).post('/api/tag-aliases').set('Authorization', 'Bearer client-uid').send({ tag: 't', affiliateId: 'AFF-1' }).expect(403);
    await request(app).delete('/api/tag-aliases/t').set('Authorization', 'Bearer client-uid').expect(403);
    expect(db.__store.get('affiliate_tag_aliases')?.size ?? 0).toBe(0);
  });
});

// =============================================================================
// R4 — IDOR no proxy externo /api/external/:endpoint
// =============================================================================
describe('proxy externo / IDOR (R4)', () => {
  const seed = {
    users: {
      'admin-uid': { role: 'admin' },
      'aff1-uid': { role: 'client', affiliateId: 'AFF-1' },
      'noaff-uid': { role: 'client' },
    },
  };

  beforeAll(() => {
    process.env.AFFILIATE_API_KEY = 'test-key';
  });
  afterAll(() => {
    delete process.env.AFFILIATE_API_KEY;
  });

  it('client em endpoint != results → 403 e NÃO chama o upstream', async () => {
    const { fetchImpl, calls } = captureFetch();
    await request(buildApp({ seed, fetchImpl }))
      .get('/api/external/affiliates')
      .set('Authorization', 'Bearer aff1-uid')
      .expect(403);
    expect(calls).toHaveLength(0);
  });

  it('client em results SEM affiliateIds → escopa ao próprio id no upstream', async () => {
    const { fetchImpl, calls } = captureFetch();
    await request(buildApp({ seed, fetchImpl }))
      .get('/api/external/results')
      .set('Authorization', 'Bearer aff1-uid')
      .expect(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('affiliateIds=AFF-1');
  });

  it('client pedindo id de OUTRO afiliado → 403 (interseção vazia) e sem upstream', async () => {
    const { fetchImpl, calls } = captureFetch();
    await request(buildApp({ seed, fetchImpl }))
      .get('/api/external/results?affiliateIds=AFF-999')
      .set('Authorization', 'Bearer aff1-uid')
      .expect(403);
    expect(calls).toHaveLength(0);
  });

  it('client sem affiliateId vinculado → 403', async () => {
    await request(buildApp({ seed }))
      .get('/api/external/results')
      .set('Authorization', 'Bearer noaff-uid')
      .expect(403);
  });

  it('admin passa sem escopo — múltiplos affiliateIds preservados no upstream', async () => {
    const { fetchImpl, calls } = captureFetch();
    await request(buildApp({ seed, fetchImpl }))
      .get('/api/external/results?affiliateIds=A&affiliateIds=B')
      .set('Authorization', 'Bearer admin-uid')
      .expect(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('affiliateIds=A');
    expect(calls[0]).toContain('affiliateIds=B');
  });
});

// =============================================================================
// R16 — escopo do house-results: o agregado (affiliateId null) não vaza
// =============================================================================
describe('house-results scope (R16)', () => {
  // AFF-1 é ESPECIAL ativo com a sub-rede [AFF-2]; AFF-3 é afiliado comum.
  const seed = {
    users: {
      'admin-uid': { role: 'admin' },
      'aff1-uid': { role: 'client', affiliateId: 'AFF-1' },
      'aff3-uid': { role: 'client', affiliateId: 'AFF-3' },
    },
    special_affiliates: {
      'AFF-1': { active: true, subAffiliateIds: ['AFF-2'] },
    },
    house_results: {
      r1: { houseSlug: 'sb', date: '2026-06-01', affiliateId: 'AFF-1' },
      r2: { houseSlug: 'sb', date: '2026-06-01', affiliateId: 'AFF-2' },
      r3: { houseSlug: 'sb', date: '2026-06-01', affiliateId: 'AFF-3' },
      agg: { houseSlug: 'sb', date: '2026-06-01', affiliateId: null },
    },
  };

  it('afiliado comum vê só as próprias linhas — nunca a de outro nem a agregada (null)', async () => {
    const res = await request(buildApp({ seed }))
      .get('/api/house-results')
      .set('Authorization', 'Bearer aff3-uid')
      .expect(200);
    const rows = res.body.rows as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].affiliateId).toBe('AFF-3');
    expect(rows.some((r) => r.affiliateId === null)).toBe(false);
    expect(rows.some((r) => r.affiliateId !== 'AFF-3')).toBe(false);
  });

  it('especial ativo vê o manual de own + subs — mas nunca o agregado nem fora da rede', async () => {
    const res = await request(buildApp({ seed }))
      .get('/api/house-results')
      .set('Authorization', 'Bearer aff1-uid')
      .expect(200);
    const rows = res.body.rows as any[];
    const ids = rows.map((r) => r.affiliateId).sort();
    expect(ids).toEqual(['AFF-1', 'AFF-2']); // own + sub
    expect(rows.some((r) => r.affiliateId === null)).toBe(false); // agregado não vaza
    expect(rows.some((r) => r.affiliateId === 'AFF-3')).toBe(false); // fora da rede não vaza
  });

  it('admin vê todas as linhas, inclusive a agregada', async () => {
    const res = await request(buildApp({ seed }))
      .get('/api/house-results')
      .set('Authorization', 'Bearer admin-uid')
      .expect(200);
    expect((res.body.rows as any[]).length).toBe(4);
  });
});

// =============================================================================
// R20 — convite público: TTL / single-use / 404 + rate limit
// =============================================================================
describe('convite público (R20)', () => {
  const future = () => ({ toMillis: () => Date.now() + 3_600_000 });
  const past = () => ({ toMillis: () => Date.now() - 1_000 });

  it('GET token inexistente → 404', async () => {
    await request(buildApp({ seed: {} })).get('/api/invites/nope').expect(404);
  });

  it('GET token já usado → 410', async () => {
    const seed = { invites: { t1: { status: 'used', affiliateId: 'AFF-1', expiresAt: future() } } };
    await request(buildApp({ seed })).get('/api/invites/t1').expect(410);
  });

  it('GET token expirado → 410', async () => {
    const seed = { invites: { t1: { status: 'pending', affiliateId: 'AFF-1', expiresAt: past() } } };
    await request(buildApp({ seed })).get('/api/invites/t1').expect(410);
  });

  it('GET token válido → 200 com affiliateId', async () => {
    const seed = {
      invites: { t1: { status: 'pending', affiliateId: 'AFF-1', affiliateName: 'Casa', expiresAt: future() } },
    };
    const res = await request(buildApp({ seed })).get('/api/invites/t1').expect(200);
    expect(res.body.affiliateId).toBe('AFF-1');
  });

  it('POST accept-invite sem campos obrigatórios → 400', async () => {
    await request(buildApp({ seed: {} }))
      .post('/api/accept-invite')
      .send({ token: 't1' })
      .expect(400);
  });

  it('POST accept-invite com token usado → 410', async () => {
    const seed = { invites: { t1: { status: 'used', affiliateId: 'AFF-1', expiresAt: future() } } };
    await request(buildApp({ seed }))
      .post('/api/accept-invite')
      .send({ token: 't1', email: 'a@b.com', password: 'secret123', phone: '11999999999' })
      .expect(410);
  });

  it('POST accept-invite válido → 201, cria user client e marca o convite usado', async () => {
    const fs = makeFirestore({
      invites: { t1: { status: 'pending', affiliateId: 'AFF-1', affiliateName: 'Casa', expiresAt: future() } },
    });
    const app = createApp({
      adminApp: makeAdminApp({ createUser: () => ({ uid: 'fresh-uid' }) }),
      adminDb: fs,
    });
    const res = await request(app)
      .post('/api/accept-invite')
      .send({ token: 't1', email: 'a@b.com', password: 'secret123', phone: '11999999999' })
      .expect(201);
    expect(res.body.uid).toBe('fresh-uid');
    const userDoc = fs.__store.get('users').get('fresh-uid');
    expect(userDoc.role).toBe('client'); // self-register nunca vira admin
    expect(userDoc.affiliateId).toBe('AFF-1'); // vínculo vem do convite, não do cliente
    expect(fs.__store.get('invites').get('t1').status).toBe('used'); // single-use
  });

  it('publicAuthLimiter: a 31ª requisição → 429', async () => {
    const app = buildApp({ seed: {} }); // limiter próprio deste app
    let lastStatus = 0;
    for (let i = 0; i < 31; i++) {
      lastStatus = (await request(app).get('/api/invites/x')).status;
    }
    expect(lastStatus).toBe(429);
  });
});

// =============================================================================
// Link de cadastro na REDE do especial (15/08/2026)
// Tese: o gerente recruta sem passar pela fila da agência. O que o teste protege é
// (a) só especial ATIVO emite, (b) o link é reutilizável (não vira 'used'), (c) o
// recém-chegado entra na ÁRVORE (é ela que precifica a rede) e (d) o link nunca
// ROUBA quem já é de outra equipe.
// =============================================================================
describe('link de cadastro na rede (/api/network-invite)', () => {
  const seed = () => ({
    users: {
      'admin-uid': { role: 'admin' },
      'esp-uid': { role: 'client', affiliateId: 'ESP' },
      'sub-uid': { role: 'client', affiliateId: 'SUB' },
    },
    affiliates: { ESP: { id: 'ESP', name: 'Maurício Gerente' } },
    special_affiliates: { ESP: { active: true, fromNetwork: true } },
  });

  it('afiliado comum → 403; especial ativo sem link → code null', async () => {
    const app = buildApp({ seed: seed() });
    await request(app).get('/api/network-invite').set('Authorization', 'Bearer sub-uid').expect(403);
    const res = await request(app).get('/api/network-invite').set('Authorization', 'Bearer esp-uid').expect(200);
    expect(res.body.code).toBeNull();
  });

  it('especial DESATIVADO não emite link', async () => {
    const s = seed();
    s.special_affiliates.ESP = { active: false, fromNetwork: true };
    await request(buildApp({ seed: s }))
      .post('/api/network-invite')
      .set('Authorization', 'Bearer esp-uid')
      .expect(403);
  });

  it('POST cria o link, repete o MESMO em nova chamada e rotate revoga o anterior', async () => {
    const fs = makeFirestore(seed());
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs });
    const first = await request(app).post('/api/network-invite').set('Authorization', 'Bearer esp-uid').expect(201);
    const code = first.body.code as string;
    expect(code).toBeTruthy();
    expect(fs.__store.get('invites').get(code).ownerAffiliateId).toBe('ESP');

    // idempotente: sem rotate devolve o que já existe (o gerente já divulgou a URL)
    const again = await request(app).post('/api/network-invite').set('Authorization', 'Bearer esp-uid').expect(200);
    expect(again.body.code).toBe(code);
    expect(again.body.rotated).toBe(false);

    const rotated = await request(app)
      .post('/api/network-invite')
      .set('Authorization', 'Bearer esp-uid')
      .send({ rotate: true })
      .expect(201);
    expect(rotated.body.code).not.toBe(code);
    expect(fs.__store.get('invites').get(code).status).toBe('revoked');
  });

  it('GET público: link de rede devolve kind + quem convidou; revogado → 410', async () => {
    const s: any = seed();
    s.invites = {
      viva: { kind: 'network', ownerAffiliateId: 'ESP', ownerName: 'Maurício Gerente', status: 'active' },
      morta: { kind: 'network', ownerAffiliateId: 'ESP', status: 'revoked' },
    };
    const app = buildApp({ seed: s });
    const res = await request(app).get('/api/invites/viva').expect(200);
    expect(res.body.kind).toBe('network');
    expect(res.body.referrerName).toBe('Maurício Gerente');
    await request(app).get('/api/invites/morta').expect(410);
  });

  it('GET público: dono rebaixado invalida o link (sem precisar revogar)', async () => {
    const s: any = seed();
    s.special_affiliates.ESP = { active: false, fromNetwork: true };
    s.invites = { viva: { kind: 'network', ownerAffiliateId: 'ESP', status: 'active' } };
    await request(buildApp({ seed: s })).get('/api/invites/viva').expect(410);
  });

  it('accept sem nome → 400 (o afiliado nasce aqui, então o nome é obrigatório)', async () => {
    const s: any = seed();
    s.invites = { viva: { kind: 'network', ownerAffiliateId: 'ESP', status: 'active' } };
    await request(buildApp({ seed: s }))
      .post('/api/accept-invite')
      .send({ token: 'viva', email: 'novo@b.com', password: 'secret123', phone: '11999999999' })
      .expect(400);
  });

  it('accept válido: cria afiliado nativo na equipe, e o link NÃO é consumido', async () => {
    const s: any = seed();
    s.invites = { viva: { kind: 'network', ownerAffiliateId: 'ESP', status: 'active', uses: 2 } };
    const fs = makeFirestore(s);
    const app = createApp({ adminApp: makeAdminApp({ createUser: () => ({ uid: 'novo-uid' }) }), adminDb: fs });
    const res = await request(app)
      .post('/api/accept-invite')
      .send({ token: 'viva', email: 'Novo@B.com', password: 'secret123', phone: '11999999999', name: '  João   Silva ' })
      .expect(201);

    const affId = res.body.affiliateId as string;
    expect(affId.startsWith('boost_')).toBe(true);
    // mirror name-only + status ativo + e-mail (PII) SÓ no alias
    expect(fs.__store.get('affiliates').get(affId).name).toBe('João Silva');
    expect(fs.__store.get('affiliates').get(affId).email).toBeUndefined();
    expect(fs.__store.get('affiliate_statuses').get(affId).status).toBe('active');
    expect(fs.__store.get('affiliate_email_aliases').get('novo@b.com').affiliateId).toBe(affId);
    // entrou na ÁRVORE (é ela que precifica a rede)
    expect(fs.__store.get('affiliate_uplines').get(affId).uplineId).toBe('ESP');
    // login vinculado ao afiliado NOVO, nunca ao do gerente
    expect(fs.__store.get('users').get('novo-uid').affiliateId).toBe(affId);
    expect(fs.__store.get('users').get('novo-uid').role).toBe('client');
    // reutilizável: segue ativo, só conta o uso
    const invite = fs.__store.get('invites').get('viva');
    expect(invite.status).toBe('active');
    expect(invite.uses).toBe(3);
  });

  it('especial do modelo ANTIGO (sem fromNetwork) recebe o novo id na lista', async () => {
    const s: any = seed();
    s.special_affiliates.ESP = { active: true, subAffiliateIds: ['SUB'] };
    s.invites = { viva: { kind: 'network', ownerAffiliateId: 'ESP', status: 'active' } };
    const fs = makeFirestore(s);
    const app = createApp({ adminApp: makeAdminApp({ createUser: () => ({ uid: 'novo-uid' }) }), adminDb: fs });
    const res = await request(app)
      .post('/api/accept-invite')
      .send({ token: 'viva', email: 'novo@b.com', password: 'secret123', phone: '11999999999', name: 'Ana' })
      .expect(201);
    expect(fs.__store.get('special_affiliates').get('ESP').subAffiliateIds).toEqual(['SUB', res.body.affiliateId]);
  });

  it('não ROUBA quem já é de outra equipe: upline existente é preservado', async () => {
    const s: any = seed();
    s.invites = { viva: { kind: 'network', ownerAffiliateId: 'ESP', status: 'active' } };
    // e-mail já mapeado p/ um afiliado que já tem upline (é da equipe de OUTRO)
    s.affiliate_email_aliases = { 'velho@b.com': { affiliateId: 'AFF-9', email: 'velho@b.com' } };
    s.affiliate_uplines = { 'AFF-9': { affiliateId: 'AFF-9', uplineId: 'OUTRO' } };
    const fs = makeFirestore(s);
    const app = createApp({ adminApp: makeAdminApp({ createUser: () => ({ uid: 'novo-uid' }) }), adminDb: fs });
    const res = await request(app)
      .post('/api/accept-invite')
      .send({ token: 'viva', email: 'velho@b.com', password: 'secret123', phone: '11999999999', name: 'Velho' })
      .expect(201);
    expect(res.body.affiliateId).toBe('AFF-9'); // idempotente por e-mail
    expect(fs.__store.get('affiliate_uplines').get('AFF-9').uplineId).toBe('OUTRO');
  });
});

// =============================================================================
// R25 — create-user valida o enum de role
// =============================================================================
describe('create-user enum de role (R25)', () => {
  const seed = { users: { 'admin-uid': { role: 'admin' } } };

  it('role fora de {admin,client} → 400 e NÃO cria no Auth', async () => {
    let created = false;
    const app = createApp({
      adminApp: makeAdminApp({
        createUser: () => {
          created = true;
          return { uid: 'x' };
        },
      }),
      adminDb: makeFirestore(seed),
    });
    await request(app)
      .post('/api/create-user')
      .set('Authorization', 'Bearer admin-uid')
      .send({ name: 'X', email: 'x@y.com', password: 'secret123', role: 'superadmin' })
      .expect(400);
    expect(created).toBe(false);
  });

  it('role client válido → 200 com uid', async () => {
    const app = createApp({
      adminApp: makeAdminApp({ createUser: () => ({ uid: 'new-c' }) }),
      adminDb: makeFirestore(seed),
    });
    const res = await request(app)
      .post('/api/create-user')
      .set('Authorization', 'Bearer admin-uid')
      .send({ name: 'X', email: 'x@y.com', password: 'secret123', role: 'client' })
      .expect(200);
    expect(res.body.uid).toBe('new-c');
    expect(res.body.created).toBe(true);
  });

  // Incidente Infinity (30/07/2026): a conta do e-mail JA' existia (autocadastro do
  // proprio usuario) e a rota devolveu so' o uid, indistinguivel de criacao. Quem
  // chamou tratou como conta nova e depois a excluiu, derrubando o acesso de quem
  // ja' usava. Reaproveitar e' correto; esconder que reaproveitou, nao.
  it('e-mail JA existente → 200 com created:false (e a senha do corpo NAO e aplicada)', async () => {
    const app = createApp({
      adminApp: makeAdminApp({
        createUser: () => {
          const e: any = new Error('já existe');
          e.code = 'auth/email-already-exists';
          throw e;
        },
        getUserByEmail: () => ({ uid: 'uid-existente' }),
      }),
      adminDb: makeFirestore(seed),
    });
    const res = await request(app)
      .post('/api/create-user')
      .set('Authorization', 'Bearer admin-uid')
      .send({ name: 'X', email: 'ja@existe.com', password: 'nova-senha', role: 'admin' })
      .expect(200);
    expect(res.body.uid).toBe('uid-existente');
    expect(res.body.created).toBe(false);
  });
});

// =============================================================================
// Afiliado nativo Boost + alias de e-mail (Boost-first)
// =============================================================================
describe('boost-affiliates + email aliases', () => {
  const seed = () => ({ users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client' } } });

  it('cria afiliado nativo: mirror name-only + alias (PII) + status ativo', async () => {
    const fs = makeFirestore(seed());
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs });
    const res = await request(app)
      .post('/api/boost-affiliates')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliates: [{ name: 'Vanesa Cristina', email: 'Vanesa@X.com', house: 'Betfair' }] })
      .expect(201);

    expect(res.body.created).toHaveLength(1);
    const c = res.body.created[0];
    expect(c.affiliateId).toMatch(/^boost_/);
    expect(c.reused).toBe(false);
    expect(c.email).toBe('vanesa@x.com');
    expect(c.invite).toBeNull();

    // mirror: nome SIM, e-mail NÃO (PII fica só no alias)
    const aff = fs.__store.get('affiliates').get(c.affiliateId);
    expect(aff).toMatchObject({ name: 'Vanesa Cristina', source: 'boost', brand: { name: 'Betfair' } });
    expect(aff.email).toBeUndefined();
    // alias por e-mail normalizado
    const alias = fs.__store.get('affiliate_email_aliases').get('vanesa@x.com');
    expect(alias).toMatchObject({ affiliateId: c.affiliateId, kind: 'boost' });
    // status ativo
    expect(fs.__store.get('affiliate_statuses').get(c.affiliateId).status).toBe('active');
  });

  it('idempotente por e-mail: 2º cadastro reusa o affiliateId (não duplica mirror)', async () => {
    const fs = makeFirestore(seed());
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs });
    const first = await request(app).post('/api/boost-affiliates').set('Authorization', 'Bearer admin-uid')
      .send({ affiliates: [{ name: 'A', email: 'a@x.com', house: 'Betfair' }] }).expect(201);
    const id = first.body.created[0].affiliateId;
    const second = await request(app).post('/api/boost-affiliates').set('Authorization', 'Bearer admin-uid')
      .send({ affiliates: [{ name: 'A again', email: 'A@x.com', house: 'Betfair' }] }).expect(201);
    expect(second.body.created[0].reused).toBe(true);
    expect(second.body.created[0].affiliateId).toBe(id);
    expect(fs.__store.get('affiliates').size).toBe(1);
  });

  it('generateInvite → cria convite e devolve token', async () => {
    const fs = makeFirestore(seed());
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs });
    const res = await request(app).post('/api/boost-affiliates').set('Authorization', 'Bearer admin-uid')
      .send({ affiliates: [{ name: 'B', email: 'b@x.com', house: 'Betfair' }], generateInvite: true }).expect(201);
    expect(res.body.created[0].invite?.token).toBeTruthy();
    expect(fs.__store.get('invites').size).toBe(1);
  });

  it('client → 403; body vazio → 400', async () => {
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(seed()) });
    await request(app).post('/api/boost-affiliates').set('Authorization', 'Bearer client-uid')
      .send({ affiliates: [{ name: 'X' }] }).expect(403);
    await request(app).post('/api/boost-affiliates').set('Authorization', 'Bearer admin-uid')
      .send({ affiliates: [] }).expect(400);
  });

  it('alias "vincular a existente" grava kind:link; GET lista; client 403', async () => {
    const fs = makeFirestore(seed());
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs });
    await request(app).post('/api/affiliate-email-aliases').set('Authorization', 'Bearer admin-uid')
      .send({ email: 'JS@Gmail.com', affiliateId: '8a58' }).expect(200);
    expect(fs.__store.get('affiliate_email_aliases').get('js@gmail.com')).toMatchObject({ affiliateId: '8a58', kind: 'link' });

    const list = await request(app).get('/api/affiliate-email-aliases').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(list.body.aliases).toEqual([{ email: 'js@gmail.com', affiliateId: '8a58', name: null, kind: 'link' }]);

    await request(app).get('/api/affiliate-email-aliases').set('Authorization', 'Bearer client-uid').expect(403);
    await request(app).post('/api/affiliate-email-aliases').set('Authorization', 'Bearer admin-uid').send({ email: 'x' }).expect(400);
  });
});

// =============================================================================
// Fase 4 — auditoria das demais ações de admin (server-authoritative)
// Cada mutação grava 1 audit_log com QUEM (actor pelo token) + O QUÊ (action).
// =============================================================================
describe('Fase 4 — auditoria das ações de admin', () => {
  const logsOf = (db: any, action?: string) =>
    [...(db.__store.get('audit_logs')?.values() ?? [])].filter((l: any) => !action || l.action === action);

  it('create-user → user.create com role/affiliateId na metadata (sem senha)', async () => {
    const db = makeFirestore({ users: { 'admin-uid': { role: 'admin', name: 'Master' } } });
    const app = createApp({ adminApp: makeAdminApp({ createUser: () => ({ uid: 'novo-uid' }) }), adminDb: db });
    await request(app)
      .post('/api/create-user')
      .set('Authorization', 'Bearer admin-uid')
      .send({ name: 'Fulano', email: 'F@X.com', password: 'segredo123', role: 'client', affiliateId: 'AFF-9' })
      .expect(200);

    const logs = logsOf(db, 'user.create');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entityType: 'user', entityId: 'novo-uid', entityLabel: 'Fulano',
      actorId: 'admin-uid', actorName: 'Master',
      metadata: { role: 'client', affiliateId: 'AFF-9', email: 'f@x.com' },
    });
    expect(JSON.stringify(logs[0])).not.toContain('segredo123'); // senha NUNCA na trilha
  });

  it('link-affiliate-user → user.link_affiliate com antes→depois de affiliateId/isSpecial', async () => {
    const db = makeFirestore({
      users: { 'admin-uid': { role: 'admin' }, 'lo-uid': { role: 'client' } },
    });
    const app = createApp({
      adminApp: makeAdminApp({ getUserByEmail: (email: string) => ({ uid: 'lo-uid', email }) }),
      adminDb: db,
    });
    await request(app)
      .post('/api/link-affiliate-user')
      .set('Authorization', 'Bearer admin-uid')
      .send({ email: 'lo@x.com', affiliateId: 'AFF-1' })
      .expect(200);

    const logs = logsOf(db, 'user.link_affiliate');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entityType: 'user', entityId: 'lo-uid', actorId: 'admin-uid' });
    const fields = (logs[0] as any).changes.map((c: any) => c.field);
    expect(fields).toContain('affiliateId');
    const affChange = (logs[0] as any).changes.find((c: any) => c.field === 'affiliateId');
    expect(affChange).toMatchObject({ before: null, after: 'AFF-1' });
  });

  it('accept-invite → user.accept_invite atribuído ao PRÓPRIO afiliado (rota pública)', async () => {
    const db = makeFirestore({
      invites: { t1: { status: 'pending', affiliateId: 'AFF-1', affiliateName: 'Casa', expiresAt: { toMillis: () => Date.now() + 3_600_000 } } },
    });
    const app = createApp({ adminApp: makeAdminApp({ createUser: () => ({ uid: 'self-uid' }) }), adminDb: db });
    await request(app)
      .post('/api/accept-invite')
      .send({ token: 't1', email: 'self@x.com', password: 'segredo123', phone: '11999999999' })
      .expect(201);

    const logs = logsOf(db, 'user.accept_invite');
    expect(logs).toHaveLength(1);
    // sem requireAuth: o autor é o próprio afiliado recém-criado (não fica nulo)
    expect(logs[0]).toMatchObject({ entityType: 'user', entityId: 'self-uid', actorId: 'self-uid', metadata: { affiliateId: 'AFF-1' } });
  });

  it('invites → invite.create SEM gravar o token', async () => {
    const db = makeFirestore({ users: { 'admin-uid': { role: 'admin' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .post('/api/invites')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1', affiliateName: 'Casa' })
      .expect(201);

    const logs = logsOf(db, 'invite.create');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entityType: 'affiliate', entityId: 'AFF-1', entityLabel: 'Casa' });
    expect(JSON.stringify(logs[0])).not.toContain(res.body.token); // token (credencial) fora da trilha
  });

  it('boost-affiliates → affiliate.create_boost por NOVO; reuse não loga de novo', async () => {
    const db = makeFirestore({ users: { 'admin-uid': { role: 'admin' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).post('/api/boost-affiliates').set('Authorization', 'Bearer admin-uid')
      .send({ affiliates: [{ name: 'A', email: 'a@x.com', house: 'Betfair' }] }).expect(201);
    // 2º upload do MESMO e-mail → reusa (idempotente) → NÃO gera novo log
    await request(app).post('/api/boost-affiliates').set('Authorization', 'Bearer admin-uid')
      .send({ affiliates: [{ name: 'A', email: 'a@x.com', house: 'Betfair' }] }).expect(201);

    const logs = logsOf(db, 'affiliate.create_boost');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entityType: 'affiliate', action: 'affiliate.create_boost', actorId: 'admin-uid' });
    expect((logs[0] as any).metadata).toMatchObject({ house: 'Betfair', hasEmail: true });
  });

  it('affiliate-email-aliases → affiliate.link_email (e-mail na metadata; trilha é admin-only)', async () => {
    const db = makeFirestore({ users: { 'admin-uid': { role: 'admin' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).post('/api/affiliate-email-aliases').set('Authorization', 'Bearer admin-uid')
      .send({ email: 'JS@Gmail.com', affiliateId: '8a58' }).expect(200);

    const logs = logsOf(db, 'affiliate.link_email');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entityType: 'affiliate', entityId: '8a58', metadata: { email: 'js@gmail.com' } });
  });

  describe('affiliates/sync → affiliate.sync (precisa da chave + fetch externo)', () => {
    beforeAll(() => { process.env.AFFILIATE_API_KEY = 'k'; });
    afterAll(() => { delete process.env.AFFILIATE_API_KEY; });

    it('grava affiliate.sync com synced/total/reconciled', async () => {
      const db = makeFirestore({ users: { 'admin-uid': { role: 'admin' } } });
      const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ data: { data: [{ id: 'AFF-X', name: 'X' }] } }) }) as any;
      const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl });
      await request(app).post('/api/affiliates/sync').set('Authorization', 'Bearer admin-uid').expect(200);

      const logs = logsOf(db, 'affiliate.sync');
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ entityType: 'affiliates', entityId: null, metadata: { synced: 1, total: 1 } });
    });
  });
});

// =============================================================================
// Fase 5 — GET /api/audit-logs: ?limit= e filtro por entidade (?entityType&entityId)
// =============================================================================
describe('Fase 5 — GET /api/audit-logs (limit + filtro por entidade)', () => {
  const seed = () => ({
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client' } },
    audit_logs: {
      l1: { entityType: 'house', entityId: 'betano', action: 'house.create', createdAt: { toMillis: () => 100 } },
      l2: { entityType: 'affiliate', entityId: 'AFF-1', action: 'affiliate.activate', createdAt: { toMillis: () => 300 } },
      l3: { entityType: 'house', entityId: 'betano', action: 'house.update', createdAt: { toMillis: () => 200 } },
    },
  });

  it('sem filtro → lista tudo (admin); client → 403', async () => {
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(seed()) });
    const res = await request(app).get('/api/audit-logs').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(res.body).toHaveLength(3);
    await request(app).get('/api/audit-logs').set('Authorization', 'Bearer client-uid').expect(403);
  });

  it('?entityType=house&entityId=betano → só os 2 da casa, ordenados por createdAt desc', async () => {
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(seed()) });
    const res = await request(app)
      .get('/api/audit-logs?entityType=house&entityId=betano')
      .set('Authorization', 'Bearer admin-uid')
      .expect(200);
    expect(res.body.map((l: any) => l.action)).toEqual(['house.update', 'house.create']); // 200 antes de 100
  });

  it('?limit=1 → corta para 1 log', async () => {
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(seed()) });
    const res = await request(app).get('/api/audit-logs?limit=1').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(res.body).toHaveLength(1);
  });
});

// =============================================================================
// Cron interno: /api/internal/daily-ranking (auto-gera o ranking + lembra o admin)
// =============================================================================
describe('cron interno daily-ranking', () => {
  const seed = { users: { 'admin-uid': { role: 'admin', name: 'Boss' }, 'cli-uid': { role: 'client' } } };

  beforeAll(() => {
    process.env.AFFILIATE_API_KEY = 'cron-key';
  });
  afterAll(() => {
    delete process.env.AFFILIATE_API_KEY;
    delete process.env.RANKING_CRON_SECRET;
    delete process.env.MASTER_ADMIN_EMAIL;
  });

  it('sem RANKING_CRON_SECRET no ambiente → 503 (feature off)', async () => {
    delete process.env.RANKING_CRON_SECRET;
    await request(buildApp({ seed })).post('/api/internal/daily-ranking').expect(503);
  });

  it('secret ausente/errado → 401', async () => {
    process.env.RANKING_CRON_SECRET = 'right-secret';
    await request(buildApp({ seed })).post('/api/internal/daily-ranking').expect(401);
    await request(buildApp({ seed }))
      .post('/api/internal/daily-ranking')
      .set('x-cron-secret', 'wrong')
      .expect(401);
  });

  it('secret correto → 200, grava daily_rankings e manda lembrete a CADA admin (não a clients)', async () => {
    process.env.RANKING_CRON_SECRET = 'right-secret';
    delete process.env.MASTER_ADMIN_EMAIL; // sem master definido → fallback a todos os admins
    const fs = makeFirestore(seed);
    const { fetchImpl } = captureFetch(); // upstream devolve { data: [] } → 0 linhas
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, fetchImpl });
    const res = await request(app)
      .post('/api/internal/daily-ranking')
      .set('x-cron-secret', 'right-secret')
      .expect(200);
    expect(res.body.ok).toBe(true);
    const date = res.body.date as string;
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // ranking do dia gravado (mesmo vazio)
    expect(fs.__store.get('daily_rankings').get(date)).toBeTruthy();
    // lembrete determinístico ao admin; cliente NÃO recebe
    expect(res.body.reminders).toBe(1);
    expect(fs.__store.get('direct_messages').get(`ranking-reminder__${date}__admin-uid`)).toBeTruthy();
    expect(fs.__store.get('direct_messages').get(`ranking-reminder__${date}__cli-uid`)).toBeUndefined();
  });

  it('resultados MANUAIS do dia entram no ranking mesmo com a OTG vazia (fix ranking zerado)', async () => {
    process.env.RANKING_CRON_SECRET = 'right-secret';
    delete process.env.MASTER_ADMIN_EMAIL;
    const fs = makeFirestore({
      ...seed,
      affiliates: { 'AFF-M': { id: 'AFF-M', name: 'Manuel Manual' } },
      // A métrica NÃO usa mais affiliate_configs — a comissão da casa manual vem da TAXA
      // DA CASA (defaultCpa em EUR → BRL pela cotação). betfair 40 EUR × bid 5 = R$200/CPA.
      houses: { betfair: { name: 'Betfair', dataSource: 'manual', defaultCpa: 40, defaultRev: 0 } },
      house_results: {
        r1: { houseSlug: 'betfair', date: '2099-01-01', affiliateId: 'AFF-M', qualified_cpa: 3, rvs: 0 },
        r2: { houseSlug: 'betfair', date: '2099-01-01', affiliateId: null, qualified_cpa: 99, rvs: 0 }, // agregado: fora
      },
    });
    const { fetchImpl } = captureFetch(); // OTG devolve { data: [] } → 0 linhas; awesomeapi → bid 5
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, fetchImpl });
    // usa a rota admin com date no body p/ cravar o dia do seed (mesmo computeAndStoreRanking do cron)
    const res = await request(app)
      .post('/api/rankings/compute')
      .set('Authorization', 'Bearer admin-uid')
      .send({ date: '2099-01-01' })
      .expect(200);
    expect(res.body.count).toBe(1);
    const doc = fs.__store.get('daily_rankings').get('2099-01-01');
    expect(doc.entries).toEqual([
      { pos: 1, affiliateId: 'AFF-M', name: 'Manuel Manual', commission: 600 }, // 3 CPA × (40 EUR × 5)
    ]);
  });

  it('casa que paga em REAL (cpaCurrency BRL) NÃO passa pela cotação — vale o valor exato', async () => {
    // Casa BR fecha o CPA em R$ (ex.: R$ 120,50). Antes tudo era lido como euro e
    // 120,50 virava R$ 602,50 na cotação 5 — inflava a comissão em 5×.
    const fs = makeFirestore({
      ...seed,
      affiliates: { 'AFF-R': { id: 'AFF-R', name: 'Rita Real' } },
      houses: { esportiva: { name: 'Esportiva', dataSource: 'manual', defaultCpa: 120.5, defaultRev: 0, cpaCurrency: 'BRL' } },
      house_results: {
        r1: { houseSlug: 'esportiva', date: '2099-01-02', affiliateId: 'AFF-R', qualified_cpa: 2, rvs: 0 },
      },
    });
    const { fetchImpl } = captureFetch(); // awesomeapi → bid 5 (irrelevante p/ BRL)
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, fetchImpl });
    await request(app)
      .post('/api/rankings/compute')
      .set('Authorization', 'Bearer admin-uid')
      .send({ date: '2099-01-02' })
      .expect(200);
    const doc = fs.__store.get('daily_rankings').get('2099-01-02');
    expect(doc.entries).toEqual([
      { pos: 1, affiliateId: 'AFF-R', name: 'Rita Real', commission: 241 }, // 2 × R$ 120,50
    ]);
  });

  it('OTG: ranqueia pela comissão bruta (total_commission), inclusive produção só-REV (o bug)', async () => {
    // A produção real da OTG é quase toda REV-share (qualified_cpa=0, rvs>0). O ranking
    // ANTIGO recalculava pela config CPA/REV (revPercentage=0) e zerava esses afiliados
    // (ex.: rvs=1624 → R$0). Agora vale o total_commission que a própria OTG reporta.
    const fs = makeFirestore({ ...seed, affiliates: { A: { id: 'A', name: 'Ana' }, B: { id: 'B', name: 'Beto' } } });
    const otgRows = [
      { id: 'A', label: 'Ana', total_commission: 1624.03, qualified_cpa: 0, rvs: 1624.03 }, // SÓ-REV
      { id: 'B', label: 'Beto', total_commission: 300, qualified_cpa: 2, rvs: 0 },
      { id: 'Z', label: 'Zero', total_commission: 0, qualified_cpa: 0, rvs: 0 },
    ];
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { data: otgRows, meta: { totalPages: 1 } } }),
    } as any);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, fetchImpl });
    const res = await request(app)
      .post('/api/rankings/compute')
      .set('Authorization', 'Bearer admin-uid')
      .send({ date: '2099-03-03' })
      .expect(200);
    expect(res.body.count).toBe(2); // Zero (total_commission 0) filtrado
    expect(res.body.entries).toEqual([
      { pos: 1, affiliateId: 'A', name: 'Ana', commission: 1624.03 }, // só-REV, NÃO zerado
      { pos: 2, affiliateId: 'B', name: 'Beto', commission: 300 },
    ]);
  });

  it('re-rodar no mesmo dia é idempotente (não acumula lembrete)', async () => {
    process.env.RANKING_CRON_SECRET = 'right-secret';
    const fs = makeFirestore(seed);
    const { fetchImpl } = captureFetch();
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, fetchImpl });
    await request(app).post('/api/internal/daily-ranking').set('x-cron-secret', 'right-secret').expect(200);
    await request(app).post('/api/internal/daily-ranking').set('x-cron-secret', 'right-secret').expect(200);
    // id determinístico por (date,uid) → só 1 doc de lembrete para o admin
    const dmIds = [...fs.__store.get('direct_messages').keys()];
    expect(dmIds.filter((id) => id.includes('admin-uid'))).toHaveLength(1);
  });

  it('MASTER_ADMIN_EMAIL setado → lembrete SÓ ao master, não aos demais admins', async () => {
    process.env.RANKING_CRON_SECRET = 'right-secret';
    process.env.MASTER_ADMIN_EMAIL = 'boss@boost.com';
    const seed2 = {
      users: {
        'master-uid': { role: 'admin', name: 'Boss', email: 'Boss@Boost.com' }, // casa case-insensitive
        'other-admin': { role: 'admin', name: 'Outro', email: 'outro@boost.com' },
      },
    };
    const fs = makeFirestore(seed2);
    const { fetchImpl } = captureFetch();
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, fetchImpl });
    const res = await request(app)
      .post('/api/internal/daily-ranking')
      .set('x-cron-secret', 'right-secret')
      .expect(200);
    const date = res.body.date as string;
    expect(res.body.reminders).toBe(1);
    expect(fs.__store.get('direct_messages').get(`ranking-reminder__${date}__master-uid`)).toBeTruthy();
    expect(fs.__store.get('direct_messages').get(`ranking-reminder__${date}__other-admin`)).toBeUndefined();
  });
});

// =============================================================================
// GET /api/houses — auto-seed das casas-semente (só com o módulo OTG LIGADO)
// =============================================================================
describe('GET /api/houses — auto-seed das casas OTG', () => {
  it('instância OTG ligada: coleção vazia → 1ª listagem semeia as DEFAULT_BRANDS', async () => {
    const fs = makeFirestore({ users: { 'admin-uid': { role: 'admin' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs });
    const res = await request(app).get('/api/houses').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(res.body.houses.map((h: any) => h.slug).sort()).toEqual(['sportingbet', 'superbet']);
    expect(fs.__store.get('houses')?.size).toBe(2);
  });
});

// =============================================================================
// P2 — instância OTG-free (VITE_OTG_ENABLED='false'): módulo OTG desligado
// =============================================================================
describe('P2 · módulo OTG desligado por instância', () => {
  const seed = { users: { 'admin-uid': { role: 'admin', name: 'Master' } } };

  beforeAll(() => {
    process.env.VITE_OTG_ENABLED = 'false';
  });
  afterAll(() => {
    delete process.env.VITE_OTG_ENABLED;
  });

  it('rotas OTG respondem 503 OTG_DISABLED (proxy, sync, pending×3, analytics)', async () => {
    const app = buildApp({ seed });
    const expect503 = async (req: request.Test) => {
      const res = await req.set('Authorization', 'Bearer admin-uid').expect(503);
      expect(res.body.code).toBe('OTG_DISABLED');
    };
    await expect503(request(app).get('/api/external/results'));
    await expect503(request(app).post('/api/affiliates/sync'));
    await expect503(request(app).get('/api/pending-affiliates'));
    await expect503(request(app).post('/api/pending-affiliates/import'));
    await expect503(request(app).post('/api/pending-affiliates/refresh'));
    await expect503(request(app).post('/api/analytics/refresh'));
  });

  it('o gate NÃO afeta rotas não-OTG (affiliate-configs segue 200)', async () => {
    const app = buildApp({ seed });
    await request(app).get('/api/affiliate-configs').set('Authorization', 'Bearer admin-uid').expect(200);
  });

  it('OTG-free: GET /api/houses NÃO auto-semeia as casas OTG (Superbet/SportingBet fantasma)', async () => {
    // P5.3: numa instância OTG-free as sementes (dataSource 'otg') nunca receberiam
    // dados — a coleção vazia tem que CONTINUAR vazia até o admin criar casas manuais.
    const fs = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs });
    const res = await request(app).get('/api/houses').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(res.body.houses).toEqual([]);
    expect(fs.__store.get('houses')?.size ?? 0).toBe(0);
  });

  it('ranking OTG-free: nenhuma chamada à OTG (só a cotação p/ as casas manuais), sem exigir AFFILIATE_API_KEY', async () => {
    const prevKey = process.env.AFFILIATE_API_KEY;
    delete process.env.AFFILIATE_API_KEY; // instância OTG-free não tem a chave
    try {
      const db = makeFirestore({
        ...seed,
        affiliates: { 'AFF-M': { id: 'AFF-M', name: 'Manuel' } },
        houses: { betfair: { name: 'Betfair', dataSource: 'manual', defaultCpa: 40, defaultRev: 0 } },
        house_results: {
          r1: { houseSlug: 'betfair', date: '2099-02-02', affiliateId: 'AFF-M', qualified_cpa: 2, rvs: 0 },
        },
      });
      const { fetchImpl, calls } = captureFetch();
      const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl });
      const res = await request(app)
        .post('/api/rankings/compute')
        .set('Authorization', 'Bearer admin-uid')
        .send({ date: '2099-02-02' })
        .expect(200);
      expect(res.body.count).toBe(1);
      expect(res.body.entries[0]).toMatchObject({ affiliateId: 'AFF-M', commission: 400 }); // 2 CPA × (40 EUR × 5)
      // nenhuma chamada à OTG; a única chamada de rede é a cotação EUR→BRL das casas manuais.
      expect(calls.filter((u) => u.includes('external/results'))).toHaveLength(0);
      expect(calls.filter((u) => u.includes('awesomeapi'))).toHaveLength(1);
    } finally {
      if (prevKey !== undefined) process.env.AFFILIATE_API_KEY = prevKey;
    }
  });
});

// =============================================================================
// v1 ANALÍTICA da OTG — POST /api/analytics/refresh
// Trava o WIRING da rota: admin-only, 503 sem creds, param fix repassado ao pull,
// resiliência (superbet-404 → 200 parcial) e auth expirada (401 em todas → 502).
// =============================================================================
describe('POST /api/analytics/refresh (v1 analítica)', () => {
  const seed = { users: { 'admin-uid': { role: 'admin' }, 'cli-uid': { role: 'client' } } };
  const aresp = (status: number, data: any) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
  });
  const sbBody = (rows: any[]) => ({
    statusCode: 200,
    message: 'Success',
    data: { summary: { clicks: 5462 }, rows, meta: { currentPage: 1, totalPages: 1, totalRows: rows.length, pageSize: 500 } },
  });
  const LUCAS = { affiliate: 'LucasGuimaraes', clicks: 20, registrations: 4, ftd: 0, cpa_qual: 0, deposits: 0, bet_amount: 0, ngr: 0 };

  beforeEach(() => {
    process.env.OTG_DASH_API_BASE = 'https://api.test';
    process.env.OTG_DASH_ACCESS_TOKEN = 'tok-123';
    process.env.OTG_DASH_HOUSES = 'sportingbet,superbet';
  });
  afterEach(() => {
    delete process.env.OTG_DASH_API_BASE;
    delete process.env.OTG_DASH_ACCESS_TOKEN;
    delete process.env.OTG_DASH_HOUSES;
  });

  it('não-admin → 403', async () => {
    await request(buildApp({ seed })).post('/api/analytics/refresh').set('Authorization', 'Bearer cli-uid').expect(403);
  });

  it('sem credenciais OTG → 503', async () => {
    delete process.env.OTG_DASH_API_BASE;
    delete process.env.OTG_DASH_ACCESS_TOKEN;
    await request(buildApp({ seed })).post('/api/analytics/refresh').set('Authorization', 'Bearer admin-uid').expect(503);
  });

  it('sportingbet 200 + superbet 404 → 200 parcial; Lucas nas rows, superbet indisponível', async () => {
    const fetchImpl: any = async (url: string) =>
      String(url).includes('superbet') ? aresp(404, {}) : aresp(200, sbBody([LUCAS]));
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(seed), fetchImpl });
    const res = await request(app)
      .post('/api/analytics/refresh')
      .set('Authorization', 'Bearer admin-uid')
      .send({ initialDate: '2026-06-01', finalDate: '2026-06-25' })
      .expect(200);
    expect(res.body.source).toBe('otg-v1-analytics');
    expect(res.body.range).toEqual({ initialDate: '2026-06-01', finalDate: '2026-06-25' });
    expect(res.body.rows.some((r: any) => r.nameKey === 'lucasguimaraes')).toBe(true);
    const sup = res.body.houses.find((h: any) => h.house === 'superbet');
    expect(sup.available).toBe(false);
    expect(res.body.houses.find((h: any) => h.house === 'sportingbet').available).toBe(true);
  });

  it('401 em todas (token OTG expirado) → 502 surfacia o erro', async () => {
    const fetchImpl: any = async () => aresp(401, { message: 'Unauthorized' });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(seed), fetchImpl });
    const res = await request(app)
      .post('/api/analytics/refresh')
      .set('Authorization', 'Bearer admin-uid')
      .expect(502);
    expect(res.body.error).toMatch(/HTTP 401/);
  });

  it('persiste o funil em affiliate_analytics + reconcilia (real vs Lucas só-funil) e enriquece o pending', async () => {
    const HELDER = { affiliate: 'HelderDosSantosCavalheiro', clicks: 164, registrations: 47, ftd: 12, cpa_qual: 10, deposits: 0, bet_amount: 0, ngr: 1467.96 };
    const fetchImpl: any = async (url: string) =>
      String(url).includes('superbet') ? aresp(404, {}) : aresp(200, sbBody([HELDER, LUCAS]));
    const fs = makeFirestore({
      users: { 'admin-uid': { role: 'admin' } },
      affiliates: { 'AFF-H': { id: 'AFF-H', name: 'Helder Dos Santos Cavalheiro', brand: 'SportingBet' } },
      pending_affiliates: {
        pending_lucasguimaraes_sportingbet: { id: 'pending_lucasguimaraes_sportingbet', nameKey: 'lucasguimaraes', house: 'sportingbet', status: 'pending', name: 'Lucas Guimarães' },
      },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, fetchImpl });
    const res = await request(app)
      .post('/api/analytics/refresh')
      .set('Authorization', 'Bearer admin-uid')
      .expect(200);

    expect(res.body.persisted).toBe(2);
    expect(res.body.enrichedPending).toBe(1);
    // affiliate_analytics: id determinístico nameKey__casa; Lucas só-funil vs Helder real
    const an = fs.__store.get('affiliate_analytics');
    expect(an.get('lucasguimaraes__sportingbet')).toMatchObject({ clicks: 20, registrations: 4, affiliateId: 'pending_lucasguimaraes_sportingbet', funnelOnly: true });
    expect(an.get('helderdossantoscavalheiro__sportingbet')).toMatchObject({ clicks: 164, affiliateId: 'AFF-H', funnelOnly: false });
    // pending do Lucas: enriquecido com o funil SEM perder o nome bonito
    const pend = fs.__store.get('pending_affiliates').get('pending_lucasguimaraes_sportingbet');
    expect(pend.name).toBe('Lucas Guimarães');
    expect(pend.hasFunnelActivity).toBe(true);
    expect(pend.funnel.clicks).toBe(20);
  });

  describe('CRON /api/internal/analytics-refresh (sem token admin)', () => {
    afterEach(() => { delete process.env.RANKING_CRON_SECRET; });

    it('sem RANKING_CRON_SECRET no ambiente → 503', async () => {
      delete process.env.RANKING_CRON_SECRET;
      await request(buildApp({ seed })).post('/api/internal/analytics-refresh').expect(503);
    });

    it('secret ausente/errado → 401', async () => {
      process.env.RANKING_CRON_SECRET = 'right-cron';
      await request(buildApp({ seed })).post('/api/internal/analytics-refresh').expect(401);
      await request(buildApp({ seed })).post('/api/internal/analytics-refresh').set('x-cron-secret', 'wrong').expect(401);
    });

    it('secret certo → 200 ok + persiste o funil (scheduler, sem auth Firebase)', async () => {
      process.env.RANKING_CRON_SECRET = 'right-cron';
      const fetchImpl: any = async (url: string) => (String(url).includes('superbet') ? aresp(404, {}) : aresp(200, sbBody([LUCAS])));
      const fs = makeFirestore({ users: { 'admin-uid': { role: 'admin' } } });
      const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, fetchImpl });
      const res = await request(app).post('/api/internal/analytics-refresh').set('x-cron-secret', 'right-cron').expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.persisted).toBe(1);
      expect(fs.__store.get('affiliate_analytics').get('lucasguimaraes__sportingbet')).toMatchObject({ clicks: 20, funnelOnly: true });
    });
  });
});

// =============================================================================
// GET /api/affiliate-analytics — leitura do funil escopada por papel
// =============================================================================
describe('GET /api/affiliate-analytics (escopo por papel)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'cli-uid': { role: 'client', affiliateId: 'AFF-1' } },
    affiliate_analytics: {
      joao__sportingbet: { affiliateId: 'AFF-1', nameKey: 'joao', clicks: 10 },
      maria__sportingbet: { affiliateId: 'AFF-2', nameKey: 'maria', clicks: 5 },
    },
  };

  it('sem token → 401', async () => {
    await request(buildApp({ seed })).get('/api/affiliate-analytics').expect(401);
  });

  it('admin vê o funil de todos', async () => {
    const res = await request(buildApp({ seed })).get('/api/affiliate-analytics').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(res.body.analytics).toHaveLength(2);
  });

  it('afiliado vê só o próprio funil (por affiliateId) — não vaza o do outro', async () => {
    const res = await request(buildApp({ seed })).get('/api/affiliate-analytics').set('Authorization', 'Bearer cli-uid').expect(200);
    expect(res.body.analytics).toHaveLength(1);
    expect(res.body.analytics[0].affiliateId).toBe('AFF-1');
  });
});

// =============================================================================
// Acordos (deals) + Parcerias (marketplace, P2). Foco no caminho de dinheiro: a
// APROVAÇÃO grava a taxa do deal no affiliate_configs.byBrand[chave-da-casa] (slug
// nas casas manuais — instância OTG-free) e emite o affiliate_links. Escopo por papel
// (afiliado só a própria parceria) + guarda de transição (canTransition).
// =============================================================================
describe('deals + parcerias (P2)', () => {
  // Marketplace é opt-in por instância — ligado só nestes testes.
  beforeAll(() => { process.env.VITE_MARKETPLACE_ENABLED = 'true'; });
  afterAll(() => { delete process.env.VITE_MARKETPLACE_ENABLED; });

  const baseSeed = () => ({
    users: { 'admin-uid': { role: 'admin' }, 'aff-uid': { role: 'client', affiliateId: 'affX' }, 'other-uid': { role: 'client', affiliateId: 'affY' } },
    houses: {
      betano: { slug: 'betano', name: 'Betano', brandId: null, registerUrlTemplate: 'https://betano.example/aff', dataSource: 'manual' },
      superbet: { slug: 'superbet', name: 'Superbet', brandId: 'sb-brand', registerUrlTemplate: null, dataSource: 'otg' },
    },
    deals: {
      d1: { houseId: 'betano', operatorName: 'Betano', model: 'cpa', cpaValue: 120, revPercentage: 0, cycle: 'quinzenal', currency: 'BRL', geo: 'Brasil', active: true },
      d2: { houseId: 'superbet', operatorName: 'Superbet', model: 'revshare', cpaValue: 0, revPercentage: 30, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: false },
    },
  });

  it('GET /api/deals: afiliado vê só os ATIVOS; admin vê todos', async () => {
    const seed = baseSeed();
    const affRes = await request(buildApp({ seed })).get('/api/deals').set('Authorization', 'Bearer aff-uid').expect(200);
    expect(affRes.body.deals.map((d: any) => d.id)).toEqual(['d1']); // d2 inativo escondido
    const admRes = await request(buildApp({ seed })).get('/api/deals').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(admRes.body.deals.map((d: any) => d.id).sort()).toEqual(['d1', 'd2']);
  });

  it('POST /api/deals: client → 403; admin válido → 201 com label montado', async () => {
    await request(buildApp({ seed: baseSeed() })).post('/api/deals').set('Authorization', 'Bearer aff-uid').send({ houseId: 'x', operatorName: 'X', model: 'cpa', cpaValue: 10 }).expect(403);
    const res = await request(buildApp({ seed: baseSeed() })).post('/api/deals').set('Authorization', 'Bearer admin-uid')
      .send({ houseId: 'betano', operatorName: 'Betano', model: 'cpa', cpaValue: 80, cycle: 'quinzenal', currency: 'crypto', geo: 'México' }).expect(201);
    expect(res.body).toMatchObject({ operatorName: 'Betano', cpaValue: 80, model: 'cpa' });
  });

  it('POST /api/partnerships: afiliado solicita p/ SI (ignora affiliateId do body) e é idempotente', async () => {
    const db = makeFirestore(baseSeed());
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    // tenta forjar affiliateId de outro → servidor força o do token (affX)
    const res = await request(app).post('/api/partnerships').set('Authorization', 'Bearer aff-uid').send({ dealId: 'd1', affiliateId: 'affY' }).expect(201);
    expect(res.body).toMatchObject({ affiliateId: 'affX', dealId: 'd1', status: 'requested' });
    // repetir → reusa a mesma (idempotente, 200)
    const again = await request(app).post('/api/partnerships').set('Authorization', 'Bearer aff-uid').send({ dealId: 'd1' }).expect(200);
    expect(again.body.id).toBe(res.body.id);
  });

  it('GET /api/partnerships: afiliado vê só as dele (não vaza a do outro)', async () => {
    const seed: any = baseSeed();
    seed.partnership_requests = {
      p1: { affiliateId: 'affX', dealId: 'd1', status: 'requested' },
      p2: { affiliateId: 'affY', dealId: 'd1', status: 'approved' },
    };
    const res = await request(buildApp({ seed })).get('/api/partnerships').set('Authorization', 'Bearer aff-uid').expect(200);
    expect(res.body.partnerships.map((p: any) => p.id)).toEqual(['p1']);
  });

  it('APROVAÇÃO (casa MANUAL): grava byBrand[slug] no affiliate_configs + emite affiliate_links + audita', async () => {
    const seed: any = baseSeed();
    seed.partnership_requests = { p1: { affiliateId: 'affX', dealId: 'd1', status: 'requested', code: null } };
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).patch('/api/partnerships/p1').set('Authorization', 'Bearer admin-uid').send({ status: 'approved' }).expect(200);

    // byBrand keyed pelo SLUG da casa manual (betano), com a taxa do deal (120/0)
    const cfg = db.__store.get('affiliate_configs')?.get('affX');
    expect(cfg.byBrand.betano).toEqual({ cpaValue: 120, revPercentage: 0 });
    // affiliate_links emitido (afiliado×betano, registerUrl da casa, ativo)
    const links = [...(db.__store.get('affiliate_links')?.values() ?? [])];
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ affiliateId: 'affX', brandId: 'betano', registerUrl: 'https://betano.example/aff', active: true, dealId: 'd1' });
    // parceria aprovada + code setado
    const p = db.__store.get('partnership_requests')?.get('p1');
    expect(p.status).toBe('approved');
    expect(p.code).toBeTruthy();
    // trilha: config.update (dinheiro) + partnership.approve
    const audits = [...(db.__store.get('audit_logs')?.values() ?? [])].map((a: any) => a.action);
    expect(audits).toContain('config.update');
    expect(audits).toContain('partnership.approve');
  });

  it('APROVAÇÃO (casa OTG): byBrand keyed pelo brandId; link inativo quando não há registerUrlTemplate', async () => {
    const seed: any = baseSeed();
    seed.deals.d2.active = true; // ativa o deal OTG p/ aprovar
    seed.partnership_requests = { p2: { affiliateId: 'affX', dealId: 'd2', status: 'requested', code: null } };
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).patch('/api/partnerships/p2').set('Authorization', 'Bearer admin-uid').send({ status: 'approved' }).expect(200);
    const cfg = db.__store.get('affiliate_configs')?.get('affX');
    expect(cfg.byBrand['sb-brand']).toEqual({ cpaValue: 0, revPercentage: 30 }); // revshare
    const links = [...(db.__store.get('affiliate_links')?.values() ?? [])];
    expect(links[0]).toMatchObject({ brandId: 'sb-brand', active: false }); // sem template → link inativo
  });

  it('guarda de transição: aprovar uma parceria já RECUSADA → 409', async () => {
    const seed: any = baseSeed();
    seed.partnership_requests = { p1: { affiliateId: 'affX', dealId: 'd1', status: 'rejected' } };
    await request(buildApp({ seed })).patch('/api/partnerships/p1').set('Authorization', 'Bearer admin-uid').send({ status: 'approved' }).expect(409);
  });

  it('desativar um deal encerra em cascata as parcerias vivas + desativa o link', async () => {
    const seed: any = baseSeed();
    seed.partnership_requests = { p1: { affiliateId: 'affX', dealId: 'd1', status: 'approved', code: 'LINK1' } };
    seed.affiliate_links = { LINK1: { code: 'LINK1', affiliateId: 'affX', brandId: 'betano', active: true } };
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).patch('/api/deals/d1').set('Authorization', 'Bearer admin-uid').send({ active: false }).expect(200);
    expect(db.__store.get('partnership_requests')?.get('p1').status).toBe('discontinued');
    expect(db.__store.get('affiliate_links')?.get('LINK1').active).toBe(false);
  });
});

// =============================================================================
// Jurídico versionado (Tier 1, modo soft). Foco: a versão é DERIVADA no servidor
// (nunca aceita do body) e o aceite é carimbado pelo token — o cliente não pode
// forjar uid/versão/data.
// =============================================================================
describe('jurídico versionado (/api/legal-documents, /api/legal-acceptances)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'aff-uid': { role: 'client', affiliateId: 'affX' } },
  };

  it('GET sem token → 401 (requireAuth)', async () => {
    await request(buildApp({ seed })).get('/api/legal-documents').expect(401);
  });

  it('não-admin vê só documentos ATIVOS; admin vê todos (incl. rascunho)', async () => {
    const s: any = { ...seed, legal_documents: {
      d1: { slug: 'acordo', title: 'Acordo', content: 'v1', version: 1, active: true },
      d2: { slug: 'rascunho', title: 'Rascunho', content: 'x', version: 1, active: false },
    } };
    const aff = await request(buildApp({ seed: s })).get('/api/legal-documents').set('Authorization', 'Bearer aff-uid').expect(200);
    expect(aff.body.documents.map((d: any) => d.slug)).toEqual(['acordo']);
    const adm = await request(buildApp({ seed: s })).get('/api/legal-documents').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(adm.body.documents.map((d: any) => d.slug).sort()).toEqual(['acordo', 'rascunho']);
  });

  it('POST: client → 403; admin cria com versão 1 (nunca aceita do body)', async () => {
    await request(buildApp({ seed })).post('/api/legal-documents').set('Authorization', 'Bearer aff-uid').send({ slug: 'x', title: 'X', content: 'c' }).expect(403);
    const res = await request(buildApp({ seed })).post('/api/legal-documents').set('Authorization', 'Bearer admin-uid')
      .send({ slug: 'acordo', title: 'Acordo de Afiliação', content: 'texto v1', version: 999 }).expect(201);
    expect(res.body).toMatchObject({ slug: 'acordo', version: 1 }); // version:999 do body é IGNORADO
  });

  it('PATCH: conteúdo mudou → versão +1; só título mudou → versão mantém', async () => {
    const seed1: any = { ...seed, legal_documents: { d1: { slug: 'acordo', title: 'Acordo', content: 'texto v1', version: 1, active: true } } };
    const db = makeFirestore(seed1);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    // só título → mantém v1
    const r1 = await request(app).patch('/api/legal-documents/d1').set('Authorization', 'Bearer admin-uid').send({ title: 'Acordo de Afiliação' }).expect(200);
    expect(r1.body.version).toBe(1);
    // conteúdo mudou → v2
    const r2 = await request(app).patch('/api/legal-documents/d1').set('Authorization', 'Bearer admin-uid').send({ content: 'texto v2' }).expect(200);
    expect(r2.body.version).toBe(2);
  });

  it('aceite: uid/versão/data carimbados pelo servidor; GET devolve só os do PRÓPRIO uid', async () => {
    const seed1: any = { ...seed, legal_documents: { d1: { slug: 'acordo', title: 'Acordo', content: 'v1', version: 3, active: true } } };
    const db = makeFirestore(seed1);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app).post('/api/legal-acceptances').set('Authorization', 'Bearer aff-uid').send({ slug: 'acordo' }).expect(201);
    expect(res.body).toMatchObject({ uid: 'aff-uid', slug: 'acordo', version: 3 }); // versão do DOC ATIVO, não do body
    const mine = await request(app).get('/api/legal-acceptances').set('Authorization', 'Bearer aff-uid').expect(200);
    expect(mine.body.acceptances).toHaveLength(1);
    expect(mine.body.acceptances[0]).toMatchObject({ uid: 'aff-uid', slug: 'acordo', version: 3 });
  });

  it('aceitar slug inexistente/inativo → 404', async () => {
    const seed1: any = { ...seed, legal_documents: { d1: { slug: 'rascunho', title: 'X', content: 'c', version: 1, active: false } } };
    await request(buildApp({ seed: seed1 })).post('/api/legal-acceptances').set('Authorization', 'Bearer aff-uid').send({ slug: 'rascunho' }).expect(404);
    await request(buildApp({ seed: seed1 })).post('/api/legal-acceptances').set('Authorization', 'Bearer aff-uid').send({ slug: 'inexistente' }).expect(404);
  });

  it('DELETE (admin): remove o documento', async () => {
    const seed1: any = { ...seed, legal_documents: { d1: { slug: 'acordo', title: 'Acordo', content: 'v1', version: 1, active: true } } };
    const db = makeFirestore(seed1);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).delete('/api/legal-documents/d1').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(db.__store.get('legal_documents')?.has('d1')).toBe(false);
  });
});

// =============================================================================
// Carteira + Saque (Tier 1, sem gateway). Foco: escopo por papel, exigência de
// PIX cadastrado, snapshot do PIX na solicitação, e a máquina de estados
// (canTransitionWithdrawal) barrando pulos inválidos.
// =============================================================================
describe('carteira + saque (/api/withdrawals)', () => {
  const baseSeed = () => ({
    users: { 'admin-uid': { role: 'admin' }, 'aff-uid': { role: 'client', affiliateId: 'affX' }, 'nopix-uid': { role: 'client', affiliateId: 'affY' } },
    payment_profiles: { affX: { pixKeyType: 'cpf', pixKey: '123.456.789-00', documentType: 'cpf', document: '123.456.789-00', legalName: 'Fulano' } },
  });

  it('GET sem token → 401; afiliado vê só os PRÓPRIOS saques', async () => {
    await request(buildApp({ seed: baseSeed() })).get('/api/withdrawals').expect(401);
    const seed: any = baseSeed();
    seed.withdrawal_requests = {
      w1: { affiliateId: 'affX', amount: 100, status: 'requested' },
      w2: { affiliateId: 'affY', amount: 200, status: 'requested' },
    };
    const res = await request(buildApp({ seed })).get('/api/withdrawals').set('Authorization', 'Bearer aff-uid').expect(200);
    expect(res.body.withdrawals.map((w: any) => w.id)).toEqual(['w1']);
  });

  it('POST: sem chave PIX cadastrada → 400 (não sabe pra onde pagar)', async () => {
    const res = await request(buildApp({ seed: baseSeed() })).post('/api/withdrawals').set('Authorization', 'Bearer nopix-uid').send({ amount: 50, houseKey: 'esportiva' }).expect(400);
    expect(res.body.error).toMatch(/pix/i);
  });

  it('POST: valor inválido (0/negativo/não-numérico) → 400', async () => {
    await request(buildApp({ seed: baseSeed() })).post('/api/withdrawals').set('Authorization', 'Bearer aff-uid').send({ amount: 0 }).expect(400);
    await request(buildApp({ seed: baseSeed() })).post('/api/withdrawals').set('Authorization', 'Bearer aff-uid').send({ amount: -10 }).expect(400);
    await request(buildApp({ seed: baseSeed() })).post('/api/withdrawals').set('Authorization', 'Bearer aff-uid').send({ amount: 'lixo' }).expect(400);
  });

  it('POST válido: 201, snapshot do PIX + casa capturados, ignora affiliateId forjado do body', async () => {
    const db = makeFirestore(baseSeed());
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app).post('/api/withdrawals').set('Authorization', 'Bearer aff-uid')
      .send({ amount: 150.5, affiliateId: 'affY', houseKey: 'esportiva', houseLabel: 'Esportiva Bet' }).expect(201);
    expect(res.body).toMatchObject({ affiliateId: 'affX', amount: 150.5, status: 'requested', houseKey: 'esportiva', houseLabel: 'Esportiva Bet' });
    expect(res.body.pixSnapshot).toMatchObject({ pixKey: '123.456.789-00', pixKeyType: 'cpf' });
    const audits = [...(db.__store.get('audit_logs')?.values() ?? [])].map((a: any) => a.action);
    expect(audits).toContain('withdrawal.request');
  });

  it('POST do afiliado SEM casa → 400 (cada saque se refere a UMA casa); admin em nome de outro pode omitir', async () => {
    const res = await request(buildApp({ seed: baseSeed() })).post('/api/withdrawals').set('Authorization', 'Bearer aff-uid').send({ amount: 50 }).expect(400);
    expect(res.body.error).toMatch(/casa/i);
    // Admin registrando um saque combinado por fora não é obrigado a apontar casa
    // (e docs antigos também não têm) — a UI mostra "Casa não informada".
    const ok = await request(buildApp({ seed: baseSeed() })).post('/api/withdrawals').set('Authorization', 'Bearer admin-uid').send({ amount: 80, affiliateId: 'affX' }).expect(201);
    expect(ok.body).toMatchObject({ affiliateId: 'affX', houseKey: null, houseLabel: null });
  });

  it('PATCH: client → 403; guarda de transição barra requested→paid direto (409)', async () => {
    const seed: any = baseSeed();
    seed.withdrawal_requests = { w1: { affiliateId: 'affX', amount: 100, status: 'requested' } };
    await request(buildApp({ seed })).patch('/api/withdrawals/w1').set('Authorization', 'Bearer aff-uid').send({ status: 'approved' }).expect(403);
    await request(buildApp({ seed })).patch('/api/withdrawals/w1').set('Authorization', 'Bearer admin-uid').send({ status: 'paid' }).expect(409);
  });

  it('fluxo completo: requested → approved → paid; paid é TERMINAL', async () => {
    const seed: any = baseSeed();
    seed.withdrawal_requests = { w1: { affiliateId: 'affX', amount: 100, status: 'requested' } };
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const r1 = await request(app).patch('/api/withdrawals/w1').set('Authorization', 'Bearer admin-uid').send({ status: 'approved' }).expect(200);
    expect(r1.body.status).toBe('approved');
    const r2 = await request(app).patch('/api/withdrawals/w1').set('Authorization', 'Bearer admin-uid').send({ status: 'paid' }).expect(200);
    expect(r2.body.status).toBe('paid');
    await request(app).patch('/api/withdrawals/w1').set('Authorization', 'Bearer admin-uid').send({ status: 'rejected' }).expect(409);
  });

  it('admin filtra por affiliateId e por status via query', async () => {
    const seed: any = baseSeed();
    seed.withdrawal_requests = {
      w1: { affiliateId: 'affX', amount: 100, status: 'requested' },
      w2: { affiliateId: 'affX', amount: 50, status: 'paid' },
      w3: { affiliateId: 'affY', amount: 30, status: 'requested' },
    };
    const byAff = await request(buildApp({ seed })).get('/api/withdrawals?affiliateId=affX').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(byAff.body.withdrawals.map((w: any) => w.id).sort()).toEqual(['w1', 'w2']);
    const byStatus = await request(buildApp({ seed })).get('/api/withdrawals?status=paid').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(byStatus.body.withdrawals.map((w: any) => w.id)).toEqual(['w2']);
  });
});

// Marketplace é opt-in por instância (default OFF): sem VITE_MARKETPLACE_ENABLED as
// rotas respondem 404 → zero side effect na Boost/instância nº 0. [[marketplaceEnabled]]
describe('marketplace desligado por instância (default OFF)', () => {
  const seed = { users: { 'admin-uid': { role: 'admin' }, 'aff-uid': { role: 'client', affiliateId: 'affX' } } };
  // NÃO seta VITE_MARKETPLACE_ENABLED → default off.
  it('rotas de deals/partnerships respondem 404 MARKETPLACE_DISABLED', async () => {
    const app = buildApp({ seed });
    const expect404 = async (req: request.Test) => {
      const res = await req.set('Authorization', 'Bearer admin-uid').expect(404);
      expect(res.body.code).toBe('MARKETPLACE_DISABLED');
    };
    await expect404(request(app).get('/api/deals'));
    await expect404(request(app).post('/api/deals').send({ houseId: 'x', operatorName: 'X', model: 'cpa', cpaValue: 10 }));
    await expect404(request(app).get('/api/partnerships'));
    await expect404(request(app).post('/api/partnerships').send({ dealId: 'd1' }));
  });
});

// =============================================================================
// /go/:code — o redirect PÚBLICO do link de divulgação. Tinha 0 teste de rota: só
// os helpers puros (tracking.ts) eram exercitados, nunca o wiring. É a peça mais
// exposta do produto (quem bate nela é a audiência do afiliado, sem login) e, no
// piloto com influenciador, o clique é a ÚNICA métrica que não depende da casa
// nem do próprio influenciador — se ela mentir, não sobra número confiável.
//
// Testamos a NOSSA lógica: injeção de subid preservando params, casamento
// clickId==subid (o que habilita o postback futuro), classificação de bot, LGPD
// (nunca o IP cru) e o fail-safe pro fallback. O `increment` do contador é
// semântica do Firestore, não nossa — não é papel deste teste.
describe('/go/:code — redirect público do link de divulgação', () => {
  const linkSeed = (over: Record<string, any> = {}) => ({
    affiliate_links: {
      ABC123: {
        code: 'ABC123',
        affiliateId: 'affX',
        brandId: 'esportiva',
        // Já traz `wm` (ref do afiliado na casa): o subid tem que CONVIVER, não substituir.
        registerUrl: 'https://esportiva.bet/cadastro?wm=infinity01',
        active: true,
        ...over,
      },
    },
  });
  const CHROME_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

  it('link ativo → 302 pro registerUrl com subid injetado, preservando o `wm`', async () => {
    const db = makeFirestore(linkSeed());
    const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .get('/go/ABC123')
      .set('User-Agent', CHROME_UA)
      .expect(302);
    const dest = new URL(res.headers.location);
    expect(dest.origin + dest.pathname).toBe('https://esportiva.bet/cadastro');
    expect(dest.searchParams.get('wm')).toBe('infinity01'); // param da casa preservado
    expect(dest.searchParams.get('subid')).toMatch(/^[0-9a-f]{24}$/);
  });

  it('o clickId gravado É o subid da URL (casamento que habilita o postback)', async () => {
    const db = makeFirestore(linkSeed());
    const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .get('/go/ABC123')
      .set('User-Agent', CHROME_UA)
      .expect(302);
    const subid = new URL(res.headers.location).searchParams.get('subid')!;
    const clicks = [...(db.__store.get('link_clicks')?.entries() ?? [])];
    expect(clicks).toHaveLength(1);
    const [docId, row] = clicks[0];
    expect(docId).toBe(subid); // o doc é indexado pelo subid → postback casa por id
    expect(row).toMatchObject({ clickId: subid, code: 'ABC123', affiliateId: 'affX', brandId: 'esportiva', isBot: false });
  });

  it('LGPD: grava só hash truncado do IP — nunca o IP cru', async () => {
    const db = makeFirestore(linkSeed());
    await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .get('/go/ABC123')
      .set('User-Agent', CHROME_UA)
      .set('X-Forwarded-For', '203.0.113.42')
      .expect(302);
    const row = [...(db.__store.get('link_clicks')?.values() ?? [])][0] as any;
    expect(row.ipHash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(row)).not.toContain('203.0.113.42');
  });

  it('bot de preview (facebookexternalhit) → isBot:true; navegador real → isBot:false', async () => {
    const dbBot = makeFirestore(linkSeed());
    await request(createApp({ adminApp: makeAdminApp(), adminDb: dbBot }))
      .get('/go/ABC123')
      .set('User-Agent', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')
      .expect(302);
    expect(([...(dbBot.__store.get('link_clicks')?.values() ?? [])][0] as any).isBot).toBe(true);

    const dbHuman = makeFirestore(linkSeed());
    await request(createApp({ adminApp: makeAdminApp(), adminDb: dbHuman }))
      .get('/go/ABC123')
      .set('User-Agent', CHROME_UA)
      .expect(302);
    expect(([...(dbHuman.__store.get('link_clicks')?.values() ?? [])][0] as any).isBot).toBe(false);
  });

  it('série diária é gravada em {code}__{dia-BR}', async () => {
    const db = makeFirestore(linkSeed());
    await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .get('/go/ABC123')
      .set('User-Agent', CHROME_UA)
      .expect(302);
    const stats = [...(db.__store.get('link_click_stats')?.entries() ?? [])];
    expect(stats).toHaveLength(1);
    expect(stats[0][0]).toMatch(/^ABC123__\d{4}-\d{2}-\d{2}$/);
    expect(stats[0][1]).toMatchObject({ code: 'ABC123', affiliateId: 'affX', brandId: 'esportiva' });
  });

  it('link inativo, code inexistente ou sem registerUrl → fallback e NÃO registra clique', async () => {
    for (const seed of [
      linkSeed({ active: false }),
      linkSeed({ registerUrl: null }),
      { affiliate_links: {} },
    ]) {
      const db = makeFirestore(seed as any);
      const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
        .get('/go/ABC123')
        .set('User-Agent', CHROME_UA)
        .expect(302);
      expect(res.headers.location).toBe('/');
      expect(db.__store.get('link_clicks')?.size ?? 0).toBe(0);
    }
  });
});

// =============================================================================
// 2FA · TOTP próprio (/api/auth/totp) + gate de sessão
//
// Substitui o Firebase Multi-Factor. Como o `signInWithEmailAndPassword` conclui
// sozinho, o enforcement é o GATE do requireAuth/requireAdmin: token com
// `totpEnabled` só passa se `mfaAuthTime == auth_time` (prova de que o código foi
// digitado NESTA sessão). Exercitamos o wiring inteiro — enrollment, verify,
// anti-replay, códigos de backup, disable e o gate — com um TOTP de verdade.
// =============================================================================
describe('2FA · TOTP (/api/auth/totp)', () => {
  const AUTH_TIME = 1_700_000_000;
  const seed = { users: { u1: { role: 'client', affiliateId: 'aff1' }, admin1: { role: 'admin' } } };

  const token = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    email: `${uid}@test`,
    auth_time: AUTH_TIME,
    ...extra,
  });

  function buildTotpApp(args: { tokens: Record<string, any>; seed?: any; claims?: Map<string, any> }) {
    const db = makeFirestore(args.seed ?? seed);
    const adminApp = makeAdminApp({ verify: (t: string) => args.tokens[t], claims: args.claims });
    return { app: createApp({ adminApp, adminDb: db }), db, claims: adminApp.__claims };
  }

  const enabledSeed = (extra: any = {}) => ({
    ...seed,
    auth_totp: { u1: { enabled: true, secret: SECRET, lastCounter: null, backupCodes: [], ...extra } },
  });

  // --- Enrollment -----------------------------------------------------------
  it('setup → activate: liga o 2FA, devolve os códigos de backup e grava as claims', async () => {
    const { app, db, claims } = buildTotpApp({ tokens: { t1: token('u1') } });

    const setup = await request(app).post('/api/auth/totp/setup').set('Authorization', 'Bearer t1').expect(200);
    expect(setup.body.secretKey).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/');
    expect(setup.body).toMatchObject({ digits: 6, periodSeconds: 30 });
    // ainda NÃO está ligado — só um segredo pendente
    expect(db.__store.get('auth_totp')?.get('u1')).toMatchObject({ enabled: false });

    const res = await request(app)
      .post('/api/auth/totp/activate')
      .set('Authorization', 'Bearer t1')
      .send({ code: totpCode(setup.body.secretKey, Date.now()) })
      .expect(200);

    expect(res.body.enabled).toBe(true);
    expect(res.body.backupCodes).toHaveLength(10);
    res.body.backupCodes.forEach((c: string) => expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/));

    // a claim amarra a verificação ao auth_time DESTA sessão
    expect(claims.get('u1')).toMatchObject({ totpEnabled: true, mfaAuthTime: AUTH_TIME });
    // o doc guarda o segredo e só os HASHES dos códigos de backup
    const doc = db.__store.get('auth_totp')!.get('u1');
    expect(doc.enabled).toBe(true);
    expect(doc.pendingSecret).toBeNull();
    doc.backupCodes.forEach((hash: string) => expect(hash).toMatch(/^[0-9a-f]{64}$/));
    expect(doc.backupCodes).not.toContain(res.body.backupCodes[0]);
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs.some((l: any) => l.action === 'mfa.enable' && l.actorId === 'u1')).toBe(true);
  });

  it('activate com código errado → 400 e o 2FA NÃO liga', async () => {
    const { app, db, claims } = buildTotpApp({ tokens: { t1: token('u1') } });
    await request(app).post('/api/auth/totp/setup').set('Authorization', 'Bearer t1').expect(200);

    const res = await request(app)
      .post('/api/auth/totp/activate')
      .set('Authorization', 'Bearer t1')
      .send({ code: '000000' })
      .expect(400);

    expect(res.body.code).toBe('TOTP_INVALID_CODE');
    expect(db.__store.get('auth_totp')!.get('u1').enabled).toBe(false);
    expect(claims.get('u1')).toBeUndefined();
  });

  it('activate sem setup prévio → 400 (configuração expirada)', async () => {
    const { app } = buildTotpApp({ tokens: { t1: token('u1') } });
    const res = await request(app)
      .post('/api/auth/totp/activate')
      .set('Authorization', 'Bearer t1')
      .send({ code: '123456' })
      .expect(400);
    expect(res.body.code).toBe('TOTP_SETUP_EXPIRED');
  });

  it('setup com o 2FA já ativo → 409 (não sobrescreve o segredo em uso)', async () => {
    const { app } = buildTotpApp({
      tokens: { t1: token('u1', { totpEnabled: true, mfaAuthTime: AUTH_TIME }) },
      seed: enabledSeed(),
    });
    await request(app).post('/api/auth/totp/setup').set('Authorization', 'Bearer t1').expect(409);
  });

  // --- Verificação no login -------------------------------------------------
  it('verify com o código do app → grava a claim da sessão', async () => {
    const { app, claims } = buildTotpApp({ tokens: { t1: token('u1', { totpEnabled: true }) }, seed: enabledSeed() });

    const res = await request(app)
      .post('/api/auth/totp/verify')
      .set('Authorization', 'Bearer t1')
      .send({ code: totpCode(SECRET, Date.now()) })
      .expect(200);

    expect(res.body).toMatchObject({ verified: true, usedBackupCode: false, refreshToken: true });
    expect(claims.get('u1')).toMatchObject({ totpEnabled: true, mfaAuthTime: AUTH_TIME });
  });

  it('ANTI-REPLAY: o mesmo código não passa duas vezes', async () => {
    const { app } = buildTotpApp({ tokens: { t1: token('u1', { totpEnabled: true }) }, seed: enabledSeed() });
    const code = totpCode(SECRET, Date.now());

    await request(app).post('/api/auth/totp/verify').set('Authorization', 'Bearer t1').send({ code }).expect(200);
    const res = await request(app).post('/api/auth/totp/verify').set('Authorization', 'Bearer t1').send({ code }).expect(400);
    expect(res.body.code).toBe('TOTP_INVALID_CODE');
  });

  it('verify com código de backup → consome o código (uso único)', async () => {
    const backup = 'AAAAA-BBBBB';
    const { app, db } = buildTotpApp({
      tokens: { t1: token('u1', { totpEnabled: true }) },
      seed: enabledSeed({ backupCodes: [hashBackupCode(backup), hashBackupCode('CCCCC-DDDDD')] }),
    });

    const res = await request(app)
      .post('/api/auth/totp/verify')
      .set('Authorization', 'Bearer t1')
      .send({ code: backup })
      .expect(200);

    expect(res.body).toMatchObject({ verified: true, usedBackupCode: true, backupCodesRemaining: 1 });
    expect(db.__store.get('auth_totp')!.get('u1').backupCodes).toEqual([hashBackupCode('CCCCC-DDDDD')]);

    // e não vale de novo
    await request(app).post('/api/auth/totp/verify').set('Authorization', 'Bearer t1').send({ code: backup }).expect(400);
  });

  it('verify sem 2FA ativo → 400', async () => {
    const { app } = buildTotpApp({ tokens: { t1: token('u1') } });
    const res = await request(app)
      .post('/api/auth/totp/verify')
      .set('Authorization', 'Bearer t1')
      .send({ code: '123456' })
      .expect(400);
    expect(res.body.code).toBe('TOTP_NOT_ENABLED');
  });

  // --- Desativar ------------------------------------------------------------
  it('disable exige um código válido e limpa doc + claims (preservando as alheias)', async () => {
    const claims = new Map<string, any>([['u1', { totpEnabled: true, mfaAuthTime: AUTH_TIME, tenant: 'infinity' }]]);
    const { app, db } = buildTotpApp({
      tokens: { t1: token('u1', { totpEnabled: true, mfaAuthTime: AUTH_TIME }) },
      seed: enabledSeed(),
      claims,
    });

    await request(app).post('/api/auth/totp/disable').set('Authorization', 'Bearer t1').send({ code: '000000' }).expect(400);
    expect(db.__store.get('auth_totp')!.has('u1')).toBe(true);

    await request(app)
      .post('/api/auth/totp/disable')
      .set('Authorization', 'Bearer t1')
      .send({ code: totpCode(SECRET, Date.now()) })
      .expect(200);

    expect(db.__store.get('auth_totp')!.has('u1')).toBe(false);
    expect(claims.get('u1')).toEqual({ tenant: 'infinity' });
  });

  // --- Gate de sessão -------------------------------------------------------
  it('GATE: sessão com 2FA ligado e não verificada → 403 MFA_REQUIRED nas rotas autenticadas', async () => {
    const { app } = buildTotpApp({
      tokens: {
        pendente: token('u1', { totpEnabled: true }),
        admPendente: token('admin1', { totpEnabled: true }),
      },
    });

    const res = await request(app).get('/api/houses').set('Authorization', 'Bearer pendente').expect(403);
    expect(res.body.code).toBe('MFA_REQUIRED');
    // requireAdmin barra igual — o gate vem ANTES da checagem de papel
    const resAdmin = await request(app).get('/api/affiliate-statuses').set('Authorization', 'Bearer admPendente').expect(403);
    expect(resAdmin.body.code).toBe('MFA_REQUIRED');
  });

  it('GATE: claim de uma sessão ANTERIOR não serve (auth_time diferente)', async () => {
    const { app } = buildTotpApp({
      tokens: { velho: token('u1', { totpEnabled: true, mfaAuthTime: AUTH_TIME - 9999 }) },
    });
    const res = await request(app).get('/api/houses').set('Authorization', 'Bearer velho').expect(403);
    expect(res.body.code).toBe('MFA_REQUIRED');
  });

  it('GATE: sessão verificada passa; conta sem 2FA passa direto', async () => {
    const { app } = buildTotpApp({
      tokens: {
        ok: token('u1', { totpEnabled: true, mfaAuthTime: AUTH_TIME }),
        sem2fa: token('u1'),
      },
    });
    await request(app).get('/api/houses').set('Authorization', 'Bearer ok').expect(200);
    await request(app).get('/api/houses').set('Authorization', 'Bearer sem2fa').expect(200);
  });

  it('GATE: status e verify seguem acessíveis com a sessão PENDENTE (senão ninguém sai do desafio)', async () => {
    const { app } = buildTotpApp({ tokens: { pendente: token('u1', { totpEnabled: true }) }, seed: enabledSeed() });

    const status = await request(app).get('/api/auth/totp/status').set('Authorization', 'Bearer pendente').expect(200);
    expect(status.body).toMatchObject({ enabled: true, verified: false });

    await request(app)
      .post('/api/auth/totp/verify')
      .set('Authorization', 'Bearer pendente')
      .send({ code: totpCode(SECRET, Date.now()) })
      .expect(200);
  });

  it('GATE: as rotas de GESTÃO do 2FA exigem sessão verificada (setup/disable não são pré-MFA)', async () => {
    const { app } = buildTotpApp({ tokens: { pendente: token('u1', { totpEnabled: true }) }, seed: enabledSeed() });
    await request(app).post('/api/auth/totp/setup').set('Authorization', 'Bearer pendente').expect(403);
    await request(app).post('/api/auth/totp/disable').set('Authorization', 'Bearer pendente').send({ code: '1' }).expect(403);
  });

  it('sem token → 401 em todas as rotas do 2FA', async () => {
    const { app } = buildTotpApp({ tokens: {} });
    await request(app).get('/api/auth/totp/status').expect(401);
    await request(app).post('/api/auth/totp/setup').expect(401);
    await request(app).post('/api/auth/totp/verify').send({ code: '123456' }).expect(401);
  });
});

// =============================================================================
// Conquistas (/api/achievement-tiers) — catálogo de premiação por META individual
// =============================================================================
describe('conquistas — catálogo (/api/achievement-tiers)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client' } },
  };

  it('sem token -> 401; client -> 403 (requireAdmin fail-closed)', async () => {
    await request(buildApp({ seed })).post('/api/achievement-tiers').send({ title: 'X', metaCpas: 1 }).expect(401);
    await request(buildApp({ seed }))
      .post('/api/achievement-tiers')
      .set('Authorization', 'Bearer client-uid')
      .send({ title: 'X', metaCpas: 1 })
      .expect(403);
  });

  it('POST valido -> 201, grava saneado e aceita meta em pt-BR', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .post('/api/achievement-tiers')
      .set('Authorization', 'Bearer admin-uid')
      .send({ title: '  Placa de 10K  ', subtitle: 'SILVER', metaCommission: '10.000,00' })
      .expect(201);
    expect(res.body).toMatchObject({ title: 'Placa de 10K', metaCommission: 10000, active: true });
    const rows = [...(db.__store.get('achievement_tiers')?.values() ?? [])];
    expect(rows[0]).toMatchObject({ title: 'Placa de 10K', subtitle: 'SILVER', metaCommission: 10000 });
  });

  it('POST sem meta nenhuma -> 400 e NAO grava (0 = ignorar, como no legado)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/achievement-tiers')
      .set('Authorization', 'Bearer admin-uid')
      .send({ title: 'Sem meta', metaCpas: 0, metaCommission: 0 })
      .expect(400);
    expect(db.__store.get('achievement_tiers')?.size ?? 0).toBe(0);
  });

  it('POST grava trilha de auditoria', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/achievement-tiers')
      .set('Authorization', 'Bearer admin-uid')
      .send({ title: 'Placa', metaCpas: 50 })
      .expect(201);
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs.some((l: any) => l.action === 'achievement_tier.create')).toBe(true);
  });

  it('PATCH que zera a UNICA meta -> 400 (validacao combinada com o doc atual)', async () => {
    const db = makeFirestore({
      ...seed,
      achievement_tiers: { T1: { title: 'Placa', metaCpas: 0, metaCommission: 10000, active: true } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .patch('/api/achievement-tiers/T1')
      .set('Authorization', 'Bearer admin-uid')
      .send({ metaCommission: 0 })
      .expect(400);
    expect(db.__store.get('achievement_tiers')?.get('T1')).toMatchObject({ metaCommission: 10000 });
  });

  it('PATCH parcial faz merge; tier inexistente -> 404', async () => {
    const db = makeFirestore({
      ...seed,
      achievement_tiers: { T1: { title: 'Placa', metaCommission: 10000, active: true } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .patch('/api/achievement-tiers/T1')
      .set('Authorization', 'Bearer admin-uid')
      .send({ active: false })
      .expect(200);
    expect(db.__store.get('achievement_tiers')?.get('T1')).toMatchObject({ title: 'Placa', active: false });
    await request(app)
      .patch('/api/achievement-tiers/NAO-EXISTE')
      .set('Authorization', 'Bearer admin-uid')
      .send({ active: false })
      .expect(404);
  });

  it('DELETE remove a conquista', async () => {
    const db = makeFirestore({ ...seed, achievement_tiers: { T1: { title: 'Placa', metaCpas: 10 } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).delete('/api/achievement-tiers/T1').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(db.__store.get('achievement_tiers')?.has('T1')).toBe(false);
  });
});

// =============================================================================
// Conquistas (/api/achievement-requests) — pedido do afiliado + decisao do admin
// =============================================================================
describe('conquistas — solicitacoes (/api/achievement-requests)', () => {
  const seed = () => ({
    users: {
      'admin-uid': { role: 'admin' },
      'client-uid': { role: 'client', affiliateId: 'AFF-1' },
      'orfao-uid': { role: 'client' },
      'outro-uid': { role: 'client', affiliateId: 'AFF-2' },
    },
    affiliates: { 'AFF-1': { name: 'Ana' } },
    achievement_tiers: { T1: { title: 'Placa de 10K', metaCommission: 10000, active: true } },
  });

  it('afiliado solicita -> 201 com status pending e nome do mirror', async () => {
    const db = makeFirestore(seed());
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .post('/api/achievement-requests')
      .set('Authorization', 'Bearer client-uid')
      .send({ tierId: 'T1', snapshot: { cpas: 5, commission: 12000 } })
      .expect(201);
    expect(res.body).toMatchObject({ status: 'pending', affiliateId: 'AFF-1', affiliateName: 'Ana' });
    const rows = [...(db.__store.get('achievement_requests')?.values() ?? [])];
    expect(rows[0]).toMatchObject({ tierId: 'T1', tierTitle: 'Placa de 10K', status: 'pending' });
  });

  it('conta sem afiliado vinculado -> 403; tier inexistente -> 404; inativo -> 409', async () => {
    const db = makeFirestore({
      ...seed(),
      achievement_tiers: { T1: { title: 'X', metaCpas: 1, active: false } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/achievement-requests')
      .set('Authorization', 'Bearer orfao-uid')
      .send({ tierId: 'T1' })
      .expect(403);
    await request(app)
      .post('/api/achievement-requests')
      .set('Authorization', 'Bearer client-uid')
      .send({ tierId: 'NAO-EXISTE' })
      .expect(404);
    await request(app)
      .post('/api/achievement-requests')
      .set('Authorization', 'Bearer client-uid')
      .send({ tierId: 'T1' })
      .expect(409);
  });

  it('pedido vivo bloqueia duplicata; REJEITADO libera novo pedido', async () => {
    const db = makeFirestore({
      ...seed(),
      achievement_requests: { R1: { tierId: 'T1', affiliateId: 'AFF-1', status: 'pending' } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/achievement-requests')
      .set('Authorization', 'Bearer client-uid')
      .send({ tierId: 'T1' })
      .expect(409);

    const db2 = makeFirestore({
      ...seed(),
      achievement_requests: { R1: { tierId: 'T1', affiliateId: 'AFF-1', status: 'rejected' } },
    });
    const app2 = createApp({ adminApp: makeAdminApp(), adminDb: db2 });
    await request(app2)
      .post('/api/achievement-requests')
      .set('Authorization', 'Bearer client-uid')
      .send({ tierId: 'T1' })
      .expect(201);
  });

  it('GET escopa por papel: afiliado so ve as proprias; admin ve todas', async () => {
    const db = makeFirestore({
      ...seed(),
      achievement_requests: {
        R1: { tierId: 'T1', affiliateId: 'AFF-1', status: 'pending' },
        R2: { tierId: 'T1', affiliateId: 'AFF-2', status: 'pending' },
      },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const meu = await request(app)
      .get('/api/achievement-requests')
      .set('Authorization', 'Bearer client-uid')
      .expect(200);
    expect(meu.body.requests.map((r: any) => r.affiliateId)).toEqual(['AFF-1']);
    const todas = await request(app)
      .get('/api/achievement-requests')
      .set('Authorization', 'Bearer admin-uid')
      .expect(200);
    expect(todas.body.requests).toHaveLength(2);
  });

  it('aprovar: grava decisao, notifica o afiliado e audita', async () => {
    const db = makeFirestore({
      ...seed(),
      achievement_requests: {
        R1: { tierId: 'T1', tierTitle: 'Placa de 10K', affiliateId: 'AFF-1', status: 'pending' },
      },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .patch('/api/achievement-requests/R1')
      .set('Authorization', 'Bearer admin-uid')
      .send({ status: 'approved', note: 'Enviado pelos Correios' })
      .expect(200);
    expect(db.__store.get('achievement_requests')?.get('R1')).toMatchObject({ status: 'approved' });
    const notifs = [...(db.__store.get('user_notifications')?.values() ?? [])];
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ recipientUid: 'client-uid', type: 'achievement_approved' });
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs.some((l: any) => l.action === 'achievement_request.approve')).toBe(true);
  });

  it('client NAO decide (403); status invalido -> 400; ja decidida -> 409', async () => {
    const db = makeFirestore({
      ...seed(),
      achievement_requests: {
        R1: { tierId: 'T1', affiliateId: 'AFF-1', status: 'pending' },
        R2: { tierId: 'T1', affiliateId: 'AFF-2', status: 'approved' },
      },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .patch('/api/achievement-requests/R1')
      .set('Authorization', 'Bearer client-uid')
      .send({ status: 'approved' })
      .expect(403);
    await request(app)
      .patch('/api/achievement-requests/R1')
      .set('Authorization', 'Bearer admin-uid')
      .send({ status: 'talvez' })
      .expect(400);
    await request(app)
      .patch('/api/achievement-requests/R2')
      .set('Authorization', 'Bearer admin-uid')
      .send({ status: 'approved' })
      .expect(409);
    expect(db.__store.get('achievement_requests')?.get('R1')).toMatchObject({ status: 'pending' });
  });
});

// =============================================================================
// Contato de suporte (/api/support-contact) — WhatsApp do operador da label
// =============================================================================
describe('contato de suporte (/api/support-contact)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client', affiliateId: 'AFF-1' } },
  };

  it('GET exige login e devolve vazio quando nunca configurado', async () => {
    const app = buildApp({ seed });
    await request(app).get('/api/support-contact').expect(401);
    const res = await request(app).get('/api/support-contact').set('Authorization', 'Bearer client-uid').expect(200);
    expect(res.body.contact).toMatchObject({ phone: '', active: false });
  });

  it('PUT do admin normaliza o telefone; o AFILIADO le pelo GET (settings e admin-only)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .put('/api/support-contact')
      .set('Authorization', 'Bearer admin-uid')
      .send({ phone: '(11) 98888-7777', message: 'Preciso de ajuda', label: 'Suporte' })
      .expect(200);
    expect(db.__store.get('settings')?.get('support_contact')).toMatchObject({
      phone: '5511988887777',
      active: true,
    });
    const res = await request(app).get('/api/support-contact').set('Authorization', 'Bearer client-uid').expect(200);
    expect(res.body.contact).toMatchObject({ phone: '5511988887777', message: 'Preciso de ajuda', active: true });
  });

  it('client NAO escreve (403); telefone invalido -> 400 e nao grava', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .put('/api/support-contact')
      .set('Authorization', 'Bearer client-uid')
      .send({ phone: '11988887777' })
      .expect(403);
    await request(app)
      .put('/api/support-contact')
      .set('Authorization', 'Bearer admin-uid')
      .send({ phone: '123' })
      .expect(400);
    expect(db.__store.get('settings')?.has('support_contact') ?? false).toBe(false);
  });

  it('PUT audita a mudanca', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .put('/api/support-contact')
      .set('Authorization', 'Bearer admin-uid')
      .send({ phone: '11988887777' })
      .expect(200);
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs.some((l: any) => l.action === 'support_contact.update')).toBe(true);
  });
});

// =============================================================================
// Vitrine AffiliaCore (/api/showcase) — opt-in da agencia na LP do produto
// =============================================================================
describe('vitrine AffiliaCore (/api/showcase)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client', affiliateId: 'AFF-1' } },
  };

  it('GET publico (sem token) devolve {enabled:false} quando nunca configurado, com CORS aberto', async () => {
    const app = buildApp({ seed });
    const res = await request(app).get('/api/showcase').expect(200);
    expect(res.body).toEqual({ enabled: false });
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('vitrine DESLIGADA nao vaza o rascunho salvo no GET publico', async () => {
    const db = makeFirestore({
      ...seed,
      settings: { showcase: { enabled: false, description: 'rascunho secreto', siteUrl: 'https://x.com' } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app).get('/api/showcase').expect(200);
    expect(res.body).toEqual({ enabled: false });
  });

  it('admin liga pela config e o GET publico passa a servir o payload', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .put('/api/showcase-config')
      .set('Authorization', 'Bearer admin-uid')
      .send({ enabled: true, description: '  Agencia com 80+ afiliados.  ', siteUrl: 'https://agencia.bet' })
      .expect(200);
    const res = await request(app).get('/api/showcase').expect(200);
    expect(res.body).toMatchObject({
      enabled: true,
      name: 'AffiliaCore', // sem VITE_BRAND_NAME no ambiente de teste, cai no default do produto
      description: 'Agencia com 80+ afiliados.',
      siteUrl: 'https://agencia.bet',
      // logo REAL da instância no card da LP (sem VITE_BRAND_LOGO_* → mono do produto)
      logoUrl: '/affiliacore/logo.svg',
    });
  });

  it('config e admin-only: client nao le nem escreve; URL invalida -> 400', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).get('/api/showcase-config').set('Authorization', 'Bearer client-uid').expect(403);
    await request(app)
      .put('/api/showcase-config')
      .set('Authorization', 'Bearer client-uid')
      .send({ enabled: true })
      .expect(403);
    await request(app)
      .put('/api/showcase-config')
      .set('Authorization', 'Bearer admin-uid')
      .send({ enabled: true, siteUrl: 'agencia.bet' })
      .expect(400);
    expect(db.__store.get('settings')?.has('showcase') ?? false).toBe(false);
  });

  it('PUT audita a mudanca', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .put('/api/showcase-config')
      .set('Authorization', 'Bearer admin-uid')
      .send({ enabled: true, description: 'Oi' })
      .expect(200);
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs.some((l: any) => l.action === 'showcase.update')).toBe(true);
  });
});

// =============================================================================
// Triagem de links — pool de STANDBY, atribuicao e liberacao
// =============================================================================
describe('triagem de links — standby (/api/affiliate-links)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client', affiliateId: 'AFF-1' } },
  };

  it('import do pool: grava SEM dono e INATIVO (o /go recusa link inativo)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .post('/api/affiliate-links/standby')
      .set('Authorization', 'Bearer admin-uid')
      .send({ text: 'https://go.aff.esportiva.bet/x?afp=infinitw291\nhttps://go.aff.esportiva.bet/x?afp=infinitw292' })
      .expect(201);
    expect(res.body).toMatchObject({ created: 2, skipped: 0 });
    const rows = [...(db.__store.get('affiliate_links')?.values() ?? [])];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ affiliateId: null, active: false, tag: 'infinitw291' });
  });

  it('re-colar o mesmo lote nao duplica (skipped) e linha invalida volta na resposta', async () => {
    const db = makeFirestore({
      ...seed,
      affiliate_links: { c1: { code: 'c1', affiliateId: null, registerUrl: 'https://casa.bet/r?afp=a', active: false } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .post('/api/affiliate-links/standby')
      .set('Authorization', 'Bearer admin-uid')
      .send({ text: 'https://casa.bet/r?afp=a\nlixo-nao-url\nhttps://casa.bet/r?afp=b' })
      .expect(201);
    expect(res.body).toMatchObject({ created: 1, skipped: 1 });
    expect(res.body.invalid).toEqual(['lixo-nao-url']);
  });

  it('texto sem nenhum link valido -> 400', async () => {
    const app = buildApp({ seed });
    await request(app)
      .post('/api/affiliate-links/standby')
      .set('Authorization', 'Bearer admin-uid')
      .send({ text: 'nada aqui' })
      .expect(400);
  });

  it('atribuir do standby: ganha dono e vira ATIVO', async () => {
    const db = makeFirestore({
      ...seed,
      affiliate_links: { c1: { code: 'c1', affiliateId: null, registerUrl: 'https://casa.bet/r', active: false } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-links/c1/assign')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1' })
      .expect(200);
    expect(db.__store.get('affiliate_links')?.get('c1')).toMatchObject({ affiliateId: 'AFF-1', active: true });
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs.some((l: any) => l.action === 'link.assign')).toBe(true);
  });

  it('atribuir link de OUTRO afiliado -> 409 (o historico de cliques e dele)', async () => {
    const db = makeFirestore({
      ...seed,
      affiliate_links: { c1: { code: 'c1', affiliateId: 'AFF-9', registerUrl: 'https://casa.bet/r', active: true } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-links/c1/assign')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1' })
      .expect(409);
    expect(db.__store.get('affiliate_links')?.get('c1')).toMatchObject({ affiliateId: 'AFF-9' });
  });

  it('atribuir link SEM destino -> 400 (nao ha para onde enviar)', async () => {
    const db = makeFirestore({
      ...seed,
      affiliate_links: { c1: { code: 'c1', affiliateId: null, registerUrl: '', active: false } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-links/c1/assign')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1' })
      .expect(400);
  });

  it('liberar devolve ao pool (sem dono e inativo)', async () => {
    const db = makeFirestore({
      ...seed,
      affiliate_links: { c1: { code: 'c1', affiliateId: 'AFF-1', registerUrl: 'https://casa.bet/r', active: true } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).post('/api/affiliate-links/c1/release').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(db.__store.get('affiliate_links')?.get('c1')).toMatchObject({ affiliateId: null, active: false });
  });

  it('DELETE so remove link do POOL; com dono -> 409', async () => {
    const db = makeFirestore({
      ...seed,
      affiliate_links: {
        pool: { code: 'pool', affiliateId: null, registerUrl: 'https://casa.bet/r' },
        vivo: { code: 'vivo', affiliateId: 'AFF-1', registerUrl: 'https://casa.bet/r' },
      },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app).delete('/api/affiliate-links/vivo').set('Authorization', 'Bearer admin-uid').expect(409);
    await request(app).delete('/api/affiliate-links/pool').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(db.__store.get('affiliate_links')?.has('pool')).toBe(false);
    expect(db.__store.get('affiliate_links')?.has('vivo')).toBe(true);
  });

  it('client nao mexe no pool (403 em import, assign, release e delete)', async () => {
    const app = buildApp({
      seed: { ...seed, affiliate_links: { c1: { code: 'c1', affiliateId: null, registerUrl: 'https://casa.bet/r' } } },
    });
    await request(app).post('/api/affiliate-links/standby').set('Authorization', 'Bearer client-uid').send({ text: 'https://casa.bet/r' }).expect(403);
    await request(app).post('/api/affiliate-links/c1/assign').set('Authorization', 'Bearer client-uid').send({ affiliateId: 'AFF-1' }).expect(403);
    await request(app).post('/api/affiliate-links/c1/release').set('Authorization', 'Bearer client-uid').expect(403);
    await request(app).delete('/api/affiliate-links/c1').set('Authorization', 'Bearer client-uid').expect(403);
  });

  it('o pool NAO vaza para o afiliado no GET (filtro por affiliateId)', async () => {
    const app = buildApp({
      seed: {
        ...seed,
        affiliate_links: {
          pool: { code: 'pool', affiliateId: null, registerUrl: 'https://casa.bet/r' },
          meu: { code: 'meu', affiliateId: 'AFF-1', registerUrl: 'https://casa.bet/r' },
        },
      },
    });
    const res = await request(app).get('/api/affiliate-links').set('Authorization', 'Bearer client-uid').expect(200);
    expect(res.body.links.map((l: any) => l.code)).toEqual(['meu']);
  });
});

// =============================================================================
// Geracao de link a partir do template da casa (/api/affiliate-links/generate)
// A tag e' capturada na visita pela casa — nao precisa ser cunhada la'. Ver
// src/lib/linkGeneration.ts.
// =============================================================================
describe('geracao de link (/api/affiliate-links/generate)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client', affiliateId: 'AFF-1' } },
    affiliates: { 'AFF-1': { id: 'AFF-1', name: 'Mauricio Fernandes' } },
    houses: {
      esportiva: {
        slug: 'esportiva',
        name: 'Esportiva Bet',
        brandId: null,
        registerUrlTemplate: 'https://go.aff.esportiva.bet/urto4foy',
      },
      semlink: { slug: 'semlink', name: 'Casa Sem Link', brandId: null, registerUrlTemplate: null },
    },
  };

  it('gera com a tag pedida, ATIVO e com o destino taggeado', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'esportiva', tag: 'infinitw777' })
      .expect(201);
    expect(res.body).toMatchObject({
      tag: 'infinitw777',
      registerUrl: 'https://go.aff.esportiva.bet/urto4foy?afp=infinitw777',
      created: true,
    });
    const row = db.__store.get('affiliate_links')?.get(res.body.code);
    expect(row).toMatchObject({ affiliateId: 'AFF-1', brandId: 'esportiva', tag: 'infinitw777', active: true });
  });

  it('sem tag no corpo, sugere a partir do NOME do afiliado', async () => {
    const app = buildApp({ seed });
    const res = await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'esportiva' })
      .expect(201);
    expect(res.body.tag).toBe('mauriciofernandes');
  });

  it('idempotente por afiliado x casa: regerar ATUALIZA o mesmo code (o afiliado ja compartilhou)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const first = await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'esportiva', tag: 'tag1' })
      .expect(201);
    const second = await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'esportiva', tag: 'tag2' })
      .expect(200);
    expect(second.body.code).toBe(first.body.code);
    expect(second.body).toMatchObject({ tag: 'tag2', created: false });
    expect([...(db.__store.get('affiliate_links')?.values() ?? [])]).toHaveLength(1);
  });

  it('tag de OUTRO afiliado -> 409 (senao o resultado historico dele mudaria de dono)', async () => {
    const app = buildApp({
      seed: {
        ...seed,
        affiliate_links: {
          outro: { code: 'outro', affiliateId: 'AFF-9', registerUrl: 'https://casa.bet/r?afp=infinitw280', active: true },
        },
      },
    });
    await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'esportiva', tag: 'INFINITW280' }) // caixa nao distingue
      .expect(409);
  });

  it('apelido salvo tambem reserva a tag (mesma precedencia do import)', async () => {
    const app = buildApp({
      seed: {
        ...seed,
        affiliate_tag_aliases: { infinitw01: { tag: 'infinitw01', affiliateId: 'AFF-9' } },
      },
    });
    await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'esportiva', tag: 'infinitw01' })
      .expect(409);
  });

  it('casa sem link de cadastro -> 400 explicando onde preencher', async () => {
    const app = buildApp({ seed });
    const res = await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'semlink', tag: 'x1' })
      .expect(400);
    expect(res.body.error).toMatch(/casas/i);
  });

  it('sem casa -> 400; casa inexistente -> 404', async () => {
    const app = buildApp({ seed });
    await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1' })
      .expect(400);
    await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'nao-existe' })
      .expect(404);
  });

  it('audita a geracao com a tag (a trilha e o que liga o link ao relatorio da casa)', async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer admin-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'esportiva', tag: 'infinitw777' })
      .expect(201);
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs.some((l: any) => l.action === 'link.generate' && l.metadata?.tag === 'infinitw777')).toBe(true);
  });

  it('afiliado nao gera link (403)', async () => {
    const app = buildApp({ seed });
    await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer client-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'esportiva' })
      .expect(403);
  });

  // --- Item 1 (call Infinity 12/08): o ESPECIAL gera para a propria rede -------
  const specialSeed = {
    ...seed,
    users: {
      ...seed.users,
      'esp-uid': { role: 'client', affiliateId: 'AFF-ESP', isSpecial: true },
      'inativo-uid': { role: 'client', affiliateId: 'AFF-OFF' },
    },
    special_affiliates: {
      'AFF-ESP': { active: true, subAffiliateIds: ['AFF-1'] },
      'AFF-OFF': { active: false, subAffiliateIds: ['AFF-1'] },
    },
  };

  it('especial gera para um SUB da rede (201, carimbado com o uid dele)', async () => {
    const db = makeFirestore(specialSeed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
    const res = await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer esp-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'esportiva', tag: 'subtag01' })
      .expect(201);
    const row = db.__store.get('affiliate_links')?.get(res.body.code);
    expect(row).toMatchObject({ affiliateId: 'AFF-1', tag: 'subtag01', active: true, createdByUid: 'esp-uid' });
  });

  it('especial gera o PROPRIO link (201)', async () => {
    const app = buildApp({ seed: specialSeed });
    await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer esp-uid')
      .send({ affiliateId: 'AFF-ESP', brandId: 'esportiva', tag: 'meutag01' })
      .expect(201);
  });

  it('especial NAO gera para fora da rede (403) — barreira de IDOR do item 1', async () => {
    const app = buildApp({ seed: specialSeed });
    const res = await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer esp-uid')
      .send({ affiliateId: 'AFF-9', brandId: 'esportiva', tag: 'x1' })
      .expect(403);
    expect(res.body.error).toMatch(/rede/i);
  });

  it('registro de especial INATIVO nao gera (403, fail-closed)', async () => {
    const app = buildApp({ seed: specialSeed });
    await request(app)
      .post('/api/affiliate-links/generate')
      .set('Authorization', 'Bearer inativo-uid')
      .send({ affiliateId: 'AFF-1', brandId: 'esportiva', tag: 'x2' })
      .expect(403);
  });

  it('GET escopa o especial a rede (own + subs), sem vazar o pool nem link de fora', async () => {
    const app = buildApp({
      seed: {
        ...specialSeed,
        affiliate_links: {
          meu: { code: 'meu', affiliateId: 'AFF-ESP', registerUrl: 'https://casa.bet/r?afp=a' },
          dosub: { code: 'dosub', affiliateId: 'AFF-1', registerUrl: 'https://casa.bet/r?afp=b' },
          alheio: { code: 'alheio', affiliateId: 'AFF-9', registerUrl: 'https://casa.bet/r?afp=c' },
          pool: { code: 'pool', affiliateId: null, registerUrl: 'https://casa.bet/r?afp=d' },
        },
      },
    });
    const res = await request(app).get('/api/affiliate-links').set('Authorization', 'Bearer esp-uid').expect(200);
    expect(res.body.links.map((l: any) => l.code).sort()).toEqual(['dosub', 'meu']);
  });
});

// =============================================================================
// Pull automático do relatorio da casa (Esportiva / TAP by Smartico)
// Contrato e armadilhas: MIGRACAO-INFINITY-LEGADO.md §9.5.
// =============================================================================
describe('pull da Esportiva (/api/internal/esportiva-pull)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client', affiliateId: 'AFF-1' } },
    houses: { 'esportiva-bet': { slug: 'esportiva-bet', name: 'Esportiva Bet', dataSource: 'manual' } },
    affiliate_links: {
      L1: { code: 'L1', affiliateId: 'AFF-1', brandId: 'esportiva-bet', tag: 'infinitw02', registerUrl: 'https://go/x?afp=infinitw02', active: true },
    },
  };

  // Duas tags no mesmo dia: uma com dono (AFF-1) e uma orfa, mais trafego sem tag.
  const apiFetch = (rows?: any[]) => async () => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({
      meta: { affiliate_id: 544865 },
      data: rows ?? [
        { dt: '2026-08-03T00:00:00.000Z', afp: 'infinitw02', registration_count: 5, ftd_count: 3, deposit_total: 300, commissions_cpa: 360, commissions_rev_share: 2, commissions_total: 362 },
        { dt: '2026-08-03T00:00:00.000Z', afp: 'orfa99', registration_count: 2, ftd_count: 1, deposit_total: 100, commissions_cpa: 120, commissions_rev_share: 1, commissions_total: 121 },
        { dt: '2026-08-03T00:00:00.000Z', afp: '', registration_count: 1, ftd_count: 0, commissions_total: -5 },
      ],
    }),
  }) as any;

  const withKey = (fn: () => Promise<void>) => async () => {
    process.env.ESPORTIVA_API_KEY = 'chave-de-teste';
    process.env.ESPORTIVA_CPA_BASE = '120';
    try { await fn(); } finally {
      delete process.env.ESPORTIVA_API_KEY;
      delete process.env.ESPORTIVA_CPA_BASE;
    }
  };

  it('sem chave configurada -> 503 (feature off por instancia)', async () => {
    delete process.env.ESPORTIVA_API_KEY;
    await request(buildApp({ seed })).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(503);
  });

  it('afiliado nao dispara o pull (403)', withKey(async () => {
    await request(buildApp({ seed, fetchImpl: apiFetch() }))
      .post('/api/internal/esportiva-pull').set('Authorization', 'Bearer client-uid').expect(403);
  }));

  it('houseSlug de casa SEM integracao direta -> 400 e nada e gravado (bug do botao em /casas)', withKey(async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    const res = await request(app)
      .post('/api/internal/esportiva-pull')
      .set('Authorization', 'Bearer admin-uid')
      .send({ houseSlug: 'stake' })
      .expect(400);
    expect(res.body.error).toMatch(/integra/);
    expect(db.__store.get('house_results')?.size ?? 0).toBe(0);
  }));

  it('houseSlug da casa do conector passa normalmente', withKey(async () => {
    const app = buildApp({ seed, fetchImpl: apiFetch() });
    const res = await request(app)
      .post('/api/internal/esportiva-pull')
      .set('Authorization', 'Bearer admin-uid')
      .send({ houseSlug: 'esportiva-bet' })
      .expect(200);
    expect(res.body).toMatchObject({ ok: true, house: 'esportiva-bet' });
  }));

  // A casa DECLARA o conector na flag `integration` — Esportiva e' uma casa,
  // nao um gateway. O botao/anotacao seguem 100% a flag (+ conector configurado).
  const flaggedHouses = {
    ...seed,
    houses: {
      'esportiva-bet': { slug: 'esportiva-bet', name: 'Esportiva Bet', dataSource: 'manual', integration: 'esportiva-tap' },
      stake: { slug: 'stake', name: 'Stake', dataSource: 'manual' },
    },
  };

  it('GET /api/houses anota pullAvailable pela FLAG da casa (e nenhuma sem chave na instancia)', async () => {
    const flags = async () => {
      const res = await request(buildApp({ seed: flaggedHouses }))
        .get('/api/houses').set('Authorization', 'Bearer admin-uid').expect(200);
      return Object.fromEntries(res.body.houses.map((h: any) => [h.slug, h.pullAvailable]));
    };
    process.env.ESPORTIVA_API_KEY = 'chave-de-teste';
    try {
      expect(await flags()).toMatchObject({ 'esportiva-bet': true, stake: false });
    } finally {
      delete process.env.ESPORTIVA_API_KEY;
    }
    // flag presente mas conector sem chave (instancia sem a casa) -> nada de botao
    expect(await flags()).toMatchObject({ 'esportiva-bet': false, stake: false });
  });

  it('pull POR CASA: casa sem flag -> 400 sem writes; com flag roda o conector DELA', withKey(async () => {
    const db = makeFirestore(flaggedHouses);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    const bad = await request(app).post('/api/houses/stake/pull').set('Authorization', 'Bearer admin-uid').expect(400);
    expect(bad.body.error).toMatch(/integra/);
    expect(db.__store.get('house_results')?.size ?? 0).toBe(0);
    const ok = await request(app).post('/api/houses/esportiva-bet/pull').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(ok.body).toMatchObject({ ok: true, house: 'esportiva-bet', attributed: 1 });
  }));

  // --- B7: a configuracao passou a vir de `integrations/{id}`, env como fallback ---

  it('doc integrations DESLIGADO barra o pull mesmo com a chave no env (sem redeploy)', withKey(async () => {
    const db = makeFirestore({ ...seed, integrations: { 'esportiva-tap': { id: 'esportiva-tap', enabled: false, apiKey: 'k' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    const res = await request(app).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(503);
    expect(res.body.error).toMatch(/deslig/i);
    expect(db.__store.get('house_results')?.size ?? 0).toBe(0);
  }));

  it('chave do doc funciona SEM env nenhuma (instancia 100% Firestore)', async () => {
    delete process.env.ESPORTIVA_API_KEY;
    const db = makeFirestore({
      ...seed,
      integrations: { 'esportiva-tap': { id: 'esportiva-tap', enabled: true, apiKey: 'chave-da-tela', houseId: 'esportiva-bet' } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    const res = await request(app).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(res.body).toMatchObject({ ok: true, house: 'esportiva-bet' });
  });

  it('desligar pela tela apaga o botao Atualizar de /casas na hora (pullAvailable=false)', withKey(async () => {
    const off = makeFirestore({ ...flaggedHouses, integrations: { 'esportiva-tap': { id: 'esportiva-tap', enabled: false } } });
    const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: off, fetchImpl: apiFetch() }))
      .get('/api/houses').set('Authorization', 'Bearer admin-uid').expect(200);
    const flags = Object.fromEntries(res.body.houses.map((h: any) => [h.slug, h.pullAvailable]));
    expect(flags).toMatchObject({ 'esportiva-bet': false });
  }));

  it('pull POR CASA: flag presente mas conector sem chave -> 503; afiliado -> 403; casa inexistente -> 404', async () => {
    delete process.env.ESPORTIVA_API_KEY;
    const app = buildApp({ seed: flaggedHouses, fetchImpl: apiFetch() });
    await request(app).post('/api/houses/esportiva-bet/pull').set('Authorization', 'Bearer admin-uid').expect(503);
    await request(app).post('/api/houses/esportiva-bet/pull').set('Authorization', 'Bearer client-uid').expect(403);
    await request(app).post('/api/houses/nao-existe/pull').set('Authorization', 'Bearer admin-uid').expect(404);
  });

  it('a rodada CARIMBA a flag integration na casa (instancia existente se auto-migra)', withKey(async () => {
    const db = makeFirestore(seed); // casa AINDA sem a flag
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    await request(app).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(db.__store.get('houses')?.get('esportiva-bet')?.integration).toBe('esportiva-tap');
  }));

  // O "cron sumido" de 08/08: casa fecha o dia com atraso -> de madrugada a janela
  // vem vazia, a rota respondia 200 SEM gravar nada e o /casas sugeria robo quebrado.
  it('janela VAZIA: 200 com note, carimba VERIFICACAO + flag, e NAO mexe no frescor do dado', withKey(async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch([]) });
    const res = await request(app).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(res.body).toMatchObject({ ok: true, imported: 0 });
    expect(String(res.body.note ?? '')).toMatch(/devolveu linhas/);
    const house = db.__store.get('houses')?.get('esportiva-bet');
    expect(house.integration).toBe('esportiva-tap'); // flag chega mesmo sem dado
    expect(house.lastResultsCheckAt).toBeTruthy(); // a checagem fica registrada
    expect(house.lastResultsSyncAt).toBeUndefined(); // frescor do DADO intacto
    expect(db.__store.get('house_results')?.size ?? 0).toBe(0); // nada importado
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    expect(logs.some((l: any) => l.action === 'house_results.pull')).toBe(false); // sem spam horario
  }));

  it('grava agregado do dia + linha do afiliado, e a tag orfa fica PENDENTE', withKey(async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    const res = await request(app).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(200);

    expect(res.body).toMatchObject({ ok: true, house: 'esportiva-bet', attributed: 1 });
    expect(res.body.pending.map((p: any) => p.tag)).toEqual(['orfa99']);

    const rows = [...(db.__store.get('house_results')?.values() ?? [])];
    const agg = rows.find((r: any) => r.affiliateId === null);
    const mine = rows.find((r: any) => r.affiliateId === 'AFF-1');
    // agregado = TUDO do dia (com dono + orfa + sem tag): 362 + 121 - 5
    expect(agg.total_commission).toBeCloseTo(478, 2);
    expect(agg.registrations).toBe(8);
    // a linha do afiliado tem so' o que e' dele, com a CONTAGEM derivada (360/120)
    expect(mine).toMatchObject({ registrations: 5, first_deposits: 3, qualified_cpa: 3, total_commission: 362 });
    // a orfa NAO virou linha atribuida a ninguem
    expect(rows.some((r: any) => String(r.affiliateId ?? '').includes('orfa'))).toBe(false);
  }));

  it('carimba o frescor na casa (o que o afiliado le no painel)', withKey(async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    await request(app).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    const house = db.__store.get('houses')?.get('esportiva-bet');
    expect(house.lastResultsSyncSource).toBe('api');
    expect(house.lastResultsSyncAt).toBeTruthy();
    expect(house.lastResultsDate).toBe('2026-08-03');
  }));

  it('rodar de novo REESCREVE o dia em vez de duplicar (a rodada e horaria)', withKey(async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    await request(app).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    const first = [...(db.__store.get('house_results')?.values() ?? [])].length;
    await request(app).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    expect([...(db.__store.get('house_results')?.values() ?? [])].length).toBe(first);
  }));

  it('audita a rodada com as tags pendentes e o resto do CPA', withKey(async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    await request(app).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    const log = [...(db.__store.get('audit_logs')?.values() ?? [])].find((l: any) => l.action === 'house_results.pull');
    expect(log.metadata).toMatchObject({ attributed: 1, pendingTags: ['orfa99'], cpaRemainder: 0, via: 'admin' });
  }));

  it('regua de CPA trocada aparece no cpaRemainder (nao some no arredondamento)', withKey(async () => {
    const app = buildApp({ seed, fetchImpl: apiFetch([{ dt: '2026-08-03T00:00:00.000Z', afp: 'infinitw02', commissions_cpa: 250, commissions_total: 250 }]) });
    const res = await request(app).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(res.body.cpaRemainder).toBeGreaterThan(0);
  }));

  it('erro de permissao da casa vira 502 com a mensagem dela', withKey(async () => {
    const fetchImpl = (async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ message: "You don't have permissions to resource 'af2_media_report_op'." }),
    })) as any;
    const res = await request(buildApp({ seed, fetchImpl })).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(502);
    expect(res.body.error).toMatch(/permissions/i);
  }));

  it('janela vazia nao apaga nada nem carimba', withKey(async () => {
    const db = makeFirestore({ ...seed, house_results: { velha: { houseSlug: 'esportiva-bet', date: '2026-07-01', affiliateId: null, total_commission: 99 } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch([]) });
    const res = await request(app).post('/api/internal/esportiva-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(res.body.imported).toBe(0);
    expect(db.__store.get('house_results')?.get('velha').total_commission).toBe(99);
    expect(db.__store.get('houses')?.get('esportiva-bet').lastResultsSyncAt).toBeUndefined();
  }));
});

// =============================================================================
// Pull automatico da LEON Bet (R2D Partners / Quintessence)
// Recon + vinculo tag->afiliado confirmado ao vivo 11-12/08/2026 (ver memoria
// de sessao). Diferenca central p/ a Esportiva: cpa_qualified ja vem CONTAGEM
// (sem regua) e a API devolve um array NU (sem envelope `{data:[...]}`).
// =============================================================================
describe('pull da LEON Bet (/api/internal/leonbet-pull)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client', affiliateId: 'AFF-1' } },
    houses: { 'leon-bet': { slug: 'leon-bet', name: 'LEON Bet', dataSource: 'manual' } },
    affiliate_links: {
      L1: {
        code: 'L1', affiliateId: 'AFF-1', brandId: 'leon-bet', tag: 'cgverify0811',
        registerUrl: 'https://9behi4y9oh.com/?serial=61260&creative_id=311&anid=cgverify0811', active: true,
      },
    },
  };

  // Uma tag nossa (cadastro sem deposito ainda), uma orfa com dinheiro de verdade,
  // e uma linha sem tag no formato LITERAL que a API usa ("< empty >").
  const apiFetch = (rows?: any[]) => async () => ({
    ok: true, status: 200,
    text: async () => JSON.stringify(rows ?? [
      { transaction_date: '2026-08-12T00:00:00.000Z', anid1: 'cgverify0811', registration_count: 1, first_deposit_count: 0, cpa_qualified: 0, revenue_share_profit: 0, deposits: 0, profit: 0 },
      { transaction_date: '2026-08-12T00:00:00.000Z', anid1: 'orfa02', registration_count: 1, first_deposit_count: 1, cpa_qualified: 1, revenue_share_profit: 3.42, deposits: 12.83, profit: 20.42 },
      { transaction_date: '2026-08-12T00:00:00.000Z', an_id: '< empty >', anid1: '< empty >', registration_count: 0, first_deposit_count: 0, cpa_qualified: 0, revenue_share_profit: 2.78, deposits: 10.38, profit: 2.78 },
    ]),
  }) as any;

  const withKey = (fn: () => Promise<void>) => async () => {
    process.env.LEONBET_API_TOKEN = 'token-de-teste';
    try { await fn(); } finally { delete process.env.LEONBET_API_TOKEN; }
  };

  it('sem token configurado -> 503 (feature off por instancia)', async () => {
    delete process.env.LEONBET_API_TOKEN;
    await request(buildApp({ seed })).post('/api/internal/leonbet-pull').set('Authorization', 'Bearer admin-uid').expect(503);
  });

  it('afiliado nao dispara o pull (403)', withKey(async () => {
    await request(buildApp({ seed, fetchImpl: apiFetch() }))
      .post('/api/internal/leonbet-pull').set('Authorization', 'Bearer client-uid').expect(403);
  }));

  it('houseSlug de casa SEM integracao direta -> 400 e nada e gravado', withKey(async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    const res = await request(app)
      .post('/api/internal/leonbet-pull').set('Authorization', 'Bearer admin-uid').send({ houseSlug: 'stake' }).expect(400);
    expect(res.body.error).toMatch(/integra/);
    expect(db.__store.get('house_results')?.size ?? 0).toBe(0);
  }));

  it('grava agregado do dia + linha do afiliado; tag orfa COM dinheiro fica pendente; "< empty >" NAO vira tag fantasma', withKey(async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    const res = await request(app).post('/api/internal/leonbet-pull').set('Authorization', 'Bearer admin-uid').expect(200);

    expect(res.body).toMatchObject({ ok: true, house: 'leon-bet', attributed: 1 });
    expect(res.body.pending.map((p: any) => p.tag)).toEqual(['orfa02']);

    const rows = [...(db.__store.get('house_results')?.values() ?? [])];
    const agg = rows.find((r: any) => r.affiliateId === null);
    const mine = rows.find((r: any) => r.affiliateId === 'AFF-1');
    expect(agg.total_commission).toBeCloseTo(23.2, 2); // 0 + 20.42 + 2.78
    expect(agg.registrations).toBe(2); // 1 (nossa) + 1 (orfa) + 0
    // cadastro tagueado nosso, AINDA sem deposito — precisa entrar mesmo a R$0
    expect(mine).toMatchObject({ registrations: 1, deposit: 0, total_commission: 0 });
  }));

  it('janela VAZIA: 200 com note, carimba checagem + flag, mas NAO mexe no frescor do dado', withKey(async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch([]) });
    const res = await request(app).post('/api/internal/leonbet-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(res.body).toMatchObject({ ok: true, imported: 0 });
    const house = db.__store.get('houses')?.get('leon-bet');
    expect(house.integration).toBe('leonbet-r2d'); // flag chega mesmo sem dado
    expect(house.lastResultsCheckAt).toBeTruthy();
    expect(house.lastResultsSyncAt).toBeUndefined();
  }));

  it('carimba o frescor + a flag integration na casa', withKey(async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    await request(app).post('/api/internal/leonbet-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    const house = db.__store.get('houses')?.get('leon-bet');
    expect(house.integration).toBe('leonbet-r2d');
    expect(house.lastResultsSyncSource).toBe('api');
    expect(house.lastResultsDate).toBe('2026-08-12');
  }));

  it('rodar de novo REESCREVE o dia em vez de duplicar', withKey(async () => {
    const db = makeFirestore(seed);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    await request(app).post('/api/internal/leonbet-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    const first = [...(db.__store.get('house_results')?.values() ?? [])].length;
    await request(app).post('/api/internal/leonbet-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    expect([...(db.__store.get('house_results')?.values() ?? [])].length).toBe(first);
  }));

  it('pull POR CASA (/api/houses/:slug/pull) despacha pela flag da casa', withKey(async () => {
    const flagged = {
      ...seed,
      houses: {
        'leon-bet': { ...seed.houses['leon-bet'], integration: 'leonbet-r2d' },
        stake: { slug: 'stake', name: 'Stake', dataSource: 'manual' },
      },
    };
    const db = makeFirestore(flagged);
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    const bad = await request(app).post('/api/houses/stake/pull').set('Authorization', 'Bearer admin-uid').expect(400);
    expect(bad.body.error).toMatch(/integra/);
    const ok = await request(app).post('/api/houses/leon-bet/pull').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(ok.body).toMatchObject({ ok: true, house: 'leon-bet' });
  }));

  it('doc integrations DESLIGADO barra o pull mesmo com token no env (sem redeploy)', withKey(async () => {
    const db = makeFirestore({ ...seed, integrations: { 'leonbet-r2d': { id: 'leonbet-r2d', enabled: false, apiKey: 'k' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl: apiFetch() });
    const res = await request(app).post('/api/internal/leonbet-pull').set('Authorization', 'Bearer admin-uid').expect(503);
    expect(res.body.error).toMatch(/deslig/i);
  }));

  it('usa o merchant configurado na tela na URL da API (nao fica fixo em 1)', withKey(async () => {
    let calledUrl = '';
    const fetchImpl = (async (url: string) => {
      calledUrl = url;
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    }) as any;
    const db = makeFirestore({
      ...seed,
      integrations: { 'leonbet-r2d': { id: 'leonbet-r2d', enabled: true, apiKey: 'tok', houseId: 'leon-bet', config: { merchant: '3' } } },
    });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: db, fetchImpl });
    await request(app).post('/api/internal/leonbet-pull').set('Authorization', 'Bearer admin-uid').expect(200);
    expect(calledUrl).toContain('merchant=3');
  }));

  it('erro da API (ex.: range invalido) vira 502 com a mensagem dela', withKey(async () => {
    const fetchImpl = (async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 'Invalid date range' }) })) as any;
    const res = await request(buildApp({ seed, fetchImpl })).post('/api/internal/leonbet-pull').set('Authorization', 'Bearer admin-uid').expect(502);
    expect(res.body.error).toMatch(/Invalid date range/);
  }));
});

// =============================================================================
// B7 · Integracoes (/api/integrations) — a chave da casa e' CREDENCIAL: nunca
// volta ao browser em claro, e a colecao e' server-only (rule `if false`).
// =============================================================================
describe('integracoes (/api/integrations)', () => {
  const seed = {
    users: { 'admin-uid': { role: 'admin' }, 'client-uid': { role: 'client', affiliateId: 'AFF-1' } },
    houses: { 'esportiva-bet': { slug: 'esportiva-bet', name: 'Esportiva Bet', dataSource: 'manual' } },
  };

  it('afiliado nao acessa (403) e sem token 401', async () => {
    const app = buildApp({ seed });
    await request(app).get('/api/integrations').expect(401);
    await request(app).get('/api/integrations').set('Authorization', 'Bearer client-uid').expect(403);
    await request(app).put('/api/integrations/esportiva-tap').set('Authorization', 'Bearer client-uid').send({ enabled: true }).expect(403);
  });

  it('GET lista o catalogo com a chave MASCARADA (nunca em claro)', async () => {
    process.env.ESPORTIVA_API_KEY = 'chave-secreta-9999';
    try {
      const res = await request(buildApp({ seed })).get('/api/integrations').set('Authorization', 'Bearer admin-uid').expect(200);
      const esp = res.body.integrations.find((i: any) => i.id === 'esportiva-tap');
      expect(esp).toMatchObject({ hasKey: true, keyMask: '••••9999', keyFromEnv: true, configured: true });
      expect(JSON.stringify(res.body)).not.toContain('chave-secreta-9999');
    } finally {
      delete process.env.ESPORTIVA_API_KEY;
    }
  });

  it('PUT grava a chave e ela NAO volta na resposta', async () => {
    const db = makeFirestore(seed);
    const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .put('/api/integrations/esportiva-tap')
      .set('Authorization', 'Bearer admin-uid')
      .send({ apiKey: 'nova-chave-4321', enabled: true })
      .expect(200);
    expect(res.body).toMatchObject({ hasKey: true, keyMask: '••••4321' });
    expect(JSON.stringify(res.body)).not.toContain('nova-chave-4321');
    expect(db.__store.get('integrations')?.get('esportiva-tap')?.apiKey).toBe('nova-chave-4321');
  });

  it('salvar sem digitar a chave NAO apaga a gravada', async () => {
    const db = makeFirestore({ ...seed, integrations: { 'esportiva-tap': { id: 'esportiva-tap', enabled: true, apiKey: 'ja-gravada' } } });
    await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .put('/api/integrations/esportiva-tap')
      .set('Authorization', 'Bearer admin-uid')
      .send({ enabled: false, apiKey: '' })
      .expect(200);
    const doc = db.__store.get('integrations')?.get('esportiva-tap');
    expect(doc?.apiKey).toBe('ja-gravada');
    expect(doc?.enabled).toBe(false);
  });

  it('vincular a casa carimba houses/{slug}.integration (as duas pontas coerentes)', async () => {
    const db = makeFirestore(seed);
    await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .put('/api/integrations/esportiva-tap')
      .set('Authorization', 'Bearer admin-uid')
      .send({ houseId: 'esportiva-bet' })
      .expect(200);
    expect(db.__store.get('houses')?.get('esportiva-bet')?.integration).toBe('esportiva-tap');
  });

  it('id fora do catalogo -> 404 (a colecao nao vira deposito)', async () => {
    const db = makeFirestore(seed);
    await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .put('/api/integrations/inventada')
      .set('Authorization', 'Bearer admin-uid')
      .send({ apiKey: 'x' })
      .expect(404);
    expect(db.__store.get('integrations')?.size ?? 0).toBe(0);
  });

  it('auditoria registra a mudanca SEM o valor da chave', async () => {
    const db = makeFirestore(seed);
    await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .put('/api/integrations/esportiva-tap')
      .set('Authorization', 'Bearer admin-uid')
      .send({ apiKey: 'segredo-do-cliente', enabled: false })
      .expect(200);
    const logs = [...(db.__store.get('audit_logs')?.values() ?? [])];
    const log = logs.find((l: any) => l.action === 'integration.update');
    expect(log).toMatchObject({ entityType: 'integration', entityId: 'esportiva-tap' });
    expect(log.metadata?.keyChanged).toBe(true);
    expect(JSON.stringify(log)).not.toContain('segredo-do-cliente');
  });

  // --- Vinculo pelo lado da CASA (modal de /casas -> "Pull automatico") -------
  // O vinculo e 1:1 e vive em DOIS docs; as duas telas escrevem pelo mesmo helper,
  // senao a tela diz "ligada na casa X" e o botao da casa X nao aparece.

  const twoHouses = {
    ...seed,
    houses: {
      'esportiva-bet': { slug: 'esportiva-bet', name: 'Esportiva Bet', dataSource: 'manual' },
      stake: { slug: 'stake', name: 'Stake', dataSource: 'manual' },
    },
  };

  it('PATCH da casa com integration carimba os DOIS lados', async () => {
    const db = makeFirestore(twoHouses);
    const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .patch('/api/houses/esportiva-bet')
      .set('Authorization', 'Bearer admin-uid')
      .send({ integration: 'esportiva-tap' })
      .expect(200);
    expect(res.body.integration).toBe('esportiva-tap');
    expect(db.__store.get('houses')?.get('esportiva-bet')?.integration).toBe('esportiva-tap');
    expect(db.__store.get('integrations')?.get('esportiva-tap')?.houseId).toBe('esportiva-bet');
  });

  it('trocar a casa vinculada LIMPA a anterior (o conector serve uma casa so)', async () => {
    const db = makeFirestore({
      ...twoHouses,
      integrations: { 'esportiva-tap': { id: 'esportiva-tap', enabled: true, houseId: 'esportiva-bet' } },
      houses: { ...twoHouses.houses, 'esportiva-bet': { ...twoHouses.houses['esportiva-bet'], integration: 'esportiva-tap' } },
    });
    await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .patch('/api/houses/stake')
      .set('Authorization', 'Bearer admin-uid')
      .send({ integration: 'esportiva-tap' })
      .expect(200);
    expect(db.__store.get('houses')?.get('stake')?.integration).toBe('esportiva-tap');
    expect(db.__store.get('houses')?.get('esportiva-bet')?.integration ?? null).toBeNull();
    expect(db.__store.get('integrations')?.get('esportiva-tap')?.houseId).toBe('stake');
  });

  it('voltar a casa para upload manual DESVINCULA os dois lados', async () => {
    const db = makeFirestore({
      ...twoHouses,
      integrations: { 'esportiva-tap': { id: 'esportiva-tap', enabled: true, houseId: 'esportiva-bet' } },
      houses: { ...twoHouses.houses, 'esportiva-bet': { ...twoHouses.houses['esportiva-bet'], integration: 'esportiva-tap' } },
    });
    const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .patch('/api/houses/esportiva-bet')
      .set('Authorization', 'Bearer admin-uid')
      .send({ dataSource: 'manual', integration: null })
      .expect(200);
    expect(res.body.integration).toBeNull();
    expect(db.__store.get('houses')?.get('esportiva-bet')?.integration ?? null).toBeNull();
    expect(db.__store.get('integrations')?.get('esportiva-tap')?.houseId).toBeNull();
  });

  it('integration fora do catalogo -> 400 e nada e gravado', async () => {
    const db = makeFirestore(twoHouses);
    const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .patch('/api/houses/esportiva-bet')
      .set('Authorization', 'Bearer admin-uid')
      .send({ integration: 'inventada' })
      .expect(400);
    expect(res.body.error).toMatch(/desconhecida/i);
    expect(db.__store.get('houses')?.get('esportiva-bet')?.integration ?? null).toBeNull();
    expect(db.__store.get('integrations')?.size ?? 0).toBe(0);
  });

  it('a mudanca de vinculo entra na auditoria da casa', async () => {
    const db = makeFirestore(twoHouses);
    await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .patch('/api/houses/esportiva-bet')
      .set('Authorization', 'Bearer admin-uid')
      .send({ integration: 'esportiva-tap' })
      .expect(200);
    const log = [...(db.__store.get('audit_logs')?.values() ?? [])].find((l: any) => l.action === 'house.update');
    expect(log.changes).toContainEqual({ field: 'integration', before: null, after: 'esportiva-tap' });
  });

  it('casa NOVA pode ja nascer vinculada', async () => {
    const db = makeFirestore(seed);
    const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .post('/api/houses')
      .set('Authorization', 'Bearer admin-uid')
      .send({ name: 'Casa Nova', slug: 'casa-nova', integration: 'esportiva-tap' })
      .expect(201);
    expect(res.body.integration).toBe('esportiva-tap');
    expect(db.__store.get('integrations')?.get('esportiva-tap')?.houseId).toBe('casa-nova');
  });

  it('vinculo pelo lado da CASA faz o botao Atualizar aparecer nela', async () => {
    process.env.ESPORTIVA_API_KEY = 'chave-de-teste';
    try {
      const db = makeFirestore(twoHouses);
      const app = createApp({ adminApp: makeAdminApp(), adminDb: db });
      await request(app).patch('/api/houses/stake').set('Authorization', 'Bearer admin-uid')
        .send({ integration: 'esportiva-tap' }).expect(200);
      const res = await request(app).get('/api/houses').set('Authorization', 'Bearer admin-uid').expect(200);
      const flags = Object.fromEntries(res.body.houses.map((h: any) => [h.slug, h.pullAvailable]));
      expect(flags).toMatchObject({ stake: true, 'esportiva-bet': false });
    } finally {
      delete process.env.ESPORTIVA_API_KEY;
    }
  });
});

// =============================================================================
// Logo da casa SEM Storage — fallback inline (data URL no doc da casa). Caso
// real: a Infinity nunca ativou o Storage no projeto e o upload da logo da LEON
// morria em "bucket inexistente" (2026-08-14). Nos testes NÃO existe app default
// do firebase-admin, então admin.storage() lança — exatamente o cenário da
// instância sem bucket.
// =============================================================================
describe('logo da casa sem Storage (fallback inline)', () => {
  const logoSeed = {
    users: { 'admin-uid': { role: 'admin' } },
    houses: { 'leon-bet': { slug: 'leon-bet', name: 'LEON Bet', dataSource: 'manual' } },
  };
  const SVG_DATA_URL = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`;

  it('PATCH com logo pequena grava a PRÓPRIA data URL no doc da casa', async () => {
    const db = makeFirestore(logoSeed);
    const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .patch('/api/houses/leon-bet')
      .set('Authorization', 'Bearer admin-uid')
      .send({ logoBase64: SVG_DATA_URL })
      .expect(200);
    expect(res.body.logo).toBe(SVG_DATA_URL);
    expect(db.__store.get('houses')?.get('leon-bet')?.logo).toBe(SVG_DATA_URL);
  });

  it('POST de casa nova com logo pequena também cai no inline', async () => {
    const db = makeFirestore({ users: logoSeed.users });
    const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .post('/api/houses')
      .set('Authorization', 'Bearer admin-uid')
      .send({ name: 'LEON Bet', logoBase64: SVG_DATA_URL })
      .expect(201);
    expect(res.body.logo).toBe(SVG_DATA_URL);
    expect(db.__store.get('houses')?.get('leon-bet')?.logo).toBe(SVG_DATA_URL);
  });

  it('imagem acima do teto inline (200KB) sem Storage → erro claro, nada gravado', async () => {
    const db = makeFirestore(logoSeed);
    const big = `data:image/png;base64,${Buffer.alloc(300 * 1024, 7).toString('base64')}`;
    const res = await request(createApp({ adminApp: makeAdminApp(), adminDb: db }))
      .patch('/api/houses/leon-bet')
      .set('Authorization', 'Bearer admin-uid')
      .send({ logoBase64: big })
      .expect(500);
    expect(res.body.error).toMatch(/storage/i);
    expect(db.__store.get('houses')?.get('leon-bet')?.logo ?? null).toBeNull();
  });
});

// =============================================================================
// Validação de telefone por SMS (/api/phone) — item 7 da call Infinity
// =============================================================================
describe('validação de telefone por SMS (/api/phone)', () => {
  const future = () => ({ toMillis: () => Date.now() + 3_600_000 });
  const PHONE = '(11) 98765-4321';
  const E164 = '+5511987654321';
  const DOC_ID = '5511987654321';

  // Provedor de teste: captura o SMS em vez de enviar (ServerDeps.smsProvider).
  const captureSms = () => {
    const sent: Array<{ to: string; body: string }> = [];
    return {
      sent,
      provider: { id: 'console', send: async (to: string, body: string) => { sent.push({ to, body }); } },
    };
  };
  const codeFrom = (body: string) => (body.match(/\d{6}/) || [''])[0];
  const logsOf = (db: any, action: string) =>
    [...(db.__store.get('audit_logs')?.values() ?? [])].filter((l: any) => l.action === action);

  beforeEach(() => {
    // Liga a feature (modo console/dev — sem credencial de provedor).
    process.env.PHONE_VERIFICATION_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.PHONE_VERIFICATION_ENABLED;
  });

  it('feature OFF (env ausente): status enabled:false, send-code 503 e o cadastro por convite NÃO quebra', async () => {
    delete process.env.PHONE_VERIFICATION_ENABLED;
    const fs = makeFirestore({
      invites: { t1: { status: 'pending', affiliateId: 'AFF-1', affiliateName: 'Casa', expiresAt: future() } },
    });
    const app = createApp({ adminApp: makeAdminApp({ createUser: () => ({ uid: 'fresh-uid' }) }), adminDb: fs });

    const status = await request(app).get('/api/phone/status').expect(200);
    expect(status.body.enabled).toBe(false);

    await request(app).post('/api/phone/send-code').send({ phone: PHONE }).expect(503);

    // Fail-safe: sem provedor configurado o accept-invite segue como sempre.
    await request(app)
      .post('/api/accept-invite')
      .send({ token: 't1', email: 'a@b.com', password: 'secret123', phone: PHONE })
      .expect(201);
    const userDoc = fs.__store.get('users').get('fresh-uid');
    expect(userDoc.phone).toBe(PHONE);
    expect(userDoc.phoneVerified).toBeUndefined();
  });

  it('send-code: telefone inválido (fixo/lixo) → 400', async () => {
    const { provider } = captureSms();
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(), smsProvider: provider });
    await request(app).post('/api/phone/send-code').send({ phone: '(11) 3765-4321' }).expect(400);
    await request(app).post('/api/phone/send-code').send({ phone: 'abc' }).expect(400);
  });

  it('send-code: envia o SMS com código de 6 dígitos, grava só o HASH e nunca devolve o código', async () => {
    const { sent, provider } = captureSms();
    const fs = makeFirestore();
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, smsProvider: provider });
    const res = await request(app).post('/api/phone/send-code').send({ phone: PHONE }).expect(200);

    expect(res.body.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(E164);
    const code = codeFrom(sent[0].body);
    expect(code).toMatch(/^\d{6}$/);
    expect(JSON.stringify(res.body)).not.toContain(code); // o código NUNCA volta na resposta

    const challenge = fs.__store.get('phone_verifications').get(DOC_ID);
    expect(challenge.codeHash).toBeTruthy();
    expect(JSON.stringify(challenge)).not.toContain(code); // nem fica em claro no doc
  });

  it('send-code: reenvio imediato do MESMO telefone → 429 (cooldown)', async () => {
    const { provider } = captureSms();
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(), smsProvider: provider });
    await request(app).post('/api/phone/send-code').send({ phone: PHONE }).expect(200);
    const res = await request(app).post('/api/phone/send-code').send({ phone: PHONE }).expect(429);
    expect(res.body.code).toBe('OTP_COOLDOWN');
  });

  it('rate limit por IP: o 11º envio (telefones diferentes) → 429', async () => {
    const { provider } = captureSms();
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(), smsProvider: provider });
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      lastStatus = (await request(app).post('/api/phone/send-code').send({ phone: `119${8000 + i}0432${i % 10}` })).status;
    }
    expect(lastStatus).toBe(429);
  });

  it('verify-code: código errado → 400 e conta a tentativa; 5 erradas travam mesmo o código certo', async () => {
    const { sent, provider } = captureSms();
    const fs = makeFirestore();
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, smsProvider: provider });
    await request(app).post('/api/phone/send-code').send({ phone: PHONE }).expect(200);
    const code = codeFrom(sent[0].body);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 1; i <= 5; i++) {
      const res = await request(app).post('/api/phone/verify-code').send({ phone: PHONE, code: wrong }).expect(400);
      expect(res.body.code).toBe('OTP_INVALID');
      expect(fs.__store.get('phone_verifications').get(DOC_ID).attempts).toBe(i);
    }
    // Tentativas esgotadas: nem o código CERTO passa (peça um novo código).
    const blocked = await request(app).post('/api/phone/verify-code').send({ phone: PHONE, code }).expect(429);
    expect(blocked.body.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('verify-code: código expirado → 410', async () => {
    const { sent, provider } = captureSms();
    const fs = makeFirestore();
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, smsProvider: provider });
    await request(app).post('/api/phone/send-code').send({ phone: PHONE }).expect(200);
    // Volta o relógio do desafio: expirou há 1ms.
    const col = fs.__store.get('phone_verifications');
    col.set(DOC_ID, { ...col.get(DOC_ID), expiresAtMs: Date.now() - 1 });
    const res = await request(app)
      .post('/api/phone/verify-code')
      .send({ phone: PHONE, code: codeFrom(sent[0].body) })
      .expect(410);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('fluxo completo do convite: verify-code emite token de USO ÚNICO → accept-invite grava E.164 + phoneVerified', async () => {
    const { sent, provider } = captureSms();
    const fs = makeFirestore({
      invites: { t1: { status: 'pending', affiliateId: 'AFF-1', affiliateName: 'Casa', expiresAt: future() } },
      users: { 'client-uid': { role: 'client' } },
    });
    const app = createApp({
      adminApp: makeAdminApp({ createUser: () => ({ uid: 'fresh-uid' }) }),
      adminDb: fs,
      smsProvider: provider,
    });

    // Sem verificação → o aceite é barrado (a feature está LIGADA).
    const denied = await request(app)
      .post('/api/accept-invite')
      .send({ token: 't1', email: 'a@b.com', password: 'secret123', phone: PHONE })
      .expect(400);
    expect(denied.body.code).toBe('PHONE_NOT_VERIFIED');

    await request(app).post('/api/phone/send-code').send({ phone: PHONE }).expect(200);
    const verify = await request(app)
      .post('/api/phone/verify-code')
      .send({ phone: PHONE, code: codeFrom(sent[0].body) })
      .expect(200);
    const token = verify.body.verificationToken;
    expect(token).toBeTruthy();

    await request(app)
      .post('/api/accept-invite')
      .send({ token: 't1', email: 'a@b.com', password: 'secret123', phone: PHONE, phoneVerificationToken: token })
      .expect(201);
    const userDoc = fs.__store.get('users').get('fresh-uid');
    expect(userDoc.phone).toBe(E164); // telefone gravado NORMALIZADO
    expect(userDoc.phoneVerified).toBe(true);
    expect(fs.__store.get('phone_verifications').get(DOC_ID).consumedAtMs).toBeTruthy();

    // USO ÚNICO: o mesmo token não carimba outra conta via /api/phone/attach.
    const reuse = await request(app)
      .post('/api/phone/attach')
      .set('Authorization', 'Bearer client-uid')
      .send({ phone: PHONE, verificationToken: token })
      .expect(400);
    expect(reuse.body.code).toBe('PHONE_TOKEN_INVALID');
  });

  it('attach (auto-cadastro): usuário autenticado carimba phone+phoneVerified no PRÓPRIO doc, com trilha mascarada', async () => {
    const { sent, provider } = captureSms();
    const fs = makeFirestore({ users: { 'client-uid': { role: 'client', name: 'Fulano' } } });
    const app = createApp({ adminApp: makeAdminApp(), adminDb: fs, smsProvider: provider });

    await request(app).post('/api/phone/send-code').send({ phone: PHONE }).expect(200);
    const verify = await request(app)
      .post('/api/phone/verify-code')
      .send({ phone: PHONE, code: codeFrom(sent[0].body) })
      .expect(200);

    // Token inválido → 400 (não carimba).
    await request(app)
      .post('/api/phone/attach')
      .set('Authorization', 'Bearer client-uid')
      .send({ phone: PHONE, verificationToken: 'token-forjado' })
      .expect(400);

    await request(app)
      .post('/api/phone/attach')
      .set('Authorization', 'Bearer client-uid')
      .send({ phone: PHONE, verificationToken: verify.body.verificationToken })
      .expect(200);

    const userDoc = fs.__store.get('users').get('client-uid');
    expect(userDoc.phone).toBe(E164);
    expect(userDoc.phoneVerified).toBe(true);

    // Auditoria: registra a verificação SEM o telefone inteiro (PII mascarada).
    const logs = logsOf(fs, 'user.phone_verified');
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0])).not.toContain(DOC_ID);
    expect((logs[0] as any).metadata.phone).toBe('+5511*****4321');
  });

  it('attach sem login → 401 (requireAuth)', async () => {
    const { provider } = captureSms();
    const app = createApp({ adminApp: makeAdminApp(), adminDb: makeFirestore(), smsProvider: provider });
    await request(app).post('/api/phone/attach').send({ phone: PHONE, verificationToken: 'x' }).expect(401);
  });
});
