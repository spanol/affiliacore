// Posts 5–7 da série "chamariz de lucratividade" (2026-07-18) — SVG com as
// fontes reais (Bricolage/Inter, woff2→ttf via wawoff2) → PNG (resvg), mesmo
// pipeline do gen-social.mjs. Posts 5 e 7 estreiam o TEMA CLARO da marca
// (espelho do html.light da landing); post 6 segue dark p/ alternar o feed.
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

// dark (idêntico ao gen-social)
const EMBER = '#e11d48', EMBER_L = '#e45b79', INK = '#11070a';
const MUTED = '#af9da2', HAIR = '#34262a';
// light (espelho do html.light da landing: ember-l escurece p/ contraste)
const L_INK = '#1c1014', L_MUTED = '#6e5a60', L_FAINT = '#9a878d';
const L_HAIR = '#e8dce0', EMBER_D = '#be123c', L_PINK = '#fbe4ea';

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
const lockLight = { affilia: L_INK, ore: EMBER_D, ring: EMBER, dot: L_INK };

const bgDark = (id) => `<defs><radialGradient id="${id}" cx="0.72" cy="-0.15" r="1.5">
  <stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="${INK}"/>
</radialGradient></defs>`;
const bgLight = (id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#faf2f4"/><stop offset="1" stop-color="#f7edf0"/>
</linearGradient><radialGradient id="${id}g" cx="0.78" cy="-0.1" r="1.0">
  <stop offset="0" stop-color="#f7d7de"/><stop offset="0.6" stop-color="#f7d7de" stop-opacity="0"/>
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

// ——— POST 5 — a conta da agência (LIGHT) ————————————————————————————————————
render('post-5-conta.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgLight('p5')}<rect width="1080" height="1080" fill="url(#p5)"/><rect width="1080" height="1080" fill="url(#p5g)"/>
  <text x="96" y="120" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_D}">A CONTA DA AGÊNCIA</text>
  <text x="96" y="238" font-family="Bricolage Grotesque" font-weight="800" font-size="78" fill="${L_INK}">Quanto rende uma</text>
  <text x="96" y="332" font-family="Bricolage Grotesque" font-weight="800" font-size="78" fill="${EMBER_D}">operação dessas?</text>

  <rect x="96" y="396" width="888" height="440" rx="28" fill="#ffffff" stroke="${L_HAIR}" stroke-width="3"/>
  <text x="156" y="478" font-family="Inter" font-size="31" fill="${L_MUTED}">A casa te paga (CPA)</text>
  <text x="924" y="478" text-anchor="end" font-family="Inter" font-weight="600" font-size="34" fill="${L_INK}">R$ 600</text>
  <line x1="156" y1="510" x2="924" y2="510" stroke="${L_HAIR}" stroke-width="2"/>
  <text x="156" y="576" font-family="Inter" font-size="31" fill="${L_MUTED}">Você repassa ao afiliado</text>
  <text x="924" y="576" text-anchor="end" font-family="Inter" font-weight="600" font-size="34" fill="${L_INK}">− R$ 400</text>
  <line x1="156" y1="608" x2="924" y2="608" stroke="${L_HAIR}" stroke-width="2"/>
  <text x="156" y="674" font-family="Inter" font-size="31" fill="${L_MUTED}">Sua margem × 120 FTDs no mês</text>
  <text x="924" y="674" text-anchor="end" font-family="Inter" font-weight="600" font-size="34" fill="${EMBER_D}">R$ 200 / FTD</text>
  <rect x="156" y="712" width="768" height="92" rx="18" fill="${L_PINK}" stroke="${EMBER}" stroke-opacity="0.45" stroke-width="2"/>
  <text x="192" y="770" font-family="Inter" font-weight="600" font-size="24" letter-spacing="3" fill="${EMBER_D}">MARGEM / MÊS</text>
  <text x="888" y="774" text-anchor="end" font-family="Bricolage Grotesque" font-weight="800" font-size="52" fill="${L_INK}">R$ 24.000</text>

  <text x="96" y="898" font-family="Inter" font-size="29" fill="${L_FAINT}">Números ilustrativos — faça a conta com os seus no simulador do site.</text>
  <line x1="96" y1="940" x2="984" y2="940" stroke="${L_HAIR}" stroke-width="2"/>
  ${lockup(96, 1020, 40, lockLight)}
  <text x="984" y="1020" text-anchor="end" font-family="Inter" font-weight="600" font-size="28" fill="${L_MUTED}">affiliacore.com.br</text>
</svg>`, 1080);

// ——— POST 6 — do zero à agência (DARK) ——————————————————————————————————————
const step = (y, n, title, sub) => `
  <text x="96" y="${y}" font-family="Bricolage Grotesque" font-weight="800" font-size="34" fill="${EMBER_L}">${n}</text>
  <text x="176" y="${y}" font-family="Inter" font-weight="600" font-size="35" fill="#ffffff">${title}</text>
  <text x="176" y="${y + 46}" font-family="Inter" font-size="28" fill="${MUTED}">${sub}</text>`;
render('post-6-dozero.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgDark('p6')}<rect width="1080" height="1080" fill="url(#p6)"/>
  <text x="96" y="130" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_L}">QUER ENTRAR NO JOGO?</text>
  <text x="96" y="262" font-family="Bricolage Grotesque" font-weight="800" font-size="82" fill="#ffffff">Do zero à agência</text>
  <text x="96" y="362" font-family="Bricolage Grotesque" font-weight="800" font-size="82" fill="${EMBER_L}">em 3 passos.</text>
  ${step(500, '01', 'Feche deals diretos com as casas', 'CPA e/ou REV — o contato e o contrato são seus.')}
  ${step(640, '02', 'Receba o painel com a sua marca', 'Instância própria, pronta em dias: domínio, logo, cores.')}
  ${step(780, '03', 'Convide afiliados e defina o repasse', 'A diferença entre o que a casa paga e o repasse é sua.')}
  <line x1="96" y1="880" x2="984" y2="880" stroke="${HAIR}" stroke-width="2"/>
  ${lockup(96, 972, 40, lockDark)}
  <text x="984" y="972" text-anchor="end" font-family="Inter" font-weight="600" font-size="28" fill="${MUTED}">affiliacore.com.br</text>
</svg>`, 1080);

