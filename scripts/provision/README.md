# Playbook · Nova instância white-label em 1 dia (P4)

> Provisiona uma instância COMPLETA para um cliente novo: mesmo repo/`main` para
> todos (NUNCA fork/branch por cliente), 1 projeto Firebase por cliente, config
> por instância via envs (`VITE_OTG_ENABLED`, `VITE_BRAND_*`) + secrets.
> Pré-requisitos na máquina do operador: Node 20+, `firebase-tools` (global),
> acesso de Owner ao novo projeto. Tempo alvo: ~2h de trabalho + esperas de build.
>
> **Runbook orquestrado (ordem enxuta + fronteiras de credencial):** skill
> `provision-instance` (`.claude/skills/provision-instance/SKILL.md`). Este README é
> a referência exaustiva; a skill é o passo-a-passo que o agente dirige.

## 1 · Projeto Firebase (console)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Adicionar projeto** (ex.: `agencia-alfa-app`).
2. **Authentication** → ativar provedor **E-mail/senha**.
3. **Firestore** → criar banco em **`southamerica-east1`** (produção).
4. **Storage** → ativar (logos das casas).
5. **Configurações do projeto → Contas de serviço** → *Gerar nova chave privada* → salvar como `service-account.json` (NÃO commitar; fica na máquina do operador durante o setup).
6. Registrar um **app Web** no projeto (o App Hosting usa esse registro p/ injetar `FIREBASE_WEBAPP_CONFIG` no build — o código lê e cai no projeto certo automaticamente; o `firebase-applet-config.json` do repo é só fallback de dev).

## 2 · Rules + primeiro admin

```bash
firebase use <project-id>
firebase deploy --only firestore:rules

# Admin do cliente (senha forte + troca no 1º login) — e, opcional, um 2º admin de
# TESTE da AffiliaCore (entra direto, sem troca) no MESMO comando via --test-user.
# Cada conta imprime a senha UMA vez. Idempotente (login existente = só promove).
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
  node scripts/provision/bootstrap-admin.cjs \
    --email admin@cliente.com --name "Nome do Admin" \
    --test-user voce@cliente.com --test-name "AffiliaCore (teste)"
```

> Rode o bootstrap com a service account DA INSTÂNCIA e **apague-a depois**
> (`rm service-account*.json` + confirmar) — a produção usa ADC, não precisa da chave.

## 3 · Secrets do App Hosting

```bash
# Obrigatórios
firebase apphosting:secrets:set firebase-service-account-key   # colar o service-account.json
firebase apphosting:secrets:set ranking-cron-secret            # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
firebase apphosting:secrets:set master-admin-email             # e-mail do admin que recebe o lembrete do ranking

# SÓ se a instância usar OTG (raro — a chave é por parceiro OTG):
firebase apphosting:secrets:set affiliate-api-key
```

## 4 · Backend do App Hosting + config da instância

```bash
firebase apphosting:backends:create --project <project-id>
# conectar o repo GitHub spanol/affiliacore, branch main, região us-east4
```

> **GOTCHA de IAM (custou 3 builds na Infinity, 2026-07-20).** Um backend pode ser
> criado SEM o bootstrap de IAM da service account `firebase-app-hosting-compute@`.
> Quando isso acontece o build falha em cascata e o erro muda a cada tentativa:
> 1º `roles/logging.logWriter` ausente (morre em ~18s), 2º `developerconnect.
> gitRepositoryLinks.get` negado no FETCHSOURCE (~11s), e o runtime quebraria
> depois no ADC (sem acesso a Firestore).
>
> **Diagnóstico:** console → IAM → **marque "Incluir concessões de papel fornecidas
> pelo Google"** (sem isso a lista MENTE) e olhe a SA `firebase-app-hosting-compute@`.
> O saudável tem `Executor do Compute no Firebase App Hosting` (= `roles/
> firebaseapphosting.computeRunner`) + Developer Connect + Admin SDK + Storage.
> Se só aparecer 1 papel (ou nenhum), o bootstrap não rodou.
>
> **Correção:** NÃO saia concedendo papel por papel. Apague e recrie o backend —
> a criação refaz o IAM inteiro de uma vez, e o ID/URL são reaproveitáveis:
> ```bash
> firebase apphosting:backends:delete <backend> --project <project-id> --force
> firebase apphosting:backends:create --project <project-id> \
>   --backend <backend> --primary-region us-east4 --app <webAppId> --non-interactive
> ```
> Recriar **zera o ambiente e a conexão do repo** (reconfigure os dois no console)
> e **perde o acesso aos secrets** — rode de novo:
> ```bash
> firebase apphosting:secrets:grantaccess <secret> --backend <backend> \
>   --location us-east4 --project <project-id>
> ```

