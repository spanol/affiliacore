// Compila o ebook (rascunho/*.md) em UM PDF diagramado na marca AffiliaCore:
// capa ember full-bleed (capa-livro) → avisos → sumário → introdução →
// 8 capítulos → glossário. Miolo CLARO (leitura/impressão), ember como acento,
// fontes reais embutidas (base64). Gera build.html; o PDF sai via Edge headless
// (--print-to-pdf). Rodar: node build-pdf.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const RAS = join(HERE, 'rascunho');
const FONTS = join(HERE, '..', 'affiliacore', 'fonts');
const COVER = join(HERE, 'lancamento', 'midias', 'capa-livro-construindo-1600x2560.png');

const b64 = (p) => readFileSync(p).toString('base64');
const font = (f) => `data:font/woff2;base64,${b64(join(FONTS, `${f}.woff2`))}`;
const coverB64 = `data:image/png;base64,${b64(COVER)}`;

// —— processa um capítulo: 1ª linha "# EYEBROW — Título" vira abertura ——
function chapter(file, id) {
  const raw = readFileSync(join(RAS, file), 'utf8').replace(/^﻿/, '').trim();
  const nl = raw.indexOf('\n');
  const h1 = raw.slice(0, nl).replace(/^#\s+/, '').trim();
  const body = raw.slice(nl + 1).trim();
  const parts = h1.split(/\s+—\s+/);
  const eyebrow = parts[0].trim();
  const title = (parts[1] || parts[0]).trim();
  return { id, eyebrow, title, html: marked.parse(body) };
}

// —— 00-abertura: extrai só "Avisos" e "Introdução" (ignora Título/rascunho) ——
const abertura = readFileSync(join(RAS, '00-abertura.md'), 'utf8').replace(/\[mês\/ano\]/g, 'julho de 2026');
const secs = abertura.split(/\n##\s+/).map((s) => s.trim());
const grab = (starts) => {
  const s = secs.find((x) => x.startsWith(starts)) || '';
  const nl = s.indexOf('\n');
  return marked.parse(s.slice(nl + 1).trim());
};
const avisosHtml = grab('Página de avisos');
const introHtml = grab('Introdução');

const chapters = [
  chapter('01-mercado.md', 'c1'),
  chapter('02-como-a-agencia-ganha.md', 'c2'),
  chapter('03-a-lei-fala-de-voce.md', 'c3'),
  chapter('04-montando-a-operacao.md', 'c4'),
  chapter('05-recrutando-e-gerindo-a-rede.md', 'c5'),
  chapter('06-caso-real-instancia-zero.md', 'c6'),
  chapter('07-ferramentas-sem-planilha.md', 'c7'),
  chapter('08-primeiros-90-dias.md', 'c8'),
  chapter('09-apendice-glossario.md', 'gl'),
];

const toc = [
  { num: '', title: 'Introdução', id: 'intro' },
  ...chapters.map((c, i) => ({
    num: c.eyebrow.startsWith('APÊNDICE') ? '' : String(i + 1),
    title: c.title, id: c.id,
  })),
];

const chapterHtml = (c, i) => `
<section class="chapter" id="${c.id}">
  <div class="chap-open">
    <div class="chap-eyebrow">${c.eyebrow.startsWith('APÊNDICE') ? 'Apêndice' : `Capítulo ${i + 1}`}</div>
    <h1 class="chap-title">${c.title}</h1>
    <div class="chap-rule"></div>
  </div>
  ${c.html}
</section>`;

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
@font-face{font-family:'Bricolage';font-weight:800;src:url('${font('bricolage-grotesque-800')}') format('woff2')}
@font-face{font-family:'Bricolage';font-weight:500;src:url('${font('bricolage-grotesque-500')}') format('woff2')}
@font-face{font-family:'Inter';font-weight:400;src:url('${font('inter-400')}') format('woff2')}
@font-face{font-family:'Inter';font-weight:600;src:url('${font('inter-600')}') format('woff2')}

:root{--ember:#c4123b;--ember-d:#9f1239;--ink:#181013;--body:#2b2226;--muted:#6b5b61;--hair:#e7dee1;--tint:#fbf1f4}
@page{size:A5;margin:16mm 15mm 17mm}
@page cover{margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:'Inter',sans-serif;font-size:10.5pt;line-height:1.62;color:var(--body);-webkit-print-color-adjust:exact;print-color-adjust:exact}
p{margin:0 0 .68em;text-align:justify;hyphens:auto}
strong{color:var(--ink);font-weight:600}
em{font-style:italic}
a{color:var(--ember);text-decoration:none}
h2,h3,h4{font-family:'Bricolage';color:var(--ink);break-after:avoid;line-height:1.2}
h2{font-size:14pt;font-weight:800;margin:1.5em 0 .5em}
h3{font-size:11.5pt;font-weight:800;margin:1.2em 0 .4em;color:var(--ember-d)}
h4{font-size:10.5pt;font-weight:600;margin:1em 0 .3em}
ul,ol{margin:.2em 0 .8em;padding-left:1.2em}
li{margin:.28em 0}
li::marker{color:var(--ember)}
blockquote{margin:.9em 0;padding:.5em 0 .5em 14px;border-left:3px solid var(--ember);color:var(--muted);background:var(--tint)}
blockquote p{margin:.2em 0}
hr{border:none;border-top:1px solid var(--hair);margin:1.4em 0}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em;background:var(--tint);padding:1px 4px;border-radius:4px;color:var(--ember-d)}
table{width:100%;border-collapse:collapse;margin:1em 0;font-size:9.2pt;break-inside:avoid}
th,td{border:1px solid var(--hair);padding:6px 8px;text-align:left;vertical-align:top}
th{background:var(--tint);font-family:'Inter';font-weight:600;color:var(--ink)}

/* —— capa —— */
.cover{page:cover;break-after:page}
.cover img{display:block;width:148mm;height:210mm;object-fit:cover}

/* —— avisos (página de copyright) —— */
.legal{break-after:page;padding-top:8mm}
.legal .k{font-family:'Inter';font-weight:600;font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--ember);margin-bottom:10px}
.legal h2{font-family:'Bricolage';font-weight:800;font-size:15pt;margin:0 0 .8em}
.legal p{font-size:9pt;color:var(--muted);text-align:left}
.legal .rule{height:1px;background:var(--hair);margin:14px 0}

/* —— sumário —— */
.toc{break-after:page;padding-top:6mm}
.toc h2{font-family:'Bricolage';font-weight:800;font-size:20pt;margin:0 0 1.2em}
.toc-item{display:flex;align-items:baseline;gap:14px;padding:.5em 0;border-bottom:1px solid var(--hair)}
.toc-num{font-family:'Bricolage';font-weight:800;font-size:12pt;color:var(--ember);min-width:22px}
.toc-title{font-family:'Inter';font-weight:600;font-size:11pt;color:var(--ink)}

/* —— introdução —— */
.intro{break-before:page}
.intro .k{font-family:'Inter';font-weight:600;font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--ember);margin-bottom:8px}
.intro h1{font-family:'Bricolage';font-weight:800;font-size:24pt;line-height:1.1;margin:0 0 .1em;color:var(--ink)}
.intro .chap-rule{width:54px;height:4px;background:var(--ember);border-radius:2px;margin:14px 0 22px}

