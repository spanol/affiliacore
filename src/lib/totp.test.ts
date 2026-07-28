import { describe, it, expect } from 'vitest';
import {
  BACKUP_CODE_COUNT,
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  normalizeTotpCode,
  totpCode,
  totpCounter,
  verifyTotp,
} from './totp';

// Semente da RFC 6238 Appendix B (ASCII "12345678901234567890", 20 bytes).
const RFC_SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));

describe('base32 (RFC 4648)', () => {
  // Vetores oficiais da RFC 4648 §10 — sem o padding '=', que não emitimos.
  const vectors: Array<[string, string]> = [
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];

  it.each(vectors)('codifica %s -> %s', (plain, encoded) => {
    expect(base32Encode(new TextEncoder().encode(plain))).toBe(encoded);
  });

  it.each(vectors)('decodifica de volta %s', (plain, encoded) => {
    expect(base32Decode(encoded).toString('utf8')).toBe(plain);
  });

  it('tolera minúscula, espaço, hífen e padding (o que os apps mostram)', () => {
    expect(base32Decode('mzxw 6ytb-oi======').toString('utf8')).toBe('foobar');
  });

  it('rejeita caractere fora do alfabeto', () => {
    expect(() => base32Decode('MZXW6YTB01')).toThrow();
  });

  it('a semente da RFC 6238 bate com o base32 conhecido', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });
});

describe('TOTP (RFC 6238)', () => {
  // Appendix B: modo SHA-1, 8 dígitos, T0=0, passo de 30s.
  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  it.each(vectors)('t=%i segundos -> %s', (seconds, expected) => {
    expect(totpCode(RFC_SECRET, seconds * 1000, { digits: 8 })).toBe(expected);
  });

  it('o contador é o instante dividido pelo passo de 30s', () => {
    expect(totpCounter(59_000)).toBe(1);
    expect(totpCounter(1111111109_000)).toBe(37037036);
  });

  it('gera 6 dígitos por padrão', () => {
    expect(totpCode(RFC_SECRET, 59_000)).toMatch(/^\d{6}$/);
  });
});

describe('verifyTotp', () => {
  const now = 1_700_000_000_000;

  it('aceita o código do passo atual e devolve o contador que casou', () => {
    const code = totpCode(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, code, { atMs: now })).toBe(totpCounter(now));
  });

  it('aceita ±1 passo (celular com relógio fora de sincronia)', () => {
    const anterior = totpCode(RFC_SECRET, now - 30_000);
    const seguinte = totpCode(RFC_SECRET, now + 30_000);
    expect(verifyTotp(RFC_SECRET, anterior, { atMs: now })).toBe(totpCounter(now) - 1);
    expect(verifyTotp(RFC_SECRET, seguinte, { atMs: now })).toBe(totpCounter(now) + 1);
  });

  it('recusa fora da janela (±2 passos)', () => {
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 60_000), { atMs: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 60_000), { atMs: now })).toBeNull();
  });

  it('recusa código errado, vazio, curto e não-numérico', () => {
    expect(verifyTotp(RFC_SECRET, '000000', { atMs: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, '', { atMs: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, '123', { atMs: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', { atMs: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, null, { atMs: now })).toBeNull();
  });

  it('recusa em vez de estourar quando o segredo é inválido', () => {
    expect(verifyTotp('não-é-base32!', '123456', { atMs: now })).toBeNull();
  });

  it('normaliza a digitação com espaços', () => {
    const code = totpCode(RFC_SECRET, now);
    const espacado = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(normalizeTotpCode(espacado)).toBe(code);
    expect(verifyTotp(RFC_SECRET, espacado, { atMs: now })).toBe(totpCounter(now));
  });

  it('o contador devolvido é o que permite travar o replay', () => {
    const code = totpCode(RFC_SECRET, now);
    const primeiro = verifyTotp(RFC_SECRET, code, { atMs: now });
    const segundo = verifyTotp(RFC_SECRET, code, { atMs: now + 5_000 });
    // Mesmo passo de 30s → mesmo contador; o chamador guarda e rejeita o repetido.
    expect(segundo).toBe(primeiro);
  });
});

describe('generateTotpSecret', () => {
  it('gera 160 bits em base32 decodificável e diferente a cada chamada', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).not.toBe(b);
  });
});

describe('buildOtpauthUrl', () => {
  it('monta a URL que o autenticador lê no QR', () => {
    const url = buildOtpauthUrl({ secret: 'ABC234', account: 'ana@empresa.com', issuer: 'AffiliaCore' });
    expect(url.startsWith('otpauth://totp/AffiliaCore%3Aana%40empresa.com?')).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('secret')).toBe('ABC234');
    expect(params.get('issuer')).toBe('AffiliaCore');
    expect(params.get('algorithm')).toBe('SHA1');
    expect(params.get('digits')).toBe('6');
    expect(params.get('period')).toBe('30');
  });
});

describe('códigos de backup', () => {
  it('gera 10 códigos únicos no formato XXXXX-XXXXX', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    codes.forEach((c) => expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/));
    expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);
  });

  it('consome de uso único: some da lista e não vale de novo', () => {
    const codes = generateBackupCodes(3);
    const hashes = codes.map(hashBackupCode);

    const restantes = consumeBackupCode(hashes, codes[1]);
    expect(restantes).toHaveLength(2);
    expect(restantes).not.toContain(hashes[1]);
    expect(consumeBackupCode(restantes!, codes[1])).toBeNull();
  });

  it('aceita o código digitado sem hífen e em minúscula', () => {
    const [code] = generateBackupCodes(1);
    const hashes = [hashBackupCode(code)];
    expect(consumeBackupCode(hashes, code.replace('-', '').toLowerCase())).toEqual([]);
  });

  it('recusa código inexistente, vazio e de tamanho errado', () => {
    const hashes = generateBackupCodes(2).map(hashBackupCode);
    expect(consumeBackupCode(hashes, 'AAAAA-AAAAA')).toBeNull();
    expect(consumeBackupCode(hashes, '')).toBeNull();
    expect(consumeBackupCode(hashes, 'ABC')).toBeNull();
    expect(consumeBackupCode([], 'AAAAA-AAAAA')).toBeNull();
  });

  it('guarda só o hash — o código em claro não é recuperável do que persistimos', () => {
    const [code] = generateBackupCodes(1);
    const hash = hashBackupCode(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(code.replace('-', ''));
  });
});
