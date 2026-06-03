# PoC-05 — MEDIUM: endpoints públicos sem rate limiting

> Finding: [SECURITY-AUDIT.md → MEDIUM](../../SECURITY-AUDIT.md) · `server.ts:445, 474` · `firestore.rules:60-63`
> CWE-770 / CWE-307 · OWASP A04:2021 · CVSS 5.3

## A vulnerabilidade (1 parágrafo)

Não há `express-rate-limit` nem captcha nas rotas públicas. `POST /api/accept-invite`
cria **usuários reais no Firebase Auth** e `contacts` aceita escrita anônima ilimitada
(`allow create: if true`). Os tokens de convite são fortes (24 bytes), então
brute-force de token é inviável — mas a ausência de qualquer limite permite spam de
formulário (custo/poluição do Firestore) e enumeração de e-mails já cadastrados
(resposta 409 distinta de 404), além de marteladas automatizadas contra os endpoints
de auth.

## Pré-requisitos

- Para o lado **vulnerável**: o dev server local rodando (`npm run dev`, porta 5000).
  Tokens usados são inválidos → **nenhum usuário real é criado** (o endpoint rejeita
  antes do `createUser`). **Aponte só para localhost** (o script recusa outros hosts).
- Para o lado **patched**: nenhuma dep extra (o demo traz um limiter mínimo
  equivalente a `express-rate-limit`).

## Como rodar

```bash
# VULNERÁVEL — contra o dev server atual
npm run dev   # noutro terminal (porta 5000)
node .security-pocs/poc-05-medium-no-ratelimit/flood.mjs

# PATCH — sobe o demo com rate limit e floda ele
node .security-pocs/poc-05-medium-no-ratelimit/patched-endpoint-demo.mjs   # porta 5001
TARGET=http://localhost:5001/api/accept-invite node .security-pocs/poc-05-medium-no-ratelimit/flood.mjs
```

## Output esperado

Ver [`expected-output.txt`](./expected-output.txt). Vulnerável: `429 = 0` (todos
processados). Patched: ~90/100 viram `429`.

## Como confirmar o exploit

A linha final imprime `0 rate-limited (VULNERÁVEL)` e 100 requests concluem em ~2s.
Nenhum freio existe — o atacante repete isso contra `contacts` (sem auth) para
inflar custo/poluir o painel admin.

## Como verificar que o patch bloqueia

Floda o `patched-endpoint-demo.mjs`: após o teto (10/min/IP) o servidor responde
`429`. O patch real no `server.ts`:

```ts
import rateLimit from 'express-rate-limit';
const publicLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true });
app.get('/api/invites/:token', publicLimiter, ...);
app.post('/api/accept-invite', publicLimiter, ...);
```
+ App Check/reCAPTCHA no formulário de contato e validação de tamanho de campos
em `contacts` nas rules.

> **Status:** requires local dev server (vulnerável) / PoC ready (patched demo). ~5 s.