Config por instância: criar `apphosting.<ambiente>.yaml` no repo (override que o
App Hosting MESCLA sobre o `apphosting.yaml` base, específico vence) e associar o
nome do ambiente ao backend no console: **App Hosting → backend → Settings →
Environment → `<ambiente>`** (sem associação, o backend usa só o base). Convenção:
ambiente = nome do cliente (ex.: `alfa` → `apphosting.alfa.yaml`):

```yaml
env:
  - variable: VITE_OTG_ENABLED
    value: 'false'                # instância OTG-free (padrão de venda)
    availability: [BUILD, RUNTIME]
  - variable: VITE_BRAND_NAME
    value: 'Agência Alfa'
    availability: [BUILD, RUNTIME]
  - variable: VITE_BRAND_SHORT
    value: 'Alfa'                 # entra em frase tratado no FEMININO ("a Alfa...")
    availability: [BUILD, RUNTIME]
  - variable: VITE_BRAND_LOGO_URL
    value: 'https://<storage-ou-cdn>/logo.svg'
    availability: [BUILD, RUNTIME]
  - variable: VITE_BRAND_FAVICON_URL
    value: 'https://<storage-ou-cdn>/favicon.svg'
    availability: [BUILD, RUNTIME]
  - variable: VITE_BRAND_ACCENT     # P3.1: cor de destaque DO CLIENTE (1 hex; gera
    value: '<accent-do-cliente>'    # a escala inteira + contraste WCAG em runtime)
    availability: [BUILD, RUNTIME]
  - variable: VITE_BRAND_THEME      # P3.3 (opcional): tema inicial sem preferência
    value: 'dark'                   # salva ('light'|'dark'; ausência = SO).
    availability: [BUILD, RUNTIME]  # P5.6: vale TAMBÉM p/ a landing pública.
  - variable: FIREBASE_STORAGE_BUCKET
    value: '<project-id>.firebasestorage.app'
    availability: [RUNTIME]
```

**🌗 `VITE_BRAND_THEME` decide também a LANDING (desde P5.6).** A LP era dark-only
e virou theme-aware (mesmo `ThemeContext` do app, com toggle na nav), então esta
env deixou de ser "o tema do app logado" e passou a decidir a **porta de entrada**
da marca. Sem declarar nada, um visitante com o SO no claro vê a landing CLARA —
o que costuma surpreender quem só viu o mock escuro na venda. **Pergunte ao
cliente antes do 1º rollout**; se ele quer a vitrine sempre escura, pine
`value: 'dark'`. É BUILD: mudar depois exige rollout novo.

**🎨 Fundo PRETO é o padrão — não declare `VITE_BRAND_CANVAS`/`VITE_BRAND_SURFACE`.**
O default do `index.css` (neutral + navy `#141C2A`) é o que a label deve ter; o
`ACCENT` do cliente já pinta tudo que precisa ser da marca. Declare canvas/surface
só se o cliente PEDIR um fundo tingido — e saiba o que está fazendo: o `CANVAS`
re-tinta a ramp `neutral-*` INTEIRA + os tokens glass escuros, ou seja, muda a cor
de modais, cards, bordas e cabeçalhos (foi assim que a Infinity subiu com tudo
avermelhado em jul/2026, herdando o ember do produto que morava no base).
`VITE_BRAND_STYLE: 'solid'` (opaco, sem blur) é opção de look corporativo e não
mexe na cor. O invariante "label nasce preta" está travado em
`src/lib/instanceTheming.test.ts` — se você adicionar canvas a uma label, atualize
o teste conscientemente.

