# Migração da plataforma legada da Infinity → AffiliaCore

**Levantamento: 2026-07-27.** Recon read-only das duas pontas da plataforma que a Infinity usava antes da AffiliaCore.
Fornecedor legado: **G8 Agency** (assina o rodapé do painel *e* é o CNPJ emissor da NFE — 55.088.898/0001-93).

| Ponta | URL | Acesso |
|---|---|---|
| Admin (backoffice) | `admininfinityaffiliates.shop/admin/*` | login do Vinicius |
| Afiliado | `infinityaffiliates.online/menu/*` | conta de teste criada 27/07/2026 |

> Nenhuma escrita foi feita — só `GET`. Ressalva: o admin legado audita **visualizações** com IP, então a varredura
> deixou ~60 linhas "Visualizou" na trilha de auditoria deles. Não é removível e não é dado nosso.

---

## 1. Arquitetura legada (e por que ela não se copia)

PHP puro com sessão + CSRF, e **um banco de dados por casa**, trocado pelo query param `?db=`.
As chaves internas denunciam que a plataforma foi reciclada de uma operação anterior:
`BET365`=Galera Bet, `BETANO`=Lider Bet, `BETFAIR`=Sorte Online, `KTO`=LottoLand.

**Armadilha crítica:** `?db=` com chave desconhecida **cai silenciosamente no banco `main`** — a tela mostra dados
de outro banco sem avisar. Validei com 11 variantes (`melbetinfi`, `melbetinfini`, `BET15`, `SUPERBET`, `KTO`…):
todas renderizaram "Infinity Affiliates". Qualquer leitura do legado **tem que conferir o rótulo `Banco:` da resposta**,
nunca confiar no parâmetro enviado.

Consequência direta: **o menu anuncia 10 casas, mas só 3 têm banco real.** As outras 7 são fachada.

---

## 2. Inventário de dados — o que existe de verdade

### 2.1 Pessoas

**160 afiliados únicos.** O banco `main` é **superconjunto estrito** de todos os outros
(V2 138/138 ⊆ main, Stake 39/39 ⊆ main, Esportiva 19/19 ⊆ main; Stake 39 ⊆ V2).
Só 11 e-mails aparecem em um único banco. Ou seja: **migra-se 160 pessoas, não 356 linhas.**

`main` tem os 160 cadastros e **zero produção** — é o diretório mestre, não uma casa.

### 2.2 Produção por casa

| Banco | Usuários | Lançamentos diários | Período coberto | Registros | FTD | CPAs | Deposits | CPA base |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Super Bet V2 | 138 | 146 | 19/05 → **29/06/2026** | 123 | 76 | 67 | R$ 31.770 | R$ 300 |
| Stake | 39 | 2.140 | 11/04 → **26/07/2026** | 151 | 83 | 58 | R$ 8.039 | R$ 185 |
| Esportiva Bet | 19 | 54 | 22/06 → **25/07/2026** | 77 | 49 | 50 | R$ 3.794 | R$ 120 |
| `main` | 160 | 0 | — | 0 | 0 | 0 | — | R$ 125 |
| **Total** | **160 únicos** | **2.340** | 11/04 → 26/07/2026 | **351** | **208** | **175** | **R$ 43.603** | |

Os totais **reconciliam com os KPIs do próprio painel** em cada banco (conferido bank a bank).

**Leitura operacional:** Super Bet V2 parou em 29/06. A operação viva hoje é **Stake** (até 26/07) e Esportiva (25/07).

### 2.3 Cobertura de links/tags

| Banco | Com link | Sem link | Standby | Com link s/ resultado | **Produzindo** |
|---|---:|---:|---:|---:|---:|
| Super Bet V2 | 61 | 77 | 41 | 34 | **27** |
| Stake | 20 | 19 | 0 | 2 | **18** |
| Esportiva Bet | 11 | 8 | **288** ⚠️ | 6 | **5** |
| `main` | 0 | 160 | 0 | 0 | 0 |

**Só ~50 afiliados produzem resultado** (27+18+5, com sobreposição de pessoas). Dimensione o onboarding por esse número,
não pelos 160.

⚠️ A Esportiva reporta **288 links em standby para 19 usuários** — número do próprio painel, não erro de extração.
É lixo de banco reciclado (pool de tags pré-geradas sem dono). **Não migrar.**

### 2.4 Passivo financeiro em aberto — ponto de atenção

| Banco | CPAs | Bruto (repasse) | ISS | Líquido a pagar | Lançado | Pago |
|---|---:|---:|---:|---:|---:|---:|
| Super Bet V2 | 67 | R$ 18.760,00 | R$ 938,00 (5%) | R$ 17.822,00 | R$ 0,00 | R$ 0,00 |
| Stake | 58 | R$ 9.280,00 | R$ 185,60 (2%) | R$ 9.094,40 | R$ 0,00 | R$ 0,00 |
| Esportiva Bet | 50 | R$ 5.500,00 | R$ 110,00 (2%) | R$ 5.390,00 | R$ 0,00 | R$ 0,00 |
| **Total** | **175** | **R$ 33.540,00** | **R$ 1.233,60** | **R$ 32.306,40** | **R$ 0,00** | **R$ 0,00** |

**R$ 32.306,40 líquidos devidos a afiliados, com nada lançado e nada pago.** Um único afiliado concentra
R$ 15.694 disso (Super Bet V2). **O ISS varia por casa** (5% na V2, 2% nas outras) — não é constante do sistema.

Receita da operação (CPAs × base) = R$ 36.830 → **margem da agência R$ 3.290 (8,9%)**, com spread por casa de
R$ 20/CPA (V2), R$ 25/CPA (Stake) e R$ 10/CPA (Esportiva).

---

## 3. Modelo econômico legado × AffiliaCore

CPA em **três camadas**, não duas:

```
CPA Sistema (300)  →  o que a casa paga à agência
CPA Agente  (280)  →  repasse ao afiliado direto
CPA Afiliado(270)  →  repasse ao indicado (sub)
```

A margem sai do spread, e o gerente ganha **"lucro sobre equipe"** pela diferença entre o que recebe e o que repassa
(visível no painel: *"Abaixo: 19 pessoa(s) · Repasse: R$ 500,00 · Lucro sobre equipe: R$ 60,00"*).

No painel do afiliado isso aparece como **"Limite de repasse"**: o próprio afiliado define o CPA do indicado,
com teto no próprio CPA. Hoje na AffiliaCore quem define a taxa do sub é o admin.

**Rede de 4 níveis** (N1 direto + N2/N3/N4 indiretos) contra o modelo especial+sub-rede atual.

### 3.1 Topologia REAL da rede — medida em 2026-07-28 (4 bancos)

Varredura read-only de `/admin/config` nos **4 bancos** (`main` + as 3 casas), 9 páginas no total, com o
rótulo `BET:` conferido em cada resposta (`Infinity Affiliates` / `Super Bet V2` / `Stake` / `Esportiva Bet`
— todos distintos, logo nenhum caiu no fallback silencioso do §1).

