# Recon · Fomento (rede Offer18) — integração de resultados

**Data:** 2026-08-18 · **Branch:** `feat/integracao-fomento` · **Status:** recon completo; implementação BLOQUEADA na chave de API (o operador gera no painel).

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
