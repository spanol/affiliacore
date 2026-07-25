// Criativo do anúncio da LP de conversão /guia (2026-07-25).
// Motivo: a campanha "Guia R$47" rodava com a arte do ebook (E1 "Não é curso de
// guru" + URL /ebook impressa) apontando para /guia — a frase da arte não
// reaparecia na página e a URL impressa contradizia o destino.
// Esta arte carrega a MESMA frase da H1 da /guia (e do texto do anúncio), para
// a promessa do anúncio ser a primeira coisa que a pessoa reconhece ao chegar.
// Mesmo pipeline/estilo da série do ebook (gen-ebook-posts.mjs), tema dark.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, '..', 'ebook', 'lancamento', 'midias', 'posts');
const TTF = join(ROOT, 'fonts-ttf');
mkdirSync(OUT, { recursive: true });

// os .ttf já vivem descompactados no repo (fonts-ttf/) — sem passo wawoff2
const fontFiles = ['bricolage-grotesque-500', 'bricolage-grotesque-800', 'inter-400', 'inter-600']
  .map((f) => join(TTF, `${f}.ttf`));
for (const f of fontFiles) readFileSync(f); // falha cedo se faltar fonte

const EMBER = '#e11d48', EMBER_L = '#e45b79', INK = '#11070a';

function glyph(cx, cy, r, ring, dot) {
  const stroke = r * 2 * 0.164, rm = r - stroke / 2, dotR = r * 2 * 0.157;
  const cos = Math.cos((40 * Math.PI) / 180), sin = Math.sin((40 * Math.PI) / 180);
  return `<path d="M ${(cx + rm * cos).toFixed(1)} ${(cy - rm * sin).toFixed(1)} A ${rm.toFixed(1)} ${rm.toFixed(1)} 0 1 0 ${(cx + rm * cos).toFixed(1)} ${(cy + rm * sin).toFixed(1)}" fill="none" stroke="${ring}" stroke-width="${stroke.toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="${dotR.toFixed(1)}" fill="${dot}"/>`;
}
function lockup(y, size, { affilia, ore, ring, dot }) {
  const x = 540 - 2.84 * size;
  const wA = 2.85 * size, r = size * 0.36;
  const gx = x + wA + size * 0.09 + r, oreX = gx + r - size * 0.04;
  return `<text x="${x}" y="${y}" font-family="Bricolage Grotesque" font-weight="800" font-size="${size}" letter-spacing="${(-0.02 * size).toFixed(1)}" fill="${affilia}">Affilia</text>
  ${glyph(gx, y - size * 0.34, r, ring, dot)}
  <text x="${oreX}" y="${y}" font-family="Bricolage Grotesque" font-weight="500" font-size="${size}" letter-spacing="${(-0.02 * size).toFixed(1)}" fill="${ore}">ore</text>`;
}
const lockDark = { affilia: '#ffffff', ore: EMBER_L, ring: EMBER_L, dot: '#ffffff' };
const bgDark = `<radialGradient id="bg" cx="0.72" cy="-0.15" r="1.5">
  <stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="${INK}"/>
</radialGradient>`;
const T = { bg: bgDark, ink: '#ffffff', accent: EMBER_L, muted: '#af9da2', hair: '#34262a', rule: EMBER, logo: lockDark };

function lines(arr, y1, lh, fs, family, weight, base, accent) {
  return arr.map((ln, i) =>
    `<text x="540" y="${y1 + i * lh}" text-anchor="middle" font-family="${family}" font-weight="${weight}" font-size="${fs}" fill="${ln.a ? accent : base}">${ln.t}</text>`
  ).join('\n  ');
}

function post({ name, eyebrow, hl, hlFs, hlY, hlLh, rule, sub, subFs, subY, subLh, cta }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  <defs>${T.bg}</defs><rect width="1080" height="1080" fill="url(#bg)"/>
  <rect x="60" y="60" width="960" height="960" rx="34" fill="none" stroke="${T.hair}" stroke-width="2"/>
  <text x="540" y="192" text-anchor="middle" font-family="Inter" font-weight="600" font-size="26" letter-spacing="7" fill="${T.accent}">${eyebrow}</text>
  ${lines(hl, hlY, hlLh, hlFs, 'Bricolage Grotesque', 800, T.ink, T.accent)}
  <line x1="470" y1="${rule}" x2="610" y2="${rule}" stroke="${T.rule}" stroke-width="5"/>
  ${lines(sub, subY, subLh, subFs, 'Inter', 400, T.muted, T.muted)}
  <text x="540" y="892" text-anchor="middle" font-family="Inter" font-weight="600" font-size="30" fill="${T.accent}">${cta}</text>
  ${lockup(972, 46, T.logo)}
</svg>`;
  const r = new Resvg(svg, { background: 'rgba(0,0,0,0)', fitTo: { mode: 'width', value: 1080 },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Inter' } });
  writeFileSync(join(OUT, `${name}.png`), r.render().asPng());
  console.log(`${name} ok`);
}

// —— G1 · balcão (dark) — casa com a H1 da /guia e com o texto do anúncio ——
// "mercado regulamentado" no eyebrow (não "apostas"): guardrail Meta §1 do
// PLANO.md manda criativo E página de destino sem termos de aposta/bet/cassino.
post({ name: 'g1-balcao', eyebrow: 'O ANTI-CURSO DO MERCADO REGULAMENTADO',
  hl: [{ t: 'Pare de jogar do lado' }, { t: 'errado do balcão.', a: true }], hlFs: 76, hlY: 432, hlLh: 96, rule: 584,
  sub: [{ t: 'Contratos, compliance e gestão de rede —' }, { t: 'escrito por quem opera, não por quem posa.' }], subFs: 31, subY: 630, subLh: 46,
  cta: 'affiliacore.com.br/guia · R$ 47' });

console.log('OUT →', OUT);
