import { BRAND } from '../lib/brandingClient';
import { cn } from '../lib/utils';

// Logo da INSTÂNCIA (marca do app — não confundir com BrandLogo, que é a logo
// da CASA de aposta), ciente de TEMA. É o único jeito certo de renderizar a
// marca no chrome do app; não use <img src={BRAND.logoUrl}> direto — era o
// padrão antigo e cada call-site repetia o filtro na mão.
//
// Dois modos, decididos pelo PAR logoLightUrl/logoDarkUrl do branding:
// - Par COMPLETO (ex.: Infinity — logo colorida, pedido 2026-07-29): renderiza
//   as duas <img> e o CSS escolhe (`dark:hidden` / `hidden dark:block`, o mesmo
//   mecanismo de tema do resto do app), SEM `invert` — filtro sobre logo
//   colorida faz o roxo virar verde.
// - Sem par (default do produto e das demais labels): comportamento clássico,
//   logoUrl MONO BRANCA + `invert dark:invert-0` (preta no claro, branca no
//   escuro).
// Par INCOMPLETO conta como "sem par" — melhor mono consistente que um tema
// com a logo errada.
interface InstanceLogoProps {
  className?: string;
  alt?: string;
}

export default function InstanceLogo({ className, alt = BRAND.shortName }: InstanceLogoProps) {
  // translate="no": o `alt` default é o nome da marca, e o tradutor do navegador
  // traduz atributo também — leitor de tela ouviria "infinidade". Mesma razão do
  // <BrandName/>.
  if (BRAND.logoLightUrl && BRAND.logoDarkUrl) {
    return (
      <>
        <img src={BRAND.logoLightUrl} alt={alt} translate="no" className={cn('dark:hidden', className)} />
        <img src={BRAND.logoDarkUrl} alt="" aria-hidden="true" className={cn('hidden dark:block', className)} />
      </>
    );
  }
  return <img src={BRAND.logoUrl} alt={alt} translate="no" className={cn('invert dark:invert-0', className)} />;
}
