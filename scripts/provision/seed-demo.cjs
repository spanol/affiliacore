#!/usr/bin/env node
/**
 * P5.3 (produtização) · SEED da instância DEMO (fim-de-funil, acesso controlado).
 *
 * Popula o Firestore do projeto `affiliacore` com uma operação FICTÍCIA porém
 * verossímil, alinhada aos números do mock da landing (HeroDashboardMock):
 * na janela "Últimos 30 dias" (hoje − 29 → hoje, MESMA definição do preset do
 * app em lib/dateRange) os totais batem EXATOS:
 *   comissão R$ 24.831,90 · FTD 312 · cadastros 1.204 · CPA qualif. 187 ·
 *   REV R$ 6.591,90 · por casa: Superbet 14.930,10/178 · Betano 6.480,00/89 ·
 *   BetMGM 3.421,80/45. (Total CPA em R$ fica 0 — instância manual não coleta
 *   CPA-dinheiro; gap de fidelidade conhecido, ver PRODUTIZACAO.md P5.3.)
 * Há ainda ~30 dias ANTERIORES com ~87% do volume (comparações "vs. período
 * anterior" fazem sentido) e atividade garantida ONTEM (ranking gera pódio).
 *
 * Uso (com o service-account.json DO PROJETO affiliacore):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.affiliacore.json \
 *     node scripts/provision/seed-demo.cjs [--wipe --yes] [--wipe-only --yes] [--rotate] [--verify-only]
 *
 * Modos:
 *   (padrão)      seed — exige o banco de demo VAZIO (senão mande --wipe junto)
 *   --wipe --yes  limpa TODAS as coleções da demo (allowlist abaixo) + TODOS os
 *                 logins do Auth (exceto --keep email1,email2) e re-seeda
 *   --wipe-only   só limpa (não re-seeda)
 *   --rotate      só troca as senhas dos 3 logins demo (e revoga sessões)
 *   --verify-only só confere os totais da janela de 30 dias contra os alvos
 *   --plan        SEM Firebase: gera as linhas em memória e confere as somas
 *                 (use p/ validar a matemática de alocação em dev)
 *
 * SEGURANÇA:
 *   • GUARD DE PROJETO: aborta se o service account não for do projeto
 *     `affiliacore` (--expect-project p/ sobrepor conscientemente). Este script
 *     NUNCA deve rodar contra um projeto de instância real (agencia-boost-app!).
 *   • A coleção `leads` (landing) NÃO está na allowlist e é PROTEGIDA: o wipe
 *     conta os leads antes/depois e aborta se o número mudar.
 *   • Toda limpeza é VERIFICADA por query (regra da casa — ver CLAUDE.md).
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const has = (name) => process.argv.includes(`--${name}`);
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
};

const MODE = {
  wipe: has('wipe') || has('wipe-only'),
  wipeOnly: has('wipe-only'),
  rotate: has('rotate'),
  verifyOnly: has('verify-only'),
  plan: has('plan'),
  yes: has('yes'),
};
const EXPECT_PROJECT = arg('expect-project') || 'affiliacore';
const KEEP_EMAILS = new Set(String(arg('keep') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

// ---------------------------------------------------------------------------
// Init (preguiçoso — o modo --plan roda sem Firebase) + guard de projeto
// ---------------------------------------------------------------------------
const { Timestamp, FieldValue } = admin.firestore; // estáticos, não exigem init
let db = null;
function initAdmin() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
  } else {
    admin.initializeApp(); // GOOGLE_APPLICATION_CREDENTIALS
  }
  db = admin.firestore();
}

function resolveProjectId() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY).project_id; } catch { /* segue */ }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try { return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')).project_id; } catch { /* segue */ }
  }
  return process.env.GOOGLE_CLOUD_PROJECT || null;
}

// ---------------------------------------------------------------------------
// Dados da demo — constantes
// ---------------------------------------------------------------------------
// Logins de demonstração (senhas geradas e impressas UMA vez; --rotate renova).
const LOGINS = {
  admin: { uid: 'demo-admin', email: 'demo@affiliacore.com.br', name: 'Equipe AffiliaCore' },
  afiliado: { uid: 'demo-afiliado', email: 'afiliado@affiliacore.com.br' }, // vinculado ao 1º produtor
  especial: { uid: 'demo-especial', email: 'especial@affiliacore.com.br' }, // vinculado ao 2º (com sub-rede)
};

