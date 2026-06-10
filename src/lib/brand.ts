// Helpers de marca (multi-marca). A API externa hoje só retorna Superbet, mas o
// app não assume marca única — estas funções extraem a marca de forma defensiva
// para que filtros/badges funcionem automaticamente quando a OTG liberar outras
// marcas (ex.: SportingBet). O campo `brand` pode vir como objeto {name} ou string.

export const ALL_BRANDS = '__all__';

// Nome da marca de um afiliado, tolerando os vários shapes da API.
export function getBrandName(affiliate: any): string | null {
  if (!affiliate) return null;
  const b = affiliate.brand ?? affiliate.marca ?? affiliate.brand_name;
  if (!b) return null;
  if (typeof b === 'string') return b.trim() || null;
  if (typeof b === 'object') {
    const name = b.name ?? b.nome ?? b.label;
    return typeof name === 'string' ? name.trim() || null : null;
  }
  return null;
}

// Lista ordenada e única das marcas presentes numa coleção de afiliados.
export function uniqueBrands(affiliates: any[]): string[] {
  const set = new Set<string>();
  for (const a of Array.isArray(affiliates) ? affiliates : []) {
    const name = getBrandName(a);
    if (name) set.add(name);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// --- Registro de casas (B6 · logo + casa vazia) ------------------------------
// A API da OTG NÃO expõe logo nem lista casas sem dados — verificado por probe
// direto (2026-06-10): `brand` vem só como {id,name}; v2/v1 `/brands` e `/houses`
// dão 404; `results?groupBy=brand` só traz casas COM produção. As fotos do portal
// `partners.grupootg.com` são assets do front-end deles, fora da API.
// Para seguir o MESMO modelo do portal (casa "acesa e vazia" + logo), mantemos
// um registro PRÓPRIO das casas conhecidas: fonte de verdade de quais casas
// exibir e de onde vem a logo (assets estáticos em /public/brands). Casamos por
// id quando conhecido, senão por nome/slug. [[boost-external-api-state]]
export interface BrandMeta {
  id?: string;   // brandId da OTG quando conhecido (Superbet)
  slug: string;
  name: string;
  logo?: string; // caminho em /public/brands (fallback = avatar de inicial)
}

const normBrandKey = (s?: string | null) => String(s ?? '').trim().toLowerCase();

export const KNOWN_BRANDS: BrandMeta[] = [
  { id: 'clsuperbet000001', slug: 'superbet', name: 'Superbet', logo: '/brands/superbet.svg' },
  // SportingBet: a OTG já LISTA a casa pra agência, mas ela está vazia (0 afiliados)
  // e a nossa x-api-key ainda não traz dados nem o id real — usamos o id do preview
  // (mesmo do mock) até a OTG ampliar o escopo. Trocar pelo id real quando vier.
  { id: 'clsportingbet000001', slug: 'sportingbet', name: 'SportingBet', logo: '/brands/sportingbet.svg' },
];

// Metadados de uma casa por id (preferencial) ou por nome/slug.
export function getBrandMeta(idOrName?: string | null): BrandMeta | null {
  const key = normBrandKey(idOrName);
  if (!key) return null;
  return (
    KNOWN_BRANDS.find((b) => normBrandKey(b.id) === key) ||
    KNOWN_BRANDS.find((b) => normBrandKey(b.name) === key || b.slug === key) ||
    null
  );
}

// Caminho da logo de uma casa (ou null → a UI usa o avatar de inicial).
export function getBrandLogo(idOrName?: string | null): string | null {
  return getBrandMeta(idOrName)?.logo ?? null;
}
