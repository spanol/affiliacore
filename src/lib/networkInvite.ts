// Link de cadastro na REDE do afiliado especial (pedido do Maurício, 15/08/2026).
//
// POR QUE EXISTE: a indicação do gerente (`affiliate_referrals`, call 12/08 · item 5)
// abre uma FILA — o master confirma, cria o afiliado e vincula. O gerente pediu o
// caminho sem fila: um link que ele compartilha e que já cria o afiliado dentro da
// equipe dele. Cunhar o link da CASA continua sendo do master; o que este link faz
// é criar a CONTA e a aresta de rede, nada de dinheiro (o indicado nasce sem taxa
// configurada, e é o gerente quem define depois em "Meus afiliados").
//
// DESENHO: reusa a coleção `invites` (server-only, sem rule → o cliente nunca lê)
// com `kind: 'network'`. Diferenças para o convite pessoal:
//   · REUTILIZÁVEL   — não vira `status: 'used'` no primeiro aceite (é um link de
//                      captação, não uma credencial de uma pessoa só);
//   · SEM VALIDADE   — não expira em 7 dias; o gerente encerra rotacionando;
//   · SEM afiliado   — guarda `ownerAffiliateId` (quem recruta) em vez de
//                      `affiliateId`. Nomes DIFERENTES de propósito: se algum
//                      caminho antigo tratasse este doc como convite pessoal, ele
//                      falharia em vez de criar um segundo login no MESMO afiliado.
//
// Núcleo puro (sem Firebase): server.ts e as telas importam daqui.

export const NETWORK_INVITE_KIND = 'network';

export interface NetworkInviteDoc {
  kind?: string | null;
  ownerAffiliateId?: string | null;
  ownerName?: string | null;
  /** 'active' | 'revoked'. Ausente conta como ativo (doc antigo nunca revogado). */
  status?: string | null;
  uses?: number | null;
}

export function isNetworkInvite(doc: NetworkInviteDoc | null | undefined): boolean {
  return String(doc?.kind ?? '').trim() === NETWORK_INVITE_KIND;
}

export function isNetworkInviteActive(doc: NetworkInviteDoc | null | undefined): boolean {
  if (!isNetworkInvite(doc)) return false;
  return String(doc?.status ?? '').trim().toLowerCase() !== 'revoked';
}

/**
 * Mensagem para quem abriu um link que não serve mais, ou null quando serve.
 * Fica aqui (e não na rota) para a tela e o servidor dizerem a MESMA coisa.
 */
export function networkInviteBlock(doc: NetworkInviteDoc | null | undefined): string | null {
  if (!isNetworkInvite(doc)) return 'Convite não encontrado.';
  if (!isNetworkInviteActive(doc)) {
    return 'Este link de cadastro foi desativado. Peça um link novo a quem te convidou.';
  }
  return null;
}

/** Nome digitado pelo indicado: sem espaço duplicado e com teto (vai pro mirror). */
export function sanitizeRecruitName(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Erro de validação do nome (pt-BR), ou null quando está bom. */
export function recruitNameError(raw: unknown): string | null {
  const name = sanitizeRecruitName(raw);
  if (name.length < 2) return 'Informe seu nome completo.';
  return null;
}

/** Caminho público do link. Rota própria (≠ /convite) porque é um convite ABERTO. */
export function networkInvitePath(code: string): string {
  return `/cadastro/${encodeURIComponent(String(code ?? '').trim())}`;
}

/** URL compartilhável. `origin` explícito no servidor; no browser cai no location. */
export function buildNetworkInviteUrl(code: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${String(base ?? '').replace(/\/+$/, '')}${networkInvitePath(code)}`;
}
