#!/usr/bin/env node
/**
 * Conversor da REDE do legado da Infinity -> AffiliaCore.
 *
 * Le o TSV de roster+upline extraido do painel legado (PII: fica FORA do repo, no
 * scratchpad) e escreve na instancia via HTTP, em duas fases:
 *
 *   1. ROSTER   -> POST /api/boost-affiliates   (idempotente por e-mail)
 *   2. UPLINES  -> POST /api/affiliate-uplines  (uma aresta por chamada)
 *
 * POR QUE HTTP e nao Admin SDK direto: `POST /api/affiliate-uplines` faz a barreira
 * de CICLO no write e AUDITA a aresta no mesmo batch da gravacao — mudar upline muda
 * dinheiro (o "lucro sobre equipe" sai da taxa do TOPO da estrutura). Gravar direto no
 * Firestore pularia as duas coisas e reimplementaria regra de servidor no script, o que
 * o CLAUDE.md proibe. O Admin SDK entra aqui SO para cunhar o token de admin.
 *
 * ORDEM OBRIGATORIA: roster primeiro, uplines depois. O POST de upline precisa do
 * affiliateId da AffiliaCore, e a juncao com o legado e' por E-MAIL.
 *
 * Idempotente: rodar de novo nao duplica nada (`boost-affiliates` reusa o alias de
 * e-mail; regravar o mesmo upline gera diff vazio e nao polui a auditoria).
 *
 * USO — duas formas de autenticar como admin:
 *
 *   (a) ID token de arquivo (preferida: nenhuma chave permanente em disco)
 *   node scripts/migracao-infinity/converter-rede.cjs \
 *     --tsv "<scratchpad>/infinity-roster-uplines.tsv" \
 *     --base https://<instancia> \
 *     --id-token-file "<scratchpad>/token.txt" \
 *     [--only roster|uplines] [--apply]
 *
 *   (b) Admin SDK cunhando o token (precisa de credencial DO PROJETO da instancia
 *       em GOOGLE_APPLICATION_CREDENTIALS ou FIREBASE_SERVICE_ACCOUNT_KEY)
 *   ... --api-key <FIREBASE_WEB_API_KEY> --admin-email admin@...
 *
 * Sem `--apply` e' DRY-RUN: valida, resolve ids, imprime o plano e NAO escreve nada.
 */

const fs = require('fs');
const admin = require('firebase-admin');

// ---------------------------------------------------------------- argumentos
function parseArgs(argv) {
  const out = { apply: false, only: 'ambos' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--tsv') out.tsv = argv[++i];
    else if (a === '--base') out.base = String(argv[++i] || '').replace(/\/+$/, '');
    else if (a === '--api-key') out.apiKey = argv[++i];
    else if (a === '--admin-email') out.adminEmail = argv[++i];
    else if (a === '--admin-uid') out.adminUid = argv[++i];
    else if (a === '--id-token-file') out.idTokenFile = argv[++i];
    else if (a === '--deals') out.deals = argv[++i];
    else if (a === '--links') out.links = argv[++i];
    else if (a === '--casa') out.casa = argv[++i];
    else if (a === '--only') out.only = argv[++i];
    else throw new Error(`Argumento desconhecido: ${a}`);
  }
  // Com --id-token-file nao entra Admin SDK, logo nao ha o que cunhar: dispensa
  // --api-key e --admin-*. O token e' de vida curta (~1h), vem de ARQUIVO (nunca de
  // argv, que vaza em lista de processo) e o script nunca o imprime.
  // A fase de links nao le o TSV de roster — ela tem fonte propria (--links).
  const base = out.only === 'links' ? ['links', 'base'] : ['tsv', 'base'];
  const obrigatorios = out.idTokenFile ? base : [...base, 'apiKey'];
  const falta = obrigatorios.filter((k) => !out[k]);
  if (falta.length) throw new Error(`Faltam argumentos: ${falta.join(', ')}`);
  if (!out.idTokenFile && !out.adminEmail && !out.adminUid) {
    throw new Error('Informe --id-token-file, ou --admin-email/--admin-uid para cunhar via Admin SDK.');
  }
  if (!['ambos', 'roster', 'uplines', 'taxas', 'links'].includes(out.only)) throw new Error('--only aceita roster|uplines|taxas|links.');
  if (out.only === 'taxas' && !out.deals) throw new Error('--only taxas exige --deals <tsv de deals>.');
  return out;
}

// ------------------------------------------------------------------ leitura
const COLS = ['email', 'nome', 'id_main', 'gerente_email', 'fonte_upline', 'nivel', 'casas', 'admin', 'id_por_casa'];

