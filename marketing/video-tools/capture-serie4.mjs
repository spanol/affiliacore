// Captura das cenas da SÉRIE 4 de vídeos ("O painel que o cliente construiu",
// marketing/affiliacore/CAMPANHA-VIDEOS-EVOLUCAO.md). Irmão do capture-scenes.mjs
// (que grava os vídeos de APRESENTAÇÃO, cenas 1-8): mesmas manhas de gravação,
// coreografia diferente — aqui cada vídeo conta UMA feature, cruzando as telas
// do afiliado e da agência.
//
// Pré-requisito: `DEMO_FULL=1 npm run dev` (demo gigante nos emuladores, 3123).
// Senhas do seed saem no console do dev e em
// .demo-runtime/affiliacore/latest-demo-credentials.txt.
//
//   VIDEO_BASE=http://127.0.0.1:3123 VIDEO_OUT=marketing/affiliacore/video/serie4/raw \
//   DEMO_ADMIN_PASS=… DEMO_AFILIADO_PASS=… node marketing/video-tools/capture-serie4.mjs
//
// SCENES seleciona as cenas (default: as 3 do V1). Saída: <VIDEO_OUT>/<cena>.webm
// em 1280×720 (a janela 1024×576 da moldura).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(process.env.VIDEO_OUT || join(HERE, '..', 'affiliacore', 'video', 'serie4', 'raw'));
mkdirSync(RAW, { recursive: true });

const BASE = process.env.VIDEO_BASE || 'http://127.0.0.1:3123';
const ADMIN = { email: 'demo@affiliacore.com.br', pass: process.env.DEMO_ADMIN_PASS };
const AFILIADO = { email: 'afiliado@affiliacore.com.br', pass: process.env.DEMO_AFILIADO_PASS };

const SCENES = (process.env.SCENES || 'v1-parcerias,v1-acordos,v1-meuslinks').split(',').map((s) => s.trim());
const wants = (n) => SCENES.includes(n);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--window-size=1300,820', '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-infobars'],
});

// Cada persona ganha um contexto anônimo: a cena da agência não pode herdar a
// sessão do afiliado (e vice-versa) no meio da série.
async function newContextPage() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('theme', 'dark');
    const kill = () => {
      document.querySelectorAll('.firebase-emulator-warning').forEach((n) => n.remove());
      // O banner "Nova versão disponível" nasce toda vez que o dev regera o
      // version.json com a aba aberta. É ruído de desenvolvimento, não do
      // produto: sai do quadro. Remover o nó não basta (o React o repõe no
      // próximo render e ele reaparece piscando), então quem o esconde é o CSS.
      // O seletor pega o banner pela posição fixa embaixo; os toasts, que também
      // são role=alert e FICAM no vídeo, nascem no topo.
      if (document.head && !document.getElementById('cap-style')) {
        const s = document.createElement('style');
        s.id = 'cap-style';
        s.textContent = '[role="alert"].bottom-4 { display: none !important; }';
        document.head.appendChild(s);
      }
      // A demo roda em 127.0.0.1; o link que o produto emite carrega o domínio
      // da agência. Trocar o host no quadro mostra o que o afiliado de verdade
      // vê, em vez do endereço da máquina que gravou.
      const swap = (s) => s.replace(/https?:\/\/127\.0\.0\.1:\d+/g, 'https://app.suaagencia.com.br').replace(/127\.0\.0\.1:\d+/g, 'app.suaagencia.com.br');
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeValue.includes('127.0.0.1')) n.nodeValue = swap(n.nodeValue);
      }
      document.querySelectorAll('input, textarea').forEach((el) => {
        if (typeof el.value === 'string' && el.value.includes('127.0.0.1')) el.value = swap(el.value);
      });
    };
    // ATENÇÃO: no instante do evaluateOnNewDocument o `document.documentElement`
    // ainda é null, e observar null LANÇA — o que abortaria o script inteiro e
    // deixaria a limpeza sem rodar (foi o que aconteceu na 1ª gravação: o banner
    // de versão apareceu no meio da cena). Por isso o intervalo vem primeiro e o
    // observer observa o `document`, que já existe.
    setInterval(kill, 200);
    new MutationObserver(kill).observe(document, { childList: true, subtree: true });
  });
  return { ctx, page };
}

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