**⚠️ Neutralizar os secrets OTG do base (obrigatório em instância OTG-free):** o
`apphosting.yaml` base referencia secrets que só existem no projeto da instância 0
(`affiliate-api-key`, `otg-links-*`, `otg-dash-*`) — num projeto novo o rollout
FALHA na validação de secret inexistente. Copie pro seu yaml o bloco de overrides
plain (`value: 'unused'`, NUNCA string vazia) do `apphosting.demo.yaml`, incluindo
o `MASTER_ADMIN_EMAIL` (vira e-mail inline do admin da instância).

Commitar o yaml novo na `main` (é só config; não afeta as outras instâncias) e
disparar o 1º rollout (push ou `firebase apphosting:rollouts:create <backend-id>`).

## 5 · Cron do ranking (Cloud Scheduler)

1. Habilitar a API: `https://console.developers.google.com/apis/api/cloudscheduler.googleapis.com/overview?project=<project-id>` → Ativar.
2. IAM → conceder **Cloud Scheduler Admin** ao SA `firebase-adminsdk-...@<project-id>.iam.gserviceaccount.com` (ou criar o job manualmente no console).
3. Criar o job (região `southamerica-east1`): `30 14 * * *`, fuso `America/Sao_Paulo`, POST `https://<dominio>/api/internal/daily-ranking`, header `x-cron-secret: <valor do ranking-cron-secret>`.

## 6 · Domínio custom

App Hosting → **Adicionar domínio** → apontar DNS do cliente → aguardar cert.
Atualizar a URL do job do Scheduler se ele foi criado antes do domínio.

## 6.1 · E-mail de redefinição de senha (console) — FAZER DEPOIS DO DOMÍNIO

Sem estes 3 ajustes, o cliente recebe um e-mail **em inglês**, assinado *"Your
`<project-id>` team"*, e **a senha é trocada numa página do Google**
(`<project-id>.firebaseapp.com/__/auth/action`), com o domínio dele entrando só
como `continueUrl`. Medido na Infinity em 2026-07-30.

O app **já tem** a tela (`/reset-password` lê `oobCode` → `verifyPasswordResetCode`
→ `confirmPasswordReset`). O que falta é o Firebase mandar o link para ela:

1. **Authentication → Templates → Redefinição de senha → editar → "Personalizar
   URL de ação"** → `https://<dominio-do-cliente>/reset-password`.
   ⚠️ A URL de ação é **do projeto inteiro**, não do template. Hoje é seguro
   porque o app só usa `resetPassword` (não existe `sendEmailVerification` em
   lugar nenhum). **Se algum dia entrar verificação de e-mail, a tela precisa
   passar a olhar o `mode` da query** — senão o link de verificação cai numa tela
   que só sabe redefinir senha.
2. **Idioma do template** → Português. (É o `lang=en` que aparece na URL.)
3. **Configurações do projeto → Geral → "Nome exibido publicamente"** →
   marca do cliente. É daí que sai o `<project-id>` no corpo do e-mail.

Fica de fora por não ser configuração: o remetente
`noreply@<project-id>.firebaseapp.com`. Trocar exige **SMTP próprio**
(Authentication → Templates → configurações de SMTP) com domínio de envio do
cliente. Decisão comercial, não bloqueia o go-live.

## 7 · Smoke test de aceite (na instância nova, como o admin bootstrapado)

- [ ] Login + troca de senha forçada funcionam; sidebar mostra a MARCA do cliente (logo/título).
- [ ] `/casas`: criar casa manual → aparece; "Roster OTG"/"Sincronizar afiliados" NÃO existem (OTG-free).
- [ ] Import da planilha modelo em `/casas` → resultados aparecem no `/admin`; "Cadastrar na plataforma" cria afiliado nativo.
- [ ] Convite → auto-cadastro do afiliado → dashboard dele mostra só os próprios números.
- [ ] Comissão: configurar CPA/REV → log `config.update` na `/auditoria`.
- [ ] `/ranking`: gerar o dia com dados importados → entradas > 0; popup-lembrete chega no admin master.
- [ ] `POST /api/internal/daily-ranking` sem header → 401 (503 = secret faltando).
- [ ] **"Esqueci minha senha" com um e-mail REAL**: o link abre `/reset-password` no
      domínio do cliente (não em `firebaseapp.com`), o texto está em português e o
      remetente não expõe o `project-id`. Ver §6.1.

