# Rede de afiliados com comissão de upline ("lucro sobre equipe")

**Entregue em 2026-07-28, branch `feat/rede-afiliados`.** Núcleo puro em `src/lib/network.ts`.

## 1. Por que existe

A migração da Infinity (`MIGRACAO-INFINITY-LEGADO.md`) mostrou que a plataforma antiga pagava **duas** coisas
por CPA e a AffiliaCore modelava só uma:

| | Super Bet V2 | Stake | Esportiva | Total |
|---|---:|---:|---:|---:|
| Repasse direto ao afiliado | 14.580 | 7.240 | 4.960 | **26.780** |
| "Lucro sobre equipe" (upline) | 4.180 | 2.040 | 540 | **6.760** |
| Total pago | 18.760 | 9.280 | 5.500 | **33.540** |
| Receita das casas | 20.100 | 10.730 | 6.000 | **36.830** |
| Lucro real da agência | 1.340 | 1.450 | 500 | **3.290** |

Sem o modelo de rede, o `/admin` calcula `36.830 − 26.780 = R$ 10.050` — **inflado em R$ 6.760**, exatamente
20% do que o cliente paga. Esses números são o teste-âncora da feature (`src/lib/network.reconciliation.test.ts`).

**Ressalva importante sobre o que já existia:** a AffiliaCore *não* estava totalmente cega ao override. O
`buildSubToSpecialConfig` (afiliado especial + sub-rede) já cobrava o sub pela taxa do especial-pai, o que
embute o spread — mas **só em 2 níveis**, só para quem está em `special_affiliates`, e sem nunca mostrar o
override como número. Para um especial de especial ele usava a taxa do **pai imediato** em vez da do topo,
subestimando o custo. O legado tinha **4 níveis**. Esta feature generaliza o mecanismo e o torna visível.

## 2. Modelo escolhido

Cascata clássica de MLM, **confirmada pelo export do legado** (colunas `CPAs próprios | CPAs equipe | CPAs
estrutura | CPA/Deal atual | Lucro da equipe | Valor bruto`, com a linha real `59 × 280 = 16.520`):

```
recebe(a) = CPAs de TODA a subárvore de a × taxa PRÓPRIA de a      ("Valor bruto")
paga(a)   = Σ_{c ∈ filhos DIRETOS de a} recebe(c)
ganho(a)  = próprio(a) × taxa(a) + Σ_c [ recebe_à_taxa_de_a(c) − recebe(c) ]
                                   └──────────── "lucro sobre equipe" ────────┘
```

Telescopando a árvore inteira:

> **Σ (ganho de todos) == Σ sobre os TOPOS de estrutura de recebe(topo)**

Ou seja, o **custo real da agência** é a produção de cada afiliado × a taxa do **topo da estrutura dele**.
Nada some nem se cria no meio da árvore. É essa identidade que vira property test.

### Correção da fórmula do briefing

A fórmula `ganho(a) = próprios(a)×taxa(a) + Σ_{d ∈ downline(a)} cpas(d) × (taxa(a) − taxa(d))` — spread contra
a taxa de **cada descendente** — coincide com a de cima **apenas em redes de 2 níveis**. A partir de 3 ela não
telescopa: numa cadeia `R(300) → C(200) → G(100)` com 1 CPA cada, ela produz custo 1.000, enquanto o custo real
é `3 × 300 = 900` — R$ 100 criados do nada no nível do meio. O spread correto é sempre contra o **filho direto**
(que já foi compensado pela subárvore dele). Há teste explícito desse contraste em `network.test.ts`.

### Onde entra no cálculo

O custo por linha é `métrica × taxa do TOPO`. Isso é exatamente o formato que o `/admin` já consome como
`subToSpecialConfig` (um mapa `afiliado → AffiliateConfig` usado no lugar da config própria). Então a
integração **não toca a fórmula de dinheiro**:

