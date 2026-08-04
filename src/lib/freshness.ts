// "Atualizado há X" — a idade do dado que o afiliado vê por casa.
//
// Existe porque o dado de casa NÃO é ao vivo: cliques são nossos e contam na
// hora, mas cadastro/FTD/CPA vêm de um pull (ou de um upload) e a casa fecha o
// dia com atraso. Sem carimbo, o afiliado lê o painel como tempo real e cobra o
// que ele não é. Puro e testável — a formatação é a mesma no painel e no admin.

export interface FreshnessInfo {
  label: string; // "agora há pouco", "há 12 min", "há 3 h", "ontem", "há 4 dias"
  minutes: number | null; // null = nunca sincronizado
  stale: boolean; // passou do limite esperado → a UI destaca
}

export const DEFAULT_STALE_MINUTES = 180; // 3× a janela horária pedida pela Infinity

/** Aceita Date, epoch ms, ISO string ou Timestamp do Firestore ({seconds}). */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const anyVal = value as any;
  if (typeof anyVal?.toDate === 'function') {
    try {
      const d = anyVal.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof anyVal?.seconds === 'number') return new Date(anyVal.seconds * 1000);
  if (typeof anyVal?._seconds === 'number') return new Date(anyVal._seconds * 1000);
  return null;
}

export function describeFreshness(
  value: unknown,
  now: Date = new Date(),
  staleMinutes: number = DEFAULT_STALE_MINUTES,
): FreshnessInfo {
  const date = toDate(value);
  if (!date) return { label: 'sem atualização ainda', minutes: null, stale: true };

  const diffMs = now.getTime() - date.getTime();
  // Relógio adiantado do servidor não pode virar "há -3 min": trata como agora.
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  const stale = minutes > staleMinutes;

  if (minutes < 2) return { label: 'agora há pouco', minutes, stale };
  if (minutes < 60) return { label: `há ${minutes} min`, minutes, stale };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `há ${hours} h`, minutes, stale };

  const days = Math.floor(hours / 24);
  if (days === 1) return { label: 'ontem', minutes, stale };
  return { label: `há ${days} dias`, minutes, stale };
}
