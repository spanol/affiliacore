#!/usr/bin/env node
/**
 * Migração 2FA · Firebase Multi-Factor (Identity Platform) → TOTP próprio.
 *
 * O 2FA antigo era o `TotpMultiFactorGenerator` do Firebase: o desafio era imposto
 * pelo PRÓPRIO Firebase no sign-in (`auth/multi-factor-auth-required`) e resolvido
 * por um `MultiFactorResolver` no client. O app novo não tem mais esse caminho —
 * quem ainda estiver inscrito no fator do Firebase FICA SEM CONSEGUIR ENTRAR,
 * porque o sign-in continua exigindo um desafio que a tela não sabe mais responder.
 *
 * >> RODE ESTE SCRIPT ANTES (ou logo após) subir a versão nova, em CADA instância. <<
 *
 * Ele varre os usuários do Auth e:
 *   • lista quem tem fator do Firebase MFA inscrito;
 *   • com --apply, desinscreve o fator (`multiFactor.enrolledFactors = []`).
 * O usuário volta a entrar só com a senha e reativa o 2FA em /profile — agora no
 * TOTP da AffiliaCore, que não depende do Identity Platform.
 *
 * Uso (na raiz do repo, com o service-account.json DA INSTÂNCIA):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/mfa/migrate-off-firebase-mfa.cjs            # dry-run (só lista)
 *     node scripts/mfa/migrate-off-firebase-mfa.cjs --apply    # aplica
 *
 * Suporte pós-migração — quem perdeu o celular E os códigos de backup:
 *     node scripts/mfa/migrate-off-firebase-mfa.cjs --reset-totp usuario@cliente.com --apply
 * Apaga `auth_totp/{uid}` + as claims do 2FA novo, devolvendo a conta ao login por
 * senha. AÇÃO SENSÍVEL: confirme a identidade da pessoa fora do sistema antes.
 */
const admin = require('firebase-admin');

const has = (flag) => process.argv.includes(`--${flag}`);
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const apply = has('apply');
const resetEmail = (arg('reset-totp') || '').trim().toLowerCase();

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
} else {
  admin.initializeApp(); // GOOGLE_APPLICATION_CREDENTIALS
}
const db = admin.firestore();

// Zera o 2FA NOVO (TOTP próprio) de uma conta: doc do segredo + custom claims.
async function resetOwnTotp(email) {
  const user = await admin.auth().getUserByEmail(email);
  const snap = await db.collection('auth_totp').doc(user.uid).get();
  console.log(`\n${email} (uid ${user.uid}) — 2FA próprio: ${snap.exists ? 'ATIVO' : 'ausente'}`);
  if (!apply) {
    console.log('  (dry-run) rode de novo com --apply para zerar.');
    return;
  }
  const claims = { ...(user.customClaims || {}) };
  delete claims.totpEnabled;
  delete claims.mfaAuthTime;
  delete claims.mfaVerifiedAt;
  await admin.auth().setCustomUserClaims(user.uid, claims);
  await db.collection('auth_totp').doc(user.uid).delete();
  console.log('  ✔ zerado — a conta volta a entrar só com a senha e pode reativar o 2FA em /profile.');
}

// Percorre TODOS os usuários do Auth em páginas de 1000 (listUsers é paginado).
async function migrateFirebaseMfa() {
  let pageToken;
  let scanned = 0;
  const enrolled = [];

  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const user of page.users) {
      scanned += 1;
      const factors = user.multiFactor?.enrolledFactors || [];
      if (factors.length > 0) enrolled.push({ user, factors });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`\nUsuários varridos: ${scanned}`);
  console.log(`Com fator do Firebase MFA inscrito: ${enrolled.length}`);

  if (enrolled.length === 0) {
    console.log('\nNada a migrar — nenhuma conta depende do Identity Platform. ✔');
    return;
  }

  for (const { user, factors } of enrolled) {
    const tipos = factors.map((f) => f.factorId || '?').join(', ');
    console.log(`  • ${user.email || user.uid} — fator(es): ${tipos}`);
  }

  if (!apply) {
    console.log('\n(dry-run) Nada foi alterado. Rode de novo com --apply para desinscrever.');
    console.log('ATENÇÃO: enquanto não rodar, estas contas NÃO conseguem entrar na versão nova.');
    return;
  }

  let ok = 0;
  for (const { user } of enrolled) {
    try {
      await admin.auth().updateUser(user.uid, { multiFactor: { enrolledFactors: [] } });
      ok += 1;
      console.log(`  ✔ ${user.email || user.uid} — fator do Firebase removido.`);
    } catch (error) {
      console.error(`  ✘ ${user.email || user.uid} — falhou: ${error.message}`);
    }
  }
  console.log(`\n${ok}/${enrolled.length} contas migradas. Peça a elas que reativem o 2FA em /profile.`);
}

(async () => {
  try {
    if (resetEmail) await resetOwnTotp(resetEmail);
    else await migrateFirebaseMfa();
    process.exit(0);
  } catch (error) {
    console.error('\nFalhou:', error.message);
    process.exit(1);
  }
})();
