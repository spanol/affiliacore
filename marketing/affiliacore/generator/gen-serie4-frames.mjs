// Molduras da SÉRIE 4 de vídeos ("O painel que o cliente construiu",
// marketing/affiliacore/CAMPANHA-VIDEOS-EVOLUCAO.md). Mesma identidade ember dos
// reels e dos vídeos de apresentação (gen-video-frames.mjs), com duas diferenças
// de propósito, porque estes vídeos rodam no feed do IG com trending audio e
// SEM narração: o texto é maior e cada vídeo abre num CARTÃO de gancho em tela
// cheia (sem janela de vídeo) e fecha num cartão de marca.
//
//   node marketing/affiliacore/generator/gen-serie4-frames.mjs
//   (resvg: npm i --no-save @resvg/resvg-js)
//
// Saída: marketing/affiliacore/video/serie4/s4-v<N>-{hook,1..3,cta}.png (1080×1920 RGBA).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'video', 'serie4');
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

const BG_DEFS = `<defs><radialGradient id="bg" cx="0.72" cy="-0.1" r="1.45">
    <stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="${INK}"/>
  </radialGradient></defs>`;

function render(file, svg) {
  const r = new Resvg(svg, {
    background: 'rgba(0,0,0,0)',
    fitTo: { mode: 'width', value: 1080 },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Inter' },
  });
  writeFileSync(join(OUT, file), r.render().asPng());
  console.log(`${file} ok`);
}

const rodape = `<text x="540" y="1652" text-anchor="middle" font-family="Inter" font-weight="400" font-size="24" fill="${MUTED}">Ambiente de demonstração · dados fictícios</text>`;

// Cena com janela de vídeo: o texto grande vive ACIMA da janela (o miolo do feed),
// e os dois apoios ficam abaixo. Sem áudio, é o título que entrega a mensagem.
function scene({ file, eyebrow, index, total, title, titleSize, sub, bullets = [] }) {
  const bulletsSvg = bullets
    .map((b, i) => {
      const y = 1350 + i * 78;
      return `<circle cx="140" cy="${y - 11}" r="7" fill="${EMBER}"/>
  <text x="176" y="${y}" font-family="Inter" font-weight="600" font-size="36" fill="#ffffff">${b}</text>`;
    })
    .join('\n  ');
  render(file, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  ${BG_DEFS}
  <path fill-rule="evenodd" fill="url(#bg)" d="M0 0 H1080 V1920 H0 Z ${rrect(WIN.x, WIN.y, WIN.w, WIN.h, WIN.r)}"/>
  ${lockup(540 - 2.68 * 36, 300, 36, lockDark)}
  <text x="540" y="392" text-anchor="middle" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_L}">${eyebrow} · ${index} DE ${total}</text>
  <text x="540" y="500" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="${titleSize}" letter-spacing="-2" fill="#ffffff">${title}</text>
  <text x="540" y="574" text-anchor="middle" font-family="Inter" font-weight="400" font-size="36" fill="${MUTED}">${sub}</text>
  <rect x="${WIN.x - 1.5}" y="${WIN.y - 1.5}" width="${WIN.w + 3}" height="${WIN.h + 3}" rx="${WIN.r + 1}" fill="none" stroke="${HAIR}" stroke-width="3"/>
  ${bulletsSvg}
  <rect x="325" y="1520" width="430" height="64" rx="32" fill="none" stroke="${HAIR}" stroke-width="2"/>
  <text x="540" y="1562" text-anchor="middle" font-family="Inter" font-weight="600" font-size="30" letter-spacing="1" fill="${EMBER_L}">affiliacore.com.br</text>
  ${rodape}
</svg>`);
}

// Cartão de gancho / de fecho: tela cheia, sem janela. É o quadro que segura o
// dedo nos 2 primeiros segundos, então o texto é o maior do vídeo.
function card({ file, eyebrow, lines, lineSize = 96, foot, footAccent }) {
  const start = 960 - ((lines.length - 1) * lineSize * 1.18) / 2;
  const linesSvg = lines
    .map((t, i) => `<text x="540" y="${Math.round(start + i * lineSize * 1.18)}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="${lineSize}" letter-spacing="-2" fill="${t.startsWith('~') ? EMBER_L : '#ffffff'}">${t.replace(/^~/, '')}</text>`)
    .join('\n  ');
  render(file, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  ${BG_DEFS}
  <rect width="1080" height="1920" fill="url(#bg)"/>
  ${lockup(540 - 2.68 * 40, 340, 40, lockDark)}
  ${eyebrow ? `<text x="540" y="430" text-anchor="middle" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_L}">${eyebrow}</text>` : ''}
  ${linesSvg}
  ${foot ? `<text x="540" y="1420" text-anchor="middle" font-family="Inter" font-weight="400" font-size="38" fill="${MUTED}">${foot}</text>` : ''}
  ${footAccent ? `<rect x="290" y="1500" width="500" height="76" rx="38" fill="none" stroke="${HAIR}" stroke-width="2"/>
  <text x="540" y="1550" text-anchor="middle" font-family="Inter" font-weight="600" font-size="34" letter-spacing="1" fill="${EMBER_L}">${footAccent}</text>` : ''}
  ${rodape}
</svg>`);
}

// ---------- V1 · A loja de acordos ----------
const V1 = 'LOJA DE ACORDOS';

card({
  file: 's4-v1-hook.png',
  eyebrow: V1,
  lines: ['Seu afiliado quer', 'divulgar uma casa', 'nova. Ele te chama', '~no WhatsApp?'],
  lineSize: 88,
  foot: 'Ou resolve sozinho, dentro do painel',
});
scene({
  file: 's4-v1-1.png',
  eyebrow: V1,
  index: 1,
  total: 3,
  title: 'Ele pede pela vitrine',
  titleSize: 76,
  sub: 'Parcerias · a tela do afiliado',
  bullets: ['As casas abertas, com os termos', 'Um toque em Solicitar parceria'],
});
scene({
  file: 's4-v1-2.png',
  eyebrow: V1,
  index: 2,
  total: 3,
  title: 'Você aprova com a taxa',
  titleSize: 70,
  sub: 'Acordos · a tela da agência',
  bullets: ['O pedido cai numa fila, não no chat', 'CPA, RevShare e ciclo são seus'],
});
scene({
  file: 's4-v1-3.png',
  eyebrow: V1,
  index: 3,
  total: 3,
  title: 'O link sai pronto',
  titleSize: 84,
  sub: 'Meus links · de volta ao afiliado',
  bullets: ['A URL já sai com a tag dele', 'Baseline, rollover e meta no cartão'],
});
card({
  file: 's4-v1-cta.png',
  eyebrow: '',
  lines: ['A plataforma', 'da sua agência', '~de afiliados'],
  lineSize: 92,
  foot: 'Sua marca, seu domínio, seus acordos',
  footAccent: 'affiliacore.com.br',
});

console.log('OUT →', OUT);
