// Kit de redes sociais AffiliaCore (Direção C) — avatar, capa LinkedIn e os
// 4 criativos da campanha de lançamento. SVG autorado com as fontes reais da
// marca (Bricolage/Inter, woff2→ttf via wawoff2) e renderizado em PNG (resvg).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import wawoff2 from 'wawoff2';
import { Resvg } from '@resvg/resvg-js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'social-out');
const TTF = join(ROOT, 'fonts-ttf');
mkdirSync(OUT, { recursive: true });
mkdirSync(TTF, { recursive: true });

// woff2 → ttf p/ o resvg (que não lê woff2)
const FONTS = ['bricolage-grotesque-500', 'bricolage-grotesque-800', 'inter-400', 'inter-600'];
const fontFiles = [];
for (const f of FONTS) {
  const dest = join(TTF, `${f}.ttf`);
  writeFileSync(dest, await wawoff2.decompress(readFileSync(join(ROOT, 'fonts', `${f}.woff2`))));
  fontFiles.push(dest);
}

// ——— blocos reutilizáveis ————————————————————————————————————————————————
const EMBER = '#e11d48', EMBER_L = '#e45b79', PLUM = '#26181c', INK = '#11070a';
const MUTED = '#af9da2', FAINT = '#816e74';

// Glifo C-núcleo (anel aberto ±40° + dot), centrado em (cx,cy) com raio externo r.
function glyph(cx, cy, r, ring = EMBER, dot = '#ffffff') {
  const stroke = r * 2 * 0.164, rm = r - stroke / 2, dotR = r * 2 * 0.157;
  const cos = Math.cos((40 * Math.PI) / 180), sin = Math.sin((40 * Math.PI) / 180);
  return `<path d="M ${(cx + rm * cos).toFixed(1)} ${(cy - rm * sin).toFixed(1)} A ${rm.toFixed(1)} ${rm.toFixed(1)} 0 1 0 ${(cx + rm * cos).toFixed(1)} ${(cy + rm * sin).toFixed(1)}" fill="none" stroke="${ring}" stroke-width="${stroke.toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="${dotR.toFixed(1)}" fill="${dot}"/>`;
}

// Wordmark tipográfico (as fontes REAIS renderizam no resvg — sem path manual).
// Baseline em (x,y); size = tamanho da fonte. Glifo entre "Affilia" e "ore".
function lockup(x, y, size, { affilia = '#fff', ore = EMBER_L, ring = EMBER_L, dot = '#fff' } = {}) {
  // Métrica exata (fontkit): "Affilia" na 800 c/ tracking -0.02 = 2.85×size.
  // Encaixe idêntico ao logo shipado: gap esq. 0.09×size; "ore" entra 0.04×size
  // PRA DENTRO da borda direita do anel (a abertura do C já dá o respiro).
  const wA = 2.85 * size;
  const r = size * 0.36;
  const gx = x + wA + size * 0.09 + r;
  const oreX = gx + r - size * 0.04;
  return `<text x="${x}" y="${y}" font-family="Bricolage Grotesque" font-weight="800" font-size="${size}" letter-spacing="${(-0.02 * size).toFixed(1)}" fill="${affilia}">Affilia</text>
  ${glyph(gx, y - size * 0.34, r, ring, dot)}
  <text x="${oreX}" y="${y}" font-family="Bricolage Grotesque" font-weight="500" font-size="${size}" letter-spacing="${(-0.02 * size).toFixed(1)}" fill="${ore}">ore</text>`;
}

const bgRadial = (id) => `<defs><radialGradient id="${id}" cx="0.72" cy="-0.15" r="1.5">
  <stop offset="0" stop-color="#6c0e23"/><stop offset="0.34" stop-color="#4a0a18"/><stop offset="0.75" stop-color="${INK}"/>
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

// ——— 1 · avatar (1024², glifo centrado, seguro p/ crop circular) ————————————
render('avatar.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${bgRadial('av')}<rect width="512" height="512" fill="url(#av)"/>
  ${glyph(256, 256, 128)}
</svg>`, 1024);

// ——— 2 · capa LinkedIn/geral (1584×396) ————————————————————————————————————
render('capa-linkedin.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1584 396">
  ${bgRadial('cv')}<rect width="1584" height="396" fill="url(#cv)"/>
  ${lockup(96, 218, 88)}
  <text x="96" y="292" font-family="Inter" font-size="30" fill="${MUTED}">Gestão de afiliados para agências de apostas — white-label</text>
  <text x="1488" y="292" text-anchor="end" font-family="Inter" font-weight="600" font-size="28" fill="${EMBER_L}">affiliacore.com.br</text>
</svg>`, 1584);

// ——— 3 · POST 1 — lançamento ————————————————————————————————————————————————
render('post-1-lancamento.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgRadial('p1')}<rect width="1080" height="1080" fill="url(#p1)"/>
  ${glyph(540, 330, 120)}
  ${lockup(263, 570, 84)}
  <text x="540" y="680" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="500" font-size="44" fill="#ffffff">A plataforma da sua agência de afiliados.</text>
  <text x="540" y="742" text-anchor="middle" font-family="Inter" font-size="30" fill="${MUTED}">Comissão CPA/REV por casa · portal do afiliado · auditoria</text>
  <rect x="330" y="850" width="420" height="76" rx="38" fill="${EMBER}"/>
  <text x="540" y="899" text-anchor="middle" font-family="Inter" font-weight="600" font-size="30" fill="#ffffff">affiliacore.com.br</text>
</svg>`, 1080);

