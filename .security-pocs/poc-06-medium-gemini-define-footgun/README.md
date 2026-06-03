# PoC-06 — MEDIUM: chave Gemini injetada no bundle via `define` (footgun latente)

> Finding: [SECURITY-AUDIT.md → MEDIUM](../../SECURITY-AUDIT.md) · `vite.config.ts:10-12`
> CWE-522 · OWASP A05:2021 · CVSS 4.8 (latente)

## A vulnerabilidade (1 parágrafo)

`vite.config.ts` tem `define: { 'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY) }`.
O Vite substitui **literalmente** qualquer ocorrência de `process.env.GEMINI_API_KEY`
no código do cliente pelo valor real em build. Hoje **não há** referência a essa
variável no `src/` (por isso é "latente"), mas basta uma linha futura —
`new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })` num componente — para
embarcar a chave Gemini no JS servido a todos os navegadores.

## Pré-requisitos

- `@google/genai` instalado (já está no `package.json`).
- `git` (o script aplica e reverte o `plant.diff` automaticamente).
- Working tree limpo em `src/main.tsx` (o script aplica/reverte um patch nele).

## Como rodar

```bash
bash .security-pocs/poc-06-medium-gemini-define-footgun/reproduce.sh
```

O script: aplica `plant.diff` (linha hipotética em `src/main.tsx`) → `npm run build`
com `GEMINI_API_KEY=AIzaSyDoTestFakeKeyABCDEF123` → `grep` no `dist/` → **reverte o
diff** (mesmo se falhar, via `trap`).

## Output esperado

Ver [`expected-output.txt`](./expected-output.txt). A chave fake aparece em
`dist/assets/index-*.js`; depois o diff é revertido.

## Como confirmar o exploit

`grep` encontra `AIzaSyDoTestFakeKeyABCDEF123` no bundle minificado — exatamente o
que um atacante extrai do navegador para abusar da conta Google AI (custo).

## Como verificar que o patch bloqueia

Remova o bloco `define` do `vite.config.ts` e re-rode: `process.env.GEMINI_API_KEY`
não tem valor para inlinar → o grep não acha nada. O fix definitivo é manter toda
chamada Gemini no **backend** (`server.ts`, lendo `process.env.GEMINI_API_KEY` em
runtime no servidor) e expor via endpoint autenticado.

> **Status:** PoC ready (sem emulator, sem chave real, auto-revert). ~1–2 min.
> ⚠️ Confirme que `src/main.tsx` voltou ao original ao terminar (`git status`).
