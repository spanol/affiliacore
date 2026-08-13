/**
 * Smoke test do provedor de SMS (Twilio) — validação de telefone por OTP.
 *
 * Exercita o MESMO caminho de produção (`resolvePhoneVerificationSetup` +
 * `buildSmsProvider` + `buildOtpSmsBody` de src/lib/smsProvider), então um
 * "OK" aqui significa que /api/phone/send-code vai funcionar na instância.
 *
 * Uso:
 *   npx tsx scripts/sms/smoke-twilio.ts                  # só diagnóstico (NÃO envia, custo R$ 0)
 *   npx tsx scripts/sms/smoke-twilio.ts --to 11987654321 # envia 1 SMS de verdade (custo ~R$ 0,33)
 *
 * As credenciais vêm do .env (SMS_PROVIDER_ACCOUNT_SID / _AUTH_TOKEN / _FROM).
 * Nada é gravado no Firestore — o OTP aqui é descartável, não vira desafio.
 */
import 'dotenv/config';
import { resolvePhoneVerificationSetup, buildSmsProvider, buildOtpSmsBody } from '../../src/lib/smsProvider';
import { normalizeBrPhone, maskPhoneForLog, generateOtpCode } from '../../src/lib/phoneVerification';

const mask = (s: string) => (s.length <= 8 ? '***' : `${s.slice(0, 4)}…${s.slice(-4)}`);
const ok = (m: string) => console.log(`  [32m✓[0m ${m}`);
const bad = (m: string) => console.log(`  [31m✗[0m ${m}`);
const warn = (m: string) => console.log(`  [33m![0m ${m}`);

