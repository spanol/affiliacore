# Plano: Tipos de deal (modelo direto × modelo gerenciado)

> 2026-08-15. Origem: call com a Infinity (gravação `2026-08-15 20-28-44.mp4`,
> transcrição em anexo no fim do doc). O cliente pediu uma "Loja de Deals" no
> estilo do `novaeraaffiliates.com/bets`, com CPA escondido do afiliado, e um
> fluxo em que **o gerente define a comissão** e **só o suporte emite o link**.
>
> Enquadramento escolhido (Vinicius, 15/08): isso NÃO é "trocar o marketplace
> pelo jeito da Infinity". É um **tipo de deal** selecionável, com o modelo
> atual e o modelo Infinity convivendo, e espaço para um terceiro quando outro
> cliente pedir. Ver `PESQUISA-AFFILITY.md` (P2, marketplace entregue),
> `PESQUISA-PRESETS-DEALS.md` (catálogo de presets) e `REDE-AFILIADOS.md`
> (rede/upline, de onde sai metade das regras deste plano).

## TL;DR

1. **Um deal ganha um campo `type`.** O tipo é uma **política declarativa**
   (`src/lib/dealType.ts`, puro): quem enxerga as taxas, quem precifica o
   afiliado, quais KPIs o card mostra. Nada de `if (instancia === 'infinity')`
   espalhado por página e rota.
2. **Dois tipos na entrega:** `direto` (o de hoje, default, regressão zero) e
   `gerenciado` (o da Infinity). Adicionar um terceiro é escrever uma entrada
   no catálogo, não mexer no fluxo.
3. **Esconder o CPA é trabalho do SERVIDOR.** Não basta não renderizar: o
   `GET /api/deals` tem que devolver o deal já sanitizado para quem não é
   admin, senão o valor está a um devtools de distância.
4. **A precificação pelo gerente reusa o que já existe** (`resolveSpecialRecord`
   + `isDirectDownline` + `resolveRepasseCap`), mas expõe **dois defeitos reais
   do caminho atual** que precisam ser corrigidos antes: o teto de repasse
   ignora a taxa por casa, e a gravação vai para a taxa de topo em vez de
   `byBrand`. Detalhe no §5.3 e §5.4.
5. **No tipo `gerenciado`, aprovar NÃO pode gravar a taxa do deal no afiliado.**
   Hoje aprovar faz as duas coisas num batch só; manter isso apagaria os R$ 100
   que o gerente definiu, sobrescrevendo com os R$ 110 do deal. É o maior risco
   de dinheiro do plano.
6. **Casa criada em `/casas` passa a criar o deal junto**, como rascunho
   inativo. Precedente: é exatamente o que `PESQUISA-PRESETS-DEALS.md` decidiu
   para os presets ("nunca publica direto no marketplace sem o admin revisar").

## 1. O conceito: tipo como política, não como bifurcação

O erro fácil aqui é tratar "modelo Infinity" como um flag booleano e sair
espalhando condicional. O que muda entre um cliente e outro não é um bit, é um
**conjunto de respostas** para as mesmas quatro perguntas:

| Pergunta | `direto` (hoje) | `gerenciado` (Infinity) |
|---|---|---|
| O afiliado vê as taxas do acordo? | Sim | Não |
| Quem define a comissão do afiliado? | Admin | O gerente (upline direto) |
| O link sai junto da aprovação? | Sim | Não, é um passo à parte do admin |
| Que KPIs o card mostra? | CPA, RevShare, ciclo, geo | Baseline, rollover, ciclo, GGR |

Núcleo puro novo, `src/lib/dealType.ts`, importável pelo client e pelo
`server.ts` (a regra do repo: o server não importa `services/`):

```ts
export type DealTypeId = 'direto' | 'gerenciado';
export type DealKpiId = 'cpa' | 'revshare' | 'baseline' | 'rollover' | 'ggr' | 'cycle' | 'geo';

export interface DealTypePolicy {
  id: DealTypeId;
  label: string;                    // rótulo do radio no /acordos
  hint: string;                     // linha de ajuda embaixo do radio
  showRatesToAffiliate: boolean;    // decisão de SEGURANÇA (usada pelo servidor)
  pricedBy: 'admin' | 'upline';     // quem define a taxa do afiliado
  kpis: DealKpiId[];                // decisão de LAYOUT (usada pelo card)
}
```