```
buildRootConfigMap(tree, configs)  →  { afiliado: config do TOPO da estrutura }
        ↓ (merge por cima do subToSpecialConfig)
composeAdminProfit(...)  →  calcAgencyNetProfit / calcNetProfitByHouse / calcManualHouseNetProfit
```

`calcAffiliatePayout` (`src/lib/commission.ts`) continua sendo a **única** multiplicação taxa × métrica do
sistema — inclusive dentro do override, que é a diferença entre dois `calcAffiliatePayout` sobre as mesmas
métricas. `resolveBrandRates`/`byBrand` continuam valendo: a taxa usada é sempre a do upline **naquela casa**.

## 3. Modelo de dados

### `affiliate_uplines/{affiliateId}` (novo, server-only)

```ts
{ affiliateId: string, uplineId: string | null, updatedAt: Timestamp }
```

- **Aresta filho→upline**, não pai→filhos. Uma linha por afiliado, idempotente, e — ao contrário do mirror
  `affiliates` — **sobrevive ao `POST /api/affiliates/sync`**.
- Regra Firestore `read, write: if isAdmin()` (server-only, espelha `affiliate_configs`). Nem leitura de
  signed-in: quem é upline de quem *é* dinheiro e revela a estrutura comercial da rede inteira.
- Endpoints `requireAdmin`: `GET /api/affiliate-uplines` (mapa completo) e `POST /api/affiliate-uplines`
  (`{affiliateId, uplineId}`; `uplineId` vazio/null solta o afiliado, que volta a ser topo). O POST **recusa
  auto-upline e ciclo** (direto ou indireto) — a árvore nunca fica inconsistente no banco.
- Wrappers no client: `fetchAffiliateUplines()` / `saveAffiliateUpline()`.

### Retrocompatibilidade com `special_affiliates`

`buildNetworkNodes({ ids, specials, uplines })` compõe a árvore de duas fontes, com precedência:

1. `uplines` (aresta explícita) — **vence**;
2. vínculo derivado de `special_affiliates` (só os `active === true`), via `uplineMapFromSpecials`.

Assim a rede de 2 níveis que já existe em produção vira árvore **sem migração de dado**, e um especial que
seja sub de outro especial passa a ser cobrado corretamente (taxa do topo, não a do pai imediato).

### Ingestão da migração

O conversor da Infinity (`scripts/migracao-infinity/`, ainda a escrever) traduz o campo **Gerente (`#id`)** de
cada afiliado num `POST /api/affiliate-uplines`. Não populamos nada aqui — a extração do painel legado precisa
de sessão de navegador e é ação do operador.

## 4. Casos de borda — decisões

| Caso | Decisão | Onde |
|---|---|---|
| **Ciclo na árvore** | Corte determinístico: o membro de **menor id** do ciclo perde a aresta e vira topo; fica registrado em `tree.dropped`. Nunca lança, nunca trava. No **write** o ciclo é recusado com 400. | `buildNetworkTree` + `POST /api/affiliate-uplines` |
| **Auto-upline** (`a → a`) | Aresta descartada (`dropped: 'auto-upline'`); 400 no write. | idem |
| **Upline fora do roster** | Aresta descartada (`'upline-desconhecido'`); o filho vira topo. Conservador: a agência paga a taxa própria dele, sem override fantasma. | `buildNetworkTree` |
| **Upline sem taxa configurada** | Aresta descartada (`'upline-inelegivel'`). **Ausência ≠ R$ 0**: se o upline sem config virasse topo, a estrutura inteira sairia a custo R$ 0 e o lucro do `/admin` explodiria. O gate é `rateStatus` (via `hasConfiguredRate`), nunca `cpaValue \|\| 0`. | `buildEligibleUpline` |
| **Afiliado com produção e sem taxa** | Custo 0 (como já era), mas emitido como **anomalia** `sem-taxa` para a UI poder dizer "não configurado" em vez de exibir um zero enganoso. | `calcNetworkPayouts` |
| **Spread negativo** (taxa do downline > taxa do upline) | **Permitido no cálculo**, sinalizado como anomalia `spread-negativo`. Ver §5. | `calcNetworkPayouts` |
| **Upline inativo** | Não existe estado "inativo" na aresta. Um especial desativado deixa de gerar aresta derivada (`activeOnly`), mas uma aresta **explícita** permanece: o upline segue sendo o dono comercial da estrutura mesmo sem login ativo. Para tirá-lo da cadeia, o admin reaponta os filhos (ou o solta com `uplineId: null`) — decisão explícita, não efeito colateral de um flag. | `uplineMapFromSpecials` |
| **Afiliado fora da árvore com produção** | Vira topo isolado: `own = payout`, `team = 0`. Nunca some do custo. | `calcNetworkPayouts` |
| **Métrica-lixo da API** | Tudo passa por `num()` antes de multiplicar. `num` **não** parseia vírgula pt-BR — o conversor da migração normaliza antes (ver `MIGRACAO §4`). | `lib/commission` |

