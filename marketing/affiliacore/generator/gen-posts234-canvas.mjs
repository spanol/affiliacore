// Posts 2–4 da campanha AffiliaCore → programas de desenho canvas (texto em
// CURVAS via fontkit) p/ injetar no IG/MBS via javascript_tool + PNG de
// validação local (resvg, MESMOS paths). Layout = gen-social.mjs do repo.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as fontkit from 'fontkit';
import { Resvg } from '@resvg/resvg-js';

const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const F = (n) => fontkit.create(readFileSync(join(HERE, 'fonts', `${n}.woff2`)));
const b800 = F('bricolage-grotesque-800'), b500 = F('bricolage-grotesque-500');
const i400 = F('inter-400'), i600 = F('inter-600');

const EMBER = '#e11d48', EMBER_L = '#e45b79', INK = '#11070a';
const MUTED = '#af9da2', FAINT = '#816e74', HAIR = '#34262a';

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
const center = (font, text, size, base, track = 0) =>
  shape(font, text, size, 540 - width(font, text, size, track) / 2, base, track);

// glifo C-núcleo (params p/ canvas arc)
const glyph = (cx, cy, r) => ({ cx, cy, rm: r - r * 0.164, sw: r * 2 * 0.164, dot: r * 2 * 0.157 });
const arcSvg = ({ cx, cy, rm, sw, dot }, ring, dc) => {
  const cos = Math.cos((40 * Math.PI) / 180), sin = Math.sin((40 * Math.PI) / 180);
  return `<path d="M ${(cx + rm * cos).toFixed(1)} ${(cy - rm * sin).toFixed(1)} A ${rm.toFixed(1)} ${rm.toFixed(1)} 0 1 0 ${(cx + rm * cos).toFixed(1)} ${(cy + rm * sin).toFixed(1)}" fill="none" stroke="${ring}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${dot.toFixed(1)}" fill="${dc}"/>`;
};
const arcJs = (g, ring, dc) =>
  `A(${g.cx.toFixed(1)},${g.cy.toFixed(1)},${g.rm.toFixed(1)},${g.sw.toFixed(1)},${g.dot.toFixed(1)},'${ring}','${dc}');`;

// lockup "Affilia◐ore" — mesma geometria do post-1 (métrica exata fontkit)
function lockup(x, base, size) {
  const TR = -0.02;
  const wA = width(b800, 'Affilia', size, TR);
  const affilia = shape(b800, 'Affilia', size, x, base, TR);
  const R = size * 0.36, GX = x + wA + size * 0.09 + R, GY = base - size * 0.34;
  const ore = shape(b500, 'ore', size, GX + R - size * 0.04, base, TR);
  return { affilia, ore, g: glyph(GX, GY, R) };
}

const jstr = (s) => {
  const parts = [];
  for (let i = 0; i < s.length; i += 800) parts.push(JSON.stringify(s.slice(i, i + 800)));
  return '(' + parts.join('+\n') + ')';
};

// monta segmentos: seg1 = canvas+bg+geometria; depois fills de texto agrupados
// em blocos <= ~11KB; último = toBlob→File→input
function emit(name, geomJs, geomSvg, fills, fileName) {
  const seg1 = `
const c=document.createElement('canvas');c.width=1080;c.height=1080;
const x=c.getContext('2d');
const g=x.createRadialGradient(777.6,-162,0,777.6,-162,1620);
g.addColorStop(0,'#6c0e23');g.addColorStop(.34,'#4a0a18');g.addColorStop(.75,'${INK}');
x.fillStyle=g;x.fillRect(0,0,1080,1080);
const A=(cx,cy,rm,sw,dot,ring,dc)=>{x.strokeStyle=ring;x.lineWidth=sw;x.lineCap='round';
x.beginPath();x.arc(cx,cy,rm,40*Math.PI/180,320*Math.PI/180);x.stroke();
x.fillStyle=dc;x.beginPath();x.arc(cx,cy,dot,0,7);x.fill();};
${geomJs}
window.__pc=c;window.__px=x;
JSON.stringify({seg:1,ok:!!window.__px});`.trim();

  const segs = [seg1];
  let cur = [];
  let curLen = 0;
  const pushStmt = (stmt) => {
    if (curLen + stmt.length > 10000 && cur.length) {
      segs.push(`const x=window.__px;\n${cur.join('\n')}\nJSON.stringify({seg:${segs.length + 1},ok:true});`);
      cur = []; curLen = 0;
    }
    cur.push(stmt); curLen += stmt.length;
  };
  for (const f of fills) {
    // pica em fronteira de GLIFO (glifo inteiro no mesmo Path2D — contorno+furo)
    const chunks = [];
    let acc = '';
    for (const gd of f.glyphDs || [f.d]) {
      if (acc.length + gd.length > 9000 && acc) { chunks.push(acc); acc = ''; }
      acc += gd;
    }
    if (acc) chunks.push(acc);
    for (const ch of chunks) pushStmt(`x.fillStyle='${f.color}';x.fill(new Path2D(${jstr(ch)}));`);
  }
  if (cur.length) segs.push(`const x=window.__px;\n${cur.join('\n')}\nJSON.stringify({seg:${segs.length + 1},ok:true});`);
  segs.push(`
const c=window.__pc;
const blob=await new Promise(r=>c.toBlob(r,'image/png'));
const file=new File([blob],'${fileName}',{type:'image/png'});
const dt=new DataTransfer();dt.items.add(file);
const input=[...document.querySelectorAll('input[type=file]')].find(i=>(i.accept||'').includes('image'));
input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
JSON.stringify({blob:blob.size,accept:input&&input.accept});`.trim());

  segs.forEach((s, i) => writeFileSync(join(OUT, `${name}-seg${i + 1}.js`), s));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
<defs><radialGradient id="g" cx="0.72" cy="-0.15" r="1.5">
<stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="${INK}"/>
</radialGradient></defs><rect width="1080" height="1080" fill="url(#g)"/>
${geomSvg}
${fills.map((f) => `<path d="${f.d}" fill="${f.color}"/>`).join('\n')}
</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } }).render().asPng();
  writeFileSync(join(OUT, `${name}-check.png`), png);
  console.log(`${name}: ${segs.length} segs (${segs.map((s) => (s.length / 1024).toFixed(1)).join('/')} KB) + check.png`);
}