function lerTsv(caminho) {
  const texto = fs.readFileSync(caminho, 'utf8').replace(/^﻿/, '');
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!linhas.length) throw new Error('TSV vazio.');
  const head = linhas[0].split('\t').map((s) => s.trim());
  const faltando = COLS.filter((c) => !head.includes(c));
  if (faltando.length) throw new Error(`TSV sem as colunas: ${faltando.join(', ')}`);
  const idx = Object.fromEntries(COLS.map((c) => [c, head.indexOf(c)]));
  const rows = [];
  for (const linha of linhas.slice(1)) {
    const c = linha.split('\t');
    const email = (c[idx.email] || '').trim().toLowerCase();
    if (!email) continue;
    rows.push({
      email,
      nome: (c[idx.nome] || '').trim(),
      idLegado: (c[idx.id_main] || '').trim(),
      gerente: (c[idx.gerente_email] || '').trim().toLowerCase(),
      fonte: (c[idx.fonte_upline] || '').trim(),
      nivel: Number(c[idx.nivel] || 0),
      casas: (c[idx.casas] || '').split('|').filter(Boolean),
      admin: (c[idx.admin] || '').trim() === 'sim',
    });
  }
  return rows;
}

/**
 * Saneamento ANTES de escrever: e-mail duplicado, upline fora do roster, auto-upline
 * e ciclo. O servidor tambem barra ciclo, mas descobrir aqui evita escrita parcial.
 */
function validar(rows) {
  const problemas = [];
  const vistos = new Set();
  for (const r of rows) {
    if (vistos.has(r.email)) problemas.push(`e-mail duplicado: ${r.email}`);
    vistos.add(r.email);
    if (!r.nome) problemas.push(`sem nome: ${r.email}`);
  }
  for (const r of rows) {
    if (!r.gerente) continue;
    if (r.gerente === r.email) problemas.push(`auto-upline (o legado usa isso p/ "topo"): ${r.email}`);
    else if (!vistos.has(r.gerente)) problemas.push(`upline fora do roster: ${r.email} -> ${r.gerente}`);
  }
  // ciclos
  const pai = new Map(rows.map((r) => [r.email, r.gerente && r.gerente !== r.email && vistos.has(r.gerente) ? r.gerente : null]));
  const nivelDe = new Map();
  for (const inicio of pai.keys()) {
    const caminho = new Set();
    let n = inicio;
    let d = 0;
    while (n && !nivelDe.has(n)) {
      if (caminho.has(n)) { problemas.push(`ciclo envolvendo: ${n}`); break; }
      caminho.add(n);
      n = pai.get(n) || null;
      d++;
      if (d > rows.length + 1) { problemas.push(`profundidade absurda a partir de ${inicio}`); break; }
    }
    // profundidade real (memoizada de baixo p/ cima)
    const prof = (x, seen) => {
      if (nivelDe.has(x)) return nivelDe.get(x);
      const p = pai.get(x);
      if (!p || seen.has(x)) { nivelDe.set(x, 0); return 0; }
      seen.add(x);
      const v = prof(p, seen) + 1;
      nivelDe.set(x, v);
      return v;
    };
    prof(inicio, new Set());
  }
  const arestas = [...pai.values()].filter(Boolean).length;
  const topos = rows.length - arestas;
  const niveis = {};
  for (const r of rows) { const d = nivelDe.get(r.email) ?? 0; niveis[d] = (niveis[d] || 0) + 1; }
  return { problemas, arestas, topos, niveis, pai, nivelDe };
}

// ------------------------------------------------------------ deals (fase 3)
const DEAL_COLS = ['email', 'casa', 'cpa_deal'];

/**
 * TSV de deals extraido da tela de Pagamentos do legado: uma linha por
 * (pessoa, casa) com o CPA individual praticado. E' o que alimenta
 * `affiliate_configs.byBrand[<slug da casa>].cpaValue`.
 */
function lerDeals(caminho) {
  const texto = fs.readFileSync(caminho, 'utf8').replace(/^﻿/, '');
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  const head = linhas[0].split('\t').map((s) => s.trim());
  const faltando = DEAL_COLS.filter((c) => !head.includes(c));
  if (faltando.length) throw new Error(`TSV de deals sem as colunas: ${faltando.join(', ')}`);
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  return linhas.slice(1).map((l) => {
    const c = l.split('\t');
    return {
      email: (c[idx.email] || '').trim().toLowerCase(),
      casa: (c[idx.casa] || '').trim(),
      cpa: Number(c[idx.cpa_deal]),
      papel: idx.papel != null ? (c[idx.papel] || '').trim() : '',
      cpas: idx.cpas != null ? Number(c[idx.cpas]) || 0 : 0,
    };
  }).filter((d) => d.email && d.casa);
}

const chaveNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Fase 3 — taxa POR CASA de cada afiliado.
 *
 * Grava SO `byBrand[slug].cpaValue`: nada de taxa de topo e nada de
 * `revPercentage` — no legado o REV e' 0% em 100% dos cadastros, e gravar 0
 * faria `rateStatus` ler "configurado" (ausencia != R$ 0).
 *
 * A chave do byBrand e' o SLUG da casa: p/ casa MANUAL o `brandKeyOf` do
 * calculo cai em `id ?? slug` e casa manual nao tem `id` (que e' o brandId da
 * OTG). O slug e' resolvido pelo NOME contra a instancia — nunca chutado.
 */
async function fase3Taxas(api, args, idPorEmail) {
  const deals = lerDeals(args.deals);
  console.log(`\n== fase 3 · taxas por casa ==`);
  console.log(`linhas de deal: ${deals.length}`);

  // nome da casa -> slug, resolvido CONTRA A INSTANCIA
  const respostaCasas = await api('GET', '/api/houses');
  const casas = Array.isArray(respostaCasas) ? respostaCasas : (respostaCasas?.houses ?? []);
  const slugPorNome = new Map();
  for (const h of casas) {
    const slug = String(h?.slug ?? h?.id ?? '').trim();
    if (slug) slugPorNome.set(chaveNome(h?.name), slug);
  }
  const nomesTsv = [...new Set(deals.map((d) => d.casa))];
  const semCasa = nomesTsv.filter((n) => !slugPorNome.has(chaveNome(n)));
  if (semCasa.length) {
    throw new Error(`Casa do TSV sem correspondente na instancia: ${semCasa.join(', ')}. ` +
      `Casas da instancia: ${[...slugPorNome.values()].join(', ') || '(nenhuma)'}`);
  }
  console.log(`casas resolvidas: ${nomesTsv.map((n) => `${n} -> ${slugPorNome.get(chaveNome(n))}`).join('  |  ')}`);

  // agrupa por afiliado; quem nao tem afiliado na instancia so' pode ser descartado
  // se NAO tiver producao — senao estariamos jogando fora configuracao de dinheiro.
  const porAfiliado = new Map();
  const orfaos = [];
  for (const d of deals) {
    const affId = idPorEmail.get(d.email);
    if (!affId) { orfaos.push(d); continue; }
    if (!Number.isFinite(d.cpa) || d.cpa < 0) throw new Error(`cpa_deal invalido para ${d.email} / ${d.casa}`);
    if (!porAfiliado.has(affId)) porAfiliado.set(affId, {});
    porAfiliado.get(affId)[slugPorNome.get(chaveNome(d.casa))] = { cpaValue: d.cpa };
  }
  if (orfaos.length) {
    const comProducao = orfaos.filter((o) => o.cpas > 0);
    console.log(`sem afiliado na instancia: ${orfaos.length} linha(s) (${[...new Set(orfaos.map((o) => o.email))].length} pessoa(s)), producao somada: ${orfaos.reduce((s, o) => s + o.cpas, 0)} CPA(s)`);
    if (comProducao.length) {
      throw new Error(`${comProducao.length} linha(s) sem afiliado na instancia TEM producao — nao da p/ descartar. Rode a fase roster antes.`);
    }
    console.log(`  -> todas com 0 CPA (tipicamente conta de teste/recon): descartadas com seguranca.`);
  }

  const totalPares = [...porAfiliado.values()].reduce((s, m) => s + Object.keys(m).length, 0);
  console.log(`afiliados a configurar: ${porAfiliado.size}   pares (afiliado,casa): ${totalPares}`);
  const distintos = [...new Set(deals.map((d) => d.cpa))].sort((a, b) => a - b);
  console.log(`CPAs distintos no conjunto: ${distintos.join(', ')}`);

  if (!args.apply) {
    console.log(`\n(dry-run) nenhuma taxa gravada. Use --apply.`);
    return;
  }

  let ok = 0;
  const falhas = [];
  for (const [affId, byBrand] of porAfiliado) {
    try {
      await api('PATCH', `/api/affiliate-configs/${encodeURIComponent(affId)}`, { byBrand });
      ok++;
      if (ok % 25 === 0) console.log(`   ${ok}/${porAfiliado.size}`);
    } catch (e) {
      falhas.push(`${affId}: ${e.message}`);
    }
  }
  console.log(`configs gravadas: ${ok}   falhas: ${falhas.length}`);
  for (const f of falhas.slice(0, 20)) console.error(`   - ${f}`);

  // conferencia: relê e compara CADA par (afiliado, casa)
  const resp = await api('GET', '/api/affiliate-configs');
  const configs = resp?.configs ?? resp ?? {};
  let divergentes = 0;
  for (const [affId, byBrand] of porAfiliado) {
    const gravado = configs?.[affId]?.byBrand ?? {};
    for (const [slug, taxa] of Object.entries(byBrand)) {
      if (Number(gravado?.[slug]?.cpaValue) !== Number(taxa.cpaValue)) divergentes++;
    }
  }
  console.log(`\n== conferencia (taxas) ==`);
  console.log(`pares esperados: ${totalPares}   divergentes: ${divergentes}`);
  if (divergentes || falhas.length) {
    console.error(`\n!! conferencia NAO fechou — nao declare o passo 5 concluido.`);
    process.exit(1);
  }
}

