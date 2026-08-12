// Triagem de links de divulgação — o painel operacional do dia a dia, portado da
// tela /regras da plataforma legada da Infinity: as 5 VISÕES (com link, sem link,
// standby, com link e sem resultado, produzindo) sobre o cruzamento
// afiliado × `affiliate_links` × produção no período.
//
// Núcleo PURO (sem Firebase): compartilhado entre a página do admin e as rotas
// /api/affiliate-links do servidor (que só pode importar de src/lib).
//
// STANDBY é o pool de links já cunhados na casa e ainda SEM DONO — no legado da
// Esportiva eram 288 tags pré-geradas. Representamos como doc de `affiliate_links`
// com `affiliateId` vazio e `active: false`: o /go/:code recusa link inativo, então
// um link do pool nunca redireciona nem conta clique antes de ser atribuído.

import { num } from './commission';

export type LinkTriageView =
  | 'com_link'
  | 'sem_link'
  | 'standby'
  | 'com_link_sem_resultado'
  | 'com_link_com_resultado';

export const LINK_TRIAGE_VIEWS: LinkTriageView[] = [
  'com_link',
  'sem_link',
  'standby',
  'com_link_sem_resultado',
  'com_link_com_resultado',
];

export const LINK_TRIAGE_LABELS: Record<LinkTriageView, string> = {
  com_link: 'Com link',
  sem_link: 'Sem link',
  standby: 'Standby',
  com_link_sem_resultado: 'Com link e sem resultado',
  com_link_com_resultado: 'Produzindo',
};

export interface TriageLink {
  code: string;
  affiliateId?: string | null;
  brandId?: string | null;
  registerUrl?: string | null;
  active?: boolean;
  clicks?: unknown;
}

export interface TriageAffiliate {
  id: string;
  name?: string;
  email?: string;
  brand?: { id?: string | null; name?: string | null } | null;
}

export interface TriageRow {
  affiliateId: string;
  name: string;
  email: string;
  link: TriageLink | null; // link ENTREGÁVEL (ativo e com destino); null = sem link
  hasLink: boolean;
  producing: boolean;
  clicks: number;
}

// Link utilizável pelo afiliado: ativo E com destino. Doc sem `registerUrl` é o
// caso real do repo — a parceria é aprovada antes de a casa ter o template de
// cadastro configurado, e o afiliado vê "link indisponível".
export function isDeliverableLink(link: TriageLink | null | undefined): boolean {
  if (!link) return false;
  if (link.active === false) return false;
  return String(link.registerUrl ?? '').trim() !== '';
}

// Pool sem dono. `active` não entra aqui: um link do pool é standby por não ter
// afiliado, e mantê-lo inativo é o mecanismo que impede o /go de servi-lo.
export function isStandbyLink(link: TriageLink | null | undefined): boolean {
  if (!link) return false;
  return String(link.affiliateId ?? '').trim() === '';
}

// Chave de marca de um link/casa (mesma convenção de `dealBrandKey`: brandId da
// OTG quando existe, senão o slug da casa manual).
function brandKeyOf(value: unknown): string {
  return String(value ?? '').trim();
}

// Filtra por casa. Sem `brandKey` devolve tudo; com ele, mantém os links daquela
// marca. Link sem marca (emitido antes do multi-casa) entra em qualquer filtro —
// descartá-lo faria o afiliado aparecer como "sem link" tendo link.
export function linksForBrand<T extends TriageLink>(links: T[], brandKey?: string | null): T[] {
  const key = brandKeyOf(brandKey);
  if (!key) return [...(links ?? [])];
  return (links ?? []).filter((l) => {
    const b = brandKeyOf(l.brandId);
    return b === '' || b === key;
  });
}

export interface LinkTriageResult {
  rows: TriageRow[]; // uma linha por afiliado
  standby: TriageLink[]; // pool sem dono
  counts: Record<LinkTriageView, number>;
}

/**
 * Cruza roster × links × produção. `producingIds` vem de `producingAffiliateIds`
 * (OTG + casas manuais unidas) — a triagem NÃO reimplementa "produziu".
 *
 * Um afiliado com mais de um link na mesma marca fica com o primeiro entregável;
 * havendo só links quebrados, guardamos o primeiro deles para a UI poder mostrar
 * o motivo (inativo / sem destino) em vez de um vazio mudo.
 */
