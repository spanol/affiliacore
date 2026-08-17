#!/usr/bin/env node
// ============================================================================
// npm run dev — ambiente de desenvolvimento PADRÃO: demo nos EMULADORES.
// ----------------------------------------------------------------------------
// Sobe Firestore+Auth emulados, seeda a demo (3 logins: admin/afiliado/especial)
// e inicia o app em modo demo — nenhum projeto real é tocado. É a receita do
// scripts/provision/README.md § "Preview LOCAL da demo" automatizada num
// comando só. Para desenvolver contra a instância REAL do .env (Firestore de
// produção!), use `npm run dev:server` conscientemente.
//
// Requisitos: firebase CLI global + Java (os mesmos do `npm run test:rules`).
//
// Comportamento com emuladores JÁ ativos (restart rápido do server): reusa os
// dados como estão — não re-seeda, para não apagar o que você criou testando.
// Force um reseed do zero com DEMO_RESEED=1.
//
// DEMO GIGANTE (gravação de reels/screenshots): DEMO_FULL=1 roda também o
// seed-demo-extras.cjs depois do seed base — +95 afiliados, +3 casas, carteira,
// marketplace, links, jurídico, contatos, mensagens e histórico de ranking.
// ATENÇÃO: o extras INFLA o headline (sai dos números exatos do mock da LP);
// p/ voltar à demo "fiel ao mock", DEMO_RESEED=1 sem DEMO_FULL.
// ============================================================================
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(root, '.demo-runtime', 'affiliacore');
const logsDir = path.join(runtimeDir, 'logs');
const credsPath = path.join(runtimeDir, 'latest-demo-credentials.txt');
const metaPath = path.join(runtimeDir, 'latest-demo-meta.json');
const emulatorLog = path.join(logsDir, 'emulators.log');

const isWin = process.platform === 'win32';
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;
const APP_PORT = Number(process.env.PORT || 3123);

// Mesmo ambiente demo dos scripts de provision (start-affiliacore-demo.cjs):
// credenciais reais LIMPAS + Admin SDK e client SDK apontados pros emuladores.
const demoEnv = {
  GOOGLE_APPLICATION_CREDENTIALS: '',
  FIREBASE_SERVICE_ACCOUNT_KEY: '',
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${FIRESTORE_PORT}`,
  FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${AUTH_PORT}`,
  GCLOUD_PROJECT: 'affiliacore',
  GOOGLE_CLOUD_PROJECT: 'affiliacore',
};
const appEnv = {
  ...demoEnv,
  FIREBASE_WEBAPP_CONFIG: JSON.stringify({
    apiKey: 'demo-local',
    authDomain: '127.0.0.1',
    projectId: 'affiliacore',
    storageBucket: 'affiliacore.firebasestorage.app',
    appId: '1:demo:web:demo',
  }),
  VITE_USE_EMULATORS: 'true',
  VITE_OTG_ENABLED: 'false',
  // O marketplace é opt-in por instância (default OFF em prod), mas a demo mostra
  // o produto INTEIRO — sem isso as telas de Acordos/Parcerias/Meus Links somem
  // e /api/deals responde 404 mesmo com dados semeados.
  VITE_MARKETPLACE_ENABLED: 'true',
  VITE_BRAND_NAME: 'AffiliaCore Demo',
  VITE_BRAND_ACCENT: '#E11D48',
  VITE_BRAND_CANVAS: '#26181C',
  VITE_BRAND_SURFACE: '#3F1D2B',
  PORT: String(APP_PORT),
};

fs.mkdirSync(logsDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForPort(port, label, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(port)) return;
    await sleep(500);
  }
  throw new Error(`Timeout esperando ${label} na porta ${port} (log: ${emulatorLog})`);
}

function assertFirebaseCli() {
  const res = spawnSync(isWin ? 'firebase.cmd' : 'firebase', ['--version'], {
    encoding: 'utf8',
    shell: isWin,
  });
  if (res.status !== 0) {
    console.error('firebase CLI não encontrado no PATH.');
    console.error('O dev padrão roda nos EMULADORES (nunca toca projeto real) e precisa de:');
    console.error('  npm i -g firebase-tools   (+ Java no PATH, mesmo requisito do npm run test:rules)');
    console.error('Alternativa consciente (SEM emulador, aponta pro projeto real do .env): npm run dev:server');
    process.exit(1);
  }
}

const children = [];
function killChild(child) {
  if (!child || child.exitCode != null) return;
  try {
    if (isWin) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/F', '/T'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {}
}
function cleanup() {
  for (const c of children) killChild(c);
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
process.on('exit', cleanup);

function spawnChild(command, args, { env = process.env, logfile = null } = {}) {
  const stdio = logfile
    ? ['ignore', fs.openSync(logfile, 'a'), fs.openSync(logfile, 'a')]
    : 'inherit';
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio,
    shell: isWin,
    detached: !isWin, // POSIX: grupo próprio p/ matar a árvore no cleanup
    windowsHide: true,
  });
  children.push(child);
  return child;
}

