// ============================================================================
// OTG · pull automático do roster de aprovados (provisionamento)
// ----------------------------------------------------------------------------
// A OTG tem DOIS backends (ver memória boost-external-api-state + boost-partner-api):
//   1) Relatório (affiliate-api-prd / x-api-key) — só quem JÁ produziu.
//   2) Provisionamento (links.otgpartners.com.br → Supabase) — o roster REAL de
//      aprovados (link_requests.status=completed), mesmo sem produção.
// Este módulo lê o (2) server-side para manter `pending_affiliates` fresco sem
// depender do snapshot manual (DevTools). Espelha EXATAMENTE o mapeamento de
// scripts/otg-approved/fetch-approved-console.js para gerar as mesmas linhas que
// o import manual já consome (name, nameKey, house, email, phone, social,
// registerUrl, deliveredAt, requestId, batchId).
//
// Credencial: as creds do PRÓPRIO Carlos (decisão 2026-06-17). O app de links não
// tem MFA → password grant server-side. A anon key é PÚBLICA (vem no bundle do
// site); o que protege o roster é o RLS + a sessão autenticada (o par email/senha).
// ============================================================================

// Mesma normalização do server/console: sem espaço, sem acento, minúsculo.
export const normNameKey = (s?: string | null) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export type ApprovedRow = {
  name: string;
  nameKey: string;
  house: string;
  email: string | null;
  phone: string | null;
  social: string | null;
  registerUrl: string | null;
  deliveredAt: string | null;
  requestId: string | null;
  batchId: string | null;
};

export type RosterResult = {
  rows: ApprovedRow[];
  total: number;
  byHouse: Record<string, number>;
  fetchedAt: string;
};

const cfg = () => {
  const url = (process.env.OTG_LINKS_SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = process.env.OTG_LINKS_SUPABASE_ANON_KEY || '';
  const email = process.env.OTG_LINKS_EMAIL || '';
  const password = process.env.OTG_LINKS_PASSWORD || '';
  return { url, anonKey, email, password };
};

export const isOtgLinksConfigured = (): boolean => {
  const { url, anonKey, email, password } = cfg();
  return Boolean(url && anonKey && email && password);
};

// Password grant no Supabase Auth → access_token (1h). Sem MFA neste app.
const signIn = async (): Promise<string> => {
  const { url, anonKey, email, password } = cfg();
  const resp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`OTG links: falha no login (${resp.status}). ${text.slice(0, 200)}`);
  }
  const body = await resp.json();
  const token = body?.access_token;
  if (!token) throw new Error('OTG links: login sem access_token.');
  return token;
};

// Lê os aprovados (status=completed). O RLS do Supabase escopa por usuário/agência,
// então não precisamos filtrar agency_id aqui (a sessão já delimita).
export const pullApprovedRoster = async (): Promise<RosterResult> => {
  if (!isOtgLinksConfigured()) {
    throw new Error('Credenciais do OTG links ausentes (OTG_LINKS_* no .env).');
  }
  const { url, anonKey } = cfg();
  const token = await signIn();

  const cols = 'id,batch_id,affiliate_name,betting_house,status,email,phone,social_link,delivered_urls,delivered_at';
  const query = `link_requests?select=${cols}&status=eq.completed&order=betting_house.asc,affiliate_name.asc&limit=5000`;
  const resp = await fetch(`${url}/rest/v1/${query}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, Prefer: 'count=exact' },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`OTG links: falha ao ler link_requests (${resp.status}). ${text.slice(0, 200)}`);
  }
  const raw = await resp.json();
  if (!Array.isArray(raw)) {
    throw new Error('OTG links: resposta inesperada (esperava um array).');
  }

  const rows = mapApprovedRows(raw);
  const byHouse = rows.reduce<Record<string, number>>((acc, r) => {
    if (r.house) acc[r.house] = (acc[r.house] || 0) + 1;
    return acc;
  }, {});

  return { rows, total: rows.length, byHouse, fetchedAt: new Date().toISOString() };
};

// Mapeia uma linha crua do `link_requests` (Supabase de provisionamento) para o
// formato do snapshot que `upsertPendingRows` consome. Função PURA (testável) —
// espelha exatamente o mapeamento de scripts/otg-approved/fetch-approved-console.js.
export const mapApprovedRows = (raw: any[]): ApprovedRow[] =>
  raw.map((r: any) => ({
    name: String(r.affiliate_name ?? '').trim(),
    nameKey: normNameKey(r.affiliate_name),
    house: String(r.betting_house ?? '').trim(),
    email: r.email ?? null,
    phone: r.phone ?? null,
    social: r.social_link ?? null,
    registerUrl: (r.delivered_urls && r.delivered_urls[0] && r.delivered_urls[0].url) || null,
    deliveredAt: r.delivered_at ?? null,
    requestId: r.id ?? null,
    batchId: r.batch_id ?? null,
  }));