export function buildLinkTriage(
  affiliates: TriageAffiliate[] | null | undefined,
  links: TriageLink[] | null | undefined,
  producingIds: Set<string> | null | undefined,
  brandKey?: string | null,
): LinkTriageResult {
  const scoped = linksForBrand(Array.isArray(links) ? links : [], brandKey);
  const byAffiliate = new Map<string, TriageLink[]>();
  const standby: TriageLink[] = [];

  for (const link of scoped) {
    if (isStandbyLink(link)) {
      standby.push(link);
      continue;
    }
    const id = String(link.affiliateId ?? '').trim();
    const list = byAffiliate.get(id);
    if (list) list.push(link);
    else byAffiliate.set(id, [link]);
  }

  const producing = producingIds instanceof Set ? producingIds : new Set<string>();
  const rows: TriageRow[] = (Array.isArray(affiliates) ? affiliates : []).map((aff) => {
    const affiliateId = String(aff?.id ?? '').trim();
    const owned = byAffiliate.get(affiliateId) ?? [];
    const deliverable = owned.find(isDeliverableLink) ?? null;
    const link = deliverable ?? owned[0] ?? null;
    const hasLink = deliverable !== null;
    return {
      affiliateId,
      name: String(aff?.name ?? '').trim() || affiliateId,
      email: String(aff?.email ?? '').trim(),
      link,
      hasLink,
      producing: producing.has(affiliateId),
      // Cliques do afiliado na marca: soma TODOS os links dele, não só o
      // entregável — link desativado ainda carrega o histórico.
      clicks: owned.reduce((sum, l) => sum + num(l.clicks), 0),
    };
  });

  return {
    rows,
    standby,
    counts: {
      com_link: rows.filter((r) => r.hasLink).length,
      sem_link: rows.filter((r) => !r.hasLink).length,
      standby: standby.length,
      com_link_sem_resultado: rows.filter((r) => r.hasLink && !r.producing).length,
      com_link_com_resultado: rows.filter((r) => r.hasLink && r.producing).length,
    },
  };
}

export function rowsForView(rows: TriageRow[], view: LinkTriageView): TriageRow[] {
  switch (view) {
    case 'com_link':
      return rows.filter((r) => r.hasLink);
    case 'sem_link':
      return rows.filter((r) => !r.hasLink);
    case 'com_link_sem_resultado':
      return rows.filter((r) => r.hasLink && !r.producing);
    case 'com_link_com_resultado':
      return rows.filter((r) => r.hasLink && r.producing);
    case 'standby':
      return []; // o standby é pool de LINKS, não de afiliados — ver `standby`
    default:
      return rows;
  }
}

// Busca livre da barra de filtros: id, nome, e-mail, tag/code ou destino.
export function searchRows(rows: TriageRow[], term: string): TriageRow[] {
  const q = String(term ?? '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.affiliateId, r.name, r.email, r.link?.code, r.link?.registerUrl]
      .map((v) => String(v ?? '').toLowerCase())
      .some((v) => v.includes(q)),
  );
}

// ---------------------------------------------------------------------------
// Importação do pool de standby — "cole links, 1 por linha" do legado.

export interface ParsedStandbyLink {
  registerUrl: string;
  tag: string;
}

export interface StandbyParseResult {
  links: ParsedStandbyLink[];
  invalid: string[]; // linhas recusadas, devolvidas pra UI mostrar o que caiu fora
}

// Parâmetros de tag usados pelas plataformas de afiliação que aparecem no
// legado e nas casas BR (Income Access `afp/afp2`, Affilka `btag`, `subid`,
// Quintessence/R2D Partners — LEON Bet — `anid`).
export const TAG_PARAMS = ['tag', 'afp', 'afp2', 'btag', 'subid', 'sub_id', 'clickid', 'anid'];

export function extractTagFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const param of TAG_PARAMS) {
      const value = url.searchParams.get(param);
      if (value && value.trim()) return value.trim();
    }
  } catch {
    /* URL inválida: quem chama já recusa a linha */
  }
  return '';
}

/**
 * Parseia o texto colado. Cada linha é `URL` ou `URL<TAB|;|,>TAG` (a tag
 * explícita ganha da extraída da query, que é o comportamento do import XLSX
 * "Coluna A: Link, Coluna B: Tag"). Só http(s); duplicata de URL é descartada.
 */
