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
export type ShowcasePayload =
  | { enabled: false }
  | { enabled: true; name: string; description: string; siteUrl: string; accent?: string };

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

export function buildShowcasePayload(
  doc: Partial<ShowcaseConfig> | null | undefined,
  brand: { name: string; accent?: unknown },
): ShowcasePayload {
  if (doc?.enabled !== true) return { enabled: false };
  const accent = safeAccent(brand.accent);
  return {
    enabled: true,
    name: String(brand.name ?? '').trim() || 'AffiliaCore',
    description: String(doc.description ?? '').trim().slice(0, SHOWCASE_DESCRIPTION_MAX),
    siteUrl: normalizeShowcaseUrl(doc.siteUrl) || '',
    ...(accent ? { accent } : {}),
  };
}
