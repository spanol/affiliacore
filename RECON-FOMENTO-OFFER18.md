# Recon · Fomento (rede Offer18) — integração de resultados

**Data:** 2026-08-18 · **Branch:** `feat/integracao-fomento` · **Status:** recon completo; **fase POSTBACK ENTREGUE em 19/08** (decisão do Jotta/Vinicius: começar só pelo postback, que não depende da chave de API). O pull da Reports API segue bloqueado na chave e vira a fase de RECONCILIAÇÃO.

## Fase postback (entregue 19/08/2026)

- **Endpoint público** `GET|POST /api/postback/fomento`, gated por segredo na query (`s=`, comparação em tempo constante), guardado em `integrations/fomento-offer18` pela tela `/integracoes` (entrada nova no catálogo, `scope: 'global'`, `multiHouse: true`; env fallback `FOMENTO_POSTBACK_SECRET`). A URL a colar no painel da rede está na descrição da integração e em `FOMENTO_POSTBACK_TEMPLATE`.
- **Ledger `postback_events`** (server-only, sem rule): cada disparo vira doc idempotente (`fpb__offer__event__click`); retry da rede sobrescreve o mesmo doc. Disparo sem `aff_click_id` entra com id automático (sem âncora de dedupe, declarado).
- **Só contagens**: `lead` → cadastros, `ftd` → FTD + CPA qualificado; evento desconhecido fica no ledger fora das métricas. **Dinheiro nunca entra pelas linhas**: a comissão da casa deriva do `defaultCpa` (EUR, cotação ao vivo na leitura), como toda casa EUR sem comissão importada; `payout`/`currency` crus ficam no ledger para auditoria.
- **Recompute a partir do ledger** reescreve os dias com evento (`house_results`, `source: 'postback'`), com atribuição tag→afiliado pelo MESMO índice do import (links + apelidos). O botão "Atualizar" de /casas reprocessa a janela (7 dias default) para reatribuir tags vinculadas depois; é auditado (`via: 'postback-recompute'`). O disparo individual não gera audit_log: o ledger é a trilha.
- **Rede 1:N**: casa vinculada por `integration: 'fomento-offer18'` + `integrationExternalId` (offer_id) no doc da casa, SEM passar pelo `applyIntegrationLink` (1:1). Campo novo no modal de /casas ("ID da oferta na rede", só para integração multiHouse), com recusa de offer_id duplicado na mesma rede (409). O modal MANTÉM a taxa padrão da casa nesse modo (o dinheiro deriva dela).
- `sub_aff_id` entrou em `TAG_PARAMS` (linkTriage): link de casa com `...&sub_aff_id={ref}` resolve a tag no índice.
- Dia do evento = dia BR do RECEBIMENTO (`resolveServerToday`); corte de meia-noite pode divergir do livro da rede. Limitação declarada; a reconciliação fina virá com a Reports API.
- Testes: `src/lib/fomentoPostback.test.ts` (núcleo puro) + suíte de rotas no `server.test.ts` (segredo, dedupe, atribuição, unmapped, reprocesso, vínculo 1:N). Coleção `postback_events` isenta na trava da demo (ledger sem tela).

### Ofertas escolhidas para a Infinity (19/08, Jotta)

| Casa | Oferta (offer_id) | CPA (evento `ftd`) | Condições no termo da oferta |
|---|---|---|---|
| **Winhugo BR** | `21764206` | 25 EUR | Baseline R$ 30; redepósito mínimo de 30% dos FTDs, senão o total não valida nem paga |
| **Blaze BR - Regulated** | `20997138` | 30 EUR | Baseline 5 EUR; redepósito mínimo de 30%; só vale o relatório da PRÓPRIA Fomento |
| **Blaze Sports BR - Regulated** | `21960827` | 30 EUR | (segunda oferta da Blaze, para tráfego de esportes) |
| **KTO BR - Regulated** | `21210669` | 15 EUR | Baseline R$ 20 + wagering R$ 20 |

Todas com eventos `ftd` (paga) e `lead` (0 EUR), o exato mapa do conector. KTO e Blaze trazem no termo a diretriz de compliance das Portarias 73/2026 e 1.964/2026 (selo +18 + advertência do Ministério da Fazenda em 10% da tela, proibido guru/print de ganho) com retenção de pagamento por descumprimento — **repassar aos afiliados da Infinity antes de soltar link**. Link de clique: `https://fomentoindustriesltd10525901.o18.link/c?o=<OFFER_ID>&m=7910&a=703626&sub_aff_id={ref}` (o template exato sai do botão "link de rastreamento" da oferta).

