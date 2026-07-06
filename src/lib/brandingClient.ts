// Marca da instância no BUNDLE (Vite embute import.meta.env no build). Módulo
// separado do puro `branding.ts` para o server.ts (tsx, sem Vite) nunca tocar
// import.meta.env — mesmo padrão de instance.ts/instanceClient.ts (P2).
import { resolveBrand } from './branding';
import { resolveDefaultTheme, resolveThemeTokens } from './theming';

const env = (import.meta as any).env ?? {};
export const BRAND = resolveBrand(env, typeof env.BASE_URL === 'string' ? env.BASE_URL : '/');
export const THEME = resolveThemeTokens(env);
// P3.3: tema inicial da instância (null = segue a preferência do SO). Consumido
// pelo ThemeContext p/ quem ainda não tem preferência salva no localStorage.
export const BRAND_DEFAULT_THEME = resolveDefaultTheme(env.VITE_BRAND_THEME);

// Aplica a marca no documento (título + favicon + tema P3.1). Chamado uma vez no
// boot do App — o index.html e o CSS são os MESMOS p/ todas as instâncias, então
// marca e tema entram em runtime (as vars sobrescrevem os defaults do @theme).
export function applyBrandToDocument(): void {
  if (typeof document === 'undefined') return;
  document.title = BRAND.name;
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')
    .forEach((link) => { link.href = BRAND.faviconUrl; });
  const root = document.documentElement;
  for (const [name, value] of Object.entries(THEME.cssVars)) {
    root.style.setProperty(name, value);
  }
}