⚠️ **O banco `main` SUB-REPORTA a rede — não use ele como fonte.** Uma primeira medição só do `main` deu
77 arestas e 83 topos; a união com os bancos de casa mostra que aquilo era um subconjunto:

| Medida | `main` sozinho | **União (verdade)** |
|---|---:|---:|
| Afiliados | 160 | 160 |
| Com upline real | 77 | **141** |
| Topos de estrutura | 83 | **19** |
| Profundidade máxima | 2 (3 níveis) | **3 (⇒ 4 níveis)** |
| Distribuição por nível (0/1/2/3) | 83 / 65 / 12 / — | **19 / 91 / 39 / 11** |
| Ciclos | 0 | **0** |
| Upline fora do roster | 0 | **0** |
| Pessoas que são upline | 19 | **19** |
| Maior sub-rede direta | 30 | **34** |
| REV ≠ 0% | 0 de 160 | **0 de 160** (CPA-puro) |

O `main` diz "topo" para **64** pessoas que têm gerente no banco da casa onde operam, e em **7** casos
aponta um gerente que **nenhuma casa** confirma. Os "4 níveis" do §3 eram, afinal, o dado **também** — não
só capacidade da plataforma.

**A árvore é GLOBAL — o schema atual serve.** Das 40 pessoas presentes em mais de uma casa, **zero** têm
gerente diferente entre casas (34 têm o mesmo gerente em todas, 6 são topo em todas). Nenhum gerente citado
numa casa está fora do roster do `main`. Portanto uma árvore única por instância + taxa por casa via
`byBrand` representa o legado fielmente; **não** é preciso árvore por casa.

**Regra de resolução do upline** (a que o conversor implementa): a **CASA é a autoridade**; o `main` só
preenche quem não aparece em casa nenhuma (5 pessoas). Nos 7 conflitos, a casa vence.

**Consequências para o conversor:**

1. **`gerente == próprio id` significa "sem gerente"** — convenção do legado para topo de estrutura.
   O conversor **não deve** enviar essas arestas ao `POST /api/affiliate-uplines` (a rota responde 400 em
   auto-upline); `buildNetworkTree` também as descarta sozinho na leitura.
2. **O dado está limpo**: sem ciclo e sem upline órfão, nos 4 bancos. O saneamento não descarta nada além
   dos auto-uplines, então a rede migrada é fiel ao legado.
3. A rede é **concentrada**: 19 uplines para 141 vínculos, e um único gerente com 34 diretos.
4. **19 topos, não 83, é o que define o custo da agência** — o custo é a produção de cada estrutura × taxa
   do TOPO dela (`buildRootConfigMap`). Migrar pela árvore do `main` faria 83 pessoas virarem topo e
   subestimaria o "lucro sobre equipe". Ver `REDE-AFILIADOS.md`.

### 3.2 As 3 camadas de CPA são por CASA — e fecham os R$ 33.540

O card **"Configuração de CPA"** no topo de `/admin/config` (por banco) expõe as 3 camadas. Lidas em
2026-07-28:

| Casa | `CPA Sistema` | `CPA Agente (direto)` | `CPA Afiliado (ref)` |
|---|---:|---:|---:|
| Super Bet V2 | 300 | **280** | 270 |
| Stake | 185 | **160** | 140 |
| Esportiva Bet | 120 | **110** | 100 |
| (`main`, não é casa) | 125 | 115 | 100 |

**Reconciliação com o dado real — o modelo da rede reproduz o legado:**

| Cálculo | Resultado | Confere com |
|---|---:|---|
| `Sistema` × CPAs — 67×300 + 58×185 + 50×120 | **R$ 36.830,00** | comissão importada (§ runbook) |
| `Agente` × CPAs — 67×280 + 58×160 + 50×110 | **R$ 33.540,00** | bruto do passivo (§6.1) |
| diferença | **R$ 3.290,00** | lucro real da agência |

Isso valida `buildRootConfigMap` contra dado de produção: o custo da agência é a produção de cada estrutura
× taxa do **TOPO** dela, e o topo é pago na camada `Agente (direto)` da casa. Até aqui a reconciliação de
`REDE-AFILIADOS.md` usava fixtures com taxas ajustadas; agora os três produtos somam o total do painel.

**Para o passo 5**, portanto: `affiliate_configs.byBrand[casa].cpaValue` = a coluna `Agente (direto)` para
os **18 topos de estrutura** e `Afiliado (ref)` para os demais. REV fica ausente (não zero — ausência ≠ R$ 0).

Esses três valores são o **padrão do BET**. O deal por pessoa existe (é o "Limite de repasse" do §3) e vive
em outra tela — ver §3.3.

### 3.3 Os deals INDIVIDUAIS estão em `/admin/pagamentos` — extraídos em 2026-07-28

A tela de Pagamentos tem os modos **"Pagar gerente da rede"** e **"Pagamento individual"**
(`pagamentos.php?payment_mode=structure|individual`) e, decisivo: **o payload da equipe de cada cabeça vem
embutido no HTML**, no `onclick="openTeamModal({...})"` — não é preciso abrir modal por modal.

Por cabeça: `parent_cpa`, `own_cpas`, `structure_cpas`, `gross_total`, `iss_value`, `downline_repasse`,
`downline_profit`, `team_rows[]`. Por membro em `team_rows`: **`cpa` (o deal individual)**, `cpas`, `total`,
`margin_diff`, `parent_profit`, `level`, `sponsor_id`, `head_id`, `path_ids`, `path_names`.

**Cobertura é TOTAL** (a suspeita de que o export só pegava quem tem saldo era do XLSX, não da tela):
138 na V2 + 39 na Stake + 19 na Esportiva = **196 pares (pessoa, casa), 149 pessoas, zero sem deal**.

| Casa | Cabeças | Membros | CPAs | Bruto | Lucro de equipe |
|---|---:|---:|---:|---:|---:|
| Super Bet V2 | 13 | 125 | 67 | R$ 18.760 | R$ 4.180 |
| Stake | 5 | 34 | 58 | R$ 9.280 | R$ 2.040 |
| Esportiva Bet | 6 | 13 | 50 | R$ 5.500 | R$ 540 |
| **Total** | | | **175** | **R$ 33.540** | **R$ 6.760** |

Fecha com tudo: o bruto é o passivo do §6.1, e o lucro de equipe é exatamente os R$ 6.760 do modelo de rede
(direto = 33.540 − 6.760 = **R$ 26.780**).

⚠️ **Os deals variam MUITO — não use o padrão do BET para os não-cabeças.** Valores distintos praticados:
V2 `120,130,150,180,200,220,230,240,250,260,270,280`; Stake `100,120,130,140,150,160`;
Esportiva `80,90,95,100,110`. Os **cabeças**, sim, são uniformes na camada Agente (280/160/110).
Configurar todo mundo em "Afiliado (ref)" reproduziria o custo total mas erraria o extrato individual.