## 5. Spread negativo — a decisão e o porquê

**Escolha: o cálculo permite valor negativo; o bloqueio vive na escrita.**

Se o upline `p` tem CPA 100 e o downline `s` tem 150, `team(p) = −50` por CPA: o upline paga do próprio bolso.
As alternativas eram:

- **Piso em 0 no cálculo.** Rejeitada: quebra a conservação. Com o piso, `Σ ganhos > Σ topos` — dinheiro
  criado no meio da árvore, exatamente o bug que a feature existe para eliminar. E mentiria sobre o custo:
  a agência continuaria pagando `recebe(topo)`, mas o relatório mostraria outra coisa.
- **Permitir e sinalizar.** Escolhida. O total fecha (`directTotal + overrideTotal === agencyCost` continua
  valendo, com o override podendo ser negativo) e a configuração absurda aparece como anomalia explícita
  em vez de sumir num `max(0, …)`.

A prevenção fica onde o legado a colocava — o campo **"Limite de repasse"**: um upline não pode conceder ao
downline uma taxa maior que a própria. Isso já era aplicado inline em `POST /api/special/sub-config`; agora a
regra virou pura (`resolveRepasseCap` + `exceedsRepasseCap` em `lib/network`) e a rota usa a função — mesma
fonte da cascata, sem reimplementação. O teto respeita `byBrand` (teto por casa).

> Nota: o teto é aplicado quando **o especial** define a taxa do sub. Quando é o **admin** que grava a taxa
> (`PATCH /api/affiliate-configs/:id`) o teto não é imposto — o master pode, deliberadamente, criar um spread
> negativo. Nesse caso a anomalia é o canal de aviso. Impor o teto também no caminho do admin é uma decisão
> de produto que ficou **fora** desta entrega.

## 6. O que muda no `/admin`

- `composeAdminProfit` ganha um 6º parâmetro **opcional** `network?: NetworkTree`. Sem ele, comportamento
  idêntico ao de hoje (`overridePayout: 0`, `network: null`) — nenhuma instância sem rede muda de número.
- Com rede: o repasse de cada linha passa a usar a taxa do **topo**, então o **lucro líquido desconta também o
  "lucro sobre equipe"**. O retorno ganha `directPayout` / `overridePayout` / `network`, com a garantia
  `directPayout + overridePayout === repasse usado no netProfit`.
- O card de lucro do `/admin` mostra a decomposição (`Repasse direto` · `Lucro sobre equipe (upline)`) quando
  o override é maior que zero.
- **Invariante "agregado == Σ dos cards" preservado**: headline e cards por casa continuam saindo da mesma base
  escopada e do mesmo mapa de config efetiva.

### Limite de visibilidade (invariante de segurança)