// ------------------------------------------------------------ links (fase 4)
const LINK_COLS = ['email', 'url'];

/**
 * TSV dos links de divulgacao ja atribuidos no legado (tela /admin/regras,
 * visao `com_link`): uma linha por (pessoa, casa) com a URL cunhada NA CASA.
 *
 * Colunas: email, url [, nome, tag, casa]. `tag` e' conferencia (a tag tem que
 * bater com a da query da URL); `casa` sobrepoe o --casa da linha de comando.
 */
function lerLinks(caminho) {
  const texto = fs.readFileSync(caminho, 'utf8').replace(/^﻿/, '');
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  const head = linhas[0].split('\t').map((s) => s.trim());
  const faltando = LINK_COLS.filter((c) => !head.includes(c));
  if (faltando.length) throw new Error(`TSV de links sem as colunas: ${faltando.join(', ')}`);
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  return linhas.slice(1).map((l) => {
    const c = l.split('\t');
    return {
      email: (c[idx.email] || '').trim().toLowerCase(),
      url: (c[idx.url] || '').trim(),
      nome: idx.nome != null ? (c[idx.nome] || '').trim() : '',
      tag: idx.tag != null ? (c[idx.tag] || '').trim() : '',
      casa: idx.casa != null ? (c[idx.casa] || '').trim() : '',
    };
  }).filter((r) => r.email || r.url);
}

// Mesma convencao de tag do nucleo puro (src/lib/linkTriage.ts): as plataformas
// que aparecem no legado e nas casas BR. Duplicado aqui de proposito — o script
// e' .cjs e nao importa o modulo TS; a lista e' pequena e estavel.
const PARAMS_DE_TAG = ['tag', 'afp', 'afp2', 'btag', 'subid', 'sub_id', 'clickid'];
function tagDaUrl(url) {
  try {
    const u = new URL(url);
    for (const p of PARAMS_DE_TAG) {
      const v = u.searchParams.get(p);
      if (v && v.trim()) return v.trim();
    }
  } catch { /* quem chama ja recusou a URL invalida */ }
  return '';
}

// Chave de marca do link — MESMA regra do `dealBrandKey` (src/lib/deal.ts):
// brandId da OTG quando existe, senao o slug. Casa manual cai no slug.
const brandKeyDaCasa = (h) => String(h?.brandId ?? '').trim() || String(h?.slug ?? h?.id ?? '').trim();

/**
 * Fase 4 — links de divulgacao ja atribuidos no legado.
 *
 * Grava `affiliate_links` via `POST /api/affiliate-links`, que e' IDEMPOTENTE por
 * (afiliado, marca): rodar de novo nao cunha codigo novo, so' atualiza o destino —
 * o /go/:code que o afiliado ja recebeu continua valendo.
 *
 * A URL migrada e' a da CASA (ex.: go.aff.esportiva.bet/...?afp=<tag>), entao a
 * atribuicao do lado da casa continua pela tag; o /go/:code so' embrulha, conta o
 * clique do nosso lado e repassa o subid. O link antigo que o afiliado ja
 * distribuiu NAO para de funcionar — e' da casa, nao nosso.
 */
