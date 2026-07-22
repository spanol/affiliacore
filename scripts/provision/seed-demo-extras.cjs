#!/usr/bin/env node
/**
 * SEED EXTRAS · demo "gigante" para gravação (reels) — SÓ EMULADOR.
 *
 * Roda DEPOIS do seed base (`seed-demo.cjs --wipe --yes`), que popula o núcleo
 * (dashboard/afiliados/auditoria/ranking/portal/avisos/prêmios/rede). Este script é
 * ADITIVO e faz duas coisas:
 *   1) INFLA a operação p/ parecer uma agência grande: +95 afiliados, +3 casas,
 *      +milhares de linhas de resultado (headline sobe p/ centenas de milhares/mês);
 *   2) POPULA os módulos que o seed base não cobre (branch feat/integracao-affility):
 *      carteira (payment_profiles + withdrawal_requests em TODOS os status),
 *      jurídico (legal_documents versionados + legal_acceptances), marketplace
 *      (deals + partnership_requests), links de divulgação (affiliate_links +
 *      link_click_stats + link_clicks), contatos, mensagens diretas e histórico de
 *      daily_rankings.
 *
 * Uso (com os emuladores no ar):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=affiliacore \
 *   GOOGLE_CLOUD_PROJECT=affiliacore node scripts/provision/seed-demo-extras.cjs
 *
 * SEGURANÇA: aborta se FIRESTORE_EMULATOR_HOST NÃO estiver setado (nunca toca um
 * Firestore real) e se o projeto não for `affiliacore`.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Guards + init
// ---------------------------------------------------------------------------
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('ABORTADO: FIRESTORE_EMULATOR_HOST não está setado. Este script só roda contra o emulador.');
  process.exit(1);
}
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'affiliacore';
if (PROJECT !== 'affiliacore') {
  console.error(`ABORTADO: projeto "${PROJECT}" != "affiliacore".`);
  process.exit(1);
}
admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const { Timestamp, FieldValue } = admin.firestore;

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
const EXTRA_HOUSES = [
  { slug: 'kto', name: 'KTO', defaultCpa: 20, defaultRev: 30 },
  { slug: 'novibet', name: 'Novibet', defaultCpa: 19, defaultRev: 28 },
  { slug: 'vaidebet', name: 'Vai de Bet', defaultCpa: 17, defaultRev: 25 },
];
const REGISTER_URL = {
  superbet: 'https://superbet.bet.br/cadastro',
  betano: 'https://www.betano.bet.br/register',
  betmgm: 'https://br.betmgm.com/cadastro',
  kto: 'https://www.kto.bet.br/cadastro',
  novibet: 'https://www.novibet.bet.br/registo',
  vaidebet: 'https://vaidebet.bet.br/cadastro',
};
const HOUSE_NAME = { superbet: 'Superbet', betano: 'Betano', betmgm: 'BetMGM', kto: 'KTO', novibet: 'Novibet', vaidebet: 'Vai de Bet' };

const fakeCpf = () => `${between(100, 999)}.${between(100, 999)}.${between(100, 999)}-${between(10, 99)}`;
const fakeCnpj = () => `${between(10, 99)}.${between(100, 999)}.${between(100, 999)}/0001-${between(10, 99)}`;
const fakeAddress = () => `${pick(RUAS)}, ${between(10, 1999)} - ${pick(CIDADES)}`;

// ---------------------------------------------------------------------------
async function main() {
  console.log('== SEED EXTRAS (demo gigante · emulador) ==');
  console.log(`Projeto: ${PROJECT} · emulador: ${process.env.FIRESTORE_EMULATOR_HOST}`);

  // 0) Limpeza defensiva das coleções que o seed base NÃO conhece (p/ re-run) +
  //    afiliados extras de uma rodada anterior (marcados demoExtra).
  const OWN_COLLECTIONS = ['deals', 'partnership_requests', 'legal_documents', 'legal_acceptances', 'withdrawal_requests'];
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
  console.log(`  base: ${Object.keys(baseNames).length} afiliados, ${baseProducerIds.length} com config, ${clientUsers.length} logins cliente`);

  const HOUSE_SLUGS = ['superbet', 'betano', 'betmgm', ...EXTRA_HOUSES.map((h) => h.slug)];
  const writes = [];

  // 2) Casas: adiciona as extras + carimba registerUrlTemplate em TODAS (p/ links ativos)
  EXTRA_HOUSES.forEach((h, i) => writes.push((b) => b.set(db.collection('houses').doc(h.slug), {
    slug: h.slug, name: h.name, brandId: null, logo: null,
    registerUrlTemplate: `${REGISTER_URL[h.slug]}?wm={affiliateId}`,
    active: true, order: 10 + i, dataSource: 'manual',
    defaultCpa: h.defaultCpa, defaultRev: h.defaultRev,
    createdByUid: adminUid, createdAt: daysAgoTs(65), updatedAt: daysAgoTs(65),
  })));
  ['superbet', 'betano', 'betmgm'].forEach((slug) => writes.push((b) => b.set(
    db.collection('houses').doc(slug),
    { registerUrlTemplate: `${REGISTER_URL[slug]}?wm={affiliateId}`, updatedAt: daysAgoTs(40) },
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
  const mkWithdrawal = (id, name, amount, status, ageDays, note) => {
    const ref = db.collection('withdrawal_requests').doc();
    const decided = status !== 'requested';
    writes.push((b) => b.set(ref, {
      affiliateId: id, amount: money(amount), status,
      note: note || null,
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
      mkWithdrawal(p.id, p.name, between(400, 12000) + rnd(), pick(STATUS_POOL), between(1, 55), rnd() < 0.4 ? `Referente a ${pick(['junho', 'julho', 'quinzena', 'fechamento mensal'])}` : null);
      wCount++;
    }
  });
  // carteira RICA p/ o afiliado demo (Yago): garante cards Pendente/Aprovado/Pago
  if (demoAfiliado) {
    const id = demoAfiliado.affiliateId;
    const nm = baseNames[id] || 'Afiliado';
    ensureProfile(id, nm);
    mkWithdrawal(id, nm, 2450.00, 'paid', 40, 'Referente a maio');
    mkWithdrawal(id, nm, 3120.50, 'paid', 22, 'Referente a junho');
    mkWithdrawal(id, nm, 1890.00, 'approved', 6, 'Fechamento quinzenal');
    mkWithdrawal(id, nm, 2760.00, 'requested', 1, 'Referente a julho');
    mkWithdrawal(id, nm, 500.00, 'rejected', 33, 'Valor abaixo do mínimo combinado');
    wCount += 5;
  }

  // 7) deals (marketplace) — variados, quase todos ativos
  const DEALS = [
    { slug: 'superbet', model: 'cpa', cpaValue: 250, revPercentage: 0, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true },
    { slug: 'superbet', model: 'hybrid', cpaValue: 150, revPercentage: 20, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true },
    { slug: 'betano', model: 'revshare', cpaValue: 0, revPercentage: 35, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true },
    { slug: 'betmgm', model: 'cpa', cpaValue: 220, revPercentage: 0, cycle: 'quinzenal', currency: 'BRL', geo: 'Brasil', active: true },
    { slug: 'kto', model: 'hybrid', cpaValue: 180, revPercentage: 25, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true },
    { slug: 'kto', model: 'revshare', cpaValue: 0, revPercentage: 40, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true },
    { slug: 'novibet', model: 'cpa', cpaValue: 200, revPercentage: 0, cycle: 'semanal', currency: 'BRL', geo: 'Brasil', active: true },
    { slug: 'vaidebet', model: 'cpa', cpaValue: 190, revPercentage: 0, cycle: 'mensal', currency: 'BRL', geo: 'Brasil', active: true },
    { slug: 'betano', model: 'cpa', cpaValue: 210, revPercentage: 0, cycle: 'mensal', currency: 'EUR', geo: 'Brasil', active: false },
    { slug: 'novibet', model: 'hybrid', cpaValue: 160, revPercentage: 22, cycle: 'quinzenal', currency: 'BRL', geo: 'Brasil', active: true },
  ];
  const MODEL_LABEL = { cpa: 'CPA', revshare: 'RevShare', hybrid: 'Híbrido' };
  const CYCLE_LABEL = { semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };
  const dealLabel = (d) => [HOUSE_NAME[d.slug], MODEL_LABEL[d.model], CYCLE_LABEL[d.cycle], d.currency, d.geo]
    .filter((p) => p && String(p).length).join(' - ');
  const dealDocs = DEALS.map((d, i) => {
    const id = `demo-deal-${i + 1}`;
    writes.push((b) => b.set(db.collection('deals').doc(id), {
      houseId: d.slug, operatorName: HOUSE_NAME[d.slug], model: d.model,
      cpaValue: d.cpaValue, revPercentage: d.revPercentage, cycle: d.cycle,
      currency: d.currency, geo: d.geo, active: d.active, order: i,
      label: dealLabel(d), createdByUid: adminUid,
      createdAt: daysAgoTs(60 - i), updatedAt: daysAgoTs(between(1, 30)),
    }));
    return { id, ...d, operatorName: HOUSE_NAME[d.slug], label: dealLabel(d) };
  });
  const activeDeals = dealDocs.filter((d) => d.active);

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
  for (const col of ['affiliates', 'affiliate_configs', 'houses', 'house_results', 'payment_profiles', 'withdrawal_requests', 'deals', 'partnership_requests', 'affiliate_links', 'link_click_stats', 'link_clicks', 'legal_documents', 'legal_acceptances', 'contacts', 'direct_messages', 'daily_rankings']) {
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
  console.log('\n✔ Extras semeados.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nERRO:', e && e.stack ? e.stack : e); process.exit(1); });
