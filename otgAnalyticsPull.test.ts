// @vitest-environment node
//
// Testa o pull server-side da v1 analítica (otgAnalyticsPull.ts): construção dos
// params (scope=AFFILIATES — 'affiliate' minúsculo dava 400), paginação por
// meta.totalPages, resiliência por casa (404 da superbet NÃO derruba sportingbet)
// e o caminho de auth expirada (401 em todas). fetch é injetado (sem rede).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  fetchHouseAnalytics,
  pullAnalytics,
  isOtgAnalyticsConfigured,
  __resetOtgAuthCacheForTests,
} from './otgAnalyticsPull';

// Response-like mínima (só o que o módulo usa: status/ok/json/text).
const resp = (status: number, data: any) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
});

// Shape REAL capturado de GET /api/v1/agency/sportingbet-analytics (2026-06-25).
const sportingbetPage = (rows: any[], totalPages = 1) => ({
  statusCode: 200,
  message: 'Success',
  data: {
    summary: { clicks: 5462, registrations: 1264, ftd: 484, ngr: 2172.39 },
    rows,
    meta: { currentPage: 1, totalPages, totalRows: 33, pageSize: 500 },
  },
});

const LUCAS = { affiliate: 'LucasGuimaraes', campaign: null, clicks: 20, registrations: 4, ftd: 0, cpa_qual: 0, deposits: 0, bet_amount: 0, ngr: 0 };
const HELDER = { affiliate: 'HelderDosSantosCavalheiro', campaign: null, clicks: 164, registrations: 47, ftd: 12, cpa_qual: 10, deposits: 4645.05, bet_amount: 62332.32, ngr: 1467.96 };

const RANGE = { initialDate: '2026-06-01', finalDate: '2026-06-25' };

const ORIG = { ...process.env };
beforeEach(() => {
  __resetOtgAuthCacheForTests();
  process.env.OTG_DASH_API_BASE = 'https://api.test';
  process.env.OTG_DASH_ACCESS_TOKEN = 'tok-123';
  process.env.OTG_DASH_HOUSES = 'sportingbet,superbet';
});
afterEach(() => {
  process.env = { ...ORIG };
});

describe('isOtgAnalyticsConfigured', () => {
  it('true quando base + token presentes', () => {
    expect(isOtgAnalyticsConfigured()).toBe(true);
  });
  it('false sem token', () => {
    delete process.env.OTG_DASH_ACCESS_TOKEN;
    expect(isOtgAnalyticsConfigured()).toBe(false);
  });
  it('false sem base', () => {
    delete process.env.OTG_DASH_API_BASE;
    expect(isOtgAnalyticsConfigured()).toBe(false);
  });
});

describe('fetchHouseAnalytics · params + paginação', () => {
  it('manda scope=AFFILIATES (não "affiliate") e NÃO manda sortBy; mapeia o Lucas', async () => {
    const urls: string[] = [];
    const headers: any[] = [];
    const fetchImpl: any = async (url: string, init: any) => {
      urls.push(url);
      headers.push(init?.headers);
      return resp(200, sportingbetPage([HELDER, LUCAS]));
    };
    const out = await fetchHouseAnalytics('sportingbet', RANGE, 'tok-123', fetchImpl);

    expect(urls[0]).toContain('/api/v1/agency/sportingbet-analytics?');
    expect(urls[0]).toContain('scope=AFFILIATES');
    expect(urls[0]).not.toContain('scope=affiliate&'); // não é o valor errado que dava 400
    expect(urls[0]).not.toContain('sortBy=');
    expect(urls[0]).toContain('initialDate=2026-06-01');
    expect(urls[0]).toContain('finalDate=2026-06-25');
    expect(headers[0].Authorization).toBe('Bearer tok-123');

    expect(out.available).toBe(true);
    expect(out.summary).toMatchObject({ clicks: 5462 });
    const lucas = out.rows.find((r) => r.nameKey === 'lucasguimaraes');
    expect(lucas).toMatchObject({ affiliate: 'LucasGuimaraes', house: 'sportingbet', clicks: 20, registrations: 4 });
  });

  it('pagina por meta.totalPages e acumula as linhas', async () => {
    let page = 0;
    const fetchImpl: any = async () => {
      page += 1;
      return page === 1
        ? resp(200, sportingbetPage([HELDER], 2))
        : resp(200, sportingbetPage([LUCAS], 2));
    };
    const out = await fetchHouseAnalytics('sportingbet', RANGE, 'tok-123', fetchImpl);
    expect(page).toBe(2);
    expect(out.rows.map((r) => r.affiliate).sort()).toEqual(['HelderDosSantosCavalheiro', 'LucasGuimaraes']);
  });

  it('404 → casa indisponível (sem erro, sem throw), 1 só request', async () => {
    let calls = 0;
    const fetchImpl: any = async () => {
      calls += 1;
      return resp(404, { statusCode: 404, message: 'Not Found' });
    };
    const out = await fetchHouseAnalytics('superbet', RANGE, 'tok-123', fetchImpl);
    expect(calls).toBe(1);
    expect(out).toMatchObject({ house: 'superbet', available: false, rows: [], summary: null });
    expect(out.error).toBeUndefined();
  });

  it('erro não-404 (500) → lança', async () => {
    const fetchImpl: any = async () => resp(500, 'boom');
    await expect(fetchHouseAnalytics('sportingbet', RANGE, 'tok-123', fetchImpl)).rejects.toThrow(/HTTP 500/);
  });
});

