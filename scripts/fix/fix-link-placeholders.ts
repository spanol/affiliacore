// ============================================================================
// Conserta links de divulgação emitidos SEM a tag do afiliado na URL.
// ----------------------------------------------------------------------------
// O QUE ACONTECEU (Infinity): a aprovação de parceria do marketplace gravava
// `houses.registerUrlTemplate` sem passar por `buildTaggedUrl`. O estrago tem
// DUAS caras, conforme o template da casa:
//
//   a) PLACEHOLDER CRU (medido 20/08/2026): template com `{tag}`/`{ref}` ia
//      literal na URL (LEON, Blaze/KTO/Winhugo). Como `{tag}` tem cara de tag
//      válida, o índice de atribuição a aceitava e dava o resultado de TODOS ao
//      primeiro link da ordem de leitura — nada caía em "pendente".
//   b) URL SEM TAG NENHUMA (medido 21/08/2026): template PELADO (Esportiva:
//      `go.aff.esportiva.bet/urto4foy`) ia como está, então o clique chegava na
//      casa sem AFP e a produção não atribuía a ninguém. A aparência é de URL
//      sã, e a 1ª rodada deste script (que só caçava placeholder) a pulou. Um
//      dos 6 casos era um link SÃO de 29/07 que a aprovação SOBRESCREVEU.
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
//   • O caso (b) só é tratado em casa com EVIDÊNCIA de que a tag viaja na URL:
//     outro link da mesma casa carrega um param de `TAG_PARAMS`, ou o template
//     da casa tem placeholder. Casa que cruza por e-mail (sem tag na URL) tem
//     link pelado LEGÍTIMO e fica de fora — aparece em "Ignorados" para o
//     operador conferir. O param anexado é o que os irmãos da casa usam.
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
import { extractTagFromUrl, TAG_PARAMS } from '../../src/lib/linkTriage';

// Qual param de TAG_PARAMS esta URL carrega (com valor)? '' = nenhum.
const tagParamInUrl = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl);
    for (const param of TAG_PARAMS) {
      if (String(url.searchParams.get(param) ?? '').trim()) return param;
    }
  } catch {
    /* URL inválida: as seleções abaixo já recusam a linha */
  }
  return '';
};

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

  // Evidência POR CASA de que a tag viaja na URL (caso b): o param que os
  // links irmãos da casa usam, ou o default quando o template tem placeholder
  // (aí `buildTaggedUrl` substitui e o param nem é usado). Casa sem nenhuma
  // evidência fica FORA do caso (b) — link pelado pode ser legítimo lá.
  const tagParamDaCasa = new Map<string, string>();
  for (const d of linksSnap.docs) {
    const l = d.data() as any;
    const brandId = String(l?.brandId ?? '').trim();
    if (!brandId || tagParamDaCasa.has(brandId)) continue;
    const param = tagParamInUrl(String(l?.registerUrl ?? ''));
    if (param) tagParamDaCasa.set(brandId, param);
  }
  for (const [key, tpl] of houseTemplate) {
    if (!tagParamDaCasa.has(key) && hasUnresolvedPlaceholder(tpl)) tagParamDaCasa.set(key, '');
  }

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
    motivo: 'placeholder' | 'sem-tag';
  }
  const plans: Plan[] = [];
  const skipped: string[] = [];

  for (const d of linksSnap.docs) {
    const l = d.data() as any;
    const urlBefore = String(l?.registerUrl ?? '');
    const brandId = String(l?.brandId ?? '').trim();
    const comPlaceholder = hasUnresolvedPlaceholder(urlBefore);
    // Caso (b): URL válida sem NENHUM param de tag, numa casa onde a tag
    // comprovadamente viaja na URL. Sem evidência da casa, não inventamos.
    const semTag =
      !comPlaceholder && !!urlBefore && !tagParamInUrl(urlBefore) && tagParamDaCasa.has(brandId);
    if (!comPlaceholder && !semTag) continue; // são (ou pelado legítimo)
    if (houseFilter && brandId !== houseFilter) continue;

    const affiliateId = String(l?.affiliateId ?? '').trim();
    if (!affiliateId) {
      if (comPlaceholder) skipped.push(`${d.id} (pool/standby, sem dono — não atribui nada)`);
      continue; // pool pelado é o formato normal do standby, nem lista
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

    const urlAfter = buildTaggedUrl(urlBefore, tagAfter, tagParamDaCasa.get(brandId));
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
      motivo: comPlaceholder ? 'placeholder' : 'sem-tag',
    });
  }

  if (!plans.length) {
    line('\nNenhum link por corrigir (placeholder ou URL sem tag).');
    if (skipped.length) { line('\nIgnorados:'); skipped.forEach((s) => line(`  - ${s}`)); }
    return;
  }

  const porCasa = new Map<string, number>();
  plans.forEach((p) => porCasa.set(p.brandId, (porCasa.get(p.brandId) ?? 0) + 1));
  line(`\n${plans.length} link(es) a corrigir: ${[...porCasa].map(([h, n]) => `${h}=${n}`).join('  ')}\n`);

  for (const p of plans) {
    line(`  ${p.code}  ${p.brandId.padEnd(14)} ${p.who.slice(0, 26).padEnd(26)} cliques=${p.clicks}  [${p.motivo}]`);
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
      metadata: {
        code: p.code,
        brandId: p.brandId,
        motivo: p.motivo === 'placeholder'
          ? 'placeholder cru na URL emitida pela aprovação de parceria'
          : 'URL emitida pela aprovação de parceria sem nenhum param de tag (template pelado)',
      },
      reason: p.motivo === 'placeholder'
        ? 'Correção do link emitido com {tag}/{ref} literal'
        : 'Correção do link emitido sem a tag na URL (casa de template pelado)',
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
    const url = String(l?.registerUrl ?? '');
    const brandId = String(l?.brandId ?? '').trim();
    if (hasUnresolvedPlaceholder(url)) aindaQuebrados.push(`${d.id} (${brandId}, placeholder)`);
    else if (url && !tagParamInUrl(url) && tagParamDaCasa.has(brandId)) {
      aindaQuebrados.push(`${d.id} (${brandId}, sem tag na URL)`);
    }
    const alvo = plans.find((p) => p.code === d.id);
    if (alvo && l?.registerUrl === alvo.urlAfter && normalizeTag(l?.tag) === alvo.tagAfter) conferidos.push(d.id);
  });
  line(`  ${conferidos.length}/${plans.length} links conferidos com a URL e a tag novas.`);
  if (aindaQuebrados.length) {
    line(`  ⚠️ ainda quebrados: ${aindaQuebrados.join(', ')}`);
    if (houseFilter) line('     (esperado: você filtrou por --house; rode sem o filtro para os demais)');
    process.exitCode = 1;
  } else {
    line('  ✅ nenhum link atribuído ficou com placeholder ou sem tag.');
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => { console.error('ERRO:', e); process.exit(1); });