`showRatesToAffiliate` e `kpis` são propositalmente redundantes: um é decisão de
segurança (o servidor corta o campo), o outro é decisão de layout. Segurança não
se deriva de lista de exibição. O acoplamento entre os dois vira **teste de
invariante**: se `showRatesToAffiliate === false`, `kpis` não pode conter `cpa`
nem `revshare`.

**Default por instância:** `VITE_DEAL_TYPE_DEFAULT` (ausente = `direto`), no
mesmo padrão de `VITE_MARKETPLACE_ENABLED`. Serve para duas coisas: pré-marcar o
radio no `/acordos` e carimbar o tipo dos deals criados automaticamente a partir
de uma casa (esses não têm humano para escolher). A Infinity declara
`gerenciado` no `apphosting.infinity.yaml`.

## 2. Campos novos no `Deal`

`src/lib/deal.ts` hoje tem `model`, `cpaValue`, `revPercentage`, `cycle`,
`currency`, `geo`, `active`, `order`. Entram:

| Campo | Tipo | Significado |
|---|---|---|
| `type` | `DealTypeId` | ausente = `direto` (retrocompatível, sem migração) |
| `baseline` | `number` | valor de baseline em R$, o que a Nova Era mostra como "BASELINE" |
| `rollover` | `number` | multiplicador (2 = "rollover 2x") |
| `ggrPercentage` | `number \| null` | "GGR, se tiver" (o cliente disse "se tiver") |

**Premissa (§10.1):** baseline, rollover e GGR são **informativos**. Entram no
card e no rótulo, não no núcleo de comissão. `commission.ts` não muda uma linha.
Se algum deles tiver que entrar em cálculo, é outro tamanho de trabalho e outro
plano.

`num()` blinda os três na entrada, como já faz com CPA/REV. `normalizeDealInput`
valida por tipo: um deal `gerenciado` sem baseline é rejeitado com mensagem
pt-BR, do mesmo jeito que um deal `cpa` sem valor de CPA já é hoje.

## 3. Máquina de estados ciente do tipo

`src/lib/partnership.ts` hoje: `requested → approved | rejected`, e
`approved → discontinued`. O tipo `gerenciado` insere um estado no meio:

```
direto:      requested ──────────────────────────────► approved ──► discontinued
                   └──► rejected                            

gerenciado:  requested ──(gerente precifica)──► priced ──(admin emite o link)──► approved ──► discontinued
                   └──► rejected                    └──► rejected
```

Novo status `priced`. Rótulos (sem travessão, conforme a regra de copy):

- Para o afiliado: `requested` = "Aguardando seu gerente", `priced` = "Aguardando o link".
- Para o gerente: `requested` = "Defina a comissão".
- Para o admin: `priced` = "Pronta para o link".

`canTransition(from, to, policy?)` ganha o terceiro parâmetro. **Policy omitida
cai no comportamento de hoje** (`direto`), então nada que já chama a função
quebra. O mapa de transições permitidas passa a sair da política, não de uma
constante única.

## 4. Quem faz o quê

### 4.1 Esconder o CPA é do servidor

`GET /api/deals` passa a sanitizar por papel antes de responder. Função pura em
`dealType.ts`, testável sem Firebase:

```ts
export function sanitizeDealForViewer(deal: Deal, viewer: 'admin' | 'affiliate'): Deal
```

Para `viewer === 'affiliate'` e política com `showRatesToAffiliate === false`,
`cpaValue` e `revPercentage` saem do objeto (não viram `0`, o que reintroduziria
o problema de "ausência ≠ R$ 0" do outro lado). A tela nunca decide isso
sozinha; ela só deixa de renderizar o que não recebeu.

O gerente **não precisa** ver o CPA do deal para trabalhar: a taxa própria dele
já chega por `GET /api/affiliate-configs`, que escopa por papel. Então
`gerenciado` esconde as taxas do deal de todo mundo que não é admin, sem
exceção para o especial. Menos superfície, mesma capacidade.

### 4.2 O gerente precifica: rota nova, guardas velhas

`POST /api/partnerships/:id/price` (`requireAuth` + `requireMarketplace`).
Sequência, toda ela reusando o que já está no ar:

1. A parceria existe e está em `requested`; o deal é `pricedBy: 'upline'`.
2. `resolveSpecialRecord(callerAffiliateId)` + `resolveIsSpecial` (fonte única
   de "especial ativo").
