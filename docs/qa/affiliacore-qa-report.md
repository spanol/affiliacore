# Relatório de QA — AffiliaCore

**Checkpoint:** checkout WSL `/home/cspan/apps/affiliacore`

**Baseline:** `1644152`

**Escopo:** autenticação/MFA e senha, permissões/admin, regras Firestore, afiliados/resultados/comissão/saques, URL/link e XSS/validação de entrada. Não houve deploy, chamadas Firebase remotas, publicação ou mutação de conta.

## Resultado executivo

- **1 achado confirmado, corrigido e coberto por regressão:** URLs com esquema não HTTP(S), como `javascript:`, podiam ser persistidas por `POST /api/affiliate-links`; o endpoint público `/go/:code` então redirecionava para elas após acrescentar `subid`.
- A correção aceita apenas `http:`/`https:` na criação e antes do redirecionamento de registros legados. Destino inválido usa o fallback e não registra clique.
- Foram adicionados **2 testes comportamentais de integração**. A suíte evoluiu de **1.230 para 1.232 testes**.
- Cobertura global: **40,06% → 40,18%** (statements/linhas); `server.ts`: **69,98% → 70,54%**.

## Baseline (antes das alterações)

| Comando | Resultado |
|---|---|
| `npm run lint` | passou (`tsc --noEmit`) |
| `npm test` | passou: 89 arquivos, 1.230 testes |
| `npm run coverage` | passou: 40,06% statements/linhas; 78,83% branches; 76,41% funções. `server.ts`: 69,98% linhas |
| `npm run test:rules` | não executável: não havia `firebase` no `PATH` nem `node_modules/.bin/firebase`, portanto não foi iniciado emulador |
| `npm run build` | passou; aviso Vite: bundle `index` de 1.983,41 kB (511,66 kB gzip), acima do limite de alerta |

A cobertura baseline foi gerada por `npm run coverage` nesta execução — não foi inferida por timestamp de diretório `coverage/`.

## Revisão estática e evidências

### Achado confirmado

| Severidade | Achado | Evidência e resolução |
|---|---|---|
| Média — corrigida | Redirect/XSS por esquema de URL não permitido em links de divulgação | `POST /api/affiliate-links` convertia qualquer valor em string e o armazenava. `/go/:code` chamava `appendSubid` e `res.redirect` sem validar protocolo. A regressão reproduziu `javascript:alert(1)` persistido (201 em vez de 400) e redirecionado publicamente com `?subid=...`. A correção aplicou allowlist HTTP(S) na criação e no redirect; URL legada inválida recebe fallback `/` e não cria clique. |

**Evidência TDD (RED/GREEN):**

1. RED: `npx vitest run server.test.ts -t "rejeita destino com esquema não HTTP"` falhou como esperado: `expected 400 ... got 201`.
2. GREEN: após validar a entrada, o mesmo teste passou.
3. RED: `npx vitest run server.test.ts -t "destino legado com esquema"` falhou: recebeu `javascript:alert(1)?subid=...` em vez de `/`.
4. GREEN: após validar no `/go/:code`, ambos passaram juntos: 2 passados, 171 ignorados.

### Áreas revisadas sem vulnerabilidade reproduzível

- **MFA/senha:** gate de sessão `mfaSatisfied`, rotas TOTP, segredo `auth_totp`, normalização de e-mail e reset Firebase; há cobertura de TOTP, login, forgot/reset password e `AuthContext`.
- **Permissões/IDOR:** `requireAuth`, `requireAdmin`, proxy externo e `resolveScopedAffiliateIds`; testes de escopo e propriedade cobrem não-vazamento entre afiliados.
- **Firestore:** foram revisadas regras de `auth_totp`, `affiliate_configs`, `settings`, perfis de pagamento, links, saques, resultados e solicitações de premiação. Há 41 casos no spec de rules, pendentes apenas da execução no emulador.
- **Dados financeiros:** comissão/rede usam núcleos puros cobertos por testes unitários e de propriedade; saques são escopados a `affiliateId` e têm transições de domínio.
- **XSS/entrada:** busca estática não encontrou `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou `new Function` em `.ts/.tsx`. O único redirect público é `/go/:code`, agora com allowlist de esquema.

## Testes adicionados

Em `server.test.ts`:

1. `rejeita destino com esquema não HTTP antes de persistir o link`: admin recebe 400 para `javascript:alert(1)` e nenhum link é criado.
2. `destino legado com esquema não HTTP → fallback e NÃO registra clique`: `/go/:code` responde 302 para `/` e não grava `link_clicks` quando existe registro legado inválido.

São testes HTTP reais com `supertest` e o Firestore em memória já usado pela suíte; verificam comportamento, não detalhes internos.

## Validação final

| Comando | Resultado |
|---|---|
| `npm run lint` | passou |
| `npm test` | passou: **89 arquivos, 1.232 testes** |
| `npm run coverage` | passou: **40,18% statements/linhas; 78,72% branches; 76,45% funções**; `server.ts` **70,54%** linhas |
| `npm run build` | passou; mantém aviso não bloqueante de chunk grande |
| regras Firestore em emulador | passou: **56 testes** em `test/rules/firestore-rules.spec.ts`, contra Firestore/Auth locais (`127.0.0.1:8080` e `127.0.0.1:9099`) |

A suíte ainda emite warnings preexistentes de React `act(...)` em `HomePrizesSection.test.tsx` e logs de erro intencionalmente exercitados por testes. Não falharam e não pertencem à correção focada.

## Limites

- Não foi feito E2E em browser contra Firebase remoto/produção por segurança e escopo. A Home pública foi aberta com sucesso no modo demo local, sem erros de console.
- A validação de rules foi executada no emulador local conforme `.claude/skills/verify/SKILL.md`. Como o pacote não declara `firebase-tools` localmente, o comando equivalente foi `npx --yes firebase-tools@15.25.1` + `vitest` com os hosts dos emuladores, sem alterar dependências do produto.
- Integrações OTG externas não foram chamadas; foram usados doubles locais existentes.

## Recomendação de release

**Aprovar para o código validado neste checkpoint**, com os gates executados: lint, suíte completa, cobertura, build e 56 testes reais das regras Firestore passaram; o redirect público foi corrigido com regressões. Manter em backlog o bundle grande e os warnings `act(...)`; não bloqueiam esta correção focada.
