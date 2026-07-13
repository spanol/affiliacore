// Premiações por posição do ranking — chamariz de captação configurável pelo
// admin da instância white-label ("1º lugar do mês ganha um iPhone"). Núcleo
// PURO (sem Firebase): o saneamento é compartilhado entre as rotas /api/prizes
// do servidor e o form do admin — o server só pode importar de src/lib (mesma
// regra de commission.ts).

export interface RankingPrizeInput {
  position: number; // 1..PRIZE_MAX_POSITION (1º, 2º, 3º...)
  title: string; // o prêmio em si ("R$ 5.000", "iPhone 16 Pro")
  description?: string; // regra/vigência em texto livre ("Top 1 de julho")
  active?: boolean; // desligado = some da Home pública e do pódio
}

export interface RankingPrize extends RankingPrizeInput {
  id: string;
  active: boolean;
}

export const PRIZE_MAX_POSITION = 100;
export const PRIZE_TITLE_MAX = 120;
export const PRIZE_DESCRIPTION_MAX = 300;

export type SanitizedPrize = { position: number; title: string; description: string; active: boolean };

// Shape de resultado com campos opcionais (não discriminated union): o tsconfig
// do repo NÃO liga `strict`, e sem strictNullChecks o narrowing de `!r.ok` não
// exclui o braço `ok: true` — union aqui geraria erro de tipo nos call-sites.
export interface PrizeSanitizeResult {
  ok: boolean;
  value?: SanitizedPrize;
  error?: string;
}

const POSITION_ERROR = `Posição inválida — use um número inteiro entre 1 e ${PRIZE_MAX_POSITION}.`;
const TITLE_ERROR = 'Informe o prêmio (título).';

// Aceita number ou string numérica (input do form chega como string). String
// vazia/espaços NÃO vira 0 válido; decimal/fora da faixa é rejeitado.
function parsePosition(raw: unknown): number | null {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw)
        : NaN;
  if (!Number.isInteger(n) || n < 1 || n > PRIZE_MAX_POSITION) return null;
  return n;
}

export function sanitizePrize(body: unknown): PrizeSanitizeResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const position = parsePosition(b.position);
  if (position == null) return { ok: false, error: POSITION_ERROR };
  const title = String(b.title ?? '').trim().slice(0, PRIZE_TITLE_MAX);
  if (!title) return { ok: false, error: TITLE_ERROR };
  const description = String(b.description ?? '').trim().slice(0, PRIZE_DESCRIPTION_MAX);
  const active = b.active === undefined ? true : !!b.active;
  return { ok: true, value: { position, title, description, active } };
}

export interface PrizePatchResult {
  ok: boolean;
  patch?: Partial<SanitizedPrize>;
  error?: string;
}

// PATCH parcial: só saneia os campos PRESENTES. Campo presente e inválido
// derruba o patch inteiro (400) — não grava metade.
export function sanitizePrizePatch(body: unknown): PrizePatchResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Partial<SanitizedPrize> = {};
  if (b.position !== undefined) {
    const position = parsePosition(b.position);
    if (position == null) return { ok: false, error: POSITION_ERROR };
    patch.position = position;
  }
  if (b.title !== undefined) {
    const title = String(b.title ?? '').trim().slice(0, PRIZE_TITLE_MAX);
    if (!title) return { ok: false, error: TITLE_ERROR };
    patch.title = title;
  }
  if (b.description !== undefined) {
    patch.description = String(b.description ?? '').trim().slice(0, PRIZE_DESCRIPTION_MAX);
  }
  if (b.active !== undefined) patch.active = !!b.active;
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nada para atualizar.' };
  return { ok: true, patch };
}

// Ordena por posição (1º primeiro); empate preserva a ordem de chegada.
export function sortPrizes<T extends { position: number }>(prizes: T[]): T[] {
  return [...prizes].sort((a, b) => a.position - b.position);
}

export function activePrizes<T extends { active: boolean }>(prizes: T[]): T[] {
  return prizes.filter((p) => p.active);
}

// Prêmio ATIVO de uma posição (pill do pódio/lista). Posição duplicada: vence a
// primeira na ordenação — a duplicata aparece na gestão e o admin resolve lá.
export function prizeForPosition<T extends { position: number; active: boolean }>(
  prizes: T[],
  position: number,
): T | undefined {
  return sortPrizes(activePrizes(prizes)).find((p) => p.position === position);
}

// Rótulo ordinal pt-BR usado em pills e na Home pública ("1º lugar").
export function positionLabel(position: number): string {
  return `${position}º lugar`;
}
