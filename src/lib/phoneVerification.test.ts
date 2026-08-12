// @vitest-environment node
// Núcleo puro da validação de telefone por SMS (OTP) — ver phoneVerification.ts.
import { describe, it, expect } from 'vitest';
import {
  OTP_LENGTH,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_MAX_SENDS,
  VERIFICATION_TOKEN_TTL_MS,
  normalizeBrPhone,
  phoneDocId,
  maskPhoneForLog,
  generateOtpCode,
  normalizeOtpCode,
  hashOtpCode,
  evaluateOtpAttempt,
  canSendOtp,
  buildChallenge,
  generateVerificationToken,
  hashVerificationToken,
  verificationTokenValid,
  type PhoneChallenge,
} from './phoneVerification';

const NOW = 1_755_000_000_000;
const PHONE = '+5511987654321';

const freshChallenge = (code = '123456', at = NOW): PhoneChallenge => buildChallenge(null, PHONE, code, at);

describe('normalizeBrPhone', () => {
  it('aceita a máscara BR e devolve E.164', () => {
    expect(normalizeBrPhone('(11) 98765-4321')).toBe('+5511987654321');
  });

  it('aceita dígitos crus com e sem DDI 55', () => {
    expect(normalizeBrPhone('11987654321')).toBe('+5511987654321');
    expect(normalizeBrPhone('5511987654321')).toBe('+5511987654321');
    expect(normalizeBrPhone('+55 11 98765-4321')).toBe('+5511987654321');
  });

  it('rejeita fixo (8 dígitos), DDD com zero e lixo', () => {
    expect(normalizeBrPhone('(11) 3765-4321')).toBeNull(); // fixo — SMS não chega
    expect(normalizeBrPhone('(01) 98765-4321')).toBeNull(); // DDD inválido
    expect(normalizeBrPhone('(10) 98765-4321')).toBeNull(); // DDD inválido
    expect(normalizeBrPhone('11887654321')).toBeNull(); // 11 dígitos mas não começa com 9
    expect(normalizeBrPhone('abc')).toBeNull();
    expect(normalizeBrPhone('')).toBeNull();
    expect(normalizeBrPhone(null)).toBeNull();
    expect(normalizeBrPhone(undefined)).toBeNull();
  });

  it('rejeita comprimentos errados (curto/longo demais)', () => {
    expect(normalizeBrPhone('1198765432')).toBeNull();
    expect(normalizeBrPhone('119876543210')).toBeNull();
    expect(normalizeBrPhone('555511987654321')).toBeNull();
  });
});

describe('phoneDocId / maskPhoneForLog', () => {
  it('doc id é o E.164 sem o +', () => {
    expect(phoneDocId('+5511987654321')).toBe('5511987654321');
  });

  it('máscara de log nunca expõe o número inteiro', () => {
    const masked = maskPhoneForLog(PHONE);
    expect(masked).toBe('+5511*****4321');
    expect(masked).not.toContain('98765');
  });
});

describe('generateOtpCode / hashOtpCode', () => {
  it('gera sempre 6 dígitos', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateOtpCode()).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
    }
  });

  it('normaliza o código colado com espaços', () => {
    expect(normalizeOtpCode('123 456')).toBe('123456');
    expect(normalizeOtpCode(null)).toBe('');
  });

  it('hash é amarrado ao telefone — mesmo código, número diferente, hash diferente', () => {
    expect(hashOtpCode('123456', PHONE)).not.toBe(hashOtpCode('123456', '+5521987654321'));
    expect(hashOtpCode('123 456', PHONE)).toBe(hashOtpCode('123456', PHONE));
  });
});

