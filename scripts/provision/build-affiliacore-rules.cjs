#!/usr/bin/env node
/**
 * P5.3 (produtização) · Gera `firestore.affiliacore.rules` — as rules do projeto
 * Firebase `affiliacore`, que hospeda DUAS coisas no MESMO banco `(default)`:
 *   1. a presença comercial (landing affiliacore.com.br → coleção `leads`);
 *   2. a instância DEMO do produto (fim-de-funil, decisão 2026-07-07) — que
 *      precisa das MESMAS rules da instância (`firestore.rules`).
 *
 * Um banco só aceita UM ruleset, então este script CONCATENA: firestore.rules
 * (fonte de verdade, evolui com o produto) + o bloco `leads` (create-only,
 * template abaixo). Sempre que `firestore.rules` mudar, regenere e re-deploye:
 *
 *   node scripts/provision/build-affiliacore-rules.cjs
 *   firebase deploy --config firebase.affiliacore.json --project www --only firestore
 *
 * NUNCA edite firestore.affiliacore.rules à mão (é sobrescrito aqui) e NUNCA
 * deploye o firestore.rules raiz no projeto affiliacore (apagaria o bloco leads).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'firestore.rules');
const OUT = path.join(ROOT, 'firestore.affiliacore.rules');

// Bloco `leads` — o form da landing grava via REST sem auth; NINGUÉM lê/edita/
// apaga pelo client (consulta é só pelo console / Admin SDK). Vale também p/ a
// demo: nem o admin da demo enxerga leads (read negado a todos). Whitelist de
// campos + tamanhos = mesmo contrato E2E-provado em prod (P5.4b, 2026-07-07).
const LEADS_BLOCK = `
    // === PRESENÇA COMERCIAL (landing affiliacore.com.br · P5.4b) =============
    // Form de leads: create-only anônimo com whitelist de campos; leitura/edição/
    // remoção NEGADAS a qualquer client (inclusive o admin da DEMO) — leads são
    // consultados só pelo console / Admin SDK do operador.
    match /leads/{leadId} {
      allow read, update, delete: if false;
      allow create: if
        request.resource.data.keys().hasOnly(['nome', 'whatsapp', 'afiliados', 'origem'])
        && request.resource.data.keys().hasAll(['nome', 'whatsapp'])
        && request.resource.data.nome is string
        && request.resource.data.nome.size() >= 2
        && request.resource.data.nome.size() <= 80
        && request.resource.data.whatsapp is string
        && request.resource.data.whatsapp.size() >= 8
        && request.resource.data.whatsapp.size() <= 25
        && (!('afiliados' in request.resource.data)
            || (request.resource.data.afiliados is string
                && request.resource.data.afiliados.size() <= 20))
        && (!('origem' in request.resource.data)
            || (request.resource.data.origem is string
                && request.resource.data.origem.size() <= 40));
    }
`;

const HEADER = `// ⚠️ ARQUIVO GERADO — NÃO EDITE À MÃO.
// Fonte: firestore.rules (rules da instância) + bloco \`leads\` (landing).
// Regenerar:  node scripts/provision/build-affiliacore-rules.cjs
// Deploy:     firebase deploy --config firebase.affiliacore.json --project www --only firestore
//
// Projeto \`affiliacore\` = presença comercial (leads da landing) + instância
// DEMO do produto no MESMO banco (default) — por isso o ruleset é a UNIÃO.
`;

function main() {
  const src = fs.readFileSync(SRC, 'utf8');

  // Sanidade da fonte: precisa ser o ruleset da instância.
  for (const marker of ["rules_version = '2'", 'match /users/{userId}', 'match /databases/{database}/documents {']) {
    if (!src.includes(marker)) throw new Error(`firestore.rules não parece o ruleset da instância (faltou: ${marker})`);
  }

  // Ponto de injeção: antes dos DOIS fechamentos finais (documents-match + service).
  const tail = src.match(/\}\s*\}\s*$/);
  if (!tail || tail.index === undefined) throw new Error('Não achei o fechamento final de firestore.rules.');

  const out = HEADER + src.slice(0, tail.index).replace(/\s+$/, '\n') + LEADS_BLOCK + '  }\n}\n';

  // Validações do output: bloco presente + chaves balanceadas.
  if (!out.includes('match /leads/') || !out.includes('match /users/')) {
    throw new Error('Output inválido: faltou o bloco leads ou as rules da instância.');
  }
  const opens = (out.match(/\{/g) || []).length;
  const closes = (out.match(/\}/g) || []).length;
  if (opens !== closes) throw new Error(`Output inválido: chaves desbalanceadas ({=${opens}, }=${closes}).`);

  fs.writeFileSync(OUT, out);
  console.log(`✔ ${path.basename(OUT)} regenerado (${out.split('\n').length} linhas) = firestore.rules + bloco leads.`);
}

main();
