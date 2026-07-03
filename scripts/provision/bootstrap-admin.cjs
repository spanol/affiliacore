#!/usr/bin/env node
/**
 * P4 (produtização) · Bootstrap do 1º ADMIN de uma instância nova.
 *
 * As rules travam `role` no client (R6) e o /api/create-user exige um admin — numa
 * instância recém-provisionada não existe nenhum. Este script roda com o Admin SDK
 * (service account DA INSTÂNCIA) e cria/promove o primeiro admin com segurança:
 * senha temporária forte + mustChangePassword (o app força a troca no 1º login).
 *
 * Uso (na raiz do repo, com o service-account.json DA INSTÂNCIA):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/provision/bootstrap-admin.cjs --email admin@agencia.com --name "Nome do Admin"
 *
 * Flags: --email (obrigatório) · --name (obrigatório) · --password (opcional;
 *        default = senha aleatória forte, impressa UMA vez no final)
 * Idempotente: se o e-mail já tem login, só PROMOVE (users/{uid}.role='admin').
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const email = (arg('email') || '').trim().toLowerCase();
const name = (arg('name') || '').trim();
const password = arg('password') || `Bt-${crypto.randomBytes(12).toString('base64url')}`;

if (!email || !email.includes('@') || !name) {
  console.error('Uso: node scripts/provision/bootstrap-admin.cjs --email <email> --name "<nome>" [--password <senha>]');
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

async function main() {
  console.log(`Projeto alvo: ${resolveProjectId()}`);

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
    mustChangePassword: created, // login pré-existente mantém a senha atual
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(created ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
  }, { merge: true });

  const check = await db.collection('users').doc(user.uid).get();
  if ((check.data() || {}).role !== 'admin') throw new Error('Verificação falhou: role não é admin após o set.');

  console.log('');
  console.log(`✔ ${email} é ADMIN (users/${user.uid}.role=admin).`);
  if (created) {
    console.log(`  Senha temporária (entregue por canal seguro; o app força a troca no 1º login):`);
    console.log(`  ${password}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERRO:', e.message || e); process.exit(1); });
