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
# conectar o repo GitHub spanol/boost-afiliiados, branch main, região us-east4
```

Config por instância: criar `apphosting.<backend-id>.yaml` no repo (override do
`apphosting.yaml` base — o App Hosting escolhe pelo id do backend):

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
  - variable: FIREBASE_STORAGE_BUCKET
    value: '<project-id>.firebasestorage.app'
    availability: [RUNTIME]
```

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

## Notas

- **Nunca** editar `firebase-applet-config.json` por cliente — é fallback de dev.
- Atualização das instâncias: todo push na `main` rebuilda TODOS os backends
  conectados (é o modelo: 1 código, N instâncias). Mudança arriscada → branch +
  merge acompanhado (ver CLAUDE.md/memória).
- Dados de teste do smoke: LIMPAR e confirmar via query (regra da casa).
