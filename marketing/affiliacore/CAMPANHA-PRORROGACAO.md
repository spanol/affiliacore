# Campanha "prorrogação honesta" — guia R$ 47 até 03/08 (2026-08-01)

Ângulo escolhido pelo Vinicius: **honestidade radical**. O fato é que a primeira
semana teve **0 venda** (Kiwify, filtro "Tempo todo": 0 vendas / R$ 0,00), então
o anúncio diz isso em vez de inventar prova social. Foi descartada a versão
"pelo sucesso de vendas": afirmação falsa a consumidores em mídia paga.

## Configuração

| Item | Valor |
|---|---|
| Campanha | duplicata de `Guia R$47 — Vendas (InitiateCheckout) — IG` (id da cópia `120250517776030412`) |
| Objetivo | Vendas, otimizando **InitiateCheckout** |
| Orçamento | **R$ 15/dia × 3 dias ≈ R$ 51** com impostos (~13,8%) |
| Janela | até **03/08 23h59** (quando o preço sobe pra R$ 67) |
| Público | `BR Advantage+ — IG only — IC` (herdado, 25–44, IG only) |
| Destino | `https://affiliacore.com.br/ebook` |
| Criativo | `ad-prorrogado.png` — upload no Ads Manager, **não vira post do feed** |

## Texto do anúncio

**Texto principal:**

> Primeira semana do guia: nenhuma venda. 📉
>
> Dava pra escrever "últimas vagas" ou colar print de faturamento — é o que o
> nicho faz. Prefiro dizer o que houve: ninguém comprou ainda, e o preço de
> lançamento venceu ontem.
>
> Estendi por 3 dias, até domingo (03/08). Depois vai a R$ 67 e não volta.
>
> O que tem dentro: como uma agência de afiliados é montada no mercado
> regulamentado — CPA, RevShare, NGR, spread e override com cláusulas de
> contratos reais; a lei de julho/2026 explicada pra quem divulga; CNPJ, CNAE e
> contratos; e o caso real da operação que virou nossa plataforma.
> ~60 páginas, 7 dias de garantia incondicional.
>
> affiliacore.com.br/ebook

**Título:** Guia completo por R$ 47 até domingo
**Descrição:** ~60 páginas · 7 dias de garantia
**CTA:** Saiba mais

## Estado (fim da sessão de 01/08)

Feito:
- **5 campanhas antigas desligadas** (3 estavam ON travadas em "Payment error" e
  retomariam R$ 70/dia juntas assim que o pagamento voltasse).
- **LPs prorrogadas p/ 03/08 e DEPLOYADAS** (commit `1276f9d`, deploy do
  Vinicius). Verificado em produção no navegador real: `.js-price` = 47 em todos
  os pontos, 4 blocos de prazo visíveis, contador em 2d05h, R$ 67 riscado,
  título `(R$ 47 até 03/08)`, checkout apontando p/ `pay.kiwify.com.br/83JFB9e`.
- **Cronômetro do checkout Kiwify corrigido.** Ele exibia **"Preço de lançamento
  encerrado"** enquanto a LP anunciava prorrogação — e a data guardada era
  **29/12/2027** (contagem de ~1,5 ano, escassez sem lastro). Passou p/
  **03/08/2026 23:59**, salvo e conferido no checkout ao vivo: R$ 47,00 e
  contador correndo em 53h, batendo com a LP.
  *Como editar:* o campo é **flatpickr** — o setter nativo do React reverte;
  use `input._flatpickr.setDate(new Date(...), true)`.
- **Criativo pronto** (commit `1df2979`): PNG + segs em curvas.
- **Campanha duplicada, em rascunho**, com 2 anúncios herdados.

## ✅ NO AR (01/08, crédito adicionado pelo Vinicius)

Pagamento resolvido (as campanhas saíram de "Payment error"). Duas campanhas
ativas, **R$ 35/dia somados ≈ R$ 40/dia com impostos**:

