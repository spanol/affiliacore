# Playbook · Nova instância white-label em 1 dia (P4)

> Provisiona uma instância COMPLETA para um cliente novo: mesmo repo/`main` para
> todos (NUNCA fork/branch por cliente), 1 projeto Firebase por cliente, config
> por instância via envs (`VITE_OTG_ENABLED`, `VITE_BRAND_*`) + secrets.
> Pré-requisitos na máquina do operador: Node 20+, `firebase-tools` (global),
> acesso de Owner ao novo projeto. Tempo alvo: ~2h de trabalho + esperas de build.

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

# 1º admin da instância (senha temporária forte + troca forçada no 1º login)
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
  node scripts/provision/bootstrap-admin.cjs --email admin@cliente.com --name "Nome do Admin"
```

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
  - variable: VITE_BRAND_ACCENT     # P3.1: cor de destaque da marca (1 hex; gera a
    value: '#E11D48'                # escala inteira + contraste WCAG em runtime)
    availability: [BUILD, RUNTIME]
  - variable: VITE_BRAND_SURFACE    # opcional: navy de superfície (login/hero)
    value: '#141C2A'
    availability: [BUILD, RUNTIME]
  - variable: VITE_BRAND_STYLE      # P3.2: 'glass' (default, look Boost) ou
    value: 'solid'                  # 'solid' (opaco, sem blur — corporativo)
    availability: [BUILD, RUNTIME]
  - variable: VITE_BRAND_CANVAS     # P3.3: matiz do canvas ESCURO (re-tinta a
    value: '#0f172a'                # ramp neutral-*; ausência = cinza neutro)
    availability: [BUILD, RUNTIME]
  - variable: VITE_BRAND_THEME      # P3.3: tema inicial sem preferência salva
    value: 'light'                  # ('light'|'dark'; ausência = SO)
    availability: [BUILD, RUNTIME]
  - variable: FIREBASE_STORAGE_BUCKET
    value: '<project-id>.firebasestorage.app'
    availability: [RUNTIME]
```

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

## 7 · Smoke test de aceite (na instância nova, como o admin bootstrapado)

- [ ] Login + troca de senha forçada funcionam; sidebar mostra a MARCA do cliente (logo/título).
- [ ] `/casas`: criar casa manual → aparece; "Roster OTG"/"Sincronizar afiliados" NÃO existem (OTG-free).
- [ ] Import da planilha modelo em `/casas` → resultados aparecem no `/admin`; "Cadastrar na plataforma" cria afiliado nativo.
- [ ] Convite → auto-cadastro do afiliado → dashboard dele mostra só os próprios números.
- [ ] Comissão: configurar CPA/REV → log `config.update` na `/auditoria`.
- [ ] `/ranking`: gerar o dia com dados importados → entradas > 0; popup-lembrete chega no admin master.
- [ ] `POST /api/internal/daily-ranking` sem header → 401 (503 = secret faltando).

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

## Notas

- **Nunca** editar `firebase-applet-config.json` por cliente — é fallback de dev.
- Atualização das instâncias: todo push na `main` rebuilda TODOS os backends
  conectados (é o modelo: 1 código, N instâncias). Mudança arriscada → branch +
  merge acompanhado (ver CLAUDE.md/memória).
- Dados de teste do smoke: LIMPAR e confirmar via query (regra da casa).
