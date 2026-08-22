// Saúde da configuração (F1 de ONBOARDING-AVISOS.md) — motor PURO de checks de
// configuração faltante. Cada check recebe dados que o ADMIN já alcança pelo
// client (roster, configs, users, casas, integrações) e devolve no máximo UM
// achado agregado, com rota de correção. Nada aqui toca Firebase/fetch: o
// consumidor (SetupHealthCard) busca os dados e chama `runSetupChecks`.
//
// Princípios (destilados dos incidentes reais que motivaram cada check):
// - Ausência de taxa ≠ R$ 0: "configurado" = doc de config persistido, a MESMA
//   régua dos chips de /affiliates (savedConfigIds) — nunca `valor || 0`.
// - Silêncio > ruído: um check que dispararia em TODA instância saudável perde a
//   credibilidade do card inteiro. Ex.: ISS só reclama quando HÁ casas com
//   alíquota e outras sem (inconsistência); agência que não retém nada fica em paz.
// - Um achado por check, com a lista de envolvidos em `subjects` — a UI decide
//   quantos nomes mostrar.

import { housesMissingIss, type IssHouse } from './tax';
import { num } from './commission';
import { pluralize } from './plural';

export type SetupSeverity = 'critical' | 'warning' | 'info';

export interface SetupFinding {
  id: string;
  severity: SetupSeverity;
  title: string;
  detail: string;
  fixRoute: string;
  fixLabel: string;
  /** Nomes/descrições dos envolvidos (a UI limita a exibição). */
  subjects: string[];
}

// Entradas duck-typed: shapes MÍNIMOS do que as telas já carregam, para o motor
// não depender dos tipos das páginas/serviços.
export interface SetupRosterItem {
  id?: string | number;
  _id?: string | number;
  name?: string;
  label?: string;
  isPending?: boolean;
}

export interface SetupUser {
  uid: string;
  affiliateId?: string | null;
  role?: string | null;
  isSpecial?: boolean;
  name?: string | null;
  email?: string | null;
}

export interface SetupSpecial {
  affiliateId: string | number;
  active?: boolean;
  subAffiliateIds?: Array<string | number>;
}

export interface SetupHouse extends IssHouse {
  name?: string;
  active?: boolean;
  dataSource?: string | null;
  integration?: string | null;
  /** Id da casa DENTRO de uma rede 1:N (offer_id) — é por ele que o postback a acha. */
  integrationExternalId?: string | null;
  defaultCpa?: number | null;
  defaultRev?: number | null;
}

export interface SetupIntegration {
  id: string;
  label?: string;
  enabled?: boolean;
  hasKey?: boolean;
  houseId?: string | null;
  /** Rede 1:N: o vínculo vive no doc da CASA, não no `houseId` do conector. */
  multiHouse?: boolean;
  /** Conector por postback: a rede empurra o dado, não existe pull. */
  push?: boolean;
}

export interface SetupInputs {
  affiliates?: SetupRosterItem[] | null;
  /** Acordos do marketplace. Só olhado quando `marketplaceEnabled` é true. */
  deals?: Array<{ houseId?: string | null }> | null;
  marketplaceEnabled?: boolean;
  /** Mapa affiliateId → config. PRESENÇA da chave = doc persistido. */
  configs?: Record<string, unknown> | null;
  users?: SetupUser[] | null;
  specials?: Record<string, SetupSpecial> | SetupSpecial[] | null;
  houses?: SetupHouse[] | null;
  integrations?: SetupIntegration[] | null;
  otgEnabled?: boolean;
}

const idOf = (item: SetupRosterItem): string => String(item?.id ?? item?._id ?? '');
const nameOf = (item: SetupRosterItem): string =>
  String(item?.name || item?.label || '').trim() || `#${idOf(item)}`;

// Pré-cadastro tem fluxo próprio (convite/reconciliação) — fora dos checks.
const isPendingItem = (item: SetupRosterItem): boolean =>
  !!item?.isPending || idOf(item).startsWith('pending_');

// Definição canônica de especial ativo (resolveIsSpecial): `active === true`.
const isActiveSpecial = (s: SetupSpecial | null | undefined): boolean => s?.active === true;

const specialsList = (
  specials: SetupInputs['specials'],
): SetupSpecial[] => (Array.isArray(specials) ? specials : Object.values(specials ?? {}));

/** IDs de afiliado vinculados a um login de ADMIN (não aparecem no roster gerido). */
function adminAffiliateIds(users: SetupUser[] | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const u of Array.isArray(users) ? users : []) {
    if (u?.role === 'admin' && u.affiliateId) set.add(String(u.affiliateId));
  }
  return set;
}