O ganho de upline **não é margem da agência** — é o dinheiro do próprio afiliado. Mesmo assim, esta entrega
**não expõe nada na view do afiliado**: `directPayout`/`overridePayout` só existem no `AdminDashboard`,
`ClientDashboard` continua sem importar nenhuma função de lucro/margem, e `affiliate_uplines` é admin-only.
Quando a tela "minha rede" do afiliado for feita, ela pode mostrar `byAffiliate[meuId].team` (o ganho DELE) e
o `descendantsOf` da própria subárvore — **nunca** `agencyCost`, `netProfit` ou a margem da agência, e nunca
os ganhos de quem está acima dele.

## 7. Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/network.ts` | Núcleo puro: árvore, cascata, teto de repasse, `buildRootConfigMap`. Sem Firebase — o `server.ts` importa. |
| `src/lib/network.test.ts` | 32 testes de unidade (topologia, cascata, byBrand, bordas de dinheiro). |
| `src/lib/network.property.test.ts` | 5 property tests (fast-check) — conservação do dinheiro, saneamento total da floresta, monotonicidade do teto. |
| `src/lib/network.reconciliation.test.ts` | 11 testes-âncora com os números reais da Infinity. |
| `src/services/affiliateService.ts` | Re-export do núcleo + `fetchAffiliateUplines`/`saveAffiliateUpline` + `composeAdminProfit(…, network)`. |
| `src/pages/AdminDashboard.tsx` | Monta a árvore e mostra a decomposição do repasse. |
| `server.ts` | `GET`/`POST /api/affiliate-uplines` (admin, anti-ciclo) + `/api/special/sub-config` usando o teto puro. |
| `firestore.rules` | `affiliate_uplines` admin-only. |

## 8. Fora desta entrega

1. **UI de edição da árvore** (arrastar afiliado para um upline, visualizar níveis). Hoje o vínculo se define
   por API; a tela `/network` do especial segue no modelo de 2 níveis.
2. **Tela "minha rede" do afiliado** com o ganho de equipe dele (ver §6, limite de visibilidade).
3. **Teto de repasse no caminho do admin** (`PATCH /api/affiliate-configs/:id`) — hoje só no caminho do especial.
4. **Ingestão real da Infinity** (extração do painel legado é ação do operador).
5. **Trilha de auditoria da aresta**: `POST /api/affiliate-uplines` ainda não grava `audit_logs`. Mudar upline
   muda dinheiro — deveria ser auditado como `config.update`. É a próxima dívida óbvia.
6. **ISS por casa** (5% / 2% / 2% no legado) — ortogonal a esta feature, segue em aberto no doc de migração.

## 9. Desenho: aposentar o `special_affiliates` como estrutura paralela (2026-07-29)

> **Medido em produção (Infinity, 2026-07-30):** este desenho deixou de ser refinamento e virou
> lacuna funcional. A instância tem **141 arestas** em `affiliate_uplines` e `special_affiliates`
> **VAZIA** — então os **19 topos de estrutura** logam e não veem equipe nenhuma, porque a tela do
> afiliado ainda decide por `isSpecial`. Ver §8 do `MIGRACAO-INFINITY-LEGADO.md`. E, antes de povoar
> a coleção como paliativo, a rule `allow read: if isSignedIn()` precisa fechar para `isAdmin()`:
> com dados dentro, ela vira vazamento de organograma para qualquer afiliado logado.

**Pergunta que originou:** por que um pai de rede não é simplesmente um "afiliado especial"?

**Resposta curta: para DINHEIRO, já é.** `composeAdminProfit` faz
`{...subToSpecialConfig, ...buildRootConfigMap(network, configs)}` — a árvore VENCE e o vínculo de especial
sobra só como fallback de quem não está nela. E `uplineMapFromSpecials` já deriva arestas do modelo antigo,
então a hierarquia de 2 níveis virou árvore **sem migração de dado**.

O que `special_affiliates` ainda faz sozinho são duas coisas que não são hierarquia:

| Responsabilidade | Onde vive hoje |
|---|---|
| **Papel/acesso** — `users/{uid}.isSpecial`, espelhado pelo servidor em 3 pontos (`PATCH /affiliates/:id`, vínculo de login, `accept-invite`). Destrava `/network`, `/network/afiliados`, `AffiliateDetails` de terceiro, o roteamento `clientHome` e a audiência `specials` dos avisos. | `server.ts:749,1015,2430` · `App.tsx:45,241` · `SpecialDashboard.tsx:227` · `noticeService.ts:79` |
| **Escopo (barreira de IDOR)** — o conjunto que o não-admin pode ler sai de `special.subAffiliateIds`. | `src/lib/scope.ts:92` · `server.ts:674,1096,1232,2512,3515` |

### O gap de privacidade que a migração FECHA

As duas coleções guardam a mesma estrutura comercial com regras opostas:

```
special_affiliates  → allow read: if isSignedIn();   // qualquer logado lê a rede INTEIRA
affiliate_uplines   → allow read, write: if isAdmin();
```

E o comentário da própria `firestore.rules` justifica o admin-only da aresta dizendo que ela "revela a
estrutura comercial da rede inteira" — que é exatamente o que a outra porta entrega a qualquer afiliado
logado. Isso existe porque o `SpecialDashboard` lê `specials[ownId].subAffiliateIds` **no client**. Mover a
resolução de escopo para o servidor (que já é o padrão de todo dado sensível — ver `affiliate_configs`)
permite fechar `special_affiliates` para admin-only.

### ⚠️ A decisão que NÃO pode ser silenciosa: profundidade

Hoje o especial enxerga `subAffiliateIds` = **1 nível**. Trocar isso pela subárvore da rede o faz enxergar
**N níveis** — na Infinity, medida em 3 níveis, um pai de nível 1 passaria a ver netos que hoje não vê.
**Isso é ampliação de visibilidade, não refactor mecânico.** Quem fizer a troca "óbvia" (`subAffiliateIds` →
`descendantsOf`) vaza dado sem perceber. Proposta: `visibilityDepth` no registro de papel, **default 1** na
migração (regressão-zero), com o master podendo abrir para a subárvore inteira por afiliado.

### Alvo

- `affiliate_uplines/{id}` = **fonte única da hierarquia** (já é, na prática).
- `special_affiliates/{id}` deixa de guardar hierarquia e passa a guardar **só o papel**:
  `{ active, visibilityDepth }`. `subAffiliateIds` vira DERIVADO da árvore (`descendantsOf` com o corte de
  profundidade) e sai do documento.
- Mantém-se o nome das coleções — o churn fica no conteúdo, não no roteamento nem nas rules existentes.

### Fases (cada uma isolada e reversível)

1. **Escopo pela árvore, com profundidade 1.** `resolveScopedAffiliateIds` passa a receber a subárvore
   cortada em 1 nível em vez de `subAffiliateIds`. Saída esperada: **conjunto idêntico** para toda rede que
   hoje é de 2 níveis. Trava: o property test de não-vazamento (`scope.property.test.ts`, R4) roda contra as
   duas fontes e exige igualdade. É a fase de maior risco — é a barreira de IDOR.
2. **Servidor devolve a sub-rede.** `SpecialDashboard` para de ler `special_affiliates` no client e passa a
   consumir um endpoint escopado (espelha `GET /api/affiliate-configs`).
3. **Fechar a rule** de `special_affiliates` para admin-only. Só é seguro depois da 2.
4. **`visibilityDepth`** no registro + controle no `/admin`. Só aqui a visibilidade pode aumentar, por
   escolha explícita do master.
5. **`subAffiliateIds` sai do documento**; `uplineMapFromSpecials` vira código morto e é removido junto.

### Riscos e rollback