// Casas MANUAIS (nomes já públicos na landing). defaultCpa em EUR (convenção
// /casas — conversão ao vivo no display); defaultRev em %. Como TODAS as linhas
// semeadas trazem `comissao` importada (>0), a taxa da casa é display/fallback —
// os totais NÃO dependem de cotação.
const HOUSES = [
  { slug: 'superbet', name: 'Superbet', logo: '/brands/superbet.png', defaultCpa: 18, defaultRev: 25 },
  { slug: 'betano', name: 'Betano', logo: null, defaultCpa: 17, defaultRev: 22 },
  { slug: 'betmgm', name: 'BetMGM', logo: null, defaultCpa: 16, defaultRev: 20 },
];

// Alvos EXATOS da janela "últimos 30 dias" (= mock da LP). Dinheiro em CENTAVOS.
const W1_TARGETS = {
  superbet: { commission: 1493010, ftd: 178, reg: 690, cpa: 107, rvs: 379540, deposit: 5580000 },
  betano: { commission: 648000, ftd: 89, reg: 342, cpa: 53, rvs: 188270, deposit: 2740000 },
  betmgm: { commission: 342180, ftd: 45, reg: 172, cpa: 27, rvs: 91380, deposit: 1390000 },
};
const W0_FACTOR = 0.87; // janela anterior (~30 dias antes), sem exigência de exatidão

// 38 afiliados nativos: 20 PRODUTORES (peso = proporção das barras do mock p/ o
// top-7) + 18 quietos ("em captação" — realista e mostra o estado zerado da UI).
const PRODUCERS = [
  { name: 'Yago Martins', w: 92, cpaValue: 65, revPercentage: 22 },
  { name: 'Ana Souza', w: 74, cpaValue: 70, revPercentage: 25 }, // especial (teto da sub-rede)
  { name: 'Lucas Ferreira', w: 61, cpaValue: 60, revPercentage: 20 },
  { name: 'Bia Cardoso', w: 52, cpaValue: 55, revPercentage: 20 },
  { name: 'Rafa Almeida', w: 40, cpaValue: 55, revPercentage: 18 },
  { name: 'Duda Rocha', w: 31, cpaValue: 50, revPercentage: 18 },
  { name: 'Igor Santana', w: 22, cpaValue: 50, revPercentage: 18 }, // sub da Ana
  { name: 'Carla Menezes', w: 18, cpaValue: 45, revPercentage: 15 }, // sub da Ana
  { name: 'Thiago Nunes', w: 16, cpaValue: 45, revPercentage: 15 }, // sub da Ana
  { name: 'Marina Lopes', w: 14, cpaValue: 48, revPercentage: 16 },
  { name: 'Pedro Barros', w: 12, cpaValue: 45, revPercentage: 15 },
  { name: 'Julia Castro', w: 11, cpaValue: 45, revPercentage: 15 },
  { name: 'Felipe Ramos', w: 10, cpaValue: 42, revPercentage: 14 },
  { name: 'Camila Duarte', w: 9, cpaValue: 42, revPercentage: 14 },
  { name: 'Bruno Teixeira', w: 8, cpaValue: 40, revPercentage: 12 },
  { name: 'Larissa Pinto', w: 7, cpaValue: 40, revPercentage: 12 },
  { name: 'Diego Moraes', w: 6, cpaValue: 40, revPercentage: 12 },
  { name: 'Paula Freitas', w: 5, cpaValue: 40, revPercentage: 12 },
  { name: 'Vitor Campos', w: 4, cpaValue: null, revPercentage: null }, // SEM config (estado "não configurado")
  { name: 'Sofia Ribeiro', w: 3, cpaValue: null, revPercentage: null }, // SEM config
];
const QUIET = [
  'Otávio Lima', 'Renata Dias', 'Caio Fonseca', 'Helena Prado', 'Murilo Alves', 'Tati Borges',
  'Gustavo Reis', 'Amanda Silveira', 'Léo Machado', 'Nina Tavares', 'Douglas Melo', 'Isabela Franco',
  'Hugo Batista', 'Clara Neves', 'André Sales', 'Luana Moreira', 'Samuel Pires', 'Yasmin Costa',
];

// Quem produz em qual casa (índices em PRODUCERS). Superbet = todos; as outras,
// subconjuntos — realista e reduz o nº de linhas.
const HOUSE_ROSTER = {
  superbet: PRODUCERS.map((_, i) => i),
  betano: [0, 1, 2, 3, 4, 6, 8, 10, 12, 14],
  betmgm: [0, 1, 3, 5, 7, 9, 13],
};

