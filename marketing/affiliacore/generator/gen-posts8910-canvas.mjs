// Posts 8–10 (série 3 "o painel por dentro") → programas de desenho canvas
// (texto em CURVAS via fontkit) p/ injetar no composer do MBS + PNG de
// validação (resvg, MESMOS paths). Layout = gen-posts8910.mjs.
// Novidades vs. gen-posts567-canvas: círculo com traço, path livre traçado
// (lemniscata) e texto centrado em X arbitrário.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import * as fontkit from 'fontkit';
import { Resvg } from '@resvg/resvg-js';

const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(HERE, 'out-serie3');
mkdirSync(OUT, { recursive: true });
const F = (n) => fontkit.create(readFileSync(join(HERE, '..', 'fonts', `${n}.woff2`)));
const b800 = F('bricolage-grotesque-800'), b500 = F('bricolage-grotesque-500');
const i400 = F('inter-400'), i600 = F('inter-600');

const EMBER = '#e11d48', EMBER_L = '#e45b79', INK = '#11070a';
const MUTED = '#af9da2', HAIR = '#34262a';
const L_INK = '#1c1014', L_MUTED = '#6e5a60', L_FAINT = '#9a878d';
const L_HAIR = '#e8dce0', EMBER_D = '#be123c', L_PINK = '#fbe4ea';
const PLUM = '#1b0f14', INFINITY = '#8332B9';
// Alfas do kit pré-compostos sobre o PLUM (canvas e svg recebem cor sólida —
// o resultado é idêntico e dispensa globalAlpha no programa de desenho).
const GLASS_04 = '#241a1d';   // white 4% sobre PLUM (barra de título)
const GLASS_06 = '#291d22';   // white 6% sobre PLUM (pill de url, chips)
const TINT_INF = '#2c152e';   // INFINITY 16% sobre PLUM
const TINT_A = '#24293d', TINT_B = '#213129', TINT_C = '#412a1b'; // casas 18%
const EMBER_45 = '#f08aa1';   // EMBER 45% sobre L_PINK (borda do box de margem)

function shape(font, text, size, x, base, track = 0) {
  const s = size / font.unitsPerEm;
  const run = font.layout(text);
  let cx = x;
  const glyphDs = [];
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i];
    const gx = cx + pos.xOffset * s, gy = base - pos.yOffset * s;
    const parts = [];
    for (const cmd of g.path.commands) {
      const a = cmd.args;
      const X = (j) => (gx + a[j] * s).toFixed(1);
      const Y = (j) => (gy - a[j] * s).toFixed(1);
      if (cmd.command === 'moveTo') parts.push(`M${X(0)} ${Y(1)}`);
      else if (cmd.command === 'lineTo') parts.push(`L${X(0)} ${Y(1)}`);
      else if (cmd.command === 'quadraticCurveTo') parts.push(`Q${X(0)} ${Y(1)} ${X(2)} ${Y(3)}`);
      else if (cmd.command === 'bezierCurveTo') parts.push(`C${X(0)} ${Y(1)} ${X(2)} ${Y(3)} ${X(4)} ${Y(5)}`);
      else if (cmd.command === 'closePath') parts.push('Z');
    }
    if (parts.length) glyphDs.push(parts.join(''));
    cx += pos.xAdvance * s + (i < run.glyphs.length - 1 ? track * size : 0);
  });
  return { d: glyphDs.join(''), glyphDs, end: cx };
}
const width = (font, text, size, track = 0) => {
  const run = font.layout(text);
  const s = size / font.unitsPerEm;
  return run.positions.reduce((sum, p) => sum + p.xAdvance * s, 0) + track * size * (run.glyphs.length - 1);
};
const right = (font, text, size, endX, base, track = 0) =>
  shape(font, text, size, endX - width(font, text, size, track), base, track);
