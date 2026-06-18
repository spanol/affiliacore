# Logos das casas (B6)

A API da OTG **não fornece logo** das casas (verificado por probe direto em
2026-06-10: `brand` vem só como `{id, name}`; `/brands` e `/houses` dão 404). As
fotos do portal `partners.grupootg.com` são assets do front-end deles — ficam num
bucket público do Supabase (`betting-house-logos`, arquivo = `<brandId>-<ts>.png`).
Baixamos as oficiais e hospedamos aqui (`superbet.png`, `sportingbet.png`).

## Backoffice de casas (atual) — `/casas`

O registro de casas **deixou de ser hardcoded**. A fonte de verdade agora é a
coleção Firestore `houses`, gerida pelo admin na tela **/casas** (sidebar →
"Casas"): criar/editar nome, slug, `brandId`, **upload da logo** (vai pro
Storage, `house-logos/<slug>-<ts>`) e a URL de cadastro. Adicionar uma casa nova
**não exige mais deploy nem mexer em código** — basta a tela.

O array `DEFAULT_BRANDS` em `src/lib/brand.ts` é só a **semente** (Superbet +
SportingBet, com as logos oficiais abaixo): usado como fallback quando o backend
ainda não carregou e como auto-seed na 1ª vez que a coleção está vazia. Em
runtime, `setKnownBrands` (no boot do `DashboardLayout`) substitui o registro
vivo pelas casas do backend.

## Logos das sementes hospedadas aqui

Os arquivos desta pasta (`superbet.png`, `sportingbet.png`) são as **logos
oficiais** das casas-semente. Casas criadas pelo backoffice guardam a logo no
**Storage** (URL no doc da casa), não aqui. Se uma logo faltar/404, a UI cai no
avatar de inicial automaticamente (`BrandLogo` / `HouseLogo` têm fallback).
