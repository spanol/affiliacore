# Security PoCs — Boost Afiliados

Provas de conceito **executáveis** das vulnerabilidades do
[`../SECURITY-AUDIT.md`](../SECURITY-AUDIT.md). Auditoria autorizada pelo dono do
projeto.

> ## ⚠️ NUNCA RODE CONTRA PRODUÇÃO
> Todas as PoCs rodam contra **Firebase Emulator** (`localhost:9099` / `localhost:8080`)
> ou servidores **locais** (Express em `localhost`). Os scripts têm salvaguardas que
> recusam rodar sem `FIRESTORE_EMULATOR_HOST` setado ou contra hosts que não sejam
> localhost, e usam `projectId` fictício `demo-boost`. **Não** crie usuários reais,
> **não** escreva docs em `agencia-boost-app`, **não** chame `/api/*` de deploy.

---

## Índice das PoCs

| # | Finding | Severidade | Status | Tempo | Prova |
|---|---------|-----------|--------|-------|-------|
| [01](./poc-01-critical-privesc/) | Privilege escalation via self-create `users/{uid}` com `role:admin` | 🔴 CRITICAL (9.8) | requires emulator | ~10s | Atacante vira admin e lê PII de pagamento |
| [02](./poc-02-high-vite-apikey-leak/) | `VITE_AFFILIATE_API_KEY` embarcada no bundle | 🟠 HIGH (7.5) | PoC ready | ~2min | Chave aparece em `dist/assets/*.js` |
| [03](./poc-03-high-fail-open-redirect/) | Fail-open redirect → `/admin` | 🟠 HIGH (6.5) | PoC ready | ~5s | `profile:null` cai em ADMIN AREA |
| [04](./poc-04-medium-error-reflection/) | Proxy reflete erro bruto do upstream | 🟡 MEDIUM (5.3) | PoC ready | ~10s | Cliente recebe query/host/stack internos |
| [05](./poc-05-medium-no-ratelimit/) | Endpoints públicos sem rate limit | 🟡 MEDIUM (5.3) | requires local dev server | ~5s | 100 req, 0 × 429 |
| [06](./poc-06-medium-gemini-define-footgun/) | `define` injeta `GEMINI_API_KEY` no bundle | 🟡 MEDIUM (4.8) | PoC ready | ~2min | Chave fake aparece em `dist/` |

**Status legend:** `PoC ready` = só precisa do projeto + Node · `requires emulator` =
precisa do Firebase Emulator · `requires local dev server` = precisa `npm run dev`.

Nenhuma PoC exige a chave real do parceiro (`partnersotg`). A PoC-04 simula o
upstream com um mock.

---

## Setup-from-zero (~10 min)

### 1. Instalar deps adicionais

```bash
cd D:/code/boost-afiliiados
npm i -D @firebase/rules-unit-testing firebase-tools
```
Detalhes: [`setup/package.json.deps.md`](./setup/package.json.deps.md).

### 2. Habilitar os emulators

Edite o `firebase.json` (ou use um arquivo separado) conforme
[`setup/firebase.json.patch.md`](./setup/firebase.json.patch.md).

### 3. Subir os emulators (para a PoC-01)

```bash
firebase emulators:start --only auth,firestore --project demo-boost
```

### 4. Rodar as PoCs (ordem sugerida)

```bash
# Variáveis de ambiente p/ scripts que falam com o emulator (PoC-01)
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export GCLOUD_PROJECT="demo-boost"

# PoC-01 (CRITICAL) — seed + exploit + teste de rules
node .security-pocs/setup/seed-emulator.mjs
node .security-pocs/poc-01-critical-privesc/exploit.mjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run \
  .security-pocs/poc-01-critical-privesc/rules-unit-test.spec.ts

# PoC-02 (HIGH) — leak no bundle
bash .security-pocs/poc-02-high-vite-apikey-leak/reproduce.sh

# PoC-03 (HIGH) — fail-open redirect
npx vitest run .security-pocs/poc-03-high-fail-open-redirect/component-test.spec.tsx

# PoC-04 (MEDIUM) — error reflection (2 servidores + curl)
node .security-pocs/poc-04-medium-error-reflection/mock-upstream.mjs &
node .security-pocs/poc-04-medium-error-reflection/vulnerable-proxy.mjs &
bash .security-pocs/poc-04-medium-error-reflection/exploit-request.sh

# PoC-05 (MEDIUM) — rate limit (precisa do dev server: npm run dev)
node .security-pocs/poc-05-medium-no-ratelimit/flood.mjs

# PoC-06 (MEDIUM) — Gemini define footgun (auto-revert)
bash .security-pocs/poc-06-medium-gemini-define-footgun/reproduce.sh
```

> No Windows, use **Git Bash** para os `.sh`, ou os equivalentes PowerShell
> indicados em cada README.

---

## O que cada PoC PROVA

- **PoC-01** → [CRITICAL](../SECURITY-AUDIT.md): que a regra `allow create: if request.auth.uid == userId`
  permite forjar `role:'admin'`, e que isso destrava leitura de `payment_profiles`
  (PIX/CPF/endereço). Inclui o **teste do patch** (role travado em `'client'`).
- **PoC-02** → [HIGH](../SECURITY-AUDIT.md): que qualquer valor `VITE_*` no build vira
  texto claro em `dist/`. Patch: build sem a env → sem leak.
- **PoC-03** → [HIGH](../SECURITY-AUDIT.md): que `DashboardRedirect` manda papel
  desconhecido para `/admin`. Patch: fallback `/profile`.
- **PoC-04** → [MEDIUM](../SECURITY-AUDIT.md): que o proxy repassa o corpo de erro
  bruto do upstream. Patch: erro genérico + `requestId`.
- **PoC-05** → [MEDIUM](../SECURITY-AUDIT.md): que não há `429` em endpoints
  públicos. Patch: `express-rate-limit` → `429` após o teto.
- **PoC-06** → [MEDIUM](../SECURITY-AUDIT.md): que o `define` do Vite inlina
  `GEMINI_API_KEY` assim que houver referência. Patch: remover o `define`.

---

## Limpeza

```bash
# parar emulators: Ctrl+C no terminal do firebase
# remover artefatos de build de PoC
rm -rf dist
# garantir que nenhum diff de PoC ficou aplicado
git status   # src/main.tsx deve estar limpo (PoC-06 reverte sozinho)
```