**Para o passo 5:** `affiliate_configs.byBrand[<slug da casa>].cpaValue` = a coluna `cpa` do TSV de deals.
A chave é o **slug**, não o brandId: em `calcManualHouseNetProfit`, `brandKeyOf` cai em `id ?? slug` e casa
manual não tem `id` (que é o brandId da OTG). REV fica **ausente** (0% em 100% do legado; gravar 0 faria
`rateStatus` ler "configurado").

Chaves `?db=` válidas (do próprio painel): `main`, `superbetv2infi`, `stakeinfini`, `esportivainifi`
(+ `superbetinfini`, `sportinginfini`, `liderinfinity`, `galerainfinity`, `sorteinfinity`, `lotolandinfini`,
`melbetinfi` — as 7 fachadas do §1).

---

## 4. Mapa de campos → schema AffiliaCore

| Legado | Origem | AffiliaCore | Observação |
|---|---|---|---|
| Nome | `afiliados` / `config` | `affiliates/{id}.name` | mirror **name-only**, `source:'boost'` |
| E-mail | `afiliados` | `affiliate_email_aliases/{normEmail}` | **PII — nunca no mirror `affiliates`** |
| E-mail (login) | idem | `users/{uid}.email` + `role:'client'` | via convite/`createInviteDoc` |
| WhatsApp, Instagram | `config` (users) | campo novo no perfil | 118 dos 160 têm contato |
| Gerente (`#id`) | `config` (users) | `special_affiliates` / sub-rede | **todos os 160 têm upline** |
| REV (%) | `config` (users) | `affiliate_configs.revPercentage` | **0% em 100% dos casos hoje** |
| CPA Unit. (por casa) | `comissoes` | `affiliate_configs.byBrand[brandId].cpaValue` | 280 / 160 / 110 — **taxa por casa, obrigatório** |
| Tag (`NakataAgency###`) | `regras` | não migra (ver §6) | é da conta da G8 |
| Casa | `?db=` | `houses/{id}` com `dataSource:'manual'` | 3 casas: Super Bet V2, Stake, Esportiva |
| `date, registers, nqftd, cpas, revshare_value, deposits` | `comissoes` (linha/dia) | `house_results` | **2.340 linhas** — shape quase 1:1 |

### Invariantes do repo que o conversor tem que respeitar

- **`num()` NÃO parseia vírgula pt-BR** (`'2.400,50'` → 0). Todo valor extraído vem formatado em pt-BR
  (`"R$ 3.360,00"`) → o conversor **tem que normalizar antes**, nunca passar a string crua para `num()`.
  Esta é a falha mais provável da migração.
- **Ausência de config ≠ R$ 0.** Afiliado sem taxa no legado não pode virar `{cpaValue:0}` — use
  `buildBrandConfigTopPayload`, que devolve `null` quando não há nada a gravar.
- **Taxa por casa via `byBrand[brandId]`** — as três casas têm CPA diferente; gravar só no topo corrompe o cálculo.
- **E-mail de afiliado nunca no mirror `affiliates`** (vazaria a todo signed-in) → `affiliate_email_aliases`, server-only.
- Casa manual cruza resultado **pelo e-mail de login na AffiliaCore**, não pela identidade legada.

---

## 5. Método de extração (endpoints validados)

Todos `GET`, autenticados por sessão do admin. **Confira sempre o rótulo `Banco:` da resposta** (§1).

| Endpoint | Conteúdo | Paginação |
|---|---|---|
| `/admin/afiliados?db=<db>&page=N` | roster: nome, e-mail, upline, registros, CPAs, comissão, deposits, criado | `page`, 20/pág |
| `/admin/config?db=<db>&page=N` | users: WhatsApp, Instagram, gerente, REV%, flag admin | `page`, 50/pág |
| `/admin/comissoes?db=<db>&from=<iso>&to=<iso>&p=N` | **lançamentos diários** | ⚠️ `p`, **não** `page`; 15/pág |
| `/admin/regras?db=<db>&view=<V>&page=N` | tag + link + resultado; `V` ∈ `com_link`, `sem_link`, `standby`, `com_link_sem_resultado`, `com_link_com_resultado` | `page`, 20/pág |
| `/admin/pagamentos.php?export=xlsx&payment_mode=<structure\|individual>&db=<db>` | XLSX, 21 colunas | — |

**Duas pegadinhas que custaram tempo:**
1. `comissoes` **sem** `from`/`to` devolve só o período padrão (últimos 30 dias) e **agregado por afiliado**.
   Com intervalo amplo, a mesma tela vira a tabela de **lançamentos diários** — que é o que interessa.
2. O `📥 XLSX` da tela Links é **import**, não export. O único export é o de Pagamentos, e ele cobre
   **apenas usuários com saldo a receber** (3 linhas na Super Bet V2) — insuficiente como fonte de migração.

O XLSX de Pagamentos (21 colunas) foi baixado e parseado; serve para **conferir o passivo**, não para migrar o cadastro:
`ID, Gerente/estrutura, E-mail, Chave PIX, Tag, Período inicial/final, CPAs próprios/equipe/estrutura, CPA/Deal atual, REV aplicado, Lucro da equipe, Valor bruto, ISS (%), ISS (R$), Valor líquido, Pago, Em aberto, Saldo a receber, NFE pendentes`.

---

## 5.1 Painel da casa (Esportiva Bet) — a fonte de verdade real

`wallet.esportiva.bet.br`, conta **`infinity.affiliates01`**, afiliado **544865**. Verificado 2026-07-27.
**A conta é da Infinity** — isso encerra, no plano técnico, a dúvida do §6.2.

- **Régua comercial: CPA de R$ 120 pago sobre QFTD** (46 QFTDs × 120 = R$ 5.520 em jul/2026). Bate exatamente
  com a base 120 que o legado praticava. `Comissão Total = CPA + RevShare`, e **o RevShare pode ser NEGATIVO**
  (jul/2026: −R$ 178,46, porque o P&L ficou negativo) — ou seja, jogador ganhando **come a comissão de CPA**.
  Com repasse de R$ 110/CPA, a margem da Esportiva é fina e sensível a isso.
- **O painel GERA link** (≠ do legado, que só registra): 6 templates em "Meus Links" com "Personalizar" +
  "Copiar Link", e uma aba "Links Gerados" por afiliado. O link é `go.aff.esportiva.bet/<template>` + `?afp=<tag>`.
  Criar link novo é **aditivo** — tag diferente é balde diferente, não encosta em link existente.
- **O `afp` sobrevive até o destino final** (probe 2026-07-27): `go.aff.esportiva.bet/urto4foy?afp=teste01`
  aterrissa em `esportiva.bet.br/?src=…&utm_source=544865&ext_marker=infinity&afp=teste01`.