/* —— aberturas de capítulo —— */
.chapter{break-before:page}
.chap-open{margin-bottom:22px}
.chap-eyebrow{font-family:'Inter';font-weight:600;font-size:8pt;letter-spacing:.16em;text-transform:uppercase;color:var(--ember)}
.chap-title{font-family:'Bricolage';font-weight:800;font-size:23pt;line-height:1.08;margin:6px 0 0;color:var(--ink)}
.chap-rule{width:54px;height:4px;background:var(--ember);border-radius:2px;margin:14px 0 0}
.chapter > p:first-of-type{margin-top:2px}
</style></head><body>

<div class="cover"><img src="${coverB64}" alt=""></div>

<div class="legal">
  <div class="k">Avisos importantes</div>
  ${avisosHtml}
</div>

<div class="toc">
  <h2>Sumário</h2>
  ${toc.map((t) => `<div class="toc-item"><span class="toc-num">${t.num}</span><span class="toc-title">${t.title}</span></div>`).join('\n  ')}
</div>

<section class="intro" id="intro">
  <div class="k">AffiliaCore · Edição 2026</div>
  <h1>Introdução</h1>
  <div class="chap-rule"></div>
  ${introHtml}
</section>

${chapters.map((c, i) => chapterHtml(c, i)).join('\n')}

</body></html>`;

const outHtml = join(HERE, 'build.html');
writeFileSync(outHtml, html);
console.log('build.html →', outHtml, `(${(html.length / 1024).toFixed(0)} KB)`);
console.log('capítulos:', chapters.map((c) => c.title.slice(0, 24)).join(' | '));
