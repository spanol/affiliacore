// Posts 5–7 (série lucratividade) → programas de desenho canvas (texto em
// CURVAS via fontkit) p/ injetar no composer de posts do MBS via
// javascript_tool + PNG de validação (resvg, MESMOS paths). Novidade vs.
// gen-posts234-canvas: suporte a FUNDO CLARO (posts 5 e 7 = tema light).
// Layout = gen-posts567.mjs. Fontes: ../fonts (woff2).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import * as fontkit from 'fontkit';
import { Resvg } from '@resvg/resvg-js';

const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const F = (n) => fontkit.create(readFileSync(join(HERE, '..', 'fonts', `${n}.woff2`)));
const b800 = F('bricolage-grotesque-800'), b500 = F('bricolage-grotesque-500');
const i400 = F('inter-400'), i600 = F('inter-600');

const EMBER = '#e11d48', EMBER_L = '#e45b79', INK = '#11070a';
const MUTED = '#af9da2', HAIR = '#34262a';
const L_INK = '#1c1014', L_MUTED = '#6e5a60', L_FAINT = '#9a878d';
const L_HAIR = '#e8dce0', EMBER_D = '#be123c', L_PINK = '#fbe4ea';

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

const jstr = (s) => {
  const parts = [];
  for (let i = 0; i < s.length; i += 800) parts.push(JSON.stringify(s.slice(i, i + 800)));
  return '(' + parts.join('+\n') + ')';
};

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

  // fills → JSON compacto → deflate → base64 → chunks acumuladores ≤9.3KB.
  // Na página: DecompressionStream('deflate') reidrata e desenha (1 chamada).
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
const txt=await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
const fills=JSON.parse(txt);const x=window.__px;
for(const f of fills){x.fillStyle=f.c;x.fill(new Path2D(f.d));}
delete window.__z;
JSON.stringify({drawn:fills.length});`.trim());
  segs.push(`
const c=window.__pc;
const blob=await new Promise(r=>c.toBlob(r,'image/png'));
const file=new File([blob],'${fileName}',{type:'image/png'});
const dt=new DataTransfer();dt.items.add(file);
const input=[...document.querySelectorAll('input[type=file]')].find(i=>(i.accept||'').includes('image'));
input.files=dt.files;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
JSON.stringify({blob:blob.size,accept:input&&input.accept});`.trim());

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

// helpers de geometria compartilhados (canvas + svg)
const rrJs = (x0, y0, w, h, r, fill, stroke, sw, alpha) => {
  let s = `x.beginPath();x.roundRect(${x0},${y0},${w},${h},${r});`;
  if (fill) s = `x.fillStyle='${fill}';` + s + `x.fill();`;
  if (stroke) s += `x.strokeStyle='${stroke}';x.lineWidth=${sw};${alpha ? `x.globalAlpha=${alpha};` : ''}x.beginPath();x.roundRect(${x0},${y0},${w},${h},${r});x.stroke();${alpha ? 'x.globalAlpha=1;' : ''}`;
  return s;
};
const rrSvg = (x0, y0, w, h, r, fill, stroke, sw, alpha) =>
  `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="${fill || 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"${alpha ? ` stroke-opacity="${alpha}"` : ''}` : ''}/>`;
const lineJs = (x1, y1, x2, y2, color, w, cap = 'butt') =>
  `x.strokeStyle='${color}';x.lineWidth=${w};x.lineCap='${cap}';x.beginPath();x.moveTo(${x1},${y1});x.lineTo(${x2},${y2});x.stroke();`;
const lineSvg = (x1, y1, x2, y2, color, w, cap = 'butt') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}"${cap !== 'butt' ? ` stroke-linecap="${cap}"` : ''}/>`;
const dotJs = (cx, cy, r, fill) => `x.fillStyle='${fill}';x.beginPath();x.arc(${cx},${cy},${r},0,7);x.fill();`;
const dotSvg = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