// Sub-rede da especial (Ana): índices em PRODUCERS.
const SPECIAL_INDEX = 1;
const SUB_INDICES = [6, 7, 8];

// Coleções que o WIPE limpa por inteiro (inclui o rastro de uso da demo por
// leads: convites, contatos, auditoria, notificações...). `leads` NUNCA entra.
const WIPE_COLLECTIONS = [
  'users', 'affiliates', 'affiliate_statuses', 'affiliate_email_aliases', 'affiliate_configs',
  'special_affiliates', 'houses', 'house_results', 'audit_logs', 'user_notifications',
  'notices', 'direct_messages', 'daily_rankings', 'ranking_prizes', 'invites', 'contacts',
  'affiliate_links', 'link_clicks', 'link_click_stats', 'affiliate_analytics',
  'payment_profiles', 'api_partners', 'pending_affiliates', 'app_meta', 'settings',
];
if (WIPE_COLLECTIONS.includes('leads')) throw new Error('BUG: leads jamais pode entrar na allowlist de wipe.');

// ---------------------------------------------------------------------------
// Utilitários determinísticos
// ---------------------------------------------------------------------------
// PRNG com semente fixa — o seed é reprodutível (mesma distribuição a cada rodada,
// deslocada apenas pela janela de datas relativa ao dia da execução).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260707);

const slugify = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const affId = (name) => `boost_demo-${slugify(name)}`;
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const newPassword = () => `Demo-${crypto.randomBytes(9).toString('base64url')}`;

// Distribui `total` (inteiro) por pesos, com maior-resto; respeita caps opcionais.
// Soma do resultado === total, SEMPRE (é o que garante os alvos exatos do mock).
function distributeInt(total, weights, caps) {
  const n = weights.length;
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (total * w) / sumW);
  const out = raw.map((r, i) => Math.min(Math.floor(r), caps ? caps[i] : Infinity));
  let rest = total - out.reduce((a, b) => a + b, 0);
  // maior fração primeiro; respeita caps; se sobrar (caps apertados), varre de novo
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  let guard = 0;
  while (rest > 0 && guard < 10000) {
    let placed = false;
    for (const i of order) {
      if (rest === 0) break;
      const cap = caps ? caps[i] : Infinity;
      if (out[i] < cap) { out[i] += 1; rest -= 1; placed = true; }
    }
    if (!placed) throw new Error('distributeInt: caps insuficientes para o total.');
    guard += 1;
  }
  return out;
}

// Dinheiro em CENTAVOS (inteiro) → distributeInt já dá exatidão.
const distributeCents = (totalCents, weights) => distributeInt(totalCents, weights);

