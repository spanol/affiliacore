// Gera um programa de desenho (canvas 2D) do post-1 com TODO texto em curvas
// (fontkit → path data absoluto) — p/ rodar DENTRO da página do Instagram via
// javascript_tool (CSP bloqueia fetch/fontes externas; geometria passa).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fontkit from 'fontkit';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const F = (n) => fontkit.create(readFileSync(join(ROOT, 'fonts', `${n}.woff2`)));
const b800 = F('bricolage-grotesque-800'), b500 = F('bricolage-grotesque-500');
const i400 = F('inter-400'), i600 = F('inter-600');

// texto → path data absoluto (y-down, baseline em `base`), 1 casa decimal
function shape(font, text, size, x, base, track = 0) {
  const s = size / font.unitsPerEm;
  const run = font.layout(text);
  let cx = x;
  const parts = [];
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i];
    const gx = cx + pos.xOffset * s, gy = base - pos.yOffset * s;
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
    cx += pos.xAdvance * s + (i < run.glyphs.length - 1 ? track * size : 0);
  });
  return { d: parts.join(''), end: cx };
}
const width = (font, text, size, track = 0) => {
  const run = font.layout(text);
  const s = size / font.unitsPerEm;
  return run.positions.reduce((sum, p) => sum + p.xAdvance * s, 0) + track * size * (run.glyphs.length - 1);
};

// — lockup "Affilia◐ore" em 84px, x=263 base=570 (geometria do kit aprovado) —
const SZ = 84, LX = 263, LB = 570, TR = -0.02;
const wA = width(b800, 'Affilia', SZ, TR);
const affilia = shape(b800, 'Affilia', SZ, LX, LB, TR);
const R = SZ * 0.36, GX = LX + wA + SZ * 0.09 + R, GY = LB - SZ * 0.34;
const ore = shape(b500, 'ore', SZ, GX + R - SZ * 0.04, LB, TR);

// — textos centrados —
const center = (font, text, size, base, track = 0) =>
  shape(font, text, size, 540 - width(font, text, size, track) / 2, base, track);
const headline = center(b500, 'A plataforma da sua agência de afiliados.', 44, 680, -0.01);
const sub = center(i400, 'Comissão CPA/REV por casa · portal do afiliado · auditoria', 30, 742);
const btn = center(i600, 'affiliacore.com.br', 30, 899);

// glifo C-núcleo: params p/ desenhar com arc() no canvas (gap ±40° à direita)
const glyph = (cx, cy, r) => ({ cx, cy, rm: r - r * 0.164, sw: r * 2 * 0.164, dot: r * 2 * 0.157 });
const G1 = glyph(540, 330, 120); // hero
const G2 = glyph(GX, GY, R);     // no lockup

// string JS literal quebrada em pedaços de 800 chars (linhas curtas → o Read
// do arquivo não trunca; o browser concatena com +)
const jstr = (s) => {
  const parts = [];
  for (let i = 0; i < s.length; i += 800) parts.push(JSON.stringify(s.slice(i, i + 800)));
  return '(' + parts.join('+\n') + ')';
};

const js = `
const c=document.createElement('canvas');c.width=1080;c.height=1080;
const x=c.getContext('2d');
const g=x.createRadialGradient(777.6,-162,0,777.6,-162,1620);
g.addColorStop(0,'#6c0e23');g.addColorStop(.34,'#4a0a18');g.addColorStop(.75,'#11070a');
x.fillStyle=g;x.fillRect(0,0,1080,1080);
const A=(cx,cy,rm,sw,dot,ring,dc)=>{x.strokeStyle=ring;x.lineWidth=sw;x.lineCap='round';
x.beginPath();x.arc(cx,cy,rm,40*Math.PI/180,320*Math.PI/180);x.stroke();
x.fillStyle=dc;x.beginPath();x.arc(cx,cy,dot,0,7);x.fill();};
A(${G1.cx},${G1.cy},${G1.rm.toFixed(1)},${G1.sw.toFixed(1)},${G1.dot.toFixed(1)},'#e11d48','#ffffff');
A(${G2.cx.toFixed(1)},${G2.cy.toFixed(1)},${G2.rm.toFixed(1)},${G2.sw.toFixed(1)},${G2.dot.toFixed(1)},'#e45b79','#ffffff');
x.fillStyle='#ffffff';x.fill(new Path2D(${jstr(affilia.d)}));
x.fillStyle='#e45b79';x.fill(new Path2D(${jstr(ore.d)}));
x.fillStyle='#ffffff';x.fill(new Path2D(${jstr(headline.d)}));
x.fillStyle='#af9da2';x.fill(new Path2D(${jstr(sub.d)}));
x.fillStyle='#e11d48';x.beginPath();x.roundRect(330,850,420,76,38);x.fill();
x.fillStyle='#ffffff';x.fill(new Path2D(${jstr(btn.d)}));
const blob=await new Promise(r=>c.toBlob(r,'image/png'));
const file=new File([blob],'post-1-lancamento.png',{type:'image/png'});
const dt=new DataTransfer();dt.items.add(file);
const input=[...document.querySelectorAll('input[type=file]')].find(i=>(i.accept||'').includes('image'));
input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
JSON.stringify({blob:blob.size,accept:input&&input.accept});
`;
writeFileSync(join(ROOT, 'post1-draw.js'), js.trim());
console.log('post1-draw.js:', (js.length / 1024).toFixed(1), 'KB');

// — validação local: renderiza os MESMOS paths em SVG (resvg) p/ conferir —
const { Resvg } = await import('@resvg/resvg-js');
const arcSvg = ({ cx, cy, rm, sw, dot }, ring, dc) => {
  const cos = Math.cos((40 * Math.PI) / 180), sin = Math.sin((40 * Math.PI) / 180);
  return `<path d="M ${(cx + rm * cos).toFixed(1)} ${(cy - rm * sin).toFixed(1)} A ${rm.toFixed(1)} ${rm.toFixed(1)} 0 1 0 ${(cx + rm * cos).toFixed(1)} ${(cy + rm * sin).toFixed(1)}" fill="none" stroke="${ring}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="${dot.toFixed(1)}" fill="${dc}"/>`;
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
<defs><radialGradient id="g" cx="0.72" cy="-0.15" r="1.5">
<stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="#11070a"/>
</radialGradient></defs><rect width="1080" height="1080" fill="url(#g)"/>
${arcSvg(G1, '#e11d48', '#ffffff')}
${arcSvg(G2, '#e45b79', '#ffffff')}
<path d="${affilia.d}" fill="#ffffff"/><path d="${ore.d}" fill="#e45b79"/>
<path d="${headline.d}" fill="#ffffff"/><path d="${sub.d}" fill="#af9da2"/>
<rect x="330" y="850" width="420" height="76" rx="38" fill="#e11d48"/>
<path d="${btn.d}" fill="#ffffff"/>
</svg>`;
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } }).render().asPng();
writeFileSync(join(ROOT, 'social-out', 'post1-canvas-check.png'), png);
console.log('validação: social-out/post1-canvas-check.png');