- **Fase 1 é a única que mexe em segurança.** Rollback = reverter o commit; nenhum dado muda de forma até a 5.
- Fases 1–4 não escrevem nada em `special_affiliates`, então convivem com o dado atual — dá para parar em
  qualquer ponto.
- Dívida que vale resolver junto: `POST /api/affiliate-uplines` **ainda não grava `audit_logs`** (§8.5).
  Se a aresta passa a definir também ACESSO, além de dinheiro, auditar deixa de ser opcional.

### ✅ ENTREGUE (2026-07-30) — `fromNetwork`: a sub-rede derivada da árvore

O desenho acima foi implementado com uma diferença: em vez de `visibilityDepth` numérico, o
registro ganhou a flag **`fromNetwork`**, e o par visão/dinheiro foi separado explicitamente.

**Núcleo puro:** `src/lib/specialNetwork.ts` (+ teste colocado).

| Pergunta | Resposta | Função |
|---|---|---|
| O que ele **VÊ** | a subárvore INTEIRA (N níveis) | `resolveSpecialSubIds` |
| De quem ele define a **TAXA** | só o filho **DIRETO** | `isDirectDownline` / `resolveDirectSubIds` |

A separação não é cosmética: `subAffiliateIds` também é a lista que `POST /api/special/sub-config`
aceita. Dar a subárvore inteira sem restringir a escrita deixaria o gerente do topo mexer no
repasse de um **neto** — mudando o spread do gerente do meio sem que ele soubesse.

**O que mudou, por fase do plano acima:**

1. ✅ **Escopo pela árvore.** As 6 leituras diretas de `special_affiliates` no `server.ts` viraram um
   helper único, `resolveSpecialRecord`, que resolve a sub-rede antes de devolver. `resolveScopedAffiliateIds`
   não mudou — recebe a lista já resolvida.
2. ✅ **Servidor devolve a sub-rede.** `GET /api/special-affiliates` (requireAuth) escopa por papel:
   admin recebe o mapa inteiro; o especial recebe só o próprio registro + o dos subs. `fetchSpecialAffiliates`
   manteve a assinatura — os 8 call sites não mudaram.
3. ⏸️ **Rule ENCENADA, não aplicada.** O `firestore.rules` mantém `read: if isSignedIn()` de
   propósito, com o alvo (`read, write: if isAdmin()`) documentado no próprio arquivo. Fechar a
   leitura só é seguro DEPOIS que `GET /api/special-affiliates` está no ar na instância — fechar
   antes deixa todo especial sem ver equipe (aconteceu em prod no Boost em 2026-07-30, rules
   deployadas antes do push). O predeploy hook do `firebase.json` agora barra essa ordem.
4. ↔️ **Profundidade** virou a flag `fromNetwork` (subárvore inteira) em vez de um inteiro. Um
   `visibilityDepth` intermediário continua possível se algum cliente pedir.
5. ⬜ `subAffiliateIds` **continua no documento** para quem NÃO é `fromNetwork` (o modelo de 2 níveis
   do Boost). `uplineMapFromSpecials` segue vivo e cobre esses.

**Derivação ao VIVO, não congelada.** No modo `fromNetwork` a lista não é gravada (`subAffiliateIds: []`)
e é recalculada a cada leitura. Congelar faria a equipe do gerente rotar em silêncio a cada aresta nova.

**⚠️ Um registro `fromNetwork` NÃO é fonte de hierarquia.** `uplineMapFromSpecials` e
`buildSubToSpecialConfig` pulam esses registros: a lista derivada tem N níveis e, se voltasse a virar
aresta, achataria a estrutura (neto → gerente do topo) e mudaria o custo da agência. Quem cobre esse
caso é `buildRootConfigMap`, que sai da árvore de verdade.

