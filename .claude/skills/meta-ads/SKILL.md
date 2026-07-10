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

## Vínculo Página↔IG (matou a campanha 1) — RESOLVIDO 2026-07-10

**A campanha 1 FALHOU NA CRIAÇÃO** (Ad Center: "Unable to create", 10/jul) com
motivo "Page Is Not Linked To A Professional Instagram Account". Lições:
- O vínculo Página↔IG profissional é PRÉ-REQUISITO do anúncio em si —
  **destino Messenger NÃO contorna** (publish passa, fica In review, e a
  criação falha em silêncio na data de início; nenhum e-mail avisa). Depois de
  publicar, SEMPRE conferir o Ad Center na data de início.
- Causa raiz: o portfólio NÃO TINHA Página nenhuma ("No Pages added") — a
  "Affilia Core" do composer era página-sombra, não um ativo gerenciável.
- **FIX executado:** Página **"AffiliaCore"** criada (categoria Software
  Company, bio pt-BR, Page ID `1187806394420139`) via **Settings → Pages →
  Add → "Create a new Facebook Page"** — o wizard RODA DENTRO do MBS (funciona
  com a sessão SSO do IG). ⚠️ NÃO usar o link "Create a new Facebook Page" de
  dentro do diálogo Connect assets: abre facebook.com/pages/creation
  DESLOGADO (a conta não tem login de Facebook). Aceite dos Meta Commercial
  Terms = Vinicius clicou. Depois: ativo IG → Connect assets → Facebook Page
  → Next → selecionar AffiliaCore → conectado ("Instagram connected to Page",
  verificado nos dois lados).
- Destino IG direct: retestar na próxima campanha (agora com Página real o
  erro "Account type is not valid" deve sumir; se não, Messenger cai no
  Inbox do MBS igual).

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
