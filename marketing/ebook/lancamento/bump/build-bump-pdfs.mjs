// Compila os docs do Kit de Operação (checklist + contrato .md) em PDFs A4
// diagramados na marca AffiliaCore (miolo claro, acentos ember, fontes reais,
// logo no cabeçalho). Emite os .html; o PDF sai via Edge --print-to-pdf.
// Rodar: node build-bump-pdfs.mjs  → depois imprimir os .html com o Edge.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const FONTS = join(HERE, '..', '..', '..', 'affiliacore', 'fonts');
const LOGO = join(HERE, '..', '..', '..', '..', 'landing', 'logo-light.svg');

const b64 = (p) => readFileSync(p).toString('base64');
const font = (f) => `data:font/woff2;base64,${b64(join(FONTS, `${f}.woff2`))}`;
const logoData = `data:image/svg+xml;base64,${b64(LOGO)}`;

function build(mdFile, outHtml) {
  let raw = readFileSync(join(HERE, mdFile), 'utf8').replace(/^﻿/, '').trim();
  const nl = raw.indexOf('\n');
  const title = raw.slice(0, nl).replace(/^#\s+/, '').trim();
  let body = raw.slice(nl + 1).trim();

  // bloco de assinatura: "____  ____" / "Agência  Divulgador" → HTML
  body = body.replace(/^_{5,}[_ ]*\r?\n([^\n]+?)\s{2,}([^\n]+?)\s*$/m, (m, a, b) =>
    `<div class="sigs"><div class="sig"><div class="sigline"></div><div class="siglabel">${a.trim()}</div></div><div class="sig"><div class="sigline"></div><div class="siglabel">${b.trim()}</div></div></div>`);

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
@font-face{font-family:'Bricolage';font-weight:800;src:url('${font('bricolage-grotesque-800')}') format('woff2')}
@font-face{font-family:'Bricolage';font-weight:500;src:url('${font('bricolage-grotesque-500')}') format('woff2')}
@font-face{font-family:'Inter';font-weight:400;src:url('${font('inter-400')}') format('woff2')}
@font-face{font-family:'Inter';font-weight:600;src:url('${font('inter-600')}') format('woff2')}
:root{--ember:#c4123b;--ember-d:#9f1239;--ink:#181013;--body:#2b2226;--muted:#6b5b61;--hair:#e7dee1;--tint:#fbf1f4}
@page{size:A4;margin:17mm 18mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:'Inter',sans-serif;font-size:10.5pt;line-height:1.55;color:var(--body);-webkit-print-color-adjust:exact;print-color-adjust:exact}
p{margin:0 0 .6em}
strong{color:var(--ink);font-weight:600}
a{color:var(--ember);text-decoration:none}
h2,h3,h4{font-family:'Bricolage';color:var(--ink);break-after:avoid;line-height:1.2}
h2{font-size:13pt;font-weight:800;margin:1.35em 0 .45em;padding-bottom:.2em;border-bottom:1px solid var(--hair)}
h3{font-size:11pt;font-weight:800;margin:1em 0 .35em;color:var(--ember-d)}
ul,ol{margin:.25em 0 .7em;padding-left:1.15em}
li{margin:.22em 0}
li::marker{color:var(--ember)}
li.task-list-item{list-style:none;margin-left:-1.05em}
li.task-list-item input[type=checkbox]{-webkit-appearance:none;appearance:none;width:12px;height:12px;border:1.5px solid var(--ember);border-radius:3px;margin-right:9px;vertical-align:-1px;flex:none}
blockquote{margin:.9em 0;padding:.6em 12px;border-left:3px solid var(--ember);background:var(--tint);color:var(--muted);border-radius:0 6px 6px 0}
blockquote p{margin:.2em 0}
blockquote strong{color:var(--ember-d)}
hr{border:none;border-top:1px solid var(--hair);margin:1.3em 0}
table{width:100%;border-collapse:collapse;margin:1em 0;font-size:9.4pt;break-inside:avoid}
th,td{border:1px solid var(--hair);padding:6px 9px;text-align:left;vertical-align:top}
th{background:var(--tint);font-weight:600;color:var(--ink)}
/* cabeçalho do doc */
.head{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:2px solid var(--ink);padding-bottom:12px;margin-bottom:18px}
.head .k{font-family:'Inter';font-weight:600;font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--ember)}
.head h1{font-family:'Bricolage';font-weight:800;font-size:17pt;line-height:1.12;margin:5px 0 0;color:var(--ink);max-width:15cm}
.head img{height:20px;flex:none;opacity:.92}
/* assinaturas */
.sigs{display:flex;gap:40px;margin:34px 0 8px}
.sig{flex:1}
.sigline{border-top:1.5px solid var(--ink);margin-bottom:6px}
.siglabel{font-weight:600;color:var(--ink);font-size:10pt}
</style></head><body>
<div class="head">
  <div><div class="k">Kit de Operação · AffiliaCore</div><h1>${title}</h1></div>
  <img src="${logoData}" alt="AffiliaCore">
</div>
${marked.parse(body, { breaks: true })}
</body></html>`;
  writeFileSync(join(HERE, outHtml), html);
  console.log(outHtml, `(${(html.length / 1024).toFixed(0)} KB)`);
}

build('checklist-compliance-peca.md', '_checklist.html');
build('modelo-contrato-subafiliado.md', '_contrato.html');
console.log('ok — imprimir os _*.html com Edge --print-to-pdf');
