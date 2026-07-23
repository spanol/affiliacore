// Mídias do ebook (2026-07-22) — capa de produto Kiwify (1080²), capa vertical
// (1600×2560) e banner de checkout (1900×480). Pipeline SVG + fontes reais →
// PNG (resvg). Gera DOIS jogos de título:
//   variante "aposta"      → título "Agência, não aposta." (hook anti-guru)
//   variante "construindo" → título "Construindo sua agência de afiliados"
//     (= nome do produto na Kiwify; a plataforma barra "aposta"/"igaming")
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

// suf = sufixo do arquivo; t1/t2 = duas linhas do título; sub = subtítulo;
// t1size/t2size dão flexibilidade p/ títulos longos.
function buildSet(suf, t1, t2, sub1, sub2, sizes) {
  // ——— CAPA DE PRODUTO KIWIFY (1080²) ———
  render(`capa-produto-${suf}-1080.png`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
    ${bgDark('cp')}<rect width="1080" height="1080" fill="url(#cp)"/>
    <rect x="60" y="60" width="960" height="960" rx="34" fill="none" stroke="${HAIR}" stroke-width="2"/>
    <text x="540" y="200" text-anchor="middle" font-family="Inter" font-weight="600" font-size="27" letter-spacing="7" fill="${EMBER_L}">GUIA INSTITUCIONAL · EDIÇÃO 2026</text>
    <text x="540" y="${sizes.sq.y1}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="${sizes.sq.fs}" letter-spacing="-2" fill="#ffffff">${t1}</text>
    <text x="540" y="${sizes.sq.y2}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="${sizes.sq.fs}" letter-spacing="-2" fill="${EMBER_L}">${t2}</text>
    <line x1="410" y1="${sizes.sq.line}" x2="670" y2="${sizes.sq.line}" stroke="${EMBER}" stroke-width="5"/>
    <text x="540" y="726" text-anchor="middle" font-family="Inter" font-weight="400" font-size="33" fill="${MUTED}">${sub1}</text>
    <text x="540" y="774" text-anchor="middle" font-family="Inter" font-weight="400" font-size="33" fill="${MUTED}">${sub2}</text>
    <rect x="330" y="828" width="420" height="58" rx="29" fill="none" stroke="${HAIR}" stroke-width="2"/>
    <text x="540" y="866" text-anchor="middle" font-family="Inter" font-weight="600" font-size="24" letter-spacing="2" fill="${MUTED}">INCLUI AS REGRAS DE JULHO/2026</text>
    ${lockup(398, 972, 50, lockDark)}
  </svg>`, 1080);

  // ——— CAPA DO LIVRO (1600×2560) ———
  render(`capa-livro-${suf}-1600x2560.png`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 2560">
    ${bgDark('cl')}<rect width="1600" height="2560" fill="url(#cl)"/>
    <rect x="80" y="80" width="1440" height="2400" rx="40" fill="none" stroke="${HAIR}" stroke-width="3"/>
    <text x="800" y="360" text-anchor="middle" font-family="Inter" font-weight="600" font-size="42" letter-spacing="11" fill="${EMBER_L}">GUIA INSTITUCIONAL</text>
    <text x="800" y="432" text-anchor="middle" font-family="Inter" font-weight="600" font-size="42" letter-spacing="11" fill="${MUTED}">EDIÇÃO 2026</text>
    <text x="800" y="${sizes.bk.y1}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="${sizes.bk.fs}" letter-spacing="-3" fill="#ffffff">${t1}</text>
    <text x="800" y="${sizes.bk.y2}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="${sizes.bk.fs}" letter-spacing="-3" fill="${EMBER_L}">${t2}</text>
    <line x1="560" y1="${sizes.bk.line}" x2="1040" y2="${sizes.bk.line}" stroke="${EMBER}" stroke-width="7"/>
    <text x="800" y="1450" text-anchor="middle" font-family="Inter" font-weight="400" font-size="52" fill="${MUTED}">${sub1}</text>
    <text x="800" y="1524" text-anchor="middle" font-family="Inter" font-weight="400" font-size="52" fill="${MUTED}">${sub2}</text>
    <rect x="430" y="1680" width="740" height="86" rx="43" fill="none" stroke="${HAIR}" stroke-width="3"/>
    <text x="800" y="1736" text-anchor="middle" font-family="Inter" font-weight="600" font-size="36" letter-spacing="3" fill="${MUTED}">INCLUI AS REGRAS DE JULHO/2026</text>
    <text x="800" y="2160" text-anchor="middle" font-family="Inter" font-weight="400" font-size="40" fill="${MUTED}">escrito por quem opera — não por quem posa</text>
    ${lockup(556, 2330, 66, lockDark)}
    <text x="800" y="2416" text-anchor="middle" font-family="Inter" font-weight="400" font-size="34" fill="${MUTED}">affiliacore.com.br</text>
  </svg>`, 1600);

  // ——— BANNER DE CHECKOUT (1900×480) ———
  render(`banner-checkout-${suf}-1900x480.png`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1900 480">
    ${bgDark('bn')}<rect width="1900" height="480" fill="url(#bn)"/>
    <text x="120" y="130" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_L}">GUIA INSTITUCIONAL · EDIÇÃO 2026</text>
    <text x="120" y="${sizes.bn.y1}" font-family="Bricolage Grotesque" font-weight="800" font-size="${sizes.bn.fs}" letter-spacing="-1.5" fill="#ffffff">${t1} <tspan fill="${EMBER_L}">${sizes.bn.inline ? t2 : ''}</tspan></text>
    ${sizes.bn.inline ? '' : `<text x="120" y="${sizes.bn.y2}" font-family="Bricolage Grotesque" font-weight="800" font-size="${sizes.bn.fs}" letter-spacing="-1.5" fill="${EMBER_L}">${t2}</text>`}
    <text x="120" y="${sizes.bn.sub}" font-family="Inter" font-weight="600" font-size="27" fill="#ffffff">Acesso imediato · PDF + área de membros · 7 dias de garantia</text>
    ${lockup(1508, 250, 56, lockDark)}
  </svg>`, 1900);
}

// —— VARIANTE A: hook "Agência, não aposta." ————————————————————————————————
buildSet('aposta', 'Agência,', 'não aposta.',
  'O guia para montar e operar uma agência de',
  'afiliados no mercado regulamentado brasileiro',
  { sq:{fs:132,y1:428,y2:572,line:646}, bk:{fs:212,y1:960,y2:1190,line:1310}, bn:{fs:92,y1:258,y2:0,sub:396,inline:true} });

// —— VARIANTE B: nome do produto na Kiwify (sem "aposta") ————————————————————
buildSet('construindo', 'Construindo sua', 'agência de afiliados',
  'Do primeiro contrato à gestão da rede —',
  'no mercado regulamentado brasileiro',
  { sq:{fs:88,y1:412,y2:520,line:588}, bk:{fs:150,y1:930,y2:1110,line:1230}, bn:{fs:66,y1:250,y2:330,sub:410,inline:false} });

console.log('OUT →', OUT);
