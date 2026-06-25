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
// AUTENTICAÇÃO (atenção): o dashboard `partners.grupootg.com` EXIGE 2FA (achado
// 2026-06-25: localStorage tem `2fa:login`). Por isso NÃO há password-grant
// server-side como no (2)/Supabase — email+senha do Carlos não passam sozinhos.
// O token de acesso (Bearer, ~curto) precisa ser obtido PÓS-2FA e fornecido via
// Secret Manager (`OTG_DASH_ACCESS_TOKEN`). Quando soubermos o endpoint de refresh
// (capturar 1 login no DevTools), trocamos por refresh-token durável aqui.
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
  token: process.env.OTG_DASH_ACCESS_TOKEN || '',
  houses: (process.env.OTG_DASH_HOUSES || 'sportingbet,superbet')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
});

export const isOtgAnalyticsConfigured = (): boolean => {
  const { base, token, houses } = cfg();
  return Boolean(base && token && houses.length);
};

// O dashboard usa Bearer JWT custom (NÃO Supabase). Com 2FA, o token vem pronto do
// Secret Manager (capturado pós-2FA). Sem token → erro explícito.
const getAccessToken = (): string => {
  const { token } = cfg();
  if (!token) {
    throw new Error(
      'OTG_DASH_ACCESS_TOKEN ausente. O partners.grupootg.com exige 2FA, então não há ' +
        'password-grant server-side: forneça um access token (pós-2FA) no Secret Manager. ' +
        'Ver SPIKE-OTG-V1-ANALYTICS.md §3/§5.'
    );
  }
  return token;
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
    throw new Error('Credenciais da v1 analítica ausentes (OTG_DASH_API_BASE + OTG_DASH_ACCESS_TOKEN).');
  }
  const token = getAccessToken();
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