// ═══ POST 5 — a conta da agência (LIGHT) ═══
{
  const lk = lockup(96, 1020, 40, true);
  const geomJs = [
    rrJs(96, 396, 888, 440, 28, '#ffffff', L_HAIR, 3),
    lineJs(156, 510, 924, 510, L_HAIR, 2),
    lineJs(156, 608, 924, 608, L_HAIR, 2),
    rrJs(156, 712, 768, 92, 18, L_PINK, EMBER, 2, 0.45),
    lineJs(96, 940, 984, 940, L_HAIR, 2),
    arcJs(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const geomSvg = [
    rrSvg(96, 396, 888, 440, 28, '#ffffff', L_HAIR, 3),
    lineSvg(156, 510, 924, 510, L_HAIR, 2),
    lineSvg(156, 608, 924, 608, L_HAIR, 2),
    rrSvg(156, 712, 768, 92, 18, L_PINK, EMBER, 2, 0.45),
    lineSvg(96, 940, 984, 940, L_HAIR, 2),
    arcSvg(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const fills = [
    { color: EMBER_D, ...shape(i600, 'A CONTA DA AGÊNCIA', 26, 96, 120, 6 / 26) },
    { color: L_INK, ...shape(b800, 'Quanto rende uma', 78, 96, 238) },
    { color: EMBER_D, ...shape(b800, 'operação dessas?', 78, 96, 332) },
    { color: L_MUTED, ...shape(i400, 'A casa te paga (CPA)', 31, 156, 478) },
    { color: L_INK, ...right(i600, 'R$ 600', 34, 924, 478) },
    { color: L_MUTED, ...shape(i400, 'Você repassa ao afiliado', 31, 156, 576) },
    { color: L_INK, ...right(i600, '− R$ 400', 34, 924, 576) },
    { color: L_MUTED, ...shape(i400, 'Sua margem × 120 FTDs no mês', 31, 156, 674) },
    { color: EMBER_D, ...right(i600, 'R$ 200 / FTD', 34, 924, 674) },
    { color: EMBER_D, ...shape(i600, 'MARGEM / MÊS', 24, 192, 770, 3 / 24) },
    { color: L_INK, ...right(b800, 'R$ 24.000', 52, 888, 774) },
    { color: L_FAINT, ...shape(i400, 'Números ilustrativos — faça a conta com os seus no simulador do site.', 29, 96, 898) },
    { color: lk.colors.affilia, ...lk.affilia },
    { color: lk.colors.ore, ...lk.ore },
    { color: L_MUTED, ...right(i600, 'affiliacore.com.br', 28, 984, 1020) },
  ];
  emit('post5', 'light', geomJs, geomSvg, fills, 'post-5-conta.png');
}

// ═══ POST 6 — do zero à agência (DARK) ═══
{
  const lk = lockup(96, 972, 40, false);
  const geomJs = [
    lineJs(96, 880, 984, 880, HAIR, 2),
    arcJs(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const geomSvg = [
    lineSvg(96, 880, 984, 880, HAIR, 2),
    arcSvg(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const stepFills = (y, n, title, sub) => [
    { color: EMBER_L, ...shape(b800, n, 34, 96, y) },
    { color: '#ffffff', ...shape(i600, title, 35, 176, y) },
    { color: MUTED, ...shape(i400, sub, 28, 176, y + 46) },
  ];
  const fills = [
    { color: EMBER_L, ...shape(i600, 'QUER ENTRAR NO JOGO?', 26, 96, 130, 6 / 26) },
    { color: '#ffffff', ...shape(b800, 'Do zero à agência', 82, 96, 262) },
    { color: EMBER_L, ...shape(b800, 'em 3 passos.', 82, 96, 362) },
    ...stepFills(500, '01', 'Feche deals diretos com as casas', 'CPA e/ou REV — o contato e o contrato são seus.'),
    ...stepFills(640, '02', 'Receba o painel com a sua marca', 'Instância própria, pronta em dias: domínio, logo, cores.'),
    ...stepFills(780, '03', 'Convide afiliados e defina o repasse', 'A diferença entre o que a casa paga e o repasse é sua.'),
    { color: lk.colors.affilia, ...lk.affilia },
    { color: lk.colors.ore, ...lk.ore },
    { color: MUTED, ...right(i600, 'affiliacore.com.br', 28, 984, 972) },
  ];
  emit('post6', 'dark', geomJs, geomSvg, fills, 'post-6-dozero.png');
}

// ═══ POST 7 — simulador (LIGHT) ═══
{
  const lk = lockup(96, 1044, 36, true);
  const SL = (y, frac) => {
    const x0 = 156, x1 = 704;
    const fx = x0 + (x1 - x0) * frac;
    return {
      js: [
        lineJs(x0, y + 34, 924, y + 34, L_HAIR, 8, 'round'),
        lineJs(x0, y + 34, fx, y + 34, EMBER, 8, 'round'),
        dotJs(fx, y + 34, 16, EMBER),
      ].join('\n'),
      svg: [
        lineSvg(x0, y + 34, 924, y + 34, L_HAIR, 8, 'round'),
        lineSvg(x0, y + 34, fx, y + 34, EMBER, 8, 'round'),
        dotSvg(fx, y + 34, 16, EMBER),
      ].join('\n'),
    };
  };
  const s1 = SL(470, 0.14), s2 = SL(584, 0.36);
  const geomJs = [
    rrJs(96, 396, 888, 416, 28, '#ffffff', L_HAIR, 3),
    s1.js, s2.js,
    rrJs(156, 668, 768, 104, 18, L_PINK, EMBER, 2, 0.45),
    rrJs(285, 856, 510, 80, 40, EMBER),
    lineJs(96, 980, 984, 980, L_HAIR, 2),
    arcJs(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const geomSvg = [
    rrSvg(96, 396, 888, 416, 28, '#ffffff', L_HAIR, 3),
    s1.svg, s2.svg,
    rrSvg(156, 668, 768, 104, 18, L_PINK, EMBER, 2, 0.45),
    rrSvg(285, 856, 510, 80, 40, EMBER),
    lineSvg(96, 980, 984, 980, L_HAIR, 2),
    arcSvg(lk.g, lk.colors.ring, lk.colors.dot),
  ].join('\n');
  const fills = [
    { color: EMBER_D, ...shape(i600, 'FERRAMENTA GRÁTIS NO SITE', 26, 96, 120, 6 / 26) },
    { color: L_INK, ...shape(b800, 'Simule a margem', 78, 96, 238) },
    { color: EMBER_D, ...shape(b800, 'da sua operação.', 78, 96, 332) },
    { color: L_MUTED, ...shape(i400, 'Afiliados ativos', 29, 156, 470) },
    { color: L_INK, ...right(b800, '15', 32, 924, 470) },
    { color: L_MUTED, ...shape(i400, 'CPA que a casa te paga', 29, 156, 584) },
    { color: L_INK, ...right(b800, 'R$ 600', 32, 924, 584) },
    { color: EMBER_D, ...shape(i600, 'MARGEM DA AGÊNCIA / MÊS', 23, 192, 712, 3 / 23) },
    { color: L_MUTED, ...shape(i400, 'com os seus números', 24, 192, 756) },
    { color: L_INK, ...right(b800, 'R$ 24.000', 56, 888, 748) },
    { color: '#ffffff', ...center(i600, 'affiliacore.com.br · Simulador', 30, 907) },
    { color: lk.colors.affilia, ...lk.affilia },
    { color: lk.colors.ore, ...lk.ore },
    { color: L_MUTED, ...right(i600, 'affiliacore.com.br', 26, 984, 1044) },
  ];
  emit('post7', 'light', geomJs, geomSvg, fills, 'post-7-simulador.png');
}

console.log('pronto: out/');
