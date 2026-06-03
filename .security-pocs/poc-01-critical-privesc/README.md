# PoC-01 — CRITICAL: Privilege escalation via self-created `users/{uid}`

> Finding: [SECURITY-AUDIT.md → CRITICAL](../../SECURITY-AUDIT.md) · `firestore.rules:23-31`
> CWE-269 / CWE-639 · OWASP A01:2021 · CVSS 9.8

## A vulnerabilidade (1 parágrafo)

A regra `match /users/{userId} { allow create: if request.auth.uid == userId; }`
permite que **qualquer conta autenticada grave o próprio documento de usuário com
`role: 'admin'`** — não há restrição sobre o campo `role`. Como `isAdmin()` (nas
rules) e os middlewares `requireAdmin` (no `server.ts`) derivam o papel **lendo
`users/{uid}.role`**, um valor controlado pelo atacante, basta criar uma conta no
Firebase Auth e gravar um doc forjado para obter **takeover total**: leitura de
todas as coleções e, via endpoints admin do Express, vazamento de **toda a PII de
pagamento** (PIX, CPF/CNPJ, endereço) de qualquer afiliado.

## Pré-requisitos

```bash
# (1) deps — ver ../setup/package.json.deps.md
npm i -D @firebase/rules-unit-testing firebase-tools

# (2) emulators ligados — ver ../setup/firebase.json.patch.md
firebase emulators:start --only auth,firestore --project demo-boost

# (3) dados fictícios (cria payment_profiles/AFF-1001 com PII falsa)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
node .security-pocs/setup/seed-emulator.mjs
```

## Como rodar

### Opção A — script end-to-end (`exploit.mjs`)

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-boost \
node .security-pocs/poc-01-critical-privesc/exploit.mjs
```

Executa signup → `setDoc role:admin` → leitura de `payment_profiles/AFF-1001`,
imprimindo a PII vazada. (~3 s)

### Opção B — teste de rules formal (`rules-unit-test.spec.ts`)

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
npx vitest run .security-pocs/poc-01-critical-privesc/rules-unit-test.spec.ts
```

Carrega as **regras reais** (`firestore.rules`) e as **patched**
(`firestore.patched.rules`) e prova ambos os lados. (~5 s)

## Output esperado

Ver [`expected-output.txt`](./expected-output.txt). Resumo:
- **Vulnerável:** `setDoc role:admin` → SUCESSO; leitura de PII → SUCESSO.
- **Patched:** `setDoc role:admin` → `permission-denied`; criar como `client` → OK.

## Como confirmar o exploit

O passo `[2]` do `exploit.mjs` imprime **`-> SUCESSO`** e o passo `[3]` despeja o
JSON com `pixKey`/`cpfCnpj`. No spec, os 2 testes do grupo *VULNERABLE* passam.

## Como verificar que o patch bloqueia

Copie o patch sobre o arquivo real e re-rode:

```bash
cp .security-pocs/poc-01-critical-privesc/firestore.patched.rules firestore.rules
# reinicie o emulator (ele recarrega as rules) e rode de novo o exploit.mjs
```

Agora `[2]` falha com `permission-denied`. No spec, o grupo *PATCHED* fica verde —
o ataque é negado **e** o signup legítimo (`role:'client'`) continua funcionando.

> **Fix estrutural recomendado** (além do patch de rules): mover o papel para
> **Firebase custom claims** (`request.auth.token.role == 'admin'`), tirando a
> fonte de verdade do alcance de escrita do usuário.
