# Security Audit — Boost Afiliados
**Data:** 2026-06-02
**Escopo:** Estático white-box do branch atual (análise de código-fonte; sem scan ativo, sem requests, sem tocar infra de produção)
**Auditor:** CyberAgent
**Stack:** React 19 + Vite 6 + TS 5.8 + Express 4 + Firebase / Firebase Admin + @google/genai

---

## Sumário executivo

Auditadas todas as camadas (firestore.rules, Express/Admin SDK em `server.ts`, frontend React, integração Gemini, secrets/config, dependências e higiene de git). Foram identificados **11 findings**: **1 CRITICAL**, **2 HIGH**, **3 MEDIUM**, **4 LOW** e observações INFO.

O achado dominante é uma **escalada de privilégio trivial e remota (CRITICAL)**: a regra `match /users/{userId} { allow create: if request.auth.uid == userId }` permite que **qualquer pessoa que crie uma conta no Firebase Auth grave o próprio documento com `role: 'admin'`**. Como `isAdmin()` (rules) e os middlewares `requireAdmin` (server) confiam exatamente nesse documento controlado pelo atacante, isso resulta em **tomada total do sistema**: leitura/escrita de todas as coleções, criação de usuários e **vazamento de toda a PII de pagamento (chave PIX, CPF/CNPJ, endereço) de todos os afiliados** — incidente de LGPD.

**Top 3 ações urgentes:**
1. **Travar `role` no self-create das rules** para `'client'` e migrar o bootstrap de admin para fora do cliente (CRITICAL-1).
2. **Remover o prefixo `VITE_` da chave da API de parceiros e o fallback de fetch direto no client** (`affiliateService.ts`) — hoje a chave do parceiro pode ser embarcada no bundle do navegador (HIGH-1).
3. **Parar de refletir o corpo de erro bruto da API externa para o cliente** e padronizar tratamento de erro server-side (MEDIUM-1).

---

## Status de remediação (2026-06-02)

Correções aplicadas no código (commits `Sec:` na `main`). Validado: `tsc` limpo, 60
testes verdes, `npm run build` OK e bundle **sem** `x-api-key`/`GEMINI_API_KEY`/`VITE_AFFILIATE_API_KEY`.

| Finding | Status | Onde |
|---|---|---|
| CRITICAL-1 (privesc self-create admin) | ✅ Corrigido — **requer deploy de rules** | `firestore.rules` (create trava role 'client' + uid + sem affiliateId/isSpecial; update trava role+affiliateId) · `Register.tsx` (sempre 'client') |
| HIGH-1 (chave do parceiro no bundle) | ✅ Corrigido — **rotacionar a chave se já foi a build com `VITE_`** | `affiliateService.ts` (sem fetch direto/sem env no client) · `server.ts` (só `AFFILIATE_API_KEY`) · `.env.example` |
| HIGH-2 (fail-open → /admin) | ✅ Corrigido | `App.tsx` (fallback `/profile`) |
| MEDIUM-1 (reflexão de erro do upstream) | ✅ Corrigido | `server.ts` (erro genérico + `requestId`, log server-side) |
| MEDIUM-2 (sem rate limit / contacts aberto) | ✅ Corrigido (parcial) | `server.ts` (`express-rate-limit` em accept-invite/invites) · `firestore.rules` (contacts: shape + tamanho). **Follow-up:** App Check/captcha no formulário |
| MEDIUM-3 (`define` GEMINI no bundle) | ✅ Corrigido | `vite.config.ts` (define removido) |
| LOW (json limit + headers) | ✅ Corrigido (parcial) | `server.ts` (`helmet` + `express.json({limit:'32kb'})`). **Follow-up:** CSP com allowlist |
| LOW (contacts validation) | ✅ Corrigido | `firestore.rules` |
| LOW (PII em mensagem de erro) | ✅ Corrigido | `src/lib/firebase.ts` |
| LOW (`error.message` nos 500) | ⏳ Deferido | genericizar os ~13 handlers do `server.ts` |

**Ações operacionais pendentes (fora de código):**
1. **`firebase deploy --only firestore:rules`** — sem isso, a CRITICAL-1 segue explorável em produção.
2. **Rotacionar a `x-api-key`** do parceiro se ela já foi embarcada em algum build com prefixo `VITE_`.
3. **Restrições de API key** no GCP Console (HTTP referrers / APIs) — ver INFO.

