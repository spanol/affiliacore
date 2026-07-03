// Marca da instância no BUNDLE (Vite embute import.meta.env no build). Módulo
// separado do puro `branding.ts` para o server.ts (tsx, sem Vite) nunca tocar
// import.meta.env — mesmo padrão de instance.ts/instanceClient.ts (P2).
import { resolveBrand } from './branding';

const env = (import.meta as any).env ?? {};
export const BRAND = resolveBrand(env, typeof env.BASE_URL === 'string' ? env.BASE_URL : '/');

// Aplica a marca no documento (título + favicon). Chamado uma vez no boot do App —
// o index.html é compartilhado entre instâncias, então a marca entra em runtime.
export function applyBrandToDocument(): void {
  if (typeof document === 'undefined') return;
  document.title = BRAND.name;
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')
    .forEach((link) => { link.href = BRAND.faviconUrl; });
}