async function fase4Links(api, args, idPorEmail) {
  const linhas = lerLinks(args.links);
  console.log(`\n== fase 4 · links de divulgacao ==`);
  console.log(`linhas no TSV: ${linhas.length}`);

  // casa -> slug/brandKey, resolvido CONTRA A INSTANCIA (nunca chutado)
  const respostaCasas = await api('GET', '/api/houses');
  const casas = Array.isArray(respostaCasas) ? respostaCasas : (respostaCasas?.houses ?? []);
  const casaPorNome = new Map();
  for (const h of casas) casaPorNome.set(chaveNome(h?.name), h);

  const problemas = [];
  const vistos = new Set();
  const urlsVistas = new Set();
  const alvo = [];

  for (const r of linhas) {
    const nomeCasa = r.casa || args.casa || '';
    if (!nomeCasa) { problemas.push(`${r.email}: sem casa (use --casa "<nome>" ou a coluna casa)`); continue; }
    const casa = casaPorNome.get(chaveNome(nomeCasa));
    if (!casa) {
      problemas.push(`${r.email}: casa "${nomeCasa}" nao existe na instancia (casas: ${casas.map((h) => h?.name).join(', ') || 'nenhuma'})`);
      continue;
    }
    if (!/^https?:\/\/.+/i.test(r.url)) { problemas.push(`${r.email}: URL invalida (${r.url || 'vazia'})`); continue; }
    // Tag da planilha CONTRA a tag da URL: pega erro de copia/cola antes de gravar
    // um afiliado apontando pro balde de outro.
    const tagUrl = tagDaUrl(r.url);
    if (r.tag && tagUrl && r.tag !== tagUrl) {
      problemas.push(`${r.email}: tag "${r.tag}" nao bate com a da URL ("${tagUrl}")`);
      continue;
    }
    if (urlsVistas.has(r.url)) { problemas.push(`URL repetida no TSV (dois afiliados no mesmo balde): ${r.url}`); continue; }
    urlsVistas.add(r.url);

    const brandKey = brandKeyDaCasa(casa);
    const chave = `${r.email}|${brandKey}`;
    if (vistos.has(chave)) { problemas.push(`${r.email}: duplicado para a mesma casa`); continue; }
    vistos.add(chave);

    const affiliateId = idPorEmail.get(r.email);
    // Sem afiliado na instancia o link se perderia — aqui NAO ha descarte seguro
    // (diferente da fase 3, onde linha com 0 CPA podia cair fora).
    if (!affiliateId) { problemas.push(`${r.email}: sem afiliado na instancia — rode a fase roster antes`); continue; }

    alvo.push({ ...r, affiliateId, brandKey, casaNome: casa?.name ?? nomeCasa, tag: r.tag || tagUrl });
  }

  if (problemas.length) {
    console.error(`\n!! ${problemas.length} problema(s) no TSV — NADA foi escrito:`);
    for (const p of problemas.slice(0, 20)) console.error(`   - ${p}`);
    if (problemas.length > 20) console.error(`   ... e ${problemas.length - 20} outros`);
    process.exit(1);
  }

  const porCasa = alvo.reduce((a, r) => ((a[r.casaNome] = (a[r.casaNome] || 0) + 1), a), {});
  console.log(`casas: ${Object.entries(porCasa).map(([n, q]) => `${n}=${q}`).join('  ')}`);
  console.log(`saneamento: OK (URL http(s), tag coerente, sem duplicata, todos com afiliado)`);

  // Estado atual: o POST e' idempotente, entao separamos o que e' criacao do que
  // e' atualizacao de destino — muda o que o operador espera ver no fim.
  const atuais = (await api('GET', '/api/affiliate-links'))?.links ?? [];
  const porPar = new Map();
  for (const l of atuais) {
    const k = `${String(l.affiliateId ?? '')}|${String(l.brandId ?? '')}`;
    if (!porPar.has(k)) porPar.set(k, l);
  }
  let criar = 0, atualizar = 0, iguais = 0;
  for (const r of alvo) {
    const atual = porPar.get(`${r.affiliateId}|${r.brandKey}`);
    if (!atual) criar++;
    else if (String(atual.registerUrl ?? '') !== r.url) atualizar++;
    else iguais++;
  }
  console.log(`links ja na instancia: ${atuais.length}   a criar: ${criar}   a atualizar destino: ${atualizar}   ja identicos: ${iguais}`);

  if (!args.apply) {
    console.log(`\n(dry-run) nenhum link gravado. Use --apply.`);
    return;
  }

  let ok = 0;
  const falhas = [];
  for (const r of alvo) {
    try {
      await api('POST', '/api/affiliate-links', {
        affiliateId: r.affiliateId,
        brandId: r.brandKey,
        registerUrl: r.url,
      });
      ok++;
    } catch (e) {
      falhas.push(`${r.email}: ${e.message}`);
    }
  }
  console.log(`links gravados: ${ok}   falhas: ${falhas.length}`);
  for (const f of falhas.slice(0, 20)) console.error(`   - ${f}`);

  // conferencia: rele e compara o destino de CADA par (afiliado, casa)
  const depois = (await api('GET', '/api/affiliate-links'))?.links ?? [];
  const depoisPorPar = new Map();
  for (const l of depois) depoisPorPar.set(`${String(l.affiliateId ?? '')}|${String(l.brandId ?? '')}`, l);
  let divergentes = 0;
  for (const r of alvo) {
    const l = depoisPorPar.get(`${r.affiliateId}|${r.brandKey}`);
    if (!l || String(l.registerUrl ?? '') !== r.url || l.active === false) divergentes++;
  }
  console.log(`\n== conferencia (links) ==`);
  console.log(`esperados: ${alvo.length}   divergentes: ${divergentes}`);
  if (divergentes || falhas.length) {
    console.error(`\n!! conferencia NAO fechou — nao declare a migracao de links concluida.`);
    process.exit(1);
  }
  console.log(`\nOK. Os links aparecem em /links (triagem do admin) e em "Meus Links" do afiliado.`);
}

