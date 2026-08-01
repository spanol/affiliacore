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