// ═══ POST 2 — a dor da planilha ═══
{
  const lk = lockup(96, 984, 40);
  const bulletGs = [600, 700, 800].map((y) => glyph(126, y - 11, 22));
  const geomJs = [
    ...bulletGs.map((g) => arcJs(g, EMBER, '#ffffff')),
    arcJs(lk.g, EMBER_L, '#ffffff'),
    `x.strokeStyle='${HAIR}';x.lineWidth=2;x.beginPath();x.moveTo(96,900);x.lineTo(984,900);x.stroke();`,
  ].join('\n');
  const geomSvg = [
    ...bulletGs.map((g) => arcSvg(g, EMBER, '#ffffff')),
    arcSvg(lk.g, EMBER_L, '#ffffff'),
    `<line x1="96" y1="900" x2="984" y2="900" stroke="${HAIR}" stroke-width="2"/>`,
  ].join('\n');
  const fills = [
    { color: EMBER_L, ...shape(i600, 'PARA AGÊNCIAS DE APOSTAS', 26, 96, 130, 6 / 26) },
    { color: '#ffffff', ...shape(b800, 'Sua agência ainda', 82, 96, 268) },
    { color: '#ffffff', ...shape(b800, 'fecha comissão', 82, 96, 368) },
    { color: EMBER_L, ...shape(b800, 'na planilha?', 82, 96, 468) },
    { color: '#ffffff', ...shape(i400, 'Cálculo CPA + REV por casa, automático', 33, 176, 600) },
    { color: '#ffffff', ...shape(i400, 'Cada afiliado enxerga só os próprios números', 33, 176, 700) },
    { color: '#ffffff', ...shape(i400, 'Toda alteração de taxa com trilha de auditoria', 33, 176, 800) },
    { color: '#ffffff', ...lk.affilia },
    { color: EMBER_L, ...lk.ore },
    { color: MUTED, ...shape(i600, 'affiliacore.com.br', 28, 984 - width(i600, 'affiliacore.com.br', 28), 984) },
  ];
  emit('post2', geomJs, geomSvg, fills, 'post-2-planilha.png');
}