3. `isDirectDownline(subId, callerAffiliateId, …)`. É a regra "VISÃO ≠ DINHEIRO"
   do `REDE-AFILIADOS.md` §9: o gerente enxerga a subárvore inteira mas só
   precifica o filho **direto**. Sem isso, o gerente do topo mexeria no repasse
   de um neto e mudaria o spread do gerente do meio pelas costas dele.
4. Teto de repasse: `exceedsRepasseCap(rates, resolveRepasseCap(ownCfg, brandKey))`.
   É o caso da call: Esportiva paga 110 ao gerente, ele repassa 100, fica com 10.
   Tentar 120 é 400 com o teto na mensagem.
5. Grava `affiliate_configs/{subId}.byBrand[brandKey]` (merge, preservando as
   outras casas) + `audit_logs` `config.update` no MESMO batch, autor = o
   especial carimbado pelo token. Igual ao que `/api/special/sub-config` já faz.
6. Status vai para `priced`.

### 4.3 O teto de repasse tem que ser POR CASA na rota nova

`server.ts:1025` chama `resolveRepasseCap(ownCfg)` **sem `brandId`**, então o
teto de hoje é a taxa de TOPO do gerente.

**Correção de rumo (16/08, ao implementar):** na primeira leitura registrei isso
aqui como defeito dos dois call sites. Está errado quanto ao antigo. A
`/api/special/sub-config` grava a taxa de **topo** do sub e não tem casa nenhuma
no contexto: comparar topo com topo é o certo ali, e passar um `brandKey`
arbitrário seria pior. O defeito só existe onde o gesto é por casa, que é
exatamente a rota nova: no cenário da call o gerente tem 110 **na Esportiva**
com topo zerado, e o teto de topo o impediria de repassar até R$ 1.

Então: `resolveRepasseCap(ownCfg, brandKey)` só na rota de precificação. Cai na
taxa de topo para quem não tem override, igual ao que o `CLAUDE.md` já registra
para `calcAffiliatePayout`. Coberto pelo teste "teto de repasse é POR CASA".

### 4.4 Achado: hoje a gravação vai para a taxa de topo

`/api/special/sub-config` grava `{cpaValue, revPercentage}` na **raiz** do
`affiliate_configs`. Para "a comissão do meu sub", isso está certo no modelo de
2 níveis com uma casa. No modelo da Infinity o gerente precifica **por casa**
(100 na Esportiva, outra coisa na LEON), então a rota nova grava em
`byBrand[brandKey]`, exatamente como o caminho de aprovação do admin já faz.
A rota antiga fica como está: são dois gestos diferentes, "a taxa geral do meu
sub" e "a comissão dele nesta casa".

### 4.5 A aprovação em `gerenciado` NÃO reescreve a taxa

Este é o risco de dinheiro do plano. Hoje `PATCH /api/partnerships/:id` com
`status: 'approved'` faz, num batch: grava `byBrand[brandKey]` com as taxas **do
deal** e emite o link. Se isso rodar num deal `gerenciado`, os R$ 110 do deal
sobrescrevem os R$ 100 que o gerente definiu, e a agência passa a pagar o
afiliado como se fosse o gerente. O spread evapora sem erro na tela.

**Regra final (mais simples que a do rascunho):** a taxa do deal é aplicada
quando a aprovação vem de `requested`, e **não** quando vem de `priced`. O
estado já carrega a informação, então não é preciso consultar o tipo. O caso
bonito que isso cobre de graça: afiliado sem gerente num deal gerenciado é
aprovado direto de `requested` e recebe os termos da oferta, que é o correto,
porque sem intermediário não há spread para descontar.

Coberto pelo teste "aprovar a partir de priced emite o link e PRESERVA a taxa do
gerente", que assere o valor final do `byBrand` e a ausência de `config.update`
na trilha.

### 4.6 O link continua sendo do master

Nada a inverter aqui: a emissão já é `requireAdmin`, e o `CLAUDE.md` já registra
"cunhar o link da CASA continua sendo do master". O pedido do cliente coincide
com o invariante que o repo já tem. O que muda é só a **fila**: passa a existir
uma aba de parcerias em `priced` esperando o link.