// ---------------------------------------------------------------------------
// Geração das linhas de house_results
// ---------------------------------------------------------------------------
// Para uma casa+janela: distribui as métricas pelos produtores e depois pelos
// dias ativos de cada um. Invariantes por célula: reg ≥ ftd ≥ cpa (o extra de
// cadastros é distribuído por cima dos FTDs); dinheiro segue a atividade.
function buildRowsForHouse(house, targets, days, { forceYesterdayFor = new Set() } = {}) {
  const roster = HOUSE_ROSTER[house.slug];
  const weights = roster.map((i) => PRODUCERS[i].w);

  const ftdAff = distributeInt(targets.ftd, weights);
  const cpaAff = distributeInt(targets.cpa, weights, ftdAff);
  const regExtraAff = distributeInt(targets.reg - targets.ftd, weights);
  const moneyW = roster.map((_, k) => cpaAff[k] * 3 + ftdAff[k] + weights[k] * 0.05 + 0.01);
  const commissionAff = distributeCents(targets.commission, moneyW);
  const rvsAff = distributeCents(targets.rvs, roster.map((_, k) => ftdAff[k] + weights[k] * 0.1 + 0.01));
  const depositAff = distributeCents(targets.deposit, roster.map((_, k) => ftdAff[k] * 2 + regExtraAff[k] + 0.01));

  const rows = [];
  roster.forEach((pIdx, k) => {
    const p = PRODUCERS[pIdx];
    if (ftdAff[k] + cpaAff[k] + regExtraAff[k] === 0 && commissionAff[k] === 0) return;

    // Dias ativos: top produz quase todo dia; cauda, alguns dias. Fim de semana pesa mais.
    const wantDays = Math.max(2, Math.min(days.length, Math.round((p.w / 92) * 16 + 3 + rnd() * 3)));
    const shuffled = [...days].sort(() => rnd() - 0.5);
    const active = new Set(shuffled.slice(0, wantDays).map((d) => toISO(d)));
    if (forceYesterdayFor.has(pIdx)) {
      // últimos DOIS dias da janela: ontem (ranking do dia fechado) e hoje
      // (dia corrente não-zerado) — a janela termina HOJE.
      active.add(toISO(days[days.length - 1]));
      if (days.length > 1) active.add(toISO(days[days.length - 2]));
    }
    const activeDays = days.filter((d) => active.has(toISO(d)));

    const dayW = activeDays.map((d) => ([5, 6, 0].includes(d.getDay()) ? 1.4 : 1) * (0.6 + rnd() * 0.8));
    const ftdDay = distributeInt(ftdAff[k], dayW);
    const cpaDay = distributeInt(cpaAff[k], dayW, ftdDay);
    const regExtraDay = distributeInt(regExtraAff[k], dayW);
    // dinheiro: toda célula ativa recebe um mínimo (ε no peso) → ontem nunca fica R$0
    const commDay = distributeCents(commissionAff[k], activeDays.map((_, j) => cpaDay[j] * 3 + ftdDay[j] + dayW[j] * 0.2 + 0.05));
    const rvsDay = distributeCents(rvsAff[k], activeDays.map((_, j) => ftdDay[j] + dayW[j] * 0.2 + 0.05));
    const depDay = distributeCents(depositAff[k], activeDays.map((_, j) => ftdDay[j] * 2 + regExtraDay[j] + 0.05));

    activeDays.forEach((d, j) => {
      const registrations = ftdDay[j] + regExtraDay[j];
      const row = {
        houseSlug: house.slug,
        date: toISO(d),
        affiliateId: affId(p.name),
        registrations,
        first_deposits: ftdDay[j],
        qualified_cpa: cpaDay[j],
        rvs: rvsDay[j] / 100,
        deposit: depDay[j] / 100,
        total_commission: commDay[j] / 100,
      };
      if (registrations || row.qualified_cpa || row.rvs || row.deposit || row.total_commission) rows.push(row);
    });
  });
  return rows;
}

// id determinístico igual ao do servidor (src/lib/houseResultsDoc.ts) — reimportar
// o mesmo dia sobrescreve em vez de duplicar.
const hrDocId = (slug, date, affiliateId) => `${slug}__${date}__${affiliateId ?? 'agg'}`.replace(/\//g, '_');

// Todas as linhas das duas janelas (W1 exata + W0 ~87%). Puro/em memória — usado
// pelo seed E pelo --plan.
function buildAllRows(w1Days, w0Days) {
  const top10 = new Set(Array.from({ length: 10 }, (_, i) => i)); // ontem garantido p/ o ranking
  const rows = [];
  for (const h of HOUSES) {
    const t1 = W1_TARGETS[h.slug];
    rows.push(...buildRowsForHouse(h, t1, w1Days, { forceYesterdayFor: top10 }));
    const t0 = {
      commission: Math.round(t1.commission * W0_FACTOR),
      ftd: Math.round(t1.ftd * W0_FACTOR),
      reg: Math.round(t1.reg * W0_FACTOR),
      cpa: Math.round(t1.cpa * W0_FACTOR),
      rvs: Math.round(t1.rvs * W0_FACTOR),
      deposit: Math.round(t1.deposit * W0_FACTOR),
    };
    rows.push(...buildRowsForHouse(h, t0, w0Days));
  }
  return rows;
}

// Soma uma janela [startISO, endISO] por casa (centavos p/ dinheiro).
function sumWindow(rows, startISO, endISO) {
  const acc = {};
  for (const r of rows) {
    if (r.date < startISO || r.date > endISO) continue;
    const a = acc[r.houseSlug] ?? (acc[r.houseSlug] = { commission: 0, ftd: 0, reg: 0, cpa: 0, rvs: 0, deposit: 0 });
    a.commission += Math.round((r.total_commission || 0) * 100);
    a.ftd += r.first_deposits || 0;
    a.reg += r.registrations || 0;
    a.cpa += r.qualified_cpa || 0;
    a.rvs += Math.round((r.rvs || 0) * 100);
    a.deposit += Math.round((r.deposit || 0) * 100);
  }
  return acc;
}

// Compara um acumulado por casa com os alvos W1 e imprime a tabela. Devolve ok.
function reportAgainstTargets(acc, { affiliatesCount = null } = {}) {
  let ok = true;
  const fmt = (c) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  for (const h of HOUSES) {
    const t = W1_TARGETS[h.slug];
    const a = acc[h.slug] ?? { commission: 0, ftd: 0, reg: 0, cpa: 0, rvs: 0, deposit: 0 };
    const match = a.commission === t.commission && a.ftd === t.ftd && a.reg === t.reg
      && a.cpa === t.cpa && a.rvs === t.rvs && a.deposit === t.deposit;
    ok = ok && match;
    console.log(`  ${match ? '✔' : '✘'} ${h.name}: comissão R$ ${fmt(a.commission)} (alvo ${fmt(t.commission)}) · FTD ${a.ftd}/${t.ftd} · cadastros ${a.reg}/${t.reg} · CPA ${a.cpa}/${t.cpa} · REV R$ ${fmt(a.rvs)} (alvo ${fmt(t.rvs)})`);
  }
  const tot = Object.values(acc).reduce((s, a) => s + a.commission, 0);
  console.log(`  Σ comissão da janela: R$ ${fmt(tot)} (mock: R$ 24.831,90)`);
  if (affiliatesCount != null) console.log(`  afiliados no mirror: ${affiliatesCount} (mock: 38)`);
  return ok;
}

// ---------------------------------------------------------------------------
// Escrita em lotes
// ---------------------------------------------------------------------------
async function commitChunked(writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((fn) => fn(batch));
    await batch.commit();
  }
}