const centerAt = (font, text, size, cx, base, track = 0) =>
  shape(font, text, size, cx - width(font, text, size, track) / 2, base, track);

const glyph = (cx, cy, r) => ({ cx, cy, rm: r - r * 0.164, sw: r * 2 * 0.164, dot: r * 2 * 0.157 });
const arcSvg = ({ cx, cy, rm, sw, dot }, ring, dc) => {
  const cos = Math.cos((40 * Math.PI) / 180), sin = Math.sin((40 * Math.PI) / 180);
  return `<path d="M ${(cx + rm * cos).toFixed(1)} ${(cy - rm * sin).toFixed(1)} A ${rm.toFixed(1)} ${rm.toFixed(1)} 0 1 0 ${(cx + rm * cos).toFixed(1)} ${(cy + rm * sin).toFixed(1)}" fill="none" stroke="${ring}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${dot.toFixed(1)}" fill="${dc}"/>`;
};
const arcJs = (g, ring, dc) =>
  `A(${g.cx.toFixed(1)},${g.cy.toFixed(1)},${g.rm.toFixed(1)},${g.sw.toFixed(1)},${g.dot.toFixed(1)},'${ring}','${dc}');`;

function lockup(x, base, size, light = false) {
  const TR = -0.02;
  const wA = width(b800, 'Affilia', size, TR);
  const affilia = shape(b800, 'Affilia', size, x, base, TR);
  const R = size * 0.36, GX = x + wA + size * 0.09 + R, GY = base - size * 0.34;
  const ore = shape(b500, 'ore', size, GX + R - size * 0.04, base, TR);
  return {
    affilia, ore, g: glyph(GX, GY, R),
    colors: light
      ? { affilia: L_INK, ore: EMBER_D, ring: EMBER, dot: L_INK }
      : { affilia: '#ffffff', ore: EMBER_L, ring: EMBER_L, dot: '#ffffff' },
  };
}

const BG = {
  dark: {
    js: `const g=x.createRadialGradient(777.6,-162,0,777.6,-162,1620);
g.addColorStop(0,'#6c0e23');g.addColorStop(.34,'#4a0a18');g.addColorStop(.75,'${INK}');
x.fillStyle=g;x.fillRect(0,0,1080,1080);`,
    svg: `<defs><radialGradient id="g" cx="0.72" cy="-0.15" r="1.5">
<stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="${INK}"/>
</radialGradient></defs><rect width="1080" height="1080" fill="url(#g)"/>`,
  },
  light: {
    js: `const g=x.createLinearGradient(0,0,0,1080);
g.addColorStop(0,'#ffffff');g.addColorStop(.55,'#faf2f4');g.addColorStop(1,'#f7edf0');
x.fillStyle=g;x.fillRect(0,0,1080,1080);
const rg=x.createRadialGradient(842.4,-108,0,842.4,-108,1080);
rg.addColorStop(0,'rgba(247,215,222,1)');rg.addColorStop(.6,'rgba(247,215,222,0)');
x.fillStyle=rg;x.fillRect(0,0,1080,1080);`,
    svg: `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#faf2f4"/><stop offset="1" stop-color="#f7edf0"/>
</linearGradient><radialGradient id="gg" cx="0.78" cy="-0.1" r="1.0">
<stop offset="0" stop-color="#f7d7de"/><stop offset="0.6" stop-color="#f7d7de" stop-opacity="0"/>
</radialGradient></defs><rect width="1080" height="1080" fill="url(#g)"/><rect width="1080" height="1080" fill="url(#gg)"/>`,
  },
};