// Clique por TEXTO do botão: os controles da demo não têm testid estável em toda
// tela, e o texto é o mesmo que o espectador lê no vídeo.
async function clickByText(page, text, nth = 0) {
  const ok = await page.evaluate((t, n) => {
    const b = Array.from(document.querySelectorAll('button')).filter((x) => x.textContent.trim().includes(t));
    if (!b[n]) return false;
    b[n].scrollIntoView({ block: 'center' });
    b[n].click();
    return true;
  }, text, nth);
  if (!ok) throw new Error(`botão não encontrado: ${text} (#${nth})`);
  return ok;
}

async function loginAs(page, who) {
  if (!who.pass) { console.error(`Falta a senha de ${who.email}.`); process.exit(1); }
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.type('input[type="email"]', who.email, { delay: 5 });
  await page.type('input[type="password"]', who.pass, { delay: 5 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await sleep(4000);
  await dismissPopups(page);
}

// Prepara a rota FORA da gravação (carregamento e popups não entram no clipe).
async function stage(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
  await sleep(2600);
  await dismissPopups(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
}

// ---------- V1 · cena 1 · o afiliado pede a parceria na vitrine ----------
if (wants('v1-parcerias')) {
  const { ctx, page } = await newContextPage();
  await loginAs(page, AFILIADO);
  await stage(page, '/parcerias');
  const rec = await page.screencast({ path: join(RAW, 'v1-parcerias.webm') });
  await sleep(2600);                       // leitura da vitrine
  await smoothScroll(page, 420);
  await sleep(2000);                       // os cartões com os termos
  await clickByText(page, 'Solicitar parceria');
  await sleep(2600);                       // o toast de confirmação
  await clickByText(page, 'Minhas solicitações');
  await sleep(2800);                       // o pedido com o status
  await rec.stop();
  await ctx.close();
  console.log('v1-parcerias ok');
}

// ---------- V1 · cena 2 · a agência aprova com a taxa ----------
if (wants('v1-acordos')) {
  const { ctx, page } = await newContextPage();
  await loginAs(page, ADMIN);
  await stage(page, '/acordos');
  const rec = await page.screencast({ path: join(RAW, 'v1-acordos.webm') });
  await sleep(2600);                       // o catálogo: CPA, RevShare e ciclo por casa
  await smoothScroll(page, 380);
  await sleep(1800);
  // a fila de pedidos é uma ABA da mesma tela (troca SPA, sem recarregar)
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await sleep(700);
  await clickByText(page, 'Solicitações');
  await sleep(2600);                       // o pedido do afiliado esperando decisão
  await clickByText(page, 'Aprovar').catch((e) => console.warn('sem pendente p/ aprovar:', e.message));
  await sleep(3400);                       // aprovado, link emitido
  await rec.stop();
  await ctx.close();
  console.log('v1-acordos ok');
}

// ---------- V1 · cena 3 · o link já pronto na mão do afiliado ----------
if (wants('v1-meuslinks')) {
  const { ctx, page } = await newContextPage();
  await loginAs(page, AFILIADO);
  await stage(page, '/meus-links');
  const rec = await page.screencast({ path: join(RAW, 'v1-meuslinks.webm') });
  await sleep(2800);                       // o cartão do link
  await smoothScroll(page, 520);
  await sleep(2400);                       // os termos do acordo
  await smoothScroll(page, 520);
  await sleep(2400);
  await rec.stop();
  await ctx.close();
  console.log('v1-meuslinks ok');
}

await browser.close();
console.log('FIM →', RAW);
