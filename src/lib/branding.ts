// P3 (produtização): marca configurável por instância — nome, logo e favicon.
// Mesmo padrão dual do P2 (VITE_* vale no bundle do cliente E no servidor):
//   VITE_BRAND_NAME    — nome completo (título, badge, ex.: "Agência Boost")
//   VITE_BRAND_SHORT   — nome curto usado no meio de frase (ex.: "Boost").
//                        CONVENÇÃO pt-BR: o texto trata a marca no feminino
//                        ("a {short} calcula...") — escolha um nome que caiba.
//   VITE_BRAND_LOGO_URL / VITE_BRAND_FAVICON_URL — URLs (Storage da instância,
//                        CDN ou caminho em /public).
// P4.1 (inversão, 2026-07-05): ausência de TODAS → marca do PRODUTO,
// **AffiliaCore** (domínio affiliacore.com.br — com DOIS "f" — registrado pelo
// Vinicius). O repo é o produto; a instância Boost do Carlos fica pinada por env
// (apphosting.yaml base + apphosting.boost.yaml). Não reintroduza "Boost" como
// default aqui.
// Puro e sem import.meta (o server importa daqui); o client usa brandingClient.ts.

export interface Brand {
  name: string;
  shortName: string;
  logoUrl: string;
  faviconUrl: string;
}

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : null;
};

export function resolveBrand(env?: Record<string, unknown> | null, baseUrl = '/'): Brand {
  const e = env ?? {};
  const base = typeof baseUrl === 'string' && baseUrl.length > 0 ? baseUrl : '/';
  return {
    name: str(e.VITE_BRAND_NAME) ?? 'AffiliaCore',
    shortName: str(e.VITE_BRAND_SHORT) ?? 'AffiliaCore',
    logoUrl: str(e.VITE_BRAND_LOGO_URL) ?? `${base}affiliacore/logo.svg`,
    faviconUrl: str(e.VITE_BRAND_FAVICON_URL) ?? `${base}affiliacore/favicon.svg`,
  };
}
