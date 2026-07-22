#!/usr/bin/env node
/**
 * P4 (produtização) · Bootstrap dos ADMINS de uma instância nova.
 *
 * As rules travam `role` no client (R6) e o /api/create-user exige um admin — numa
 * instância recém-provisionada não existe nenhum. Este script roda com o Admin SDK
 * (service account DA INSTÂNCIA) e cria/promove admins com segurança: a senha é
 * GERADA forte pelo script (ninguém digita), impressa UMA vez no final.
 *
 * Uso (na raiz do repo, com o service-account.json DA INSTÂNCIA):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/provision/bootstrap-admin.cjs \
 *       --email admin@cliente.com --name "Admin do Cliente" \
 *       --test-user voce@cliente.com          # opcional: 2º admin p/ smoke test
 *
 * Duas contas:
 *   - PRIMÁRIA (--email/--name): admin do CLIENTE. mustChangePassword=true → troca
 *     no 1º login.
 *   - TESTE (--test-user, opcional): admin da AffiliaCore p/ smoke test.
 *     mustChangePassword=FALSE → entra direto, sem tela de troca. --test-name e
 *     --test-password são opcionais (nome default "AffiliaCore (teste)").
 *
 * Flags: --email* --name* [--password] [--test-user [--test-name] [--test-password]]
 * Idempotente: e-mail com login já existente é só PROMOVIDO (mantém a senha atual).
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const genPassword = () => `Ac-${crypto.randomBytes(12).toString('base64url')}`;

const email = (arg('email') || '').trim().toLowerCase();
const name = (arg('name') || '').trim();
const testEmail = (arg('test-user') || '').trim().toLowerCase();
const testName = (arg('test-name') || 'AffiliaCore (teste)').trim();

if (!email || !email.includes('@') || !name) {
  console.error('Uso: node scripts/provision/bootstrap-admin.cjs --email <email> --name "<nome>" [--password <senha>] [--test-user <email> [--test-name "<nome>"] [--test-password <senha>]]');
  process.exit(1);
}
if (testEmail && !testEmail.includes('@')) {
  console.error('--test-user precisa ser um e-mail válido.');
  process.exit(1);
}

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
} else {
  admin.initializeApp(); // GOOGLE_APPLICATION_CREDENTIALS
}
const db = admin.firestore();

function resolveProjectId() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY).project_id; } catch { /* segue */ }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try { return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')).project_id; } catch { /* segue */ }
  }
  return process.env.GOOGLE_CLOUD_PROJECT || '(desconhecido)';
}

// Cria ou PROMOVE um admin. forceChange=true grava mustChangePassword (troca no 1º
// login). Idempotente: login existente é só promovido (mantém a senha — nunca força).
// Devolve { uid, created } (a senha só vale quando created=true).
async function ensureAdmin({ email, name, password, forceChange }) {
  let user;
  let created = false;
  try {
    user = await admin.auth().getUserByEmail(email);
    console.log(`Login já existe (uid ${user.uid}) — promovendo a admin.`);
  } catch {
    user = await admin.auth().createUser({ email, password, displayName: name, emailVerified: false });
    created = true;
    console.log(`Login criado (uid ${user.uid}).`);
  }

  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email,
    name,
    role: 'admin',
    mustChangePassword: created ? forceChange : false, // login pré-existente nunca é forçado aqui
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(created ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
  }, { merge: true });

  const check = await db.collection('users').doc(user.uid).get();
  if ((check.data() || {}).role !== 'admin') throw new Error(`Verificação falhou: ${email} não ficou admin após o set.`);
  return { uid: user.uid, created };
}

async function main() {
  console.log(`Projeto alvo: ${resolveProjectId()}`);

  const clientPass = arg('password') || genPassword();
  const client = await ensureAdmin({ email, name, password: clientPass, forceChange: true });

  let test = null;
  let testPass = null;
  if (testEmail) {
    testPass = arg('test-password') || genPassword();
    test = await ensureAdmin({ email: testEmail, name: testName, password: testPass, forceChange: false });
  }

  console.log('');
  console.log(`✔ ADMIN DO CLIENTE: ${email} (users/${client.uid}.role=admin — troca a senha no 1º login)`);
  if (client.created) {
    console.log(`  Senha temporária (entregue por canal seguro): ${clientPass}`);
  } else {
    console.log('  (login já existia — senha mantida)');
  }
  if (test) {
    console.log('');
    console.log(`✔ TESTE AFFILIACORE: ${testEmail} (users/${test.uid}.role=admin — entra direto, sem troca)`);
    if (test.created) {
      console.log(`  Senha (entregue por canal seguro): ${testPass}`);
    } else {
      console.log('  (login já existia — senha mantida)');
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERRO:', e.message || e); process.exit(1); });
