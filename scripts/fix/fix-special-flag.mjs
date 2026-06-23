// ============================================================================
// Corrige o sintoma do `isSpecial` DESSINCRONIZADO: um afiliado ESPECIAL não vê
// a aba "Afiliados" na sidebar porque `users/{uid}.isSpecial` está ausente/false
// enquanto `special_affiliates/{affiliateId}` existe e está ativo.
// ----------------------------------------------------------------------------
// Espelha a mesma regra do endpoint /api/link-affiliate-user (server.ts):
//   isSpecial = special_affiliates/{affiliateId} existe && active !== false
// e reconcilia `users/{uid}.isSpecial` nos dois sentidos (liga e desliga).
//
// Auth do Admin SDK (igual ao server.ts): usa FIREBASE_SERVICE_ACCOUNT_KEY se
// presente, senão as credenciais default (GOOGLE_APPLICATION_CREDENTIALS=
// ./service-account.json). Rode da raiz do repo.
//
// USO:
//   node scripts/fix/fix-special-flag.mjs "carlos marcos"   # filtra por nome/e-mail/uid/affiliateId
//   node scripts/fix/fix-special-flag.mjs --all             # reconcilia TODOS os logins
//   node scripts/fix/fix-special-flag.mjs "carlos" --dry    # só mostra, não grava
// ============================================================================
import 'dotenv/config';
import { readFileSync } from 'fs';
import admin from 'firebase-admin';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const all = args.includes('--all');
const term = args.filter((a) => !a.startsWith('--')).join(' ').trim().toLowerCase();

if (!all && !term) {
  console.error('Uso: node scripts/fix/fix-special-flag.mjs "<nome|email|uid|affiliateId>" [--dry]');
  console.error('  ou: node scripts/fix/fix-special-flag.mjs --all [--dry]');
  process.exit(1);
}

// init admin (mesma lógica do server.ts)
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
} else {
  try {
    const sa = JSON.parse(readFileSync('./service-account.json', 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  } catch {
    admin.initializeApp(); // ADC (GOOGLE_APPLICATION_CREDENTIALS)
  }
}
const db = admin.firestore();

// 1) carrega special_affiliates (id -> ativo?)
const specialSnap = await db.collection('special_affiliates').get();
const specialActive = new Map();
specialSnap.forEach((d) => specialActive.set(d.id, d.data()?.active !== false));

// 2) seleciona os logins-alvo
const usersSnap = await db.collection('users').get();
const matches = usersSnap.docs.filter((d) => {
  if (all) return true;
  const u = d.data();
  const hay = [d.id, u.uid, u.name, u.email, u.affiliateId]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
  return hay.some((h) => h.includes(term));
});

if (!matches.length) {
  console.log(`\n⚠️  Nenhum login encontrado para "${term}".`);
  process.exit(0);
}

console.log(`\n🔎 ${matches.length} login(s) avaliado(s)${dryRun ? '  (DRY RUN — nada será gravado)' : ''}:\n`);

let changed = 0;
for (const doc of matches) {
  const u = doc.data();
  const affId = u.affiliateId ? String(u.affiliateId) : null;
  const isSpecialActual = u.isSpecial === true;

  if (!affId) {
    console.log(`   • ${u.name || u.email || doc.id} — sem affiliateId vinculado → use "Vincular Login" (/affiliates). PULADO.`);
    continue;
  }

  const linkedSpecial = specialActive.has(affId);
  const desired = linkedSpecial && specialActive.get(affId) === true;

  if (desired === isSpecialActual) {
    console.log(`   • ${u.name || u.email || doc.id} [aff ${affId}] — isSpecial=${isSpecialActual} já correto. OK.`);
    continue;
  }

  console.log(`   ✏️  ${u.name || u.email || doc.id} [aff ${affId}] — isSpecial: ${isSpecialActual} → ${desired}` +
    (linkedSpecial ? '' : '  (não é especial)'));

  if (!dryRun) {
    await doc.ref.set({
      isSpecial: desired,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  changed++;
}

console.log(`\n${dryRun ? '🧪 DRY RUN:' : '✅ Concluído.'} ${changed} login(s) ${dryRun ? 'seriam alterados' : 'alterados'}.`);
console.log('   (O afiliado precisa recarregar a página/refazer login para a sidebar atualizar.)\n');
process.exit(0);