function emit(name, bg, geomJs, geomSvg, fills, fileName) {
  const seg1 = `
const c=document.createElement('canvas');c.width=1080;c.height=1080;
const x=c.getContext('2d');
${BG[bg].js}
const A=(cx,cy,rm,sw,dot,ring,dc)=>{x.strokeStyle=ring;x.lineWidth=sw;x.lineCap='round';
x.beginPath();x.arc(cx,cy,rm,40*Math.PI/180,320*Math.PI/180);x.stroke();
x.fillStyle=dc;x.beginPath();x.arc(cx,cy,dot,0,7);x.fill();};
${geomJs}
window.__pc=c;window.__px=x;
JSON.stringify({seg:1,ok:!!window.__px});`.trim();

  const payload = JSON.stringify(fills.map((f) => ({ c: f.color, d: f.d })));
  const b64 = deflateSync(Buffer.from(payload, 'utf8')).toString('base64');
  const CH = 9300;
  const zChunks = [];
  for (let i = 0; i < b64.length; i += CH) zChunks.push(b64.slice(i, i + CH));
  const segs = [seg1];
  zChunks.forEach((ch, i) => segs.push(
    `window.__z=${i === 0 ? "''" : 'window.__z'}+'${ch}';JSON.stringify({z:${i + 1},len:window.__z.length});`
  ));
  // SEM new Response(): o MBS instrumenta fetch/Response ("Failed to fetch").
  segs.push(`
const bin=Uint8Array.from(atob(window.__z),ch=>ch.charCodeAt(0));
const ds=new DecompressionStream('deflate');
const w=ds.writable.getWriter();w.write(bin);w.close();
const rd=ds.readable.getReader();const parts=[];let tot=0;
for(;;){const{done,value}=await rd.read();if(done)break;parts.push(value);tot+=value.length;}
const buf=new Uint8Array(tot);let off=0;for(const p of parts){buf.set(p,off);off+=p.length;}
const fills=JSON.parse(new TextDecoder().decode(buf));const x=window.__px;
for(const f of fills){x.fillStyle=f.c;x.fill(new Path2D(f.d));}
delete window.__z;
JSON.stringify({drawn:fills.length});`.trim());
  segs.push(`
const c=window.__pc;
const blob=await new Promise(r=>c.toBlob(r,'image/png'));
const file=new File([blob],'${fileName}',{type:'image/png'});
const dt=new DataTransfer();dt.items.add(file);
const input=window.__capturedInput||[...document.querySelectorAll('input[type=file]')].find(i=>(i.accept||'').includes('image'));
input.files=dt.files;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
JSON.stringify({blob:blob.size,accept:input&&input.accept});`.trim());
  writeFileSync(join(OUT, `${name}-z.txt`), b64);
  segs.forEach((s, i) => writeFileSync(join(OUT, `${name}-seg${i + 1}.js`), s));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
${BG[bg].svg}
${geomSvg}
${fills.map((f) => `<path d="${f.d}" fill="${f.color}"/>`).join('\n')}
</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } }).render().asPng();
  writeFileSync(join(OUT, `${name}-check.png`), png);
  console.log(`${name}: ${segs.length} segs (${segs.map((s) => (s.length / 1024).toFixed(1)).join('/')} KB) + check.png`);
}

// helpers de geometria (canvas + svg em par)
const rrJs = (x0, y0, w, h, r, fill, stroke, sw) => {
  let s = `x.beginPath();x.roundRect(${x0},${y0},${w},${h},${r});`;
  if (fill) s = `x.fillStyle='${fill}';` + s + `x.fill();`;
  if (stroke) s += `x.strokeStyle='${stroke}';x.lineWidth=${sw};x.beginPath();x.roundRect(${x0},${y0},${w},${h},${r});x.stroke();`;
  return s;
};
const rrSvg = (x0, y0, w, h, r, fill, stroke, sw) =>
  `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="${fill || 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
const rectJs = (x0, y0, w, h, fill) => `x.fillStyle='${fill}';x.fillRect(${x0},${y0},${w},${h});`;
const rectSvg = (x0, y0, w, h, fill) => `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${fill}"/>`;
const lineJs = (x1, y1, x2, y2, color, w, cap = 'butt') =>
  `x.strokeStyle='${color}';x.lineWidth=${w};x.lineCap='${cap}';x.beginPath();x.moveTo(${x1},${y1});x.lineTo(${x2},${y2});x.stroke();`;
