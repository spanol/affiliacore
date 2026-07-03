// P3 (produtização): marca configurável por instância — nome, logo e favicon.
// Mesmo padrão dual do P2 (VITE_* vale no bundle do cliente E no servidor):
//   VITE_BRAND_NAME    — nome completo (título, badge, ex.: "Agência Boost")
//   VITE_BRAND_SHORT   — nome curto usado no meio de frase (ex.: "Boost").
//                        CONVENÇÃO pt-BR: o texto trata a marca no feminino
//                        ("a {short} calcula...") — escolha um nome que caiba.
//   VITE_BRAND_LOGO_URL / VITE_BRAND_FAVICON_URL — URLs (Storage da instância,
//                        CDN ou caminho em /public). Default = assets do Boost.
// Ausência de TODAS → marca Boost atual (a instância do Carlos não muda nada).
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
    name: str(e.VITE_BRAND_NAME) ?? 'Agência Boost',
    shortName: str(e.VITE_BRAND_SHORT) ?? 'Boost',
    logoUrl: str(e.VITE_BRAND_LOGO_URL) ?? `${base}boost-home/logo.svg`,
    faviconUrl: str(e.VITE_BRAND_FAVICON_URL) ?? `${base}boost-home/favicon.svg`,
  };
}
