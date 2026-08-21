// ============================================================================
// Conserta links de divulgação emitidos com o PLACEHOLDER CRU na URL.
// ----------------------------------------------------------------------------
// O QUE ACONTECEU (Infinity, medido em 20/08/2026): a aprovação de parceria do
// marketplace gravava `houses.registerUrlTemplate` sem substituir o placeholder,
// então o link ia para a casa com o literal `{tag}` (LEON) ou `{ref}` (Fomento:
// Blaze/KTO/Winhugo). Consequências:
//
//   1. todo afiliado daquela casa chega no relatório sob a MESMA tag;
//   2. `{tag}` tem cara de tag válida, então o índice de atribuição a aceitava e
//      dava o resultado de TODOS ao primeiro link da ordem de leitura;
//   3. como resolvia, nada caía em "pendente" e o erro não aparecia em tela.
//
// A causa raiz está corrigida no `server.ts` (commit "Link de parceria sai com a
// tag do afiliado"), mas o código só conserta na PRÓXIMA aprovação, e essas
// parcerias já estão aprovadas. Este script é a migração do dado já gravado.
//
// DECISÕES (leia antes de rodar):
//   • O template usado é a PRÓPRIA `registerUrl` do link, não a da casa. O link
//     guarda a oferta/criativo que foi combinado com aquele afiliado (no Fomento
//     cada casa tem seu `o=`), e reescrever pela casa poderia trocar a oferta
//     dele. O script AVISA quando as duas divergem.
//   • Tag por afiliado × casa, que é o mesmo comportamento de
//     `/api/affiliate-links/generate` (idempotente por afiliado×casa). Tag já
//     gravada no doc é REAPROVEITADA; placeholder gravado não conta como tag.
//   • Link do pool (standby, sem dono) é ignorado: ele não atribui nada.
//   • ⚠️ O link antigo PARA de atribuir a partir da troca. Quem já divulgou a URL
//     quebrada precisa passar a divulgar a nova. O `code` (e portanto o /go/) NÃO
//     muda, então quem compartilhou o link da plataforma não precisa fazer nada.
//
// USO (dry-run por padrão: não grava nada):
//   npx tsx scripts/fix/fix-link-placeholders.ts --sa service-account.infinity.json
//   npx tsx scripts/fix/fix-link-placeholders.ts --sa service-account.infinity.json --house leon-bet
//   npx tsx scripts/fix/fix-link-placeholders.ts --sa service-account.infinity.json --apply
// ============================================================================
import { readFileSync } from 'fs';
import admin from 'firebase-admin';
import { buildTaggedUrl, suggestTag, hasUnresolvedPlaceholder } from '../../src/lib/linkGeneration';
import { normalizeTag } from '../../src/lib/houseTagImport';
import { extractTagFromUrl } from '../../src/lib/linkTriage';

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const apply = args.includes('--apply');
const saPath = flag('sa');
const houseFilter = flag('house');
const tagPrefix = flag('prefix'); // ex.: --prefix infinitw

// --- credencial: explícita vence, para não escrever na instância errada -------
if (saPath) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(saPath, 'utf8'))) });
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
} else {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./service-account.json', 'utf8'))) });
  } catch {
    admin.initializeApp(); // ADC
  }
}
const db = admin.firestore();
const projectId = (admin.app().options.credential as any)?.projectId
  ?? (admin.app().options as any)?.projectId
  ?? process.env.GOOGLE_CLOUD_PROJECT
  ?? '(desconhecido)';

const line = (s = '') => console.log(s);
const money = (n: unknown) => Number(n ?? 0);