// ——— POST 7 — simulador (LIGHT) ————————————————————————————————————————————
const slider = (y, label, val, frac) => {
  const x0 = 156, x1 = 704;
  const fx = x0 + (x1 - x0) * frac;
  return `
  <text x="${x0}" y="${y}" font-family="Inter" font-size="29" fill="${L_MUTED}">${label}</text>
  <text x="924" y="${y}" text-anchor="end" font-family="Bricolage Grotesque" font-weight="800" font-size="32" fill="${L_INK}">${val}</text>
  <line x1="${x0}" y1="${y + 34}" x2="924" y2="${y + 34}" stroke="${L_HAIR}" stroke-width="8" stroke-linecap="round"/>
  <line x1="${x0}" y1="${y + 34}" x2="${fx}" y2="${y + 34}" stroke="${EMBER}" stroke-width="8" stroke-linecap="round"/>
  <circle cx="${fx}" cy="${y + 34}" r="16" fill="${EMBER}"/>`;
};
render('post-7-simulador.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgLight('p7')}<rect width="1080" height="1080" fill="url(#p7)"/><rect width="1080" height="1080" fill="url(#p7g)"/>
  <text x="96" y="120" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_D}">FERRAMENTA GRÁTIS NO SITE</text>
  <text x="96" y="238" font-family="Bricolage Grotesque" font-weight="800" font-size="78" fill="${L_INK}">Simule a margem</text>
  <text x="96" y="332" font-family="Bricolage Grotesque" font-weight="800" font-size="78" fill="${EMBER_D}">da sua operação.</text>

  <rect x="96" y="396" width="888" height="416" rx="28" fill="#ffffff" stroke="${L_HAIR}" stroke-width="3"/>
  ${slider(470, 'Afiliados ativos', '15', 0.14)}
  ${slider(584, 'CPA que a casa te paga', 'R$ 600', 0.36)}
  <rect x="156" y="668" width="768" height="104" rx="18" fill="${L_PINK}" stroke="${EMBER}" stroke-opacity="0.45" stroke-width="2"/>
  <text x="192" y="712" font-family="Inter" font-weight="600" font-size="23" letter-spacing="3" fill="${EMBER_D}">MARGEM DA AGÊNCIA / MÊS</text>
  <text x="192" y="756" font-family="Inter" font-size="24" fill="${L_MUTED}">com os seus números</text>
  <text x="888" y="748" text-anchor="end" font-family="Bricolage Grotesque" font-weight="800" font-size="56" fill="${L_INK}">R$ 24.000</text>

  <rect x="285" y="856" width="510" height="80" rx="40" fill="${EMBER}"/>
  <text x="540" y="907" text-anchor="middle" font-family="Inter" font-weight="600" font-size="30" fill="#ffffff">affiliacore.com.br · Simulador</text>
  <line x1="96" y1="980" x2="984" y2="980" stroke="${L_HAIR}" stroke-width="2"/>
  ${lockup(96, 1044, 36, lockLight)}
  <text x="984" y="1044" text-anchor="end" font-family="Inter" font-weight="600" font-size="26" fill="${L_MUTED}">affiliacore.com.br</text>
</svg>`, 1080);

console.log('posts 5-7 em social-out/');
