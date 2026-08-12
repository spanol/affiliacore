# Pesquisa: provedores de SMS transacional/OTP para validação de telefone (BR)

> 2026-08-12. Item 7 do backlog da call com a Infinity: **validação do número de
> telefone por SMS** nos dois pontos de entrada de afiliado (auto-cadastro em
> `/register` e aceite de convite). Esta pesquisa compara provedores de SMS
> A2P/OTP para o Brasil; a implementação é **provider-agnostic** (interface
> `SmsProvider` em `src/lib/smsProvider.ts`, núcleo de OTP próprio em
> `src/lib/phoneVerification.ts`), então **a decisão comercial do operador não
> bloqueia o código** — sem provedor contratado, o fluxo roda em modo dev
> (código no log do servidor) ou fica desligado. Preços coletados nas fontes
> oficiais em 12/08/2026; conversões a ≈ R$ 5,50/USD — confirme o câmbio do dia.

## TL;DR

1. **Recomendação: Twilio** como transporte de SMS (Programmable Messaging),
   começando **hoje** e sem contrato — conta self-service, sem mínimo mensal,
   ~US$ 0,06/SMS ao Brasil. Em ~200 verificações/mês por instância isso dá
   **~R$ 70/mês** — irrelevante frente ao valor da feature.
2. **NÃO usamos o Twilio Verify** (o produto de OTP gerenciado, +US$ 0,05 por
   verificação): a AffiliaCore **já tem núcleo criptográfico próprio** (mesmo
   padrão do 2FA em `src/lib/totp.ts`), e o modo dev/demo (emuladores, sem
   provedor) exige que geração/validação do código sejam nossas de qualquer
   forma. Gerando o código nós mesmos, qualquer provedor vira só um "enviador
   de SMS" — é o que mantém a troca de provedor barata.
3. **Plano B de custo: Comtele** (broker nacional) — R$ 0,05–0,12/SMS, pré-pago
   em **BRL via PIX**, créditos que não expiram, self-service. Corta o custo
   unitário em ~5× quando o volume crescer; trocar = implementar mais um
   `SmsProvider` (uma função `send`).
4. **Evitar AWS SNS** para este caso: preço igual ao Twilio (~US$ 0,06/BR), mas
   conta nasce em *sandbox* (só envia a números verificados) e sair exige
   ticket de suporte — burocracia sem ganho. **Zenvia** só faz sentido em
   volume alto/contrato local: a tabela pública é por pacote mensal (mín.
   ~US$ 20/mês por instância), que perde do Twilio no nosso volume.
5. **Burocracia regulatória no BR é baixa** para SMS transacional: a Anatel não
   exige registro do remetente; a mensagem sai por short code do broker.
   *Sender ID* alfanumérico com a marca é opcional e exige registro com LOA
   (carta de autorização) nas operadoras — não vale o esforço agora.

## 1. Comparativo

| | **Twilio** | **Zenvia** | **AWS SNS** | **Comtele** |
|---|---|---|---|---|
| Preço/SMS ao BR | US$ 0,0599 (~R$ 0,33); Verify soma +US$ 0,05/verificação | US$ 0,0129–0,0184 (~R$ 0,08–0,10) via pacote | US$ 0,06 (~R$ 0,33) | **R$ 0,05–0,12** |
| Moeda / modelo | USD, pré-pago pay-as-you-go, **sem mínimo** | USD, pacote mensal (**mín. ~US$ 20/mês**) | USD, pós-pago na fatura AWS | **BRL, PIX pré-pago**, sem mínimo, créditos não expiram |
| API de OTP pronta (gera+valida)? | Sim (Verify, com anti-fraude) — **não usamos**, ver TL;DR §2 | Parcial (API legada da TotalVoice, `/verificacao`) | Não (só envio cru) | Não (só envio cru) |
| SDK Node / doc | Excelente (não precisamos do SDK: REST simples) | Boa, pt-BR | Boa porém genérica | `comtele-sdk`, doc ok |
| Burocracia p/ começar | Quase zero (self-service) | Cadastro comercial, dias | **Sandbox + ticket de suporte** | Quase zero, self-service |
| Tempo até o 1º OTP em produção | Horas | Dias | Dias | Horas |

Notas por provedor:

- **Twilio** — toda tentativa de SMS é cobrada (entregue ou não); a verificação
  do Verify só quando bem-sucedida. Sem o Verify, o custo por OTP = nº de SMS
  enviados × US$ 0,0599. Conta trial → upgrade com cartão, sem vendas no meio.
- **Zenvia** — hoje vende o "Zenvia Customer Cloud" (software + pacotes de
  canal: US$ 20/mês ≈ 1.088 SMS até US$ 400/mês ≈ 31.108 SMS). Não há preço
  público de API avulsa fora dos pacotes. Player nacional, rotas homologadas;
  onboarding tende a passar por vendas.
- **AWS SNS** — o produto SMS migrou pro guarda-chuva "AWS End User Messaging".
  Além do sandbox, há teto default de gasto (US$ 1/mês) que também exige ticket.
  Short code dedicado BR: US$ 330 setup + US$ 330/mês (irrelevante p/ nós).
- **Comtele** — broker BR self-service: R$ 0,12/SMS no pacote de 500 (R$ 60),
  "a partir de R$ 0,05" em volume; cobra só SMS entregue; 10 créditos de teste.

## 2. Recomendação (decisão final é do operador — custo recorrente)

**Twilio, no modo "envio cru" (Programmable Messaging).** Custo ~R$ 0,33/SMS
sem nenhum mínimo mensal (instância que não usa, não paga — importante no
modelo white-label), setup em horas e a credencial entra por env server-only
(`SMS_PROVIDER_*`, ver `.env.example`). Quando o volume justificar, migrar o
transporte para a **Comtele** (BRL/PIX, ~5× mais barato) é escrever um novo
`SmsProvider` — o núcleo de OTP, o rate-limiting e a UI não mudam.

## 3. Fontes

- Twilio Verify pricing — https://www.twilio.com/en-us/verify/pricing
- Twilio SMS pricing Brasil — https://www.twilio.com/en-us/sms/pricing/br
- Twilio · registro de Sender ID no Brasil — https://support.twilio.com/hc/en-us/articles/4683203082779
- Zenvia · planos e pacotes — https://zenvia.com/en/prices/
- Zenvia · doc SMS — https://desenvolvedores.zenvia.com/sms/documentacao/
- Zenvia · SMS core Node — https://github.com/zenvia/zenvia-sms-core
- AWS SNS SMS pricing — https://aws.amazon.com/sns/sms-pricing/
- AWS country rates (US$ 0,06/BR) — https://aws.amazon.com/systems-manager/pricing/country-rates/
- AWS SNS SMS sandbox — https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox.html
- Comtele · preços — https://comtele.com.br/precos-comtele/
- Comtele · API/SDK — https://developers.comtele.com.br/
