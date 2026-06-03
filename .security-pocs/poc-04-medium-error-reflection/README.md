# PoC-04 — MEDIUM: proxy reflete corpo de erro bruto da API externa

> Finding: [SECURITY-AUDIT.md → MEDIUM](../../SECURITY-AUDIT.md) · `server.ts:638-654`
> CWE-209 (Information Exposure Through Error Message) · OWASP A05:2021 · CVSS 5.3

## A vulnerabilidade (1 parágrafo)

No proxy `/api/external/:endpoint`, em caso de erro upstream o servidor devolve ao
cliente o **corpo bruto da resposta do parceiro**:
`details: responseBody?.details || responseBody || responseText`. Isso expõe a um
afiliado comum autenticado mensagens internas, estrutura da API, host de banco,
fragmentos de stack e até dicas sobre a credencial — informação útil para abuso da
chave do parceiro (ver HIGH-1).

## Pré-requisitos

Nenhuma dep extra (`express` já está no projeto). O `vulnerable-proxy.mjs` é uma
**réplica fiel** do bloco `server.ts:638-654`, isolada para não exigir Firebase
Admin/auth — a lógica de reflexão de erro é idêntica à de produção.

## Como rodar

Em terminais separados (ou background):

```bash
# 1) sobe o upstream falso que devolve erro com detalhes internos
node .security-pocs/poc-04-medium-error-reflection/mock-upstream.mjs

# 2) sobe o proxy VULNERÁVEL apontando para o upstream falso
node .security-pocs/poc-04-medium-error-reflection/vulnerable-proxy.mjs

# 3) dispara o ataque
bash .security-pocs/poc-04-medium-error-reflection/exploit-request.sh
```

Para validar o patch, reinicie o proxy com `PATCHED=1`:

```bash
PATCHED=1 node .security-pocs/poc-04-medium-error-reflection/vulnerable-proxy.mjs
bash .security-pocs/poc-04-medium-error-reflection/exploit-request.sh
```

## Output esperado

Ver [`expected-output.txt`](./expected-output.txt). Vulnerável: a resposta inclui
`internal_query`, `upstream_host`, `stack`, `echoed_api_key_hint`. Patched: só
`{ error, requestId }`.

## Como confirmar o exploit

O JSON recebido via `curl` (cliente) contém os campos internos do `details`.
Em produção, qualquer afiliado autenticado pode forçar esse erro e ler isso.

## Como verificar que o patch bloqueia

Com `PATCHED=1`, o proxy loga o `responseText` cru **no servidor** e devolve ao
cliente apenas um erro genérico + `requestId`. O patch real no `server.ts` é
substituir o objeto de erro por `{ error: 'genérico', requestId }` e nunca
repassar `responseBody`/`responseText`.

> **Status:** PoC ready (sem emulator, sem chave real). ~10 s.
