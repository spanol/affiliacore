// Criativo do anúncio "prorrogado" (angulo B — honestidade radical, 01/08/2026).
// Sobe pelo Ads Manager com UPLOAD (não vira post do feed), então emite o PNG do
// kit E os segs em curvas p/ injeção via canvas — o CSP bloqueia ler arquivo local
// em qualquer composer da Meta.
// Fonte única do layout: os paths daqui geram tanto o check.png quanto os segs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import * as fontkit from 'fontkit';
import { Resvg } from '@resvg/resvg-js';

const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(HERE, 'out-ad-prorrogado');
mkdirSync(OUT, { recursive: true });
const F = (n) => fontkit.create(readFileSync(join(HERE, '..', 'fonts', `${n}.woff2`)));
const b800 = F('bricolage-grotesque-800'), b500 = F('bricolage-grotesque-500');
const i400 = F('inter-400'), i600 = F('inter-600');

const EMBER = '#e11d48', EMBER_L = '#e45b79', INK = '#11070a';
const MUTED = '#af9da2', HAIR = '#34262a', PLUM = '#1b0f14';

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

const glyph = (cx, cy, r) => ({ cx, cy, rm: r - r * 0.164, sw: r * 2 * 0.164, dot: r * 2 * 0.157 });
const arcSvg = ({ cx, cy, rm, sw, dot }, ring, dc) => {
  const cos = Math.cos((40 * Math.PI) / 180), sin = Math.sin((40 * Math.PI) / 180);
  return `<path d="M ${(cx + rm * cos).toFixed(1)} ${(cy - rm * sin).toFixed(1)} A ${rm.toFixed(1)} ${rm.toFixed(1)} 0 1 0 ${(cx + rm * cos).toFixed(1)} ${(cy + rm * sin).toFixed(1)}" fill="none" stroke="${ring}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${dot.toFixed(1)}" fill="${dc}"/>`;
};
const arcJs = (g, ring, dc) =>
  `A(${g.cx.toFixed(1)},${g.cy.toFixed(1)},${g.rm.toFixed(1)},${g.sw.toFixed(1)},${g.dot.toFixed(1)},'${ring}','${dc}');`;

function lockup(x, base, size) {
  const TR = -0.02;
  const wA = width(b800, 'Affilia', size, TR);
  const affilia = shape(b800, 'Affilia', size, x, base, TR);
  const R = size * 0.36, GX = x + wA + size * 0.09 + R, GY = base - size * 0.34;
  const ore = shape(b500, 'ore', size, GX + R - size * 0.04, base, TR);
  return { affilia, ore, g: glyph(GX, GY, R), colors: { affilia: '#ffffff', ore: EMBER_L, ring: EMBER_L, dot: '#ffffff' } };
}

const rrJs = (x0, y0, w, h, r, fill, stroke, sw) => {
  let s = `x.beginPath();x.roundRect(${x0},${y0},${w},${h},${r});`;
  if (fill) s = `x.fillStyle='${fill}';` + s + `x.fill();`;
  if (stroke) s += `x.strokeStyle='${stroke}';x.lineWidth=${sw};x.beginPath();x.roundRect(${x0},${y0},${w},${h},${r});x.stroke();`;
  return s;
};
const rrSvg = (x0, y0, w, h, r, fill, stroke, sw) =>
  `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="${fill || 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
const lineJs = (x1, y1, x2, y2, color, w) =>
  `x.strokeStyle='${color}';x.lineWidth=${w};x.lineCap='butt';x.beginPath();x.moveTo(${x1},${y1});x.lineTo(${x2},${y2});x.stroke();`;
const lineSvg = (x1, y1, x2, y2, color, w) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}"/>`;

// ——— layout ———
const lk = lockup(96, 986, 38);
const wOld = width(i400, 'R$ 67', 36);
const geomJs = [
  rrJs(96, 576, 888, 216, 28, PLUM, HAIR, 3),
  lineJs(928 - wOld, 651, 928, 651, MUTED, 2),          // risco no preço antigo
  lineJs(96, 904, 984, 904, HAIR, 2),
  arcJs(lk.g, lk.colors.ring, lk.colors.dot),
].join('\n');
const geomSvg = [
  rrSvg(96, 576, 888, 216, 28, PLUM, HAIR, 3),
  lineSvg(928 - wOld, 651, 928, 651, MUTED, 2),
  lineSvg(96, 904, 984, 904, HAIR, 2),
  arcSvg(lk.g, lk.colors.ring, lk.colors.dot),
].join('\n');

