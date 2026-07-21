# Plano de integração — Affility/NovaEra → AffiliaCore

> 2026-07-21. Continuação de `PESQUISA-AFFILITY.md` (catálogo + gap analysis). Este
> doc é o plano de EXECUÇÃO dos itens Tier 1 (convergentes nas duas plataformas de
> referência, ausentes na AffiliaCore) + decisões de arquitetura tomadas. Marketplace
> (P2/P3) já ENTREGUE — ver `affility-benchmark` na memória.

## Escopo desta rodada (Tier 1)

1. **Export CSV** — afiliado exporta o próprio extrato diário; admin exporta o de qualquer afiliado.
2. **Jurídico versionado** — documentos (Acordo de Afiliação, Código de Conduta, Pagamentos) com versão + registro de aceite. **Modo SOFT nesta entrega**: informativo, não bloqueia login/uso — o conteúdo é placeholder e precisa de revisão jurídica antes de virar obrigatório (ver nota no fim).
3. **Carteira + Saque** — o maior gap (convergente nas duas referências). Saldo apurado (baseado no `calcAffiliatePayout` já auditado) menos já pago/aprovado = disponível. Afiliado solicita; admin aprova/rejeita/marca como pago. **Sem gateway de pagamento** (não há integração PIX automática no repo) — pagamento é feito manualmente pelo admin fora do sistema; o sistema só rastreia o estado. Reaproveita `payment_profiles` (PIX/NF já coletados, B4) para mostrar o destino do saque.

Todos universais (Boost + Infinity) — ao contrário do marketplace, não são específicos de um cliente; não usam o gate `MARKETPLACE_ENABLED`.

## Decisões de arquitetura

### Saldo do afiliado — de onde vem
Fonte única de dinheiro continua `src/lib/commission.ts` (`calcAffiliatePayout`). O saldo
**apurado** (bruto, todo o histórico) é a soma de `calcAffiliatePayout(row, config, brandId)`
sobre TODOS os `results` (OTG paginado + manual, já mesclados como o resto do app) desde
sempre — não um lote fechado por batch financeiro (isso ficaria pra uma v2, como a Affility
faz com lotes). **Disponível para saque = apurado − Σ(saques aprovados ou pagos)** (nunca
subtrai um rejeitado). Cálculo feito no SERVIDOR (Admin SDK, escopado por papel — nunca
confia em número vindo do cliente), mesmo padrão do restante do dinheiro no repo.

### Saque — máquina de estados (sem gateway)
`withdrawal_requests/{id}`: `affiliateId, amount, status, pixSnapshot, requestedAt, decidedAt, decidedByUid, note`.
Estados: `requested → approved → paid` ou `requested → rejected`. Aprovar NÃO paga (só
sinaliza "confirmado, vai entrar na fila"); `paid` é o admin confirmando que TRANSFERIU
manualmente. `pixSnapshot` = cópia do `payment_profiles` no momento da solicitação (a chave
PIX pode mudar depois; a trilha tem que mostrar pra ONDE foi pago). Auditado (`withdrawal.request/approve/reject/pay`) — mesmo padrão do `config.update`.

### CSV — server ou client?
Client-side: os dados já chegam ao browser (results/daily), gerar o CSV lá evita mais uma
rota e mais round-trip. `src/lib/csv.ts` (puro: linhas→string CSV, escaping RFC4180) +
trigger de download via Blob. BOM UTF-8 (Excel BR abre acentuação certa sem BOM quebrar).

### Jurídico — versionado mas não-bloqueante (por ora)
`legal_documents/{slug}` (`title, version, contentMd, updatedAt`) + `legal_acceptances/{uid_slug}`
(`uid, slug, version, acceptedAt`). Tela em `/termos` (lê os docs, mostra "aceitar" por doc,
grava aceite). **NÃO** gate nenhuma rota nesta entrega — texto é placeholder genérico
(não é aconselhamento jurídico) até o operador revisar com um advogado e trocar o conteúdo.
Quando o conteúdo for aprovado, um follow-up liga o gate (ex.: `ProtectedRoute` força
`/termos` se `!hasAcceptedLatest`).

## Fora de escopo desta rodada
Materiais/criativos, rede self-service, suporte/FAQ dedicado — ficam pro próximo lote
(ver `affility-benchmark` Tier 2/3 pra retomar).
