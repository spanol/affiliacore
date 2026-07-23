# Reels "Por dentro do painel" (série 3×) — 2026-07-23

Três screencasts da demo (dados fictícios) gravados pelo Vinicius em 22/07,
emoldurados em 1080×1920 com a identidade ember. Fonte de cada reel:
gravação do ambiente de demonstração (emuladores, `spanol-1.tail…:3123`).

| # | Arquivo | Persona | O que mostra | Duração |
|---|---------|---------|--------------|---------|
| 1 | `reels/reel-1-agencia.mp4` | Master (Equipe AffiliaCore) | Login → ranking → Casas (taxas CPA €/REV, origem OTG/manual) → histórico de import → Auditoria → Jurídico/Termos | ~50s |
| 2 | `reels/reel-2-lider-rede.mp4` | Especial (Ana Souza) | Login → painel da rede (KPIs, top 5) → avisos → Meus Afiliados → Meus Links → drill-down no sub-afiliado | ~27s |
| 3 | `reels/reel-3-afiliado.mp4` | Afiliado (Yago Martins) | Dashboard (comissão por casa) → Parcerias (solicitar/aprovadas) → Meus Links (cliques) → Financeiro (saques PIX + NF) → perfil | ~38s |

Produção: clipe a 1,25× (ritmo), 30fps, sem áudio (silêncio na captura) —
**adicionar um áudio em alta pelo próprio app do IG na hora de publicar**
(melhor p/ alcance; o app mixa por cima). Molduras regeneráveis com
`generator/gen-reels-frames.mjs`; capas em `reels/cover-*.png` (subir como
capa ao publicar, mantém a grade do perfil consistente).

## Publicação (operador)

A automação NÃO sobe vídeo pelo MBS (file picker nativo congela a sessão;
canvas não gera vídeo) → publicar manualmente: MBS desktop (Criar reel) ou
app do IG. Sugestão de cadência: **1 por dia, 3 dias seguidos (~12h)**, na
ordem 1→2→3. Ao final, **fixar os 3 no topo do perfil** (IG permite fixar
até 3) — vira a vitrine permanente do painel na página, que é o objetivo.

## Legendas (verbatim)

### Reel 1 — A visão da agência

```
Por dentro do painel · 1 de 3 — a visão da agência.

Casas e taxas CPA/REV por operadora, importação de resultados (automática ou por planilha), trilha de auditoria de cada ação e jurídico versionado com aceite. O backoffice de quem opera a rede, num lugar só.

Gravado no nosso ambiente de demonstração — dados fictícios.

Painel white-label para agências de afiliados do mercado regulamentado. Conheça: affiliacore.com.br (link na bio)

#afiliados #igaming #whitelabel #saas #gestaodeafiliados
```

### Reel 2 — A visão do líder de rede

```
Por dentro do painel · 2 de 3 — a visão do líder de rede.

Quem lidera uma sub-rede enxerga um painel de gestão escopado nela: resultado consolidado, top afiliados, desempenho individual e drill-down em cada um — sem acesso ao que é só da agência.

Gravado no nosso ambiente de demonstração — dados fictícios.

Painel white-label para agências de afiliados: affiliacore.com.br (link na bio)

#afiliados #igaming #whitelabel #saas #gestaodeafiliados
```

### Reel 3 — A visão do afiliado

```
Por dentro do painel · 3 de 3 — a visão do afiliado.

Comissões e resultados por casa, parcerias para solicitar em um clique, links de divulgação com contagem de cliques e saques via PIX com nota fiscal. O portal de quem divulga.

Gravado no nosso ambiente de demonstração — dados fictícios.

Painel white-label para agências de afiliados: affiliacore.com.br (link na bio)

#afiliados #igaming #whitelabel #saas #gestaodeafiliados
```

## Guardrails

Números na tela são da demo (fictícios) e o overlay declara isso
("Ambiente de demonstração · dados fictícios"). Sem promessa de renda,
sem menção a casa como recomendação de aposta — é software de gestão.