**⚠️ ARMADILHA DO OPERADOR (medida na demo).** Ligar o modo automático num especial que já existia
**solta da estrutura** todo sub que estava vinculado *só* pela lista manual, sem aresta em
`affiliate_uplines` — cada um vira topo próprio e passa a ser pago pela taxa dele, não pela do gerente.
Medido: lucro da agência 11.559,00 → 11.884,30, com o delta saindo INTEIRO do "lucro sobre equipe"
(1.250,10 → 924,80) e o repasse direto intocado. Depois de criar as duas arestas na `/rede`, voltou
exato ao baseline. Por isso o modal **avisa em âmbar e nomeia quem sairia** antes de salvar.

**Dívida que continua aberta:** o teto de repasse no caminho do admin (`PATCH /api/affiliate-configs/:id`).
`POST /api/affiliate-uplines` **já audita** (`network.set_upline`/`clear_upline`) — a §8.5 está desatualizada.

---

## 10. Link de cadastro na rede (2026-08-15) — o gerente recruta SEM fila

Pedido do Maurício: o afiliado especial precisa de **um link que cadastre gente direto na equipe
dele, sem aprovação do admin master**. A indicação da call 12/08 (`affiliate_referrals`) continua
existindo, mas ela ABRE UMA FILA — o master confirma, cria o afiliado e vincula. Este link é o
caminho sem fila. **Cunhar o link da CASA continua sendo do master** (a tag que a casa devolve no
relatório), e por isso a geração de link de casa SAIU da tela do especial na mesma entrega.

**Desenho.** Reusa a coleção `invites` (server-only, sem rule → o cliente nunca lê) com
`kind: 'network'`. Diferenças para o convite pessoal:

| | convite pessoal | link de rede |
|---|---|---|
| dono | `affiliateId` (o convidado) | `ownerAffiliateId` (quem recruta) |
| uso | single-use (`status: 'used'`) | reutilizável, só conta `uses` |
| validade | 7 dias | não expira; encerra rotacionando |
| afiliado | já existe | **nasce no aceite** (nativo Boost) |

Os campos têm nomes DIFERENTES de propósito: se algum caminho antigo tratasse este doc como convite
pessoal, ele falharia em vez de criar um segundo login no MESMO afiliado.

**Rotas.** `GET`/`POST /api/network-invite` (requireAuth, só especial ATIVO; POST idempotente,
`rotate: true` revoga e emite outro), o `GET /api/invites/:token` público devolvendo `kind` +
`referrerName`, e o branch de rede no `POST /api/accept-invite`. Núcleo puro em
`src/lib/networkInvite.ts`; tela pública = a MESMA `InviteAccept` (rota `/cadastro/:token`), que pede
o NOME quando o convite é de rede.

**Invariantes (testados em `server.test.ts`):**

- **Só especial ativo emite**, e o link **morre junto com o papel**: dono rebaixado → 410 no GET e no
  aceite, sem precisar revogar nada.
- **O recém-chegado entra na ÁRVORE** (`affiliate_uplines`), que é quem precifica a rede. Para o
  especial do modelo ANTIGO (`fromNetwork !== true`, que não deriva da árvore) o id também entra em
  `special_affiliates.subAffiliateIds` — sem isso o gerente não veria quem acabou de entrar.
- **NUNCA rouba upline.** O afiliado é idempotente por e-mail (mesma regra do `POST /api/boost-affiliates`);
  se o e-mail já é de alguém com upline de OUTRO gerente, o vínculo antigo fica de pé.
- **Barreira de ciclo** igual à do `POST /api/affiliate-uplines`: só alcançável reusando um afiliado
  que já está acima de quem recruta. Entra sem vínculo (o master resolve) em vez de corromper a árvore.
- **Nada de dinheiro:** o indicado nasce SEM `affiliate_configs` (ausência ≠ R$ 0). Quem define a
  taxa dele é o gerente, depois, em "Meus afiliados" (ele é filho DIRETO).
- Sem mudança em `firestore.rules` (a coleção `invites` já era server-only), então **não há ordem de
  deploy** a respeitar nesta entrega.