async function main() {
  line('='.repeat(78));
  line(`PROJETO: ${projectId}`);
  line(`MODO:    ${apply ? '*** APPLY (grava no Firestore) ***' : 'dry-run (não grava nada)'}`);
  if (houseFilter) line(`CASA:    ${houseFilter}`);
  line('='.repeat(78));

  const [linksSnap, aliasSnap, affsSnap, housesSnap] = await Promise.all([
    db.collection('affiliate_links').get(),
    db.collection('affiliate_tag_aliases').get(),
    db.collection('affiliates').get(),
    db.collection('houses').get(),
  ]);

  const nameOf = new Map<string, string>();
  affsSnap.forEach((d) => nameOf.set(d.id, String((d.data() as any)?.name ?? '').trim()));

  // Template atual de cada casa, só para AVISAR de divergência (não é o que usamos).
  const houseTemplate = new Map<string, string>();
  housesSnap.forEach((d) => {
    const h = d.data() as any;
    const tpl = String(h?.registerUrlTemplate ?? '').trim();
    for (const key of [h?.brandId, h?.slug, d.id]) {
      const k = String(key ?? '').trim();
      if (k && tpl) houseTemplate.set(k, tpl);
    }
  });

  // Índice tag -> dono, MESMA regra do `loadTagOwners` do server.ts: serve para
  // não sugerir uma tag que já é de outra pessoa. Placeholder fica de fora — se
  // entrasse, reservaria "{tag}" como se fosse a tag de alguém.
  const ownerByTag = new Map<string, string>();
  for (const d of linksSnap.docs) {
    const data = d.data() as any;
    const owner = String(data?.affiliateId ?? '').trim();
    const tag = normalizeTag(data?.tag) || normalizeTag(extractTagFromUrl(String(data?.registerUrl ?? '')));
    if (!tag || hasUnresolvedPlaceholder(tag)) continue;
    // Link do POOL entra com dono vazio: a tag já foi cunhada na casa e não pode
    // ser sugerida a mais ninguém. Dono real vence o pool.
    const prev = ownerByTag.get(tag);
    if (prev === undefined || (!prev && owner)) ownerByTag.set(tag, owner);
  }
  for (const d of aliasSnap.docs) {
    const data = d.data() as any;
    const tag = normalizeTag(data?.tag ?? d.id);
    const owner = String(data?.affiliateId ?? '').trim();
    if (tag && owner) ownerByTag.set(tag, owner);
  }

  interface Plan {
    code: string;
    affiliateId: string;
    who: string;
    brandId: string;
    tagBefore: string;
    tagAfter: string;
    tagFrom: 'doc' | 'novo';
    urlBefore: string;
    urlAfter: string;
    clicks: number;
    divergeDaCasa: boolean;
  }
  const plans: Plan[] = [];
  const skipped: string[] = [];

  for (const d of linksSnap.docs) {
    const l = d.data() as any;
    const urlBefore = String(l?.registerUrl ?? '');
    if (!hasUnresolvedPlaceholder(urlBefore)) continue; // já está são
    const brandId = String(l?.brandId ?? '').trim();
    if (houseFilter && brandId !== houseFilter) continue;

    const affiliateId = String(l?.affiliateId ?? '').trim();
    if (!affiliateId) {
      skipped.push(`${d.id} (pool/standby, sem dono — não atribui nada)`);
      continue;
    }

    const storedTag = normalizeTag(l?.tag);
    const reuse = storedTag && !hasUnresolvedPlaceholder(storedTag) ? storedTag : '';
    const tagAfter = reuse || suggestTag(
      { name: nameOf.get(affiliateId) ?? '', affiliateId },
      ownerByTag.keys(),
      tagPrefix,
    );
    // Reserva JÁ: sem isto, dois links do mesmo afiliado (ou de xarás) receberiam
    // a mesma tag nesta rodada e um roubaria o resultado do outro.
    ownerByTag.set(tagAfter, affiliateId);

    const urlAfter = buildTaggedUrl(urlBefore, tagAfter);
    if (!urlAfter || hasUnresolvedPlaceholder(urlAfter)) {
      skipped.push(`${d.id} (não consegui montar a URL a partir de "${urlBefore}")`);
      continue;
    }

    const tplCasa = houseTemplate.get(brandId) ?? '';
    plans.push({
      code: d.id,
      affiliateId,
      who: nameOf.get(affiliateId) || affiliateId,
      brandId,
      tagBefore: storedTag || '(nenhuma)',
      tagAfter,
      tagFrom: reuse ? 'doc' : 'novo',
      urlBefore,
      urlAfter,
      clicks: money(l?.clicks),
      divergeDaCasa: !!tplCasa && tplCasa !== urlBefore,
    });
  }

  if (!plans.length) {
    line('\nNenhum link com placeholder por corrigir.');
    if (skipped.length) { line('\nIgnorados:'); skipped.forEach((s) => line(`  - ${s}`)); }
    return;
  }

  const porCasa = new Map<string, number>();
  plans.forEach((p) => porCasa.set(p.brandId, (porCasa.get(p.brandId) ?? 0) + 1));
  line(`\n${plans.length} link(es) a corrigir: ${[...porCasa].map(([h, n]) => `${h}=${n}`).join('  ')}\n`);

  for (const p of plans) {
    line(`  ${p.code}  ${p.brandId.padEnd(14)} ${p.who.slice(0, 26).padEnd(26)} cliques=${p.clicks}`);
    line(`     tag:  ${p.tagBefore}  ->  ${p.tagAfter}  (${p.tagFrom})`);
    line(`     de:   ${p.urlBefore}`);
    line(`     para: ${p.urlAfter}`);
    if (p.divergeDaCasa) {
      line('     ⚠️  a casa tem OUTRO template hoje; mantive a oferta que estava neste link.');
    }
  }
  if (skipped.length) { line('\nIgnorados:'); skipped.forEach((s) => line(`  - ${s}`)); }

  // Xará vira colisão silenciosa: duas pessoas com a mesma tag fazem o índice
  // dar o resultado de uma à outra. Barra a rodada inteira, não só a linha.
  const porTag = new Map<string, Set<string>>();
  plans.forEach((p) => porTag.set(p.tagAfter, (porTag.get(p.tagAfter) ?? new Set()).add(p.affiliateId)));
  const colisoes = [...porTag].filter(([, donos]) => donos.size > 1);
  if (colisoes.length) {
    line('\n❌ ABORTADO: a mesma tag ficaria com donos diferentes:');
    colisoes.forEach(([tag, donos]) => line(`   "${tag}" -> ${[...donos].join(', ')}`));
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    line('\n(dry-run: nada gravado. Rode de novo com --apply para aplicar.)');
    return;
  }

  // --- escrita ---------------------------------------------------------------
  line('\nAplicando...');
  const batch = db.batch();
  for (const p of plans) {
    batch.set(
      db.collection('affiliate_links').doc(p.code),
      { tag: p.tagAfter, registerUrl: p.urlAfter, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    // Trilha: mexer em link é mexer em atribuição, e atribuição é dinheiro.
    batch.set(db.collection('audit_logs').doc(), {
      entityType: 'affiliate',
      entityId: p.affiliateId,
      entityLabel: p.who,
      action: 'link.retag',
      actorId: null,
      actorName: 'scripts/fix/fix-link-placeholders.ts',
      actorEmail: null,
      changes: [
        { field: 'tag', before: p.tagBefore === '(nenhuma)' ? null : p.tagBefore, after: p.tagAfter },
        { field: 'registerUrl', before: p.urlBefore, after: p.urlAfter },
      ],
      metadata: { code: p.code, brandId: p.brandId, motivo: 'placeholder cru na URL emitida pela aprovação de parceria' },
      reason: 'Correção do link emitido com {tag}/{ref} literal',
      affiliateId: p.affiliateId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  line(`  ${plans.length} link(es) gravados + ${plans.length} entradas de auditoria.`);

  // --- verificação (reler do banco, não confiar no que acabamos de mandar) ----
  line('\nVerificando...');
  const check = await db.collection('affiliate_links').get();
  const aindaQuebrados: string[] = [];
  const conferidos: string[] = [];
  check.forEach((d) => {
    const l = d.data() as any;
    if (!String(l?.affiliateId ?? '').trim()) return;
    if (hasUnresolvedPlaceholder(String(l?.registerUrl ?? ''))) aindaQuebrados.push(`${d.id} (${l?.brandId})`);
    const alvo = plans.find((p) => p.code === d.id);
    if (alvo && l?.registerUrl === alvo.urlAfter && normalizeTag(l?.tag) === alvo.tagAfter) conferidos.push(d.id);
  });
  line(`  ${conferidos.length}/${plans.length} links conferidos com a URL e a tag novas.`);
  if (aindaQuebrados.length) {
    line(`  ⚠️ ainda com placeholder: ${aindaQuebrados.join(', ')}`);
    if (houseFilter) line('     (esperado: você filtrou por --house; rode sem o filtro para os demais)');
    process.exitCode = 1;
  } else {
    line('  ✅ nenhum link atribuído ficou com placeholder.');
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => { console.error('ERRO:', e); process.exit(1); });
