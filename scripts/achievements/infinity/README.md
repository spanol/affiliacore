# Placas de conquista — Infinity Affiliates

Arte das placas que a Infinity já usava na v1 da dashboard, trazidas para
`/conquistas` (`achievement_tiers`) em 2026-08-13.

| Arquivo | Tier | Meta (comissão acumulada do afiliado) |
| --- | --- | --- |
| `web-10k.webp` | Placa de 10K · PRATA | R$ 10.000,00 |
| `web-50k.webp` | Placa de 50K · OURO | R$ 50.000,00 |
| `web-100k.webp` | Placa de 100K · AMETISTA | R$ 100.000,00 |

"EM FATURAMENTO" na arte = **comissão acumulada do afiliado** (o repasse dele),
confirmado com o Vinícius. É o campo `metaCommission`; `metaCpas` fica em 0.

## Por que só o webp está versionado

Os pôsteres originais têm ~1080×1450 e 2 MB cada — arte do cliente, não do
produto. Eles ficam FORA do git (`.gitignore`); o que se versiona é o webp
normalizado, que é exatamente o byte que virou data URL no Firestore.

O teto real não é o `TIER_IMAGE_MAX_CHARS` (400 mil chars) e sim o tráfego: o
doc do tier vai por `onSnapshot` para TODO cliente logado, então a imagem pesa
no carregamento de cada afiliado. Em 560px de altura cada placa fica em ~20 KB
(~28 mil chars de data URL) — 7% do teto.

## Regenerar a partir do PNG original

```bash
ffmpeg -y -i placa-10k.png -vf "scale=-2:560" -c:v libwebp -quality 82 \
  -compression_level 6 web-10k.webp
```

## Cadastrar numa instância

`/conquistas` → **Gerenciar conquistas** → preencher título, tier/subtítulo,
meta em comissão e ordem → **Imagem do prêmio** aponta para o `.webp` daqui.
O upload vira data URL no próprio form (não há rota de upload). A prévia do
modal desenha o MESMO `AchievementCard` que o afiliado vê.