- **⚠️ O relatório atrasa ~1 dia.** Em 27/07 a última linha era 26/07, e o clique de teste não moveu o
  contador de visitas do dia. **Toda rotina manual lê D−1** — um piloto de 1 semana só fecha no 8º dia.
- **✅ CORRIGIDO EM 31/07/2026 — A ATRIBUIÇÃO POR AFILIADO EXISTE E FUNCIONA.** O bloco abaixo
  ("gargalo confirmado") era **erro de leitura**: no Relatório de Mídia, **`Source ID` e `AFP` são
  dimensões DIFERENTES**. O `Source ID` está vazio mesmo; a tag `infinitw###` vive no **`AFP`**,
  que a doc do TAP também chama de `afp` no `group_by`. Agrupando por `Time (Dia) + AFP`,
  julho/2026 devolve **74 linhas com tag** (contra 28 colapsadas) e CPA atribuído por afiliado.
  Os dois probes de teste estão lá (`infinitw298` em 29/07, `teste01` em 28/07).

  **Julho/2026 (export CSV do próprio painel) — 5 tags respondem por 100% do CPA:**

  | AFP | Visitas | Registros | FTDs | QFTDs | CPA | RevShare |
  |---|---:|---:|---:|---:|---:|---:|
  | `infinitw280` | 122 | 29 | 23 | 23 | R$ 2.760,00 | R$ 22,48 |
  | `infinitw292` | 60 | 18 | 13 | 12 | R$ 1.440,00 | R$ 13,55 |
  | `infinitw02` | 35 | 13 | 9 | 8 | R$ 960,00 | R$ 11,00 |
  | `infinitw193` | 74 | 11 | 3 | 3 | R$ 360,00 | R$ 14,26 |
  | `infinitw01` | 11 | 1 | 1 | 1 | R$ 120,00 | −R$ 92,13 |
  | *(sem tag)* | 12 | 3 | 0 | 0 | R$ 0,00 | −R$ 144,38 |
  | **Total** | | | | **47** | **R$ 5.640,00** | **−R$ 175,22** |

  Confere com o card de QFTDs do dashboard (47) e com 47 × R$ 120. Há 7 tags com visita e zero
  conversão (`infinitw45`, `infinitw298`, `infinitw299`, `infinitw280tem`, `infinitw280gay`,
  `infi`, `teste01`) — **variantes digitadas à mão exigem regra de apelido no casamento**, senão
  viram balde órfão. As linhas *(sem tag)* são tráfego sem dono e vão pro agregado da casa.

  **Não há pedido a fazer à casa sobre captura de tag.** O acesso à API segue bloqueado por
  Cloudflare, mas virou otimização: o botão **"Exportar dados"** entrega o CSV hoje.
  ⚠️ Ao parsear no Windows, use `InvariantCulture` — culture pt-BR lê `"120.00"` como 12000.

- **⚠️ [SUPERADO — ver acima] GARGALO CONFIRMADO: hoje não existe atribuição por afiliado nesta conta.** Os **quatro** eixos
  possíveis foram verificados e **todos estão vazios**:
  1. `Source ID` (o `afp`) — vazio em 01/05→31/07/2026;
  2. `Child Affiliate` — vazio no mesmo período;
  3. **Rede de indicados** (Network Afiliado, após sincronizar) — *"Nenhum indicado aprovado na sua rede"*;
  4. seletor **Afiliado** — uma única conta (544865).

  Tudo cai no balde agregado da conta `infinity`. O próprio Maurício confirmou de forma independente:
  *"os dados funcionaram sim, mas foram contabilizados lá na dashboard infinity"*. O rastreamento funciona
  (308 visitas / 72 registros / 48 FTDs / 46 QFTDs em jul), só não se separa por origem.
  Não prova que a segmentação não funcione; prova que **nunca foi alimentada** (quase todo link gerado é a
  URL base, sem `?afp=`; os 288 tagueados do Standby nunca foram distribuídos).

  **⚠️ Atribuição retroativa é impossível** — o tráfego que já entrou sem tag não se reclassifica.

  **Três saídas, em ordem de custo:**
  - **A — tag `afp` (probe pendente).** Clique com `afp=teste01` disparado em 27/07; **conferir em 28/07**
    se o `Source ID` popula. Mais barato e não muda o modelo comercial. É o caminho preferencial.
  - **B — sub-conta na casa** via `wallet.esportiva.bet.br/registro?paff=544865`: o afiliado vira conta
    própria vinculada à Infinity e passa a aparecer em "Rede de indicados" / `Child Affiliate`. É o desenho
    nativo da casa e funciona com certeza — mas exige aprovação da casa e **enfraquece a Infinity como
    intermediária** (o afiliado passa a ter relação direta com a operadora).
  - **C — nosso `/go/:code`**: já funciona e conta clique em tempo real, mas só converte com postback.

> Nota que recontextualiza o legado: como o painel da G8 lança resultado por **digitação manual**
> ("Novo dia"), os números por afiliado de lá foram alguém digitando — não necessariamente uma
> atribuição que a casa entregava pronta.

---

## 6. Riscos e decisões pendentes

1. **Passivo de R$ 32.306,40** — quem honra? Se a AffiliaCore assume, migra como saldo inicial de carteira
   (a carteira do Tier 1, na branch `feat/integracao-affility`, é o lugar). Se a G8 honra, migra só o histórico.
   **Bloqueia o go-live da tela de Financeiro.**
2. **De quem é a conta de afiliado na casa?** — pergunta comercial em aberto, mas o lado técnico está resolvido
   (ver §6.2.1). As tags são séries por casa: `NakataAgency###` (Super Bet V2), `aff###` (Stake) e
   **`infinitw###`** (Esportiva). O prefixo `infinitw` é claramente Infinity-branded, o que sugere sub-conta da
   Infinity; mas **a NFE do legado era emitida pela G8**. Ou seja: a marca é da Infinity, o fluxo de pagamento
   passava pela G8. Confirmar com a casa quem detém o contrato **antes** de prometer atribuição a terceiros.
   ⚠️ Correção de uma afirmação anterior deste documento: as tags **não** são obviamente "da G8" — a evidência
   do prefixo aponta para o contrário.

### 6.2.1 Não é preciso reemitir link: há um pool pronto

> ⚠️ **Atualização 02/08/2026 (§9.4): nem o pool é necessário.** A tag é capturada na visita, não
> cunhada na casa — a AffiliaCore gera link novo a partir do template da casa com tag própria
> (`POST /api/affiliate-links/generate`). O pool abaixo continua válido como estoque de tags já
> distribuídas, mas deixou de ser pré-requisito para dar link a alguém.

O painel legado **não gera** link — ele só **registra** link cunhado na plataforma da casa. As duas formas de
entrada são "cole links (1 por linha), tag extraída de `?tag=` ou `?afp2=`" e import XLSX (`Coluna A: Link,
Coluna B: Tag`). Mas ele tem um terceiro fluxo, que resolve o problema: **atribuir um link do Standby a um
usuário** (`action + user_id + standby_id`).

