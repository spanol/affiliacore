// Backoffice de casas (betting houses). Fonte de verdade = coleção Firestore
// `houses`, gerida pelo admin via /casas. Substitui o antigo array hardcoded
// KNOWN_BRANDS: o registro vira gerenciável (criar/editar/logo) sem deploy.
// Tudo passa pelo servidor (Admin SDK); o cliente nunca toca `houses` direto.
import { authFetch } from '../lib/api';
import { BrandMeta, setKnownBrands } from '../lib/brand';

export interface House {
  id: string;        // doc id (= slug)
  slug: string;
  name: string;
  brandId?: string | null;         // brandId da OTG quando conhecido
  logo?: string | null;            // URL no Storage (ou /brands/* das sementes)
  registerUrlTemplate?: string | null; // URL base de cadastro com {ref} (Fase 2 · links)
  active: boolean;
  order?: number;
}

// Campos editáveis no backoffice. `logoBase64` (data URL) sobe a logo nova; se
// ausente, a logo atual é preservada.
export interface HouseInput {
  name: string;
  slug?: string;
  brandId?: string | null;
  registerUrlTemplate?: string | null;
  active?: boolean;
  order?: number;
  logoBase64?: string | null;
}

// Mapeia uma House (backend) para o BrandMeta usado pelos helpers de marca.
export function houseToBrandMeta(h: House): BrandMeta {
  return {
    id: h.brandId ?? undefined,
    slug: h.slug,
    name: h.name,
    logo: h.logo ?? undefined,
    registerUrlTemplate: h.registerUrlTemplate ?? null,
    active: h.active,
    order: h.order,
  };
}

// Atualiza o registro vivo de marcas (cache em brand.ts) com as casas do backend,
// para que toda a UI (logos, filtros, breakdown por casa) reflita o backoffice.
export function syncKnownBrandsFrom(houses: House[]): void {
  const ordered = [...houses].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'pt-BR')
  );
  setKnownBrands(ordered.map(houseToBrandMeta));
}

async function parseError(response: Response): Promise<never> {
  const e = await response.json().catch(() => ({}));
  throw new Error((e as any).error || (e as any).message || `Erro na API: ${response.status}`);
}

// Lista as casas (admin → gestão; afiliado → leitura p/ logos/filtros).
export async function fetchHouses(): Promise<House[]> {
  const response = await authFetch('/api/houses', { headers: { Accept: 'application/json' } });
  if (!response.ok) return [];
  const data = await response.json().catch(() => ({}));
  return Array.isArray((data as any)?.houses) ? (data as any).houses : [];
}

// Cria uma casa (admin). Retorna a casa criada.
export async function createHouse(input: HouseInput): Promise<House> {
  const response = await authFetch('/api/houses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

// Atualiza uma casa por id (admin). Aceita patch parcial.
export async function updateHouse(id: string, patch: Partial<HouseInput>): Promise<House> {
  const response = await authFetch(`/api/houses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

// Remove uma casa por id (admin).
export async function deleteHouse(id: string): Promise<void> {
  const response = await authFetch(`/api/houses/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) await parseError(response);
}