| Campanha | Estado | Orçamento | Fim |
|---|---|---|---|
| `Guia R$47 - Prorrogado 03/08 - Vendas (IC) - IG` | **In review** | R$ 15/dia | ⚠️ **sem data** |
| `[7/13/2026] Promoting…` (mensagens) | **Active** | R$ 20/dia | 08/08 |

O anúncio do ebook ficou com: texto principal da prorrogação (verbatim acima),
título "R$ 47 até domingo, depois R$ 67", destino `/ebook`, IG-only,
otimizando InitiateCheckout. O anúncio "E4 oferta" herdado ficou OFF.

⚠️ **DUAS PENDÊNCIAS DE PRAZO — as duas caem na segunda, 04/08:**
1. **PAUSAR a campanha do ebook.** O editor Advantage+ não expõe data de
   término (só "Ad scheduling: run all the time"), então ela **não para
   sozinha** quando a promoção vencer. Deixar rodando = anunciar R$ 47 depois
   que o preço subiu.
2. **Subir o produto na Kiwify p/ R$ 67.** A LP e o cronômetro do checkout
   viram sozinhos; o preço do produto no painel **não**.

### Trade-off assumido no criativo

O criativo `ad-prorrogado.png` **não** entrou: três caminhos de troca de imagem
no editor Advantage+ falharam (Select → abre "Related media"; a lixeira não
remove; `media_library` redireciona). Ficou o **g1-balcão**, que é a arte que
rendeu os 31 InitiateCheckout a R$ 2,33 — é on-brand e não contradiz a
mensagem, que vive no texto. A arte nova segue pronta em
`generator/out-ad-prorrogado/` para quando o caminho de upload for resolvido.

⚠️ A Meta avisou, ao ligar: **com R$ 15/dia a estimativa é ~0–1 resultado/dia.**
Recusei o upsell de orçamento (a decisão de R$ 15 é do Vinicius).

## 🛑 DESFECHO (04/08) — ebook encerrado como frente de investimento

Decisão do Vinicius ao ver os números: **parar de investir no ebook e focar
100% em captação de novos clientes.** A campanha de mensagens (R$ 20/dia até
08/08) é a de captação e **permanece**; a do ebook sai do ar.

### O que a prorrogação produziu (verificado na fonte)

**Vendas: 0.** Kiwify, filtro "Tempo todo": 0 vendas, R$ 0,00. Na aba "Todas"
só os 2 Pix do próprio Vinicius de 23/07, nunca pagos — **nenhum carrinho
pendente novo**, ou seja, ninguém que abriu o checkout chegou a preencher o
formulário.

**Mas o topo e o meio do funil melhoraram muito** (GA4 `G-X5572SJY82`,
01–04/08 vs. a campanha de 23–26/07):

| Métrica | 01–04/08 | 23–26/07 |
|---|---|---|
| Usuários | 93 | 178 |
| Tempo médio na LP | **12 s** (`/guia`) | 2–6 s |
| `ebook_checkout_click` (pessoas) | **9** | 3 |
| `begin_checkout` (pessoas) | **10** | 5 |
| Vendas | 0 | 0 |

Com **metade do tráfego**, o dobro de pessoas clicou no CTA e chegou ao
checkout. O diagnóstico antigo ("o gargalo são os primeiros 5 segundos da LP")
deixou de valer: a LP passou a segurar. O que não converte agora é o
**checkout/oferta** — 10 pessoas abriram e nenhuma preencheu.

⚠️ **Correção de fato:** o doc registrava o destino do anúncio como `/ebook`,
mas o tráfego caiu na **`/guia`** (64 usuários × 10 na `/ebook`). Como a
`/guia` é `noindex`, esses 64 usuários só podem ter vindo do anúncio — é a
prova de que a campanha entregou.

### Estado das pendências de prazo