**Deferidos (médio prazo):** CSP no helmet; migração de papel para **custom claims**
(`request.auth.token.role`) em vez de `users/{uid}.role`; genericizar `error.message`
nos handlers 500; App Check/reCAPTCHA no formulário de contato.

---

## Findings (ordem por severidade)

### CRITICAL — Escalada de privilégio: qualquer usuário cria a própria conta como `admin`

- **Arquivo:** `firestore.rules:23-31` (regra `create`) + `src/pages/Register.tsx:53-65` (fluxo cliente)
- **Descrição:** A regra de criação do doc de usuário é `allow create: if request.auth.uid == userId;` — **sem nenhuma restrição sobre o campo `role`**. O próprio código reconhece o débito (comentário "hardening TODO", linhas 19-22). `isAdmin()` nas rules e os middlewares `requireAuth`/`requireAdmin` em `server.ts:57-85` derivam o papel **lendo `users/{uid}.role`**, ou seja, um valor que o atacante controla. O `Register.tsx` define `role` no cliente (`'admin'` só para um e-mail hardcoded `carlos@carlossantos.org`), mas isso é puramente cosmético: o atacante não usa a UI React — usa o SDK/REST do Firebase diretamente (a config web é pública).
- **Cenário de exploit (concreto):**
  1. Atacante pega `firebase-applet-config.json` (commitado, público) → `apiKey`, `projectId`.
  2. `signUp` via Firebase Auth REST (`identitytoolkit.googleapis.com`) com um e-mail qualquer → recebe `idToken` + `localId` (uid).
  3. `setDoc`/REST Firestore: `documents/users/{uid}` com `{ role: "admin", uid: "{uid}" }`. A regra `create` passa (`request.auth.uid == userId`).
  4. A partir daí `isAdmin()` retorna `true`. O atacante: lê/escreve `users`, `affiliate_configs`, `special_affiliates`, `settings`; e com o `idToken` chama todos os endpoints `requireAdmin` do Express — incluindo **`GET /api/payment-profile/:affiliateId`** (chave PIX, CPF/CNPJ, nome legal, endereço de **qualquer** afiliado), `POST /api/create-user`, `POST /api/affiliates/sync`, `GET /api/audit-logs`.
- **Severidade:** Critical | CVSS 9.8 (AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H)
- **CWE / OWASP:** CWE-269 (Improper Privilege Management) / CWE-639 / OWASP A01:2021 (Broken Access Control)
- **Patch sugerido:**
  ```
  // firestore.rules — self-create só pode criar 'client', e não pode forjar campos de confiança
  match /users/{userId} {
    allow read:   if request.auth.uid == userId || isAdmin();
    allow list:   if isAdmin();
    allow create: if request.auth.uid == userId
                  && request.resource.data.role == 'client'
                  && request.resource.data.uid == userId
                  && !('affiliateId' in request.resource.data.keys())  // vínculo só via Admin SDK
                  && !('isSpecial' in request.resource.data.keys());
    allow update: if isAdmin()
                  || (request.auth.uid == userId
                      && request.resource.data.role == resource.data.role
                      && request.resource.data.affiliateId == resource.data.affiliateId);
    allow delete: if isAdmin();
  }
  ```
  Além disso: criar o **primeiro admin** fora do cliente (seed manual no console / Admin SDK / custom claims) e migrar a autorização para **custom claims** (`request.auth.token.role == 'admin'`) em vez de `get()` no doc de usuário — elimina a dependência de um documento mutável pelo usuário e reduz custo de leitura.

---

### HIGH — Chave da API de parceiros (`partnersotg.com`) exposta ao bundle do navegador

