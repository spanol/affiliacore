// Molduras do vídeo "Apresentação do painel" da INFINITY (pedido da Letícia,
// 2026-08-18) — overlay 1080×1920 com JANELA TRANSPARENTE (cantos arredondados)
// onde o screencast/slideshow da demo entra por baixo via ffmpeg. Mesma técnica
// do kit AffiliaCore (marketing/affiliacore/generator/gen-reels-frames.mjs),
// com os tokens da Infinity: roxo #8332B9/#A855F7, fundo roxo-profundo→preto,
// logo real embutida (public/infinity/logo-sidebar-white.svg — infinito roxo +
// wordmark branco, feita p/ fundo escuro). Fontes: Inter (a Bricolage é da
// marca AffiliaCore, não entra aqui).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const REPO = join(HERE, '..', '..', '..');
const OUT = join(HERE, '..', 'video');
const TTF = join(REPO, 'marketing', 'affiliacore', 'fonts-ttf');
mkdirSync(OUT, { recursive: true });

const fontFiles = [join(TTF, 'inter-400.ttf'), join(TTF, 'inter-600.ttf')];

const ACCENT = '#A855F7';      // roxo claro (texto de destaque em fundo escuro)
const ACCENT_DEEP = '#8332B9'; // accent oficial da instância (bullets/traços)
const MUTED = '#a89bb5';
const HAIR = '#382b4a';

// Janela do vídeo: 1024×576 (16:9) — o ffmpeg posiciona o clipe em (28, 640).
const WIN = { x: 28, y: 640, w: 1024, h: 576, r: 24 };

// Logo real da sidebar (484×110): tira o wrapper <svg> e reaproveita defs+corpo
// num <svg> aninhado posicionado.
const logoRaw = readFileSync(join(REPO, 'public', 'infinity', 'logo-sidebar-white.svg'), 'utf8');
const logoInner = logoRaw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
function logo(x, y, w) {
  const h = (w * 110) / 484;
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 484 110">${logoInner}</svg>`;
}

// retângulo arredondado como subpath (p/ furar o fundo com fill-rule evenodd)
function rrect(x, y, w, h, r) {
  return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

function frame({ file, index, total, title, titleSize, sub, bullets }) {
  const bulletsSvg = bullets
    .map((b, i) => {
      const y = 1330 + i * 74;
      return `<circle cx="140" cy="${y - 11}" r="7" fill="${ACCENT_DEEP}"/>
  <text x="176" y="${y}" font-family="Inter" font-weight="600" font-size="34" fill="#ffffff">${b}</text>`;
    })
    .join('\n  ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs><radialGradient id="bg" cx="0.72" cy="-0.1" r="1.45">
    <stop offset="0" stop-color="#3b1656"/><stop offset="0.34" stop-color="#241038"/><stop offset="0.75" stop-color="#0e0a16"/>
  </radialGradient></defs>
  <path fill-rule="evenodd" fill="url(#bg)" d="M0 0 H1080 V1920 H0 Z ${rrect(WIN.x, WIN.y, WIN.w, WIN.h, WIN.r)}"/>
  ${logo(540 - 190, 268, 380)}
  <text x="540" y="424" text-anchor="middle" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${ACCENT}">APRESENTAÇÃO DO PAINEL · ${index} DE ${total}</text>
  <text x="540" y="522" text-anchor="middle" font-family="Inter" font-weight="600" font-size="${titleSize}" letter-spacing="-2" fill="#ffffff">${title}</text>
  <text x="540" y="586" text-anchor="middle" font-family="Inter" font-weight="400" font-size="34" fill="${MUTED}">${sub}</text>
  <rect x="${WIN.x - 1.5}" y="${WIN.y - 1.5}" width="${WIN.w + 3}" height="${WIN.h + 3}" rx="${WIN.r + 1}" fill="none" stroke="${HAIR}" stroke-width="3"/>
  ${bulletsSvg}
  <rect x="295" y="1520" width="490" height="64" rx="32" fill="none" stroke="${HAIR}" stroke-width="2"/>
  <text x="540" y="1562" text-anchor="middle" font-family="Inter" font-weight="600" font-size="30" letter-spacing="1" fill="${ACCENT}">infinityaffiliates.agency</text>
  <text x="540" y="1652" text-anchor="middle" font-family="Inter" font-weight="400" font-size="24" fill="${MUTED}">Vídeo de demonstração · dados fictícios</text>
</svg>`;
  const r = new Resvg(svg, {
    background: 'rgba(0,0,0,0)',
    fitTo: { mode: 'width', value: 1080 },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Inter' },
  });
  writeFileSync(join(OUT, file), r.render().asPng());
  console.log(`${file} ok`);
}

frame({
  file: 'frame-1-cadastro.png',
  index: 1,
  total: 3,
  title: 'Crie o seu acesso',
  titleSize: 88,
  sub: 'Pelo link de cadastro que você recebeu',
  bullets: [
    'Abra o link enviado no grupo',
    'Preencha nome, e-mail e senha',
    'Seu login fica pronto na hora',
  ],
});
frame({
  file: 'frame-2-painel.png',
  index: 2,
  total: 3,
  title: 'Acompanhe seus números',
  titleSize: 76,
  sub: 'Resultados e comissões, casa a casa',
  bullets: [
    'Painel com FTDs e comissão do período',
    'Detalhamento por casa de aposta',
    'Avisos e ranking da equipe',
  ],
});
frame({
  file: 'frame-3-carteira.png',
  index: 3,
  total: 3,
  title: 'Receba pela carteira',
  titleSize: 82,
  sub: 'Saldo, extrato e saque via PIX',
  bullets: [
    'Saldo disponível casa a casa',
    'Solicite o saque quando quiser',
    'Acompanhe o status de cada pedido',
  ],
});
console.log('OUT →', OUT);