## Instância DEMO (P5.3 · fim-de-funil, acesso controlado)

A demo é uma instância OTG-free com dados FICTÍCIOS no projeto Firebase
**`affiliacore`** (o mesmo da landing — decisão 2026-07-07: a presença comercial
mora toda lá). Sem link público: o acesso é entregue a lead quente, com senha
rotativa. Difere do playbook padrão em 3 pontos: **Blaze**, **rules mescladas**
e **seed**.

1. **Plano Blaze** no projeto `affiliacore` (App Hosting exige; custo ~zero com
   `minInstances: 0`). Console → Configurações → Uso e faturamento.
2. **Authentication** → ativar **E-mail/senha** (os logins demo usam Auth).
   Storage é opcional (só p/ upload de logo de casa nova; a demo semeia sem).
3. **Registrar um app Web** no projeto (o App Hosting injeta o
   `FIREBASE_WEBAPP_CONFIG` a partir dele).
4. **Rules MESCLADAS** (instância + bloco `leads` da landing — mesmo banco!):
   ```bash
   node scripts/provision/build-affiliacore-rules.cjs
   firebase deploy --config firebase.affiliacore.json --project www --only firestore
   ```
   NUNCA deployar o `firestore.rules` raiz no projeto affiliacore (apagaria o
   bloco leads); sempre que o `firestore.rules` mudar, regenerar + re-deployar.
5. **Service account**: console → Contas de serviço → gerar chave →
   `service-account.affiliacore.json` (NÃO commitar).
6. **Secrets** (só os dois; os OTG são neutralizados pelo `apphosting.demo.yaml`):
   ```bash
   firebase apphosting:secrets:set firebase-service-account-key --project affiliacore
   firebase apphosting:secrets:set ranking-cron-secret --project affiliacore
   ```
7. **Backend** (`firebase apphosting:backends:create --project affiliacore`,
   repo `spanol/affiliacore`, branch `main`) + associar o ambiente **`demo`** no
   console (Settings → Environment). 1º rollout → conferir marca "AffiliaCore
   Demo" + tema ember + `/casas` VAZIO (sem Superbet/SportingBet fantasma).