/**
 * Afiliados sem NENHUM doc de config (mesma régua do chip "sem configuração" de
 * /affiliates). Exclui pré-cadastros, subs de especial ATIVO (o repasse deles usa
 * a taxa do pai) e afiliados de login admin.
 */
export function checkAffiliatesSemTaxa(
  affiliates: SetupRosterItem[] | null | undefined,
  configs: Record<string, unknown> | null | undefined,
  specials: SetupInputs['specials'],
  users: SetupUser[] | null | undefined,
): SetupFinding | null {
  const roster = Array.isArray(affiliates) ? affiliates : [];
  if (!roster.length) return null;
  const saved = new Set(Object.keys(configs ?? {}));
  const admins = adminAffiliateIds(users);
  const subsOfActive = new Set<string>();
  for (const sp of specialsList(specials)) {
    if (!isActiveSpecial(sp)) continue;
    for (const sub of sp.subAffiliateIds ?? []) subsOfActive.add(String(sub));
  }
  const missing = roster.filter((a) => {
    const id = idOf(a);
    return id && !isPendingItem(a) && !saved.has(id) && !subsOfActive.has(id) && !admins.has(id);
  });
  if (!missing.length) return null;
  return {
    id: 'afiliados-sem-taxa',
    severity: 'warning',
    title: `${pluralize(missing.length, 'afiliado')} sem taxa configurada`,
    detail:
      'Sem CPA ou REV definidos o repasse aparece como R$ 0 no painel. Ausência de taxa não é taxa zero: defina os valores na lista de afiliados.',
    fixRoute: '/affiliates',
    fixLabel: 'Configurar taxas',
    subjects: missing.map(nameOf),
  };
}

/** Afiliados do roster sem NENHUM login vinculado (mesma régua do chip "sem acesso"). */
export function checkAffiliatesSemAcesso(
  affiliates: SetupRosterItem[] | null | undefined,
  users: SetupUser[] | null | undefined,
): SetupFinding | null {
  const roster = Array.isArray(affiliates) ? affiliates : [];
  if (!roster.length) return null;
  const withLogin = new Set(
    (Array.isArray(users) ? users : [])
      .map((u) => String(u?.affiliateId ?? ''))
      .filter(Boolean),
  );
  const admins = adminAffiliateIds(users);
  const missing = roster.filter((a) => {
    const id = idOf(a);
    return id && !isPendingItem(a) && !withLogin.has(id) && !admins.has(id);
  });
  if (!missing.length) return null;
  return {
    id: 'afiliados-sem-acesso',
    severity: 'info',
    title: `${pluralize(missing.length, 'afiliado')} sem login na plataforma`,
    detail:
      'Eles não conseguem entrar e não recebem notificações nem mensagens diretas. Gere o convite de acesso na lista de afiliados.',
    fixRoute: '/affiliates',
    fixLabel: 'Ver afiliados',
    subjects: missing.map(nameOf),
  };
}

/**
 * Especial ATIVO cujo login existe mas está sem a flag `isSpecial` (a
 * dessincronização conhecida): ele loga e não vê o painel da equipe, sem erro
 * nenhum na tela. Especial sem login algum fica de fora (já coberto pelo check
 * de acesso). Salvar o especial de novo respelha a flag.
 */
export function checkEspeciaisSemFlag(
  specials: SetupInputs['specials'],
  users: SetupUser[] | null | undefined,
  affiliates?: SetupRosterItem[] | null,
): SetupFinding | null {
  const list = specialsList(specials).filter(isActiveSpecial);
  if (!list.length) return null;
  const usersByAffId = new Map<string, SetupUser>();
  for (const u of Array.isArray(users) ? users : []) {
    if (u?.affiliateId) usersByAffId.set(String(u.affiliateId), u);
  }
  const nameById = new Map<string, string>();
  for (const a of Array.isArray(affiliates) ? affiliates : []) nameById.set(idOf(a), nameOf(a));
  const broken = list.filter((sp) => {
    const user = usersByAffId.get(String(sp.affiliateId));
    return !!user && user.isSpecial !== true;
  });
  if (!broken.length) return null;
  return {
    id: 'especiais-sem-flag',
    severity: 'critical',
    title: `${pluralize(broken.length, 'afiliado especial', 'afiliados especiais')} sem acesso ao painel da equipe`,
    detail:
      'O registro de especial está ativo mas o login não carrega a marcação, então a pessoa entra e não vê a equipe. Abra o especial na lista de afiliados e salve de novo para sincronizar.',
    fixRoute: '/affiliates',
    fixLabel: 'Revisar especiais',
    subjects: broken.map((sp) => {
      const id = String(sp.affiliateId);
      const user = usersByAffId.get(id);
      return nameById.get(id) || user?.name || user?.email || `#${id}`;
    }),
  };
}

