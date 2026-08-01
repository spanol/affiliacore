# Série 3 — "O painel por dentro" (agosto/2026)

Eixo decidido com o Vinicius em 2026-08-01: **produto/features**. A série 1 foi
lançamento, a 2 foi lucratividade/simulador, a do ebook foi infoproduto — esta
mostra **o que o painel faz**, usando o que entrou no produto desde julho
(rede com lucro sobre equipe, taxa por casa, import de planilha da casa,
auditoria, ranking premiado, 2FA).

**Cadência:** 3×/semana — **segunda, quarta e sexta, 11:00**, FB + IG juntos,
agendados pelo composer do MBS (nunca publish imediato).
**Ritmo visual:** alterna dark/light (espelho dos temas da landing).
**Guardrails:** números sempre ILUSTRATIVOS, sem promessa de renda; honestidade
sobre o que o produto não faz (não intermedia deal com casa); nome de casa de
aposta não aparece em criativo (evita atrito de política se o post for turbinado).

## Calendário

| # | Data | Tema | Variante | Arquivo |
|---|---|---|---|---|
| 8 | seg **04/08** 11h | Nova agência no ar (white-label, cliente nominal) | dark | `post-8-infinity.png` |
| 9 | qua **06/08** 11h | Rede em níveis — lucro sobre equipe (upline) | light | `post-9-rede.png` |
| 10 | sex **08/08** 11h | Taxa por afiliado **e por casa** | dark | `post-10-porcasa.png` |
| 11 | seg **11/08** 11h | Import da planilha da casa → resultado atribuído | light | a gerar |
| 12 | qua **13/08** 11h | Portal do afiliado (cada um vê só o dele) | dark | a gerar |
| 13 | sex **15/08** 11h | Trilha de auditoria (quem mudou a taxa, quando) | light | a gerar |
| 14 | seg **18/08** 11h | Ranking com premiação (engajar a rede) | dark | a gerar |
| 15 | qua **20/08** 11h | Lucro líquido da agência por casa | light | a gerar |
| 16 | sex **22/08** 11h | Segurança: 2FA + escopo de dados por papel | dark | a gerar |

**Reels — 1 por semana, terça 12h** (formato com ~10× o alcance do estático
nesta conta: 265 views vs 15). Publicação do reel no IG é **manual, pelo app**,
com trending audio — é a única via com áudio (ver `CAMPANHA-REELS-PAINEL.md`).

| Semana | Reel | Origem |
|---|---|---|
| 1 · ter 05/08 | visão do afiliado | **já existe**: `reels/reel-3-afiliado.mp4` (foi produzido e nunca publicado) |
| 2 · ter 12/08 | organograma da rede / upline | precisa de screencast novo na demo |
| 3 · ter 19/08 | import da planilha da casa | precisa de screencast novo na demo |

## Legendas verbatim — semana 1

### Post 8 — Nova agência no ar (seg 04/08, 11h)

> Mais uma agência saiu da planilha: a **Infinity Affiliates** está no ar com o
> painel dela. 🚀
>
> E "dela" é literal: domínio próprio, logo e cores da marca deles, instância
> separada — os dados da operação não dividem banco com ninguém. Para os
> afiliados da rede, é o sistema da agência; a AffiliaCore fica por baixo,
> calculando comissão, fechando o mês e guardando a trilha de auditoria.
>
> Do aceite ao painel no ar: dias, não meses.
>
> A sua agência é a próxima? Chama no direct — affiliacore.com.br
>
> `#afiliados #gestaodeafiliados #agenciadeafiliados #igaming #whitelabel`

### Post 9 — Rede em níveis (qua 06/08, 11h)

> Rede de verdade não é lista de afiliados — é estrutura. 🧩
>
> Novidade no painel: **comissão de upline**. Quando um afiliado produz, o
> sistema paga o repasse dele E o "lucro sobre equipe" de quem está acima na
> estrutura — em cascata, quantos níveis a sua rede tiver.
>
> No exemplo (ilustrativo): a casa paga R$ 600 pelo FTD, o afiliado leva
> R$ 300, o líder da equipe dele leva R$ 100 de override e R$ 200 ficam com a
> agência. Você define cada taxa, por afiliado e por casa; a conta fecha
> sozinha.
>
> É assim que gerente de rede vira dono da produção — sem planilha paralela.
>
> affiliacore.com.br
>
> `#afiliados #gestaodeafiliados #agenciadeafiliados #igaming`

### Post 10 — Taxa por casa (sex 08/08, 11h)

> Sua rede opera em três casas. Cada uma paga de um jeito. Quem fecha essa
> conta hoje? 🧮
>
> No painel, a taxa é configurada **por afiliado E por casa**: CPA numa,
> RevShare em outra, híbrido na terceira — e o mesmo afiliado pode ter regra
> diferente em cada uma. A comissão sai calculada casa a casa, com o lucro da
> agência separado por marca, sem ninguém conferir linha por linha.
>
> Nomes ocultos no exemplo de propósito: os seus acordos são seus. Números
> ilustrativos.
>
> affiliacore.com.br
>
> `#afiliados #gestaodeafiliados #igaming #agenciadeafiliados`

## Execução

1. Criativos: `generator/gen-posts8910.mjs` (SVG + fontes reais → PNG resvg) →
   `social-out/`. Conferir cada PNG na tela antes de seguir.
2. Segs em curvas: `generator/gen-posts8910-canvas.mjs` → `out-serie3/`
   (o `*-check.png` tem que bater com o PNG do kit).
3. Agendamento via subagente `mbs-publisher` — business `1550870196394283`,
   Página FB `1187806394420139`, IG `1195342246993840`. **Agendar, nunca
   publicar na hora.**
4. Conferir no Planner e registrar aqui as datas confirmadas.

## Pendência de terceiro

O post 8 cita a **Infinity Affiliates nominalmente**. Antes de ir ao ar, ter o
ok explícito do cliente (é a marca dele numa peça pública nossa). Se não vier a
tempo, a versão anonimizada é trocar "a Infinity Affiliates" por "mais uma
agência" e remover o domínio do criativo — o resto do post continua verdadeiro.
