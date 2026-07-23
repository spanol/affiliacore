// Série de posts do guia (2026-07-23) — 4 criativos 1080² p/ IG/FB, tema ember,
// dark/light alternado (espelho da landing). Mesmas fontes/pipeline do ebook.
// Arco: E1 anti-guru (dark) · E2 regulatório (light) · E3 o que tem dentro
// (dark) · E4 oferta (light). Destino: affiliacore.com.br/ebook.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import wawoff2 from 'wawoff2';
import { Resvg } from '@resvg/resvg-js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, '..', 'ebook', 'lancamento', 'midias', 'posts');
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

function glyph(cx, cy, r, ring, dot) {
  const stroke = r * 2 * 0.164, rm = r - stroke / 2, dotR = r * 2 * 0.157;
  const cos = Math.cos((40 * Math.PI) / 180), sin = Math.sin((40 * Math.PI) / 180);
  return `<path d="M ${(cx + rm * cos).toFixed(1)} ${(cy - rm * sin).toFixed(1)} A ${rm.toFixed(1)} ${rm.toFixed(1)} 0 1 0 ${(cx + rm * cos).toFixed(1)} ${(cy + rm * sin).toFixed(1)}" fill="none" stroke="${ring}" stroke-width="${stroke.toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="${dotR.toFixed(1)}" fill="${dot}"/>`;
}
// lockup centrado em x=540
function lockup(y, size, { affilia, ore, ring, dot }) {
  const x = 540 - 2.84 * size;
  const wA = 2.85 * size, r = size * 0.36;
  const gx = x + wA + size * 0.09 + r, oreX = gx + r - size * 0.04;
  return `<text x="${x}" y="${y}" font-family="Bricolage Grotesque" font-weight="800" font-size="${size}" letter-spacing="${(-0.02 * size).toFixed(1)}" fill="${affilia}">Affilia</text>
  ${glyph(gx, y - size * 0.34, r, ring, dot)}
  <text x="${oreX}" y="${y}" font-family="Bricolage Grotesque" font-weight="500" font-size="${size}" letter-spacing="${(-0.02 * size).toFixed(1)}" fill="${ore}">ore</text>`;
}
const lockDark = { affilia: '#ffffff', ore: EMBER_L, ring: EMBER_L, dot: '#ffffff' };
const lockLight = { affilia: '#1c1014', ore: '#be123c', ring: '#be123c', dot: '#be123c' };

const bgDark = `<radialGradient id="bg" cx="0.72" cy="-0.15" r="1.5">
  <stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="${INK}"/>
</radialGradient>`;
const bgLight = `<radialGradient id="bg" cx="0.72" cy="-0.12" r="1.5">
  <stop offset="0" stop-color="#fdeef2"/><stop offset="0.4" stop-color="#fcf5f7"/><stop offset="0.85" stop-color="#fbf7f8"/>
</radialGradient>`;

const THEME = {
  dark:  { bg: bgDark,  ink: '#ffffff', accent: EMBER_L, muted: '#af9da2', hair: '#34262a', rule: EMBER, logo: lockDark },
  light: { bg: bgLight, ink: '#1c1014', accent: '#be123c', muted: '#6e5a60', hair: '#e7dfe2', rule: EMBER, logo: lockLight },
};

// linhas de texto centradas (x=540); cada linha = {t, a?} (a=usar cor accent)
function lines(arr, y1, lh, fs, family, weight, base, accent, ls = 0) {
  return arr.map((ln, i) =>
    `<text x="540" y="${y1 + i * lh}" text-anchor="middle" font-family="${family}" font-weight="${weight}" font-size="${fs}" ${ls ? `letter-spacing="${ls}"` : ''} fill="${ln.a ? accent : base}">${ln.t}</text>`
  ).join('\n  ');
}

