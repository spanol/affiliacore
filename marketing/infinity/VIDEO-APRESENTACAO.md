# Vídeos de apresentação do painel · Infinity (pedido da Letícia, 2026-08-18)

**Entregas** (1080×1920 vertical, h264/30fps, sem áudio, feitos para grupo de
WhatsApp; gravados na DEMO EMULADA com o preview de marca Infinity, zero dado
real, moldura declara "Vídeo de demonstração · dados fictícios"):

- `video/apresentacao-painel.mp4` — 31s, o essencial: cadastro → painel → carteira.
- `video/apresentacao-painel-2.mp4` — 40s, os módulos restantes: avisos/ranking,
  conquistas, Meus Links (acordos) e a visão do afiliado ESPECIAL (rede + gestão).

## Roteiro (3 cenas)

| Cena | Título na moldura | Conteúdo gravado |
|------|-------------------|------------------|
| 1 · Cadastro | Crie o seu acesso | `/cadastro/<token de rede>` : cartão "Você entra na rede de Ana Souza", formulário preenchido em ritmo de tutorial, "Acesso criado!" |
| 2 · Painel | Acompanhe seus números | Painel do cliente (Yago Martins, seed): comissão total, cards, REV/CPA por casa, evolução diária |
| 3 · Carteira | Receba pela carteira | `/financeiro`: a receber/pendente/aprovado/pago, botão Solicitar saque, solicitações por casa, PIX + nota fiscal |

## Roteiro do vídeo 2 (5 cenas, `SCENES=4..8`)

| Cena | Título na moldura | Conteúdo gravado |
|------|-------------------|------------------|
| 4 · Avisos | Fique por dentro | `/avisos` (notificações + mural) e, por clique SPA na sidebar, `/ranking` (pódio do dia) |
| 5 · Conquistas | Evolua e conquiste | `/conquistas`: placas Bronze a Diamante, progresso, solicitar prêmio |
| 6 · Meus Links | Seus links e acordos | `/meus-links`: link por casa com os termos do acordo (baseline, rollover, meta, ciclo) e cliques |
| 7 · Especial | A visão do líder | `/network` logado como a especial da demo (Ana Souza): comissão da rede, lucro sobre equipe, funil |
| 8 · Especial | Gerencie sua equipe | `/network/afiliados`: produção por sub, botão Link de cadastro, indicações pendentes |

## Textos sugeridos para acompanhar nos grupos

Vídeo 1:

> 🎥 Bem-vindo à Infinity! Neste vídeo você vê como criar o seu acesso pelo link
> de cadastro, acompanhar seus resultados e comissões casa a casa e solicitar
> seus saques via PIX. Qualquer dúvida, chama o suporte.

Vídeo 2:

> 🎥 Conheça mais do painel Infinity: avisos e ranking, conquistas com placas por
> meta, seus links com os termos do acordo e, para quem lidera equipe, a visão
> completa da rede com o link de convite. Qualquer dúvida, chama o suporte.

## Narração (copy para locução ou TTS)

Os vídeos saem sem áudio de propósito. A narração abaixo foi calibrada à duração
real de cada cena (~2,5 palavras por segundo, com folga de respiro). Para juntar:
gravar a voz por cima (CapCut, app do IG) ou `ffmpeg -i video.mp4 -i voz.m4a
-c:v copy -map 0:v -map 1:a -shortest out.mp4`.

### Vídeo 1 · `apresentacao-painel.mp4` (31s)

| Cena | Janela | Texto |
|------|--------|-------|
| 1 · Cadastro | 0:00 a 0:12 | Bem-vindo à Infinity! Criar o seu acesso é rápido: abra o link de cadastro que você recebeu, preencha seus dados, crie uma senha e pronto. Seu login fica ativo na hora. |
| 2 · Painel | 0:12 a 0:23 | Ao entrar, o painel mostra seus números do período: comissão total, cadastros, depósitos e o detalhamento casa a casa, com a evolução dia a dia. |
| 3 · Carteira | 0:23 a 0:31 | E no Financeiro fica a sua carteira: saldo por casa, saque via PIX e o status de cada pedido. Dúvidas? Chama o suporte. |

### Vídeo 2 · `apresentacao-painel-2.mp4` (40s)

| Cena | Janela | Texto |
|------|--------|-------|
| 1 · Avisos e ranking | 0:00 a 0:09 | Nos avisos ficam os comunicados da agência e as suas notificações. E o ranking diário mostra os destaques e os prêmios do dia. |
| 2 · Conquistas | 0:09 a 0:17 | Nas conquistas, cada meta de produção vira uma placa: acompanhe seu progresso e solicite o prêmio quando bater a meta. |
| 3 · Meus Links | 0:17 a 0:24 | Em Meus Links você encontra o seu link de cada casa, com os termos do acordo e os cliques contados. |
| 4 · Visão do líder | 0:24 a 0:32 | Quem lidera uma equipe vê a rede inteira: comissão consolidada, produção casa a casa e o desempenho de cada afiliado. |
| 5 · Gestão da equipe | 0:32 a 0:40 | Em Meus Afiliados, gerencie sua equipe e compartilhe o seu link de cadastro: quem entra por ele já nasce na sua rede. |

## Como regravar / regenerar

1. `DEMO_FULL=1 npm run dev` (demo gigante nos emuladores, app na 3123).
2. `scripts/provision/start-infinity-preview.cmd` (marca Infinity na 3124, mesmos emuladores).
3. Molduras: `node marketing/infinity/generator/gen-video-frames.mjs` (resvg; `npm i --no-save @resvg/resvg-js`).
4. Cenas: `VIDEO_BASE=http://127.0.0.1:3124 VIDEO_OUT=marketing/infinity/video/raw
   DEMO_AFILIADO_PASS=<senha do console do dev> node marketing/video-tools/capture-scenes.mjs`
   (puppeteer-core `--no-save`; `SCENES=1` grava só uma cena; o script virou
   COMPARTILHADO entre marcas, ver `marketing/affiliacore/VIDEO-APRESENTACAO.md`).
5. Composição (receita do kit brand-reels, SPEED=1.25 · BG=0x0e0a16 · WIN=28,640,1024×576):
   a cena 1 leva `crop=864:486:208:117` antes do scale (zoom no card de cadastro,
   que é estreito); cenas 2 e 3 escalam 1280×720→1024×576 direto. Depois
   `concat=n=3` → `apresentacao-painel.mp4`. Comandos exatos no histórico do
   `capture-scenes.mjs` e nesta pasta.

Gotchas medidos: a demo semeia popup "Mensagem da gerência" que cobre o painel
(o script dispensa com "Entendi" antes de gravar); o banner do emulador de Auth
é removido por MutationObserver; o e-mail da cena 1 precisa ser único por
gravação (o aceite grava usuário no emulador); o screencast do puppeteer usa
timestamps de relógio, então o ritmo é o da coreografia do script.

Gotchas do vídeo 2: mudar de rota NO MEIO de uma gravação tem que ser por clique
SPA na sidebar (`page.goto` recarrega a página e pisca BRANCO no clipe); o
preview da Infinity precisa de `VITE_MARKETPLACE_ENABLED=true` (a instância real
tem, e sem ela `/meus-links` nem existe e o screencast sai vazio); o aviso
semeado "Bem-vindo à demonstração AffiliaCore" foi APAGADO do emulador antes da
cena 4 (marca errada dentro do vídeo Infinity; um reseed o traz de volta, apague
de novo antes de regravar).
