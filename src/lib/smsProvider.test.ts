// @vitest-environment node
// Provedor de SMS plugável + resolução do modo por env — ver smsProvider.ts.
import { describe, it, expect, vi } from 'vitest';
import {
  resolvePhoneVerificationSetup,
  buildOtpSmsBody,
  consoleSmsProvider,
  twilioSmsProvider,
  buildSmsProvider,
} from './smsProvider';

describe('resolvePhoneVerificationSetup', () => {
  it('sem env nenhuma → off (fail-safe: cadastro não quebra)', () => {
    expect(resolvePhoneVerificationSetup({})).toEqual({ enabled: false, mode: 'off' });
  });

  it("ENABLED='true' sem credencial → modo console (dev)", () => {
    expect(resolvePhoneVerificationSetup({ PHONE_VERIFICATION_ENABLED: 'true' })).toEqual({
      enabled: true,
      mode: 'console',
    });
  });

  it('credencial Twilio completa → modo twilio', () => {
    const setup = resolvePhoneVerificationSetup({
      SMS_PROVIDER_ACCOUNT_SID: 'AC123',
      SMS_PROVIDER_AUTH_TOKEN: 'tok',
      SMS_PROVIDER_FROM: '+15550001111',
    });
    expect(setup.enabled).toBe(true);
    expect(setup.mode).toBe('twilio');
    expect(setup.twilio).toEqual({ accountSid: 'AC123', authToken: 'tok', from: '+15550001111' });
  });

  it('API Key SID entra no setup quando presente', () => {
    const setup = resolvePhoneVerificationSetup({
      SMS_PROVIDER_ACCOUNT_SID: 'AC123',
      SMS_PROVIDER_API_KEY_SID: 'SK456',
      SMS_PROVIDER_AUTH_TOKEN: 'segredo-da-key',
      SMS_PROVIDER_FROM: '+15550001111',
    });
    expect(setup.twilio).toEqual({
      accountSid: 'AC123',
      apiKeySid: 'SK456',
      authToken: 'segredo-da-key',
      from: '+15550001111',
    });
  });

  it('API Key SID VAZIA não vira campo (senão o Basic auth iria com string vazia)', () => {
    const setup = resolvePhoneVerificationSetup({
      SMS_PROVIDER_ACCOUNT_SID: 'AC123',
      SMS_PROVIDER_API_KEY_SID: '   ',
      SMS_PROVIDER_AUTH_TOKEN: 'tok',
      SMS_PROVIDER_FROM: '+15550001111',
    });
    expect(setup.twilio).not.toHaveProperty('apiKeySid');
  });

  it('API Key SOZINHA (sem Account SID) não liga o modo twilio — a URL precisa do AC', () => {
    expect(
      resolvePhoneVerificationSetup({
        SMS_PROVIDER_API_KEY_SID: 'SK456',
        SMS_PROVIDER_AUTH_TOKEN: 'segredo',
        SMS_PROVIDER_FROM: '+15550001111',
      }),
    ).toEqual({ enabled: false, mode: 'off' });
  });

  it('credencial INCOMPLETA não liga o modo twilio', () => {
    expect(
      resolvePhoneVerificationSetup({ SMS_PROVIDER_ACCOUNT_SID: 'AC123', SMS_PROVIDER_AUTH_TOKEN: 'tok' }),
    ).toEqual({ enabled: false, mode: 'off' });
  });

  it("ENABLED='false' é kill switch — ganha da credencial", () => {
    expect(
      resolvePhoneVerificationSetup({
        PHONE_VERIFICATION_ENABLED: 'false',
        SMS_PROVIDER_ACCOUNT_SID: 'AC123',
        SMS_PROVIDER_AUTH_TOKEN: 'tok',
        SMS_PROVIDER_FROM: '+15550001111',
      }),
    ).toEqual({ enabled: false, mode: 'off' });
  });
});

describe('buildOtpSmsBody', () => {
  it('carrega o código, a marca e o prazo', () => {
    const body = buildOtpSmsBody('123456', 'AffiliaCore');
    expect(body).toContain('123456');
    expect(body).toContain('AffiliaCore');
    expect(body).toContain('10 minutos');
  });
});

describe('consoleSmsProvider', () => {
  it('loga o corpo com o telefone MASCARADO (nunca o número inteiro)', async () => {
    const log = vi.fn();
    await consoleSmsProvider(log).send('+5511987654321', 'corpo do sms');
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain('corpo do sms');
    expect(line).toContain('+5511*****4321');
    expect(line).not.toContain('+5511987654321');
  });
});

describe('twilioSmsProvider', () => {
  const cfg = { accountSid: 'AC123', authToken: 'secreta', from: '+15550001111' };

  it('POSTa no endpoint do Twilio com Basic auth e form From/To/Body', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, text: async () => '{}' })) as any;
    await twilioSmsProvider(cfg, fetchImpl).send('+5511987654321', 'ola');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('AC123:secreta').toString('base64')}`);
    const params = new URLSearchParams(init.body);
    expect(params.get('To')).toBe('+5511987654321');
    expect(params.get('From')).toBe('+15550001111');
    expect(params.get('Body')).toBe('ola');
  });

  it('com API Key: o Basic auth usa a SK, mas a URL segue com o Account SID', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, text: async () => '{}' })) as any;
    await twilioSmsProvider({ ...cfg, apiKeySid: 'SK456' }, fetchImpl).send('+5511987654321', 'ola');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('SK456:secreta').toString('base64')}`);
  });

  it('from "MG..." vira MessagingServiceSid em vez de From', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, text: async () => '{}' })) as any;
    await twilioSmsProvider({ ...cfg, from: 'MGabc' }, fetchImpl).send('+5511987654321', 'ola');
    const params = new URLSearchParams(fetchImpl.mock.calls[0][1].body);
    expect(params.get('MessagingServiceSid')).toBe('MGabc');
    expect(params.get('From')).toBeNull();
  });

  it('resposta não-ok → lança (o chamador decide o HTTP)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400, text: async () => 'bad' })) as any;
    await expect(twilioSmsProvider(cfg, fetchImpl).send('+5511987654321', 'ola')).rejects.toThrow();
    spy.mockRestore();
  });
});

describe('buildSmsProvider', () => {
  it('off → null; console/twilio → provedor com o id correspondente', () => {
    expect(buildSmsProvider({ enabled: false, mode: 'off' })).toBeNull();
    expect(buildSmsProvider({ enabled: true, mode: 'console' })?.id).toBe('console');
    expect(
      buildSmsProvider({
        enabled: true,
        mode: 'twilio',
        twilio: { accountSid: 'AC1', authToken: 't', from: '+1' },
      })?.id,
    ).toBe('twilio');
  });
});
