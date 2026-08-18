// Captura das cenas dos vídeos de apresentação do painel (demo emulada) — o
// workflow é POR MARCA: aponte VIDEO_BASE para a instância local com a marca
// desejada e VIDEO_OUT para a pasta raw/ do kit daquela marca.
//   AffiliaCore (a própria demo):  VIDEO_BASE=http://127.0.0.1:3123 VIDEO_OUT=marketing/affiliacore/video/raw
//   Infinity (preview local):      VIDEO_BASE=http://127.0.0.1:3124 VIDEO_OUT=marketing/infinity/video/raw
//                                  (sobe com scripts/provision/start-infinity-preview.cmd)
// Pré-requisito comum: `DEMO_FULL=1 npm run dev` (demo gigante + emuladores).
// Senhas do seed via env DEMO_AFILIADO_PASS / DEMO_ESPECIAL_PASS (saem no
// console do `npm run dev` e em .demo-runtime/affiliacore/latest-demo-credentials.txt).
// Saída: VIDEO_OUT/scene{1..8}.webm em 1280×720 (janela 1024×576 da moldura).
// Vídeo 1 = cenas 1-3 (cadastro, painel, carteira) · vídeo 2 = cenas 4-8
// (avisos+ranking, conquistas, meus links, rede do especial, gestão da equipe).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(process.env.VIDEO_OUT || join(HERE, '..', 'infinity', 'video', 'raw'));
mkdirSync(RAW, { recursive: true });

const BASE = process.env.VIDEO_BASE || 'http://127.0.0.1:3124';
const INVITE = `${BASE}/cadastro/demo-rede-na-souza`;
const AFILIADO = { email: 'afiliado@affiliacore.com.br', pass: process.env.DEMO_AFILIADO_PASS };
// Cenas 7/8 (visão do especial) usam DEMO_ESPECIAL_PASS (mesma origem da senha).
const ESPECIAL = { email: 'especial@affiliacore.com.br', pass: process.env.DEMO_ESPECIAL_PASS };

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

// SCENES=1 (ou "2,3") grava só as cenas listadas; default = as 3 do vídeo 1.
// Vídeo 2 = cenas 4..8 (SCENES=4,5,6,7,8).
const SCENES = (process.env.SCENES || '1,2,3').split(',').map((s) => s.trim());
const wants = (n) => SCENES.includes(String(n));

// Login pela tela (fora de gravação); tolera sessão já aberta no perfil.
async function loginAs(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  if (await page.$('input[type="email"]')) {
    await page.type('input[type="email"]', who.email, { delay: 5 });
    await page.type('input[type="password"]', who.pass, { delay: 5 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
  }
  await sleep(4000);
  await dismissPopups(page);
}

// Cena "navega e rola": grava a rota com pausas de leitura e rolagem suave.
async function recordRoute(page, path, out, { holds = [2800, 2000, 2200], scrolls = [600, 600] } = {}) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  await dismissPopups(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  const rec = await page.screencast({ path: out });
  await sleep(holds[0]);
  for (let i = 0; i < scrolls.length; i++) {
    await smoothScroll(page, scrolls[i]);
    await sleep(holds[i + 1] ?? 2000);
  }
  await rec.stop();
}

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

// ---------- VÍDEO 2 · cenas 4-6: módulos do afiliado que ficaram de fora ----------
if (wants(4) || wants(5) || wants(6)) {
  if (!AFILIADO.pass) { console.error('Falta DEMO_AFILIADO_PASS.'); process.exit(1); }
  const page = await newPage();
  await loginAs(page, AFILIADO);

  if (wants(4)) {
    // avisos + ranking numa cena só (a navegação entra na gravação)
    await page.goto(`${BASE}/avisos`, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await dismissPopups(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);
    const rec = await page.screencast({ path: join(RAW, 'scene4.webm') });
    await sleep(2800);
    await smoothScroll(page, 450);
    await sleep(1800);
    // navegação SPA (clique na sidebar): page.goto recarrega a página inteira e
    // pisca BRANCO no meio da gravação
    await page.click('a[href="/ranking"]');
    await sleep(2600);
    await smoothScroll(page, 500);
    await sleep(2200);
    await rec.stop();
    console.log('scene4 ok');
  }
  if (wants(5)) {
    await recordRoute(page, '/conquistas', join(RAW, 'scene5.webm'));
    console.log('scene5 ok');
  }
  if (wants(6)) {
    await recordRoute(page, '/meus-links', join(RAW, 'scene6.webm'));
    console.log('scene6 ok');
  }
  await page.close();
}

// ---------- VÍDEO 2 · cenas 7-8: a visão do afiliado ESPECIAL ----------
if (wants(7) || wants(8)) {
  if (!ESPECIAL.pass) { console.error('Falta DEMO_ESPECIAL_PASS.'); process.exit(1); }
  // contexto anônimo: não herda a sessão do afiliado
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('theme', 'dark');
    const kill = () => document.querySelectorAll('.firebase-emulator-warning').forEach((n) => n.remove());
    new MutationObserver(kill).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(kill, 300);
  });
  await loginAs(page, ESPECIAL);

  if (wants(7)) {
    await recordRoute(page, '/network', join(RAW, 'scene7.webm'), { holds: [3000, 2000, 2200], scrolls: [700, 700] });
    console.log('scene7 ok');
  }
  if (wants(8)) {
    await recordRoute(page, '/network/afiliados', join(RAW, 'scene8.webm'), { holds: [3000, 2000, 2200], scrolls: [600, 600] });
    console.log('scene8 ok');
  }
  await ctx.close();
}

await browser.close();
console.log('FIM');
