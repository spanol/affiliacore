---
name: meta-ads
description: Rodar campanhas pagas da AffiliaCore (turbinar posts do @affiliacore.br) via Chrome MCP no Meta Business Suite — criar/editar anúncios de mensagem, público, orçamento e acompanhar resultados. Use quando o usuário pedir campanha paga, turbinar/impulsionar post, "girar mídia" ou mexer nos anúncios.
---

# Meta Ads da AffiliaCore via browser

Manual destilado da 1ª campanha (2026-07-08, publicada com sucesso). A versão
GENÉRICA da técnica vive em `~/.claude/skills/meta-ads/` — esta aqui carrega os
fatos e o estado DA CONTA AffiliaCore. Dentro do repo, esta vence.

## Fronteiras (não negociáveis)

- **Dinheiro é sempre do Vinicius**: cadastrar/verificar cartão, CPF, telefone
  (SMS), adicionar fundos (PIX) e QUALQUER aceite de termos/SSO = ele faz ou
  autoriza explicitamente no chat. Você dirige o browser até essas portas.
- **Publicar = compra.** Só clique Publish depois de mostrar o resumo (valor
  TOTAL com impostos, duração, público, destino) e receber um "sim" explícito
  para aquela configuração. Teto de gasto: o que ele declarar na conversa.
- Chrome compartilhado: confira no screenshot que a sessão é a @affiliacore.br.

## Fatos da conta (estado em 2026-07-08)

- Login no MBS: **business.facebook.com → "Continuar com o Instagram"** (sessão
  do @affiliacore.br já logada no Chrome; NÃO há login de Facebook). O SSO às
  vezes pede re-auth ao abrir o composer — repetir o mesmo botão.
- IDs: business portfolio "Affilia Core" `1550870196394283` · ad account
  `1038808991862700` · asset IG `1195342246993840` · IG user `17841449515192489`.
- Composer direto (pré-carrega post/objetivo/orçamento via param `so` base64):
  `business.facebook.com/latest/consolidatedad/?ad_account_id=1038808991862700&asset_id=1195342246993840&so=<base64>`
- **Gates de conta nova JÁ VENCIDOS** (não refazer): política de
  não-discriminação aceita; telefone verificado; cartão MasterCard ····7288
  verificado (micro-cobrança); conta reativada. **CNPJ NÃO é necessário** — o
  fluxo "Verify legal business name" é verificação de EMPRESA (opcional).
- Pagamento: **pré-pago** (fundos). Vinicius pôs R$130 via PIX; após a
  campanha 1 sobram **~R$84**. Impostos ISS+PIS/COFINS ≈ **13,8% POR CIMA** do
  orçamento — calcule o teto pelo "Total amount" do Payment summary.

## BLOQUEIO ATIVO: vínculo Página↔IG (matou a campanha 1)

**A campanha 1 FALHOU NA CRIAÇÃO** (Ad Center: "Unable to create", 10/jul) com
motivo "Page Is Not Linked To A Professional Instagram Account". Lição: o
vínculo Página "Affilia Core" ↔ @affiliacore.br profissional é PRÉ-REQUISITO
do anúncio em si — **trocar o destino p/ Messenger NÃO contorna** (o publish
até passa e fica In review, mas a criação falha na data de início). Nada foi
cobrado (reprovação/falha não cobra). Contexto: o destino IG já era rejeitado
no composer ("Account type is not valid — not a professional account"); a
conversão do IG p/ profissional foi 2026-07-07 e o modal de vincular
(Settings → Instagram accounts → Connected assets) travava em spinner.
**Antes de QUALQUER campanha nova: consertar o vínculo** (retestar o modal;
se seguir em spinner, tentar pelo app/Central de Contas) e só então publicar.
Automatic destination NÃO contorna (inclui o chip IG e reprova igual).

## Campanha 1 (referência de config; falhou na criação — ver bloqueio acima)

Post-1 lançamento · objetivo Get more messages · público manual **BR · 25–44 ·
interesses "Affiliate marketing" OU "Sports betting"** · R$10/dia × 4 dias
(10–14/jul) = **R$45,53 total** · saudação do chat em pt-BR + 3 perguntas de IA
(custo/personalização/suporte) · publicada 08/jul (In review) → "Unable to
create" em 10/jul (data de início = liquidação do PIX, que levou 2 dias).
Saldo pré-pago intacto: **R$129,99**. Há 3 rascunhos "Get more messages" no
Ad Center (10/jul) reaproveitáveis p/ relançar com datas novas. Próximos
criativos: posts 2–4 em `marketing/affiliacore/` (legendas em
`CAMPANHA-LANCAMENTO.md`).

## Fluxo que funciona (resumo)

1. `tabs_create_mcp` → MBS home → widget **"Create an ad from your posts"**
   (já vem com objetivo/R$10) → Create ad.
2. Conferir topo do composer: banners vermelhos = pendência (parar e resolver).
3. Message destination → **manual**, retestar Instagram (ver pendência acima).
4. Audience → "People you choose through targeting" → lápis: idade (slider
   aceita SETAS do teclado), Brasil, interesses → **Save audience**.
5. Schedule → "Choose end date" → campo **Days** recalcula a end date sozinho;
   início default = data de liquidação dos fundos (deixar).
6. Messaging → saudação pt-BR (editar template; perguntas de IA já saem pt).
7. Payment summary → mostrar ao usuário → "sim" → **Publish** → esperar o
   modal "Your ad is being created / In review".
8. Depois: Ad Center/Inbox p/ resultados e leads (responder rápido pesa no
   custo por conversa). Reprovação na revisão não cobra nada.

## Becos sem saída (não re-descobrir)

- Turbinar pelo **instagram.com web** trava em spinner infinito nesta conta.
- Toggle "Automatic destination" não resolve o erro do destino IG.
- Modal Página↔IG ("Connect assets") gira para sempre — não insistir >20s.
- Calendário do end date flutua sobre a página; feche clicando FORA dele.
- "Done editing?" ao mexer no público = clique **Cancel** para continuar
  editando (Confirm fecha o editor).
