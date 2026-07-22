---
name: provision-instance
description: Provisiona uma instância white-label nova da AffiliaCore de ponta a ponta — projeto Firebase → backend App Hosting (com IAM correto de primeira) → marca → rollout → admin do cliente + usuário de teste — na ordem que evita o retrabalho de IAM. Use ao onboardar um cliente novo ("nova instância", "novo cliente AffiliaCore", "provisionar o <cliente>").
---

# Provisionar instância white-label nova (AffiliaCore)

Runbook de orquestração. Detalhe exaustivo (yaml completo, cron, domínio, smoke de
aceite): `scripts/provision/README.md` — **fonte canônica**. Precedente real e
lições: memória `infinity-onboarding` + `scripts/provision/infinity-onboarding-checklist.md`.

Modelo: **1 repo/`main` p/ todos, 1 projeto Firebase por cliente**, config por envs
(nunca fork/branch por cliente). Preencha os placeholders antes de começar:

| placeholder | ex. | onde entra |
|---|---|---|
| `<cliente>` | `alfa` | slug do ambiente/backend/pasta de assets |
| `<project-id>` | `alfa-affiliacore` | projeto Firebase |
| `<Marca>` / `<Curto>` | `Agência Alfa` / `Alfa` | `VITE_BRAND_NAME`/`_SHORT` |
| `<accent>` | `#8332B9` | `VITE_BRAND_ACCENT` |
| admin do cliente | `admin@alfa.com` | login do cliente |
| seu teste | `voce@alfa.com` | smoke test da AffiliaCore |

## Fronteiras (não cruzar)

- **Credencial é do operador.** Gerar/baixar a service account e colar secret é ele.
  Eu NUNCA gero/baixo chave-raiz nem digito senha em campo. Eu rodo o bootstrap (que
  gera as senhas sozinho) e **APAGO a chave depois**, confirmando via query.
- **Verificação é por REST/CLI**, não logando na UI com senha.
- **Push na `main` rebuilda TODAS as instâncias** (a Boost do Carlos inclusa). Janela
  arriscada → branch + merge acompanhado (memória `boost-branch-for-risky-windows`).

## Ordem (faz o backend certo de primeira → sem o fiasco de IAM da Infinity)

### A · Operador (console) — me avise ao concluir
1. Firebase → **Adicionar projeto** `<project-id>`, plano **Blaze** (App Hosting exige).
2. **Authentication** → ativar **E-mail/senha**.
3. **Firestore** em `southamerica-east1` + **Storage** (logos das casas).
4. Registrar **app Web** (o build injeta o `FIREBASE_WEBAPP_CONFIG` dele — anote o **App ID**).
5. Configurações → Contas de serviço → **Gerar chave** → salvar como
   `service-account.<cliente>.json` na raiz do repo (o `.gitignore` já cobre
   `service-account*.json`).

### B · Eu (CLI) — infra, com o IAM certo desde já
```bash
firebase deploy --only firestore:rules --project <project-id>

# Único secret real da instância OTG-free (os OTG são neutralizados no yaml, passo C):
firebase apphosting:secrets:set ranking-cron-secret --project <project-id>   # cole alta-entropia

# Backend criado pela CLI JÁ COM o bootstrap de IAM (é a chave p/ não repetir a Infinity):
firebase apphosting:backends:create --project <project-id> \
  --backend <cliente>-server --primary-region us-east4 --app <App ID> --non-interactive

firebase apphosting:secrets:grantaccess ranking-cron-secret \
  --backend <cliente>-server --location us-east4 --project <project-id>
```
**Confirme o IAM ANTES de gastar build:** console → IAM → marcar *"Incluir concessões
de papel fornecidas pelo Google"* (sem isso a lista MENTE) → a SA
`firebase-app-hosting-compute@<project-id>` tem `Executor do Compute no Firebase App
Hosting` (`firebaseapphosting.computeRunner`)? Se só houver 1 papel → **apague e recrie
o backend** pelos comandos acima (refaz o IAM inteiro). NUNCA conceda papel a papel.