export function parseStandbyLinks(text: string): StandbyParseResult {
  const links: ParsedStandbyLink[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Separa URL da tag explícita. A vírgula só separa quando NÃO faz parte da
    // URL — por isso quebramos no primeiro TAB/;/, que venha depois de espaço
    // ou que anteceda um token sem "://".
    const parts = line.split(/[\t;,]|\s{1,}/).filter(Boolean);
    const registerUrl = parts[0] ?? '';
    const explicitTag = parts.length > 1 ? parts[parts.length - 1].trim() : '';
    if (!/^https?:\/\/.+/i.test(registerUrl)) {
      invalid.push(line);
      continue;
    }
    let normalized: string;
    try {
      normalized = new URL(registerUrl).toString();
    } catch {
      invalid.push(line);
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    links.push({
      registerUrl: normalized,
      tag: explicitTag || extractTagFromUrl(normalized),
    });
  }

  return { links, invalid };
}

// ---------------------------------------------------------------------------
// Ponta do AFILIADO ("Meus Links").
//
// A tela nasceu no marketplace e listava só link de PARCERIA aprovada. Mas um
// `affiliate_links` também nasce sem parceria: atribuído pela triagem (pool de
// standby) ou migrado de plataforma legada. Esses links funcionavam no /go e
// não apareciam pro dono — o que fazia a migração dos links da Esportiva entrar
// e ficar invisível. `buildMyLinkCards` UNE as duas origens.

export interface MyLinkPartnership {
  id?: string;
  code?: string | null;
  operatorName?: string | null;
  dealLabel?: string | null;
  houseId?: string | null;
}

export interface MyLinkHouse {
  id: string;
  slug?: string | null;
  name?: string | null;
  brandId?: string | null;
}

export interface MyLinkCard {
  key: string;
  code: string;
  houseId: string | null; // resolve a logo na UI
  title: string;
  subtitle: string;
  registerUrl: string;
  clicks: number;
  deliverable: boolean;
  source: 'partnership' | 'assigned';
}

// Casa de um link pela chave de marca (brandId da OTG ou slug da casa manual —
// mesma convenção de `dealBrandKey`).
export function houseForBrandKey(
  houses: MyLinkHouse[] | null | undefined,
  brandKey: string | null | undefined,
): MyLinkHouse | null {
  const key = brandKeyOf(brandKey);
  if (!key) return null;
  const list = Array.isArray(houses) ? houses : [];
  return (
    list.find((h) => brandKeyOf(h?.brandId) === key) ??
    list.find((h) => brandKeyOf(h?.slug) === key) ??
    list.find((h) => brandKeyOf(h?.id) === key) ??
    null
  );
}

/**
 * Cartões da tela do afiliado: parcerias aprovadas + links atribuídos/migrados
 * que não pertencem a nenhuma parceria. O `code` é a chave de deduplicação — um
 * link de parceria NUNCA aparece duas vezes, mesmo estando nas duas listas.
 */
export function buildMyLinkCards(
  partnerships: MyLinkPartnership[] | null | undefined,
  links: TriageLink[] | null | undefined,
  houses: MyLinkHouse[] | null | undefined,
): MyLinkCard[] {
  const byCode = new Map<string, TriageLink>();
  for (const l of Array.isArray(links) ? links : []) {
    const code = String(l?.code ?? '').trim();
    if (code) byCode.set(code, l);
  }

  const cards: MyLinkCard[] = [];
  const used = new Set<string>();

  for (const p of Array.isArray(partnerships) ? partnerships : []) {
    const code = String(p?.code ?? '').trim();
    if (!code) continue; // parceria sem link emitido não vira cartão
    used.add(code);
    const link = byCode.get(code) ?? null;
    cards.push({
      key: String(p?.id ?? code),
      code,
      houseId: p?.houseId != null ? String(p.houseId) : null,
      title: String(p?.operatorName ?? '').trim() || 'Operadora',
      subtitle: String(p?.dealLabel ?? '').trim(),
      registerUrl: String(link?.registerUrl ?? '').trim(),
      clicks: num(link?.clicks),
      deliverable: isDeliverableLink(link),
      source: 'partnership',
    });
  }

  for (const [code, link] of byCode) {
    if (used.has(code)) continue;
    if (isStandbyLink(link)) continue; // pool sem dono não é do afiliado
    const house = houseForBrandKey(houses, link?.brandId);
    cards.push({
      key: code,
      code,
      houseId: house ? String(house.id) : null,
      title: String(house?.name ?? '').trim() || brandKeyOf(link?.brandId) || 'Operadora',
      subtitle: 'Link de divulgação',
      registerUrl: String(link?.registerUrl ?? '').trim(),
      clicks: num(link?.clicks),
      deliverable: isDeliverableLink(link),
      source: 'assigned',
    });
  }

  return cards.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR') || a.code.localeCompare(b.code));
}