- **Arquivo:** `src/services/affiliateService.ts:45-46, 63-74` + `.env.example:16` (`VITE_AFFILIATE_API_KEY=`)
- **Descrição:** A chave da API externa é lida no **frontend** via `import.meta.env.VITE_AFFILIATE_API_KEY`. Tudo que tem prefixo `VITE_` é **embarcado no JS estático** servido a todos os navegadores. Pior: `fetchAffiliateApi()` tem um **fallback que chama a API do parceiro diretamente do browser** com `headers: { 'x-api-key': AFFILIATE_API_KEY }` (linhas 67-74) quando o proxy responde 404. O backend foi corretamente desenhado como proxy (`/api/external/...`, `server.ts:547`) justamente para esconder a chave — mas esse caminho client-side anula a proteção se a env estiver populada no build.
- **Cenário de exploit:** Build de produção com `VITE_AFFILIATE_API_KEY` setada → atacante abre DevTools / baixa `assets/index-*.js` → faz grep por `x-api-key` / pela string da chave → usa a credencial do parceiro fora da aplicação (acesso a dados de afiliados de toda a conta na `partnersotg`, possível custo/abuso). Mesmo com a env vazia hoje, a arquitetura é um landmine: qualquer dev que “preencher pra testar” vaza em produção.
- **Severidade:** High | CVSS 7.5
- **CWE / OWASP:** CWE-200 / CWE-522 (Insufficiently Protected Credentials) / OWASP A02:2021
- **Patch sugerido:**
  - Remover por completo `AFFILIATE_API_KEY` e o branch de fetch direto do `affiliateService.ts`; o cliente deve usar **somente** o proxy autenticado `/api/external/...`.
  - Renomear a env para **sem** prefixo `VITE_` (ex.: `AFFILIATE_API_KEY`) — o `server.ts` já a lê assim (`process.env.AFFILIATE_API_KEY`, linha 365/551). Manter `VITE_AFFILIATE_API_KEY` só convida ao vazamento.
  - Se a env já foi usada em algum build/deploy: **rotacionar a chave** junto ao parceiro.

### HIGH — Redirecionamento padrão para `/admin` quando o papel é desconhecido

- **Arquivo:** `src/App.tsx:125-135` (`DashboardRedirect`, `return <Navigate to="/admin" replace />`)
- **Descrição:** Se um usuário autenticado não tem `profile.role` resolvido, o roteador o manda para `/admin`. A rota `/admin` é protegida por `ProtectedRoute role="admin"` (defesa client-side) e os dados são protegidos por rules/servidor, então **não** é, por si só, um bypass de dados. Porém, é um *fail-open* de autorização: o default seguro deveria ser a área de menor privilégio. Combinado com a CRITICAL-1 (rules quebradas), reduz a margem de erro. Tratado como HIGH por ser fail-open de autz num app financeiro; cai para LOW assim que CRITICAL-1 e o backend de autz forem corrigidos.
- **Cenário de exploit:** Conta em estado inconsistente (Auth ok, doc users ausente/sem role) → UI carrega o shell de admin e dispara chamadas a endpoints admin; sem a CRITICAL-1 elas são barradas, mas o comportamento esperado deveria negar por padrão.
- **Severidade:** High | CVSS 6.5 (contextual)
- **CWE / OWASP:** CWE-636 (Not Failing Securely) / OWASP A01:2021
- **Patch sugerido:**
  ```tsx
  // fallback seguro: papel desconhecido => menor privilégio
  return <Navigate to="/profile" replace />;
  ```

---

### MEDIUM — Proxy reflete corpo de erro bruto da API externa para o cliente

- **Arquivo:** `server.ts:638-654` (`details: responseBody?.details || responseBody || responseText`)
- **Descrição:** Em caso de erro upstream, o proxy devolve ao cliente o corpo bruto da resposta do parceiro (`details`, `message`, `code`). Isso pode expor mensagens internas, estrutura da API, IDs e até fragmentos de credencial/headers ecoados pelo upstream a um usuário autenticado comum.
- **Cenário de exploit:** Afiliado comum chama `/api/external/results?...` forçando um erro (param inválido) e lê em `details` informação interna da API de parceiros (enumeração de comportamento/estrutura), útil para abuso da credencial caso ela vaze (ver HIGH-1).
- **Severidade:** Medium | CVSS 5.3
- **CWE / OWASP:** CWE-209 (Information Exposure Through Error Message) / OWASP A05:2021
- **Patch sugerido:** Logar `responseText` no servidor e devolver ao cliente apenas um erro genérico + `requestId`. Nunca repassar `responseBody`/`responseText` cru.

### MEDIUM — Endpoints públicos sem rate limiting (abuso / criação de contas)