E o Standby da Esportiva tem **288 links prontos e sem dono**, todos em `go.aff.esportiva.bet`, mesmo path,
param `afp`, com **288 tags distintas** da série `infinitw###` (ex.: `infinitw291`…`infinitw296`).

Consequência prática: para dar um link rastreável a um afiliado novo na Esportiva **não é preciso gerar nada na
casa nem escrever no painel legado** — basta tomar a URL de um standby não usado e apontá-la como `registerUrl`
do afiliado na AffiliaCore. O `/go/:code` embrulha, conta o clique do nosso lado, e a casa reporta pela tag do
link. Zero impacto em qualquer link existente (são links nunca atribuídos).
3. **CPA de 3 camadas com repasse self-service** vira requisito da AffiliaCore ou a Infinity aceita 2 camadas?
   Idem **rede de 4 níveis** vs especial+sub-rede.
4. **ISS varia por casa** (5% / 2% / 2%) — o modelo atual assume taxa única.
5. **REV é 0% em 100% dos cadastros** — a operação legada é CPA-puro. Migrar REV é no-op.
6. Não migrar: os 288 standby da Esportiva, as 7 casas fantasma, e a Universidade (é stub).

---

## 7. Catálogo de features mapeadas

### Portar (sem equivalente na AffiliaCore)

| Feature | O que faz |
|---|---|
| **CPA Abuser** | Detecta CPA abusado e **desconta do saque**, com detalhamento por tag/afiliado no extrato |
| **WhatsApp via Evolution API** | Cria grupo, adiciona participantes e promove admins fixos direto do painel, com seleção de usuários por banco (`evo.devmotion.com.br`, instância única) |
| **Triagem de tag/link** | As 5 visões (com/sem link, standby, com link e sem resultado, produzindo) — é o painel operacional do dia a dia |
| **Acesso de Bets por usuário** | Quais casas cada afiliado enxerga |
| **Meta de CPA mensal** | Meta por competência com progresso ("Feito / Faltam / %"), **zera na virada do mês** |
| **Aprovação com CPA no ato** | Fila pendente/aprovado/rejeitado, define o CPA do indicado ao aprovar; perfil traz nicho e faixa de audiência |

### Médio valor

Chat interno afiliado↔admin com anexo · popups gerenciáveis com dismissal · rede de 4 níveis com árvore expansível ·
premiações (Silver 100K → Diamond 10M, placas) · 2FA Google Authenticator · materiais/banners por categoria +
carrossel no dashboard do afiliado.

### Já coberto (ou melhor) na AffiliaCore

Saque PIX + NFE + ISS + export XLSX (é o Tier 1 da branch `feat/integracao-affility`, ainda **não pushado**) ·
auditoria — a nossa é server-authoritative e append-only; **a deles loga view+IP, que a nossa não faz** (vale portar
o registro de visualização) · avisos/sino · ranking diário.

### Não copiar

Um banco por casa · o fallback silencioso de `?db=` para `main` · Universidade (stub "disponível em breve").

---

## 8. Próximos passos

1. **Decidir o item 6.1** (quem honra os R$ 32.306,40) — bloqueia o Financeiro.
2. Escrever o conversor em `scripts/migracao-infinity/` consumindo os endpoints da §5, com o parser pt-BR
   explícito e os invariantes da §4. Saída: `affiliates`, `affiliate_email_aliases`, `affiliate_configs` (byBrand),
   `houses` (3, manual), `house_results` (2.340 linhas).
3. Seed das 3 casas na instância Infinity com `dataSource:'manual'` e CPA por casa (280/160/110).
4. Links das contas produtivas: consumir o pool de Standby (§6.2.1) em vez de reemitir na casa — a URL vira
   `registerUrl` do afiliado na AffiliaCore, sem escrever no painel legado. Confirmar antes o item §6.2
   (quem detém o contrato na casa).
5. Backlog de features: **CPA Abuser** e **Meta de CPA mensal** primeiro (baratas e de impacto direto no dinheiro);
   **WhatsApp/Evolution** como diferencial comercial.

---

## Anexo — dados extraídos

Planilha de pagamentos (Super Bet V2, modo estrutura) e o dump das tabelas ficaram **fora do repo**, no scratchpad
da sessão, por conterem PII (nome, e-mail, WhatsApp, Instagram, chave PIX). **Não commitar.**
Este documento contém apenas agregados e schema.

---

## 8. ⚠️ A rede migrou, mas nenhum gerente vê a equipe (medido 2026-07-30)

**Estado:** `affiliate_uplines` tem as **141 arestas** da estrutura; `special_affiliates` está **VAZIA**.
A tela de equipe do afiliado (`/network`, `SpecialDashboard`) é liberada por `profile.isSpecial`, que
espelha `special_affiliates/{affiliateId}.active === true`. Resultado: os **19 topos de estrutura** da
Infinity logam e veem só a produção individual. A rede que migramos é visível apenas no `/rede` (admin).

Descoberto ao converter o login do Maurício (`infinitw02`) de admin para afiliado: ele pediu o "perfil de
gerente" e não havia o que mostrar.

**Duas formas de fechar:**

1. **Paliativo** — criar `special_affiliates/{id}` com `active: true` e `subAffiliateIds` derivado da
   subárvore do afiliado em `affiliate_uplines` (a lista é DERIVÁVEL, não se digita). Cobre os 19 sem
   mexer em código. ⚠️ `subAffiliateIds` é lido hoje como **1 nível**; pôr a subárvore inteira na lista dá
   ao gerente a visão completa, que é o que ele espera.
2. **Definitivo** — o desenho do §9 do `REDE-AFILIADOS.md`: o servidor devolve a sub-rede a partir da
   árvore e `special_affiliates` deixa de guardar hierarquia.

**🔒 PRÉ-REQUISITO DE PRIVACIDADE (vale para os dois caminhos).** A rule hoje é
`match /special_affiliates/{id} { allow read: if isSignedIn() }` — ou seja, **qualquer afiliado logado
lê a estrutura de equipe de todos**. Popular a coleção com os 19 gerentes transforma um vazamento
teórico (coleção vazia) em vazamento real de organograma comercial. Fechar para `isAdmin()` (o §9 já
propõe) **antes** de povoar, e mover a leitura do `SpecialDashboard` para o servidor.

**Próximo passo acordado:** registrar o Maurício como especial (piloto de 1), com a subárvore dele, e só
então decidir se replica para os outros 18.

### ✅ Caminho escolhido (2026-07-30): o paliativo virou o definitivo

Os dois caminhos da §8 foram fundidos: em vez de povoar `subAffiliateIds` com uma cópia congelada da
subárvore, o registro do especial ganhou a flag **`fromNetwork`** e o servidor **deriva a sub-rede da
árvore a cada leitura**. Detalhe do desenho e das armadilhas em `REDE-AFILIADOS.md` §9 (bloco ENTREGUE).