function post({ name, theme, eyebrow, hl, hlFs, hlY, hlLh, rule, sub, subFs, subY, subLh, cta }) {
  const t = THEME[theme];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  <defs>${t.bg}</defs><rect width="1080" height="1080" fill="url(#bg)"/>
  <rect x="60" y="60" width="960" height="960" rx="34" fill="none" stroke="${t.hair}" stroke-width="2"/>
  <text x="540" y="192" text-anchor="middle" font-family="Inter" font-weight="600" font-size="26" letter-spacing="7" fill="${t.accent}">${eyebrow}</text>
  ${lines(hl, hlY, hlLh, hlFs, 'Bricolage Grotesque', 800, t.ink, t.accent)}
  <line x1="470" y1="${rule}" x2="610" y2="${rule}" stroke="${t.rule}" stroke-width="5"/>
  ${lines(sub, subY, subLh, subFs, 'Inter', 400, t.muted, t.muted)}
  <text x="540" y="892" text-anchor="middle" font-family="Inter" font-weight="600" font-size="30" fill="${t.accent}">${cta}</text>
  ${lockup(972, 46, t.logo)}
</svg>`;
  const r = new Resvg(svg, { background: 'rgba(0,0,0,0)', fitTo: { mode: 'width', value: 1080 },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Inter' } });
  writeFileSync(join(OUT, `${name}.png`), r.render().asPng());
  console.log(`${name} ok`);
}

// —— E1 · anti-guru (dark) ——
post({ name: 'e1-antiguru', theme: 'dark', eyebrow: 'NOVO · GUIA AFFILIACORE',
  hl: [{ t: 'Não é curso de guru.' }, { t: 'É um guia de negócio.', a: true }], hlFs: 78, hlY: 428, hlLh: 96, rule: 580,
  sub: [{ t: 'Construindo sua agência de afiliados —' }, { t: 'o guia institucional da AffiliaCore.' }], subFs: 31, subY: 626, subLh: 46,
  cta: 'affiliacore.com.br/ebook · R$ 47' });

// —— E2 · regulatório (light) ——
post({ name: 'e2-regulatorio', theme: 'light', eyebrow: 'POR QUE AGORA',
  hl: [{ t: 'Boa parte do que os cursos' }, { t: 'do nicho prometem hoje' }, { t: 'é proibido por lei.', a: true }], hlFs: 64, hlY: 388, hlLh: 78, rule: 606,
  sub: [{ t: 'As regras de julho/2026 mudaram o jogo —' }, { t: 'e o guia mostra onde está a linha.' }], subFs: 31, subY: 668, subLh: 46,
  cta: 'affiliacore.com.br/ebook' });

// —— E3 · o que tem dentro (dark) ——
post({ name: 'e3-dentro', theme: 'dark', eyebrow: 'O QUE TEM DENTRO',
  hl: [{ t: '8 capítulos, do mercado' }, { t: 'ao seu 1º trimestre.', a: true }], hlFs: 80, hlY: 418, hlLh: 98, rule: 570,
  sub: [{ t: 'Modelos de comissão com contratos reais, a' }, { t: 'lei explicada pra quem divulga, e o caso real' }, { t: 'da agência que virou nossa plataforma.' }], subFs: 28, subY: 620, subLh: 42,
  cta: '~60 páginas · affiliacore.com.br/ebook' });

// —— E4 · oferta / CTA (light) ——
post({ name: 'e4-oferta', theme: 'light', eyebrow: 'GUIA + KIT',
  hl: [{ t: 'Comece a montar' }, { t: 'sua agência hoje.', a: true }], hlFs: 86, hlY: 430, hlLh: 104, rule: 588,
  sub: [{ t: 'O guia (R$ 47) + o Kit de Operação: calculadora,' }, { t: 'checklist e modelo de contrato. 7 dias de garantia.' }], subFs: 29, subY: 636, subLh: 44,
  cta: 'affiliacore.com.br/ebook' });

console.log('OUT →', OUT);
