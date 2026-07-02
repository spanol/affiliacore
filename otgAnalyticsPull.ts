// ============================================================================
// OTG · pull da v1 ANALÍTICA da agência (cliques + funil inicial + NGR)
// ----------------------------------------------------------------------------
// Terceiro backend da OTG (ver boost-external-api-state + SPIKE-OTG-V1-ANALYTICS):
//   1) Relatório v2 (affiliate-api-prd / x-api-key) — só quem JÁ comissionou.
//   2) Provisionamento (links.otgpartners → Supabase) — roster de aprovados.
//   3) ANALÍTICO v1 (partners.grupootg.com / JWT da agência) — cliques/handle/NGR
//      e TODOS os afiliados, inclusive os só-funil que a v2 esconde (caso "Lucas").
// Este módulo lê o (3) server-side: `GET {BASE}/api/v1/agency/{casa}-analytics`.
//
// AUTENTICAÇÃO (contrato capturado 2026-06-25 via interceptor no dashboard):
//   POST {BASE}/api/v1/auth/login  body { email, password, deviceToken }
//     → 200 { data: { user, access_token, deviceToken } }
//   - `access_token`: Bearer p/ /api/v1/agency/*, TTL ~15 min.
//   - `deviceToken`: prova "verified-2fa" (localStorage `2fa:login.token`), TTL ~8h.
//     É o que PULA o OTP no re-login — sem ele o login exigiria 2FA interativo.
//   - NÃO há refresh-token: o próprio login é o "refresh". /api/v1/auth/refresh existe
//     mas não aceitou os tokens testados. Sem access_token o dashboard cai no /login.
// Logo a auth DURÁVEL server-side = guardar email+senha+deviceToken (Secret Manager) e
// logar sob demanda, cacheando o access_token de 15 min em memória. O Carlos só re-troca
// o deviceToken a cada ~8h (capturar `2fa:login` no localStorage pós-2FA) — 32× menos
// que o access_token manual. `OTG_DASH_ACCESS_TOKEN` segue como override manual rápido.
// Ver SPIKE-OTG-V1-ANALYTICS.md.
// ============================================================================

import { mapAnalyticsRows, FunnelRow } from './src/lib/otgAnalytics';

export interface AnalyticsRange {
  initialDate: string; // YYYY-MM-DD
  finalDate: string; // YYYY-MM-DD
}

export interface HouseAnalytics {
  house: string;
  summary: Record<string, number> | null;
  rows: FunnelRow[];
  available: boolean; // false se a casa não tem endpoint analítico (404) ou se o pull dela falhou
  error?: string; // mensagem quando o pull DESTA casa falhou (não-404; ex.: 401 token expirado)
}

export interface AnalyticsPullResult {
  houses: HouseAnalytics[];
  rows: FunnelRow[]; // achatado (todas as casas)
  fetchedAt: string;
}

type FetchImpl = typeof fetch;

const cfg = () => ({
  base: (process.env.OTG_DASH_API_BASE || '').replace(/\/+$/, ''),
  token: process.env.OTG_DASH_ACCESS_TOKEN || '', // override manual (pós-2FA, ~15 min)
  email: process.env.OTG_DASH_EMAIL || '',
  password: process.env.OTG_DASH_PASSWORD || '',
  deviceToken: process.env.OTG_DASH_DEVICE_TOKEN || '', // = 2fa:login.token (~8h)
  houses: (process.env.OTG_DASH_HOUSES || 'sportingbet,superbet')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
});

export const isOtgAnalyticsConfigured = (): boolean => {
  const { base, token, email, password, deviceToken, houses } = cfg();
  // configurada se houver base + casas + (token manual OU trio de login durável).
  return Boolean(base && houses.length && (token || (email && password && deviceToken)));
};

// Cache em memória do access_token (TTL ~15 min) p/ não logar a cada request. Por
// processo; some no restart (tsx server.ts) — ok, o próximo pull re-loga.
let cachedAccess: { token: string; expMs: number } | null = null;

// Exposto só p/ testes isolarem o cache entre casos.
export const __resetOtgAuthCacheForTests = (): void => {
  cachedAccess = null;
};

const decodeExpMs = (jwt: string): number | null => {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

// Login durável: POST /api/v1/auth/login { email, password, deviceToken } → access_token.
const loginForAccessToken = async (fetchImpl: FetchImpl): Promise<string> => {
  const { base, email, password, deviceToken } = cfg();
  const resp = await fetchImpl(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password, deviceToken }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const hint =
      resp.status === 401
        ? 'Email/senha incorretos.'
        : 'O deviceToken pode ter expirado (~8h) — recapture o 2fa:login pós-2FA e atualize OTG_DASH_DEVICE_TOKEN.';
    throw new Error(`OTG login: HTTP ${resp.status}. ${hint} ${text.slice(0, 160)}`);
  }
  const body = await resp.json().catch(() => null);
  const data = body?.data ?? {};
  const accessToken = data.access_token || data.accessToken || data.token;
  if (accessToken) return accessToken;
  // 200 mas com DESAFIO de 2FA ({requires2FA, pendingToken, maskedEmail}): o deviceToken
  // não pulou o OTP — quase sempre porque EXPIROU (~8h) ou foi invalidado. NÃO é mudança
  // de contrato; é o estado esperado quando o deviceToken vence. Mensagem ACIONÁVEL (o que
  // o operador precisa fazer) em vez do genérico "shape mudou?". [[boost-v1-analytics-integration]]
  if (data.requires2FA || data.pendingToken || data.maskedEmail) {
    const masked = data.maskedEmail ? ` (código enviado a ${data.maskedEmail})` : '';
    throw new Error(
      `OTG login exigiu 2FA: o deviceToken expirou ou foi invalidado (~8h)${masked}. ` +
        'Recapture o `2fa:login` (localStorage do dashboard) pós-2FA e atualize o secret OTG_DASH_DEVICE_TOKEN, ' +
        'ou defina OTG_DASH_ACCESS_TOKEN (manual, ~15 min). Ver SPIKE-OTG-V1-ANALYTICS.md.'
    );
  }
  throw new Error('OTG login: resposta 200 sem access_token (shape mudou?). data keys: ' + Object.keys(data).join(','));
};