**Pré-requisito de privacidade — meio caminho:** a tela do especial já lê por
`GET /api/special-affiliates` (escopado por papel), então o client não depende mais de ler a coleção.
O **fecho da rule** (`read, write: if isAdmin()`) ficou ENCENADO, não aplicado: virou o passo 5 do
runbook abaixo, e só depois do código no ar. Fechar antes derruba a tela de todo afiliado especial —
foi o que aconteceu no Boost em 2026-07-30, com as rules deployadas antes do push.

**Como registrar um gerente (o Maurício é o piloto de 1):**

1. `/admin` → **Afiliados Especiais** (ou a ficha do afiliado) → **Gerir sub-rede**.
2. Ligue **Ativar como afiliado especial** e **Sub-rede automática**.
3. Confira a prévia — ela lista, pelo nome, a equipe que ele passará a enxergar.
4. Salve. O `isSpecial` é espelhado no login dele pelo servidor; no próximo acesso ele cai na `/network`.
5. **Só então** feche a rule de `special_affiliates` (`allow read, write: if isAdmin()` — o alvo está
   escrito no próprio `firestore.rules`) e rode `firebase deploy --only firestore:rules`. Mova a linha
   correspondente de `SIGNED_IN_READ` para `ADMIN_ONLY` em `test/rules/firestore-rules.spec.ts`.

Na Infinity o passo 3 é decisivo: como `special_affiliates` está **vazia** e as **141 arestas** já estão
em `affiliate_uplines`, nenhum sub está pendurado por lista manual → o aviso âmbar de "N afiliados SAEM
da estrutura" **não deve aparecer**. Se aparecer, pare: significa que alguém foi vinculado por fora da
árvore, e salvar mudaria o custo da agência.

**O que o Maurício vê:** a equipe inteira abaixo dele (N níveis) com métricas OTG **+ casas manuais**
fundidas — o que, numa instância OTG-free como a Infinity, é a única fonte que existe. Ele define a
comissão apenas de quem indicou **diretamente**; nos demais o campo aparece desabilitado, explicando que
a taxa é do gerente do meio.

**Depois do piloto:** replicar para os outros 18 topos é repetir os passos 1–4 por afiliado. A decisão de
replicar é do operador — cada gerente que ganha a visão passa a enxergar a produção nominal da equipe.

---

## 9. Pull da Esportiva: como automatizar (medido 2026-07-31)

### 9.1 O endpoint existe e tem a forma certa

O Relatório de Mídia do painel é alimentado por um GET REST limpo, capturado na aba de rede:

```
GET https://wallet.esportiva.bet.br/api/afiliate/544865
      ?startDate=2026-07-01&endDate=2026-07-31&aggregateBy=DAY&groupBy=afp
```

Data inicial, data final e `groupBy=afp` como parâmetros — exatamente a forma de um cron diário,
igual ao que já fazemos com a OTG.

### 9.2 ⛔ Mas os DOIS caminhos estão bloqueados para cliente não-navegador

| Origem | Resultado server-side |
|---|---|
| API do TAP (`api.aff.esportiva.bet`) | **403** — Cloudflare managed challenge |
| BFF do painel (`wallet.esportiva.bet.br/api/…`) | **429** — Vercel Security Checkpoint |

O 429 foi medido com Node fetch em 31/07: devolve a página "Vercel Security Checkpoint", não JSON.
E o botão **"Exportar dados" NÃO ajuda a automatizar** — ele monta o CSV **no navegador**, a partir
do que a página já tem em memória (zero requisição nova quando clicado).

**Logo: o cron diário depende do pedido à casa** (isentar `/api/*` do challenge). É o ÚNICO pedido
que resta — o de capturar a tag caiu (§5.1, a captura já funciona pelo campo `AFP`).

Um terceiro caminho — robô de navegador com sessão logada — foi considerado e **descartado**:
exigiria guardar o cookie de sessão da conta do cliente em infraestrutura nossa e quebra a cada
rotação de sessão ou mudança de checkpoint.

### 9.3 Enquanto isso: export manual → upload (funciona hoje)

O CSV do "Exportar dados" vem em **pt-BR com BOM UTF-8** (`R$ 1.234,56`) e 34 colunas.
⚠️ Ao parsear no Windows use `InvariantCulture` no `TryParse` — culture pt-BR lê `"120.00"` como
12000 e infla tudo por 100.

O adaptador (`src/lib/houseTagImport.ts`) isola a fonte de propósito: trocar "arquivo enviado" por
"puxado da API" é mudar o adaptador, não a tela.

### 9.4 ✅ A tag NÃO precisa ser cunhada na casa — e por isso a geração de link já existe (02/08/2026)

Ao avaliar se a criação automática de link entraria junto com a integração da API, a doc do TAP
respondeu o contrário do que o plano assumia:

- **`af2_build_link` recebe `link_id` + `affiliate_id` (+ `source_id` opcional) e NÃO aceita `afp`
  como entrada.** A própria doc define `afp` como *"parâmetro dinâmico capturado na visita do
  jogador"* — ou seja, a tag entra pela URL, por quem monta o link, não por um cadastro na casa.
- Isso explica os dois probes: **`teste01` (28/07) e `infinitw298` (29/07) apareceram no Relatório
  de Mídia agrupado por AFP sem nunca terem sido emitidos no painel da Esportiva.**

**Consequência:** dar link novo a um afiliado não depende nem da API liberada, nem do pool de 288
standby, nem de pedir tag à casa — basta `houses.registerUrlTemplate` + uma tag nossa. Entregue como
`POST /api/affiliate-links/generate` (admin) + botão "Gerar link" na `/links`; núcleo puro em
`src/lib/linkGeneration.ts` (`buildTaggedUrl`, `suggestTag`, `tagParamForTemplate`).

Regras que o desenho carrega:

1. **Tag de outro afiliado → 409.** Reusar a tag passaria o resultado histórico dele ao novo dono no
   próximo import (o índice do import casa por tag). A checagem varre links **e** apelidos, com a
   mesma precedência do import, e ignora caixa.
2. **Idempotente por afiliado × casa** — regerar atualiza o MESMO `code`, porque o code é o que o
   afiliado já distribuiu.
3. **`buildTaggedUrl` TROCA o valor do parâmetro de rastreio que já vier no template** (colar o link
   de outro afiliado como template daria o crédito à pessoa errada) e preserva o resto da query
   (`utm_*`, `ext_marker`).
4. **Nada de apelido manual para o que sai daqui:** `buildTagIndex` já indexa a tag do link
   atribuído (`origin: 'link'`), então o resultado casa sozinho no próximo import. A tela de vínculo
   (§10) continua sendo para a tag digitada à mão no painel da casa.

⚠️ **O que ainda não está provado:** tag inédita é comprovadamente **capturada** (visita). Que ela
credite **FTD/CPA** segue o mesmo caminho das `infinitw###` em produção, mas só fecha de vez com o
primeiro FTD real numa tag gerada aqui.

