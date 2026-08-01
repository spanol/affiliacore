// Série 3 "o painel por dentro" — posts 8–10 (semana 1, 2026-08-04/06/08).
// Mesmo pipeline do gen-posts567.mjs: SVG com as fontes reais (Bricolage/Inter,
// woff2→ttf via wawoff2) → PNG via resvg. Alterna dark/light p/ dar ritmo ao feed.
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

const EMBER = '#e11d48', EMBER_L = '#e45b79', INK = '#11070a';
const MUTED = '#af9da2', HAIR = '#34262a';
const L_INK = '#1c1014', L_MUTED = '#6e5a60', L_FAINT = '#9a878d';
const L_HAIR = '#e8dce0', EMBER_D = '#be123c', L_PINK = '#fbe4ea';
const PLUM = '#1b0f14';           // superfície escura dos cards
const INFINITY = '#8332B9';       // accent da instância do cliente

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

// ——— POST 8 — nova agência no ar / white-label (DARK) ————————————————————————
const chip = (x, y, w, label) => `
  <rect x="${x}" y="${y}" width="${w}" height="62" rx="31" fill="#ffffff" fill-opacity="0.06" stroke="${HAIR}" stroke-width="2"/>
  <text x="${x + w / 2}" y="${y + 40}" text-anchor="middle" font-family="Inter" font-size="26" fill="${MUTED}">${label}</text>`;

render('post-8-infinity.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgDark('p8')}<rect width="1080" height="1080" fill="url(#p8)"/>
  <text x="96" y="118" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_L}">NOVA AGÊNCIA NO AR</text>
  <text x="96" y="234" font-family="Bricolage Grotesque" font-weight="800" font-size="76" fill="#ffffff">A plataforma é nossa.</text>
  <text x="96" y="326" font-family="Bricolage Grotesque" font-weight="800" font-size="76" fill="${EMBER_L}">A marca é deles.</text>

  <rect x="96" y="392" width="888" height="392" rx="28" fill="${PLUM}" stroke="${HAIR}" stroke-width="3"/>
  <rect x="96" y="392" width="888" height="76" rx="28" fill="#ffffff" fill-opacity="0.04"/>
  <rect x="96" y="440" width="888" height="28" fill="${PLUM}"/>
  <circle cx="140" cy="430" r="9" fill="${HAIR}"/><circle cx="170" cy="430" r="9" fill="${HAIR}"/><circle cx="200" cy="430" r="9" fill="${HAIR}"/>
  <rect x="248" y="410" width="480" height="40" rx="20" fill="#ffffff" fill-opacity="0.06"/>
  <text x="278" y="438" font-family="Inter" font-size="24" fill="${MUTED}">infinityaffiliates.agency</text>

  <circle cx="176" cy="566" r="44" fill="${INFINITY}" fill-opacity="0.16" stroke="${INFINITY}" stroke-width="3"/>
  <path d="M 176 566 C 166 552 146 552 146 566 C 146 580 166 580 176 566 C 186 552 206 552 206 566 C 206 580 186 580 176 566 Z" fill="none" stroke="${INFINITY}" stroke-width="6" stroke-linejoin="round"/>
  <text x="248" y="556" font-family="Bricolage Grotesque" font-weight="800" font-size="46" letter-spacing="2" fill="#ffffff">INFINITY</text>
  <text x="250" y="600" font-family="Inter" font-size="27" fill="${MUTED}">Painel de afiliados da agência</text>

  <line x1="152" y1="650" x2="928" y2="650" stroke="${HAIR}" stroke-width="2"/>
  ${chip(152, 690, 236, 'Domínio próprio')}
  ${chip(422, 690, 236, 'Cores e logo')}
  ${chip(692, 690, 236, 'Dados isolados')}

  <text x="96" y="848" font-family="Inter" font-size="29" fill="${MUTED}">Instância própria, no ar em dias — não é subconta de ninguém.</text>
  <line x1="96" y1="908" x2="984" y2="908" stroke="${HAIR}" stroke-width="2"/>
  ${lockup(96, 990, 40, lockDark)}
  <text x="984" y="990" text-anchor="end" font-family="Inter" font-weight="600" font-size="28" fill="${MUTED}">affiliacore.com.br</text>