describe('evaluateOtpAttempt', () => {
  it('código certo dentro do prazo → ok', () => {
    const ch = freshChallenge('123456');
    expect(evaluateOtpAttempt(ch, PHONE, '123456', NOW + 1000)).toEqual({ ok: true });
    // tolera colar com espaço
    expect(evaluateOtpAttempt(ch, PHONE, '123 456', NOW + 1000)).toEqual({ ok: true });
  });

  it('código errado → wrong_code (sem revelar mais nada)', () => {
    const ch = freshChallenge('123456');
    expect(evaluateOtpAttempt(ch, PHONE, '654321', NOW)).toEqual({ ok: false, reason: 'wrong_code' });
    expect(evaluateOtpAttempt(ch, PHONE, '12345', NOW)).toEqual({ ok: false, reason: 'wrong_code' });
  });

  it('expirado → expired, mesmo com o código certo', () => {
    const ch = freshChallenge('123456');
    expect(evaluateOtpAttempt(ch, PHONE, '123456', NOW + OTP_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' });
  });

  it('tentativas esgotadas → too_many_attempts, mesmo com o código certo', () => {
    const ch = { ...freshChallenge('123456'), attempts: OTP_MAX_ATTEMPTS };
    expect(evaluateOtpAttempt(ch, PHONE, '123456', NOW)).toEqual({ ok: false, reason: 'too_many_attempts' });
  });

  it('desafio inexistente/sem hash → not_found', () => {
    expect(evaluateOtpAttempt(null, PHONE, '123456', NOW)).toEqual({ ok: false, reason: 'not_found' });
    expect(evaluateOtpAttempt({}, PHONE, '123456', NOW)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('hash de outro telefone não valida (amarração)', () => {
    const ch = buildChallenge(null, '+5521987654321', '123456', NOW);
    expect(evaluateOtpAttempt(ch, PHONE, '123456', NOW)).toEqual({ ok: false, reason: 'wrong_code' });
  });
});

describe('canSendOtp (cooldown + teto de envios)', () => {
  it('sem desafio anterior → pode enviar', () => {
    expect(canSendOtp(null, NOW)).toEqual({ ok: true });
  });

  it('reenvio dentro do cooldown → bloqueia com retryInMs', () => {
    const ch = freshChallenge();
    const res = canSendOtp(ch, NOW + 10_000);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('cooldown');
      expect(res.retryInMs).toBe(OTP_RESEND_COOLDOWN_MS - 10_000);
    }
  });

  it('após o cooldown → pode reenviar', () => {
    const ch = freshChallenge();
    expect(canSendOtp(ch, NOW + OTP_RESEND_COOLDOWN_MS)).toEqual({ ok: true });
  });

  it('teto de envios do desafio → bloqueia até expirar; expirado destrava', () => {
    const ch = { ...freshChallenge(), sendCount: OTP_MAX_SENDS };
    const blocked = canSendOtp(ch, NOW + OTP_RESEND_COOLDOWN_MS);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('send_limit');
    // Depois de expirar, o envio novo é permitido (o contador zera no buildChallenge).
    expect(canSendOtp(ch, NOW + OTP_TTL_MS + 1)).toEqual({ ok: true });
  });
});

describe('buildChallenge', () => {
  it('zera tentativas/verificação e incrementa sendCount no reenvio', () => {
    const first = buildChallenge(null, PHONE, '111111', NOW);
    expect(first.sendCount).toBe(1);
    expect(first.attempts).toBe(0);
    const resent = buildChallenge({ ...first, attempts: 3, verified: true }, PHONE, '222222', NOW + OTP_RESEND_COOLDOWN_MS);
    expect(resent.sendCount).toBe(2);
    expect(resent.attempts).toBe(0);
    expect(resent.verified).toBe(false);
    expect(resent.tokenHash).toBeNull();
  });

  it('desafio anterior expirado zera o sendCount', () => {
    const first = { ...buildChallenge(null, PHONE, '111111', NOW), sendCount: OTP_MAX_SENDS };
    const fresh = buildChallenge(first, PHONE, '222222', NOW + OTP_TTL_MS + 1);
    expect(fresh.sendCount).toBe(1);
  });

  it('nunca guarda o código em claro', () => {
    const ch = buildChallenge(null, PHONE, '123456', NOW);
    expect(JSON.stringify(ch)).not.toContain('123456');
    expect(ch.codeHash).toBe(hashOtpCode('123456', PHONE));
  });
});

describe('token de verificação', () => {
  const verifiedChallenge = (token: string): PhoneChallenge => ({
    ...freshChallenge(),
    verified: true,
    verifiedAtMs: NOW,
    tokenHash: hashVerificationToken(token),
  });

  it('token certo em desafio verificado → válido', () => {
    const token = generateVerificationToken();
    expect(verificationTokenValid(verifiedChallenge(token), token, NOW + 1000)).toBe(true);
  });

  it('token errado / vazio / desafio não verificado → inválido', () => {
    const token = generateVerificationToken();
    expect(verificationTokenValid(verifiedChallenge(token), 'outro-token', NOW)).toBe(false);
    expect(verificationTokenValid(verifiedChallenge(token), '', NOW)).toBe(false);
    expect(verificationTokenValid({ ...verifiedChallenge(token), verified: false }, token, NOW)).toBe(false);
    expect(verificationTokenValid(null, token, NOW)).toBe(false);
  });

  it('token consumido não vale duas vezes (uso único)', () => {
    const token = generateVerificationToken();
    const ch = { ...verifiedChallenge(token), consumedAtMs: NOW + 500 };
    expect(verificationTokenValid(ch, token, NOW + 1000)).toBe(false);
  });

  it('token expira após o TTL', () => {
    const token = generateVerificationToken();
    expect(verificationTokenValid(verifiedChallenge(token), token, NOW + VERIFICATION_TOKEN_TTL_MS + 1)).toBe(false);
  });
});