describe('pullAnalytics · resiliência por casa', () => {
  it('lança se não configurado', async () => {
    delete process.env.OTG_DASH_ACCESS_TOKEN;
    await expect(pullAnalytics(RANGE, (async () => resp(200, {})) as any)).rejects.toThrow(/ausentes/);
  });

  it('sportingbet 200 + superbet 404: não derruba; rows só da sportingbet', async () => {
    const fetchImpl: any = async (url: string) =>
      url.includes('superbet') ? resp(404, {}) : resp(200, sportingbetPage([HELDER, LUCAS]));
    const out = await pullAnalytics(RANGE, fetchImpl);

    expect(out.houses.map((h) => h.house)).toEqual(['sportingbet', 'superbet']);
    const sb = out.houses.find((h) => h.house === 'sportingbet')!;
    const sup = out.houses.find((h) => h.house === 'superbet')!;
    expect(sb.available).toBe(true);
    expect(sup.available).toBe(false);
    expect(sup.error).toBeUndefined();
    // achatado: só as 2 linhas da sportingbet
    expect(out.rows).toHaveLength(2);
    expect(out.rows.some((r) => r.nameKey === 'lucasguimaraes')).toBe(true);
  });

  it('401 em todas (token expirado): cada casa vira erro, sem throw, rows vazias', async () => {
    const fetchImpl: any = async () => resp(401, { statusCode: 401, message: 'Unauthorized' });
    const out = await pullAnalytics(RANGE, fetchImpl);
    expect(out.houses).toHaveLength(2);
    for (const h of out.houses) {
      expect(h.available).toBe(false);
      expect(h.error).toMatch(/HTTP 401/);
    }
    expect(out.rows).toHaveLength(0);
  });
});

describe('auth durável via login (sem token manual)', () => {
  // contrato real: POST /api/v1/auth/login {email,password,deviceToken} → {data:{access_token,...}}
  const loginOk = (accessToken: string) =>
    resp(200, { data: { user: { id: 'u' }, access_token: accessToken, deviceToken: 'dev-rotacionado' } });

  beforeEach(() => {
    __resetOtgAuthCacheForTests();
    delete process.env.OTG_DASH_ACCESS_TOKEN; // sem override manual → caminho de login
    process.env.OTG_DASH_EMAIL = 'carlos@x.org';
    process.env.OTG_DASH_PASSWORD = 'pw';
    process.env.OTG_DASH_DEVICE_TOKEN = 'dev-2fa';
  });

  it('configurado só com email+senha+deviceToken; falta o deviceToken → não configurado', () => {
    expect(isOtgAnalyticsConfigured()).toBe(true);
    delete process.env.OTG_DASH_DEVICE_TOKEN;
    expect(isOtgAnalyticsConfigured()).toBe(false);
  });

  it('loga (POST body {email,password,deviceToken}) e usa o access_token como Bearer', async () => {
    const calls: any[] = [];
    const fetchImpl: any = async (url: string, init: any) => {
      calls.push({ url, init });
      if (url.includes('/auth/login')) return loginOk('ACCESS-XYZ');
      if (url.includes('superbet')) return resp(404, {});
      return resp(200, sportingbetPage([LUCAS]));
    };
    const out = await pullAnalytics(RANGE, fetchImpl);

    const login = calls.find((c) => c.url.includes('/api/v1/auth/login'));
    expect(login.init.method).toBe('POST');
    expect(JSON.parse(login.init.body)).toEqual({ email: 'carlos@x.org', password: 'pw', deviceToken: 'dev-2fa' });
    const sb = calls.find((c) => c.url.includes('sportingbet-analytics'));
    expect(sb.init.headers.Authorization).toBe('Bearer ACCESS-XYZ');
    expect(out.rows.some((r) => r.nameKey === 'lucasguimaraes')).toBe(true);
  });

  it('login 401 → pullAnalytics rejeita (vira 502 na rota)', async () => {
    const fetchImpl: any = async (url: string) =>
      url.includes('/auth/login') ? resp(401, { message: 'Email ou senha incorretos' }) : resp(200, sportingbetPage([]));
    await expect(pullAnalytics(RANGE, fetchImpl)).rejects.toThrow(/HTTP 401/);
  });

  it('login não-401 (deviceToken expirado) → erro com dica de recapturar', async () => {
    const fetchImpl: any = async () => resp(400, { message: 'invalid device' });
    await expect(pullAnalytics(RANGE, fetchImpl)).rejects.toThrow(/deviceToken/);
  });

  it('login 200 com desafio de 2FA (deviceToken venceu) → erro acionável, NÃO "shape mudou?"', async () => {
    // OTG passou a devolver 200 com o desafio de 2FA em vez do access_token quando o
    // deviceToken não pula mais o OTP. Deve virar mensagem acionável (recapturar token).
    const fetchImpl: any = async (url: string) =>
      url.includes('/auth/login')
        ? resp(200, { data: { requires2FA: true, pendingToken: 'pt-1', maskedEmail: 'c***@x.org' } })
        : resp(200, sportingbetPage([]));
    await expect(pullAnalytics(RANGE, fetchImpl)).rejects.toThrow(/exigiu 2FA.*deviceToken/);
    await expect(pullAnalytics(RANGE, fetchImpl)).rejects.toThrow(/c\*\*\*@x\.org/); // maskedEmail na dica
    await expect(pullAnalytics(RANGE, fetchImpl)).rejects.not.toThrow(/shape mudou/); // sem o genérico enganoso
  });

  it('cacheia o access_token: 2 pulls = 1 login só', async () => {
    let logins = 0;
    const fetchImpl: any = async (url: string) => {
      if (url.includes('/auth/login')) { logins++; return loginOk('ACCESS-CACHED'); }
      if (url.includes('superbet')) return resp(404, {});
      return resp(200, sportingbetPage([LUCAS]));
    };
    await pullAnalytics(RANGE, fetchImpl);
    await pullAnalytics(RANGE, fetchImpl);
    expect(logins).toBe(1);
  });
});