O motivo que ele deu ("a Esportiva a gente pausou e o gerente sem querer deixa o
afiliado iniciar") pede uma trava a mais, que hoje não existe: pausar a casa em
`/casas` não tira a oferta da vitrine.

**Como ficou:** o `GET /api/deals` **filtra na leitura** os deals de casa
inativa para quem não é admin, em vez de desativar os deals em cascata. O gesto
fica reversível (reativar a casa devolve a oferta sem tocar em dado) e o admin
continua vendo o acordo na lista dele. A precificação e a emissão de link também
recusam acordo pausado.

### 4.7 Casos de borda

| Situação | Comportamento |
|---|---|
| Afiliado sem upline (topo da estrutura) | A solicitação cai direto na fila do admin, que precifica e emite. É o `pricedBy: 'admin'` aplicado àquela request |
| Upline existe mas não é especial ativo | Mesmo fallback: fila do admin |
| Gerente sem taxa própria naquela casa | Bloqueia com mensagem própria. `hasConfiguredRate` distingue "0 configurado" de "ausente"; ausência ≠ R$ 0, então o teto não é zero, é inexistente. Copy: "Você ainda não tem taxa nesta casa. Peça à agência antes de definir a comissão do seu afiliado." |
| Deal desativado entre a solicitação e o link | O passo do link recusa e explica. É o cenário da casa pausada |
| Afiliado troca de gerente com a request em `requested` | A fila segue o upline **atual** na hora da leitura, não um `uplineId` congelado na request |
| Gerente tenta precificar um neto | 403 do `isDirectDownline`, mensagem já existente |

## 5. A casa cria o deal

`POST /api/houses` passa a criar, no mesmo batch, um `deals/{id}` com
`active: false`, `type` = default da instância, `houseId` = slug,
`operatorName` = nome da casa, e as taxas/KPIs vazios.

Nasce **inativo** de propósito: um card sem baseline nem rollover na vitrine do
afiliado é pior do que card nenhum. O admin abre `/acordos`, preenche e ativa.
Mesma decisão de `PESQUISA-PRESETS-DEALS.md` para os presets. **Premissa
(§10.2).**

Para o admin não descobrir isso por acaso, o rascunho pendente entra no card
"Saúde da configuração" do `/admin` (entregue em `09f2561`), como mais uma linha
de pendência.

## 6. Telas

| Tela | Mudança |
|---|---|
| `/acordos` (admin, `Deals.tsx`) | Radio "Tipo de acordo" no modal, com o hint de cada tipo. Campos de baseline/rollover/GGR aparecem conforme os `kpis` da política. Badge do tipo no card. Nova aba "Aguardando link" com a fila de `priced` |
| `/parcerias` (afiliado, `Partnerships.tsx`) | Vira a vitrine: logo da casa (o `houseLogoOrPreset` já existe e já está em uso ali), KPIs vindos da política, sem CPA quando o tipo esconder. Estados novos no acompanhamento |
| `/network/afiliados` (gerente, `SpecialSubAffiliates.tsx`) | Seção "Solicitações de parceria": lista dos diretos que pediram, campo de comissão com o teto visível ao lado, e o aviso de que o link sai depois com a agência |
| `/casas` (`Houses.tsx`) | Nada na tela. O efeito é no servidor. Vale um toast dizendo que o acordo foi criado como rascunho |

## 7. Fases

Cada fase entrega com teste, como manda o `REVIEW-TEST-PLAN.md`.

**F1 · Núcleo puro. ✅ ENTREGUE (`e609965`).** `src/lib/dealType.ts` (catálogo +
política + `sanitizeDealForViewer` + `effectivePricedBy`), campos novos e
validação por tipo em `deal.ts` (+ `buildDraftDealFromHouse`), `canTransition`
ciente de quem precifica e rótulos por audiência em `partnership.ts`. 71 testes,
incluindo o invariante `showRatesToAffiliate` × `kpis` e a retrocompatibilidade
de `canTransition` sem o parâmetro novo.

**F2 · Servidor. ✅ ENTREGUE.** Sanitização e filtro de casa pausada no
`GET /api/deals`; `POST /api/partnerships/:id/price` (gerente, reusando
`resolveIsSpecial` + `isDirectDownline` + teto por casa); `PATCH` de aprovação
com transição ciente do tipo e sem reescrever taxa vinda de `priced`; rascunho
de acordo no `POST /api/houses`; `resolveDirectUpline` novo em
`specialNetwork.ts` para rotear a solicitação ao gerente certo; wrapper
`pricePartnership` no service. 18 casos de supertest em `server.test.ts`.

**F3 · Admin `/acordos`.** Radio, campos condicionais, fila de link.

**F4 · Vitrine do afiliado.** Card e estados.

**F5 · Fila do gerente.** Seção em `/network/afiliados`.

**F6 · Verificação e rollout.** Roteiro na demo emulada (`npm run dev`, skill
`/verify`, zero contato com projeto real): criar casa e ver o rascunho nascer,
publicar um deal `gerenciado`, solicitar como afiliado, precificar como gerente
(inclusive tentando estourar o teto e tentando precificar um neto), emitir o
link como admin, e conferir que o `byBrand` do afiliado terminou com o valor do
**gerente**. Depois, `VITE_DEAL_TYPE_DEFAULT: gerenciado` no
`apphosting.infinity.yaml`.

## 8. Compatibilidade

- Deal sem `type` é `direto`. **Não há migração de dados**: o normalizador
  resolve o default na leitura, igual ao que `cpaCurrency` já faz.
- Instância sem `VITE_DEAL_TYPE_DEFAULT` continua idêntica ao que é hoje.
- Instância com marketplace desligado (o default do produto) não vê nada disso:
  as rotas seguem respondendo 404 `MARKETPLACE_DISABLED`.
- O status `priced` só é alcançável em deals `gerenciado`, então nenhuma
  parceria existente muda de estado.

## 9. Decisões em aberto

1. **Baseline, rollover e GGR são informativos?** Premissa: sim (é o que o
   painel de referência faz). Se algum entrar em cálculo de comissão, o plano
   muda de tamanho porque encosta em `commission.ts`.
2. **Casa nova cria o deal ativo ou rascunho?** Premissa: rascunho inativo, pelo
   precedente dos presets. Se for para nascer ativo, é uma linha, mas a vitrine
   passa a poder mostrar card vazio.
3. **Onde vive a fila do gerente?** Premissa: `/network/afiliados`, que já é a
   tela de "Meus afiliados" dele.
4. **GGR é percentual ou texto livre?** Premissa: percentual (`number | null`),
   porque texto livre não dá para comparar entre casas depois.

## Anexo: transcrição da call (15/08/2026, 5min07)

Transcrita com faster-whisper (`medium`, pt-BR). Correções recorrentes do
reconhecedor: "loja de dios" = loja de deals, "QPI/QP" = KPI, "rolova um X" =
rollover 2x, "base online" = baseline, "Jill" = deal.

> **[00:00]** …o ideal seria estar aqui mostrando pro afiliado, tipo acordos pro afiliado. Acredito que seja até mais prático, iria tirar o trabalho do suporte.
> **[00:35]** Ficar como Loja de Deals, onde vai aparecer pra ele uma imagem parecida com esta. Este aqui não vai ter o valor do CPA, apenas a baseline e KPI. Só nessa imagem vai ter, sei lá, Esportiva, LEON e outras diversas. Aí o afiliado vai solicitar o link dele.
> **[01:11]** Na hora que ele solicitou, o ideal seria ter esses KPIs aqui: rollover, 2x, pagamento semanal, GGR se tiver. O CPA, quem vai passar pra ele vai ser o gerente dele.
> **[01:20]** No painel nosso aqui a gente consegue colocar o CPA do afiliado, a margem. Ele solicitou aqui, iria aparecer pro gerente dele, essa parte das outras casas também.
> **[01:57]** Na Esportiva é 110 que ele tem; ele vai colocar 100 e vai pegar 10 reais. Exatamente.
> **[02:12]** Porque hoje só o Admin consegue fazer isso. Deixa esse trabalho pro gerente fazer, tira um pouco do trabalho do suporte: é o gerente que decide quanto de CPA ele vai tirar do afiliado dele.
> **[02:33]** Em questão de comissões, a gente só vai decidir a dos gerentes; dali pra baixo, na rede dele, fica a critério dele, sem precisar acionar o suporte toda vez.
> **[02:55]** A Loja de Deals basicamente tem que ficar com a tela igual a essa aqui. **[03:01]** Aí vai estar a baseline, o KPI e rollover 2x. Basicamente isso.
> **[03:08]** Quando ele solicitar, o ideal seria ter algo como solicitação de link, pra ser gerado pelo suporte. O ideal seria pro painel admin ou pro suporte ficar responsável por isso, até pra evitar que, vamos supor, a Esportiva a gente pausou a operação e o afiliado queira iniciar, e sem querer o gerente dele acabe deixando ele iniciar. Esse trabalho de link deixa apenas pro suporte.
> **[03:57]** Ele clicou aqui, solicitou o deal; o gerente dele vai colocar a comissão dele lá e o suporte vai colocar os links.
