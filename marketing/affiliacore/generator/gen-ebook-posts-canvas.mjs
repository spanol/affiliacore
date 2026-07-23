// Série do guia (E1–E4) → programas de desenho canvas (texto em CURVAS via
// fontkit) p/ injeção CSP-proof no composer de posts do MBS + check.png
// (resvg, MESMOS paths) que TEM que bater com midias/posts/*.png (aprovados).
// Layout = gen-ebook-posts.mjs (centrado, moldura, BG ember dark/light).
// Deps: npm i --no-save @resvg/resvg-js fontkit wawoff2
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import * as fontkit from 'fontkit';
import wawoff2 from 'wawoff2';
import { Resvg } from '@resvg/resvg-js';

const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(HERE, 'out-ebook');
const TTF = join(HERE, '..', 'fonts-ttf');
mkdirSync(OUT, { recursive: true });

// fontkit lê o woff2 já descomprimido (ttf) — reaproveita fonts-ttf
async function ttf(n) {
  const dest = join(TTF, `${n}.ttf`);
  writeFileSync(dest, await wawoff2.decompress(readFileSync(join(HERE, '..', 'fonts', `${n}.woff2`))));
  return fontkit.create(readFileSync(dest));
}
const b800 = await ttf('bricolage-grotesque-800'), b500 = await ttf('bricolage-grotesque-500');
const i400 = await ttf('inter-400'), i600 = await ttf('inter-600');

const fontFiles = ['bricolage-grotesque-800', 'bricolage-grotesque-500', 'inter-400', 'inter-600']
  .map((n) => join(TTF, `${n}.ttf`));

function shape(font, text, size, x, base, track = 0) {
  const s = size / font.unitsPerEm;
  const run = font.layout(text);
  let cx = x; const glyphDs = [];
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
  return { d: glyphDs.join('') };
}
const width = (font, text, size, track = 0) => {
  const run = font.layout(text);
  const s = size / font.unitsPerEm;
  return run.positions.reduce((sum, p) => sum + p.xAdvance * s, 0) + track * size * (run.glyphs.length - 1);
};
const center = (font, text, size, base, track = 0) =>
  shape(font, text, size, 540 - width(font, text, size, track) / 2, base, track);

const glyph = (cx, cy, r) => ({ cx, cy, rm: r - r * 0.164, sw: r * 2 * 0.164, dot: r * 2 * 0.157 });
const arcSvg = ({ cx, cy, rm, sw, dot }, ring, dc) => {
  const cos = Math.cos((40 * Math.PI) / 180), sin = Math.sin((40 * Math.PI) / 180);
  return `<path d="M ${(cx + rm * cos).toFixed(1)} ${(cy - rm * sin).toFixed(1)} A ${rm.toFixed(1)} ${rm.toFixed(1)} 0 1 0 ${(cx + rm * cos).toFixed(1)} ${(cy + rm * sin).toFixed(1)}" fill="none" stroke="${ring}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${dot.toFixed(1)}" fill="${dc}"/>`;
};
const arcJs = (g, ring, dc) =>
  `A(${g.cx.toFixed(1)},${g.cy.toFixed(1)},${g.rm.toFixed(1)},${g.sw.toFixed(1)},${g.dot.toFixed(1)},'${ring}','${dc}');`;

// lockup CENTRADO em x=540 (base, size) — devolve shapes + glifo
function lockupC(base, size, colors) {
  const TR = -0.02;
  const wA = width(b800, 'Affilia', size, TR), R = size * 0.36, wOre = width(b500, 'ore', size, TR);
  const totalW = wA + size * 0.09 + 2 * R - size * 0.04 + wOre;
  const x = 540 - totalW / 2;
  const affilia = shape(b800, 'Affilia', size, x, base, TR);
  const GX = x + wA + size * 0.09 + R, GY = base - size * 0.34;
  const ore = shape(b500, 'ore', size, GX + R - size * 0.04, base, TR);
  return { affilia, ore, g: glyph(GX, GY, R), colors };
}

const BG = {
  dark: {
    js: `const g=x.createRadialGradient(777.6,-162,0,777.6,-162,1620);
g.addColorStop(0,'#6c0e23');g.addColorStop(.34,'#4a0a18');g.addColorStop(.75,'#11070a');
x.fillStyle=g;x.fillRect(0,0,1080,1080);`,
    svg: `<defs><radialGradient id="g" cx="0.72" cy="-0.15" r="1.5">
<stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="#11070a"/>
</radialGradient></defs><rect width="1080" height="1080" fill="url(#g)"/>`,
  },
  light: {
    js: `const g=x.createRadialGradient(777.6,-129.6,0,777.6,-129.6,1620);
g.addColorStop(0,'#fdeef2');g.addColorStop(.4,'#fcf5f7');g.addColorStop(.85,'#fbf7f8');
x.fillStyle=g;x.fillRect(0,0,1080,1080);`,
    svg: `<defs><radialGradient id="g" cx="0.72" cy="-0.12" r="1.5">
<stop offset="0" stop-color="#fdeef2"/><stop offset="0.4" stop-color="#fcf5f7"/><stop offset="0.85" stop-color="#fbf7f8"/>
</radialGradient></defs><rect width="1080" height="1080" fill="url(#g)"/>`,
  },
};