1. **Virada de preço nas LPs: ✅ automática, funcionou.** `/ebook` e `/guia`
   viraram sozinhas em 04/08 — `.js-price` = 67 em todos os pontos, âncora
   riscada removida, os 4 blocos de prazo escondidos, FAQ reescrito no passado
   ("Subiu. R$ 47 era o preço de lançamento"), título limpo. O cronômetro do
   checkout Kiwify zerou junto ("Preço de lançamento encerrado").
2. **Preço na Kiwify: ❌ segue R$ 47** — e **fica assim**, já que o ebook não
   recebe mais investimento. Enquanto isso a LP anuncia 67 e o checkout cobra
   47 (divergência a favor do cliente, sem escassez falsa). Se um dia a página
   voltar a receber tráfego, resolver antes.
3. **PAUSAR a campanha do ebook: ❌ PENDENTE, é o único item que ainda gasta.**
   Ela não para sozinha (Advantage+ sem data de término) e o texto no ar
   anuncia um prazo vencido.

### ✅ Campanha do ebook PAUSADA (04/08) + números finais

Feito no Ads Manager (`act=1038808991862700`), confirmado pelo toast "Campaign
updated" e pela coluna Delivery = **Off**. A coluna **Ends** dizia **"Ongoing"**
— confirmação de que ela realmente nunca pararia sozinha.

Números do range **Maximum** (o "Last 30 days" corta o dia de hoje):

| Campanha | Estado | Orçam. | Gasto | Resultado | Custo |
|---|---|---|---|---|---|
| `Guia R$47 - Prorrogado 03/08 - Vendas (IC) - IG` | ⏹ **Off (pausada agora)** | R$ 15/d | **R$ 42,06** | 27 Initiate Checkout | **R$ 1,56** |
| `[7/13/2026] Promoting…` (mensagens) | ▶ **Active** — termina **08/08** | R$ 20/d | R$ 236,61 | **32 conversas** | R$ 7,39 |
| `Guia R$47 — Vendas (IC) — IG` | Off | — | R$ 72,13 | 31 Initiate Checkout | R$ 2,33 |
| `Post: "Novo: o guia da AffiliaCore"` | Off | — | R$ 57,70 | 281 cliques no link | R$ 0,21 |
| `Post IG: Dá pra montar uma agência…` | Off | — | R$ 10,97 | 3 conversas | R$ 3,66 |
| `Post IG: A conta que todo gestor…` | Off | — | R$ 19,22 | 6 conversas | R$ 3,20 |
| **Conta inteira** | | | **R$ 438,69** | 42 conversas · **0 Purchases** | R$ 11,54/conversa nova |

**O criativo da prorrogação foi o melhor de todos os do ebook: R$ 1,56 por
Initiate Checkout** (contra R$ 2,33 do anterior) — e ainda assim **0 compras**.
A coluna `Purchases` está vazia em TODAS as linhas, o que confirma pelo lado da
Meta o que a Kiwify já dizia. Total queimado no ebook: **R$ 171,89** (42,06 +
72,13 + 57,70) por zero venda.

**Captação (o que fica de pé):** as 3 campanhas de mensagem somam **R$ 266,80**
→ **38 conversas novas ≈ R$ 7 cada**. É o único canal da conta que produz
alguma coisa. ⏰ **A campanha de mensagens termina em 08/08** — decidir antes
disso se renova, com quanto, e se os R$ 15/dia liberados do ebook vão para ela.

### Nota de acesso (resolvida)

A conta de anúncios **não é alcançável pelo Chrome do perfil `Default`** (FB
pessoal do Vinicius, IG `@subiu.dev`): lá o único portfólio é `Campaign Factory`
e o ID `1038808991862700` não aparece nem na busca. Ela vive no **`Profile 4`**
do Chrome (conta Google `ponycanoon12@gmail.com`), onde a extensão Claude foi
instalada em 04/08 — a partir daí o MCP opera normalmente. Ao conectar, **há 2
navegadores na lista e o `name` é posicional**: selecione pelo `deviceId`.
Gotcha: `?date=maximum` na URL trava o Ads Manager em "Loading your ad account"
— entre sem o parâmetro e troque o range pela UI.
