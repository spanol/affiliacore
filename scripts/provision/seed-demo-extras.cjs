#!/usr/bin/env node
/**
 * SEED EXTRAS · demo "gigante" — gravação de mídia (emulador) E a instância DEMO
 * deployada que se mostra a cliente (projeto Firebase `affiliacore`).
 *
 * Roda DEPOIS do seed base (`seed-demo.cjs --wipe --yes`), que popula o núcleo
 * (dashboard/afiliados/auditoria/ranking/portal/avisos/prêmios/rede). Este script é
 * ADITIVO e faz duas coisas:
 *   1) INFLA a operação p/ parecer uma agência grande: +95 afiliados, +3 casas,
 *      +milhares de linhas de resultado (headline sobe p/ centenas de milhares/mês);
 *   2) POPULA os módulos que o seed base não cobre (branch feat/integracao-affility):
 *      carteira (payment_profiles + withdrawal_requests em TODOS os status, com casa),
 *      jurídico (legal_documents versionados + legal_acceptances), marketplace
 *      (deals direto E gerenciado + partnership_requests, inclusive a fila do
 *      gerente), links de divulgação (affiliate_links + link_click_stats +
 *      link_clicks + pool de standby), conquistas (achievement_tiers + requests),
 *      /solicitacoes nas 3 naturezas (lead + signup + indicação), settings
 *      (suporte + vitrine), integração configurada (esportiva-tap), avisos e
 *      notificações de todos os tipos, taxa com vigência/byBrand no afiliado demo,
 *      2º especial fromNetwork, link de rede do especial, contatos, mensagens
 *      diretas, trilha de auditoria rica e histórico de daily_rankings.
 *
 * Uso A — EMULADOR (gravação local, o caminho do dia a dia; `DEMO_FULL=1 npm run
 * dev` já faz isto por baixo):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=affiliacore \
 *   GOOGLE_CLOUD_PROJECT=affiliacore node scripts/provision/seed-demo-extras.cjs
 *
 * Uso B — INSTÂNCIA DEMO DEPLOYADA (Firestore REAL do projeto `affiliacore`, depois
 * do seed base; exige --live porque apaga coleções):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.affiliacore.json \
 *     node scripts/provision/seed-demo-extras.cjs --live --yes
 *
 * SEGURANÇA (o script APAGA coleções inteiras — ver OWN_COLLECTIONS):
 *   • Sem emulador e sem `--live --yes`, aborta. Escrever em Firestore real é
 *     sempre um gesto explícito, nunca o default de um comando digitado rápido.
 *   • GUARD DE PROJETO: o projeto tem que ser `affiliacore` (a demo). Um projeto de
 *     instância REAL de cliente (agencia-boost-app, infinity-affiliacore...) aborta:
 *     este script destrói dado de gestão de verdade.
 *   • `leads` (a landing divide o banco com a demo no projeto affiliacore) é
 *     PROTEGIDO: a contagem é conferida no fim e divergência é erro.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Guards + init
// ---------------------------------------------------------------------------
const has = (name) => process.argv.includes(`--${name}`);
const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const LIVE = has('live');

if (!EMULATOR && !(LIVE && has('yes'))) {
  console.error('ABORTADO: sem FIRESTORE_EMULATOR_HOST no ambiente.');
  console.error('Para semear a demo LOCAL, suba os emuladores (DEMO_FULL=1 npm run dev).');
  console.error('Para semear a instância DEMO deployada (Firestore real do projeto affiliacore),');
  console.error('confirme com: --live --yes');
  process.exit(1);
}

// Projeto: no emulador vem das envs; no modo --live sai do service account (é a
// credencial que decide onde escreve, então é dela que o guard tem que ler).
function resolveLiveProject() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY).project_id; } catch { /* segue */ }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try { return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')).project_id; } catch { /* segue */ }
  }
  return process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || null;
}
const PROJECT = EMULATOR
  ? (process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'affiliacore')
  : resolveLiveProject();
if (PROJECT !== 'affiliacore') {
  console.error(`ABORTADO: projeto "${PROJECT}" != "affiliacore" (a instância DEMO).`);
  console.error('Este script APAGA coleções inteiras: jamais aponte para o projeto de um cliente.');
  process.exit(1);
}

if (EMULATOR) {
  admin.initializeApp({ projectId: PROJECT });
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
} else {
  admin.initializeApp(); // GOOGLE_APPLICATION_CREDENTIALS
}
const db = admin.firestore();
const { Timestamp, FieldValue } = admin.firestore;
console.log(EMULATOR
  ? `Modo: EMULADOR (${process.env.FIRESTORE_EMULATOR_HOST})`
  : 'Modo: --live · Firestore REAL do projeto affiliacore (instância DEMO)');

// ---------------------------------------------------------------------------
// Utilitários determinísticos (mesma pegada do seed base)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260722);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const money = (v) => Math.round(v * 100) / 100;
const slugify = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const affId = (name) => `boost_demo-${slugify(name)}`;
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const normNameKey = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const today = new Date();
const WINDOW = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29)); // hoje-29 .. hoje
const daysAgoTs = (n) => Timestamp.fromDate(addDays(today, -n));