/**
 * ISS inconsistente: só reclama quando AO MENOS UMA casa ativa tem alíquota e
 * outras estão sem. Instância que não retém ISS em casa nenhuma fica em
 * silêncio (ausência = sem retenção é uma escolha válida, ver tax.ts).
 */
export function checkCasasSemIss(houses: SetupHouse[] | null | undefined): SetupFinding | null {
  const list = Array.isArray(houses) ? houses : [];
  const active = list.filter((h) => h?.active !== false);
  const hasAnyIss = active.some((h) => num(h?.issPercent) > 0);
  if (!hasAnyIss) return null;
  const missing = housesMissingIss(active);
  if (!missing.length) return null;
  return {
    id: 'casas-sem-iss',
    severity: 'warning',
    title: `${pluralize(missing.length, 'casa')} sem alíquota de ISS`,
    detail:
      'Outras casas desta instância têm retenção configurada; nas casas sem alíquota o repasse sai bruto, sem retenção nenhuma.',
    fixRoute: '/casas',
    fixLabel: 'Definir alíquotas',
    subjects: missing.map((h) => h.name || String(h.slug ?? h.id ?? '')),
  };
}

/**
 * Casa MANUAL (sem conector) sem taxa padrão: planilha sem a coluna de comissão
 * entra com comissão da casa R$ 0 e o lucro daquele import fica negativo.
 * Casa com conector fica de fora (a comissão vem da API do pull).
 */
export function checkCasasManuaisSemRegua(
  houses: SetupHouse[] | null | undefined,
): SetupFinding | null {
  const missing = (Array.isArray(houses) ? houses : []).filter(
    (h) =>
      h?.active !== false &&
      h?.dataSource === 'manual' &&
      !h?.integration &&
      !(num(h?.defaultCpa) > 0) &&
      !(num(h?.defaultRev) > 0),
  );
  if (!missing.length) return null;
  return {
    id: 'casas-sem-regua',
    severity: 'info',
    title: `${pluralize(missing.length, 'casa manual', 'casas manuais')} sem taxa padrão`,
    detail:
      'Se uma planilha vier sem a coluna de comissão, a comissão da casa entra como R$ 0 e o lucro do período fica distorcido. Defina o CPA ou REV padrão da casa.',
    fixRoute: '/casas',
    fixLabel: 'Definir taxa padrão',
    subjects: missing.map((h) => h.name || String(h.slug ?? h.id ?? '')),
  };
}

/**
 * Casa vinculada a um conector que não está pronto (sem chave ou desligado): sem
 * chave o pull responde erro e o cron não grava nada; num conector por POSTBACK
 * o efeito é outro (a rede dispara e a gente recusa por segredo inválido), então
 * o texto acompanha o eixo do conector. Chamar de "pull parado" uma integração
 * que nunca puxou mandava o admin procurar um botão "Atualizar" que não existe.
 */
export function checkPullSemChave(
  houses: SetupHouse[] | null | undefined,
  integrations: SetupIntegration[] | null | undefined,
): SetupFinding | null {
  const intById = new Map(
    (Array.isArray(integrations) ? integrations : []).map((i) => [String(i.id), i]),
  );
  const subjects: string[] = [];
  let temPull = false;
  let temPostback = false;
  for (const h of Array.isArray(houses) ? houses : []) {
    if (h?.active === false || !h?.integration) continue;
    const conn = intById.get(String(h.integration));
    if (!conn) continue; // conector fora do catálogo é assunto do check de vínculo
    const quebrado = conn.enabled === false || !conn.hasKey;
    if (!quebrado) continue;
    const push = conn.push === true;
    const motivo = conn.enabled === false
      ? 'desligado'
      : push ? 'sem o segredo do postback' : 'sem chave';
    subjects.push(`${h.name || h.slug}: conector ${conn.label || conn.id} ${motivo}`);
    if (push) temPostback = true;
    else temPull = true;
  }
  if (!subjects.length) return null;
  return {
    id: 'pull-sem-chave',
    severity: 'warning',
    title: temPull && temPostback
      ? 'Integração de resultados parada'
      : temPostback ? 'Postback da rede recusado' : 'Pull automático parado',
    detail: temPull && temPostback
      ? 'Há casa vinculada a conector sem chave ou desligado. Enquanto isso o resultado dela não entra por integração nenhuma.'
      : temPostback
        ? 'A rede envia a conversão, mas sem o segredo salvo aqui o disparo é recusado e nada é gravado. Cole o mesmo segredo que está na URL de postback do painel da rede.'
        : 'A casa está vinculada a um conector sem chave ou desligado; a atualização automática responde erro até ajustar a integração.',
    fixRoute: '/integracoes',
    fixLabel: 'Abrir integrações',
    subjects,
  };
}

