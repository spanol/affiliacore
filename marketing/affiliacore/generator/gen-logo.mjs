// Gera os SVGs finais da marca AffiliaCore (Direção C — "Core"):
// wordmark Bricolage Grotesque convertido em CURVAS (fontkit: shaping com
// kerning/ligaturas + paths por glifo re-projetados p/ y-down) + glifo
// C-núcleo (anel aberto + dot) desenhado geometricamente. Nada de <text> no
// SVG final — o app serve via <img>, fonte não carregaria.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as fontkit from 'fontkit';
import { Resvg } from '@resvg/resvg-js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'logo-out');
mkdirSync(OUT, { recursive: true });

const f800 = fontkit.create(readFileSync(join(ROOT, 'fonts', 'bricolage-grotesque-800.woff2')));
const f500 = fontkit.create(readFileSync(join(ROOT, 'fonts', 'bricolage-grotesque-500.woff2')));

const FS = 100; // fontSize de trabalho
const BASE = 100; // baseline y
const TRACK = -0.02 * FS; // tracking em unidades finais (800 já é fechada)

// Converte um run de texto shapeado em path data y-down (baseline em BASE).
// Também mede a bbox de TINTA (aprox. pelos pontos, suficiente p/ viewBox).
function textPath(font, text, xStart) {
  const s = FS / font.unitsPerEm;
  const run = font.layout(text);
  let x = xStart;
  const parts = [];
  let minY = Infinity, maxY = -Infinity;
  run.glyphs.forEach((glyph, i) => {
    const pos = run.positions[i];
    const gx = x + pos.xOffset * s;
    const gy = BASE - pos.yOffset * s;
    for (const cmd of glyph.path.commands) {
      const a = cmd.args;
      const px = (j) => (gx + a[j] * s).toFixed(2);
      const py = (j) => {
        const v = gy - a[j] * s;
        if (v < minY) minY = v;
        if (v > maxY) maxY = v;
        return v.toFixed(2);
      };
      if (cmd.command === 'moveTo') parts.push(`M${px(0)} ${py(1)}`);
      else if (cmd.command === 'lineTo') parts.push(`L${px(0)} ${py(1)}`);
      else if (cmd.command === 'quadraticCurveTo') parts.push(`Q${px(0)} ${py(1)} ${px(2)} ${py(3)}`);
      else if (cmd.command === 'bezierCurveTo') parts.push(`C${px(0)} ${py(1)} ${px(2)} ${py(3)} ${px(4)} ${py(5)}`);
      else if (cmd.command === 'closePath') parts.push('Z');
    }
    x += pos.xAdvance * s + (i < run.glyphs.length - 1 ? TRACK : 0);
  });
  return { d: parts.join(''), end: x, minY, maxY };
}

const capHeight = (f800.capHeight ?? 0.7 * f800.unitsPerEm) / f800.unitsPerEm * FS;

// — Glifo C-núcleo: anel aberto (gap à direita, ±40°) + dot central —
// Dimensionado pela cap-height com overshoot óptico de 2 un. acima/abaixo.
const ringOuterTop = BASE - capHeight - 2;
const ringOuterBottom = BASE + 2;
const R_OUT = (ringOuterBottom - ringOuterTop) / 2;
const CY = (ringOuterTop + ringOuterBottom) / 2;
const STROKE = R_OUT * 2 * 0.164; // proporção do conceito aprovado (11/67)
const R_MID = R_OUT - STROKE / 2;
const DOT_R = R_OUT * 2 * 0.157; // idem (10.5/67)
const GAP_DEG = 40;
const cos = Math.cos((GAP_DEG * Math.PI) / 180), sin = Math.sin((GAP_DEG * Math.PI) / 180);

// Respiro assimétrico: a ABERTURA do C já dá ar à direita — o "ore" encosta;
// à esquerda o "a" precisa de folga do anel fechado.
const PAD_LEFT = 9;
const PAD_RIGHT = -4;

const affilia = textPath(f800, 'Affilia', 0);
const glyphX0 = affilia.end + PAD_LEFT;
const CX = glyphX0 + R_OUT;
const ore = textPath(f500, 'ore', glyphX0 + R_OUT * 2 + PAD_RIGHT);