async function ensureEmulators() {
  const firestoreUp = await isPortOpen(FIRESTORE_PORT);
  const authUp = await isPortOpen(AUTH_PORT);
  if (firestoreUp && authUp) return { fresh: false };
  if (firestoreUp !== authUp) {
    throw new Error(
      `Só um dos emuladores está de pé (firestore:${FIRESTORE_PORT}=${firestoreUp} auth:${AUTH_PORT}=${authUp}). ` +
      'Derrube o processo órfão e rode de novo.'
    );
  }
  console.log(`[dev-demo] subindo emuladores Firestore+Auth (log: ${emulatorLog})…`);
  spawnChild(isWin ? 'firebase.cmd' : 'firebase',
    ['emulators:start', '--only', 'firestore,auth', '--project', 'affiliacore'],
    { logfile: emulatorLog });
  await waitForPort(FIRESTORE_PORT, 'Firestore emulator');
  await waitForPort(AUTH_PORT, 'Auth emulator');
  return { fresh: true };
}

function parseCredentials(output) {
  const creds = {};
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s*(admin|afiliado|especial)\s+([^\s]+)\s+([^\s]+)\s*$/i);
    if (m) creds[m[1].toLowerCase()] = { email: m[2], password: m[3] };
  }
  return creds;
}

function runSeedExtras() {
  console.log('[dev-demo] DEMO_FULL=1: semeando os EXTRAS (demo gigante p/ gravação)…');
  const res = spawnSync('node', ['scripts/provision/seed-demo-extras.cjs'], {
    cwd: root,
    env: { ...process.env, ...demoEnv },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
  });
  if (res.status !== 0) {
    throw new Error(`seed-demo-extras falhou:\n${res.stdout || ''}\n${res.stderr || ''}`);
  }
  const line = (res.stdout || '').split(/\r?\n/).find((l) => l.includes('headline janela 30d'));
  if (line) console.log(`[dev-demo] extras ok —${line.split(':').slice(1).join(':')}`);
}

function runSeed({ wipe }) {
  const args = ['scripts/provision/seed-demo.cjs'];
  if (wipe) args.push('--wipe', '--yes');
  const res = spawnSync('node', args, {
    cwd: root,
    env: { ...process.env, ...demoEnv },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
  });
  if (res.status !== 0) {
    throw new Error(`seed-demo falhou:\n${res.stdout || ''}\n${res.stderr || ''}`);
  }
  const combined = `${res.stdout || ''}\n${res.stderr || ''}`;
  const creds = parseCredentials(combined);
  if (!creds.admin || !creds.afiliado || !creds.especial) {
    throw new Error(`Não consegui extrair as credenciais do seed. Saída:\n${combined}`);
  }
  fs.writeFileSync(credsPath, [
    'AffiliaCore Demo — credenciais atuais',
    `Gerado em: ${new Date().toISOString()}`,
    '',
    `Admin: ${creds.admin.email} | ${creds.admin.password}`,
    `Afiliado: ${creds.afiliado.email} | ${creds.afiliado.password}`,
    `Especial: ${creds.especial.email} | ${creds.especial.password}`,
    '',
    `Login local: http://127.0.0.1:${APP_PORT}/login`,
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(metaPath, JSON.stringify({ generatedAt: new Date().toISOString(), creds }, null, 2));
  return creds;
}

function savedCredentials() {
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')).creds ?? null;
  } catch {
    return null;
  }
}

function printCredentials(creds) {
  if (!creds) {
    console.log(`[dev-demo] credenciais: ver ${credsPath} (ou rode com DEMO_RESEED=1)`);
    return;
  }
  console.log('[dev-demo] logins da demo:');
  console.log(`  Admin:    ${creds.admin.email} | ${creds.admin.password}`);
  console.log(`  Afiliado: ${creds.afiliado.email} | ${creds.afiliado.password}`);
  console.log(`  Especial: ${creds.especial.email} | ${creds.especial.password}`);
}

async function main() {
  console.log('== AffiliaCore · dev nos emuladores (zero contato com projeto real) ==');
  assertFirebaseCli();

  if (await isPortOpen(APP_PORT)) {
    throw new Error(`Porta ${APP_PORT} já em uso — o app demo já está rodando? (PORT=xxxx muda a porta)`);
  }

  const { fresh } = await ensureEmulators();
  const full = process.env.DEMO_FULL === '1';
  let creds = null;
  if (fresh) {
    console.log('[dev-demo] emuladores no ar. Seedando a demo…');
    creds = runSeed({ wipe: false });
    if (full) runSeedExtras();
  } else if (process.env.DEMO_RESEED === '1') {
    console.log('[dev-demo] emuladores já ativos — DEMO_RESEED=1: reseedando do zero…');
    creds = runSeed({ wipe: true });
    if (full) runSeedExtras();
  } else {
    if (full) runSeedExtras(); // idempotente: limpa e refaz só o que é dos extras
    console.log('[dev-demo] emuladores já ativos — mantendo os dados (DEMO_RESEED=1 reseeda do zero).');
    creds = savedCredentials();
  }
  printCredentials(creds);

  console.log(`[dev-demo] subindo o app demo em http://localhost:${APP_PORT} …`);
  const app = spawnChild(isWin ? 'npm.cmd' : 'npm', ['run', 'dev:server'], {
    env: { ...process.env, ...appEnv },
  });
  app.on('exit', (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('\n[dev-demo] ERRO:');
  console.error(err?.stack || err);
  cleanup();
  process.exit(1);
});