⚠️ O redepósito mínimo de 30% (Winhugo/Blaze) significa que CPA contado pelo postback pode ser INVALIDADO depois no fechamento da rede: mais um motivo para a fase de reconciliação via Reports API quando a chave sair.

### Mapa casa→oferta em produção (Infinity, conferido 24/08)

O `integrationExternalId` de cada casa vive só no doc dela, e **a exclusão de casa
não guarda o documento na auditoria** (só o nome), então este mapa é o que
permite refazer um cadastro apagado sem entrar no painel:

| Casa (slug) | Oferta | offer_id | CPA |
|---|---|---|---|
| `bacanaplay` | Bacanaplay CPA BR - Regulated | 19782128 | 13 EUR |
| `betfury` | BetFury BR - 1 | 21945140 | 25 EUR |
| `betnacional` | BetNacional Casino BR - Regulated | 20914058 | 25 EUR |
| `betwarrior` | BetWarrior BR | 21764673 | 20 EUR |
| `blaze` | Blaze BR - Regulated | 20997138 | 30 EUR |
| `estrelabet` | EstrelaBet BR | 21236152 | 20 EUR |
| `jonbet` | JonBet BR | 21279644 | 16 EUR |
| `kto` | KTO BR - Regulated | 21210669 | 15 EUR |
| `novibet` | Novibet BR | 20280494 | 15 EUR |
| `oleybet` | OleyBet BR | 21316885 | 20 EUR |
| `rei-do-pitaco` | Rei do Pitaco BR - Regulated | 21983091 | 9 EUR |
| `winhugo` | Winhugo BR | 21764206 | 25 EUR |

**Frente "Sports" retirada (pedido do Jotta, 22 a 24/08):** as casas
`blaze-sports`, `estrelabet-sports`, `jonbet-sports` e `betnacional-sports` foram
apagadas e, em 24/08, os 4 acordos correspondentes saíram da vitrine. As ofertas
Sports continuam existindo na rede (ex.: BetNacional Sports `21960807`, Blaze
Sports `21960827`, ambas 25 e 30 EUR); simplesmente não são operadas aqui.

⚠️ A BetFury tem DUAS ofertas clonadas na rede ("BetFury BR" `21889241` e
"BetFury BR - 1" `21945140`, mesmos 25 EUR/termos/validade). A casa aponta para a
**`21945140`** porque foi nela que o teste de postback do go-live chegou em 26/08
(evento `tag: "replace_it"` retido no ledger) — o ledger é quem diz qual oferta o
tráfego usa, não o nome.

Termos da oferta da Betnacional Casino, lidos no painel em 24/08: baseline
depósito R$ 55 + apostado R$ 165, e **50 FTDs mínimos para pagamento**.

### Smoke na demo emulada (19/08, verificado)

Fluxo completo exercitado em `npm run dev` (emuladores, zero contato com projeto real): segredo salvo via `PUT /api/integrations/fomento-offer18`, casa Winhugo criada com `integrationExternalId: 21764206` + `defaultCpa: 25 EUR`, e os disparos: segredo errado → 403; `ftd` → agregado do dia com 1 FTD + 1 CPA e dinheiro 0 (deriva do defaultCpa na leitura); retry do mesmo click → `duplicate: true` e continua 1; `lead` → 1 cadastro; oferta da KTO sem casa → `unmapped: true` com o evento retido no ledger (`fpb__21210669__ftd__smk3`); botão "Atualizar" → reprocesso com a tag `smoketag` na fila de pendentes. Ledger e `house_results` conferidos direto no Firestore emulado.

**Operação (checklist do go-live):** (1) admin salva um segredo alto-entropia em `/integracoes` → Fomento; (2) cria a casa em /casas com origem "Pull automático" → Fomento + ID da oferta + `defaultCpa` em EUR = o CPA da oferta; (3) cola a URL de postback no painel da Fomento (Offers → postagem global, S2S); (4) testa com "teste de postagem" do painel; (5) links dos afiliados = template de cadastro da casa com `sub_aff_id={ref}`.

## O que é

**Fomento industries ltd** (painel `partners.fomento.agency`, white-label do **Offer18**) é uma REDE de afiliação de cassino, não uma casa: a conta da agência tem **103 ofertas aprovadas**, todas modelo **CPA em EUR**, geo BR/AR. Amostra (18/08):

| Oferta | ID | CPA |
|---|---|---|
| Spininio BR Sports | 22007840 | 35 EUR |
| 1xcasino AR | 22004706 | 15 EUR |
| Andromedasino BR | 21999479 | 30 EUR |
| Corgibet BR | 21999148 | 14 EUR |
| Slottica BR | 21996441 | 12 EUR |
| Playzada BR | 21986368 | 20 EUR |
| Rei do Pitaco BR (regulated) | 21983091 | 9 EUR |
| Cristal Poker BR | 21982469 | 30 EUR |
| Luckleopard BR | 21982440 | 20 EUR |
| Rcasino BR | 21982416 | 20 EUR |

