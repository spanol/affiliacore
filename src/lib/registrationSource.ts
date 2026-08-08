// Origem (source) do auto-cadastro — de onde veio quem chegou às páginas
// públicas da instância. A vitrine da AffiliaCore manda `?src=vitrine-affiliacore`
// nos links das agências; campanhas próprias podem mandar `?src=...` ou
// `utm_source=...`. O boot (main.tsx) captura e guarda na sessionStorage
// (first-touch da sessão); os consumidores carimbam no que o visitante enviar:
// o formulário da Home (`contacts.source`) e o /register (`users/{uid}.source`).
//
// Núcleo puro + wrappers de storage guardados por try (padrão supportContact.ts).

export const REGISTRATION_SOURCE_MAX = 40;
export const REGISTRATION_SOURCE_KEY = 'ac-reg-source';

// Valor que a LP do produto envia nos links da vitrine.
export const VITRINE_SOURCE = 'vitrine-affiliacore';

// Rótulos de exibição das origens conhecidas (Contacts e afins). Origem
// desconhecida é exibida crua — já saneada pelo normalize.
const SOURCE_LABELS: Record<string, string> = {
  [VITRINE_SOURCE]: 'Vitrine AffiliaCore',
};

// Só slug minúsculo (letras/números/._-/underscore, começando alfanumérico, ≤40).
// Qualquer coisa fora disso vira null — o valor vai pro Firestore e pra tela do
// admin, então formato livre não passa.
export function normalizeRegistrationSource(raw: unknown): string | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value || value.length > REGISTRATION_SOURCE_MAX) return null;
  return /^[a-z0-9][a-z0-9._-]*$/.test(value) ? value : null;
}

// Extrai a origem da query string: `src` explícito vence, `utm_source` cobre
// links de campanha que já circulam com UTM.
export function extractRegistrationSource(search: string): string | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search ?? '');
  } catch {
    return null;
  }
  return normalizeRegistrationSource(params.get('src')) ?? normalizeRegistrationSource(params.get('utm_source'));
}

export function registrationSourceLabel(source?: string | null): string {
  const normalized = normalizeRegistrationSource(source);
  if (!normalized) return '';
  return SOURCE_LABELS[normalized] ?? normalized;
}

// First-touch da sessão: uma origem já capturada não é sobrescrita por navegação
// posterior (ex.: chegou pela vitrine, depois clicou num link interno com UTM).
export function captureRegistrationSource(search: string): void {
  const source = extractRegistrationSource(search);
  if (!source) return;
  try {
    if (!sessionStorage.getItem(REGISTRATION_SOURCE_KEY)) {
      sessionStorage.setItem(REGISTRATION_SOURCE_KEY, source);
    }
  } catch {
    /* storage indisponível (Safari private etc.) — segue sem carimbo */
  }
}

export function readStoredRegistrationSource(): string | null {
  try {
    return normalizeRegistrationSource(sessionStorage.getItem(REGISTRATION_SOURCE_KEY));
  } catch {
    return null;
  }
}