const lineSvg = (x1, y1, x2, y2, color, w, cap = 'butt') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}"${cap !== 'butt' ? ` stroke-linecap="${cap}"` : ''}/>`;
const dotJs = (cx, cy, r, fill) => `x.fillStyle='${fill}';x.beginPath();x.arc(${cx},${cy},${r},0,7);x.fill();`;
const dotSvg = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const ringJs = (cx, cy, r, fill, stroke, sw) =>
  `x.fillStyle='${fill}';x.beginPath();x.arc(${cx},${cy},${r},0,7);x.fill();x.strokeStyle='${stroke}';x.lineWidth=${sw};x.beginPath();x.arc(${cx},${cy},${r},0,7);x.stroke();`;
const ringSvg = (cx, cy, r, fill, stroke, sw) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const strokePathJs = (d, color, w) =>
  `x.strokeStyle='${color}';x.lineWidth=${w};x.lineJoin='round';x.lineCap='butt';x.stroke(new Path2D('${d}'));`;
const strokePathSvg = (d, color, w) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round"/>`;

const INF_D = 'M 176 566 C 166 552 146 552 146 566 C 146 580 166 580 176 566 C 186 552 206 552 206 566 C 206 580 186 580 176 566 Z';

// ═══ POST 8 — nova agência no ar (DARK) ═══
{
  const lk = lockup(96, 990, 40, false);
  const chipG = (x0) => [
    rrJs(x0, 690, 236, 62, 31, GLASS_06, HAIR, 2),
    rrSvg(x0, 690, 236, 62, 31, GLASS_06, HAIR, 2),
  ];
  const c1 = chipG(152), c2 = chipG(422), c3 = chipG(692);
  const geomJs = [
    rrJs(96, 392, 888, 392, 28, PLUM, HAIR, 3),
    rrJs(96, 392, 888, 76, 28, GLASS_04),
    rectJs(96, 440, 888, 28, PLUM),
    dotJs(140, 430, 9, HAIR), dotJs(170, 430, 9, HAIR), dotJs(200, 430, 9, HAIR),
    rrJs(248, 410, 480, 40, 20, GLASS_06),
    ringJs(176, 566, 44, TINT_INF, INFINITY, 3),
    strokePathJs(INF_D, INFINITY, 6),
    lineJs(152, 650, 928, 650, HAIR, 2),
    c1[0], c2[0], c3[0],
    lineJs(96, 908, 984, 908, HAIR, 2),
    arcJs(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const geomSvg = [
    rrSvg(96, 392, 888, 392, 28, PLUM, HAIR, 3),
    rrSvg(96, 392, 888, 76, 28, GLASS_04),
    rectSvg(96, 440, 888, 28, PLUM),
    dotSvg(140, 430, 9, HAIR), dotSvg(170, 430, 9, HAIR), dotSvg(200, 430, 9, HAIR),
    rrSvg(248, 410, 480, 40, 20, GLASS_06),
    ringSvg(176, 566, 44, TINT_INF, INFINITY, 3),
    strokePathSvg(INF_D, INFINITY, 6),
    lineSvg(152, 650, 928, 650, HAIR, 2),
    c1[1], c2[1], c3[1],
    lineSvg(96, 908, 984, 908, HAIR, 2),
    arcSvg(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const fills = [
    { color: EMBER_L, ...shape(i600, 'NOVA AGÊNCIA NO AR', 26, 96, 118, 6 / 26) },
    { color: '#ffffff', ...shape(b800, 'A plataforma é nossa.', 76, 96, 234) },
    { color: EMBER_L, ...shape(b800, 'A marca é deles.', 76, 96, 326) },
    { color: MUTED, ...shape(i400, 'infinityaffiliates.agency', 24, 278, 438) },
    { color: '#ffffff', ...shape(b800, 'INFINITY', 46, 248, 556, 2 / 46) },
    { color: MUTED, ...shape(i400, 'Painel de afiliados da agência', 27, 250, 600) },
    { color: MUTED, ...centerAt(i400, 'Domínio próprio', 26, 270, 730) },
    { color: MUTED, ...centerAt(i400, 'Cores e logo', 26, 540, 730) },
    { color: MUTED, ...centerAt(i400, 'Dados isolados', 26, 810, 730) },
    { color: MUTED, ...shape(i400, 'Instância própria, no ar em dias — não é subconta de ninguém.', 29, 96, 848) },
    { color: lk.colors.affilia, ...lk.affilia },
    { color: lk.colors.ore, ...lk.ore },
    { color: MUTED, ...right(i600, 'affiliacore.com.br', 28, 984, 990) },
  ];
  emit('post8', 'dark', geomJs, geomSvg, fills, 'post-8-infinity.png');
}

// ═══ POST 9 — rede em níveis (LIGHT) ═══
{
  const lk = lockup(96, 1036, 38, true);
  const geomJs = [
    rrJs(96, 392, 888, 470, 28, '#ffffff', L_HAIR, 3),
    lineJs(152, 484, 928, 484, L_HAIR, 2),
    lineJs(176, 524, 176, 700, L_HAIR, 3),
    dotJs(176, 536, 11, EMBER),
    dotJs(176, 656, 11, '#c98aa0'),
    rrJs(152, 726, 776, 98, 18, L_PINK, EMBER_45, 2),
    lineJs(96, 964, 984, 964, L_HAIR, 2),
    arcJs(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const geomSvg = [
    rrSvg(96, 392, 888, 470, 28, '#ffffff', L_HAIR, 3),
    lineSvg(152, 484, 928, 484, L_HAIR, 2),
    lineSvg(176, 524, 176, 700, L_HAIR, 3),
    dotSvg(176, 536, 11, EMBER),
    dotSvg(176, 656, 11, '#c98aa0'),
    rrSvg(152, 726, 776, 98, 18, L_PINK, EMBER_45, 2),
    lineSvg(96, 964, 984, 964, L_HAIR, 2),
    arcSvg(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const fills = [
    { color: EMBER_D, ...shape(i600, 'NOVO NO PAINEL', 26, 96, 118, 6 / 26) },
    { color: L_INK, ...shape(b800, 'Sua rede tem níveis.', 78, 96, 234) },
    { color: EMBER_D, ...shape(b800, 'A comissão também.', 78, 96, 326) },
    { color: L_FAINT, ...shape(i600, 'UM FTD DE R$ 600 PAGO PELA CASA', 23, 152, 452, 3 / 23) },
    { color: L_INK, ...shape(i600, 'Afiliado que indicou', 33, 216, 544) },
    { color: L_FAINT, ...shape(i400, 'o repasse que você configurou pra ele', 26, 216, 586) },
    { color: L_INK, ...right(b800, 'R$ 300', 40, 924, 554) },
    { color: L_INK, ...shape(i600, 'Líder da equipe dele', 33, 216, 664) },
    { color: L_FAINT, ...shape(i400, 'lucro sobre equipe — override de upline', 26, 216, 706) },
    { color: L_INK, ...right(b800, 'R$ 100', 40, 924, 674) },
    { color: EMBER_D, ...shape(i600, 'FICA COM A AGÊNCIA', 23, 188, 770, 3 / 23) },
    { color: L_MUTED, ...shape(i400, 'calculado em cascata, N níveis', 24, 188, 806) },
    { color: L_INK, ...right(b800, 'R$ 200', 52, 892, 798) },
    { color: L_FAINT, ...shape(i400, 'Números ilustrativos. Você define cada taxa — o painel fecha a conta.', 28, 96, 924) },
    { color: lk.colors.affilia, ...lk.affilia },
    { color: lk.colors.ore, ...lk.ore },
    { color: L_MUTED, ...right(i600, 'affiliacore.com.br', 27, 984, 1036) },
  ];
  emit('post9', 'light', geomJs, geomSvg, fills, 'post-9-rede.png');
}

// ═══ POST 10 — taxa por casa (DARK) ═══
{
  const lk = lockup(96, 1026, 38, false);
  const rows = [
    { y: 620, n: '1', tint: '#4ea1f5', bg: TINT_A, name: 'Casa 01', cpa: 'R$ 600', rev: '30%' },
    { y: 716, n: '2', tint: '#3fc98a', bg: TINT_B, name: 'Casa 02', cpa: 'R$ 450', rev: '25%' },
    { y: 812, n: '3', tint: '#f0a53c', bg: TINT_C, name: 'Casa 03', cpa: 'R$ 700', rev: '—' },
  ];
  const geomJs = [
    rrJs(96, 474, 888, 392, 28, PLUM, HAIR, 3),
    lineJs(152, 566, 928, 566, HAIR, 2),
    lineJs(152, 668, 928, 668, HAIR, 2),
    lineJs(152, 764, 928, 764, HAIR, 2),
    ...rows.map((r) => ringJs(180, r.y, 30, r.bg, r.tint, 2)),
    lineJs(96, 960, 984, 960, HAIR, 2),
    arcJs(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const geomSvg = [
    rrSvg(96, 474, 888, 392, 28, PLUM, HAIR, 3),
    lineSvg(152, 566, 928, 566, HAIR, 2),
    lineSvg(152, 668, 928, 668, HAIR, 2),
    lineSvg(152, 764, 928, 764, HAIR, 2),
    ...rows.map((r) => ringSvg(180, r.y, 30, r.bg, r.tint, 2)),
    lineSvg(96, 960, 984, 960, HAIR, 2),
    arcSvg(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const wJeito = width(b800, 'um jeito. ', 74);
  const fills = [
    { color: EMBER_L, ...shape(i600, 'UMA REDE, VÁRIAS CASAS', 26, 96, 118, 6 / 26) },
    { color: '#ffffff', ...shape(b800, 'Cada casa paga de', 74, 96, 234) },
    { color: '#ffffff', ...shape(b800, 'um jeito. ', 74, 96, 322) },
    { color: EMBER_L, ...shape(b800, 'O painel', 74, 96 + wJeito, 322) },
    { color: EMBER_L, ...shape(b800, 'sabe disso.', 74, 96, 410) },
    { color: MUTED, ...shape(i600, 'CASA', 22, 238, 536, 3 / 22) },
    { color: MUTED, ...right(i600, 'CPA', 22, 700, 536, 3 / 22) },
    { color: MUTED, ...right(i600, 'REV', 22, 928, 536, 3 / 22) },
    ...rows.flatMap((r) => [
      { color: r.tint, ...centerAt(b800, r.n, 30, 180, r.y + 12) },
      { color: '#ffffff', ...shape(i600, r.name, 33, 238, r.y + 11) },
      { color: MUTED, ...right(i400, r.cpa, 30, 700, r.y + 11) },
      { color: MUTED, ...right(i400, r.rev, 30, 928, r.y + 11) },
    ]),
    { color: MUTED, ...shape(i400, 'Taxa por afiliado E por casa. Nomes ocultos — a sua operação é sua.', 28, 96, 922) },
    { color: lk.colors.affilia, ...lk.affilia },
    { color: lk.colors.ore, ...lk.ore },
    { color: MUTED, ...right(i600, 'affiliacore.com.br', 27, 984, 1026) },
  ];
  emit('post10', 'dark', geomJs, geomSvg, fills, 'post-10-porcasa.png');
}

console.log('pronto: out-serie3/');
