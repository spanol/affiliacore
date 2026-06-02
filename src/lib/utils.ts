import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// A API externa traz nomes de afiliado concatenados em PascalCase
// (ex.: "VanesaCristinaHeinenMaciel"). Separa em palavras pra exibição
// ("Vanesa Cristina Heinen Maciel"). Não mexe em nomes já com espaço,
// ids (#id / com dígitos), e-mails ou valores não alfabéticos.
export function humanizeName(name?: string | null): string {
  if (!name) return '';
  const s = String(name).trim();
  if (!s || s.includes(' ') || s.startsWith('#') || s.includes('@')) return s;
  if (!/^[A-Za-zÀ-ÿ]+$/.test(s)) return s;
  return s
    .replace(/([a-zà-ÿ])([A-ZÀ-Ý])/g, '$1 $2')
    .replace(/([A-ZÀ-Ý]+)([A-ZÀ-Ý][a-zà-ÿ])/g, '$1 $2')
    .trim();
}
