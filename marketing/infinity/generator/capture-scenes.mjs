// Captura das 3 cenas do vídeo de apresentação do painel Infinity (demo emulada,
// pedido da Letícia 2026-08-18). Pré-requisitos: `DEMO_FULL=1 npm run dev` (demo
// gigante na 3123 + emuladores) E `scripts/provision/start-infinity-preview.cmd`
// (preview com marca Infinity na 3124, mesmos emuladores). A senha do afiliado
// semeado muda a cada seed — passe via env DEMO_AFILIADO_PASS (sai no console do
// `npm run dev` e em .demo-runtime/affiliacore/latest-demo-credentials.txt).
// Saída: ../video/raw/scene{1,2,3}.webm em 1280×720 (janela 1024×576 da moldura).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, '..', 'video', 'raw');
mkdirSync(RAW, { recursive: true });

const BASE = 'http://127.0.0.1:3124';
const INVITE = `${BASE}/cadastro/demo-rede-na-souza`;
const AFILIADO = { email: 'afiliado@affiliacore.com.br', pass: process.env.DEMO_AFILIADO_PASS };
if (!AFILIADO.pass) {
  console.error('Falta DEMO_AFILIADO_PASS (senha do afiliado da demo, ver .demo-runtime/affiliacore/latest-demo-credentials.txt).');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--window-size=1300,820', '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-infobars'],
});

async function newPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('theme', 'dark');
    // some com o banner do emulador de Auth (aparece em toda página com auth)
    const kill = () => document.querySelectorAll('.firebase-emulator-warning').forEach((n) => n.remove());
    new MutationObserver(kill).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(kill, 300);
  });
  return page;
}

async function typeInto(page, selector, text, delay = 26) {
  await page.click(selector);
  await page.type(selector, text, { delay });
}

// SCENES=1 (ou "2,3") grava só as cenas listadas; default = todas.
const SCENES = (process.env.SCENES || '1,2,3').split(',').map((s) => s.trim());
const wants = (n) => SCENES.includes(String(n));

// A demo semeia mensagens da gerência que abrem como popup sobre o painel —
// fora da gravação elas são dispensadas (senão a cena inteira fica atrás do modal).
async function dismissPopups(page) {
  for (let i = 0; i < 6; i++) {
    const clicked = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('Entendi'));
      if (b) { b.click(); return true; }
      return false;
    });
    if (!clicked) return;
    await sleep(900);
  }
}

async function smoothScroll(page, totalPx, stepPx = 12, stepMs = 16) {
  const steps = Math.round(totalPx / stepPx);
  for (let i = 0; i < steps; i++) {
    await page.evaluate((s) => window.scrollBy(0, s), stepPx);
    await sleep(stepMs);
  }
}

// ---------- warmup (compila as rotas no Vite antes de gravar) ----------
{
  const page = await newPage();
  for (const url of [INVITE, `${BASE}/login`]) {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  }
  await page.close();
  console.log('warmup ok');
}

// ---------- CENA 1 · cadastro pelo link de rede ----------
if (wants(1)) {
  const page = await newPage();
  await page.goto(INVITE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await sleep(400);
  const rec = await page.screencast({ path: join(RAW, 'scene1.webm') });
  await sleep(3000); // leitura do cartão "Convite de equipe · rede de Ana Souza"

  // Ritmo de TUTORIAL: digitação legível (45ms/char) e pausa entre campos.
  // Persona fictícia; e-mail único por gravação (o aceite grava no emulador).
  const T = 45, GAP = 550;
  await typeInto(page, 'input[placeholder="Nome e sobrenome"]', 'Pedro Almeida', T);
  await sleep(GAP);
  await typeInto(page, 'input[type="email"]', `pedro.almeida${Date.now() % 1000}@gmail.com`, T);
  await sleep(GAP);
  await typeInto(page, 'input[placeholder="(11) 99999-9999"]', '(31) 99876-5432', T);
  await sleep(GAP);
  await typeInto(page, 'input[placeholder="@seuperfil"]', '@pedroalmeida', T);
  await sleep(GAP);
  await typeInto(page, 'input[placeholder="000.000.000-00"]', '11144477735', T);
  await sleep(GAP);
  const passInputs = await page.$$('input[type="password"]');
  await passInputs[0].click();
  await passInputs[0].type('Pedro@2026x', { delay: T });
  await sleep(GAP);
  await passInputs[1].click();
  await passInputs[1].type('Pedro@2026x', { delay: T });
  await sleep(1000);

  await page.click('button[type="submit"]');
  // sucesso: "Acesso criado!" (o auto-login redireciona ~1.5s depois)
  await page.waitForFunction(() => document.body.innerText.includes('Acesso criado'), { timeout: 30000 });
  await sleep(1400);
  await rec.stop();
  await page.close();
  console.log('scene1 ok');
}

// ---------- login (fora da gravação) como o afiliado semeado ----------
if (wants(2) || wants(3)) {
const page = await newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
await page.waitForSelector('input[type="email"]');
await page.type('input[type="email"]', AFILIADO.email, { delay: 5 });
await page.type('input[type="password"]', AFILIADO.pass, { delay: 5 });
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await sleep(4000);
console.log('pós-login url:', page.url());
// mapa da sidebar p/ eu conferir as rotas do afiliado
const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a[href^="/"]')).map((a) => `${a.getAttribute('href')} :: ${a.textContent.trim().slice(0, 40)}`)
);
console.log(links.join('\n'));

// ---------- CENA 2 · painel do afiliado ----------
if (wants(2)) {
  if (!page.url().includes('/client')) await page.goto(`${BASE}/client`, { waitUntil: 'networkidle2' });
  await sleep(2500); // dados carregando fora da gravação
  await dismissPopups(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  const rec = await page.screencast({ path: join(RAW, 'scene2.webm') });
  await sleep(2800);
  await smoothScroll(page, 700);
  await sleep(2200);
  await smoothScroll(page, 700);
  await sleep(2200);
  await smoothScroll(page, 800);
  await sleep(2400);
  await rec.stop();
  console.log('scene2 ok');
}

// ---------- CENA 3 · carteira / saques ----------
if (wants(3)) {
  await page.goto(`${BASE}/financeiro`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  await dismissPopups(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  const rec = await page.screencast({ path: join(RAW, 'scene3.webm') });
  await sleep(2800);
  await smoothScroll(page, 600);
  await sleep(2200);
  await smoothScroll(page, 700);
  await sleep(2400);
  await rec.stop();
  console.log('scene3 ok');
}
}

await browser.close();
console.log('FIM');
