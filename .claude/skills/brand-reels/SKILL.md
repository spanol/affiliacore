---
name: brand-reels
description: Criar reels/vídeos verticais 1080×1920 da AffiliaCore a partir de screencasts da demo — emoldura a gravação na moldura ember (janela arredondada + título por persona + bullets + logo + disclaimer) via resvg + ffmpeg, gera capa e agenda FB+IG no MBS. Use quando o usuário pedir reel, vídeo do painel/produto ou uma série de vídeos.
---

# Reels da AffiliaCore ("Por dentro do painel")

A técnica GENÉRICA vive em `~/.claude/skills/brand-reels/` — esta carrega os
FATOS da marca AffiliaCore e o estado do kit. Dentro do repo, esta vence.
Primeira série (3× reels da demo) publicada… agendada 2026-07-23.

## Fatos da marca / kit (já existe — reusar, não reinventar)

- **Gerador de moldura REAL:** `marketing/affiliacore/generator/gen-reels-frames.mjs`
  (resvg; dep `@resvg/resvg-js` `--no-save` — reinstalar se sumir). Fontes em
  `marketing/affiliacore/fonts-ttf/` (Bricolage Grotesque 500/800 + Inter
  400/600). Gera `reels/frame-{1,2,3}.png` (overlay RGBA).
- **Kit versionado:** `marketing/affiliacore/reels/` — `frame-*.png` (molduras),
  `reel-{1-agencia,2-lider-rede,3-afiliado}.mp4` (finais), `cover-*.png` (capas).
- **Legendas verbatim + cadência + gotchas:** `marketing/affiliacore/CAMPANHA-REELS-PAINEL.md`.
- **Tokens ember:** gradiente `#6c0e23→#4a0a18→#11070a`, accent `#e11d48`,
  accentSoft `#e45b79`, ink `#fff`, muted `#af9da2`, hair `#34262a`. Lockup
  "Affilia●ore" (glifo C-núcleo) já no gerador.
- **Janela do vídeo:** `WIN = {x:28, y:640, w:1024, h:576, r:24}` (16:9). Layout
  sobrevive ao crop 4:5 do feed (miolo ~y 285..1635) e à UI do Reels.
- **IDs MBS:** business `1550870196394283` · Página FB `1187806394420139` ·
  IG `1195342246993840`. Composer de reels: `/latest/reels_composer/?asset_id=<page>&business_id=<biz>`.

## Receita de composição (VERIFICADA 2026-07-23, ffmpeg 8.1.1)

Screencast cru (silêncio) por baixo da moldura, 1,25× / 30fps / sem áudio.
Valores REAIS da AffiliaCore já embutidos:

```bash
CLIP=raw.mp4; OVL=marketing/affiliacore/reels/frame-1-agencia.png; OUT=reel.mp4
ffmpeg -y -i "$CLIP" -i "$OVL" -filter_complex \
"color=c=0x11070a:s=1080x1920:r=30[bg];\
[0:v]setpts=PTS/1.25,fps=30,scale=1024:576:force_original_aspect_ratio=increase,crop=1024:576,setsar=1[clip];\
[bg][clip]overlay=28:640:shortest=1[base];\
[base][1:v]overlay=0:0[v]" \
-map "[v]" -an -c:v libx264 -pix_fmt yuv420p -crf 20 -r 30 -movflags +faststart "$OUT"
ffmpeg -y -i "$OUT" -frames:v 1 -q:v 2 cover.png   # capa = 1º frame (cartão-título)
```

Batch da série: template `~/.claude/skills/brand-reels/templates/compose-reels.template.mjs`
(WIN/SPEED/BG/FILL já casam com o acima). Saída garantida: 1080×1920 h264/yuv420p
30fps sem áudio; duração = original ÷ 1,25.

## Agendar — fluxo HÍBRIDO (o operador anexa o vídeo)

O "Add Video" do composer de Reels abre o file picker NATIVO e congela a
automação. Fluxo que funcionou: a automação prepara o composer, **o Vinicius
clica "Add Video" e escolhe o `.mp4`**, a automação segue com legenda, capa e
agendamento. Gotchas críticos (detalhe no CAMPANHA-REELS-PAINEL.md §gotchas):
**reel EDITADO não agenda no IG → pular o passo Edit**; vídeo PRIMEIRO, legenda
depois; Title fica disabled; data/hora do Schedule são DIGITÁVEIS; reels saem
SILENCIOSOS (áudio/trilha em alta = publicar manual pelo app do IG).

## Guardrails (obrigatórios)

Números na tela = demo (fictícios) e a moldura declara "Ambiente de demonstração
· dados fictícios". Sem promessa de renda; casa/operadora nunca como recomendação
de aposta — é software de gestão white-label. Publish imediato NUNCA; padrão =
Schedule. Push do commit = decisão do operador (push na main = deploy).

## Estado (2026-07-23)

Kit pronto (commit `9abae18`, SEM push). 3 reels AGENDADOS FB+IG: reel 1
(agência) sex 24/07 12h · reel 2 (líder de rede) sáb 25/07 12h · reel 3
(afiliado) dom 26/07 12h. **Falta (operador): FIXAR os 3 no topo do perfil
@affiliacore.br quando publicarem** (vitrine permanente do painel). Posts do
ebook às 11h; reels às 12h — sem colisão. Para novos reels: regravar na demo,
rodar `gen-reels-frames.mjs` (ajustar cenas) + a receita ffmpeg acima.
