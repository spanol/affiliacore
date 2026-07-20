#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync, execSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const runtimeDir = path.join(root, '.demo-runtime', 'affiliacore');
const logsDir = path.join(runtimeDir, 'logs');
const credsPath = path.join(runtimeDir, 'latest-demo-credentials.txt');
const metaPath = path.join(runtimeDir, 'latest-demo-meta.json');
const emulatorLog = path.join(logsDir, 'emulators.log');
const appLog = path.join(logsDir, 'app.log');

const FIREBASE = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const TAILSCALE = process.platform === 'win32' ? 'tailscale.exe' : 'tailscale';
const APP_PORT = 3123;
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;
const HMR_PORT = 24678;

fs.mkdirSync(logsDir, { recursive: true });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

async function waitForPort(port, label, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(port)) return;
    await sleep(500);
  }
  throw new Error(`Timeout esperando ${label} na porta ${port}`);
}

function spawnDetached(command, args, env, logfile) {
  const fd = fs.openSync(logfile, 'a');
  const child = spawn(command, args, {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  child.unref();
  fs.closeSync(fd);
  return child.pid;
}

function listPidsByPort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8' });
    return [...new Set(out.split(/\r?\n/).map((line) => {
      const m = line.trim().match(/\s+(\d+)\s*$/);
      return m ? Number(m[1]) : null;
    }).filter(Boolean))];
  } catch {
    return [];
  }
}

function killPid(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/F', '/T'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {}
}

function ensureStoppedOnPort(port, keepPids = []) {
  for (const pid of listPidsByPort(port)) {
    if (keepPids.includes(pid)) continue;
    killPid(pid);
  }
}

async function ensureEmulators() {
  const firestoreUp = await isPortOpen(FIRESTORE_PORT);
  const authUp = await isPortOpen(AUTH_PORT);
  if (firestoreUp && authUp) return { started: false };
  const pid = spawnDetached(FIREBASE, ['emulators:start', '--only', 'firestore,auth', '--project', 'affiliacore'], process.env, emulatorLog);
  await waitForPort(FIRESTORE_PORT, 'Firestore emulator', 90000);
  await waitForPort(AUTH_PORT, 'Auth emulator', 90000);
  return { started: true, pid };
}

function parseCredentials(output) {
  const creds = {};
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s*(admin|afiliado|especial)\s+([^\s]+)\s+([^\s]+)\s*$/i);
    if (m) creds[m[1].toLowerCase()] = { email: m[2], password: m[3] };
  }
  return creds;
}

function writeCredentialsFile(creds) {
  const text = [
    'AffiliaCore Demo — credenciais atuais',
    `Gerado em: ${new Date().toISOString()}`,
    '',
    `Admin: ${creds.admin.email} | ${creds.admin.password}`,
    `Afiliado: ${creds.afiliado.email} | ${creds.afiliado.password}`,
    `Especial: ${creds.especial.email} | ${creds.especial.password}`,
    '',
    `Login local: http://127.0.0.1:${APP_PORT}/login`,
    `Login Tailscale: https://spanol-1.tail82f788.ts.net:${APP_PORT}/login`,
    '',
  ].join('\n');
  fs.writeFileSync(credsPath, text, 'utf8');
  fs.writeFileSync(metaPath, JSON.stringify({ generatedAt: new Date().toISOString(), creds }, null, 2));
}

function runSeed() {
  const env = {
    ...process.env,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${FIRESTORE_PORT}`,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${AUTH_PORT}`,
    GCLOUD_PROJECT: 'affiliacore',
    GOOGLE_CLOUD_PROJECT: 'affiliacore',
  };
  const res = spawnSync('node', ['scripts/provision/seed-demo.cjs', '--wipe', '--yes'], {
    cwd: root,
    env,
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
  writeCredentialsFile(creds);
  return { output: combined, creds };
}

async function ensureApp() {
  ensureStoppedOnPort(HMR_PORT);
  const localAppUp = await isPortOpen(APP_PORT, '127.0.0.1');
  if (!localAppUp) {
    const env = {
      ...process.env,
      GOOGLE_APPLICATION_CREDENTIALS: '',
      FIREBASE_SERVICE_ACCOUNT_KEY: '',
      FIRESTORE_EMULATOR_HOST: `127.0.0.1:${FIRESTORE_PORT}`,
      FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${AUTH_PORT}`,
      GCLOUD_PROJECT: 'affiliacore',
      GOOGLE_CLOUD_PROJECT: 'affiliacore',
      FIREBASE_WEBAPP_CONFIG: JSON.stringify({
        apiKey: 'demo-local',
        authDomain: '127.0.0.1',
        projectId: 'affiliacore',
        storageBucket: 'affiliacore.firebasestorage.app',
        appId: '1:demo:web:demo',
      }),
      VITE_USE_EMULATORS: 'true',
      VITE_OTG_ENABLED: 'false',
      VITE_BRAND_NAME: 'AffiliaCore Demo',
      VITE_BRAND_ACCENT: '#E11D48',
      VITE_BRAND_CANVAS: '#26181C',
      VITE_BRAND_SURFACE: '#3F1D2B',
      PORT: String(APP_PORT),
    };
    const pid = spawnDetached(NPM, ['run', 'dev'], env, appLog);
    await waitForPort(APP_PORT, 'app demo', 90000);
    return { started: true, pid };
  }
  const currentAppPids = listPidsByPort(APP_PORT);
  return { started: false, pid: currentAppPids[0] || null };
}

function enableTailscaleServe() {
  const res = spawnSync(TAILSCALE, ['serve', '--bg', '--https', String(APP_PORT), `http://127.0.0.1:${APP_PORT}`], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

async function main() {
  console.log('== AffiliaCore Demo · 1-clique ==');
  console.log(`Repo: ${root}`);
  const emu = await ensureEmulators();
  console.log(emu.started ? `Emuladores iniciados (pid ${emu.pid}).` : 'Emuladores já estavam ativos.');

  const seeded = runSeed();
  console.log('Demo reseedada com sucesso.');

  const app = await ensureApp();
  console.log(app.started ? `App demo iniciado (pid ${app.pid}).` : `App demo já estava ativo (pid ${app.pid}).`);

  let tailscale = null;
  try { tailscale = enableTailscaleServe(); } catch (e) { tailscale = { status: 1, stderr: String(e) }; }

  console.log('');
  console.log('URLs:');
  console.log(`- Local: http://127.0.0.1:${APP_PORT}/login`);
  console.log(`- Tailscale: https://spanol-1.tail82f788.ts.net:${APP_PORT}/login`);
  console.log('');
  console.log('Credenciais (também salvas em arquivo):');
  console.log(`- Admin: ${seeded.creds.admin.email} | ${seeded.creds.admin.password}`);
  console.log(`- Afiliado: ${seeded.creds.afiliado.email} | ${seeded.creds.afiliado.password}`);
  console.log(`- Especial: ${seeded.creds.especial.email} | ${seeded.creds.especial.password}`);
  console.log('');
  console.log(`Arquivo de credenciais: ${credsPath}`);
  console.log(`Log dos emuladores: ${emulatorLog}`);
  console.log(`Log do app: ${appLog}`);
  if (tailscale && tailscale.status === 0) {
    console.log('Tailscale serve: OK');
  } else {
    console.log('Tailscale serve: aviso — não consegui garantir a publicação automaticamente.');
    if (tailscale?.stderr) console.log(tailscale.stderr.trim());
  }
}

main().catch((err) => {
  console.error('\nERRO ao subir a demo:');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