### C · Eu (repo) — marca + config
- `apphosting.<cliente>.yaml`: copiar de **`apphosting.infinity.yaml`** (já é o molde
  OTG-free com os secrets OTG neutralizados `value: 'unused'`). Trocar: `VITE_BRAND_NAME`/
  `_SHORT`/`_ACCENT`, `FIREBASE_STORAGE_BUCKET`, `MASTER_ADMIN_EMAIL`, e
  `VITE_BRAND_LOGO_URL`/`_FAVICON_URL` → `/<cliente>/logo.svg` / `/<cliente>/favicon.svg`.
- Marca visual em **`public/<cliente>/`** — 4 arquivos:
  - `logo.svg` **MONO BRANCO obrigatório** (o app aplica `invert dark:invert-0`;
    colorir faz a cor virar verde no tema claro).
  - `favicon.svg` colorido (favicon não sofre invert).
  - `logo-color-dark.svg` / `logo-color-light.svg` (marketing/social/documento).
  - Se o cliente entregar o vetor oficial, usar o dele. Senão desenhar da referência
    (avatar/site) e **conferir por render**: `@resvg/resvg-js` → PNG nos tamanhos reais
    (28px header, 30px sidebar, tema claro invertido, favicon 32/16) antes de fechar.
- Commitar na `main` (é só config; não afeta as outras instâncias).

### D · Ligar o backend (console — posso dirigir pelo Chrome MCP)
- **Settings → Environment → `<cliente>`** (sem associar, o backend usa só o base →
  sobe com a marca AffiliaCore e os secrets OTG quebrados).
- **Deployment** → conectar conta/repo `spanol/affiliacore`, branch `main`, raiz `/`.

### E · Rollout
Push na `main` (ou console → "Criar lançamento"). Monitorar a URL até **HTTP 200**.
Falhou? Abrir o log do Cloud Build: `logWriter` / `developerconnect` / `misconfigured-
secret` = IAM/secret (voltar ao B); erro de TS/build = build de verdade.

### F · Admins — 1 comando, os dois de uma vez (após a chave estar na raiz)
```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.<cliente>.json \
  node scripts/provision/bootstrap-admin.cjs \
    --email admin@<cliente>.com --name "Admin <Marca>" \
    --test-user voce@<cliente>.com --test-name "AffiliaCore (teste)"
```
Imprime as **2 senhas UMA vez**: admin do cliente (troca no 1º login) + teste
AffiliaCore (entra direto). Repassar por canal seguro. **Depois:**
`rm service-account.<cliente>.json` e confirmar que sumiu (não é preciso em runtime —
a produção usa ADC).

### G · Verificação (REST/CLI, sem logar na UI)
Com a `apiKey` do app Web (`firebase apps:sdkconfig WEB --project <project-id>`):
1. `signInWithPassword` com o admin → pegar `idToken`.
2. Ler `users/{uid}` (perfil — é o que destrava o app no login) **e** uma coleção
   admin-only (`affiliate_configs`) sob as rules reais → ambos OK = rules certas + isAdmin.
3. OTG-free: `GET /api/external/affiliates` autenticado → **503 `OTG_DISABLED`**.
4. Tela: header/login com a marca do cliente (logo mono + accent).

## Gotchas

- **Recriar o backend ZERA** ambiente + conexão do repo + acesso aos secrets → refazer
  o D e o `secrets:grantaccess`.
- `admin@<cliente>.com` é **login interno** (domínio não recebe e-mail; sem verificação/
  recuperação por e-mail). Quer recuperação? usar e-mail real do cliente no `--email`.
- **Smoke completo do afiliado** (convite → portal) só depois que o cliente criar a 1ª
  casa manual + importar resultados. Checklist de aceite: `README.md` §7.
- **Apagar o `voce@<cliente>.com`** quando encerrar o smoke, se a instância vai ser
  entregue limpa (some só ele; o admin do cliente fica).
- Cron do ranking (Cloud Scheduler) e domínio custom: `README.md` §5 e §6.