/**
 * Rede 1:N (postback): casa vinculada ao conector SEM o id da oferta. O disparo
 * chega e não acha dono, e o evento fica no ledger como "sem casa" até alguém
 * preencher e reprocessar. É o que o antigo check de vínculo tentava dizer e
 * dizia errado: numa rede 1:N o `houseId` do conector não é o vínculo, então ele
 * acusava TODA casa de postback de estar apontando para lugar nenhum.
 */
export function checkRedeSemIdDaOferta(
  houses: SetupHouse[] | null | undefined,
  integrations: SetupIntegration[] | null | undefined,
): SetupFinding | null {
  const intById = new Map(
    (Array.isArray(integrations) ? integrations : []).map((i) => [String(i.id), i]),
  );
  const missing = (Array.isArray(houses) ? houses : []).filter((h) => {
    if (h?.active === false || !h?.integration) return false;
    const conn = intById.get(String(h.integration));
    return conn?.multiHouse === true && !String(h.integrationExternalId ?? '').trim();
  });
  if (!missing.length) return null;
  return {
    id: 'rede-sem-id-oferta',
    severity: 'warning',
    title: `${pluralize(missing.length, 'casa')} sem o ID da oferta na rede`,
    detail:
      'A mesma credencial atende várias casas, e é o ID da oferta que diz a qual delas cada conversão pertence. Sem ele o disparo fica registrado sem casa e não vira resultado.',
    fixRoute: '/casas',
    fixLabel: 'Informar o ID',
    subjects: missing.map((h) => h.name || String(h.slug ?? h.id ?? '')),
  };
}

/**
 * Vínculo casa↔integração pela metade: os dois lados do vínculo (doc da casa e
 * doc da integração) apontam para lugares diferentes. Sintoma clássico: a tela
 * de integrações diz "ligada na casa X" e o botão de atualizar da casa X não
 * aparece. No sentido integração→casa só checamos conector COM chave: sem doc e
 * sem chave o alvo vem do default do catálogo e não significa vínculo.
 *
 * REDE 1:N fica FORA dos dois sentidos: lá o vínculo mora só no doc da casa
 * (`integration` + `integrationExternalId`) e o `houseId` do conector é sempre
 * nulo por construção — compará-lo acusava de "vínculo pela metade" toda casa
 * de postback corretamente configurada. O que de fato falta numa rede é o id da
 * oferta, e disso cuida [[checkRedeSemIdDaOferta]].
 */
export function checkVinculoIntegracao(
  houses: SetupHouse[] | null | undefined,
  integrations: SetupIntegration[] | null | undefined,
): SetupFinding | null {
  const houseList = Array.isArray(houses) ? houses : [];
  const intList = Array.isArray(integrations) ? integrations : [];
  const intById = new Map(intList.map((i) => [String(i.id), i]));
  const houseBySlug = new Map(houseList.map((h) => [String(h.slug ?? h.id ?? ''), h]));
  const subjects: string[] = [];
  const seenPairs = new Set<string>();

  for (const h of houseList) {
    if (h?.active === false || !h?.integration) continue;
    const slug = String(h.slug ?? h.id ?? '');
    const conn = intById.get(String(h.integration));
    if (!conn) {
      subjects.push(`${h.name || slug}: conector "${h.integration}" não existe no catálogo`);
      continue;
    }
    if (conn.multiHouse === true) continue; // o vínculo da rede não é 1:1
    const target = String(conn.houseId ?? '');
    if (target !== slug) {
      const alvo = target ? `a casa "${target}"` : 'nenhuma casa';
      subjects.push(
        `${h.name || slug} aponta para ${conn.label || conn.id}, mas o conector está mirando ${alvo}`,
      );
      seenPairs.add(`${conn.id}|${slug}`);
      seenPairs.add(`${conn.id}|${target}`);
    }
  }

  for (const conn of intList) {
    if (!conn?.hasKey || !conn?.houseId || conn.multiHouse === true) continue;
    const slug = String(conn.houseId);
    if (seenPairs.has(`${conn.id}|${slug}`)) continue;
    const h = houseBySlug.get(slug);
    if (!h) {
      subjects.push(`${conn.label || conn.id}: a casa "${slug}" não existe`);
    } else if (String(h.integration ?? '') !== String(conn.id)) {
      subjects.push(
        `${conn.label || conn.id} mira ${h.name || slug}, mas a casa não está vinculada a ele`,
      );
    }
  }

  if (!subjects.length) return null;
  return {
    id: 'vinculo-integracao',
    severity: 'warning',
    title: 'Vínculo entre casa e conector pela metade',
    detail:
      'Casa e integração apontam para lados diferentes, então o pull não roda mesmo parecendo vinculado. Salve o vínculo de novo pela tela de integrações ou pelo modal da casa.',
    fixRoute: '/integracoes',
    fixLabel: 'Refazer vínculo',
    subjects,
  };
}

