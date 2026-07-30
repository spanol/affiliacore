#!/usr/bin/env node
/**
 * PREDEPLOY das firestore.rules — barra o deploy fora de ordem.
 *
 * POR QUE EXISTE (incidente 2026-07-30, Boost em produção): fechar uma coleção nas
 * rules só é seguro DEPOIS que o endpoint que passou a mediar a leitura está no ar.
 * `special_affiliates` foi fechada para `isAdmin()` enquanto o build em produção
 * ainda lia a coleção direto do client — resultado: todo afiliado especial logava e
 * não via equipe nenhuma, porque o `catch` do serviço engole o permission-denied e
 * devolve um mapa vazio. Falha SILENCIOSA: nada quebra na tela, o dado só some.
 *
 * A ordem correta é sempre:
 *   1. push do código  →  2. build do App Hosting no ar  →  3. deploy das rules
 *
 * COMO FUNCIONA: cada acoplamento abaixo declara "esta regra fechada depende deste
 * endpoint". Se o firestore.rules local já traz a regra na forma FECHADA, o script
 * bate no endpoint da instância alvo sem token:
 *   - 401  → o endpoint existe (requireAuth barrou)      → código no ar, pode subir
 *   - 200 text/html → caiu no fallback SPA do server.ts  → o endpoint NÃO existe
 *                                                          na build em produção
 * Sem token não há como um 200 legítimo acontecer, então o sinal é inequívoco.
 *
 * Escape hatch: SKIP_RULES_CODE_SYNC=1 (use ciente do que está pulando).
 */

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

// Instância por projeto Firebase. Instância nova entra AQUI (o playbook de
// provisionamento manda registrar) — projeto desconhecido barra o deploy de
// propósito: sem base URL não há como verificar, e passar batido reabre o incidente.
const INSTANCES = {
  'agencia-boost-app': 'https://agencyboost.com.br',
  'infinity-affiliacore': 'https://infinityaffiliates.agency',
};

// Acoplamentos regra→endpoint. `closed` é o trecho que só aparece quando a regra
// está na forma restrita; `endpoint` é quem passou a mediar a leitura.
const COUPLINGS = [
  {
    collection: 'special_affiliates',
    closed: /match \/special_affiliates\/\{[^}]+\} \{\s*allow read, write: if isAdmin\(\);/,
    endpoint: '/api/special-affiliates',
    why:
      'a tela do afiliado especial (/network) passa a ler a sub-rede por este endpoint;\n' +
      '     sem ele no ar, todo especial loga e não vê equipe nenhuma.',
  },
];

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  '';

// Sinaliza a falha SEM `process.exit()`: chamar exit com um socket do fetch ainda
// fechando derruba o libuv no Windows ("UV_HANDLE_CLOSING", exit 127) — o operador
// via um assert do Node em vez da instrução. Marca o exitCode e deixa o loop drenar.
class Barred extends Error {}
function fail(lines) {
  console.error('\n\x1b[31m✖ deploy das rules BARRADO\x1b[0m\n');
  for (const l of lines) console.error('  ' + l);
  console.error('');
  throw new Barred();
}

async function endpointIsLive(base, path) {
  const url = base.replace(/\/+$/, '') + path;
  let resp;
  try {
    resp = await fetch(url, { method: 'GET', redirect: 'manual' });
  } catch (e) {
    return { live: false, reason: `instância inacessível (${e.message})` };
  }
  if (resp.status === 401 || resp.status === 403) return { live: true };
  const ctype = String(resp.headers.get('content-type') || '');
  if (resp.status === 200 && ctype.includes('text/html')) {
    return { live: false, reason: 'caiu no fallback SPA (200 text/html) — a rota não existe nesta build' };
  }
  if (resp.status === 404) return { live: false, reason: 'HTTP 404 — a rota não existe nesta build' };
  // Qualquer outra coisa (500 do Admin SDK, 5xx do Cloud Run) não prova ausência,
  // mas também não prova presença: fail-closed.
  return { live: false, reason: `resposta inesperada (HTTP ${resp.status}, ${ctype || 'sem content-type'})` };
}

(async () => {
  if (process.env.SKIP_RULES_CODE_SYNC === '1') {
    console.log('· check de sincronia rules↔código PULADO (SKIP_RULES_CODE_SYNC=1)');
    return;
  }

  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const pending = COUPLINGS.filter((c) => c.closed.test(rules));
  if (pending.length === 0) {
    console.log('· nenhuma regra acoplada a endpoint está fechada — nada a verificar');
    return;
  }

  if (!projectId) {
    fail([
      'Não consegui identificar o projeto alvo (GCLOUD_PROJECT vazio).',
      'Rode pelo firebase CLI com --project <id>, ou exporte GCLOUD_PROJECT.',
    ]);
  }

  const base = INSTANCES[projectId];
  if (!base) {
    fail([
      `Projeto \x1b[1m${projectId}\x1b[0m não está no mapa de instâncias.`,
      '',
      `Estas rules fecham ${pending.map((c) => c.collection).join(', ')}, e isso só é seguro`,
      'com o código novo já no ar. Sem a base URL da instância não dá para verificar.',
      '',
      `Registre em scripts/predeploy/check-rules-code-sync.cjs → INSTANCES.`,
    ]);
  }

  console.log(`· verificando sincronia rules↔código em ${base} (${projectId})`);
  for (const c of pending) {
    const { live, reason } = await endpointIsLive(base, c.endpoint);
    if (!live) {
      fail([
        `A regra de \x1b[1m${c.collection}\x1b[0m está FECHADA neste firestore.rules, mas`,
        `\x1b[1m${c.endpoint}\x1b[0m não respondeu como esperado em ${base}:`,
        `     ${reason}`,
        '',
        `  Por quê importa: ${c.why}`,
        '',
        '  Ordem correta:',
        '     1. git push        (App Hosting builda e deploya)',
        '     2. confirme a build no ar',
        '     3. firebase deploy --only firestore:rules',
        '',
        '  Se você SABE o que está fazendo: SKIP_RULES_CODE_SYNC=1 firebase deploy ...',
      ]);
    }
    console.log(`  ✔ ${c.endpoint} está no ar — ${c.collection} pode fechar`);
  }
})().catch((e) => {
  process.exitCode = 1;
  if (!(e instanceof Barred)) console.error(`\n✖ check de sincronia falhou: ${e.message}\n`);
});
