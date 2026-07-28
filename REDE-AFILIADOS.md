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