async function twilioGet(path: string, user: string, token: string) {
  const auth = Buffer.from(`${user}:${token}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}) as any);
  return { status: res.status, ok: res.ok, body: body as any };
}

async function main() {
  const toArgIndex = process.argv.indexOf('--to');
  const toArg = toArgIndex >= 0 ? process.argv[toArgIndex + 1] : undefined;

  console.log('\n== 1. Configuração resolvida do ambiente ==');
  const setup = resolvePhoneVerificationSetup(process.env as Record<string, string | undefined>);
  console.log(`  PHONE_VERIFICATION_ENABLED=${process.env.PHONE_VERIFICATION_ENABLED ?? '(vazio)'}`);
  console.log(`  modo: ${setup.mode}   feature ligada: ${setup.enabled}`);
  if (setup.mode !== 'twilio') {
    bad(`modo "${setup.mode}" — o Twilio NÃO está configurado.`);
    console.log('    Preencha no .env: SMS_PROVIDER_ACCOUNT_SID, SMS_PROVIDER_AUTH_TOKEN, SMS_PROVIDER_FROM');
    process.exit(1);
  }
  const { accountSid, authToken, apiKeySid, from } = setup.twilio!;
  // Usuário do Basic auth: a API Key quando há uma; a URL usa sempre o Account SID.
  const authUser = apiKeySid || accountSid;
  ok(`Account SID ${mask(accountSid)} · segredo ${mask(authToken)} · from ${from}`);
  ok(apiKeySid ? `autenticando pela API Key ${mask(apiKeySid)}` : 'autenticando pelo Auth Token da conta');
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) {
    warn('o Account SID não tem o formato "AC" + 32 hex — confira se não colou a API Key (SK...) nesse campo.');
  }
  if (apiKeySid && !/^SK[0-9a-f]{32}$/i.test(apiKeySid)) {
    warn('a API Key SID não tem o formato "SK" + 32 hex.');
  }

  console.log('\n== 2. Credencial vale? (GET da conta — não envia nada) ==');
  const account = await twilioGet(`Accounts/${accountSid}.json`, authUser, authToken);
  if (!account.ok) {
    bad(`HTTP ${account.status} — ${account.body?.message ?? 'credencial recusada'}`);
    if (account.status === 401) {
      console.log(apiKeySid
        ? '    401 = API Key SID ou Secret errado (o Secret só aparece na CRIAÇÃO da key — se perdeu, crie outra).'
        : '    401 = Account SID ou Auth Token errado (o Auth Token fica na home do Console, botão "show").');
    }
    process.exit(1);
  }
  ok(`conta "${account.body.friendly_name}" · status ${account.body.status} · tipo ${account.body.type}`);
  const isTrial = String(account.body.type ?? '').toLowerCase().includes('trial');
  if (isTrial) {
    warn('CONTA TRIAL: só envia para números VERIFICADOS no console e o SMS chega com prefixo "Sent from your Twilio trial account".');
  }

  console.log('\n== 3. O remetente (FROM) existe na conta? ==');
  if (/^MG/i.test(from)) {
    const svc = await fetch(`https://messaging.twilio.com/v1/Services/${from}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${authUser}:${authToken}`).toString('base64')}`, Accept: 'application/json' },
    });
    if (svc.ok) ok(`Messaging Service ${from} encontrado (${(await svc.json() as any).friendly_name}).`);
    else { bad(`Messaging Service ${from} não encontrado (HTTP ${svc.status}).`); process.exit(1); }
  } else {
    const nums = await twilioGet(`Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=50`, authUser, authToken);
    const list: any[] = nums.body?.incoming_phone_numbers ?? [];
    const found = list.find((n) => n.phone_number === from);
    if (found) {
      ok(`número ${from} pertence à conta.`);
      if (found.capabilities && found.capabilities.sms === false) bad('…mas ele NÃO tem capacidade de SMS.');
    } else {
      bad(`${from} não está entre os números da conta (${list.length} encontrado(s): ${list.map((n) => n.phone_number).join(', ') || 'nenhum'}).`);
      console.log('    Compre um número com SMS no console (Phone Numbers → Buy a number) ou use um Messaging Service SID (MG...).');
      process.exit(1);
    }
  }

  if (!toArg) {
    console.log('\n== 4. Envio real ==');
    console.log('  (pulado) rode com  --to 11987654321  para enviar 1 SMS de verdade.');
    console.log('\nDiagnóstico OK — a configuração está pronta.\n');
    return;
  }

  console.log('\n== 4. Envio real (custo ~R$ 0,33) ==');
  const to = normalizeBrPhone(toArg);
  if (!to) {
    bad(`"${toArg}" não é um celular BR válido (esperado DDD + 9 dígitos começando em 9).`);
    process.exit(1);
  }
  const code = generateOtpCode();
  const body = buildOtpSmsBody(code, 'AffiliaCore');
  console.log(`  destino ${maskPhoneForLog(to)} · código ${code}`);
  console.log(`  corpo: "${body}"`);
  const provider = buildSmsProvider(setup);
  if (!provider) { bad('buildSmsProvider devolveu null.'); process.exit(1); }
  try {
    await provider.send(to, body);
    ok(`provider "${provider.id}" aceitou o envio (HTTP 2xx da API).`);
  } catch (error) {
    bad(`falha no envio: ${(error as Error).message}`);
    process.exit(1);
  }

  console.log('\n== 5. Status de entrega (a API aceita antes de entregar) ==');
  await new Promise((r) => setTimeout(r, 4000));
  const msgs = await twilioGet(`Accounts/${accountSid}/Messages.json?To=${encodeURIComponent(to)}&PageSize=1`, authUser, authToken);
  const msg = msgs.body?.messages?.[0];
  if (!msg) { warn('nenhuma mensagem listada ainda — confira no console do Twilio (Monitor → Logs → Messaging).'); return; }
  const line = `SID ${msg.sid} · status "${msg.status}" · erro ${msg.error_code ?? 'nenhum'} ${msg.error_message ?? ''}`;
  if (['delivered', 'sent', 'queued', 'sending', 'accepted'].includes(String(msg.status))) ok(line);
  else bad(line);
  if (msg.error_code === 21608) console.log('    21608 = conta trial: verifique o número de destino no console primeiro.');
  if (msg.error_code === 21612) console.log('    21612 = a rota do remetente não alcança o Brasil (troque o número / use Messaging Service).');
  console.log('\nConfira o celular. Status final aparece em Monitor → Logs → Messaging no console.\n');
}

main().catch((error) => { console.error(error); process.exit(1); });