async function commitChunked(writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((fn) => fn(batch));
    await batch.commit();
  }
}
async function deleteCollection(name) {
  let total = 0;
  for (;;) {
    const snap = await db.collection(name).limit(300).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Pools de dados fictícios
// ---------------------------------------------------------------------------
const FIRST = [
  'Gabriel', 'Mateus', 'Enzo', 'Davi', 'Arthur', 'Bernardo', 'Heitor', 'Lorenzo', 'Théo', 'Gael',
  'Leonardo', 'Rafael', 'Nicolas', 'Samuel', 'Pietro', 'Vicente', 'Benjamin', 'Miguel', 'Gustavo', 'Fernando',
  'Rodrigo', 'Eduardo', 'Ricardo', 'Marcelo', 'Alexandre', 'Vinícius', 'Matheus', 'Caio', 'Danilo', 'Rogério',
  'Wesley', 'Anderson', 'Fábio', 'Márcio', 'Emanuel', 'Sérgio', 'Cláudio', 'Anthony', 'Ravi', 'Benício',
  'Helena', 'Alice', 'Laura', 'Manuela', 'Sophia', 'Isabella', 'Heloísa', 'Valentina', 'Cecília', 'Giovanna',
  'Beatriz', 'Mariana', 'Letícia', 'Júlia', 'Fernanda', 'Patrícia', 'Aline', 'Bruna', 'Carolina', 'Débora',
  'Priscila', 'Vanessa', 'Simone', 'Adriana', 'Cristina', 'Kelly', 'Natália', 'Sabrina', 'Viviane', 'Tatiane',
];
const LAST = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes',
  'Costa', 'Ribeiro', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha',
  'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Cardoso', 'Ramos', 'Gonçalves',
  'Santana', 'Teixeira', 'Araújo', 'Cavalcanti', 'Monteiro', 'Moura', 'Cunha', 'Pinto', 'Duarte', 'Campos',
  'Farias', 'Azevedo', 'Batista', 'Brito', 'Correia',
];
const CIDADES = ['São Paulo/SP', 'Rio de Janeiro/RJ', 'Belo Horizonte/MG', 'Curitiba/PR', 'Porto Alegre/RS', 'Salvador/BA', 'Recife/PE', 'Fortaleza/CE', 'Goiânia/GO', 'Campinas/SP'];
const RUAS = ['Rua das Palmeiras', 'Av. Brasil', 'Rua XV de Novembro', 'Av. Paulista', 'Rua do Comércio', 'Av. Getúlio Vargas', 'Rua Sete de Setembro', 'Av. Rio Branco'];

// Casas extras (manuais). defaultCpa em EUR (convenção /casas), defaultRev em %.
// A Esportiva entra COM conector (integrations/esportiva-tap) p/ mostrar o pull
// automático — espelha o setup real da Infinity.
// A moeda + o regime de cotação (17/08) aparecem aqui p/ a demo mostrar os TRÊS
// casos: euro pela cotação do dia (a convenção antiga), dólar com cotação FIXA e
// real sem conversão. Casa sem os campos resolve como euro/do dia, como sempre.
const EXTRA_HOUSES = [
  { slug: 'kto', name: 'KTO', defaultCpa: 20, defaultRev: 30 },
  { slug: 'novibet', name: 'Novibet', defaultCpa: 19, defaultRev: 28, cpaCurrency: 'USD', fxMode: 'fixed', fxRate: 5.4 },
  { slug: 'vaidebet', name: 'Vai de Bet', defaultCpa: 17, defaultRev: 25 },
  { slug: 'esportiva', name: 'Esportiva Bet', defaultCpa: 120, defaultRev: 26, cpaCurrency: 'BRL' },
];
// Tag `afp` de propósito: está em TAG_PARAMS (src/lib/linkTriage.ts) — a triagem
// de /links reconhece a tag em uso; `wm` não seria reconhecida.
const REGISTER_URL = {
  superbet: 'https://superbet.bet.br/cadastro',
  betano: 'https://www.betano.bet.br/register',
  betmgm: 'https://br.betmgm.com/cadastro',
  kto: 'https://www.kto.bet.br/cadastro',
  novibet: 'https://www.novibet.bet.br/registo',
  vaidebet: 'https://vaidebet.bet.br/cadastro',
  esportiva: 'https://esportiva.bet.br/cadastro',
};
const HOUSE_NAME = { superbet: 'Superbet', betano: 'Betano', betmgm: 'BetMGM', kto: 'KTO', novibet: 'Novibet', vaidebet: 'Vai de Bet', esportiva: 'Esportiva Bet' };

const fakeCpf = () => `${between(100, 999)}.${between(100, 999)}.${between(100, 999)}-${between(10, 99)}`;
const fakeCnpj = () => `${between(10, 99)}.${between(100, 999)}.${between(100, 999)}/0001-${between(10, 99)}`;
const fakeAddress = () => `${pick(RUAS)}, ${between(10, 1999)} - ${pick(CIDADES)}`;

// ---------------------------------------------------------------------------
async function main() {
  console.log('== SEED EXTRAS (demo gigante) ==');

  // `leads` (formulário da landing) divide o banco com a demo no projeto
  // affiliacore. O script não o toca, e a contagem antes/depois PROVA isso —
  // declarar sem verificar é o erro que a casa não repete (ver CLAUDE.md).
  const leadsBefore = (await db.collection('leads').count().get()).data().count;
  if (!EMULATOR) console.log(`  leads da landing protegidos: ${leadsBefore} docs`);

  // 0) Limpeza defensiva das coleções que o seed base NÃO conhece (p/ re-run) +
  //    afiliados extras de uma rodada anterior (marcados demoExtra).
  // Coleções 100% dos extras (o seed base não grava nelas): deletar inteiro é
  // seguro e é o que torna o re-run idempotente (os links têm code aleatório).
  const OWN_COLLECTIONS = [
    'deals', 'partnership_requests', 'legal_documents', 'legal_acceptances', 'withdrawal_requests',
    'achievement_tiers', 'achievement_requests', 'affiliate_referrals', 'integrations',
    'affiliate_links', 'link_click_stats', 'link_clicks', 'affiliate_tag_aliases',
  ];
  for (const col of OWN_COLLECTIONS) {
    const n = await deleteCollection(col);
    if (n) console.log(`  limpo ${col}: ${n}`);
  }
  {
    const prev = await db.collection('affiliates').where('demoExtra', '==', true).get();
    if (!prev.empty) {
      const ids = prev.docs.map((d) => d.id);
      const w = [];
      ids.forEach((id) => {
        w.push((b) => b.delete(db.collection('affiliates').doc(id)));
        w.push((b) => b.delete(db.collection('affiliate_statuses').doc(id)));
        w.push((b) => b.delete(db.collection('affiliate_configs').doc(id)));
      });
      await commitChunked(w);
      // house_results dos extras
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10);
        const hr = await db.collection('house_results').where('affiliateId', 'in', chunk).get();
        const wb = [];
        hr.docs.forEach((d) => wb.push((b) => b.delete(d.ref)));
        await commitChunked(wb);
      }
      console.log(`  limpo afiliados extras anteriores: ${ids.length}`);
    }
  }

  // 1) Lê o estado base (afiliados + casas + usuários cliente)
  const baseAffSnap = await db.collection('affiliates').get();
  const baseNames = {}; // id -> name
  baseAffSnap.forEach((d) => { const v = d.data(); if (v?.name) baseNames[d.id] = String(v.name); });
  const baseCfgSnap = await db.collection('affiliate_configs').get();
  const baseProducerIds = baseCfgSnap.docs.map((d) => d.id).filter((id) => baseNames[id]);
  const usersSnap = await db.collection('users').get();
  const clientUsers = usersSnap.docs.map((d) => ({ uid: d.id, ...(d.data()) }))
    .filter((u) => u.role === 'client' && u.affiliateId);
  const adminUid = (usersSnap.docs.find((d) => d.data()?.role === 'admin')?.id) || 'demo-admin';
  const demoAfiliado = clientUsers.find((u) => !u.isSpecial) || null;
  const especialUser = clientUsers.find((u) => u.isSpecial) || null;
  const especialUserUid = especialUser ? especialUser.uid : null;
  const especialAffiliateId = especialUser ? especialUser.affiliateId : null;
  console.log(`  base: ${Object.keys(baseNames).length} afiliados, ${baseProducerIds.length} com config, ${clientUsers.length} logins cliente`);

  const HOUSE_SLUGS = ['superbet', 'betano', 'betmgm', ...EXTRA_HOUSES.map((h) => h.slug)];
  const writes = [];

  // 2) Casas: adiciona as extras + carimba registerUrlTemplate em TODAS (p/ links ativos)
  EXTRA_HOUSES.forEach((h, i) => writes.push((b) => b.set(db.collection('houses').doc(h.slug), {
    slug: h.slug, name: h.name, brandId: null, logo: null,
    registerUrlTemplate: `${REGISTER_URL[h.slug]}?afp={affiliateId}`,
    active: true, order: 10 + i, dataSource: 'manual',
    // vínculo casa↔integração é 1:1 e vive nos DOIS docs (applyIntegrationLink):
    // aqui a flag da casa; o alvo (houseId) vai no doc integrations/esportiva-tap.
    ...(h.slug === 'esportiva' ? {
      integration: 'esportiva-tap',
      // Fila de tags sem dono do robô (§12): a casa reportou produção com tags que
      // não são de ninguém. Sem isto semeado, a demo abre o card da casa integrada
      // sem o aviso e a feature fica invisível para quem está avaliando o produto.
      pendingTags: [
        { tag: 'infinitw02', days: 3, registrations: 4, first_deposits: 2, qualified_cpa: 2, total_commission: 220 },
        { tag: 'promo-julho', days: 1, registrations: 1, first_deposits: 1, qualified_cpa: 1, total_commission: 110 },
      ],
      pendingTagsAt: daysAgoTs(0),
    } : {}),
    defaultCpa: h.defaultCpa, defaultRev: h.defaultRev,
    cpaCurrency: h.cpaCurrency ?? 'EUR',
    fxMode: h.fxMode ?? 'live',
    fxRate: h.fxRate ?? null,
    createdByUid: adminUid, createdAt: daysAgoTs(65), updatedAt: daysAgoTs(65),
  })));
  ['superbet', 'betano', 'betmgm'].forEach((slug) => writes.push((b) => b.set(
    db.collection('houses').doc(slug),
    { registerUrlTemplate: `${REGISTER_URL[slug]}?afp={affiliateId}`, updatedAt: daysAgoTs(40) },
    { merge: true },
  )));

  // 3) Afiliados extras (gigante): nomes únicos que não colidem com a base
  const usedNames = new Set(Object.values(baseNames).map((n) => n.toLowerCase()));
  const extraNames = [];
  let guard = 0;
  while (extraNames.length < 95 && guard < 5000) {
    guard++;
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (usedNames.has(name.toLowerCase())) continue;
    usedNames.add(name.toLowerCase());
    extraNames.push(name);
  }
  // Tiers de produção: big / mid / small / quiet(sem produção)
  const EXTRA = extraNames.map((name, i) => {
    let tier;
    if (i < 12) tier = 'big';
    else if (i < 45) tier = 'mid';
    else if (i < 65) tier = 'small';
    else tier = 'quiet';
    return { name, id: affId(name), tier };
  });
  const extraProducers = EXTRA.filter((e) => e.tier !== 'quiet');

  EXTRA.forEach((e, i) => {
    const primary = e.tier === 'quiet' ? null : pick(HOUSE_SLUGS);
    writes.push((b) => b.set(db.collection('affiliates').doc(e.id), {
      id: e.id, name: e.name,
      brand: primary ? { name: HOUSE_NAME[primary] } : null,
      source: 'boost', demoExtra: true,
      createdByUid: adminUid, createdAt: daysAgoTs(80 - (i % 60)),
    }));
    const inactive = e.tier === 'quiet' && i % 7 === 0;
    writes.push((b) => b.set(db.collection('affiliate_statuses').doc(e.id), {
      status: inactive ? 'inactive' : 'active', updatedAt: daysAgoTs(between(3, 25)),
    }));
    if (e.tier !== 'quiet') {
      writes.push((b) => b.set(db.collection('affiliate_configs').doc(e.id), {
        affiliateId: e.id, cpaValue: between(40, 75), revPercentage: between(12, 30), updatedAt: daysAgoTs(between(10, 40)),
      }));
    }
  });

  // 4) house_results dos extras (plausíveis; reg >= ftd >= cpa por célula)
  const TIER_CFG = {
    big: { houses: [2, 3], activeDays: [14, 22], ftdMax: 7 },
    mid: { houses: [1, 2], activeDays: [8, 16], ftdMax: 4 },
    small: { houses: [1, 1], activeDays: [5, 10], ftdMax: 2 },
  };
  let extraRows = 0;
  for (const p of extraProducers) {
    const cfg = TIER_CFG[p.tier];
    const nHouses = between(cfg.houses[0], cfg.houses[1]);
    const houses = [...HOUSE_SLUGS].sort(() => rnd() - 0.5).slice(0, nHouses);
    for (const slug of houses) {
      const nDays = between(cfg.activeDays[0], cfg.activeDays[1]);
      const days = [...WINDOW].sort(() => rnd() - 0.5).slice(0, nDays);
      for (const d of days) {
        const weekend = [0, 5, 6].includes(d.getDay()) ? 1.3 : 1;
        const ftd = Math.max(1, Math.round((1 + rnd() * cfg.ftdMax) * weekend));
        const cpa = Math.min(ftd, Math.round(ftd * (0.4 + rnd() * 0.35)));
        const regExtra = between(1, 3 + Math.round(cfg.ftdMax * weekend));
        const registrations = ftd + regExtra;
        const commission = money(ftd * (110 + rnd() * 150));
        const rvs = money(ftd * (6 + rnd() * 18));
        const deposit = money(ftd * (180 + rnd() * 350) + regExtra * (15 + rnd() * 50));
        const docId = `${slug}__${toISO(d)}__${p.id}`.replace(/\//g, '_');
        writes.push((b) => b.set(db.collection('house_results').doc(docId), {
          houseSlug: slug, date: toISO(d), affiliateId: p.id,
          registrations, first_deposits: ftd, qualified_cpa: cpa,
          rvs, deposit, total_commission: commission,
          importedByUid: adminUid, importedAt: Timestamp.fromDate(addDays(new Date(`${toISO(d)}T12:00:00`), 1)),
        }));
        extraRows++;
      }
    }
  }

  // Roster de "produtores pagáveis" = base (com config) + extras produtores
  const payableProducers = [
    ...baseProducerIds.map((id) => ({ id, name: baseNames[id] })),
    ...extraProducers.map((p) => ({ id: p.id, name: p.name })),
  ];

  // 5) payment_profiles (~65% dos pagáveis + os 2 logins cliente)
  const withProfile = new Set();
  const ensureProfile = (id, name) => {
    if (withProfile.has(id)) return;
    withProfile.add(id);
    const isCnpj = rnd() < 0.25;
    const pixTypes = ['cpf', 'email', 'telefone', 'aleatoria'];
    const pixKeyType = isCnpj ? 'cnpj' : pick(pixTypes);
    const pixKey = pixKeyType === 'email' ? `${slugify(name)}@gmail.com`
      : pixKeyType === 'telefone' ? `+55${between(11, 99)}9${between(10000000, 99999999)}`
        : pixKeyType === 'aleatoria' ? crypto.randomUUID()
          : isCnpj ? fakeCnpj() : fakeCpf();
    writes.push((b) => b.set(db.collection('payment_profiles').doc(id), {
      pixKeyType, pixKey,
      documentType: isCnpj ? 'cnpj' : 'cpf',
      document: isCnpj ? fakeCnpj() : fakeCpf(),
      legalName: name, address: fakeAddress(),
      updatedAt: daysAgoTs(between(5, 30)),
    }));
  };
  payableProducers.forEach((p) => { if (rnd() < 0.65) ensureProfile(p.id, p.name); });
  clientUsers.forEach((u) => ensureProfile(u.affiliateId, baseNames[u.affiliateId] || u.name || u.affiliateId));

  // 6) withdrawal_requests (mix de status). Snapshot do PIX quando há perfil.
  const profileById = new Map();
  // reconstrói os perfis que acabamos de gerar (p/ pixSnapshot) — varre os writes seria
  // frágil; então geramos o snapshot na hora a partir de um lookup simples.
  const pixSnapshotFor = (id, name) => ({ pixKeyType: 'cpf', pixKey: fakeCpf(), documentType: 'cpf', document: fakeCpf(), legalName: name });
  const STATUS_POOL = ['requested', 'requested', 'approved', 'paid', 'paid', 'paid', 'rejected'];
  // `house`: slug (vira houseKey/houseLabel — sem ele a linha sai "Casa não
  // informada" e o filtro por casa do /saques fica vazio). null = dado legado,
  // que vale manter em 1-2 saques p/ exercitar o placeholder.
  const mkWithdrawal = (id, name, amount, status, ageDays, note, house) => {
    const ref = db.collection('withdrawal_requests').doc();
    const decided = status !== 'requested';
    writes.push((b) => b.set(ref, {
      affiliateId: id, amount: money(amount), status,
      note: note || null,
      ...(house ? { houseKey: house, houseLabel: HOUSE_NAME[house] } : {}),
      pixSnapshot: withProfile.has(id) ? pixSnapshotFor(id, name) : null,
      requestedByUid: adminUid,
      requestedAt: daysAgoTs(ageDays),
      ...(decided ? { decidedByUid: adminUid, decidedAt: daysAgoTs(Math.max(0, ageDays - between(1, 4))) } : {}),
    }));
  };
  // muitos saques espalhados pelos pagáveis com perfil
  let wCount = 0;
  payableProducers.forEach((p) => {
    if (!withProfile.has(p.id)) return;
    const n = between(0, 3);
    for (let k = 0; k < n; k++) {
      mkWithdrawal(p.id, p.name, between(400, 12000) + rnd(), pick(STATUS_POOL), between(1, 55),
        rnd() < 0.4 ? `Referente a ${pick(['junho', 'julho', 'quinzena', 'fechamento mensal'])}` : null,
        pick(HOUSE_SLUGS));
      wCount++;
    }
  });
  // carteira RICA p/ o afiliado demo (Yago): garante cards Pendente/Aprovado/Pago
  if (demoAfiliado) {
    const id = demoAfiliado.affiliateId;
    const nm = baseNames[id] || 'Afiliado';
    ensureProfile(id, nm);
    mkWithdrawal(id, nm, 2450.00, 'paid', 40, 'Referente a maio', null); // legado sem casa
    mkWithdrawal(id, nm, 3120.50, 'paid', 22, 'Referente a junho', 'superbet');
    mkWithdrawal(id, nm, 1890.00, 'approved', 6, 'Fechamento quinzenal', 'betano');
    mkWithdrawal(id, nm, 2760.00, 'requested', 1, 'Referente a julho', 'superbet');
    mkWithdrawal(id, nm, 500.00, 'rejected', 33, 'Valor abaixo do mínimo combinado', 'kto');
    wCount += 5;
  }

  // 7) deals (marketplace) — variados, quase todos ativos. `type` explícito
  // (dealType.ts): 'direto' é o default de leitura; os 'gerenciado' exercitam a
  // política da Infinity (CPA oculto do afiliado, baseline/rollover/GGR no card,
  // "quem precifica é o gerente"). Gerenciado ATIVO exige baseline > 0.
  const DEALS = [
    { slug: 'superbet', model: 'cpa', cpaValue: 250, revPercentage: 0, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true, type: 'direto', minCpaGoal: 5 },
    { slug: 'superbet', model: 'hybrid', cpaValue: 150, revPercentage: 20, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true, type: 'direto' },
    { slug: 'betano', model: 'revshare', cpaValue: 0, revPercentage: 35, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true, type: 'direto' },
    { slug: 'betmgm', model: 'cpa', cpaValue: 220, revPercentage: 0, cycle: 'quinzenal', currency: 'BRL', geo: 'Brasil', active: true, type: 'direto' },
    { slug: 'kto', model: 'hybrid', cpaValue: 180, revPercentage: 25, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true, type: 'direto' },
    { slug: 'kto', model: 'revshare', cpaValue: 0, revPercentage: 40, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true, type: 'direto' },
    { slug: 'novibet', model: 'cpa', cpaValue: 200, revPercentage: 0, cycle: 'semanal', currency: 'BRL', geo: 'Brasil', active: true, type: 'direto' },
    { slug: 'vaidebet', model: 'cpa', cpaValue: 190, revPercentage: 0, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: false, type: 'direto' },
    { slug: 'betano', model: 'cpa', cpaValue: 210, revPercentage: 0, cycle: 'mensal', currency: 'EUR', geo: 'Brasil', active: false, type: 'direto' },
    { slug: 'novibet', model: 'hybrid', cpaValue: 160, revPercentage: 22, cycle: 'quinzenal', currency: 'BRL', geo: 'Brasil', active: true, type: 'direto' },
    // Ciclo D30+ e meta mínima de CPA (pedido da Infinity, 17/08/2026): a demo tem
    // que mostrar os dois, senão o card e o modal seguem parecendo os de antes.
    { slug: 'kto', model: 'cpa', cpaValue: 240, revPercentage: 0, cycle: 'd30mais', currency: 'BRL', geo: 'Brasil', active: true, type: 'direto', minCpaGoal: 3 },
    // Acordo em DÓLAR com cotação FIXA (17/08): a conversão p/ R$ acontece na
    // aprovação da parceria e congela ali. Ver src/lib/currency.ts.
    { slug: 'novibet', model: 'cpa', cpaValue: 45, revPercentage: 0, cycle: 'mensal', currency: 'USD', geo: 'Brasil', active: true, type: 'direto', minCpaGoal: 4, fxMode: 'fixed', fxRate: 5.4 },
    // ...e um em EURO pela cotação do dia, o outro regime.
    { slug: 'betmgm', model: 'hybrid', cpaValue: 30, revPercentage: 15, cycle: 'quinzenal', currency: 'EUR', geo: 'Portugal', active: true, type: 'direto', fxMode: 'live' },
    { slug: 'esportiva', model: 'cpa', cpaValue: 300, revPercentage: 0, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true, type: 'gerenciado', baseline: 2500, rollover: 2, ggrPercentage: null, minCpaGoal: 10, redepositRate: 30 },
    { slug: 'vaidebet', model: 'hybrid', cpaValue: 250, revPercentage: 20, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true, type: 'gerenciado', baseline: 1500, rollover: 3, ggrPercentage: 30, redepositRate: 25 },
  ];
  const MODEL_LABEL = { cpa: 'CPA', revshare: 'RevShare', hybrid: 'Híbrido' };
  const CYCLE_LABEL = { semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', d30mais: 'D30+' };
  const dealLabel = (d) => [HOUSE_NAME[d.slug], MODEL_LABEL[d.model], CYCLE_LABEL[d.cycle], d.currency, d.geo]
    .filter((p) => p && String(p).length).join(' - ');
  const dealDocs = DEALS.map((d, i) => {
    const id = `demo-deal-${i + 1}`;
    writes.push((b) => b.set(db.collection('deals').doc(id), {
      houseId: d.slug, operatorName: HOUSE_NAME[d.slug], model: d.model,
      cpaValue: d.cpaValue, revPercentage: d.revPercentage, cycle: d.cycle,
      currency: d.currency, geo: d.geo, active: d.active, order: i,
      type: d.type, minCpaGoal: d.minCpaGoal ?? 0,
      // Taxa de redepósito (% dos FTDs). Semeada porque é KPI de vitrine: sem dado,
      // a demo abriria o card sem a linha e a feature ficaria invisível ao lead.
      redepositRate: d.redepositRate ?? 0,
      fxMode: d.fxMode ?? 'none', fxRate: d.fxRate ?? null,
      ...(d.type === 'gerenciado' ? { baseline: d.baseline, rollover: d.rollover, ggrPercentage: d.ggrPercentage ?? null } : {}),
      label: dealLabel(d), createdByUid: adminUid,
      createdAt: daysAgoTs(60 - i), updatedAt: daysAgoTs(between(1, 30)),
    }));
    return { id, ...d, operatorName: HOUSE_NAME[d.slug], label: dealLabel(d) };
  });
  const activeDeals = dealDocs.filter((d) => d.active && d.type !== 'gerenciado');
  const managedDeals = dealDocs.filter((d) => d.active && d.type === 'gerenciado');

  // 8) parcerias + affiliate_links (aprovadas emitem link com cliques)
  const linkStatsWrites = []; // adiados p/ depois (dependem dos codes)
  const rawClickWrites = [];
  const mkLink = (code, id, slug, dealId, clicks) => {
    const botClicks = Math.round(clicks * (0.05 + rnd() * 0.1));
    writes.push((b) => b.set(db.collection('affiliate_links').doc(code), {
      code, affiliateId: id, brandId: slug, // casa manual => brandKey == slug
      registerUrl: `${REGISTER_URL[slug]}?wm=${id}`,
      dealId, active: true, clicks, botClicks,
      createdByUid: adminUid, createdAt: daysAgoTs(between(10, 40)),
      updatedAt: daysAgoTs(0), lastClickAt: daysAgoTs(between(0, 3)),
    }));
    // série diária de cliques (~30 dias) somando ~clicks
    let remaining = clicks, remBot = botClicks;
    WINDOW.forEach((d, j) => {
      const isLast = j === WINDOW.length - 1;
      const c = isLast ? remaining : Math.min(remaining, between(0, Math.ceil(clicks / 12)));
      const bc = isLast ? remBot : Math.min(remBot, between(0, 2));
      remaining -= c; remBot -= bc;
      if (c === 0 && bc === 0) return;
      linkStatsWrites.push((b) => b.set(db.collection('link_click_stats').doc(`${code}__${toISO(d)}`), {
        code, affiliateId: id, brandId: slug, date: toISO(d),
        clicks: c, botClicks: bc, updatedAt: Timestamp.fromDate(d),
      }));
    });
    // amostra de cliques crus recentes
    const nRaw = Math.min(6, clicks);
    for (let r = 0; r < nRaw; r++) {
      const cid = crypto.randomBytes(12).toString('hex');
      rawClickWrites.push((b) => b.set(db.collection('link_clicks').doc(cid), {
        clickId: cid, code, affiliateId: id, brandId: slug, isBot: false,
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
        referer: pick(['https://instagram.com/', 'https://t.me/', 'https://wa.me/', '']),
        ipHash: crypto.randomBytes(8).toString('hex'),
        ts: daysAgoTs(between(0, 20)),
      }));
    }
  };

  const PART_STATUS = ['approved', 'approved', 'approved', 'requested', 'rejected', 'discontinued'];
  let partCount = 0, linkCount = 0;
  // cada produtor pagável pede 0-2 parcerias em deals ativos aleatórios
  payableProducers.forEach((p) => {
    const n = between(0, 2);
    const chosen = [...activeDeals].sort(() => rnd() - 0.5).slice(0, n);
    chosen.forEach((deal) => {
      const status = pick(PART_STATUS);
      const ref = db.collection('partnership_requests').doc();
      let code = null;
      if (status === 'approved') {
        code = crypto.randomBytes(6).toString('base64url');
        mkLink(code, p.id, deal.slug, deal.id, between(60, 3200));
        linkCount++;
      }
      writes.push((b) => b.set(ref, {
        affiliateId: p.id, dealId: deal.id, status, code,
        operatorName: deal.operatorName, dealLabel: deal.label, houseId: deal.slug,
        requestedByUid: adminUid, requestedAt: daysAgoTs(between(5, 45)),
        ...(status !== 'requested' ? { decidedByUid: adminUid, decidedAt: daysAgoTs(between(1, 20)) } : {}),
      }));
      partCount++;
    });
  });
  // parcerias garantidas p/ o afiliado demo (Yago) — MyLinks rico
  if (demoAfiliado) {
    const id = demoAfiliado.affiliateId;
    [['superbet', 0], ['kto', 4], ['novibet', 6]].forEach(([slug, di]) => {
      const deal = dealDocs.find((d) => d.slug === slug && d.active) || activeDeals[di] || activeDeals[0];
      const code = crypto.randomBytes(6).toString('base64url');
      mkLink(code, id, deal.slug, deal.id, between(400, 2600));
      linkCount++;
      writes.push((b) => b.set(db.collection('partnership_requests').doc(), {
        affiliateId: id, dealId: deal.id, status: 'approved', code,
        operatorName: deal.operatorName, dealLabel: deal.label, houseId: deal.slug,
        requestedByUid: adminUid, requestedAt: daysAgoTs(between(10, 30)),
        decidedByUid: adminUid, decidedAt: daysAgoTs(between(2, 8)),
      }));
      partCount++;
    });
    // uma solicitada (pendente) p/ mostrar o estado
    writes.push((b) => b.set(db.collection('partnership_requests').doc(), {
      affiliateId: id, dealId: activeDeals[2].id, status: 'requested', code: null,
      operatorName: activeDeals[2].operatorName, dealLabel: activeDeals[2].label, houseId: activeDeals[2].slug,
      requestedByUid: adminUid, requestedAt: daysAgoTs(1),
    }));
    partCount++;
  }
  // Parcerias em deal GERENCIADO, vindas de filhos DIRETOS da especial (Igor e
  // Carla estão na lista da Ana): o par de estados do fluxo do gerente. A
  // `requested` é a fila dele ("quem precifica é o gerente"); a `priced` é a que
  // ele já precificou e espera o master emitir o link — sem ela a aba
  // "Aguardando link" do /acordos abre vazia.
  if (managedDeals.length) {
    const md = managedDeals[0];
    writes.push((b) => b.set(db.collection('partnership_requests').doc('demo-part-gerenciado'), {
      affiliateId: affId('Igor Santana'), dealId: md.id, status: 'requested', code: null,
      operatorName: md.operatorName, dealLabel: md.label, houseId: md.slug,
      requestedByUid: adminUid, requestedAt: daysAgoTs(2),
    }));
    partCount++;
    const priced = managedDeals[1] || md;
    writes.push((b) => b.set(db.collection('partnership_requests').doc('demo-part-precificado'), {
      affiliateId: affId('Carla Menezes'), dealId: priced.id, status: 'priced', code: null,
      operatorName: priced.operatorName, dealLabel: priced.label, houseId: priced.slug,
      requestedByUid: adminUid, requestedAt: daysAgoTs(4),
      // taxa definida pelo GERENTE (não pelo deal): aprovar daqui NÃO reescreve a
      // taxa, senão o spread dele seria apagado sem erro na tela.
      pricedByUid: especialUserUid, pricedByAffiliateId: especialAffiliateId, pricedAt: daysAgoTs(3),
    }));
    partCount++;
  }

  // 9) Jurídico versionado + aceites
  const LEGAL = [
    {
      slug: 'acordo-de-afiliacao', title: 'Acordo de Afiliação', version: 2,
      content: 'ACORDO DE AFILIAÇÃO\n\n1. OBJETO\nEste acordo regula a relação entre a Agência e o Afiliado para a divulgação de operadoras parceiras.\n\n2. COMISSÃO\nA remuneração segue o modelo (CPA, RevShare ou híbrido) e as taxas definidas por casa e por afiliado no painel, podendo ser revistas mediante aviso.\n\n3. CONDUTA\nÉ vedada a captação por meios enganosos, spam ou uso indevido da marca das operadoras.\n\n4. PAGAMENTOS\nOs pagamentos são realizados via PIX na chave cadastrada, mediante nota fiscal quando aplicável.\n\n5. VIGÊNCIA\nO acordo vigora por prazo indeterminado, podendo ser encerrado por qualquer das partes.',
    },
    {
      slug: 'codigo-de-conduta', title: 'Código de Conduta', version: 1,
      content: 'CÓDIGO DE CONDUTA\n\nO Afiliado compromete-se a atuar com transparência, respeitar as diretrizes de jogo responsável e não direcionar comunicação a menores de 18 anos. O descumprimento pode acarretar suspensão da conta e retenção de comissões.',
    },
    {
      slug: 'politica-de-pagamentos', title: 'Política de Pagamentos', version: 1,
      content: 'POLÍTICA DE PAGAMENTOS\n\nO fechamento é apurado por período. O saque é solicitado pelo Afiliado e aprovado pela Agência, que realiza a transferência via PIX. Valores mínimos e prazos podem ser definidos por operação.',
    },
  ];
  LEGAL.forEach((doc) => writes.push((b) => b.set(db.collection('legal_documents').doc(`demo-legal-${doc.slug}`), {
    slug: doc.slug, title: doc.title, content: doc.content, version: doc.version, active: true,
    updatedByUid: adminUid, createdAt: daysAgoTs(50), updatedAt: daysAgoTs(doc.version > 1 ? 12 : 50),
  })));
  // aceites dos 2 logins cliente. Especial aceitou o acordo na versão ANTIGA (1) → precisa reaceitar.
  clientUsers.forEach((u) => {
    LEGAL.forEach((doc) => {
      const staleAcordo = u.isSpecial && doc.slug === 'acordo-de-afiliacao';
      writes.push((b) => b.set(db.collection('legal_acceptances').doc(`${u.uid}_${doc.slug}`), {
        uid: u.uid, slug: doc.slug, version: staleAcordo ? 1 : doc.version, acceptedAt: daysAgoTs(staleAcordo ? 45 : between(2, 20)),
      }));
    });
  });

  // 10) Contatos (inquéritos do formulário público)
  const CONTACT_NAMES = ['Rafael Andrade', 'Marina Costa', 'Bruno Oliveira', 'Camila Rezende', 'Diego Martins', 'Larissa Souza', 'Thiago Nogueira', 'Patrícia Lima'];
  CONTACT_NAMES.forEach((name, i) => writes.push((b) => b.set(db.collection('contacts').doc(`demo-contact-${i + 1}`), {
    name, email: `${slugify(name)}@gmail.com`,
    phone: `+55${between(11, 99)}9${between(10000000, 99999999)}`,
    socialMedia: `@${slugify(name).replace('-', '')}`,
    affiliateExperience: rnd() < 0.6 ? 'sim' : 'nao',
    presentation: pick([
      'Trabalho com tráfego para iGaming e quero migrar minha rede pra um painel próprio.',
      'Tenho uma rede de afiliados no Telegram e busco automatizar o fechamento de comissão.',
      'Sou gestor de afiliados e quero sair da planilha.',
      'Opero com CPA em algumas casas e quero centralizar tudo com a minha marca.',
    ]),
    createdAt: daysAgoTs(between(1, 28)),
  })));

  // 11) Mensagens diretas (gerência → afiliado demo)
  if (demoAfiliado) {
    writes.push((b) => b.set(db.collection('direct_messages').doc('demo-dm-1'), {
      recipientUid: demoAfiliado.uid, affiliateId: demoAfiliado.affiliateId,
      affiliateName: baseNames[demoAfiliado.affiliateId] || 'Afiliado',
      title: 'Parabéns pelo mês!', body: 'Você foi um dos destaques de produção no período. Continue assim que tem bônus vindo. 🚀',
      createdByName: 'Equipe AffiliaCore', readAt: null, createdAt: daysAgoTs(2),
    }));
    writes.push((b) => b.set(db.collection('direct_messages').doc('demo-dm-2'), {
      recipientUid: demoAfiliado.uid, affiliateId: demoAfiliado.affiliateId,
      affiliateName: baseNames[demoAfiliado.affiliateId] || 'Afiliado',
      title: 'Nova casa disponível', body: 'Liberamos a KTO no marketplace. Dá uma olhada nos acordos e solicite a parceria se fizer sentido.',
      createdByName: 'Equipe AffiliaCore', readAt: daysAgoTs(4), createdAt: daysAgoTs(5),
    }));
  }

  // 12) settings — support_contact liga o item "Suporte" da sidebar; showcase
  // ligado apaga o banner âmbar "auto-cadastro desligado" do /solicitacoes.
  writes.push((b) => b.set(db.collection('settings').doc('support_contact'), {
    phone: '5511988887777',
    message: 'Olá! Preciso de ajuda com o painel AffiliaCore.',
    label: 'Suporte',
    active: true,
  }));
  writes.push((b) => b.set(db.collection('settings').doc('showcase'), {
    enabled: true,
    description: 'Painel de afiliados com fechamento de comissão automático, ranking diário e carteira integrada.',
    siteUrl: 'https://affiliacore.com.br',
    updatedAt: daysAgoTs(8),
  }));

  // 13) integração configurada (server-only; o seed usa Admin SDK) — badge
  // "Ativa" em /integracoes e modo "Pull automático" no modal da Esportiva.
  // O outro lado do vínculo 1:1 (houses/esportiva.integration) já foi gravado na §2.
  writes.push((b) => b.set(db.collection('integrations').doc('esportiva-tap'), {
    id: 'esportiva-tap',
    enabled: true,
    apiKey: 'demo-esportiva-key-000000001234', // nunca volta ao browser; a tela mostra só ••••1234
    houseId: 'esportiva',
    config: { cpaBase: '120', apiBase: 'https://boapi3.smartico.ai' },
    updatedAt: daysAgoTs(9),
    updatedBy: adminUid,
  }));

  // 14) conquistas — catálogo de placas + fila de solicitações. Metas calibradas
  // pra demo: o afiliado demo (top produtor) já bate as primeiras.
  const TIERS = [
    { id: 'demo-tier-bronze', title: 'Placa Bronze', subtitle: 'BRONZE', metaCommission: 5000, metaCpas: 0, order: 0 },
    { id: 'demo-tier-prata', title: 'Placa Prata', subtitle: 'SILVER', metaCommission: 15000, metaCpas: 0, order: 1 },
    { id: 'demo-tier-ouro', title: 'Placa Ouro', subtitle: 'GOLD', metaCommission: 50000, metaCpas: 50, order: 2 },
    { id: 'demo-tier-platina', title: 'Placa Platina', subtitle: 'PLATINUM', metaCommission: 150000, metaCpas: 150, order: 3 },
    { id: 'demo-tier-diamante', title: 'Placa Diamante', subtitle: 'DIAMOND', metaCommission: 500000, metaCpas: 500, order: 4 },
  ];
  TIERS.forEach((t) => writes.push((b) => b.set(db.collection('achievement_tiers').doc(t.id), {
    title: t.title, subtitle: t.subtitle,
    description: `Atinja R$ ${t.metaCommission.toLocaleString('pt-BR')} em comissão acumulada${t.metaCpas ? ` e ${t.metaCpas} CPAs qualificados` : ''} para receber a ${t.title}.`,
    metaCpas: t.metaCpas, metaCommission: t.metaCommission,
    order: t.order, active: true, imageUrl: '',
    createdAt: daysAgoTs(45), updatedAt: daysAgoTs(45),
  })));
  if (demoAfiliado) {
    const id = demoAfiliado.affiliateId;
    const nm = baseNames[id] || 'Afiliado';
    writes.push((b) => b.set(db.collection('achievement_requests').doc('demo-achv-1'), {
      tierId: 'demo-tier-prata', tierTitle: 'Placa Prata',
      affiliateId: id, affiliateName: nm,
      status: 'approved', snapshot: { cpas: 82, commission: 18450.6 },
      note: null, requestedByUid: demoAfiliado.uid,
      createdAt: daysAgoTs(20), updatedAt: daysAgoTs(18), decidedAt: daysAgoTs(18),
    }));
    writes.push((b) => b.set(db.collection('achievement_requests').doc('demo-achv-2'), {
      tierId: 'demo-tier-ouro', tierTitle: 'Placa Ouro',
      affiliateId: id, affiliateName: nm,
      status: 'pending', snapshot: { cpas: 130, commission: 52320.4 },
      note: 'Bati a meta este mês! 🏆', requestedByUid: demoAfiliado.uid,
      createdAt: daysAgoTs(1), updatedAt: daysAgoTs(1),
    }));
  }

  // 15) /solicitacoes com as TRÊS naturezas: lead (contacts, já na §10),
  // signup pendente (users sem affiliateId) e indicação (affiliate_referrals).
  const SIGNUPS = [
    { uid: 'demo-signup-1', name: 'Renato Guimarães', email: 'renato.guimaraes@gmail.com', phone: '+5511987650001', socialMedia: '@renatogui', status: null },
    { uid: 'demo-signup-2', name: 'Vitória Sampaio', email: 'vitoria.sampaio@gmail.com', phone: '+5521987650002', socialMedia: '@vitoriasampaio', status: null },
    { uid: 'demo-signup-3', name: 'Édson Prado', email: 'edson.prado@gmail.com', phone: null, socialMedia: null, status: 'archived' },
  ];
  SIGNUPS.forEach((s, i) => writes.push((b) => b.set(db.collection('users').doc(s.uid), {
    uid: s.uid, name: s.name, email: s.email, role: 'client',
    phone: s.phone, socialMedia: s.socialMedia,
    source: 'vitrine-affiliacore',
    ...(s.status ? { requestStatus: s.status } : {}),
    createdAt: daysAgoTs(2 + i * 3),
  })));
  if (especialUser) {
    const espName = baseNames[especialUser.affiliateId] || 'Especial';
    [
      { id: 'demo-referral-1', name: 'Kaique Moura', email: 'kaique.moura@gmail.com', phone: '+5531987650003', note: 'Trabalha comigo no tráfego, produz bem no Telegram.' },
      { id: 'demo-referral-2', name: 'Lívia Castilho', email: 'livia.castilho@gmail.com', phone: null, note: null },
    ].forEach((r, i) => writes.push((b) => b.set(db.collection('affiliate_referrals').doc(r.id), {
      name: r.name, email: r.email, phone: r.phone, note: r.note,
      referrerAffiliateId: especialUser.affiliateId, referrerName: espName, referrerUid: especialUser.uid,
      requestStatus: 'pending', createdAt: daysAgoTs(1 + i * 2),
    })));
    // link de cadastro na rede do especial (reutilizável, sem validade)
    writes.push((b) => b.set(db.collection('invites').doc('demo-rede-' + especialUser.affiliateId.slice(-8)), {
      token: 'demo-rede-' + especialUser.affiliateId.slice(-8),
      kind: 'network',
      ownerAffiliateId: especialUser.affiliateId, ownerName: espName,
      status: 'active', uses: 3,
      createdAt: daysAgoTs(12),
    }));
  }

  // 16) links de STANDBY (pool sem dono) — a 5ª visão da triagem /links
  for (let s = 0; s < 10; s++) {
    const slug = HOUSE_SLUGS[s % HOUSE_SLUGS.length];
    const code = `sb${String(s + 1).padStart(3, '0')}`;
    const tag = `pool${s + 1}`;
    writes.push((b) => b.set(db.collection('affiliate_links').doc(code), {
      code, affiliateId: null, brandId: slug,
      registerUrl: `${REGISTER_URL[slug]}?afp=${tag}`, tag,
      active: false, clicks: 0, botClicks: 0,
      createdByUid: adminUid, createdAt: daysAgoTs(between(5, 30)), updatedAt: daysAgoTs(between(0, 5)),
    }));
  }

  // 17) avisos/notificações — completa os enums que o seed base não usa:
  // category 'importante', audience 'specials', aviso com link, e os tipos de
  // user_notification além de results_updated.
  writes.push((b) => b.set(db.collection('notices').doc('demo-aviso-especiais'), {
    title: 'Gestores: fechamento da rede na segunda',
    body: 'O repasse das equipes fecha segunda-feira às 18h. Confira as taxas dos seus afiliados diretos antes do corte.',
    category: 'importante', audience: 'specials',
    link: 'https://affiliacore.com.br',
    active: true, createdAt: daysAgoTs(2), updatedAt: daysAgoTs(2),
  }));
  if (demoAfiliado) {
    writes.push((b) => b.set(db.collection('user_notifications').doc('demo-notif-2'), {
      recipientUid: demoAfiliado.uid, affiliateId: demoAfiliado.affiliateId,
      type: 'achievement_approved',
      title: 'Conquista aprovada: Placa Prata',
      body: 'Parabéns! Sua Placa Prata foi aprovada e já está a caminho.',
      readAt: null, createdAt: daysAgoTs(18),
    }));
    writes.push((b) => b.set(db.collection('user_notifications').doc('demo-notif-3'), {
      recipientUid: demoAfiliado.uid, affiliateId: demoAfiliado.affiliateId,
      type: 'partnership_rejected',
      title: 'Parceria não aprovada',
      body: 'Sua solicitação no acordo Betano - CPA - Mensal - EUR - Brasil não foi aprovada. Fale com a gerência para entender o motivo.',
      readAt: daysAgoTs(3), createdAt: daysAgoTs(4),
    }));
  }

  // 18) taxa com VIGÊNCIA + override por casa no afiliado demo (rateHistory F1):
  // o /financeiro fatia a apuração por janela e a Superbet paga pela taxa da casa.
  // merge:true — o doc base (taxa de topo) já existe, só enriquecemos.
  if (demoAfiliado) {
    const sinceTop = toISO(addDays(today, -14));
    const sinceBrand = toISO(addDays(today, -10));
    writes.push((b) => b.set(db.collection('affiliate_configs').doc(demoAfiliado.affiliateId), {
      since: sinceTop,
      history: [{ from: '1970-01-01', to: toISO(addDays(today, -15)), cpaValue: 55, revPercentage: 20 }],
      byBrand: {
        superbet: {
          cpaValue: 80, since: sinceBrand,
          history: [{ from: '1970-01-01', to: toISO(addDays(today, -11)), cpaValue: 65 }],
        },
      },
      updatedAt: daysAgoTs(10),
    }, { merge: true }));
  }

  // 18.1) Taxa POR CASA da Carla — é a que o GERENTE definiu na parceria `priced`
  // acima. Sem ela a parceria precificada apontaria para uma taxa que não existe.
  const carlaId = affId('Carla Menezes');
  if (baseNames[carlaId] && managedDeals.length) {
    const brandKey = (managedDeals[1] || managedDeals[0]).slug;
    writes.push((b) => b.set(db.collection('affiliate_configs').doc(carlaId), {
      byBrand: { [brandKey]: { cpaValue: 38, revPercentage: 12, since: toISO(addDays(today, -2)) } },
      updatedAt: daysAgoTs(3),
    }, { merge: true }));
  }

  // 18.2) Apelidos de tag (afiliado ↔ ?afp= da planilha da casa): é o que faz o
  // import de resultados casar uma linha cuja tag não é o id do afiliado. Sem um
  // doc aqui, a tela de vínculo de tag do /casas nasce vazia.
  const TAG_ALIASES = [
    { tag: 'yagovip', affiliate: 'Yago Martins', houseSlug: 'superbet' },
    { tag: 'ana-oficial', affiliate: 'Ana Souza', houseSlug: 'betano' },
    { tag: 'lucas2026', affiliate: 'Lucas Ferreira', houseSlug: 'kto' },
    { tag: 'bia-promo', affiliate: 'Bia Cardoso', houseSlug: 'esportiva' },
  ];
  TAG_ALIASES.forEach((a) => {
    const id = affId(a.affiliate);
    if (!baseNames[id]) return;
    writes.push((b) => b.set(db.collection('affiliate_tag_aliases').doc(a.tag), {
      tag: a.tag, affiliateId: id, houseSlug: a.houseSlug,
      createdByUid: adminUid, createdAt: daysAgoTs(between(6, 30)),
    }));
  });

  // 19) 2º especial no modo REDE (fromNetwork): a sub-rede é DERIVADA da árvore
  // de affiliate_uplines a cada leitura (N níveis) — o seed base só mostra o
  // modelo antigo de lista manual. Lucas tem Duda e Carla diretas e o Bruno no
  // 3º nível via Duda.
  const lucasId = affId('Lucas Ferreira');
  if (baseNames[lucasId]) {
    writes.push((b) => b.set(db.collection('special_affiliates').doc(lucasId), {
      active: true, fromNetwork: true, subAffiliateIds: [],
      updatedAt: daysAgoTs(14),
    }));
  }

  // 20) trilha de auditoria das features dos extras — sem isso os filtros de
  // entidade/ação da /auditoria listam só 4 opções. Ids determinísticos p/ re-run.
  const extraAudit = [
    { n: 60, entityType: 'deal', entityId: 'demo-deal-1', entityLabel: 'Superbet - CPA - Mensal - BRL - Brasil', action: 'deal.create', metadata: { model: 'cpa', cpaValue: 250 } },
    { n: 49, entityType: 'deal', entityId: 'demo-deal-11', entityLabel: 'Esportiva Bet - CPA - Mensal - BRL - Brasil', action: 'deal.create', metadata: { type: 'gerenciado', baseline: 2500 } },
    { n: 25, entityType: 'deal', entityId: 'demo-deal-9', entityLabel: 'Betano - CPA - Mensal - EUR - Brasil', action: 'deal.update', changes: [{ field: 'active', before: true, after: false }] },
    { n: 21, entityType: 'partnership', entityId: 'demo-part-audit', entityLabel: `${baseNames[demoAfiliado?.affiliateId] || 'Afiliado'} · Superbet`, action: 'partnership.approve', metadata: { dealId: 'demo-deal-1' } },
    { n: 20, entityType: 'partnership', entityId: 'demo-part-audit-2', entityLabel: `${baseNames[demoAfiliado?.affiliateId] || 'Afiliado'} · Betano`, action: 'partnership.reject', reason: 'Acordo em moeda estrangeira suspenso.' },
    { n: 6, entityType: 'withdrawal', entityId: 'demo-wd-audit', entityLabel: baseNames[demoAfiliado?.affiliateId] || 'Afiliado', action: 'withdrawal.request', metadata: { amount: 2760 } },
    { n: 5, entityType: 'withdrawal', entityId: 'demo-wd-audit-2', entityLabel: baseNames[demoAfiliado?.affiliateId] || 'Afiliado', action: 'withdrawal.approved', metadata: { amount: 1890 } },
    { n: 4, entityType: 'withdrawal', entityId: 'demo-wd-audit-3', entityLabel: baseNames[demoAfiliado?.affiliateId] || 'Afiliado', action: 'withdrawal.paid', metadata: { amount: 3120.5 } },
    { n: 16, entityType: 'link', entityId: 'sb001', entityLabel: 'Superbet', action: 'link.generate', metadata: { tag: 'pool1' } },
    { n: 15, entityType: 'link', entityId: 'sb002', entityLabel: 'Betano', action: 'link.standby_import', metadata: { imported: 10 } },
    { n: 50, entityType: 'legal_document', entityId: 'demo-legal-acordo-de-afiliacao', entityLabel: 'Acordo de Afiliação', action: 'legal_document.create', metadata: { version: 1 } },
    { n: 12, entityType: 'legal_document', entityId: 'demo-legal-acordo-de-afiliacao', entityLabel: 'Acordo de Afiliação', action: 'legal_document.update', changes: [{ field: 'version', before: 1, after: 2 }] },
    { n: 24, entityType: 'network', entityId: affId('Duda Rocha'), entityLabel: 'Duda Rocha', action: 'network.set_upline', changes: [{ field: 'uplineId', before: null, after: affId('Lucas Ferreira') }] },
    { n: 9, entityType: 'integration', entityId: 'esportiva-tap', entityLabel: 'Esportiva TAP', action: 'integration.update', changes: [{ field: 'active', before: false, after: true }] },
    { n: 8, entityType: 'settings', entityId: 'showcase', entityLabel: 'Vitrine AffiliaCore', action: 'showcase.update', changes: [{ field: 'active', before: false, after: true }] },
    { n: 18, entityType: 'achievement_tier', entityId: 'demo-tier-ouro', entityLabel: 'Placa Ouro', action: 'achievement_tier.create', metadata: null },
    { n: 17, entityType: 'achievement_request', entityId: 'demo-achv-1', entityLabel: 'Placa Prata', action: 'achievement_request.approve', metadata: { affiliate: baseNames[demoAfiliado?.affiliateId] || 'Afiliado' } },
    { n: 11, entityType: 'invite', entityId: 'demo-invite-audit', entityLabel: 'Marina Lopes', action: 'invite.create', metadata: { expiresAt: toISO(addDays(today, -4)) } },
  ];
  extraAudit.forEach((a, i) => writes.push((b) => b.set(db.collection('audit_logs').doc(`demo-x-audit-${String(i + 1).padStart(2, '0')}`), {
    entityType: a.entityType, entityId: a.entityId ?? null, entityLabel: a.entityLabel ?? null,
    action: a.action, actorId: adminUid, actorName: 'Equipe AffiliaCore', actorEmail: 'demo@affiliacore.com.br',
    changes: a.changes ?? null, metadata: a.metadata ?? null, reason: a.reason ?? null,
    affiliateId: a.entityType === 'affiliate' ? (a.entityId ?? null) : null,
    createdAt: daysAgoTs(a.n),
  })));

  console.log(`  preparados ${writes.length} writes principais + ${linkStatsWrites.length} stats + ${rawClickWrites.length} cliques crus`);
  await commitChunked(writes);
  await commitChunked(linkStatsWrites);
  await commitChunked(rawClickWrites);
  console.log(`  ✔ resultados extras: ${extraRows} linhas · saques: ${wCount} · parcerias: ${partCount} · links: ${linkCount}`);

  // 12) daily_rankings — últimos 10 dias, a partir de TODO house_results do dia
  console.log('— gerando histórico de ranking (10 dias) —');
  const allNames = { ...baseNames };
  EXTRA.forEach((e) => { allNames[e.id] = e.name; });
  const rankDays = Array.from({ length: 10 }, (_, i) => toISO(addDays(today, -1 - i))); // ontem p/ trás
  const rankWrites = [];
  for (const date of rankDays) {
    const snap = await db.collection('house_results').where('date', '==', date).get();
    const byAff = new Map();
    snap.forEach((d) => {
      const v = d.data();
      const id = v.affiliateId;
      if (!id) return;
      byAff.set(id, (byAff.get(id) || 0) + (Number(v.total_commission) || 0));
    });
    const entries = [...byAff.entries()]
      .map(([affiliateId, commission]) => ({ affiliateId, name: allNames[affiliateId] || affiliateId, commission: money(commission) }))
      .filter((e) => e.commission > 0)
      .sort((a, b) => b.commission - a.commission)
      .slice(0, 100)
      .map((e, i) => ({ pos: i + 1, ...e }));
    rankWrites.push((b) => b.set(db.collection('daily_rankings').doc(date), {
      date, entries, count: entries.length, metric: 'commission',
      generatedByName: 'Equipe AffiliaCore', generatedAt: Timestamp.fromDate(new Date(`${date}T14:30:00`)),
    }));
  }
  await commitChunked(rankWrites);
  console.log(`  ✔ daily_rankings: ${rankDays.length} dias`);

  // 13) Verificação — totais da janela + contagens
  console.log('\n— VERIFICAÇÃO —');
  const winStart = toISO(WINDOW[0]);
  const winEnd = toISO(WINDOW[WINDOW.length - 1]);
  const hrSnap = await db.collection('house_results').where('date', '>=', winStart).where('date', '<=', winEnd).get();
  let totalComm = 0, totalFtd = 0;
  hrSnap.forEach((d) => { const v = d.data(); totalComm += Number(v.total_commission) || 0; totalFtd += Number(v.first_deposits) || 0; });
  const counts = {};
  for (const col of ['affiliates', 'affiliate_configs', 'houses', 'house_results', 'payment_profiles', 'withdrawal_requests', 'deals', 'partnership_requests', 'affiliate_links', 'link_click_stats', 'link_clicks', 'legal_documents', 'legal_acceptances', 'contacts', 'direct_messages', 'daily_rankings', 'achievement_tiers', 'achievement_requests', 'affiliate_referrals', 'integrations', 'settings', 'invites', 'special_affiliates']) {
    counts[col] = (await db.collection(col).count().get()).data().count;
  }
  console.log(`  headline janela 30d: R$ ${totalComm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · FTD ${totalFtd}`);
  console.log('  contagens:', JSON.stringify(counts, null, 0));
  const yId = demoAfiliado ? demoAfiliado.affiliateId : null;
  if (yId) {
    const yw = await db.collection('withdrawal_requests').where('affiliateId', '==', yId).get();
    const yl = await db.collection('affiliate_links').where('affiliateId', '==', yId).get();
    console.log(`  afiliado demo (${allNames[yId]}): ${yw.size} saques · ${yl.size} links`);
  }
  // Proteção dos leads verificada por QUERY (não por declaração).
  const leadsAfter = (await db.collection('leads').count().get()).data().count;
  if (leadsAfter !== leadsBefore) {
    throw new Error(`PROTEÇÃO VIOLADA: leads mudou de ${leadsBefore} para ${leadsAfter}!`);
  }
  console.log(`  ✔ leads da landing intactos (${leadsAfter}).`);

  console.log('\n✔ Extras semeados.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nERRO:', e && e.stack ? e.stack : e); process.exit(1); });