const arc = `M ${(CX + R_MID * cos).toFixed(2)} ${(CY - R_MID * sin).toFixed(2)} A ${R_MID.toFixed(2)} ${R_MID.toFixed(2)} 0 1 0 ${(CX + R_MID * cos).toFixed(2)} ${(CY + R_MID * sin).toFixed(2)}`;

// viewBox: bbox de TINTA (sem descendentes na palavra — nada de espaço morto)
const PAD = 6;
const x0 = -PAD;
const y0 = Math.min(affilia.minY, ore.minY, CY - R_OUT) - PAD;
const x1 = Math.max(ore.end, CX + R_OUT) + PAD;
const y1 = Math.max(affilia.maxY, ore.maxY, CY + R_OUT) + PAD;
const W = (x1 - x0).toFixed(1), H = (y1 - y0).toFixed(1);

function lockup({ affiliaFill, ring, dot, oreFill }, comment) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${W} ${H}" role="img" aria-label="AffiliaCore">
  <!-- ${comment} -->
  <path d="${affilia.d}" fill="${affiliaFill}"/>
  <path d="${arc}" fill="none" stroke="${ring}" stroke-width="${STROKE.toFixed(2)}" stroke-linecap="round"/>
  <circle cx="${CX.toFixed(2)}" cy="${CY.toFixed(2)}" r="${DOT_R.toFixed(2)}" fill="${dot}"/>
  <path d="${ore.d}" fill="${oreFill}"/>
</svg>
`;
}

// logo.svg — MONO BRANCO: o que o app serve (convenção invert dark:invert-0)
const logoMono = lockup(
  { affiliaFill: '#ffffff', ring: '#ffffff', dot: '#ffffff', oreFill: '#ffffff' },
  'Logo AffiliaCore (Direção C — Core) — mono branco de propósito: o app aplica\n       invert dark:invert-0 (branco no dark, preto no light). Wordmark Bricolage\n       Grotesque 800/500 em curvas + glifo C-núcleo. Versões cor: logo-color-*.svg',
);
// versões cor p/ LP, propostas e redes (não referenciadas pelo app)
const logoColorDark = lockup(
  { affiliaFill: '#ffffff', ring: '#e45b79', dot: '#ffffff', oreFill: '#e45b79' },
  'Logo AffiliaCore COR p/ fundo ESCURO (LP/hero, redes) — accent-400 da marca',
);
const logoColorLight = lockup(
  { affiliaFill: '#23161a', ring: '#e11d48', dot: '#23161a', oreFill: '#c0193e' },
  'Logo AffiliaCore COR p/ fundo CLARO (propostas, docs) — accent 500/600',
);

// favicon.svg — o glifo sozinho no tile (geometria do conceito aprovado)
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 110">
  <!-- Favicon AffiliaCore (Direção C) — glifo C-núcleo no canvas da marca. -->
  <rect width="110" height="110" rx="26" fill="#26181c"/>
  <path d="M76.4 37 A 28 28 0 1 0 76.4 73" fill="none" stroke="#e11d48" stroke-width="12" stroke-linecap="round"/>
  <circle cx="55" cy="55" r="10.5" fill="#ffffff"/>
</svg>
`;

const files = {
  'logo.svg': logoMono,
  'logo-color-dark.svg': logoColorDark,
  'logo-color-light.svg': logoColorLight,
  'favicon.svg': favicon,
};
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name), svg);
  console.log(`${name}: ${(svg.length / 1024).toFixed(1)}KB`);
}

// — Verificação visual: PNGs (logo sobre fundo compatível) —
function png(name, svg, bg, width) {
  const r = new Resvg(svg, { background: bg, fitTo: { mode: 'width', value: width } });
  writeFileSync(join(OUT, name), r.render().asPng());
}
png('check-mono-dark.png', logoMono, '#11070a', 900);
png('check-color-dark.png', logoColorDark, '#11070a', 900);
png('check-color-light.png', logoColorLight, '#ffffff', 900);
png('check-favicon.png', favicon, 'rgba(0,0,0,0)', 256);
png('check-favicon-16.png', favicon, 'rgba(0,0,0,0)', 16);
console.log('PNGs de verificação gerados em logo-out/');
console.log(`métricas: viewBox=${W}x${H} capHeight=${capHeight.toFixed(1)} R_OUT=${R_OUT.toFixed(1)} STROKE=${STROKE.toFixed(1)} DOT_R=${DOT_R.toFixed(1)}`);