const fills = [
  { color: EMBER_L, ...shape(i600, 'GUIA AFFILIACORE · PRORROGADO', 26, 96, 118, 6 / 26) },
  { color: '#ffffff', ...shape(b800, 'Primeira semana:', 76, 96, 244) },
  { color: EMBER_L, ...shape(b800, 'zero venda.', 76, 96, 340) },
  { color: MUTED, ...shape(i400, 'Em vez de inventar "últimas vagas" ou print de', 30, 96, 434) },
  { color: MUTED, ...shape(i400, 'faturamento, digo o que houve: ninguém comprou', 30, 96, 480) },
  { color: MUTED, ...shape(i400, 'ainda. Estendi o preço de lançamento por 3 dias.', 30, 96, 526) },
  { color: MUTED, ...shape(i600, 'GUIA COMPLETO · EDIÇÃO 2026', 24, 152, 646, 3 / 24) },
  { color: MUTED, ...shape(i400, '~60 páginas · 7 dias de garantia', 26, 152, 700) },
  { color: MUTED, ...right(i400, 'R$ 67', 36, 928, 660) },
  { color: '#ffffff', ...right(b800, 'R$ 47', 64, 928, 744) },
  { color: '#ffffff', ...shape(i600, 'Até domingo, 03/08. Depois volta a R$ 67.', 30, 96, 852) },
  { color: lk.colors.affilia, ...lk.affilia },
  { color: lk.colors.ore, ...lk.ore },
  { color: MUTED, ...right(i600, 'affiliacore.com.br/ebook', 27, 984, 986) },
];

// ——— emissão: check.png (kit) + segs (injeção no Ads Manager) ———
const BG_JS = `const g=x.createRadialGradient(777.6,-162,0,777.6,-162,1620);
g.addColorStop(0,'#6c0e23');g.addColorStop(.34,'#4a0a18');g.addColorStop(.75,'${INK}');
x.fillStyle=g;x.fillRect(0,0,1080,1080);`;
const BG_SVG = `<defs><radialGradient id="g" cx="0.72" cy="-0.15" r="1.5">
<stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="${INK}"/>
</radialGradient></defs><rect width="1080" height="1080" fill="url(#g)"/>`;

const seg1 = `
const c=document.createElement('canvas');c.width=1080;c.height=1080;
const x=c.getContext('2d');
${BG_JS}
const A=(cx,cy,rm,sw,dot,ring,dc)=>{x.strokeStyle=ring;x.lineWidth=sw;x.lineCap='round';
x.beginPath();x.arc(cx,cy,rm,40*Math.PI/180,320*Math.PI/180);x.stroke();
x.fillStyle=dc;x.beginPath();x.arc(cx,cy,dot,0,7);x.fill();};
${geomJs}
window.__pc=c;window.__px=x;
JSON.stringify({seg:1,ok:!!window.__px});`.trim();

const payload = JSON.stringify(fills.map((f) => ({ c: f.color, d: f.d })));
const b64 = deflateSync(Buffer.from(payload, 'utf8')).toString('base64');
const segs = [seg1];
for (let i = 0; i < b64.length; i += 9300) {
  const ch = b64.slice(i, i + 9300);
  segs.push(`window.__z=${i === 0 ? "''" : 'window.__z'}+'${ch}';JSON.stringify({z:${segs.length},len:window.__z.length});`);
}
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
const file=new File([blob],'ad-prorrogado.png',{type:'image/png'});
const dt=new DataTransfer();dt.items.add(file);
const input=window.__capturedInput||[...document.querySelectorAll('input[type=file]')].find(i=>(i.accept||'').includes('image'));
input.files=dt.files;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
JSON.stringify({blob:blob.size,accept:input&&input.accept});`.trim());

writeFileSync(join(OUT, 'ad-z.txt'), b64);
segs.forEach((s, i) => writeFileSync(join(OUT, `ad-seg${i + 1}.js`), s));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
${BG_SVG}
${geomSvg}
${fills.map((f) => `<path d="${f.d}" fill="${f.color}"/>`).join('\n')}
</svg>`;
writeFileSync(join(OUT, 'ad-prorrogado.png'), new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } }).render().asPng());
console.log(`ad-prorrogado: ${segs.length} segs (${segs.map((s) => (s.length / 1024).toFixed(1)).join('/')} KB) + PNG`);
