// Molduras dos Reels "Por dentro do painel" (2026-07-23) — overlay 1080×1920
// com JANELA TRANSPARENTE (cantos arredondados) onde o screencast da demo
// entra por baixo via ffmpeg. Também gera a capa de cada reel (mesma moldura
// com um frame do vídeo já composto — feita no ffmpeg; aqui sai só o overlay).
// Layout pensado p/ sobreviver ao crop 4:5 do feed (mostra y 285..1635) e às
// UIs do Reels (topo/rodapé/coluna de ações à direita).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'reels');
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

function frame({ file, index, title, titleSize, sub, bullets }) {
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
  <text x="540" y="424" text-anchor="middle" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_L}">POR DENTRO DO PAINEL · ${index} DE 3</text>
  <text x="540" y="522" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="${titleSize}" letter-spacing="-2" fill="#ffffff">${title}</text>
  <text x="540" y="586" text-anchor="middle" font-family="Inter" font-weight="400" font-size="34" fill="${MUTED}">${sub}</text>
  <rect x="${WIN.x - 1.5}" y="${WIN.y - 1.5}" width="${WIN.w + 3}" height="${WIN.h + 3}" rx="${WIN.r + 1}" fill="none" stroke="${HAIR}" stroke-width="3"/>
  ${bulletsSvg}
  <rect x="325" y="1520" width="430" height="64" rx="32" fill="none" stroke="${HAIR}" stroke-width="2"/>
  <text x="540" y="1562" text-anchor="middle" font-family="Inter" font-weight="600" font-size="30" letter-spacing="1" fill="${EMBER_L}">affiliacore.com.br</text>
  <text x="540" y="1652" text-anchor="middle" font-family="Inter" font-weight="400" font-size="24" fill="${MUTED}">Ambiente de demonstração · dados fictícios</text>
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
  file: 'frame-1-agencia.png',
  index: 1,
  title: 'A visão da agência',
  titleSize: 92,
  sub: 'O backoffice de quem opera a rede',
  bullets: [
    'Casas e taxas CPA/REV por operadora',
    'Import de resultados + trilha de auditoria',
    'Jurídico versionado, com aceite',
  ],
});
frame({
  file: 'frame-2-lider-rede.png',
  index: 2,
  title: 'A visão do líder de rede',
  titleSize: 78,
  sub: 'Gestão escopada na própria sub-rede',
  bullets: [
    'Resultado consolidado da sub-rede',
    'Top afiliados e desempenho individual',
    'Drill-down em cada afiliado da rede',
  ],
});
frame({
  file: 'frame-3-afiliado.png',
  index: 3,
  title: 'A visão do afiliado',
  titleSize: 92,
  sub: 'O portal de quem divulga',
  bullets: [
    'Comissões e resultados por casa',
    'Parcerias e links com contagem de cliques',
    'Saques via PIX com nota fiscal',
  ],
});
console.log('OUT →', OUT);
