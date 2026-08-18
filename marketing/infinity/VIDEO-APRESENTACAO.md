# Vídeo de apresentação do painel · Infinity (pedido da Letícia, 2026-08-18)

**Entrega:** `video/apresentacao-painel.mp4` — 1080×1920 (vertical), 31s, h264/30fps,
sem áudio, ~1,1 MB. Feito para envio em grupo de WhatsApp quando um afiliado novo
entra. Gravado na DEMO EMULADA com o preview de marca Infinity (zero dado real;
a moldura declara "Vídeo de demonstração · dados fictícios").

## Roteiro (3 cenas)

| Cena | Título na moldura | Conteúdo gravado |
|------|-------------------|------------------|
| 1 · Cadastro | Crie o seu acesso | `/cadastro/<token de rede>` : cartão "Você entra na rede de Ana Souza", formulário preenchido em ritmo de tutorial, "Acesso criado!" |
| 2 · Painel | Acompanhe seus números | Painel do cliente (Yago Martins, seed): comissão total, cards, REV/CPA por casa, evolução diária |
| 3 · Carteira | Receba pela carteira | `/financeiro`: a receber/pendente/aprovado/pago, botão Solicitar saque, solicitações por casa, PIX + nota fiscal |

## Texto sugerido para acompanhar o vídeo no grupo

> 🎥 Bem-vindo à Infinity! Neste vídeo você vê como criar o seu acesso pelo link
> de cadastro, acompanhar seus resultados e comissões casa a casa e solicitar
> seus saques via PIX. Qualquer dúvida, chama o suporte.

## Como regravar / regenerar

1. `DEMO_FULL=1 npm run dev` (demo gigante nos emuladores, app na 3123).
2. `scripts/provision/start-infinity-preview.cmd` (marca Infinity na 3124, mesmos emuladores).
3. Molduras: `node marketing/infinity/generator/gen-video-frames.mjs` (resvg; `npm i --no-save @resvg/resvg-js`).
4. Cenas: `DEMO_AFILIADO_PASS=<senha do console do dev> node marketing/infinity/generator/capture-scenes.mjs`
   (puppeteer-core `--no-save`; `SCENES=1` grava só uma cena; sai em `video/raw/scene{1,2,3}.webm`).
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