É o análogo comercial da OTG, mas com API de afiliado documentada e pública.

## Decisão de modelagem (Vinicius, 18/08)

**Casas selecionadas**: só as ofertas que a agência de fato opera viram casas em `/casas`, cada uma vinculada ao `offer_id` correspondente. O pull é UM só (uma credencial) e reparte as linhas por oferta→casa. Alternativas descartadas: sincronizar as 103 (polui /casas) e casa "Fomento" agregada (mistura CPAs de 9€ a 35€, inviabiliza precificação por casa).

⚠️ **Consequência arquitetural:** o modelo atual de conector é 1 integração ↔ 1 casa (`applyIntegrationLink`, `integrations/{id}.houseId`, `PULL_CONNECTORS`). A Fomento exige **1 credencial ↔ N casas** — a casa precisa carregar, além da flag `integration: 'fomento-offer18'`, o `offer_id` dela (campo novo no doc da casa, ex. `integrationExternalId`). O handler do pull deixa de mirar UMA casa: puxa o relatório inteiro da janela e reparte por oferta. O `applyIntegrationLink` (que limpa a casa anterior ao trocar) NÃO se aplica como está; desenho a fechar na implementação.

## Credenciais e acesso

- Painel: `https://partners.fomento.agency/af/` (login do operador). Seção **Conta » API** (`#api`).
- **Affiliate ID (`aid`): 703626** · **MID (`mid`): 7910** · Domínio da API: **`api.offer18.com`**.
- **Chave API (`key`): AINDA NÃO CRIADA** ("não criado" no painel em 18/08). O único controle na tela é o toggle de acesso (badge "desabilitar" → `api_update('disable')`); pelo fluxo da doc Offer18, o "Generate" fica nessa mesma tela. **O Vinicius decidiu gerar a chave ele mesmo.** Quando existir, ela entra pela tela `/integracoes` (doc vence env), nunca em código/env commitado.
- Gerente de contas da Fomento no Telegram: `t.me/@alefomento` (link no painel).

## API (doc oficial, verbatim)

Doc: `https://knowledgebase.offer18.com/affiliate/affiliate-apis` (páginas `.md` baixáveis; espelho local usado no recon). Auth em TODAS: `key` + `aid` + `mid` na query string.

### Reports API — a fonte do pull

```
GET https://api.offer18.com/api/af/report?key=…&aid=703626&mid=7910
```

Filtros: `date_from`/`date_end` (YYYY-MM-DD), `datetime_from`/`datetime_end`, `results` (nº de linhas), `page` (**começa em ZERO**), `timezone` (decimal, default 0.0 UTC), `offer` (Offer ID), `report_type` (`click` | `conversion` | `imps`), `aff_sub1..5`.

`fields` (seleção de colunas): `clicks, conversion, affiliate_price, date, time, hour, offer, offer_name, s_affiliate, event, impressions, unique_clicks, affiliate_model, currency, …` (lista completa na doc). Ordenação: `sort_by` + `sort_type`.

Resposta:

```json
{ "status": 200, "records": 3, "timezone": "+5:30", "reports": [ {
  "Date": "2021-09-09", "OfferID": "0001", "Sub_Affiliate": "", "Event": "",
  "Impressions": 0, "Clicks": 8, "UniqueClicks": 0, "Conversions": 0,
  "Affiliate_Model": "CPA", "Affiliate_Price": 0, "Currency": "USD", …
} ] }
```

### Offers API — catálogo (para vincular casa↔oferta e conferir CPA/moeda)

```
GET https://api.offer18.com/api/af/offers?key=…&aid=…&mid=…
```

Filtros: `offer_id` (CSV), `page`, `category`, `model`, `country`, `offer_status=1`, `authorized=1`. Resposta por oferta: `offerid, name, logo, status, currency, price, model, events[] (event_name/event_token), payout[] (payout/currency/condition), click_url, landing_page_urls, authorized, creatives[]`.

## Rastreamento e atribuição

Link de clique (template do painel, oferta Spininio):

```
https://fomentoindustriesltd10525901.o18.link/c?o=22007840&m=7910&a=703626&aff_click_id={replace_it}&sub_aff_id={replace_it}
```