// ——— 4 · POST 2 — a dor (planilha) ——————————————————————————————————————————
const bullet = (y, txt) => `${glyph(126, y - 11, 22)}<text x="176" y="${y}" font-family="Inter" font-size="33" fill="#ffffff">${txt}</text>`;
render('post-2-planilha.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgRadial('p2')}<rect width="1080" height="1080" fill="url(#p2)"/>
  <text x="96" y="130" font-family="Inter" font-weight="600" font-size="26" letter-spacing="6" fill="${EMBER_L}">PARA AGÊNCIAS DE APOSTAS</text>
  <text x="96" y="268" font-family="Bricolage Grotesque" font-weight="800" font-size="82" fill="#ffffff">Sua agência ainda</text>
  <text x="96" y="368" font-family="Bricolage Grotesque" font-weight="800" font-size="82" fill="#ffffff">fecha comissão</text>
  <text x="96" y="468" font-family="Bricolage Grotesque" font-weight="800" font-size="82" fill="${EMBER_L}">na planilha?</text>
  ${bullet(600, 'Cálculo CPA + REV por casa, automático')}
  ${bullet(700, 'Cada afiliado enxerga só os próprios números')}
  ${bullet(800, 'Toda alteração de taxa com trilha de auditoria')}
  <line x1="96" y1="900" x2="984" y2="900" stroke="#34262a" stroke-width="2"/>
  ${lockup(96, 984, 40)}
  <text x="984" y="984" text-anchor="end" font-family="Inter" font-weight="600" font-size="28" fill="${MUTED}">affiliacore.com.br</text>
</svg>`, 1080);

// ——— 5 · POST 3 — o painel white-label ———————————————————————————————————————
const bars = [92, 74, 61, 50, 38, 28]
  .map((h, i) => {
    const bh = h * 2.2, x = 210 + i * 115;
    return `<rect x="${x}" y="${640 - bh}" width="86" height="${bh}" rx="10" fill="${i === 0 ? EMBER_L : EMBER}" opacity="${i === 0 ? 1 : 0.75}"/>`;
  }).join('');
render('post-3-painel.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgRadial('p3')}<rect width="1080" height="1080" fill="url(#p3)"/>
  <text x="540" y="150" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="64" fill="#ffffff">O painel da sua agência.</text>
  <text x="540" y="228" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="64" fill="${EMBER_L}">Com a sua marca.</text>
  <rect x="150" y="300" width="780" height="420" rx="28" fill="#23161a" stroke="#34262a" stroke-width="3"/>
  <text x="210" y="368" font-family="Inter" font-weight="600" font-size="24" letter-spacing="4" fill="${FAINT}">TOP AFILIADOS POR COMISSÃO</text>
  ${bars}
  <line x1="210" y1="646" x2="870" y2="646" stroke="#34262a" stroke-width="2"/>
  <text x="210" y="692" font-family="Inter" font-size="26" fill="${MUTED}">Comissão do mês</text>
  <text x="870" y="692" text-anchor="end" font-family="Inter" font-weight="600" font-size="30" fill="#ffffff">R$ 24.831,90</text>
  <text x="540" y="810" text-anchor="middle" font-family="Inter" font-size="31" fill="${MUTED}">White-label: seu domínio, seu logo, suas cores.</text>
  <text x="540" y="856" text-anchor="middle" font-family="Inter" font-size="31" fill="${MUTED}">Instância própria, dados isolados por agência.</text>
  <line x1="96" y1="920" x2="984" y2="920" stroke="#34262a" stroke-width="2"/>
  ${lockup(96, 1000, 40)}
  <text x="984" y="1000" text-anchor="end" font-family="Inter" font-weight="600" font-size="28" fill="${MUTED}">affiliacore.com.br</text>
</svg>`, 1080);

// ——— 6 · POST 4 — CTA fundador ———————————————————————————————————————————————
render('post-4-fundador.png', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  ${bgRadial('p4')}<rect width="1080" height="1080" fill="url(#p4)"/>
  <rect x="322" y="106" width="436" height="58" rx="29" fill="none" stroke="${EMBER_L}" stroke-width="2"/>
  <text x="540" y="145" text-anchor="middle" font-family="Inter" font-weight="600" font-size="25" letter-spacing="5" fill="${EMBER_L}">VAGAS DE FUNDADOR</text>
  ${glyph(540, 320, 96)}
  <text x="540" y="530" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="76" fill="#ffffff">3 agências entram com</text>
  <text x="540" y="622" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="76" fill="${EMBER_L}">preço de fundador.</text>
  <text x="540" y="716" text-anchor="middle" font-family="Inter" font-size="32" fill="${MUTED}">Condição travada enquanto for cliente,</text>
  <text x="540" y="762" text-anchor="middle" font-family="Inter" font-size="32" fill="${MUTED}">em troca do seu feedback de perto.</text>
  <rect x="285" y="850" width="510" height="80" rx="40" fill="${EMBER}"/>
  <text x="540" y="901" text-anchor="middle" font-family="Inter" font-weight="600" font-size="31" fill="#ffffff">Chama no direct  ·  @affiliacore.br</text>
</svg>`, 1080);

console.log('kit completo em social-out/');
