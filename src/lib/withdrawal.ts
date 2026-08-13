// Núcleo PURO de saque (Carteira — convergente Affility+NovaEra). SEM Firebase.
// Sem gateway de pagamento no repo: o admin transfere manualmente (PIX) fora do
// sistema; aqui só rastreamos o ESTADO da solicitação, auditado. Ver
// PLANO-INTEGRACAO-AFFILITY.md — "saldo apurado" NÃO é recalculado/validado aqui
// (isso ficaria pra uma v2 com ledger); o valor solicitado vem do afiliado, o
// admin decide com base no que vê nos dashboards antes de aprovar.

export type WithdrawalStatus = 'requested' | 'approved' | 'paid' | 'rejected';

export const WITHDRAWAL_STATUSES: WithdrawalStatus[] = ['requested', 'approved', 'paid', 'rejected'];

export const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, string> = {
  requested: 'Pendente',
  approved: 'Aprovado',
  paid: 'Pago',
  rejected: 'Rejeitado',
};

export interface WithdrawalRequest {
  id: string;
  affiliateId: string;
  amount: number;
  status: WithdrawalStatus;
  // Casa a que o saque se refere (pedido da Infinity, 2026-08-13): o afiliado
  // solicita os ganhos de UMA casa por vez e o admin vê de qual casa é o pedido.
  // `houseKey` = chave de marca (brandId OTG ou slug da casa manual, a mesma
  // convenção de `brandKeyOf`); `houseLabel` = snapshot do nome de exibição no
  // momento do pedido. Docs antigos não têm os campos (→ null, exibido como "—").
  houseKey?: string | null;
  houseLabel?: string | null;
  note?: string | null;
  requestedAt?: any;
  decidedAt?: any;
}

// Nome de exibição da casa do saque: rótulo se houver, senão a chave crua; null
// quando o pedido é antigo/sem casa (o chamador decide o placeholder).
export function withdrawalHouseName(w: Pick<WithdrawalRequest, 'houseKey' | 'houseLabel'> | null | undefined): string | null {
  const label = String(w?.houseLabel ?? '').trim();
  if (label) return label;
  const key = String(w?.houseKey ?? '').trim();
  return key || null;
}

// Transições válidas. `paid` e `rejected` são terminais — nada volta deles (um
// pagamento feito não "desfaz"; se foi erro, o ajuste é fora do sistema). De
// `approved` ainda dá pra rejeitar (o admin aprovou mas não pagou, achou um
// problema depois). Idempotente: mesmo→mesmo permitido.
export function canTransitionWithdrawal(from: WithdrawalStatus, to: WithdrawalStatus): boolean {
  if (from === to) return true;
  const allowed: Record<WithdrawalStatus, WithdrawalStatus[]> = {
    requested: ['approved', 'rejected'],
    approved: ['paid', 'rejected'],
    paid: [],
    rejected: [],
  };
  return (allowed[from] || []).includes(to);
}

// Valida o valor solicitado: número finito, positivo, arredondado a centavos. Não
// lança — devolve null quando inválido (o chamador decide o erro 400).
export function normalizeWithdrawalAmount(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

// Soma os valores por status — usado pros cards da carteira (pendente/aprovado/
// pago) tanto no client quanto no server. `statuses` filtra; sem filtro, soma tudo.
export function sumWithdrawalsByStatus(requests: WithdrawalRequest[], statuses?: WithdrawalStatus[]): number {
  const set = statuses ? new Set(statuses) : null;
  return (Array.isArray(requests) ? requests : [])
    .filter((r) => !set || set.has(r.status))
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}
