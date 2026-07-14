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
Saldo pré-pago intacto: **R$129,99**. Próximos criativos: posts 2–4 em
`marketing/affiliacore/` (legendas em `CAMPANHA-LANCAMENTO.md`).

## ❌ Campanha 2 FALHOU NA CRIAÇÃO (13/jul): "Missing media"

Ad Center em 13/jul: **"Unable to create" (Jul 11)** — o "In review" de novo
NÃO virou anúncio. Motivo (modal Learn more): **"Missing media: Please
specify the media to run with this ad."** ⇒ **anúncio TEXTO-PURO não existe
na Meta — mídia é OBRIGATÓRIA.** Nada foi cobrado (R$0,00 em 0 ads; saldo
pré-pago intacto). Ficaram 2 drafts "Get more messages" (expiram ~6/ago).
Caminho p/ a campanha 3: **anexar mídia** — (a) retestar "Use a post" (o
post-1 pode ter indexado agora que o vínculo Página↔IG está estável há
dias) ou (b) publicar um post NOVO no IG e usá-lo, ou (c) achar composer
com upload de imagem (Ads Manager completo, não o Ad Center simplificado).
Regra permanente: **In review não garante criação — conferir o Ad Center
na data de início** (2ª vez que a lição vale). **RESOLVIDO na campanha 3
(13/jul): ver seção acima — criativo via post da Página.**

## ✅ Campanha 3 PUBLICADA (13/jul ~22h45) — mídia RESOLVIDA via post na Página

**A solução do "Missing media": publicar o criativo como POST DA PÁGINA do
Facebook (via composer de posts do MBS) e usar "Use a post" → aba Facebook
posts.** Posts do Facebook indexam NA HORA no Browse posts; **posts do
Instagram NUNCA indexaram** (nem com a aba "Instagram posts" nova que
apareceu pós-vínculo — "No posts to show" mesmo com 2 posts no perfil).
Config da campanha 3 (referência): criativo = post-1 lançamento da Página
(texto do post vira Ad text) · Get more messages · BR 25–44 · interesses
Affiliate marketing OU Sports betting · destino Automatic (chips Messenger E
Instagram OK) · saudação pt-BR + 3 perguntas IA pt-BR (vieram certas
sozinhas) · R$10/dia × 4 dias (13→17/jul) = **R$45,53 c/ impostos** · saldo
no publish R$129,99. Status: In review — **CONFERIR o Ad Center no início
(regra das campanhas 1–2: In review não garante criação).**

### Como subir imagem no composer de POSTS do MBS (provado 2026-07-13)

- ⚠️ **"Add photo/video" abre o file picker NATIVO direto** (congela a
  automação; não há menu). NUNCA clique nele via mouse.
- Drop simulado (DragEvent) e paste (ClipboardEvent) no editor NÃO anexam.
- O que FUNCIONA — patch do click + captura do input (1 javascript_exec):
  desenhe o canvas (técnica das curvas da skill /instagram), depois:
  `HTMLInputElement.prototype.click = function(){ if(this.type==='file'){window.__capturedInput=this;return;} return orig.apply(this,arguments); }`
  → `btn.click()` (o botão Add photo/video, PROGRAMÁTICO) → aguardar ~300ms →
  `input.files = dt.files` → **disparar `input` E `change`** (só `change` às
  vezes não anexa; com os dois eventos pega de primeira). Thumbnail
  "1080 x 1080" aparece em ~4-6s.
- O composer de posts publica **FB + IG juntos** (Post to já vem com os dois;
  dá p/ desmarcar um) e **AGENDA de graça** (Schedule → Set date and time).
  Legenda: editor Draft.js — form_input no campo achado pelo `find`; Escape
  no typeahead de hashtag APAGA a hashtag (feche clicando em área neutra).
- Posts 2 (planilha) e 1 (lançamento, só-FB) publicados 13/jul; posts 3
  (painel) e 4 (fundador) agendados FB+IG p/ 15/jul e 17/jul 11:00.
  Gerador dos criativos em curvas: `generator/gen-posts234-canvas.mjs`.

## Campanha 2 (relançamento, 11/jul — falhou: Missing media)

Publicada 11/jul ~13h (publish do Vinicius) após o fix do vínculo: mesma
config da 1 (Get more messages · BR 25–44 · Affiliate marketing OU Sports
betting · R$10/dia × 4 = R$45,53 · saudação pt-BR + perguntas IA), início
11/jul → fim 15/jul. Diferenças: **destino Automatic com Messenger E
Instagram validados** (Página real destravou o IG direct) e **criativo
TEXTO-PURO** (bio + headline) — o post-1 do IG não indexava no "Use a post"
nem ~14h pós-vínculo; o composer do Ad Center não tem upload de mídia; o
Boost pela aba Content pede "Connect a Meta ad account" (login FB) = beco.
GOTCHAS: sessão MBS pode cair p/ o FB pessoal → re-login "Continuar com o
Instagram"; "Confirm Instagram message access" (Inbox) é pré-requisito do
IG no contexto da Página; rascunho com start no passado = composer
auto-corrige ao reabrir; drafts do contexto IG antigo ficam INACESSÍVEIS
pós-vínculo. Lição da campanha 1 vale: In review NÃO garante criação —
conferir o Ad Center na data de início.

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
