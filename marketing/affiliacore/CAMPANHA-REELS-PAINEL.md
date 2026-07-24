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

## Publicação — ✅ AGENDADOS 2026-07-23 (fluxo híbrido)

**Os 3 reels estão AGENDADOS no MBS (FB + IG), verificados no Planner:**

| Reel | Data | Status |
|------|------|--------|
| 1 · agência | sex 24/07 | **REAGENDADO na madrugada de 24/07 c/ MÚSICA**: FB 12:45 (Dream Dust · erloom, via MBS) + IG = post manual pelo APP c/ trending audio (agendamento MBS do IG deletado) |
| 2 · líder de rede | sáb 25/07 12:00 | agendado FB+IG (silencioso) |
| 3 · afiliado | dom 26/07 12:00 | agendado FB+IG (silencioso) |

Fluxo que funcionou (híbrido): a automação prepara o composer de Reels
(`/latest/reels_composer/?asset_id=<page>&business_id=<biz>`), o OPERADOR
clica "Add Video" e escolhe o arquivo (file picker nativo congela a
automação), a automação segue com legenda, miniatura e agendamento.
Obs.: há posts do ebook agendados às 11:00 nos dias 25/26 — reels às 12:00
ficam 1h depois, cadência ok. **Falta (operador): fixar os 3 no topo do
perfil do IG após publicarem** — vitrine permanente do painel.

### Gotchas do composer de REELS do MBS (aprendidos 2026-07-23)

- **Reel EDITADO não agenda no IG**: qualquer edição do passo Edit (ex.
  trilha da biblioteca) desabilita a aba Schedule ("Your edited Instagram
  reel can't be scheduled") e o aviso diz que edições só sairiam no FB.
  ⇒ p/ AGENDAR FB+IG: pular o Edit inteiro (reel sai com o áudio original;
  os nossos são silenciosos). Trilha/áudio em alta = publicar manualmente
  pelo app do IG.
- **MAS reel editado SÓ-FACEBOOK AGENDA** (provado 24/07): desmarcando o IG
  no "Post to", a trilha entra no Edit e o Schedule funciona. No modo só-FB
  o campo **Title habilita** (vira o título da linha no Planner). Fluxo
  híbrido de música: FB agendado c/ trilha do MBS + IG manual pelo app com
  trending audio (que ainda conta p/ descoberta — biblioteca do MBS não).
- **"Bug do relógio" que não era da Meta** (24/07): o Schedule recusava
  12:00 PM ("between 20 minutes and 29 days") porque o RELÓGIO DO PC estava
  ~11h ATRASADO (mostrava 01:14 quando eram ~12:15 reais) — o composer
  valida contra a hora REAL do servidor, que estava certa; quem mentia era
  o `Get-Date` local. Lição: quando a validação de horário da Meta parecer
  absurda, desconfie do relógio da MÁQUINA primeiro (o default sugerido ao
  abrir ≈ agora_real+20min é uma boa referência da hora verdadeira).
- **Campo de hora do reels composer = 3 spinbuttons** (`aria-label`
  hours/minutes/meridiem). Digitação é traiçoeira (auto-advance engole
  dígitos e o display DESSINCRONIZA do estado — dá p/ ver "12:00 PM" com
  estado interno AM). Confiável: focar cada input via JS `.focus()` e usar
  SETAS (Up/Down); conferir com `aria-valuenow`, não com o olho.
- **Campo Title fica `disabled` sempre** (é de reel só-FB; no fluxo
  combinado FB+IG não é usado). A legenda vai no campo Text (Draft.js:
  `form_input` falha — usar click + type; fechar typeahead de hashtag
  clicando em área neutra, nunca Escape).
- **Vídeo único não sai**: a lixeira dá "At least one video is required" e
  "Add Video" não aceita um 2º vídeo (reel = 1 vídeo). Anexou errado?
  Cancel → "Discard changes" e recomeçar o composer. ⇒ ordem certa:
  **vídeo PRIMEIRO, legenda depois**.
- **Data/hora do Schedule são digitáveis** neste composer (diferente do
  composer de anúncios): click no campo → vira input (`7/24/2026`) →
  ctrl+a + digitar; Tab pula p/ hora segmentada (digitar `12`, seta →,
  `00`). Fuso exibido: America/Sao_Paulo.
- Miniatura: "Choose suggested" traz frames do vídeo (o frame 1 = cartão-
  título da moldura, consistente p/ a grade); "Upload image" abre picker
  NATIVO (= operador; as `cover-*.png` do kit servem p/ isso).
- Confirmação real = modal "Reel scheduled" + entrada dupla (FB e IG) na
  lista `/latest/posts/scheduled_posts` (buscável por legenda).

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
