# Vídeos de apresentação do painel · AffiliaCore (versão de PRODUTO, 2026-08-18)

O kit que nasceu para a Infinity (pedido da Letícia) virou **entregável padrão de
onboarding**: todo cliente novo pode receber os dois vídeos com a marca dele, e
esta versão AffiliaCore serve de peça comercial (LP, IG, apresentação a lead).

**Entregas** (1080×1920 vertical, h264/30fps, sem áudio, gravadas na demo emulada
com a marca AffiliaCore; a moldura declara "Vídeo de demonstração · dados fictícios"):

- `video/apresentacao-painel.mp4` — 32s, o essencial: cadastro → painel → carteira.
- `video/apresentacao-painel-2.mp4` — 41s, os módulos restantes: avisos/ranking,
  conquistas, Meus Links (acordos) e a visão do afiliado ESPECIAL (rede + gestão).

## O workflow por marca (3 peças)

1. **Molduras** — `generator/gen-video-frames.mjs` (deste kit; a Infinity tem o
   dela em `marketing/infinity/generator/`). Por marca mudam só tokens, logo e chip.
2. **Captura** — `marketing/video-tools/capture-scenes.mjs` (COMPARTILHADO, 8
   cenas coreografadas): aponte `VIDEO_BASE` para a instância local da marca e
   `VIDEO_OUT` para o `video/raw/` do kit. Pré-requisito: `DEMO_FULL=1 npm run dev`.
   - AffiliaCore: `VIDEO_BASE=http://127.0.0.1:3123 VIDEO_OUT=marketing/affiliacore/video/raw`
   - Infinity: `VIDEO_BASE=http://127.0.0.1:3124` (sobe o preview com
     `scripts/provision/start-infinity-preview.cmd`)
   - Cliente novo: um `.cmd` de preview no padrão do da Infinity (envs `VITE_BRAND_*`
     da instância + emuladores) e pronto.
3. **Composição** — receita ffmpeg do brand-reels (SPEED=1.25 · WIN=28,640,1024×576 ·
   BG = stop mais escuro do gradiente da marca; aqui `0x11070a`). A cena 1 leva
   `crop=864:486:208:117` antes do scale (zoom no card estreito de cadastro);
   as demais escalam 1280×720→1024×576 direto. Concat 1-3 e 4-8.

Roteiros das cenas, gotchas de captura e narração-modelo: ver
`marketing/infinity/VIDEO-APRESENTACAO.md` (fonte original do kit). Para a
narração desta versão, troque "Bem-vindo à Infinity" por "Bem-vindo à sua nova
agência" (ou o nome da marca do cliente); o resto vale igual.

## Diferenças medidas nesta gravação (AffiliaCore vs Infinity)

- O mural de avisos MOSTRA o "Bem-vindo à demonstração AffiliaCore" (aqui a
  marca é a certa; na gravação da Infinity ele foi apagado do emulador antes).
- A demo da 3123 já liga o marketplace sozinha; nenhum env extra foi preciso.