/** Casa com origem OTG numa instância com a OTG desligada: nenhuma fonte a alimenta. */
export function checkCasasOtgSemFonte(
  houses: SetupHouse[] | null | undefined,
  otgEnabled: boolean | undefined,
): SetupFinding | null {
  if (otgEnabled !== false) return null;
  const orphans = (Array.isArray(houses) ? houses : []).filter(
    (h) => h?.active !== false && h?.dataSource === 'otg',
  );
  if (!orphans.length) return null;
  return {
    id: 'casas-otg-sem-fonte',
    severity: 'warning',
    title: `${pluralize(orphans.length, 'casa')} com origem OTG numa instância sem OTG`,
    detail:
      'A integração OTG está desligada nesta instância, então essas casas não recebem dado de nenhuma fonte. Troque a origem para upload manual ou vincule um conector.',
    fixRoute: '/casas',
    fixLabel: 'Ajustar origem',
    subjects: orphans.map((h) => h.name || String(h.slug ?? h.id ?? '')),
  };
}

/**
 * Casa ativa sem NENHUM acordo no marketplace: ela não existe na vitrine do
 * afiliado, que não tem como solicitar o link. A casa nova já nasce com o
 * rascunho (POST /api/houses), então isto pega o que foi configurado antes disso
 * ou teve o rascunho apagado. Instância com o marketplace desligado fica em
 * silêncio: sem vitrine, casa sem acordo não é pendência nenhuma.
 */
export function checkCasasSemAcordo(
  houses: SetupHouse[] | null | undefined,
  deals: SetupInputs['deals'],
  marketplaceEnabled: boolean | undefined,
): SetupFinding | null {
  if (marketplaceEnabled !== true) return null;
  const comAcordo = new Set(
    (Array.isArray(deals) ? deals : [])
      .map((d) => String(d?.houseId ?? '').trim())
      .filter(Boolean),
  );
  const missing = (Array.isArray(houses) ? houses : []).filter(
    (h) =>
      h?.active !== false &&
      String(h?.name ?? '').trim() &&
      ![h?.slug, h?.id].some((v) => String(v ?? '').trim() && comAcordo.has(String(v).trim())),
  );
  if (!missing.length) return null;
  return {
    id: 'casas-sem-acordo',
    severity: 'info',
    title: `${pluralize(missing.length, 'casa')} sem acordo na vitrine`,
    detail:
      'O afiliado só solicita o link das casas que têm acordo publicado. O rascunho de cada uma já está pronto na tela de acordos, com a taxa padrão da casa.',
    fixRoute: '/acordos',
    fixLabel: 'Abrir acordos',
    subjects: missing.map((h) => h.name || String(h.slug ?? h.id ?? '')),
  };
}

const SEVERITY_RANK: Record<SetupSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Roda todos os checks e devolve os achados ordenados por severidade. */
export function runSetupChecks(inputs: SetupInputs): SetupFinding[] {
  const { affiliates, configs, users, specials, houses, integrations, otgEnabled, deals, marketplaceEnabled } = inputs ?? {};
  const findings = [
    checkEspeciaisSemFlag(specials, users, affiliates),
    checkAffiliatesSemTaxa(affiliates, configs, specials, users),
    checkCasasSemIss(houses),
    checkPullSemChave(houses, integrations),
    checkRedeSemIdDaOferta(houses, integrations),
    checkVinculoIntegracao(houses, integrations),
    checkCasasOtgSemFonte(houses, otgEnabled),
    checkCasasManuaisSemRegua(houses),
    checkCasasSemAcordo(houses, deals, marketplaceEnabled),
    checkAffiliatesSemAcesso(affiliates, users),
  ].filter((f): f is SetupFinding => f !== null);
  return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