// ═══ POST 3 — painel white-label ═══
{
  const lk = lockup(96, 1000, 40);
  const bars = [92, 74, 61, 50, 38, 28].map((h, i) => {
    const bh = h * 2.2, bx = 210 + i * 115;
    return { x: bx, y: 640 - bh, w: 86, h: bh, fill: i === 0 ? EMBER_L : EMBER, op: i === 0 ? 1 : 0.75 };
  });
  const geomJs = [
    `x.fillStyle='#23161a';x.strokeStyle='${HAIR}';x.lineWidth=3;x.beginPath();x.roundRect(150,300,780,420,28);x.fill();x.stroke();`,
    ...bars.map((b) => `x.globalAlpha=${b.op};x.fillStyle='${b.fill}';x.beginPath();x.roundRect(${b.x},${b.y.toFixed(1)},${b.w},${b.h.toFixed(1)},10);x.fill();x.globalAlpha=1;`),
    `x.strokeStyle='${HAIR}';x.lineWidth=2;x.beginPath();x.moveTo(210,646);x.lineTo(870,646);x.stroke();`,
    `x.beginPath();x.moveTo(96,920);x.lineTo(984,920);x.stroke();`,
    arcJs(lk.g, EMBER_L, '#ffffff'),
  ].join('\n');
  const geomSvg = [
    `<rect x="150" y="300" width="780" height="420" rx="28" fill="#23161a" stroke="${HAIR}" stroke-width="3"/>`,
    ...bars.map((b) => `<rect x="${b.x}" y="${b.y.toFixed(1)}" width="${b.w}" height="${b.h.toFixed(1)}" rx="10" fill="${b.fill}" opacity="${b.op}"/>`),
    `<line x1="210" y1="646" x2="870" y2="646" stroke="${HAIR}" stroke-width="2"/>`,
    `<line x1="96" y1="920" x2="984" y2="920" stroke="${HAIR}" stroke-width="2"/>`,
    arcSvg(lk.g, EMBER_L, '#ffffff'),
  ].join('\n');
  const fills = [
    { color: '#ffffff', ...center(b800, 'O painel da sua agência.', 64, 150) },
    { color: EMBER_L, ...center(b800, 'Com a sua marca.', 64, 228) },
    { color: FAINT, ...shape(i600, 'TOP AFILIADOS POR COMISSÃO', 24, 210, 368, 4 / 24) },
    { color: MUTED, ...shape(i400, 'Comissão do mês', 26, 210, 692) },
    { color: '#ffffff', ...shape(i600, 'R$ 24.831,90', 30, 870 - width(i600, 'R$ 24.831,90', 30), 692) },
    { color: MUTED, ...center(i400, 'White-label: seu domínio, seu logo, suas cores.', 31, 810) },
    { color: MUTED, ...center(i400, 'Instância própria, dados isolados por agência.', 31, 856) },
    { color: '#ffffff', ...lk.affilia },
    { color: EMBER_L, ...lk.ore },
    { color: MUTED, ...shape(i600, 'affiliacore.com.br', 28, 984 - width(i600, 'affiliacore.com.br', 28), 1000) },
  ];
  emit('post3', geomJs, geomSvg, fills, 'post-3-painel.png');
}

// ═══ POST 4 — vagas de fundador ═══
{
  const heroG = glyph(540, 320, 96);
  const geomJs = [
    `x.strokeStyle='${EMBER_L}';x.lineWidth=2;x.beginPath();x.roundRect(322,106,436,58,29);x.stroke();`,
    arcJs(heroG, EMBER, '#ffffff'),
    `x.fillStyle='${EMBER}';x.beginPath();x.roundRect(285,850,510,80,40);x.fill();`,
  ].join('\n');
  const geomSvg = [
    `<rect x="322" y="106" width="436" height="58" rx="29" fill="none" stroke="${EMBER_L}" stroke-width="2"/>`,
    arcSvg(heroG, EMBER, '#ffffff'),
    `<rect x="285" y="850" width="510" height="80" rx="40" fill="${EMBER}"/>`,
  ].join('\n');
  const fills = [
    { color: EMBER_L, ...center(i600, 'VAGAS DE FUNDADOR', 25, 145, 5 / 25) },
    { color: '#ffffff', ...center(b800, '3 agências entram com', 76, 530) },
    { color: EMBER_L, ...center(b800, 'preço de fundador.', 76, 622) },
    { color: MUTED, ...center(i400, 'Condição travada enquanto for cliente,', 32, 716) },
    { color: MUTED, ...center(i400, 'em troca do seu feedback de perto.', 32, 762) },
    { color: '#ffffff', ...center(i600, 'Chama no direct · @affiliacore.br', 31, 901) },
  ];
  emit('post4', geomJs, geomSvg, fills, 'post-4-fundador.png');
}

console.log('pronto: out/');

// ═══ POST 1 — lançamento (p/ Página FB; geometria do gen-post-canvas.mjs) ═══
{
  const SZ = 84, LX = 263, LB = 570, TR = -0.02;
  const wA = width(b800, 'Affilia', SZ, TR);
  const affilia = shape(b800, 'Affilia', SZ, LX, LB, TR);
  const R = SZ * 0.36, GX = LX + wA + SZ * 0.09 + R, GY = LB - SZ * 0.34;
  const ore = shape(b500, 'ore', SZ, GX + R - SZ * 0.04, LB, TR);
  const G1 = glyph(540, 330, 120), G2 = glyph(GX, GY, R);
  const geomJs = [
    arcJs(G1, EMBER, '#ffffff'),
    arcJs(G2, EMBER_L, '#ffffff'),
    `x.fillStyle='${EMBER}';x.beginPath();x.roundRect(330,850,420,76,38);x.fill();`,
  ].join('\n');
  const geomSvg = [
    arcSvg(G1, EMBER, '#ffffff'),
    arcSvg(G2, EMBER_L, '#ffffff'),
    `<rect x="330" y="850" width="420" height="76" rx="38" fill="${EMBER}"/>`,
  ].join('\n');
  const fills = [
    { color: '#ffffff', ...affilia },
    { color: EMBER_L, ...ore },
    { color: '#ffffff', ...center(b500, 'A plataforma da sua agência de afiliados.', 44, 680, -0.01) },
    { color: MUTED, ...center(i400, 'Comissão CPA/REV por casa · portal do afiliado · auditoria', 30, 742) },
    { color: '#ffffff', ...center(i600, 'affiliacore.com.br', 30, 899) },
  ];
  emit('post1', geomJs, geomSvg, fills, 'post-1-lancamento.png');
}