8. **Seed** (imprime as 3 senhas UMA vez — admin/afiliado/especial):
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.affiliacore.json \
     node scripts/provision/seed-demo.cjs
   ```
   O script tem GUARD de projeto (só roda no `affiliacore`) e protege `leads`.
   Validar a matemática sem Firebase: `node scripts/provision/seed-demo.cjs --plan`.
9. **Smoke da demo** (como demo@affiliacore.com.br):
   - [ ] `/admin` com preset **"Últimos 30 dias"** = números do mock da LP
         (comissão R$ 24.831,90 · 38 afiliados · funil 1.204/312/187 · card
         "Total depositado" no lugar de "Total CPA").
   - [ ] `/ranking` → gerar o dia → pódio com ≥10 afiliados.
   - [ ] Portal do afiliado (afiliado@...) mostra SÓ os números do Yago; sino
         com aviso + notificação.
   - [ ] `/network` do especial (especial@...) com a sub-rede de 3.
   - [ ] `/auditoria` populada; `/casas` com as 3 casas manuais.
   - [ ] Form da landing (affiliacore.com.br) SEGUE gravando lead (rules
         mescladas) — testar e LIMPAR o lead de teste (confirmando via console).
10. **Operação com leads**: entregar as credenciais por canal seguro; depois de
    cada lead, `--rotate` (troca senhas + revoga sessões); periodicamente
    `--wipe --yes` (reseta dados fictícios E o rastro do lead: convites,
    auditoria, casas criadas...). Cron do ranking é opcional (o admin gera pelo
    botão); se quiser, seguir o §5 do playbook padrão.

### Preview LOCAL da demo (sem provisionar nada — validado 2026-07-08)

Roda a demo completa nos EMULADORES (Firestore+Auth): nenhum projeto real é
tocado. Requer firebase CLI + Java (mesma dependência do `npm run test:rules`).

**Desde 2026-08-08 é o `npm run dev` padrão** (`scripts/dev-demo.mjs`): sobe os
emuladores, seeda a demo (imprime as senhas dos 3 logins e salva em
`.demo-runtime/affiliacore/latest-demo-credentials.txt`) e inicia o app em
http://localhost:3123 — tudo num comando, morre junto no Ctrl+C.

```bash
npm run dev                 # emuladores + seed + app demo (porta 3123; PORT=xxxx muda)
DEMO_RESEED=1 npm run dev   # emulador já ativo? reseeda do zero (--wipe)
DEMO_FULL=1 npm run dev     # demo GIGANTE p/ gravação: roda também o seed-demo-extras.cjs
```

Com os emuladores JÁ ativos, um restart do `npm run dev` NÃO re-seeda (preserva
o que você criou testando) — o reseed é opt-in via `DEMO_RESEED=1`.

**`DEMO_FULL=1` (demo gigante, p/ reels/screenshots):** além do seed base, roda
`scripts/provision/seed-demo-extras.cjs` — +95 afiliados, +3 casas (KTO, Novibet,
Vai de Bet), carteira (perfis PIX + saques em todos os status), marketplace
(acordos + parcerias + links com cliques), jurídico versionado, contatos,
mensagens diretas e 10 dias de histórico de ranking. O headline sobe p/ centenas
de milhares (SAI dos números exatos do mock da LP — p/ voltar à demo fiel,
`DEMO_RESEED=1` sem `DEMO_FULL`). O extras é idempotente (limpa e refaz o que é
dele) e SÓ roda contra emulador (aborta sem `FIRESTORE_EMULATOR_HOST`). O
`npm run dev` também liga `VITE_MARKETPLACE_ENABLED=true` na demo, senão as
telas de Acordos/Parcerias/Meus Links nem aparecem.

A receita manual equivalente (o que o script faz por baixo — útil p/ depurar um
passo isolado) é: `firebase emulators:start --only firestore,auth --project
affiliacore`, depois `node scripts/provision/seed-demo.cjs` e `npm run
dev:server`, ambos com o ambiente demo (`FIRESTORE_EMULATOR_HOST`,
`FIREBASE_AUTH_EMULATOR_HOST`, `GCLOUD_PROJECT`/`GOOGLE_CLOUD_PROJECT=affiliacore`,
`FIREBASE_WEBAPP_CONFIG` demo-local, `VITE_USE_EMULATORS=true`,
`VITE_OTG_ENABLED=false`, marca demo e credenciais reais vazias — os valores
exatos vivem em `scripts/dev-demo.mjs`).

Notas: `VITE_USE_EMULATORS` liga o wiring dev-only de `src/lib/firebase.ts`;
os `GOOGLE_APPLICATION_CREDENTIALS=''`/`FIREBASE_SERVICE_ACCOUNT_KEY=''` vazios
impedem o dotenv de apontar o Admin SDK pro projeto da instância 0; no preset
"Últimos 30 dias" o /admin bate EXATO com o mock da LP no dia do seed.
`npm run dev:server` é o servidor CRU (o antigo `npm run dev`): usa o `.env`
como estiver — ou seja, aponta pro projeto REAL configurado; use consciente.

## Notas

- **Nunca** editar `firebase-applet-config.json` por cliente — é fallback de dev.
- Atualização das instâncias: todo push na `main` rebuilda TODOS os backends
  conectados (é o modelo: 1 código, N instâncias). Mudança arriscada → branch +
  merge acompanhado (ver CLAUDE.md/memória).
- Dados de teste do smoke: LIMPAR e confirmar via query (regra da casa).
