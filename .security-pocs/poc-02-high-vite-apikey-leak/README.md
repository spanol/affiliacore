# PoC-02 — HIGH: `VITE_AFFILIATE_API_KEY` vaza no bundle do navegador

> Finding: [SECURITY-AUDIT.md → HIGH](../../SECURITY-AUDIT.md) · `src/services/affiliateService.ts:45-46, 63-74`
> CWE-200 / CWE-522 · OWASP A02:2021 · CVSS 7.5

## A vulnerabilidade (1 parágrafo)

`affiliateService.ts` lê a chave da API de parceiros via
`import.meta.env.VITE_AFFILIATE_API_KEY`. **Todo identificador com prefixo `VITE_`
é inlinado no JS estático** pelo Vite em build — ou seja, servido em texto claro a
qualquer navegador. Pior: `fetchAffiliateApi()` tem um **fallback que chama a API
do parceiro diretamente do browser** (`headers: { 'x-api-key': AFFILIATE_API_KEY }`)
quando o proxy responde 404. O backend já foi desenhado como proxy justamente para
esconder a chave; esse caminho client-side anula a proteção sempre que a env estiver
populada no build.

## Pré-requisitos

- Node/npm do projeto (nenhuma dep extra).
- `bash` (Git Bash no Windows) para o `reproduce.sh`. Alternativa PowerShell abaixo.

## Como rodar

```bash
bash .security-pocs/poc-02-high-vite-apikey-leak/reproduce.sh
```

Equivalente manual (ou PowerShell):

```powershell
# VULNERÁVEL
$env:VITE_AFFILIATE_API_KEY="FAKE_KEY_FOR_TEST_abc123xyz"; npm run build
Select-String -Path dist/assets/*.js -Pattern "FAKE_KEY_FOR_TEST_abc123xyz"

# PATCH (sem a env)
Remove-Item Env:VITE_AFFILIATE_API_KEY; npm run build
Select-String -Path dist/assets/*.js -Pattern "FAKE_KEY_FOR_TEST_abc123xyz"   # sem match
```

## Output esperado

Ver [`expected-output.txt`](./expected-output.txt). No 1º build a chave aparece em
`dist/assets/index-*.js`; no 2º (sem env) não há match.

## Como confirmar o exploit

`grep` encontra `FAKE_KEY_FOR_TEST_abc123xyz` dentro de um `.js` minificado em
`dist/`. Em produção, isso é exatamente o que um atacante faz: baixa o bundle,
extrai a chave e usa contra `affiliate-api-prd.partnersotg.com` fora do app.

## Como verificar que o patch bloqueia

Build sem a env → grep não acha (já demonstrado). O **fix de código** é remover a
const `AFFILIATE_API_KEY` e o branch de `fetch` direto do `affiliateService.ts`
(o cliente passa a usar **só** o proxy autenticado `/api/external/...`) e renomear
a env para **sem** prefixo `VITE_` — o `server.ts:551` já lê
`process.env.AFFILIATE_API_KEY`. Se a chave já foi usada em algum build/deploy,
**rotacionar** junto ao parceiro.

> Tempo: ~1–2 min (dois `vite build`). **Status:** PoC ready (não precisa emulator
> nem chave real — usa string fictícia).
