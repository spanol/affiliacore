import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Partículas de nome pt-BR que ficam minúsculas no Title Case ("João da Silva").
const NAME_PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

const titleCaseWord = (w: string) =>
  w
    .split(/(['-])/)
    .map((part) => (part === '-' || part === "'" ? part : part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1)))
    .join('');

const titleCaseName = (s: string) =>
  s
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((w, i) => (i > 0 && NAME_PARTICLES.has(w) ? w : titleCaseWord(w)))
    .join(' ');

// Normaliza nome de afiliado pra exibição. Duas fontes sujas convergem aqui:
//   - API externa: concatenado em PascalCase ("VanesaCristinaHeinenMaciel") →
//     separa em palavras ("Vanesa Cristina Heinen Maciel").
//   - Import/cadastro manual: sem informação de caixa ("JOÃO DA SILVA",
//     "maria souza") → Title Case com partículas minúsculas ("João da Silva").
// Nome misto já com espaço é considerado curado e passa intacto, assim como
// ids (#id / com dígitos), e-mails e valores não alfabéticos.
export function humanizeName(name?: string | null): string {
  if (!name) return '';
  const s = String(name).trim().replace(/\s+/g, ' ');
  if (!s || s.startsWith('#') || s.includes('@')) return s;
  if (!/^[A-Za-zÀ-ÿ' -]+$/.test(s)) return s;
  const hasLower = /[a-zà-ÿ]/.test(s);
  const hasUpper = /[A-ZÀ-Ý]/.test(s);
  if (!hasLower || !hasUpper) return titleCaseName(s);
  if (s.includes(' ')) return s;
  return s
    .replace(/([a-zà-ÿ])([A-ZÀ-Ý])/g, '$1 $2')
    .replace(/([A-ZÀ-Ý]+)([A-ZÀ-Ý][a-zà-ÿ])/g, '$1 $2')
    .trim();
}
