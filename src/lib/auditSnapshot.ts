// Núcleo PURO do SNAPSHOT de auditoria (sem Firebase/React): transforma o documento
// que está prestes a ser APAGADO num objeto seguro de gravar em
// `audit_logs.metadata.snapshot`. Com ele, desfazer uma exclusão é reler o log.
//
// POR QUE existe: até 24/08/2026 o `DELETE /api/houses/:id` lia o doc só para
// guardar o NOME e apagava o resto. Quem apagasse a casa errada perdia o
// `integrationExternalId`, o `defaultCpa`, o `registerUrlTemplate`, a moeda, o ISS e
// o redepósito mínimo sem nenhuma cópia (foi o que aconteceu com a Betnacional da
// Infinity, e o offer id só voltou porque o operador abriu o painel da Fomento).
//
// Duas coisas que `JSON.stringify` cru não resolve sozinho:
//
//  1. TIMESTAMP do Firestore não é um valor serializável: chega ora como objeto com
//     `toDate()`, ora como `{_seconds,_nanoseconds}`. Aqui vira ISO string, o mesmo
//     formato que o `serializeTimestamp` do server já devolve para o cliente.
//
//  2. TAMANHO. O `logo` da casa é um data URL de até ~200KB (as instâncias não usam
//     Storage, o base64 mora no próprio doc) e um documento do Firestore não passa de
//     1MB. Gravar o base64 inteiro faria a escrita do LOG falhar, ou seja: perderíamos
//     o snapshot todo por causa do campo menos importante de restaurar. Por isso campo
//     grande vira MARCADOR (tamanho + prefixo, que já identifica o mime do data URL) e
//     todo o resto vai inteiro.

/** Marcador que substitui um campo grande demais para caber no log. */
export interface TruncatedField {
  truncated: true;
  /** Tamanho do valor original, em caracteres da forma serializada. */
  chars: number;
  /** Começo do valor original, o bastante para reconhecer o que era. */
  preview: string;
}

export interface AuditSnapshotOptions {
  /** Limite por campo. Acima disso o valor vira `TruncatedField`. */
  maxFieldChars?: number;
  /** Limite do snapshot inteiro. Acima disso os maiores campos viram marcador. */
  maxTotalChars?: number;
}

/** Um `logo` de casa passa disto; um texto de documento legal, quase nunca. */
export const MAX_FIELD_CHARS = 60_000;
/** Folga larga contra o teto de 1MB do doc de auditoria, mesmo com acento em tudo. */
export const MAX_TOTAL_CHARS = 200_000;
/** Prefixo guardado no marcador. 64 caracteres já mostram o `data:image/png;base64,`. */
const PREVIEW_CHARS = 64;
/** Corta recursão patológica. Doc de Firestore não chega perto disso. */
const MAX_DEPTH = 12;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const marker = (text: string): TruncatedField => ({
  truncated: true,
  chars: text.length,
  preview: text.slice(0, PREVIEW_CHARS),
});

// Timestamp do Firestore em qualquer uma das formas que o Admin SDK entrega.
// Devolve `undefined` quando o valor NÃO é uma data (aí quem chama segue o caminho
// normal) e `null` quando é data mas não dá para ler. A distinção importa: um Date
// inválido tratado como objeto comum viraria `{}` na recursão, porque Date não tem
// campos próprios.
function toIsoDate(value: any): string | null | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    } catch {
      return null;
    }
  }
  const seconds = value?._seconds ?? value?.seconds;
  const nanos = value?._nanoseconds ?? value?.nanoseconds;
  if (typeof seconds === 'number' && typeof nanos === 'number') {
    const ms = seconds * 1000 + Math.floor(nanos / 1e6);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  return undefined;
}

function normalize(value: unknown, maxFieldChars: number, seen: WeakSet<object>, depth: number): unknown {
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === 'string') {
    const s = value as string;
    return s.length > maxFieldChars ? marker(s) : s;
  }
  // NaN/Infinity o Firestore recusa; viram null em vez de derrubar a gravação.
  if (t === 'number') return Number.isFinite(value as number) ? value : null;
  if (t === 'boolean') return value;
  if (t !== 'object') return null; // function/symbol/bigint não existem em doc lido

  const iso = toIsoDate(value);
  if (iso !== undefined) return iso;

  if (seen.has(value as object)) return null; // referência cíclica
  if (depth >= MAX_DEPTH) return null;
  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalize(item, maxFieldChars, seen, depth + 1));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'function' || v === undefined) continue;
      out[k] = normalize(v, maxFieldChars, seen, depth + 1);
    }
    return out;
  } finally {
    seen.delete(value as object);
  }
}

const serializedLength = (value: unknown): number => {
  try {
    return JSON.stringify(value ?? null)?.length ?? 0;
  } catch {
    return 0;
  }
};

/**
 * Documento do Firestore → objeto pronto para `audit_logs.metadata.snapshot`.
 *
 * Devolve `null` quando não há nada a guardar (doc ausente, vazio ou não-objeto),
 * para que a rota simplesmente não grave a chave `snapshot`.
 */
export function buildAuditSnapshot(
  data: unknown,
  options: AuditSnapshotOptions = {},
): Record<string, unknown> | null {
  if (!isPlainObject(data)) return null;
  const maxFieldChars = options.maxFieldChars ?? MAX_FIELD_CHARS;
  const maxTotalChars = options.maxTotalChars ?? MAX_TOTAL_CHARS;

  const normalized = normalize(data, maxFieldChars, new WeakSet(), 0);
  if (!isPlainObject(normalized) || Object.keys(normalized).length === 0) return null;

  // Segundo passe: mesmo com todo campo dentro do limite, MUITOS campos médios
  // ainda estouram o doc. Vai caindo o maior até caber, do menos ao mais provável
  // de importar na restauração.
  const out: Record<string, unknown> = { ...normalized };
  if (serializedLength(out) > maxTotalChars) {
    const bySize = Object.keys(out)
      .map((k) => ({ key: k, size: serializedLength(out[k]) }))
      .sort((a, b) => b.size - a.size);
    for (const { key } of bySize) {
      if (serializedLength(out) <= maxTotalChars) break;
      const raw = out[key];
      out[key] = typeof raw === 'string' ? marker(raw) : marker(JSON.stringify(raw ?? null) ?? '');
    }
  }
  return out;
}