- **Arquivo:** `server.ts:445` (`GET /api/invites/:token`), `server.ts:474` (`POST /api/accept-invite`), `firestore.rules:60-63` (`contacts allow create: if true`)
- **Descrição:** Não há `express-rate-limit` nem captcha. `POST /api/accept-invite` cria **usuários reais no Firebase Auth**; `contacts` aceita escrita anônima ilimitada. Tokens de convite têm 24 bytes (`crypto.randomBytes(24)`, server.ts:425) — fortes, então brute-force de token é inviável, mas a ausência de limite permite spam de formulário de contato (custo/poluição do Firestore) e tentativas automatizadas contra endpoints de auth.
- **Cenário de exploit:** Script dispara milhares de `create` em `contacts` (sem auth, sem limite de tamanho de campo) → inflar custo Firestore / poluir o painel admin; ou martelar `/api/accept-invite` para enumerar e-mails já cadastrados (resposta 409 distinta).
- **Severidade:** Medium | CVSS 5.3
- **CWE / OWASP:** CWE-770 (Allocation of Resources Without Limits) / CWE-307 / OWASP A04:2021
- **Patch sugerido:** Adicionar `express-rate-limit` por IP nas rotas públicas (`/api/accept-invite`, `/api/invites/:token`), App Check/reCAPTCHA no formulário de contato, e validar/limitar tamanho dos campos em `contacts`.

### MEDIUM — Chave Gemini injetada no bundle via `define` (footgun latente)

- **Arquivo:** `vite.config.ts:10-12` (`define: { 'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY) }`)
- **Descrição:** O Vite substitui literalmente qualquer ocorrência de `process.env.GEMINI_API_KEY` no código do cliente pelo valor real. Hoje **não há referência a essa variável no `src/`** nem uso de `@google/genai` no código (a dependência está no `package.json` mas não é importada) — portanto **a chave não está sendo vazada no momento**. Contudo, basta uma linha futura `new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY})` num componente para embarcar a chave no bundle.
- **Cenário de exploit:** Desenvolvedor adiciona chamada Gemini no front → chave Gemini servida a todos os navegadores → abuso/custo na conta Google AI.
- **Severidade:** Medium | CVSS 4.8 (latente)
- **CWE / OWASP:** CWE-522 / OWASP A05:2021
- **Patch sugerido:** Remover o `define`. Toda chamada ao Gemini deve viver no backend (`server.ts`) com `process.env.GEMINI_API_KEY` lido em runtime no servidor, exposto via endpoint autenticado.

---

### LOW — `express.json()` sem limite explícito e ausência de cabeçalhos de segurança

- **Arquivo:** `server.ts:33` (`app.use(express.json())`)
- **Descrição:** Sem `{ limit: '...' }` (default Express ~100kb — ok, mas não explícito) e sem `helmet` (faltam CSP, `X-Content-Type-Options`, `Referrer-Policy`, HSTS). App financeiro deveria endurecer headers.
- **Severidade:** Low | CWE-693 (Protection Mechanism Failure) / OWASP A05:2021
- **Patch:** `app.use(express.json({ limit: '32kb' }))` + `app.use(helmet({ contentSecurityPolicy: {...} }))`.

### LOW — Formulário de contato anônimo sem validação de tamanho/conteúdo

- **Arquivo:** `firestore.rules:60-63` + `src/services/contactService.ts`
- **Descrição:** `allow create: if true` deixa o cliente controlar todos os campos do doc. Não há XSS armazenado (nenhum `dangerouslySetInnerHTML` em todo o `src/` — verificado), mas é vetor de spam/storage abuse e de injeção de conteúdo no painel admin.
- **Severidade:** Low | CWE-20 / OWASP A04:2021
- **Patch:** Restringir nas rules: campos permitidos, tipos e tamanho (`request.resource.data.keys().hasOnly([...])`, `size() < N`).

### LOW — `error.message` devolvido ao cliente nos handlers 500

- **Arquivo:** `server.ts` (vários: 131, 158, 178, 240, 263, 292, 321, 357, 410, 440, 469, 542, 659)
- **Descrição:** Padrão `res.status(500).json({ error: error.message })` pode vazar detalhes internos (mensagens do Admin SDK, paths). Sem stack trace, mas mensagens podem ser informativas demais.
- **Severidade:** Low | CWE-209 / OWASP A05:2021
- **Patch:** Mensagem genérica ao cliente + log server-side com correlação.

### LOW — `handleFirestoreError` serializa e relança e-mail/uid do usuário

- **Arquivo:** `src/lib/firebase.ts:36-57`
- **Descrição:** Em erro de permissão, monta um JSON com `email`, `uid`, `emailVerified` e o relança como `Error` (exibível na UI / `Register.tsx:68` mostra `firestoreErr.message`). É a PII do próprio usuário (impacto baixo), mas é dado sensível em mensagem de erro.
- **Severidade:** Low | CWE-209
- **Patch:** Não serializar PII na mensagem; logar separadamente.

