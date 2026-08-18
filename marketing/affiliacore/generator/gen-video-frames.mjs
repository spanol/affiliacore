// Molduras dos vídeos "Apresentação do painel" da AFFILIACORE — a versão de
// PRODUTO do kit que nasceu para a Infinity (marketing/infinity/generator/
// gen-video-frames.mjs): mesmas 8 cenas, identidade ember + lockup Affilia●ore
// (tokens e glifo idênticos aos reels, gen-reels-frames.mjs). O par grava-se
// com marketing/video-tools/capture-scenes.mjs apontado para a demo (3123).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'video');
const TTF = join(ROOT, 'fonts-ttf');
mkdirSync(OUT, { recursive: true });

const FONTS = ['bricolage-grotesque-500', 'bricolage-grotesque-800', 'inter-400', 'inter-600'];
const fontFiles = FONTS.map((f) => join(TTF, `${f}.ttf`));

const EMBER = '#e11d48', EMBER_L = '#e45b79', INK = '#11070a';
const MUTED = '#af9da2', HAIR = '#34262a';

// Janela do vídeo: 1024×576 (16:9) — o ffmpeg posiciona o clipe em (28, 640).
const WIN = { x: 28, y: 640, w: 1024, h: 576, r: 24 };

function glyph(cx, cy, r, ring, dot) {
  const stroke = r * 2 * 0.164, rm = r - stroke / 2, dotR = r * 2 * 0.157;
  const cos = Math.cos((40 * Math.PI) / 180), sin = Math.sin((40 * Math.PI) / 180);
  return `<path d="M ${(cx + rm * cos).toFixed(1)} ${(cy - rm * sin).toFixed(1)} A ${rm.toFixed(1)} ${rm.toFixed(1)} 0 1 0 ${(cx + rm * cos).toFixed(1)} ${(cy + rm * sin).toFixed(1)}" fill="none" stroke="${ring}" stroke-width="${stroke.toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="${dotR.toFixed(1)}" fill="${dot}"/>`;
}
function lockup(x, y, size, { affilia, ore, ring, dot }) {
  const wA = 2.85 * size;
  const r = size * 0.36;
  const gx = x + wA + size * 0.09 + r;
  const oreX = gx + r - size * 0.04;
  return `<text x="${x}" y="${y}" font-family="Bricolage Grotesque" font-weight="800" font-size="${size}" letter-spacing="${(-0.02 * size).toFixed(1)}" fill="${affilia}">Affilia</text>
  ${glyph(gx, y - size * 0.34, r, ring, dot)}
  <text x="${oreX}" y="${y}" font-family="Bricolage Grotesque" font-weight="500" font-size="${size}" letter-spacing="${(-0.02 * size).toFixed(1)}" fill="${ore}">ore</text>`;
}
const lockDark = { affilia: '#ffffff', ore: EMBER_L, ring: EMBER_L, dot: '#ffffff' };

// retângulo arredondado como subpath (p/ furar o fundo com fill-rule evenodd)
function rrect(x, y, w, h, r) {
  return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

function frame({ file, index, total, title, titleSize, sub, bullets }) {
  const bulletsSvg = bullets
    .map((b, i) => {
      const y = 1330 + i * 74;
      return `<circle cx="140" cy="${y - 11}" r="7" fill="${EMBER}"/>
  <text x="176" y="${y}" font-family="Inter" font-weight="600" font-size="34" fill="#ffffff">${b}</text>`;
    })
    .join('\n  ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs><radialGradient id="bg" cx="0.72" cy="-0.1" r="1.45">
    <stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="${INK}"/>
  </radialGradient></defs>
  <path fill-rule="evenodd" fill="url(#bg)" d="M0 0 H1080 V1920 H0 Z ${rrect(WIN.x, WIN.y, WIN.w, WIN.h, WIN.r)}"/>
  ${lockup(540 - 2.68 * 40, 340, 40, lockDark)}
  <text x="540" y="424" text-anchor="middle" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_L}">APRESENTAÇÃO DO PAINEL · ${index} DE ${total}</text>
  <text x="540" y="522" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="${titleSize}" letter-spacing="-2" fill="#ffffff">${title}</text>
  <text x="540" y="586" text-anchor="middle" font-family="Inter" font-weight="400" font-size="34" fill="${MUTED}">${sub}</text>
  <rect x="${WIN.x - 1.5}" y="${WIN.y - 1.5}" width="${WIN.w + 3}" height="${WIN.h + 3}" rx="${WIN.r + 1}" fill="none" stroke="${HAIR}" stroke-width="3"/>
  ${bulletsSvg}
  <rect x="325" y="1520" width="430" height="64" rx="32" fill="none" stroke="${HAIR}" stroke-width="2"/>
  <text x="540" y="1562" text-anchor="middle" font-family="Inter" font-weight="600" font-size="30" letter-spacing="1" fill="${EMBER_L}">affiliacore.com.br</text>
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

// ---------- Vídeo 1 · o essencial (cadastro → painel → carteira) ----------
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
  titleSize: 74,
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
  titleSize: 80,
  sub: 'Saldo, extrato e saque via PIX',
  bullets: [
    'Saldo disponível casa a casa',
    'Solicite o saque quando quiser',
    'Acompanhe o status de cada pedido',
  ],
});

// ---------- Vídeo 2 · os módulos restantes (afiliado + especial) ----------
frame({
  file: 'v2-frame-1-avisos.png',
  index: 1,
  total: 5,
  title: 'Fique por dentro',
  titleSize: 88,
  sub: 'Avisos da agência e ranking do período',
  bullets: [
    'Mural com os comunicados da agência',
    'Notificações pessoais no sino',
    'Ranking com os destaques do período',
  ],
});
frame({
  file: 'v2-frame-2-conquistas.png',
  index: 2,
  total: 5,
  title: 'Evolua e conquiste',
  titleSize: 84,
  sub: 'Marcos de produção viram placas',
  bullets: [
    'Conquistas por marco de faturamento',
    'Progresso até o próximo nível',
    'Solicite a placa ao bater a meta',
  ],
});
frame({
  file: 'v2-frame-3-links.png',
  index: 3,
  total: 5,
  title: 'Seus links e acordos',
  titleSize: 78,
  sub: 'Divulgação com cliques contados',
  bullets: [
    'Links prontos para divulgar',
    'Os termos do seu acordo, casa a casa',
    'Cliques contados em tempo real',
  ],
});
frame({
  file: 'v2-frame-4-equipe.png',
  index: 4,
  total: 5,
  title: 'A visão do líder',
  titleSize: 88,
  sub: 'Quem tem equipe enxerga a rede inteira',
  bullets: [
    'Comissão consolidada da equipe',
    'Produção da rede, casa a casa',
    'Top afiliados do período',
  ],
});
frame({
  file: 'v2-frame-5-gestao.png',
  index: 5,
  total: 5,
  title: 'Gerencie sua equipe',
  titleSize: 80,
  sub: 'Afiliados, produção e link de convite',
  bullets: [
    'A produção de cada afiliado seu',
    'Link de cadastro da sua rede',
    'Quem entra pelo link já nasce na equipe',
  ],
});
console.log('OUT →', OUT);
