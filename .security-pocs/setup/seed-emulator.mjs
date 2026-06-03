// seed-emulator.mjs
// Popula o Firestore/Auth EMULATOR com dados fictícios para as PoCs.
// NUNCA toca produção: exige FIRESTORE_EMULATOR_HOST setado e projectId "demo-*".
//
// Uso:
//   export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
//   export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
//   node .security-pocs/setup/seed-emulator.mjs
//
// Requer: firebase-admin (já no projeto).

import admin from 'firebase-admin';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-boost';

// ---- Salvaguardas anti-produção -------------------------------------------
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('✖ FIRESTORE_EMULATOR_HOST não está setado. Recusando rodar (proteção anti-produção).');
  console.error('  export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080" antes de rodar.');
  process.exit(1);
}
if (!PROJECT_ID.startsWith('demo-')) {
  console.error(`✖ projectId "${PROJECT_ID}" não começa com "demo-". Recusando rodar.`);
  process.exit(1);
}
// ---------------------------------------------------------------------------

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const auth = admin.auth();

async function main() {
  console.log(`→ Seeding emulator project="${PROJECT_ID}" firestore=${process.env.FIRESTORE_EMULATOR_HOST}`);

  // 1) Um admin LEGÍTIMO (semeado fora do cliente, como o patch recomenda).
  const adminUid = 'seed-admin-uid';
  await auth.createUser({ uid: adminUid, email: 'owner@boost.local', password: 'Passw0rd!' }).catch(() => {});
  await db.collection('users').doc(adminUid).set({
    uid: adminUid, email: 'owner@boost.local', name: 'Owner', role: 'admin',
  });

  // 2) Um afiliado vítima com PII de pagamento (o que o privesc vaza).
  const victimAff = 'AFF-1001';
  await db.collection('users').doc('victim-client-uid').set({
    uid: 'victim-client-uid', email: 'victima@boost.local', name: 'Afiliado Vitima',
    role: 'client', affiliateId: victimAff,
  });
  await db.collection('payment_profiles').doc(victimAff).set({
    affiliateId: victimAff,
    pixKey: '123.456.789-00',
    legalName: 'Maria Vitima da Silva',
    cpfCnpj: '12345678900',
    address: 'Rua das Flores 123, São Paulo/SP',
  });

  // 3) Config sensível adicional.
  await db.collection('affiliate_configs').doc(victimAff).set({
    affiliateId: victimAff, cpaValue: 150, revPercentage: 30,
  });
  await db.collection('settings').doc('global').set({ maintenance: false });

  console.log('✓ Seed concluído:');
  console.log('  - users/seed-admin-uid       (role=admin, legítimo)');
  console.log('  - users/victim-client-uid    (role=client, affiliateId=AFF-1001)');
  console.log('  - payment_profiles/AFF-1001  (PIX/CPF/endereço — alvo do vazamento)');
  console.log('  - affiliate_configs/AFF-1001, settings/global');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