// Resolve um access_token válido: 1) override manual; 2) login durável (cacheado).
const getAccessToken = async (fetchImpl: FetchImpl = fetch): Promise<string> => {
  const { token, email, password, deviceToken } = cfg();
  if (token) return token; // override manual rápido / fallback
  if (email && password && deviceToken) {
    const now = Date.now();
    if (cachedAccess && now < cachedAccess.expMs - 60_000) return cachedAccess.token;
    const accessToken = await loginForAccessToken(fetchImpl);
    cachedAccess = { token: accessToken, expMs: decodeExpMs(accessToken) ?? now + 10 * 60_000 };
    return accessToken;
  }
  throw new Error(
    'v1 analítica sem credencial: defina OTG_DASH_EMAIL + OTG_DASH_PASSWORD + OTG_DASH_DEVICE_TOKEN ' +
      '(login durável; deviceToken = 2fa:login pós-2FA, ~8h) OU OTG_DASH_ACCESS_TOKEN (manual, ~15 min). ' +
      'Ver SPIKE-OTG-V1-ANALYTICS.md.'
  );
};

const MAX_PAGES = 50;
const PAGE_SIZE = 500;

// Puxa o analítico de UMA casa, paginando. Mapeia para FunnelRow[] já normalizado.
export const fetchHouseAnalytics = async (
  house: string,
  range: AnalyticsRange,
  token: string,
  fetchImpl: FetchImpl = fetch
): Promise<HouseAnalytics> => {
  const { base } = cfg();
  let page = 1;
  let totalPages = 1;
  let summary: Record<string, number> | null = null;
  const raw: any[] = [];
  do {
    const qs = new URLSearchParams({
      initialDate: range.initialDate,
      finalDate: range.finalDate,
      // groupBy por afiliado. CONFIRMADO 2026-06-25 (probe direto): scope ∈
      // {AFFILIATES, CAMPAIGNS} — 'affiliate' minúsculo dava HTTP 400. sortBy/
      // sortDirection são opcionais e os valores não foram confirmados → omitidos
      // (o default da API já ordena de forma utilizável). Ver SPIKE §2.
      scope: 'AFFILIATES',
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    const url = `${base}/api/v1/agency/${house}-analytics?${qs.toString()}`;
    const resp = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    // 404 = a casa não tem endpoint analítico exposto (ex.: `superbet-analytics` em
    // 2026-06; só `sportingbet-analytics` existe, embora ambas constem em
    // /api/v1/betting-houses). Degrada como "indisponível" — NÃO derruba as outras.
    if (resp.status === 404) {
      return { house, summary: null, rows: [], available: false };
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`OTG analytics (${house}): HTTP ${resp.status}. ${text.slice(0, 200)}`);
    }
    const body = await resp.json();
    const d = body?.data;
    if (!summary && d?.summary && typeof d.summary === 'object') summary = d.summary;
    const rows = Array.isArray(d?.rows) ? d.rows : [];
    raw.push(...rows);
    // shape de paginação CONFIRMADO: data.meta = {currentPage,totalPages,totalRows,
    // pageSize}. Com pageSize=500 vem tudo em 1 página; o fallback (< PAGE_SIZE → para)
    // cobre o caso de a meta sumir.
    const tp = Number(d?.meta?.totalPages ?? d?.pagination?.totalPages);
    totalPages = Number.isFinite(tp) && tp > 0 ? tp : rows.length < PAGE_SIZE ? page : page + 1;
    page++;
  } while (page <= totalPages && page <= MAX_PAGES);

  return { house, summary, rows: mapAnalyticsRows(raw, house), available: true };
};

// Puxa todas as casas configuradas e devolve achatado + por casa.
export const pullAnalytics = async (
  range: AnalyticsRange,
  fetchImpl: FetchImpl = fetch
): Promise<AnalyticsPullResult> => {
  if (!isOtgAnalyticsConfigured()) {
    throw new Error('Credenciais da v1 analítica ausentes (OTG_DASH_API_BASE + login OTG_DASH_EMAIL/PASSWORD/DEVICE_TOKEN ou OTG_DASH_ACCESS_TOKEN).');
  }
  const token = await getAccessToken(fetchImpl);
  const { houses } = cfg();
  const out: HouseAnalytics[] = [];
  for (const house of houses) {
    // Resiliência por casa: o erro de UMA casa (404 já é tratado como soft dentro de
    // fetchHouseAnalytics; um 5xx pontual cai aqui) não pode derrubar o pull das
    // outras. Token expirado (401) cai aqui p/ TODAS — a rota decide o status final
    // (502 quando NENHUMA casa respondeu). Ver server.ts POST /api/analytics/refresh.
    try {
      out.push(await fetchHouseAnalytics(house, range, token, fetchImpl));
    } catch (e: any) {
      out.push({ house, summary: null, rows: [], available: false, error: e?.message || String(e) });
    }
  }
  return { houses: out, rows: out.flatMap((h) => h.rows), fetchedAt: new Date().toISOString() };
};
