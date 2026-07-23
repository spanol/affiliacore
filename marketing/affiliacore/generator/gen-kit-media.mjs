// Capa do "Kit de Operação da Agência" (2026-07-23) — order bump (+R$27) do
// guia. Mesmo tema ember/fontes das mídias do ebook (gen-ebook-media.mjs).
// Gera a capa de produto Kiwify (1080²) com as 3 ferramentas do kit.
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

// item de ferramenta: pílula centrada (x=540) com marcador ember + rótulo.
function tool(y, label) {
  return `<rect x="210" y="${y}" width="660" height="76" rx="38" fill="rgba(225,29,72,0.07)" stroke="${HAIR}" stroke-width="2"/>
  <circle cx="272" cy="${y + 38}" r="7" fill="${EMBER}"/>
  <text x="308" y="${y + 49}" font-family="Inter" font-weight="600" font-size="31" fill="#ffffff">${label}</text>`;
}

// ——— CAPA DE PRODUTO KIWIFY (1080²) ———
render('capa-kit-1080.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgDark('ck')}<rect width="1080" height="1080" fill="url(#ck)"/>
  <rect x="60" y="60" width="960" height="960" rx="34" fill="none" stroke="${HAIR}" stroke-width="2"/>
  <text x="540" y="180" text-anchor="middle" font-family="Inter" font-weight="600" font-size="26" letter-spacing="7" fill="${EMBER_L}">ADICIONAL AO GUIA · EDIÇÃO 2026</text>
  <text x="540" y="336" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="104" letter-spacing="-2" fill="#ffffff">Kit de Operação</text>
  <text x="540" y="450" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="104" letter-spacing="-2" fill="${EMBER_L}">da Agência</text>
  <line x1="430" y1="520" x2="650" y2="520" stroke="${EMBER}" stroke-width="5"/>
  <text x="540" y="602" text-anchor="middle" font-family="Inter" font-weight="400" font-size="32" fill="${MUTED}">As 3 ferramentas do capítulo 4, prontas para usar</text>
  ${tool(656, 'Calculadora de comissão (.xlsx, 6 abas)')}
  ${tool(748, 'Checklist de compliance de peça')}
  ${tool(840, 'Modelo de contrato de sub-afiliado')}
  ${lockup(398, 986, 50, lockDark)}
</svg>`, 1080);

console.log('OUT →', OUT);