async function deleteCollection(name) {
  let total = 0;
  // pagina em 300 até esvaziar
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
// Fases
// ---------------------------------------------------------------------------
async function countLeads() {
  const snap = await db.collection('leads').get();
  return snap.size;
}

async function wipe() {
  const leadsBefore = await countLeads();
  console.log(`\n— WIPE (leads protegidos: ${leadsBefore} docs) —`);

  for (const col of WIPE_COLLECTIONS) {
    const n = await deleteCollection(col);
    if (n > 0) console.log(`  ${col}: ${n} docs removidos`);
  }
  // Auth: remove todos os logins (o Auth deste projeto é só da demo), exceto --keep.
  let removed = 0;
  let page = await admin.auth().listUsers(1000);
  for (;;) {
    const victims = page.users.filter((u) => !KEEP_EMAILS.has(String(u.email || '').toLowerCase()));
    for (const u of victims) { await admin.auth().deleteUser(u.uid); removed += 1; }
    if (!page.pageToken) break;
    page = await admin.auth().listUsers(1000, page.pageToken);
  }
  console.log(`  auth: ${removed} logins removidos${KEEP_EMAILS.size ? ` (mantidos: ${[...KEEP_EMAILS].join(', ')})` : ''}`);

  // Verificação da limpeza (obrigatória — regra da casa): cada coleção tem que
  // estar vazia e os leads INTACTOS.
  for (const col of WIPE_COLLECTIONS) {
    const check = await db.collection(col).limit(1).get();
    if (!check.empty) throw new Error(`Wipe incompleto: ${col} ainda tem docs.`);
  }
  const leadsAfter = await countLeads();
  if (leadsAfter !== leadsBefore) throw new Error(`PROTEÇÃO VIOLADA: leads mudou de ${leadsBefore} para ${leadsAfter}!`);
  console.log(`  ✔ limpeza verificada por query; leads intactos (${leadsAfter}).`);
}

async function ensureLogin(login, { role, affiliateId = null, isSpecial = false }, password) {
  let user;
  try {
    user = await admin.auth().getUserByEmail(login.email);
    await admin.auth().updateUser(user.uid, { password, displayName: login.name });
  } catch {
    user = await admin.auth().createUser({ uid: login.uid, email: login.email, password, displayName: login.name, emailVerified: false });
  }
  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email: login.email,
    name: login.name,
    role,
    ...(role === 'client' ? { affiliateId, isSpecial } : {}),
    mustChangePassword: false, // demo: senha rotativa via --rotate, sem troca forçada
    avatarUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(login.name)}`,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return user.uid;
}

async function seed() {
  console.log('\n— SEED —');
  // Recusa banco sujo (sem --wipe): seed em cima de dado velho = totais errados.
  for (const col of ['affiliates', 'house_results', 'houses']) {
    const snap = await db.collection(col).limit(1).get();
    if (!snap.empty) throw new Error(`Coleção ${col} não está vazia — rode com --wipe --yes para resetar a demo.`);
  }

  const today = new Date();
  // Janela exata = preset "Últimos 30 dias" do app (hoje−29 → hoje). Ontem e hoje
  // têm produção garantida (forceYesterdayFor) p/ ranking e dia corrente.
  const w1Days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const w0Days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 59)); // janela anterior

  // Nomes do 1º/2º produtor entram nos logins demo.
  LOGINS.afiliado.name = PRODUCERS[0].name;
  LOGINS.especial.name = PRODUCERS[SPECIAL_INDEX].name;

  // 1) Logins + senhas
  const passwords = { admin: newPassword(), afiliado: newPassword(), especial: newPassword() };
  const adminUid = await ensureLogin(LOGINS.admin, { role: 'admin' }, passwords.admin);
  await ensureLogin(LOGINS.afiliado, { role: 'client', affiliateId: affId(LOGINS.afiliado.name) }, passwords.afiliado);
  await ensureLogin(LOGINS.especial, { role: 'client', affiliateId: affId(LOGINS.especial.name), isSpecial: true }, passwords.especial);
  console.log('  logins: demo-admin, demo-afiliado, demo-especial ✔');

  const writes = [];
  const daysAgo = (n) => Timestamp.fromDate(addDays(today, -n));

  // 2) Casas manuais
  HOUSES.forEach((h, i) => {
    writes.push((b) => b.set(db.collection('houses').doc(h.slug), {
      slug: h.slug,
      name: h.name,
      brandId: null,
      logo: h.logo,
      registerUrlTemplate: null,
      active: true,
      order: i,
      dataSource: 'manual',
      defaultCpa: h.defaultCpa, // EUR (convenção /casas)
      defaultRev: h.defaultRev,
      createdByUid: adminUid,
      createdAt: daysAgo(70),
      updatedAt: daysAgo(70),
    }));
  });

  // 3) Afiliados nativos (mirror name-only) + status + configs + aliases dos logins
  const allNames = [...PRODUCERS.map((p) => p.name), ...QUIET];
  allNames.forEach((name, i) => {
    const id = affId(name);
    const isProducer = i < PRODUCERS.length;
    const primaryHouse = isProducer
      ? HOUSES.find((h) => HOUSE_ROSTER[h.slug].includes(i))?.name ?? null
      : null;
    writes.push((b) => b.set(db.collection('affiliates').doc(id), {
      id,
      name,
      brand: primaryHouse ? { name: primaryHouse } : null,
      source: 'boost',
      createdByUid: adminUid,
      createdAt: daysAgo(75 - i),
    }));
    // 2 quietos inativos (mostra o toggle de status na lista)
    const inactive = !isProducer && i >= allNames.length - 2;
    writes.push((b) => b.set(db.collection('affiliate_statuses').doc(id), {
      status: inactive ? 'inactive' : 'active',
      updatedAt: daysAgo(10),
    }));
  });
  PRODUCERS.forEach((p) => {
    if (p.cpaValue == null && p.revPercentage == null) return; // 2 sem config (ausência ≠ R$0)
    writes.push((b) => b.set(db.collection('affiliate_configs').doc(affId(p.name)), {
      affiliateId: affId(p.name),
      cpaValue: p.cpaValue,
      revPercentage: p.revPercentage,
      updatedAt: daysAgo(20),
    }));
  });
  for (const key of ['afiliado', 'especial']) {
    const l = LOGINS[key];
    writes.push((b) => b.set(db.collection('affiliate_email_aliases').doc(l.email.toLowerCase()), {
      email: l.email.toLowerCase(),
      affiliateId: affId(l.name),
      name: l.name,
      kind: 'boost',
      createdByUid: adminUid,
      createdAt: daysAgo(60),
    }));
  }

  // 4) Especial + sub-rede
  writes.push((b) => b.set(db.collection('special_affiliates').doc(affId(PRODUCERS[SPECIAL_INDEX].name)), {
    active: true,
    subAffiliateIds: SUB_INDICES.map((i) => affId(PRODUCERS[i].name)),
    updatedAt: daysAgo(30),
  }));

  // 5) Resultados manuais — janela EXATA (últimos 30 dias) + janela anterior (~87%)
  const allRows = buildAllRows(w1Days, w0Days);
  allRows.forEach((row) => {
    writes.push((b) => b.set(db.collection('house_results').doc(hrDocId(row.houseSlug, row.date, row.affiliateId)), {
      ...row,
      importedByUid: adminUid,
      importedAt: Timestamp.fromDate(addDays(new Date(`${row.date}T12:00:00`), 1)),
    }));
  });

  // 6) Avisos (feed/sino) + notificações do afiliado demo
  writes.push((b) => b.set(db.collection('notices').doc('demo-boas-vindas'), {
    title: 'Bem-vindo à demonstração AffiliaCore',
    body: 'Este ambiente usa dados fictícios. Explore o painel, o portal do afiliado, o ranking e a trilha de auditoria — tudo é funcional.',
    category: 'comunicado',
    audience: 'all',
    active: true,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
  }));
  writes.push((b) => b.set(db.collection('notices').doc('demo-fechamento'), {
    title: 'Fechamento semanal na sexta',
    body: 'Os resultados importados até quinta entram no fechamento da semana. Confira seus números no painel.',
    category: 'info',
    audience: 'clients',
    active: true,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  }));
  // 6.5) Premiações do ranking (chamariz): pills no pódio do /ranking + seção
  // pública na Home — mesma história numérica do resto da demo.
  const PRIZES = [
    { id: 'demo-premio-1', position: 1, title: 'R$ 5.000', description: 'Melhor comissão do mês' },
    { id: 'demo-premio-2', position: 2, title: 'R$ 2.000', description: 'Vice-campeão do mês' },
    { id: 'demo-premio-3', position: 3, title: 'R$ 1.000', description: 'Terceiro lugar do mês' },
  ];
  PRIZES.forEach((p) => writes.push((b) => b.set(db.collection('ranking_prizes').doc(p.id), {
    position: p.position,
    title: p.title,
    description: p.description,
    active: true,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(10),
  })));

  writes.push((b) => b.set(db.collection('user_notifications').doc('demo-notif-1'), {
    recipientUid: LOGINS.afiliado.uid,
    affiliateId: affId(LOGINS.afiliado.name),
    type: 'results_updated',
    houseSlug: 'superbet',
    houseName: 'Superbet',
    title: 'Novos resultados: Superbet',
    body: 'Sua produção na Superbet foi atualizada: novos cadastros e FTDs no período.',
    readAt: null,
    createdAt: daysAgo(1),
  }));

  // 7) Trilha de auditoria plausível (append-only; espelha o shape do servidor)
  const audit = (n, fields) => writes.push((b) => b.set(db.collection('audit_logs').doc(), {
    entityType: fields.entityType,
    entityId: fields.entityId ?? null,
    entityLabel: fields.entityLabel ?? null,
    action: fields.action,
    actorId: adminUid,
    actorName: LOGINS.admin.name,
    actorEmail: LOGINS.admin.email,
    changes: fields.changes ?? null,
    metadata: fields.metadata ?? null,
    reason: fields.reason ?? null,
    affiliateId: fields.entityType === 'affiliate' ? (fields.entityId ?? null) : null,
    createdAt: daysAgo(n),
  }));
  HOUSES.forEach((h, i) => audit(70 - i, {
    entityType: 'house', entityId: h.slug, entityLabel: h.name, action: 'house.create',
    metadata: { dataSource: 'manual' },
  }));
  audit(60, {
    entityType: 'affiliate', entityId: affId(PRODUCERS[0].name), entityLabel: PRODUCERS[0].name,
    action: 'affiliate.create_boost', metadata: { house: 'Superbet', hasEmail: true, invited: true },
  });
  audit(59, {
    entityType: 'affiliate', entityId: affId(PRODUCERS[1].name), entityLabel: PRODUCERS[1].name,
    action: 'affiliate.create_boost', metadata: { house: 'Superbet', hasEmail: true, invited: true },
  });
  audit(15, {
    entityType: 'affiliate_config', entityId: affId(PRODUCERS[0].name), entityLabel: PRODUCERS[0].name,
    action: 'config.update', changes: [{ field: 'cpaValue', before: 60, after: PRODUCERS[0].cpaValue }],
  });
  audit(2, {
    entityType: 'house_results', entityId: 'superbet', entityLabel: 'Superbet', action: 'house_results.import',
    metadata: { imported: 42, attributedAffiliates: 14 },
  });
  audit(1, {
    entityType: 'house_results', entityId: 'betano', entityLabel: 'Betano', action: 'house_results.import',
    metadata: { imported: 18, attributedAffiliates: 8 },
  });

  await commitChunked(writes);
  console.log(`  ${writes.length} writes commitados (${allRows.length} linhas de resultados) ✔`);

  return { passwords, w1: { startDate: toISO(w1Days[0]), endDate: toISO(w1Days[w1Days.length - 1]) } };
}

// Confere por QUERY que a janela de 30 dias bate com os alvos do mock.
async function verify(w1) {
  console.log('\n— VERIFICAÇÃO (query na janela últimos 30 dias) —');
  const snap = await db.collection('house_results')
    .where('date', '>=', w1.startDate)
    .where('date', '<=', w1.endDate)
    .get();
  const rows = snap.docs.map((d) => d.data());
  const acc = sumWindow(rows, w1.startDate, w1.endDate);
  const nAff = (await db.collection('affiliates').get()).size;
  const ok = reportAgainstTargets(acc, { affiliatesCount: nAff });
  if (!ok || nAff !== 38) throw new Error('Verificação falhou — totais não batem com os alvos.');
  console.log('  ✔ janela de 30 dias bate EXATA com o mock da LP.');
}

async function rotate() {
  console.log('\n— ROTAÇÃO DE SENHAS (revoga sessões) —');
  const out = {};
  for (const key of ['admin', 'afiliado', 'especial']) {
    const l = LOGINS[key];
    const user = await admin.auth().getUserByEmail(l.email); // lança se não existir (rode o seed antes)
    const password = newPassword();
    await admin.auth().updateUser(user.uid, { password });
    await admin.auth().revokeRefreshTokens(user.uid);
    out[l.email] = password;
  }
  return out;
}

function printLogins(passwords) {
  console.log('\n=== LOGINS DA DEMO (entregue por canal seguro; --rotate renova) ===');
  console.log(`  admin    ${LOGINS.admin.email}    ${passwords.admin ?? passwords[LOGINS.admin.email]}`);
  console.log(`  afiliado ${LOGINS.afiliado.email} ${passwords.afiliado ?? passwords[LOGINS.afiliado.email]}`);
  console.log(`  especial ${LOGINS.especial.email} ${passwords.especial ?? passwords[LOGINS.especial.email]}`);
}

// ---------------------------------------------------------------------------
async function main() {
  if (MODE.plan) {
    // Sem Firebase: valida a matemática de alocação em memória.
    const today = new Date();
    const w1Days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
    const w0Days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 59));
    const rows = buildAllRows(w1Days, w0Days);
    console.log(`— PLAN (em memória, sem Firebase) — ${rows.length} linhas geradas`);
    const acc = sumWindow(rows, toISO(w1Days[0]), toISO(w1Days[29]));
    const ok = reportAgainstTargets(acc);
    const yISO = toISO(addDays(today, -1));
    const yAffs = new Set(rows.filter((r) => r.date === yISO && r.total_commission > 0).map((r) => r.affiliateId));
    console.log(`  afiliados com comissão ONTEM (ranking): ${yAffs.size} (mínimo esperado: 10)`);
    const badCells = rows.filter((r) => r.first_deposits > r.registrations || r.qualified_cpa > r.first_deposits);
    console.log(`  células violando reg ≥ ftd ≥ cpa: ${badCells.length}`);
    if (!ok || yAffs.size < 10 || badCells.length > 0) throw new Error('Plan falhou — ajuste a alocação.');
    console.log('  ✔ plan OK.');
    return;
  }

  initAdmin();
  const projectId = resolveProjectId();
  console.log(`Projeto alvo: ${projectId}`);
  if (projectId !== EXPECT_PROJECT) {
    throw new Error(
      `GUARD: este script só roda no projeto "${EXPECT_PROJECT}" (recebeu "${projectId}"). ` +
      'Ele APAGA coleções inteiras — jamais aponte para um projeto de instância real.'
    );
  }

  if (MODE.rotate) {
    const pw = await rotate();
    printLogins(pw);
    return;
  }
  if (MODE.verifyOnly) {
    const today = new Date();
    await verify({ startDate: toISO(addDays(today, -29)), endDate: toISO(today) });
    return;
  }
  if (MODE.wipe) {
    if (!MODE.yes) throw new Error('O wipe apaga coleções inteiras e logins: confirme com --yes.');
    await wipe();
    if (MODE.wipeOnly) { console.log('\n✔ Wipe concluído (sem re-seed).'); return; }
  }

  // Nomes dos logins dependem dos produtores — preenche antes (também no rotate? não: rotate usa e-mail).
  LOGINS.afiliado.name = PRODUCERS[0].name;
  LOGINS.especial.name = PRODUCERS[SPECIAL_INDEX].name;

  const { passwords, w1 } = await seed();
  await verify(w1);
  printLogins(passwords);
  console.log('\n✔ Demo semeada. Próximos: gerar o ranking do dia no /ranking (admin) e conferir o smoke do playbook.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nERRO:', e.message || e); process.exit(1); });
