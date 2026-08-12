// Provedor de SMS plugável — a validação de telefone é PROVIDER-AGNOSTIC.
//
// O núcleo de OTP (gerar/expirar/validar código) é NOSSO (lib/phoneVerification),
// então qualquer provedor aqui é só um "enviador de SMS". Recomendação da
// PESQUISA-SMS-OTP.md: Twilio (Programmable Messaging) hoje; trocar p/ Comtele
// (BRL/PIX) no futuro = implementar mais um SmsProvider.
//
// Config por ENV SERVER-ONLY (nunca VITE_ — credencial não chega ao browser):
//   PHONE_VERIFICATION_ENABLED  'true' liga (modo dev/console sem credencial);
//                               'false' desliga mesmo com credencial.
//   SMS_PROVIDER_ACCOUNT_SID    credencial do Twilio (Account SID)
//   SMS_PROVIDER_AUTH_TOKEN     credencial do Twilio (Auth Token)
//   SMS_PROVIDER_FROM           remetente E.164 (ou Messaging Service SID "MG...")
//
// FAIL-SAFE: sem env nenhuma, a feature fica OFF e os fluxos de cadastro seguem
// exatamente como hoje (telefone sem verificação) — contratar o provedor é
// decisão do operador e não bloqueia o código.
//
// Módulo SERVER-ONLY por convenção (vive atrás das rotas /api/phone/*).
import { maskPhoneForLog } from './phoneVerification';

export interface SmsProvider {
  /** Identificador p/ log/diagnóstico ('console' | 'twilio' | 'test'...). */
  readonly id: string;
  /** Envia um SMS. Lança em falha — o chamador decide o status HTTP. */
  send(toE164: string, body: string): Promise<void>;
}

export type PhoneVerificationMode = 'off' | 'console' | 'twilio';

export interface PhoneVerificationSetup {
  enabled: boolean;
  mode: PhoneVerificationMode;
  twilio?: { accountSid: string; authToken: string; from: string };
}

/**
 * Resolve o modo da feature a partir do ambiente. Pura e testável.
 *
 *   ENABLED='false'            → off (kill switch, ganha de credencial)
 *   credencial Twilio completa → twilio
 *   ENABLED='true' sem cred.   → console (dev/demo: código no log do servidor)
 *   nada configurado           → off (fail-safe: cadastro não quebra)
 */
export function resolvePhoneVerificationSetup(
  env: Record<string, string | undefined>,
): PhoneVerificationSetup {
  const flag = String(env.PHONE_VERIFICATION_ENABLED ?? '').trim().toLowerCase();
  if (flag === 'false') return { enabled: false, mode: 'off' };
  const accountSid = String(env.SMS_PROVIDER_ACCOUNT_SID ?? '').trim();
  const authToken = String(env.SMS_PROVIDER_AUTH_TOKEN ?? '').trim();
  const from = String(env.SMS_PROVIDER_FROM ?? '').trim();
  if (accountSid && authToken && from) {
    return { enabled: true, mode: 'twilio', twilio: { accountSid, authToken, from } };
  }
  if (flag === 'true') return { enabled: true, mode: 'console' };
  return { enabled: false, mode: 'off' };
}

/** Texto do SMS (pt-BR). O TTL exibido tem que casar com OTP_TTL_MS (10 min). */
export function buildOtpSmsBody(code: string, brandName: string): string {
  return `${brandName}: seu codigo de verificacao e ${code}. Ele expira em 10 minutos. Nao compartilhe.`;
}

/**
 * Modo dev/demo: "envia" logando no console do SERVIDOR. Único lugar do app
 * autorizado a logar um código OTP — e mesmo aqui o telefone sai mascarado.
 */
export function consoleSmsProvider(log: (msg: string) => void = console.log): SmsProvider {
  return {
    id: 'console',
    async send(toE164: string, body: string) {
      log(`[sms:dev] SMS para ${maskPhoneForLog(toE164)} → "${body}" (provedor de SMS NÃO configurado — modo dev)`);
    },
  };
}

/**
 * Twilio Programmable Messaging via REST puro (sem SDK — menos uma dependência;
 * o endpoint é um POST form-encoded). `from` aceita número E.164 ou Messaging
 * Service SID. fetch injetável p/ teste.
 */
export function twilioSmsProvider(
  cfg: { accountSid: string; authToken: string; from: string },
  fetchImpl: typeof fetch = fetch,
): SmsProvider {
  return {
    id: 'twilio',
    async send(toE164: string, body: string) {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`;
      const params = new URLSearchParams({ To: toE164, Body: body });
      // Messaging Service SID começa com "MG"; número cru vai em From.
      if (/^MG/i.test(cfg.from)) params.set('MessagingServiceSid', cfg.from);
      else params.set('From', cfg.from);
      const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      });
      if (!response.ok) {
        // Corpo do Twilio fica no log do servidor; quem chama devolve erro genérico.
        const text = await response.text().catch(() => '');
        console.error(`[sms:twilio] falha ${response.status} enviando para ${maskPhoneForLog(toE164)}:`, text.slice(0, 500));
        throw new Error(`Falha no envio do SMS (HTTP ${response.status}).`);
      }
    },
  };
}

/** Monta o provedor do setup resolvido. `off` → null (feature desligada). */
export function buildSmsProvider(
  setup: PhoneVerificationSetup,
  fetchImpl: typeof fetch = fetch,
): SmsProvider | null {
  if (!setup.enabled) return null;
  if (setup.mode === 'twilio' && setup.twilio) return twilioSmsProvider(setup.twilio, fetchImpl);
  return consoleSmsProvider();
}
