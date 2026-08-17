// Concordância de número na COPY — puro, sem React e sem Firebase (o server.ts
// também importa daqui).
//
// Por que existe: o app estava cheio de "3 afiliado(s)", "1 casa(s) manual(is)".
// O parêntese é um atalho de quem escreve, não de quem lê: obriga o usuário a
// montar a frase de cabeça e ainda entrega "1 casa(s)" quando a casa é uma só.
// Como o número está SEMPRE na mão de quem monta a string, a forma certa é
// escolhida em tempo de execução.
//
// Deliberadamente burro: o plural padrão é `singular + 's'`, e o que fugir disso
// (especial → especiais, nível → níveis, já existia → já existiam) passa a forma
// plural explícita. Tentar derivar plural de português por regra acerta "casas" e
// erra "papéis"; um parâmetro a mais é mais barato que um plural errado na tela.

/** `true` quando a frase deve ir para o singular. Só |n| == 1 é singular em pt-BR (0 é plural: "0 casas"). */
function isSingular(count: unknown): boolean {
  const n = Number(count);
  return Number.isFinite(n) && Math.abs(n) === 1;
}

/**
 * A palavra (ou frase) no número certo, SEM o número junto.
 * Use quando o número já está escrito em outro lugar da frase.
 *
 *   plural(1, 'casa')                    // 'casa'
 *   plural(3, 'casa')                    // 'casas'
 *   plural(3, 'casa manual', 'casas manuais')  // 'casas manuais'
 */
export function plural(count: unknown, one: string, many?: string): string {
  return isSingular(count) ? one : (many ?? `${one}s`);
}

/**
 * O número formatado em pt-BR + a palavra no número certo.
 *
 *   pluralize(1, 'afiliado')             // '1 afiliado'
 *   pluralize(0, 'afiliado')             // '0 afiliados'
 *   pluralize(2400, 'linha')             // '2.400 linhas'
 *
 * Valor não numérico (undefined de uma resposta incompleta) vira 0 em vez de
 * "NaN afiliados" na tela.
 */
export function pluralize(count: unknown, one: string, many?: string): string {
  const n = Number(count);
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe.toLocaleString('pt-BR')} ${plural(safe, one, many)}`;
}
