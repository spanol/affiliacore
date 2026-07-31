import { BRAND } from '../lib/brandingClient';

// Nome da INSTÂNCIA como TEXTO. É o único jeito certo de escrever a marca no
// meio de uma frase — mesmo papel do <InstanceLogo/> para a logo.
//
// Existe por um motivo só: `translate="no"`. Nome de marca não é palavra, e o
// tradutor automático do navegador traduz de qualquer jeito — a Infinity virou
// "infinidade" pro cliente em 2026-07-31. O `lang="pt-BR"` do index.html evita
// que o Chrome OFEREÇA traduzir; este atributo protege a marca de quem traduz a
// página mesmo assim (ou lê em outro idioma).
//
// Não escreva {BRAND.name}/{BRAND.shortName} solto num JSX: o texto volta a ser
// traduzível e o call-site novo passa despercebido.
interface BrandNameProps {
  // Nome COMPLETO (VITE_BRAND_NAME, ex. badge/título). Default = o curto
  // (VITE_BRAND_SHORT), que é o que cabe no meio de frase — ver branding.ts.
  full?: boolean;
  className?: string;
}

export default function BrandName({ full = false, className }: BrandNameProps) {
  return (
    <span translate="no" className={className}>
      {full ? BRAND.name : BRAND.shortName}
    </span>
  );
}