const rrJs = (x0, y0, w, h, r, fill, stroke, sw) => {
  let s = '';
  if (fill) s += `x.fillStyle='${fill}';x.beginPath();x.roundRect(${x0},${y0},${w},${h},${r});x.fill();`;
  if (stroke) s += `x.strokeStyle='${stroke}';x.lineWidth=${sw};x.beginPath();x.roundRect(${x0},${y0},${w},${h},${r});x.stroke();`;
  return s;
};
const rrSvg = (x0, y0, w, h, r, fill, stroke, sw) =>
  `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="${fill || 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
const lineJs = (x1, y1, x2, y2, color, w) =>
  `x.strokeStyle='${color}';x.lineWidth=${w};x.lineCap='butt';x.beginPath();x.moveTo(${x1},${y1});x.lineTo(${x2},${y2});x.stroke();`;
const lineSvg = (x1, y1, x2, y2, color, w) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}"/>`;

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
  writeFileSync(join(OUT, `${name}-check.png`),
    new Resvg(svg, { fitTo: { mode: 'width', value: 1080 },
      font: { fontFiles, loadSystemFonts: false } }).render().asPng());
  console.log(`${name}: ${segs.length} segs (${segs.map((s) => (s.length / 1024).toFixed(1)).join('/')} KB) + check.png`);
}

const TH = {
  dark:  { ink: '#ffffff', accent: '#e45b79', muted: '#af9da2', hair: '#34262a', rule: '#e11d48',
           logo: { affilia: '#ffffff', ore: '#e45b79', ring: '#e45b79', dot: '#ffffff' } },
  light: { ink: '#1c1014', accent: '#be123c', muted: '#6e5a60', hair: '#e7dfe2', rule: '#e11d48',
           logo: { affilia: '#1c1014', ore: '#be123c', ring: '#be123c', dot: '#be123c' } },
};

function post(cfg) {
  const C = TH[cfg.theme];
  const lk = lockupC(972, 46, C.logo);
  const geomJs = [
    rrJs(60, 60, 960, 960, 34, null, C.hair, 2),
    lineJs(470, cfg.rule, 610, cfg.rule, C.rule, 5),
    arcJs(lk.g, C.logo.ring, C.logo.dot),
  ].join('\n');
  const geomSvg = [
    rrSvg(60, 60, 960, 960, 34, null, C.hair, 2),
    lineSvg(470, cfg.rule, 610, cfg.rule, C.rule, 5),
    arcSvg(lk.g, C.logo.ring, C.logo.dot),
  ].join('\n');
  const fills = [
    { color: C.accent, ...center(i600, cfg.eyebrow, 26, 192, 7 / 26) },
    ...cfg.hl.map((ln, i) => ({ color: ln.a ? C.accent : C.ink, ...center(b800, ln.t, cfg.hlFs, cfg.hlY + i * cfg.hlLh) })),
    ...cfg.sub.map((ln, i) => ({ color: C.muted, ...center(i400, ln.t, cfg.subFs, cfg.subY + i * cfg.subLh) })),
    { color: C.accent, ...center(i600, cfg.cta, 30, 892) },
    { color: C.logo.affilia, ...lk.affilia },
    { color: C.logo.ore, ...lk.ore },
  ];
  emit(cfg.name, cfg.theme, geomJs, geomSvg, fills, cfg.file);
}

post({ name: 'e1', theme: 'dark', file: 'e1-antiguru.png', eyebrow: 'NOVO · GUIA AFFILIACORE',
  hl: [{ t: 'Não é curso de guru.' }, { t: 'É um guia de negócio.', a: true }], hlFs: 78, hlY: 428, hlLh: 96, rule: 580,
  sub: [{ t: 'Construindo sua agência de afiliados —' }, { t: 'o guia institucional da AffiliaCore.' }], subFs: 31, subY: 626, subLh: 46,
  cta: 'affiliacore.com.br/ebook · R$ 47' });

post({ name: 'e2', theme: 'light', file: 'e2-regulatorio.png', eyebrow: 'POR QUE AGORA',
  hl: [{ t: 'Boa parte do que os cursos' }, { t: 'do nicho prometem hoje' }, { t: 'é proibido por lei.', a: true }], hlFs: 64, hlY: 388, hlLh: 78, rule: 606,
  sub: [{ t: 'As regras de julho/2026 mudaram o jogo —' }, { t: 'e o guia mostra onde está a linha.' }], subFs: 31, subY: 668, subLh: 46,
  cta: 'affiliacore.com.br/ebook' });

post({ name: 'e3', theme: 'dark', file: 'e3-dentro.png', eyebrow: 'O QUE TEM DENTRO',
  hl: [{ t: '8 capítulos, do mercado' }, { t: 'ao seu 1º trimestre.', a: true }], hlFs: 80, hlY: 418, hlLh: 98, rule: 570,
  sub: [{ t: 'Modelos de comissão com contratos reais, a' }, { t: 'lei explicada pra quem divulga, e o caso real' }, { t: 'da agência que virou nossa plataforma.' }], subFs: 28, subY: 620, subLh: 42,
  cta: '~60 páginas · affiliacore.com.br/ebook' });

post({ name: 'e4', theme: 'light', file: 'e4-oferta.png', eyebrow: 'GUIA + KIT',
  hl: [{ t: 'Comece a montar' }, { t: 'sua agência hoje.', a: true }], hlFs: 86, hlY: 430, hlLh: 104, rule: 588,
  sub: [{ t: 'O guia (R$ 47) + o Kit de Operação: calculadora,' }, { t: 'checklist e modelo de contrato. 7 dias de garantia.' }], subFs: 29, subY: 636, subLh: 44,
  cta: 'affiliacore.com.br/ebook' });

console.log('segs em', OUT);