**O que a API acrescenta quando a casa liberar** (nada disto bloqueia o de cima):

| Método | Ganho | Chave |
|---|---|---|
| `af2_media_report_op` `group_by=afp` | **o cron diário** — resultado sem export manual | é o valor real |
| `af2_link_op` | lista os templates/`link_id` da casa em vez de colar URL | conveniência |
| `af2_build_link` | monta a URL oficial do template (sem injetar a tag) | conveniência |
| Registration API | cria o afiliado como **conta na casa** | ⚠️ é o modelo sub-conta do §5.1 — muda o comercial |

⚠️ **`af2_build_link` e `af2_link_op` exigem chave de OPERADOR.** A nossa respondeu *"Access to this
label is not allowed"* e não sabemos de que família é. **Pedido à casa, junto com o de isentar
`/api/*` do challenge: dizer se a chave é de operador ou de afiliado.** Se for de afiliado, sobra o
relatório — e a geração de link segue funcionando pelo caminho de cima.

---

### 9.5 ✅ API DESTRAVADA — era o HOST errado (04/08/2026)

A casa respondeu ao pedido com o que faltava: **o host é `https://boapi3.smartico.ai`** (não
`api.aff.esportiva.bet`, nem o `boapi.smartico.ai` da doc). O bloqueio inteiro do §9.2 era isso —
**o host novo não tem Cloudflare**: responde JSON limpo a `curl` e a Node, sem challenge.

**Contrato medido (não é da doc — é o que respondeu):**

```
GET https://boapi3.smartico.ai/api/<metodo>?aggregation_period=DAY&group_by=afp
                                            &date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
header: authorization: <chave>     (cru, sem "Bearer")
```

**A chave da Infinity é de AFILIADO, não de operador** — resolve a dúvida aberta no §9.4:

| método | resultado |
|---|---|
| `af2_media_report_af` | ✅ o relatório por `afp` |
| `af2_link_af` | ✅ 6 destinos da casa (Esportes, Página Inicial, Aposta Pronta, E-sports, Sports Virtual, Esportiva Day) com `destination_url` em template (`{{affiliate_id}}`, `{{tracker}}`) |
| `af2_media_report_op`, `af2_aff_op`, `af2_link_op` | ❌ *"You don't have permissions… user infinity"* |
| `af2_build_link` | ❌ não existe como GET nesse path |

**Reconciliação de julho/2026 — a API devolve EXATAMENTE o export manual**, tag a tag:
`infinitw280` R$ 2.760,00 CPA + 22,48 rev · `292` 1.440,00 + 13,55 · `02` 960,00 + 11,00 ·
`193` 360,00 + 14,26 · `01` 120,00 − 92,14 · (sem tag) − 144,38. Total **CPA R$ 5.640,00**,
rev −175,23, 321 visitas / 75 registros / 49 FTD. Confere com o card do dashboard.

⚠️ **A API NÃO traz contagem de QFTD/CPA — só `commissions_cpa` em R$.** Nosso `qualified_cpa` é
CONTAGEM: `5.640 / 120 = 47`, que bate com o painel, mas isso significa que o conector tem de
**dividir pela régua de CPA da casa** para reconstruir a contagem. É a mesma armadilha do CSV
(§10.1, "CPA é dinheiro"), com uma volta a mais — e ela quebra se a casa mudar o valor do CPA no
meio do período.

⚠️ **Rate limit agressivo:** chamadas seguidas devolvem *"Too many requests to API from the same
account"*. O cron precisa de backoff e de poucas chamadas por dia (uma janela D−1 basta).

Campos por linha: `dt`, `afp`, `visit_count`, `registration_count`, `ftd_count`, `ftd_total`,
`deposit_count`, `deposit_total`, `net_deposits`, `net_pl`, `commissions_cpa`,
`commissions_rev_share`, `commissions_cpl`, `commissions_total`, `balance`, `payments`.

**Consequência:** cai o único bloqueio que não era nosso (§9.2 e a lista de "Bloqueios" do BACKLOG).
O caminho agora é conector + cron diário lendo D−1, reusando o adaptador de `src/lib/houseTagImport.ts`
— trocar "arquivo enviado" por "puxado da API" é mudar a fonte, não a tela. A chave vira secret da
instância (Secret Manager), nunca env em texto.

### 9.6 ✅ ENTREGUE — pull horário + carimbo de frescor (04/08/2026)

A Infinity pediu duas coisas ao ver o §9.5: **atualização de hora em hora** e **a data da última
atualização visível para o afiliado, por casa**. Ambas entregues.

**Pull** — `POST /api/internal/esportiva-pull`, aberto a **cron OU admin** (o Scheduler não tem
token de usuário; o admin não tem o secret — a presença do header `x-cron-secret` decide a porta).
Núcleo puro em `src/lib/esportivaPull.ts`; a gravação reusa a semântica do upload (as datas da
janela são **reescritas**, então rodar de hora em hora nunca duplica).

- **Janela `pullWindow(hoje, 2)`** = hoje + ontem. A casa corrige o dia anterior, e reler é de graça
  porque a data é reescrita.
- **Atribuição pelo MESMO `buildTagIndex` do upload** (links emitidos + apelidos). Fonte única —
  senão a atribuição divergiria entre o cron e a planilha.
- **O agregado do dia (`affiliateId: null`) soma TUDO** — atribuído + tag órfã + tráfego sem tag.
  `dailyAggregate` descarta as atribuídas do mesmo casa|dia quando há agregado explícito, então
  gravar só o resíduo faria o total da casa DESABAR para o que ninguém trouxe.
- **Tag sem dono não vira linha atribuída:** volta em `pending` (ordenada por dinheiro) para a tela
  de vínculo, e o dinheiro dela continua dentro do agregado.
- **Não notifica afiliado** — de propósito: a rodada é horária, e o upload manual já celebra
  resultado novo. Notificar a cada hora viraria spam.
- Erro da casa → **502 com a mensagem dela**; rate limit → até 3 tentativas espaçadas.

**Carimbo de frescor** — `houses/{slug}.lastResultsSyncAt` + `lastResultsSyncSource` (`api` |
`upload`) + `lastResultsDate`, escrito **pelo pull E pelo upload** (a casa que só recebe planilha
também precisa dizer quando foi atualizada). Exposto no `GET /api/houses` (já é `requireAuth`) e
lido por `src/lib/freshness.ts` (puro). Aparece:

- no painel do afiliado, card **"Atualização dos dados"** (`src/components/DataFreshness.tsx`), com
  a ressalva de que **clique é ao vivo, resultado da casa não é** — que é o mal-entendido que o
  carimbo existe para evitar;
- no card de cada casa em `/casas`, ao lado do botão **"Atualizar"** (pull manual).

