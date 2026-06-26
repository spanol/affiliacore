// Identidade de afiliado NATIVO Boost — afiliados que existem só na Boost (não na
// OTG), usados pelas casas manuais ("soltar da OTG"). PURO (sem Firebase): id, chave
// de e-mail e a montagem do roster de cruzamento. O servidor (Admin SDK) reusa
// `makeBoostAffiliateId`/`normalizeEmailKey`; a página monta o lookup com `buildImportRoster`.

export const BOOST_ID_PREFIX = 'boost_';

// Id aleatório, NUNCA derivado do e-mail (o id vive no mirror `affiliates`, que é
// legível por qualquer logado — derivar do e-mail vazaria PII no id).
export function makeBoostAffiliateId(uuid: string): string {
  return `${BOOST_ID_PREFIX}${uuid}`;
}

export function isBoostAffiliateId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(BOOST_ID_PREFIX);
}

// Chave canônica de e-mail = id do doc `affiliate_email_aliases/{normEmail}`. Só
// trim+lowercase (NÃO usar stripKey, que troca "." por "_" e quebraria o e-mail).
export function normalizeEmailKey(email: string | null | undefined): string {
  return String(email ?? '').trim().toLowerCase();
}

// --- Roster de cruzamento (import) ------------------------------------------
// Funde as três fontes num único roster pro buildAffiliateLookup, chaveado por
// affiliateId: NOME vem do mirror `affiliates` (OTG + nativos Boost); E-MAILS vêm
// dos logins da plataforma (`users` com affiliateId) e dos aliases (admin-only).
// Assim o cruzamento por e-mail funciona mesmo p/ quem não tem id na OTG, e o
// rótulo exibido no preview carrega o nome certo.
export interface RosterAffiliate { id?: string; _id?: string; name?: string; email?: string | null }
export interface RosterUser { affiliateId?: string | null; name?: string; email?: string | null }
export interface RosterAlias { affiliateId?: string | null; name?: string; email?: string | null }
export interface RosterEntry { id: string; name?: string; emails: string[] }

export function buildImportRoster(
  affiliates: RosterAffiliate[],
  users: RosterUser[],
  aliases: RosterAlias[]
): RosterEntry[] {
  const byId = new Map<string, { id: string; name?: string; emails: Set<string> }>();
  const ensure = (rawId: string | null | undefined): { id: string; name?: string; emails: Set<string> } | null => {
    const id = String(rawId ?? '').trim();
    if (!id) return null;
    let e = byId.get(id);
    if (!e) { e = { id, emails: new Set<string>() }; byId.set(id, e); }
    return e;
  };
  const addEmail = (e: { emails: Set<string> } | null, email?: string | null) => {
    const k = normalizeEmailKey(email);
    if (e && k) e.emails.add(k);
  };
  const setName = (e: { name?: string } | null, name?: string | null) => {
    const n = String(name ?? '').trim();
    if (e && n && !e.name) e.name = n;
  };

  // 1) mirror affiliates (OTG + nativos Boost): fonte preferencial do NOME.
  for (const a of Array.isArray(affiliates) ? affiliates : []) {
    const e = ensure(a.id ?? a._id);
    setName(e, a.name);
    addEmail(e, a.email);
  }
  // 2) logins da plataforma: e-mail de login -> affiliateId (e nome como fallback).
  for (const u of Array.isArray(users) ? users : []) {
    if (!u.affiliateId) continue;
    const e = ensure(u.affiliateId);
    setName(e, u.name);
    addEmail(e, u.email);
  }
  // 3) aliases (admin-only): e-mail extra -> affiliateId existente (vínculo manual / nativo).
  for (const al of Array.isArray(aliases) ? aliases : []) {
    if (!al.affiliateId) continue;
    const e = ensure(al.affiliateId);
    setName(e, al.name);
    addEmail(e, al.email);
  }

  return [...byId.values()].map((e) => ({ id: e.id, name: e.name, emails: [...e.emails] }));
}