// e-mail -> affiliateId da instancia (juncao com o legado e' sempre por e-mail)
async function mapaEmailParaId(api) {
  const aliases = (await api('GET', '/api/affiliate-email-aliases'))?.aliases ?? [];
  const m = new Map();
  for (const a of aliases) {
    const e = String(a.email || '').trim().toLowerCase();
    if (e && a.affiliateId) m.set(e, String(a.affiliateId));
  }
  return m;
}

// --------------------------------------------------------------------- auth
async function cunharIdToken({ apiKey, adminEmail, adminUid, idTokenFile }) {
  // Caminho sem Admin SDK: o operador cola um ID token de admin (obtido na propria
  // sessao logada da instancia) num arquivo. Evita chave de service account em disco.
  if (idTokenFile) {
    const bruto = fs.readFileSync(idTokenFile, 'utf8').trim();
    if (!bruto) throw new Error(`${idTokenFile} esta vazio.`);
    // Aceita o token cru OU um JSON com { idToken } / { stsTokenManager: { accessToken } }.
    let tok = bruto;
    if (bruto.startsWith('{')) {
      const j = JSON.parse(bruto);
      tok = j.idToken || j.stsTokenManager?.accessToken || j.accessToken || '';
    }
    tok = tok.replace(/^["']|["']$/g, '').trim();
    if (tok.split('.').length !== 3) throw new Error('O conteudo nao parece um ID token JWT (esperado 3 partes separadas por ponto).');
    // exp/uid saem do proprio payload — nao imprime o token, so' o diagnostico.
    let uid = '(desconhecido)', restamMin = null;
    try {
      const p = JSON.parse(Buffer.from(tok.split('.')[1], 'base64').toString('utf8'));
      uid = p.user_id || p.sub || uid;
      if (p.exp) restamMin = Math.round((p.exp * 1000 - Date.now()) / 60000);
    } catch { /* payload ilegivel: segue, o servidor decide */ }
    if (restamMin !== null && restamMin <= 0) throw new Error(`Token EXPIRADO ha ${-restamMin} min — pegue um novo.`);
    if (restamMin !== null) console.log(`token de arquivo: uid ${uid}, expira em ~${restamMin} min`);
    return { idToken: tok, uid };
  }
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
    } else {
      admin.initializeApp(); // GOOGLE_APPLICATION_CREDENTIALS
    }
  }
  let uid = adminUid;
  if (!uid) {
    const user = await admin.auth().getUserByEmail(adminEmail);
    uid = user.uid;
  }
  // O token so' vale se o perfil for admin — requireAdmin le users/{uid}.role.
  const perfil = await admin.firestore().collection('users').doc(uid).get();
  const role = perfil.exists ? perfil.data().role : null;
  if (role !== 'admin') throw new Error(`users/${uid}.role = ${JSON.stringify(role)} — o conversor exige um admin.`);
  const custom = await admin.auth().createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok || !j.idToken) throw new Error(`Troca do custom token falhou: ${JSON.stringify(j).slice(0, 300)}`);
  return { idToken: j.idToken, uid };
}

