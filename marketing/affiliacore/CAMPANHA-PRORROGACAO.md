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

Falta (nesta ordem):
1. **OPERADOR — resolver o "Payment error"** da conta de anúncios. Sem isso nada
   entrega, e a página de cobrança não abre na sessão do MBS (pede a conta
   pessoal do Facebook).
2. Terminar o rascunho: trocar a imagem pelo criativo novo (injeção via canvas),
   colar o texto acima, apontar pra `/ebook`, orçamento R$ 15/dia, fim em 03/08,
   apagar o anúncio "E4 oferta" herdado.
3. **Publicar = ação do Vinicius** (é compra).
4. **Segunda-feira, 04/08: subir o produto na Kiwify p/ R$ 67.** A LP e o
   cronômetro viram sozinhos; o preço do produto no painel **não**. Se não subir,
   a prorrogação anunciada vira escassez falsa — que é justamente o que este
   ângulo diz não fazer.
