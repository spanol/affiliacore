import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import wawoff2 from 'wawoff2';
import { Resvg } from '@resvg/resvg-js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'social-out');
const TTF = join(ROOT, 'fonts-ttf');
mkdirSync(OUT, { recursive: true });
mkdirSync(TTF, { recursive: true });

const FONTS = ['bricolage-grotesque-500', 'bricolage-grotesque-800', 'inter-400', 'inter-600'];
const fontFiles = [];
for (const f of FONTS) {
  const dest = join(TTF, `${f}.ttf`);
  writeFileSync(dest, await wawoff2.decompress(readFileSync(join(ROOT, 'fonts', `${f}.woff2`))));
  fontFiles.push(dest);
}

const EMBER = '#e11d48';
const EMBER_L = '#fb7185';
const INK = '#11070a';
const PLUM = '#26181c';
const MUTED = '#af9da2';
const HAIR = '#34262a';
const WHITE = '#ffffff';

function glyph(cx, cy, r, ring = EMBER, dot = WHITE) {
  const stroke = r * 2 * 0.164, rm = r - stroke / 2, dotR = r * 2 * 0.157;
  const cos = Math.cos((40 * Math.PI) / 180), sin = Math.sin((40 * Math.PI) / 180);
  return `<path d="M ${(cx + rm * cos).toFixed(1)} ${(cy - rm * sin).toFixed(1)} A ${rm.toFixed(1)} ${rm.toFixed(1)} 0 1 0 ${(cx + rm * cos).toFixed(1)} ${(cy + rm * sin).toFixed(1)}" fill="none" stroke="${ring}" stroke-width="${stroke.toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="${dotR.toFixed(1)}" fill="${dot}"/>`;
}

function lockup(x, y, size, { affilia = WHITE, ore = EMBER_L, ring = EMBER_L, dot = WHITE } = {}) {
  const wA = 2.85 * size;
  const r = size * 0.36;
  const gx = x + wA + size * 0.09 + r;
  const oreX = gx + r - size * 0.04;
  return `<text x="${x}" y="${y}" font-family="Bricolage Grotesque" font-weight="800" font-size="${size}" letter-spacing="${(-0.02 * size).toFixed(1)}" fill="${affilia}">Affilia</text>
  ${glyph(gx, y - size * 0.34, r, ring, dot)}
  <text x="${oreX}" y="${y}" font-family="Bricolage Grotesque" font-weight="500" font-size="${size}" letter-spacing="${(-0.02 * size).toFixed(1)}" fill="${ore}">ore</text>`;
}

const bgDark = (id) => `<defs>
  <radialGradient id="${id}" cx="0.74" cy="-0.12" r="1.55">
    <stop offset="0" stop-color="#6c0e23"/>
    <stop offset="0.34" stop-color="#4a0a18"/>
    <stop offset="0.78" stop-color="${INK}"/>
  </radialGradient>
  <linearGradient id="${id}line" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.08"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0.01"/>
  </linearGradient>
</defs>`;

function render(name, svg, width) {
  const r = new Resvg(svg, {
    background: 'rgba(0,0,0,0)',
    fitTo: { mode: 'width', value: width },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Inter' },
  });
  writeFileSync(join(OUT, name), r.render().asPng());
  console.log(`${name} ok`);
}

const bullet = (x, y, txt) => `${glyph(x, y - 11, 18)}<text x="${x + 46}" y="${y}" font-family="Inter" font-size="28" fill="${WHITE}">${txt}</text>`;

render('campaign-form-feed.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgDark('cf')}<rect width="1080" height="1080" fill="url(#cf)"/>
  <text x="96" y="120" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_L}">DIAGNÓSTICO GRATUITO</text>
  <text x="96" y="258" font-family="Bricolage Grotesque" font-weight="800" font-size="88" fill="${WHITE}">Sua agência cresceu.</text>
  <text x="96" y="360" font-family="Bricolage Grotesque" font-weight="800" font-size="88" fill="${EMBER_L}">A planilha não.</text>
  <text x="96" y="448" font-family="Inter" font-size="34" fill="${MUTED}">Descubra onde sua operação perde controle</text>
  <text x="96" y="494" font-family="Inter" font-size="34" fill="${MUTED}">e como escalar com mais clareza.</text>

  <rect x="96" y="566" width="888" height="246" rx="28" fill="#1a0f13" stroke="url(#cfline)" stroke-width="3"/>
  ${bullet(128, 640, 'CPA + REV por casa, sem fechamento manual')}
  ${bullet(128, 716, 'Portal do afiliado com a sua marca')}
  ${bullet(128, 792, 'Diagnóstico comercial em menos de 2 minutos')}

  <rect x="96" y="876" width="888" height="92" rx="46" fill="${EMBER}"/>
  <text x="540" y="933" text-anchor="middle" font-family="Inter" font-weight="600" font-size="32" fill="${WHITE}">form.affiliacore.com.br</text>

  <line x1="96" y1="1000" x2="984" y2="1000" stroke="${HAIR}" stroke-width="2"/>
  ${lockup(96, 1050, 36)}
</svg>`, 1080);

render('campaign-form-story.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  ${bgDark('cs')}<rect width="1080" height="1920" fill="url(#cs)"/>
  <rect x="72" y="84" width="420" height="54" rx="27" fill="none" stroke="${EMBER_L}" stroke-width="2"/>
  <text x="282" y="120" text-anchor="middle" font-family="Inter" font-weight="600" font-size="24" letter-spacing="5" fill="${EMBER_L}">DIAGNÓSTICO GRATUITO</text>

  <text x="72" y="310" font-family="Bricolage Grotesque" font-weight="800" font-size="108" fill="${WHITE}">Sua agência</text>
  <text x="72" y="430" font-family="Bricolage Grotesque" font-weight="800" font-size="108" fill="${WHITE}">cresceu.</text>
  <text x="72" y="566" font-family="Bricolage Grotesque" font-weight="800" font-size="116" fill="${EMBER_L}">A planilha não.</text>

  <text x="72" y="700" font-family="Inter" font-size="40" fill="${MUTED}">Se você ainda fecha CPA e REV na mão,</text>
  <text x="72" y="752" font-family="Inter" font-size="40" fill="${MUTED}">já existe gargalo demais na sua operação.</text>

  <rect x="72" y="910" width="936" height="356" rx="36" fill="#1a0f13" stroke="url(#csline)" stroke-width="3"/>
  ${bullet(116, 1010, 'Mais controle da operação')}
  ${bullet(116, 1110, 'Mais transparência para a rede')}
  ${bullet(116, 1210, 'Mais clareza para escalar')}

  <rect x="72" y="1440" width="936" height="108" rx="54" fill="${EMBER}"/>
  <text x="540" y="1508" text-anchor="middle" font-family="Inter" font-weight="600" font-size="38" fill="${WHITE}">Conheça a AffiliaCore</text>
  <text x="540" y="1570" text-anchor="middle" font-family="Inter" font-size="26" fill="${MUTED}">form.affiliacore.com.br</text>

  <line x1="72" y1="1788" x2="1008" y2="1788" stroke="${HAIR}" stroke-width="2"/>
  ${lockup(72, 1862, 42)}
  <text x="1008" y="1862" text-anchor="end" font-family="Inter" font-weight="600" font-size="28" fill="${MUTED}">@affiliacore.br</text>
</svg>`, 1080);

console.log('campaign-form-feed.png e campaign-form-story.png em social-out/');
