// Mídias do ebook "Agência, não aposta" (2026-07-22) — capa de produto Kiwify
// (1080²), capa vertical do livro (1600×2560) e banner de checkout (1900×480).
// Mesmo pipeline dos gen-posts (SVG + fontes reais → PNG via resvg).
// Título ainda em recomendação — se o produto na Kiwify usar outro, ajustar
// TITLE_1/TITLE_2 e re-rodar.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import wawoff2 from 'wawoff2';
import { Resvg } from '@resvg/resvg-js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, '..', 'ebook', 'lancamento', 'midias');
const TTF = join(ROOT, 'fonts-ttf');
mkdirSync(OUT, { recursive: true });

const FONTS = ['bricolage-grotesque-500', 'bricolage-grotesque-800', 'inter-400', 'inter-600'];
const fontFiles = [];
for (const f of FONTS) {
  const dest = join(TTF, `${f}.ttf`);
  writeFileSync(dest, await wawoff2.decompress(readFileSync(join(ROOT, 'fonts', `${f}.woff2`))));
  fontFiles.push(dest);
}

const EMBER = '#e11d48', EMBER_L = '#e45b79', INK = '#11070a';
const MUTED = '#af9da2', HAIR = '#34262a';

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

const bgDark = (id) => `<defs><radialGradient id="${id}" cx="0.72" cy="-0.15" r="1.5">
  <stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="${INK}"/>
</radialGradient></defs>`;

function render(name, svg, width) {
  const r = new Resvg(svg, {
    background: 'rgba(0,0,0,0)',
    fitTo: { mode: 'width', value: width },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Inter' },
  });
  writeFileSync(join(OUT, name), r.render().asPng());
  console.log(`${name} ok`);
}

const TITLE_1 = 'Agência,';
const TITLE_2 = 'não aposta.';
const SUB_1 = 'O guia para montar e operar uma agência de';
const SUB_2 = 'afiliados no mercado regulamentado brasileiro';

// ——— 1 · CAPA DE PRODUTO KIWIFY (1080×1080, dark) ———————————————————————————
render('capa-produto-1080.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgDark('cp')}<rect width="1080" height="1080" fill="url(#cp)"/>
  <rect x="60" y="60" width="960" height="960" rx="34" fill="none" stroke="${HAIR}" stroke-width="2"/>
  <text x="540" y="200" text-anchor="middle" font-family="Inter" font-weight="600" font-size="27" letter-spacing="7" fill="${EMBER_L}">GUIA INSTITUCIONAL · EDIÇÃO 2026</text>
  <text x="540" y="428" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="132" letter-spacing="-2.6" fill="#ffffff">${TITLE_1}</text>
  <text x="540" y="572" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="132" letter-spacing="-2.6" fill="${EMBER_L}">${TITLE_2}</text>
  <line x1="410" y1="646" x2="670" y2="646" stroke="${EMBER}" stroke-width="5"/>
  <text x="540" y="726" text-anchor="middle" font-family="Inter" font-weight="400" font-size="33" fill="${MUTED}">${SUB_1}</text>
  <text x="540" y="774" text-anchor="middle" font-family="Inter" font-weight="400" font-size="33" fill="${MUTED}">${SUB_2}</text>
  <rect x="330" y="828" width="420" height="58" rx="29" fill="none" stroke="${HAIR}" stroke-width="2"/>
  <text x="540" y="866" text-anchor="middle" font-family="Inter" font-weight="600" font-size="24" letter-spacing="2" fill="${MUTED}">INCLUI AS REGRAS DE JULHO/2026</text>
  ${lockup(398, 972, 50, lockDark)}
</svg>`, 1080);

// ——— 2 · CAPA DO LIVRO (1600×2560, dark — proporção padrão de ebook) ————————
render('capa-livro-1600x2560.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 2560">
  ${bgDark('cl')}<rect width="1600" height="2560" fill="url(#cl)"/>
  <rect x="80" y="80" width="1440" height="2400" rx="40" fill="none" stroke="${HAIR}" stroke-width="3"/>
  <text x="800" y="360" text-anchor="middle" font-family="Inter" font-weight="600" font-size="42" letter-spacing="11" fill="${EMBER_L}">GUIA INSTITUCIONAL</text>
  <text x="800" y="432" text-anchor="middle" font-family="Inter" font-weight="600" font-size="42" letter-spacing="11" fill="${MUTED}">EDIÇÃO 2026</text>
  <text x="800" y="960" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="212" letter-spacing="-4" fill="#ffffff">${TITLE_1}</text>
  <text x="800" y="1190" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="212" letter-spacing="-4" fill="${EMBER_L}">${TITLE_2}</text>
  <line x1="560" y1="1310" x2="1040" y2="1310" stroke="${EMBER}" stroke-width="7"/>
  <text x="800" y="1450" text-anchor="middle" font-family="Inter" font-weight="400" font-size="52" fill="${MUTED}">${SUB_1}</text>
  <text x="800" y="1524" text-anchor="middle" font-family="Inter" font-weight="400" font-size="52" fill="${MUTED}">${SUB_2}</text>
  <g>
    <rect x="430" y="1680" width="740" height="86" rx="43" fill="none" stroke="${HAIR}" stroke-width="3"/>
    <text x="800" y="1736" text-anchor="middle" font-family="Inter" font-weight="600" font-size="36" letter-spacing="3" fill="${MUTED}">INCLUI AS REGRAS DE JULHO/2026</text>
  </g>
  <text x="800" y="2160" text-anchor="middle" font-family="Inter" font-weight="400" font-size="40" fill="${MUTED}">escrito por quem opera — não por quem posa</text>
  ${lockup(556, 2330, 66, lockDark)}
  <text x="800" y="2416" text-anchor="middle" font-family="Inter" font-weight="400" font-size="34" fill="${MUTED}">affiliacore.com.br</text>
</svg>`, 1600);

// ——— 3 · BANNER DE CHECKOUT (1900×480, dark) ————————————————————————————————
render('banner-checkout-1900x480.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1900 480">
  ${bgDark('bn')}<rect width="1900" height="480" fill="url(#bn)"/>
  <text x="120" y="150" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_L}">GUIA INSTITUCIONAL · EDIÇÃO 2026</text>
  <text x="120" y="258" font-family="Bricolage Grotesque" font-weight="800" font-size="92" letter-spacing="-1.8" fill="#ffffff">${TITLE_1} <tspan fill="${EMBER_L}">${TITLE_2}</tspan></text>
  <text x="120" y="330" font-family="Inter" font-weight="400" font-size="32" fill="${MUTED}">${SUB_1} ${SUB_2.replace(' brasileiro','')}</text>
  <text x="120" y="396" font-family="Inter" font-weight="600" font-size="27" fill="#ffffff">Acesso imediato · PDF + área de membros · 7 dias de garantia</text>
  ${lockup(1508, 268, 56, lockDark)}
</svg>`, 1900);

console.log('OUT →', OUT);
