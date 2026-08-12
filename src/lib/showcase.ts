// Vitrine AffiliaCore — a agência decide (opt-in) aparecer na seção "clientes"
// da LP do produto (affiliacore.com.br) e escreve a própria apresentação.
//
// Núcleo PURO (sem Firebase), padrão supportContact.ts: o server importa daqui
// o saneamento (PUT do admin) e a montagem do payload PÚBLICO (GET sem auth que
// a LP consome cross-origin). O doc mora em `settings/showcase` (admin-only nas
// rules) — o que sai pro mundo é SÓ o payload montado aqui, nunca o doc cru.

export interface ShowcaseInput {
  enabled?: boolean; // aparecer na vitrine da LP do produto
  description?: string; // apresentação escrita pela agência (opcional)
  siteUrl?: string; // site público da agência (opcional, https)
}

export interface ShowcaseConfig {
  enabled: boolean;
  description: string;
  siteUrl: string;
}

// Payload público servido à LP. `enabled:false` é a ÚNICA coisa que sai quando a
// agência não optou — nada do rascunho salvo vaza.
// `logoUrl` é a logo REAL da instância na variante que lê bem em fundo escuro —
// a LP a exibe numa plaqueta escura (a mesma do card estático), então uma
// variante só serve os dois temas da LP. Caminho relativo (`/infinity/...`) é
// resolvido pela LP contra a origem da instância.
export type ShowcasePayload =
  | { enabled: false }
  | {
      enabled: true;
      name: string;
      description: string;
      siteUrl: string;
      accent?: string;
      logoUrl?: string;
    };

export const SHOWCASE_DESCRIPTION_MAX = 400;
export const SHOWCASE_URL_MAX = 200;

export const SHOWCASE_EMPTY: ShowcaseConfig = { enabled: false, description: '', siteUrl: '' };

const URL_ERROR = 'Site inválido — informe a URL completa começando com https:// (ex.: https://suaagencia.com.br).';

export interface ShowcaseSanitizeResult {
  ok: boolean;
  value?: ShowcaseConfig;
  error?: string;
}

// URL do site: vazia (= sem link) ou https absoluta e parseável. http cru não
// entra — o link renderiza na LP do produto, não vamos apontar pra página sem TLS.
export function normalizeShowcaseUrl(raw: unknown): string | null {
  const url = String(raw ?? '').trim().slice(0, SHOWCASE_URL_MAX);
  if (!url) return '';
  if (!/^https:\/\//i.test(url)) return null;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

export function sanitizeShowcase(body: unknown): ShowcaseSanitizeResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const siteUrl = normalizeShowcaseUrl(b.siteUrl);
  if (siteUrl == null) return { ok: false, error: URL_ERROR };
  const description = String(b.description ?? '').trim().slice(0, SHOWCASE_DESCRIPTION_MAX);
  return { ok: true, value: { enabled: b.enabled === true, description, siteUrl } };
}

// Accent da instância (VITE_BRAND_ACCENT) só entra no payload se for um hex
// válido — a LP injeta esse valor em style, então formato livre não passa.
function safeAccent(raw: unknown): string | undefined {
  const hex = String(raw ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : undefined;
}

// Logo pro payload: só https absoluta ou caminho com raiz (`/x`) — vira src de
// <img> na LP, então esquema livre não passa. Vazio/inválido → sem logo (a LP
// cai no avatar de inicial).
function safeLogoUrl(raw: unknown): string | undefined {
  const url = String(raw ?? '').trim().slice(0, SHOWCASE_URL_MAX);
  if (/^https:\/\/./.test(url)) return url;
  if (/^\/[^/\\]/.test(url)) return url;
  return undefined;
}

// A mesma regra do <InstanceLogo/>: par claro/escuro COMPLETO → a variante do
// tema escuro (a que lê em fundo escuro); par incompleto ou ausente → a mono
// branca clássica (logoUrl). A plaqueta da LP é sempre escura, então uma
// variante basta.
export function resolveShowcaseLogo(brand: {
  logoUrl?: unknown;
  logoLightUrl?: unknown;
  logoDarkUrl?: unknown;
}): string | undefined {
  if (brand.logoLightUrl && brand.logoDarkUrl) {
    return safeLogoUrl(brand.logoDarkUrl) ?? safeLogoUrl(brand.logoUrl);
  }
  return safeLogoUrl(brand.logoUrl);
}

// O estado da vitrine É a declaração de auto-cadastro: ligada = a agência aceita
// cadastro espontâneo de afiliado (sem convite) e por isso aparece na vitrine;
// desligada = onboarding só por convite. O /register da instância consulta o
// próprio GET /api/showcase (público, same-origin) e decide por esta função.
// FAIL-OPEN de propósito: resposta ilegível (build antiga do servidor → o 404 cai
// no fallback SPA e volta HTML) ou erro de rede mantém o cadastro aberto — o gate
// só fecha com um {enabled:false} explícito do servidor.
export function selfRegistrationOpen(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return true;
  return (payload as { enabled?: unknown }).enabled !== false;
}

export function buildShowcasePayload(
  doc: Partial<ShowcaseConfig> | null | undefined,
  brand: { name: string; accent?: unknown; logoUrl?: unknown; logoLightUrl?: unknown; logoDarkUrl?: unknown },
): ShowcasePayload {
  if (doc?.enabled !== true) return { enabled: false };
  const accent = safeAccent(brand.accent);
  const logoUrl = resolveShowcaseLogo(brand);
  return {
    enabled: true,
    name: String(brand.name ?? '').trim() || 'AffiliaCore',
    description: String(doc.description ?? '').trim().slice(0, SHOWCASE_DESCRIPTION_MAX),
    siteUrl: normalizeShowcaseUrl(doc.siteUrl) || '',
    ...(accent ? { accent } : {}),
    ...(logoUrl ? { logoUrl } : {}),
  };
}
