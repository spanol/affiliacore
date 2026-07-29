// TOTP (RFC 6238) + HOTP (RFC 4226) + base32 (RFC 4648) — implementação PRÓPRIA.
//
// Por que não o Firebase Multi-Factor: o TOTP do Firebase Auth exige o projeto
// upgradeado p/ Identity Platform com o fator TOTP habilitado. Numa plataforma
// white-label (cada label = um projeto Firebase novo — ver PRODUTIZACAO.md) isso
// vira um passo manual/pago por instância, e o segredo fica num cofre a que o
// produto não tem acesso. Aqui o 2FA é da AffiliaCore: segredo nosso, verificação
// no nosso servidor, mesma cara em toda label.
//
// ATENÇÃO — este módulo é SERVER-ONLY (usa `node:crypto`). Não importe de página/
// componente: quebraria o bundle do browser. O client fala com /api/auth/totp.
// A decisão de sessão (a sessão já passou pelo 2FA?) é pura e mora em
// `src/lib/mfaSession.ts`, que os DOIS lados importam.
import crypto from 'node:crypto';

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Janelas de ±1 passo (±30s) — cobre relógio do celular fora de sincronia. */
export const TOTP_WINDOW = 1;
/** 20 bytes = 160 bits, o tamanho do bloco do HMAC-SHA1 (recomendação da RFC 4226). */
export const TOTP_SECRET_BYTES = 20;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Tolera minúsculas, espaços, hífens e o padding '=' que alguns apps mostram. */
export function base32Decode(input: string): Buffer {
  const clean = String(input || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/=+$/, '');
  if (!clean) throw new Error('Segredo base32 vazio.');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Segredo base32 inválido.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(bytes: number = TOTP_SECRET_BYTES): string {
  return base32Encode(crypto.randomBytes(bytes));
}

/** HOTP (RFC 4226): código de `digits` dígitos para um contador. */
export function hotp(secretBase32: string, counter: number, digits: number = TOTP_DIGITS): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(counter)));
  const digest = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Passo de tempo (contador TOTP) de um instante. */
export function totpCounter(atMs: number, period: number = TOTP_PERIOD_SECONDS): number {
  return Math.floor(atMs / 1000 / period);
}

export function totpCode(
  secretBase32: string,
  atMs: number,
  opts: { digits?: number; period?: number } = {},
): string {
  return hotp(secretBase32, totpCounter(atMs, opts.period ?? TOTP_PERIOD_SECONDS), opts.digits ?? TOTP_DIGITS);
}

/** Só dígitos — o usuário cola "123 456" o tempo todo. */
export function normalizeTotpCode(code: unknown): string {
  return String(code ?? '').replace(/\D/g, '');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifica um código TOTP e devolve o CONTADOR que casou (ou null).
 *
 * Devolver o contador — em vez de um booleano — é o que permite ao chamador
 * travar o replay: guardando o último contador aceito, o mesmo código não vale
 * duas vezes dentro da mesma janela de 30s.
 */
export function verifyTotp(
  secretBase32: string,
  code: unknown,
  opts: { atMs: number; digits?: number; period?: number; window?: number } = { atMs: 0 },
): number | null {
  const digits = opts.digits ?? TOTP_DIGITS;
  const period = opts.period ?? TOTP_PERIOD_SECONDS;
  const window = opts.window ?? TOTP_WINDOW;
  const normalized = normalizeTotpCode(code);
  if (normalized.length !== digits) return null;

  const current = totpCounter(opts.atMs, period);
  let matched: number | null = null;
  // Sem early-return: percorre a janela inteira sempre, p/ o tempo de resposta
  // não denunciar QUAL passo casou.
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = current + offset;
    if (counter < 0) continue;
    let candidate: string;
    try {
      candidate = hotp(secretBase32, counter, digits);
    } catch {
      return null; // segredo inválido
    }
    if (timingSafeEqualStr(candidate, normalized) && matched === null) matched = counter;
  }
  return matched;
}

/** URL `otpauth://` que o Google Authenticator / Authy / 1Password leem no QR. */
export function buildOtpauthUrl(args: {
  secret: string;
  account: string;
  issuer: string;
  digits?: number;
  period?: number;
}): string {
  const issuer = String(args.issuer || 'AffiliaCore').trim();
  const account = String(args.account || 'conta').trim();
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: args.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(args.digits ?? TOTP_DIGITS),
    period: String(args.period ?? TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// --- Códigos de backup -------------------------------------------------------
// Salvam quem perdeu o celular. São de uso ÚNICO e guardados só como hash — nem o
// admin nem um vazamento do Firestore recuperam o código em claro.

export const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_CHARS = 10; // 10 chars de base32 = 50 bits de entropia

export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let raw = '';
    // rejection sampling p/ não enviesar o alfabeto (256 % 32 == 0, então o
    // módulo já é uniforme, mas mantemos o randomInt do node por clareza)
    for (let c = 0; c < BACKUP_CODE_CHARS; c += 1) raw += B32_ALPHABET[crypto.randomInt(0, B32_ALPHABET.length)];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

export function normalizeBackupCode(code: unknown): string {
  return String(code ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '');
}

export function hashBackupCode(code: unknown): string {
  return crypto.createHash('sha256').update(normalizeBackupCode(code)).digest('hex');
}

/**
 * Consome um código de backup: devolve a lista SEM o hash usado, ou null se não
 * bateu. Comparação em tempo constante contra cada hash guardado.
 */
export function consumeBackupCode(hashes: string[], code: unknown): string[] | null {
  const normalized = normalizeBackupCode(code);
  if (normalized.length !== BACKUP_CODE_CHARS) return null;
  const target = hashBackupCode(normalized);
  let hit = -1;
  for (let i = 0; i < hashes.length; i += 1) {
    if (timingSafeEqualStr(String(hashes[i] ?? ''), target) && hit === -1) hit = i;
  }
  if (hit === -1) return null;
  return hashes.filter((_, i) => i !== hit);
}