// ---------------------------------------------------------------- transporte
function makeApi(base, idToken) {
  return async function api(metodo, rota, body) {
    const r = await fetch(base + rota, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const txt = await r.text();
    let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { /* resposta nao-JSON */ }
    if (!r.ok) throw new Error(`${metodo} ${rota} -> ${r.status} ${txt.slice(0, 300)}`);
    // ARMADILHA: numa instancia cujo build nao tem a rota, o Express cai no
    // fallback da SPA e devolve 200 text/html. Sem esta guarda, um POST vira
    // "sucesso" que nao grava NADA (medido na Infinity em 28/07: 141 arestas
    // teriam sido dadas como escritas). Resposta nao-JSON e' erro, nao sucesso.
    if (j === null && txt.trim().startsWith('<')) {
      throw new Error(
        `${metodo} ${rota} respondeu HTML (a SPA), nao JSON — a rota NAO existe nesta build da instancia. ` +
        `Falta deployar o codigo que a define.`
      );
    }
    return j;
  };
}

// ------------------------------------------------------------------ execucao
async function main() {
  const args = parseArgs(process.argv);

  // Fase 4 e' autonoma: fonte propria (--links) e so' precisa do mapa e-mail->id.
  if (args.only === 'links') {
    const { idToken, uid } = await cunharIdToken(args);
    const api = makeApi(args.base, idToken);
    console.log(`\n== instancia ==\nbase: ${args.base}\nadmin: ${uid}`);
    await fase4Links(api, args, await mapaEmailParaId(api));
    return;
  }

  const rows = lerTsv(args.tsv);
  const v = validar(rows);

  console.log(`\n== TSV ==`);
  console.log(`arquivo:    ${args.tsv}`);
  console.log(`pessoas:    ${rows.length}`);
  console.log(`arestas:    ${v.arestas}   topos: ${v.topos}`);
  console.log(`niveis:     ${Object.keys(v.niveis).sort().map((k) => `n${k}=${v.niveis[k]}`).join('  ')}`);
  console.log(`fonte:      ${Object.entries(rows.reduce((a, r) => ((a[r.fonte] = (a[r.fonte] || 0) + 1), a), {})).map(([k, n]) => `${k}=${n}`).join('  ')}`);
  if (v.problemas.length) {
    console.error(`\n!! ${v.problemas.length} problema(s) no TSV — nada foi escrito:`);
    for (const p of v.problemas.slice(0, 20)) console.error(`   - ${p}`);
    if (v.problemas.length > 20) console.error(`   ... e ${v.problemas.length - 20} outros`);
    process.exit(1);
  }
  console.log(`saneamento: OK (sem duplicata, sem auto-upline, sem orfao, sem ciclo)`);

  const { idToken, uid } = await cunharIdToken(args);
  const api = makeApi(args.base, idToken);
  console.log(`\n== instancia ==\nbase: ${args.base}\nadmin: ${uid}`);

  // ids ja existentes na AffiliaCore (os 30 que nasceram do import de resultados)
  const aliases = (await api('GET', '/api/affiliate-email-aliases'))?.aliases ?? [];
  const idPorEmail = new Map();
  for (const a of aliases) {
    const e = String(a.email || '').trim().toLowerCase();
    if (e && a.affiliateId) idPorEmail.set(e, String(a.affiliateId));
  }
  const jaExistem = rows.filter((r) => idPorEmail.has(r.email)).length;
  console.log(`aliases existentes: ${idPorEmail.size}   do TSV ja mapeados: ${jaExistem}   a criar: ${rows.length - jaExistem}`);

  // Fase 3 e' independente das outras: so' precisa do mapa e-mail -> affiliateId.
  if (args.only === 'taxas') {
    await fase3Taxas(api, args, idPorEmail);
    return;
  }

  // PRE-FLIGHT da fase 2: a rota de upline so' existe na build COM a rede. Conferir
  // agora (inclusive no dry-run) evita descobrir isso depois de 141 POSTs no vazio.
  let redeDisponivel = true;
  if (args.only !== 'roster') {
    try {
      const antes = await api('GET', '/api/affiliate-uplines');
      const n = Object.values(antes?.uplines ?? {}).filter(Boolean).length;
      console.log(`rota de upline: OK (${n} aresta(s) ja gravada(s) nesta instancia)`);
    } catch (e) {
      redeDisponivel = false;
      console.error(`\n!! FASE DE UPLINES INDISPONIVEL nesta instancia:\n   ${e.message}`);
      console.error(`   A rede (GET/POST /api/affiliate-uplines) precisa estar DEPLOYADA antes.`);
      console.error(`   O roster (fase 1) nao depende disso e pode rodar com --only roster.`);
      if (args.apply) process.exit(1);
    }
  }

  if (!args.apply) {
    console.log(`\n== DRY-RUN ==`);
    console.log(`criaria ${rows.length - jaExistem} afiliado(s) nativo(s) e ${redeDisponivel ? `gravaria ${v.arestas} aresta(s)` : `NAO gravaria aresta (rota indisponivel)`}.`);
    console.log(`rode de novo com --apply para escrever.`);
    return;
  }

  // ---- fase 1: roster ------------------------------------------------------
  if (args.only !== 'uplines') {
    const aCriar = rows.filter((r) => !idPorEmail.has(r.email));
    console.log(`\n== fase 1 · roster (${aCriar.length}) ==`);
    const LOTE = 25;
    let criados = 0;
    let reusados = 0;
    for (let i = 0; i < aCriar.length; i += LOTE) {
      const lote = aCriar.slice(i, i + LOTE).map((r) => ({
        name: r.nome,
        email: r.email,
        house: r.casas[0] || '', // modelo "1 afiliado -> 1 casa"; sem casa = so' carteira
      }));
      // generateInvite fica FALSO de proposito: migracao historica, ninguem recebe login.
      const resp = await api('POST', '/api/boost-affiliates', { affiliates: lote, generateInvite: false });
      for (const c of resp?.created ?? []) {
        if (c.email) idPorEmail.set(String(c.email).toLowerCase(), String(c.affiliateId));
        if (c.reused) reusados++; else criados++;
      }
      console.log(`   lote ${Math.floor(i / LOTE) + 1}: +${resp?.created?.length ?? 0}`);
    }
    console.log(`criados: ${criados}   reusados (idempotencia): ${reusados}`);
  }

  if (args.only === 'roster') {
    console.log(`\n(--only roster) uplines nao foram tocados.`);
    return;
  }

  // ---- fase 2: uplines ----------------------------------------------------
  // Re-le os aliases: quem foi criado agora precisa entrar no mapa antes das arestas.
  const aliases2 = (await api('GET', '/api/affiliate-email-aliases'))?.aliases ?? [];
  for (const a of aliases2) {
    const e = String(a.email || '').trim().toLowerCase();
    if (e && a.affiliateId) idPorEmail.set(e, String(a.affiliateId));
  }

  const semId = rows.filter((r) => !idPorEmail.has(r.email));
  if (semId.length) {
    console.error(`\n!! ${semId.length} pessoa(s) do TSV sem affiliateId na AffiliaCore — rode a fase roster antes.`);
    process.exit(1);
  }

  // PAI ANTES DO FILHO: sobe por nivel, para a barreira de ciclo nunca ver estado parcial.
  const comUpline = rows.filter((r) => v.pai.get(r.email)).sort((a, b) => (v.nivelDe.get(a.email) ?? 0) - (v.nivelDe.get(b.email) ?? 0));
  console.log(`\n== fase 2 · uplines (${comUpline.length}) ==`);
  let ok = 0;
  const falhas = [];
  for (const r of comUpline) {
    const affiliateId = idPorEmail.get(r.email);
    const uplineId = idPorEmail.get(v.pai.get(r.email));
    try {
      await api('POST', '/api/affiliate-uplines', { affiliateId, uplineId });
      ok++;
      if (ok % 25 === 0) console.log(`   ${ok}/${comUpline.length}`);
    } catch (e) {
      falhas.push(`${r.email}: ${e.message}`);
    }
  }
  console.log(`arestas gravadas: ${ok}   falhas: ${falhas.length}`);
  for (const f of falhas.slice(0, 20)) console.error(`   - ${f}`);

  // ---- conferencia --------------------------------------------------------
  const mapa = (await api('GET', '/api/affiliate-uplines'))?.uplines ?? {};
  const gravadas = Object.values(mapa).filter(Boolean).length;
  const esperado = new Map();
  for (const r of comUpline) esperado.set(idPorEmail.get(r.email), idPorEmail.get(v.pai.get(r.email)));
  let divergentes = 0;
  for (const [aff, up] of esperado) if (String(mapa[aff] ?? '') !== String(up)) divergentes++;
  console.log(`\n== conferencia ==`);
  console.log(`arestas no banco: ${gravadas}   esperadas do TSV: ${esperado.size}   divergentes: ${divergentes}`);
  if (divergentes || falhas.length) {
    console.error(`\n!! conferencia NAO fechou — nao declare a migracao concluida.`);
    process.exit(1);
  }
  console.log(`\nOK. Proximo passo (NAO feito por este script): taxas por afiliado`);
  console.log(`(affiliate_configs) — passo 5 do README. Sem elas o repasse e' 0 e o`);
  console.log(`"lucro liquido" do /admin exibe a comissao inteira como lucro.`);
}

main().catch((e) => { console.error(`\nFALHOU: ${e.message}`); process.exit(1); });