**Operação (passo do operador):** `ESPORTIVA_API_KEY` no Secret Manager da instância + Cloud
Scheduler de hora em hora batendo em `/api/internal/esportiva-pull` com `x-cron-secret`. As demais
variáveis (`ESPORTIVA_API_BASE`, `ESPORTIVA_HOUSE_SLUG`, `ESPORTIVA_CPA_BASE`) têm default e estão
documentadas no `.env.example`.

⚠️ **`ESPORTIVA_CPA_BASE` é a régua que reconstrói a CONTAGEM de CPA** (a API só manda dinheiro).
Se a casa mudar o valor do CPA, mude aqui no mesmo dia — enquanto isso não acontece, o resto da
divisão aparece em `cpaRemainder` na resposta, na auditoria (`house_results.pull`) e como aviso
vermelho na tela.

---

## 10. Vínculo tag → afiliado (o que destrava a Esportiva por afiliado)

### 10.1 ✅ ENTREGUE — o motor (commit `e574806`)

`src/lib/houseTagImport.ts` (puro) + a coluna `tag` no `houseResults`:

- **`adaptHouseTagReport`** — mapa EXPLÍCITO do cabeçalho da casa para o canônico. Existe por causa
  de um erro de dinheiro: no export a coluna **"CPA" é R$ 2.760,00**, mas o nosso `qualified_cpa` é
  **CONTAGEM** (quem conta é `QFTDS`). Um alias genérico `cpa → qualified_cpa` leria 2760 CPAs e
  multiplicaria o repasse por ~120. Há teste cravando exatamente isso.
- **`buildTagIndex`** — tag→afiliado a partir dos `affiliate_links` já emitidos (a tag sai da
  `registerUrl` por `extractTagFromUrl`) **+** apelidos salvos, com o **apelido SOBREPONDO o link**
  (é a correção humana). Cobre as variantes digitadas à mão (`infinitw280tem`, `infinitw280gay`).
- **`summarizeByTag`** — ordena **pendentes primeiro e por DINHEIRO**: numa lista de dezenas de tags
  o admin tem que ver antes a que carrega R$ 2.760, não a de uma visita.
- **`tagImportTotals`** — invariante da tela: `atribuído + sem-vínculo == total do arquivo`.
- **`attributedRows`** — só linha COM dono é gravada. ⚠️ O resíduo **não** vira `affiliateId: null`:
  no modelo a linha nula é o *agregado do dia*, e `dailyAggregate` DESCARTA as atribuídas do mesmo
  casa|dia — gravar o resíduo como agregado apagaria do total da casa justamente o que foi atribuído.
- `resolveAffiliates` passa a tentar **TAG primeiro** (é a chave que a própria casa usa, e é exata),
  depois e-mail, depois id/nome. Traço/travessão (`—`, como a Esportiva escreve "sem valor") vira
  token **vazio**.

**Validado contra o CSV real de julho** (74 linhas, 0 erro): 47 CPAq em 5 tags, comissão por tag
fechando com o painel da casa.

| AFP | Dias | Visitas | Registros | FTDs | QFTDs | Comissão |
|---|---:|---:|---:|---:|---:|---:|
| `infinitw280` | 11 | 122 | 29 | 23 | 23 | R$ 2.782,48 |
| `infinitw292` | 10 | 60 | 18 | 13 | 12 | R$ 1.453,55 |
| `infinitw02` (Maurício) | 9 | 35 | 13 | 9 | 8 | R$ 971,00 |
| `infinitw193` | 10 | 74 | 11 | 3 | 3 | R$ 374,26 |
| `infinitw01` | 10 | 11 | 1 | 1 | 1 | R$ 27,87 |
| *(sem tag)* | 17 | 12 | 3 | 0 | 0 | −R$ 144,38 |

Outras 7 tags têm visita e zero conversão: `infinitw45`, `infinitw298`, `infinitw299`,
`infinitw280tem`, `infinitw280gay`, `infi`, `teste01`.

### 10.2 ✅ ENTREGUE — a casca (desenho CONFIRMADO pelo Vinicius em 31/07)

**A tela vive DENTRO do modal de import de `/casas`**, não como página nova — é onde o admin já
sobe resultado, o arquivo é o mesmo, e evita ensinar uma segunda tela ao cliente.

Fluxo: sobe o relatório da casa → tags conhecidas casam sozinhas (pelos links já emitidos) → as
desconhecidas aparecem **com o volume em R$** e um seletor de afiliado → vincula → importa.
O apelido fica salvo e não pergunta de novo.

O que entrou:
1. Coleção **`affiliate_tag_aliases/{tagNormalizada}`** — server-only (`isAdmin()`), no padrão de
   `affiliate_email_aliases`. Coleção NOVA, nasce fechada → sem acoplamento de ordem de deploy.
2. Rotas `GET/POST/DELETE /api/tag-aliases` (requireAdmin) + trilha `affiliate.link_tag` /
   `affiliate.unlink_tag`, e os wrappers `fetchTagAliases`/`createTagAlias`/`deleteTagAlias`.
3. No modal de import (`src/pages/Houses.tsx`): lookup COMPOSTO (`composeLookup`) = índice de tags
   (links + apelidos) **depois** o roster por e-mail; painel "Tags do relatório" com pendentes
   primeiro, dinheiro por tag e o seletor de afiliado.

Decisões que a casca fixou:
- **O arquivo é RECONHECIDO sozinho** (`adaptHouseTagReport` na matriz crua, antes do parse). Se
  tem `AFP` mas falta coluna (`detected && !ok`), a tela ERRA em vez de cair no parser genérico —
  lá `cpa` viraria contagem e infla o repasse ~120×.
- **Tag pendente NÃO bloqueia a importação** (`canImportTagReport` ≠ `canImport`): entra só o que
  tem dono, o resíduo fica visível com o total. Travar tudo por uma tag órfã deixaria de fora o
  que já está atribuído — e o bloqueio aqui é de negócio (§ abaixo), não de dados.
- O upload continua **reescrevendo o dia** da casa: vinculou depois, sobe o mesmo arquivo de novo.

Verificado na demo dos emuladores (31/07): CSV no formato da Esportiva → 3 tags pendentes, ordem
por dinheiro, `Atribuído R$ 0,00 + Sem vínculo R$ 3.239,15 == total do arquivo`; vinculou
`infinitw280` → `1 linha(s) a importar` e `Atribuído R$ 2.782,48 · 23 CPA` (QFTDS como CONTAGEM,
não os R$ 8.400 do depósito); import gravou **uma** linha (`superbet__2026-07-30__<afiliado>`),
sem linha agregada para o resíduo, com a trilha `affiliate.link_tag` na /auditoria.

⚠️ **Bloqueio de negócio (não técnico):** o Maurício ainda não respondeu **de quem são** as tags
`infinitw280`, `infinitw292`, `infinitw193` e `infinitw01` (a `02` é dele), nem se
`infinitw280tem`/`infinitw280gay` são a mesma pessoa da `280`. A tela existe justamente para ele
resolver isso sozinho quando responder.