- Slots disponíveis para a NOSSA tag de afiliado: `sub_aff_id` (vira `Sub_Affiliate`/`s_affiliate` no report) e `aff_sub1..10` (`aff_sub1..5` filtráveis no report). Igual ao modelo AFP da Esportiva: a tag é nossa, cunhada no link.
- **Eventos da oferta Spininio (padrão esperado da rede): `ftd` paga o CPA (tier 35 EUR) e `lead` paga 0 EUR** (rastreado, não pago). Mapeamento draft: conversões `event=ftd` → `qualified_cpa` (contagem) e `first_deposits`; conversões `event=lead` → `registrations`; `Affiliate_Price` somado → dinheiro de comissão; `Clicks` → `visits`.
- **Moeda: EUR.** O produto já trata casa em moeda estrangeira (`/casas` + `src/lib/currency.ts`, regime live/fixed); decidir na implementação se a conversão acontece na gravação do pull ou no display, coerente com a casa EUR existente.

## Postback (verificado 19/08, pergunta do Jotta/Infinity)

**Postback NÃO é gated pela chave de API.** Com a chave ainda "não criado", as duas telas de configuração estão acessíveis e habilitadas no painel do afiliado:

- **Global**: `#postback` ("postagem global") — campo de URL S2S (recomendado) + pixel, botão enviar.
- **Por oferta**: aba "Postback" da página da oferta — URL por evento (`Initial Event`, `ftd`, `lead`) e por tipo (S2S, Pixel, HTML/iFrame, Facebook, TikTok…).

A chave de API gate SÓ as APIs de pull (offers/reports/coupon/request). O toggle "desabilitar" da tela `#api` é do acesso à API, coisa separada do postback.

Detalhes operacionais do postback:

- **IPs de origem** (para allowlist/validação no nosso endpoint): `35.245.65.44`, `35.230.165.242`, `34.145.129.198`.
- **Tokens disponíveis**: `{aff_click_id}`, `{sub_aff_id}`, `{aff_sub1..10}`, `{event_token}`, `{offerid}`, `{offername}`, `{omodel}`, `{payout}`, `{currency}`, `{ip}`, device ids… e os de iGaming: **`{ig-user-id}` (iGaming User ID)**, `{ig-product-id}`, `{ig-deposit-amount}`, `{ig-bet-amount}`, `{ig-win-amount}`, `{ig-withdrawal-amount}`, `{ig-bonus-amount}`. Ou seja: dá atribuição POR JOGADOR e valores de depósito/aposta por evento — o que a OTG nunca deu (o `/go/:code` está gated em postback da OTG até hoje).
- **Limites de "só postback"**: (1) só empurra EVENTOS dali em diante — sem backfill de histórico e sem cliques (funil/visits só pela Reports API); (2) evento perdido com o endpoint fora do ar não tem garantia de reenvio do lado do afiliado; (3) fechamento contábil confiável continua sendo o pull da Reports API — o desenho são os dois: postback para tempo real/atribuição, pull para reconciliação.

## Perguntas em aberto (probe assim que a chave existir)

1. O report agrega pelas dimensões pedidas em `fields` (date+offer+s_affiliate+event) ou devolve log linha a linha? Define o adapter.
2. `Affiliate_Price` vem por linha agregada ou por conversão? E `Currency` é sempre EUR?
3. Qual slot agrupa melhor: `s_affiliate` ou `aff_sub1`? (o que o report devolve consistente vira o slot oficial dos nossos links)
4. Paginação: tamanho de página default, `records` é o total ou o da página?
5. `timezone`: passar `-3.0` e conferir se o corte de dia bate com o dia BR (invariante `resolveServerToday`).
6. Atraso de fechamento do relatório (janela do `pullWindow`; Esportiva=2, LEON=5).
7. `date_end` é inclusivo ou exclusivo? (a Esportiva ensinou a não confiar — `toApiDateTo`)

## Plano de implementação (depois do probe)

1. **`src/lib/fomentoPull.ts`** (puro, padrão `leonbetPull.ts`): `buildReportUrl` + `adaptFomentoRows(apiRows, offerMap)` devolvendo `PullRow` POR CASA (o adapter é o único que conhece `offer_id`); testes colocados.
2. **Catálogo** (`INTEGRATION_CATALOG`): id `fomento-offer18`, envKeys `FOMENTO_API_KEY`/`FOMENTO_AID`/`FOMENTO_MID`; campos `aid`/`mid` na tela.
3. **Extensão 1↔N**: campo de `offer_id` no doc da casa + ajuste no `applyIntegrationLink`/rota de pull por casa (casa clicada → pull geral → grava só as casas vinculadas, ou filtro `offer=` por casa).
4. **Handler + cron** no `server.ts` (mesma forma do LEON: janela `pullWindow`, tag index compartilhado com o import manual, reescrita por data, audit log) + `PULL_CONNECTORS`.
5. **Demo**: a trava `demoCoverage` exige a integração nova refletida nos seeds.