---

### INFO — Observações / hardening

- **Firebase web `apiKey` commitado e rotacionado no histórico** (`firebase-applet-config.json`; histórico contém `AIzaSyAR...`, `AIzaSyAz8w...`, atual `AIzaSyBlb...`). Chaves web do Firebase são **identificadores públicos por design** — não são segredo. A real proteção é firestore.rules (ver CRITICAL-1). Recomenda-se aplicar **restrições de API key no Google Cloud Console** (HTTP referrers / APIs permitidas) para reduzir abuso.
- **`.gitignore` correto:** `.env*`, `service-account.json`, `*-firebase-adminsdk-*.json` ignorados; **nenhum `.env`/service-account no histórico** (verificado). Higiene de segredos boa.
- **Sem CORS middleware** em `server.ts` → same-origin only (comportamento seguro para este desenho).
- **Dependência `@google/genai` presente mas não utilizada** no `src/` — remover se não for usar, ou mover uso para o backend.
- **Pontos fortes observados (defesa server-side bem feita):** o proxy `/api/external` faz **escopo por afiliado no servidor** (own + sub-rede resolvida via `special_affiliates`, server.ts:562-594); `/api/special/sub-config` valida que o caller é o especial dono daquele sub antes de gravar via Admin SDK; PII de pagamento isolada em coleção server-only (`payment_profiles`) com rules `if isAdmin()`. O elo fraco é a confiança no doc `users` mutável (CRITICAL-1), que contamina toda essa cadeia.
- **`/api/special/sub-config` sem teto de comissão** (server.ts:107-128): é **decisão de negócio explícita do dono** (spread livre do afiliado especial), não vulnerabilidade técnica. Apenas registrar que não há limite servidor-side.

---

## Cobertura

| Camada | Auditado | Observação |
|---|---|---|
| firestore.rules | ✅ integral | Cada `match` analisado |
| Express / Admin SDK (`server.ts`) | ✅ integral | Todas as rotas e middlewares |
| Frontend React (`src/`) | ✅ | Rotas/guards, auth context, services, env usage, XSS (`dangerouslySetInnerHTML` = 0 ocorrências) |
| Integração Gemini | ✅ | Não usada no código; risco só no `define` do Vite |
| Secrets / Config | ✅ | `.env.example`, `vite.config.ts`, `firebase-applet-config.json`, `.gitignore` |
| Dependências | ✅ leve | Versões recentes (express 4.22, firebase 12, admin 13, vite 6) — sem CVE conhecida relevante no cutoff; **sem `npm audit` ativo** |
| Git hygiene | ✅ | `git log -S` por `.env`/service-account/`AIza`/`sk_live` |
| **NÃO auditado** | — | Scan dinâmico/runtime, testes de penetração ativos contra produção, `npm audit` real, lógica de negócio financeira detalhada, conteúdo de `node_modules` |

---

## Quick wins (top 5 — corrigíveis em 1 dia)

1. **(CRITICAL-1)** Travar `role == 'client'` no `allow create` das rules de `users/` e remover a capacidade de auto-virar admin; semear o primeiro admin manualmente. *(15 min de edição + deploy de rules)*
2. **(HIGH-1)** Excluir `AFFILIATE_API_KEY`/fetch direto do `affiliateService.ts` e renomear a env para sem prefixo `VITE_`; rotacionar a chave do parceiro se já usada em build.
3. **(MEDIUM-1)** Parar de repassar `details/responseBody/responseText` da API externa no proxy — devolver erro genérico.
4. **(MEDIUM-2)** Adicionar `express-rate-limit` em `/api/accept-invite` e `/api/invites/:token`, e App Check/captcha + validação de campos no `contacts`.
5. **(MEDIUM-3 + LOW)** Remover o `define` da `GEMINI_API_KEY` do `vite.config.ts` e adicionar `helmet` + `express.json({ limit })` no `server.ts`.

> **Migração estrutural recomendada (médio prazo):** mover a autorização de papel para **Firebase custom claims** (`request.auth.token.role`) em vez de ler `users/{uid}.role`. Remove a superfície da CRITICAL-1 na raiz, elimina `get()` por checagem (custo) e centraliza a fonte de verdade do papel no Auth, fora do alcance de escrita do usuário.