</svg>`, 1080);

// ——— POST 9 — rede em níveis / lucro sobre equipe (LIGHT) ————————————————————
const tier = (y, dot, label, sub, val, valColor) => `
  <circle cx="176" cy="${y - 12}" r="11" fill="${dot}"/>
  <text x="216" y="${y - 4}" font-family="Inter" font-weight="600" font-size="33" fill="${L_INK}">${label}</text>
  <text x="216" y="${y + 38}" font-family="Inter" font-size="26" fill="${L_FAINT}">${sub}</text>
  <text x="924" y="${y + 6}" text-anchor="end" font-family="Bricolage Grotesque" font-weight="800" font-size="40" fill="${valColor}">${val}</text>`;

render('post-9-rede.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgLight('p9')}<rect width="1080" height="1080" fill="url(#p9)"/><rect width="1080" height="1080" fill="url(#p9g)"/>
  <text x="96" y="118" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_D}">NOVO NO PAINEL</text>
  <text x="96" y="234" font-family="Bricolage Grotesque" font-weight="800" font-size="78" fill="${L_INK}">Sua rede tem níveis.</text>
  <text x="96" y="326" font-family="Bricolage Grotesque" font-weight="800" font-size="78" fill="${EMBER_D}">A comissão também.</text>

  <rect x="96" y="392" width="888" height="470" rx="28" fill="#ffffff" stroke="${L_HAIR}" stroke-width="3"/>
  <text x="152" y="452" font-family="Inter" font-weight="600" font-size="23" letter-spacing="3" fill="${L_FAINT}">UM FTD DE R$ 600 PAGO PELA CASA</text>
  <line x1="152" y1="484" x2="928" y2="484" stroke="${L_HAIR}" stroke-width="2"/>
  <line x1="176" y1="524" x2="176" y2="700" stroke="${L_HAIR}" stroke-width="3"/>
  ${tier(548, EMBER, 'Afiliado que indicou', 'o repasse que você configurou pra ele', 'R$ 300', L_INK)}
  ${tier(668, '#c98aa0', 'Líder da equipe dele', 'lucro sobre equipe — override de upline', 'R$ 100', L_INK)}
  <rect x="152" y="726" width="776" height="98" rx="18" fill="${L_PINK}" stroke="${EMBER}" stroke-opacity="0.45" stroke-width="2"/>
  <text x="188" y="770" font-family="Inter" font-weight="600" font-size="23" letter-spacing="3" fill="${EMBER_D}">FICA COM A AGÊNCIA</text>
  <text x="188" y="806" font-family="Inter" font-size="24" fill="${L_MUTED}">calculado em cascata, N níveis</text>
  <text x="892" y="798" text-anchor="end" font-family="Bricolage Grotesque" font-weight="800" font-size="52" fill="${L_INK}">R$ 200</text>

  <text x="96" y="924" font-family="Inter" font-size="28" fill="${L_FAINT}">Números ilustrativos. Você define cada taxa — o painel fecha a conta.</text>
  <line x1="96" y1="964" x2="984" y2="964" stroke="${L_HAIR}" stroke-width="2"/>
  ${lockup(96, 1036, 38, lockLight)}
  <text x="984" y="1036" text-anchor="end" font-family="Inter" font-weight="600" font-size="27" fill="${L_MUTED}">affiliacore.com.br</text>
</svg>`, 1080);

// ——— POST 10 — taxa por casa (DARK) ——————————————————————————————————————————
const houseRow = (y, letter, tint, name, cpa, rev) => `
  <circle cx="180" cy="${y}" r="30" fill="${tint}" fill-opacity="0.18" stroke="${tint}" stroke-width="2"/>
  <text x="180" y="${y + 12}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="30" fill="${tint}">${letter}</text>
  <text x="238" y="${y + 11}" font-family="Inter" font-weight="600" font-size="33" fill="#ffffff">${name}</text>
  <text x="700" y="${y + 11}" text-anchor="end" font-family="Inter" font-size="30" fill="${MUTED}">${cpa}</text>
  <text x="928" y="${y + 11}" text-anchor="end" font-family="Inter" font-size="30" fill="${MUTED}">${rev}</text>`;

render('post-10-porcasa.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgDark('p10')}<rect width="1080" height="1080" fill="url(#p10)"/>
  <text x="96" y="118" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_L}">UMA REDE, VÁRIAS CASAS</text>
  <text x="96" y="234" font-family="Bricolage Grotesque" font-weight="800" font-size="74" fill="#ffffff">Cada casa paga de</text>
  <text x="96" y="322" font-family="Bricolage Grotesque" font-weight="800" font-size="74" fill="#ffffff">um jeito. <tspan fill="${EMBER_L}">O painel</tspan></text>
  <text x="96" y="410" font-family="Bricolage Grotesque" font-weight="800" font-size="74" fill="${EMBER_L}">sabe disso.</text>

  <rect x="96" y="474" width="888" height="392" rx="28" fill="${PLUM}" stroke="${HAIR}" stroke-width="3"/>
  <text x="238" y="536" font-family="Inter" font-weight="600" font-size="22" letter-spacing="3" fill="${MUTED}">CASA</text>
  <text x="700" y="536" text-anchor="end" font-family="Inter" font-weight="600" font-size="22" letter-spacing="3" fill="${MUTED}">CPA</text>
  <text x="928" y="536" text-anchor="end" font-family="Inter" font-weight="600" font-size="22" letter-spacing="3" fill="${MUTED}">REV</text>
  <line x1="152" y1="566" x2="928" y2="566" stroke="${HAIR}" stroke-width="2"/>
  ${houseRow(620, '1', '#4ea1f5', 'Casa 01', 'R$ 600', '30%')}
  <line x1="152" y1="668" x2="928" y2="668" stroke="${HAIR}" stroke-width="2"/>
  ${houseRow(716, '2', '#3fc98a', 'Casa 02', 'R$ 450', '25%')}
  <line x1="152" y1="764" x2="928" y2="764" stroke="${HAIR}" stroke-width="2"/>
  ${houseRow(812, '3', '#f0a53c', 'Casa 03', 'R$ 700', '—')}

  <text x="96" y="922" font-family="Inter" font-size="28" fill="${MUTED}">Taxa por afiliado E por casa. Nomes ocultos — a sua operação é sua.</text>
  <line x1="96" y1="960" x2="984" y2="960" stroke="${HAIR}" stroke-width="2"/>
  ${lockup(96, 1026, 38, lockDark)}
  <text x="984" y="1026" text-anchor="end" font-family="Inter" font-weight="600" font-size="27" fill="${MUTED}">affiliacore.com.br</text>
</svg>`, 1080);

console.log('posts 8-10 em social-out/');
