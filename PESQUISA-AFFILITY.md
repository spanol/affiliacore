# Pesquisa — Affility (partners.affility.com.br) · referência de features

> Levantamento 2026-07-21. O pessoal da Infinity apontou a Affility como referência
> ("nosso serviço ainda tá CRU"). Scrape **somente-leitura** do painel logado (conta de
> **afiliado**, não operador). Objetivo: catálogo de features → gap vs AffiliaCore →
> roadmap priorizado. Complementa `PRODUTIZACAO.md` (produto) e `PESQUISA-INTEGRACAO-CASAS.md`.

## 0. TL;DR — por que a AffiliaCore parece "crua"

A AffiliaCore hoje é um **wrapper admin-cêntrico**: o admin importa/atribui tudo e o
afiliado só vê uma dashboard de resultados. A Affility é uma **rede/marketplace
self-service**: o afiliado escolhe acordos, pega links por acordo, acompanha relatórios,
e **saca sozinho**. O "cru" está quase todo na **experiência do AFILIADO** — ele não
consegue se servir. As 3 lacunas que mais pesam:

1. **Marketplace de acordos (Parcerias)** — afiliado navega operadoras/deals, solicita, é
   aprovado, e recebe link por acordo. Hoje na AffiliaCore o admin faz tudo à mão.
2. **Carteira com saque (Financeiro)** — saldo em estados (pendente→aprovado→liberado→sacado),
   PIX self-service, retenção de imposto, extrato e histórico de saques. Hoje a AffiliaCore
   só **captura** PIX (`payment_profiles`), sem fluxo de saque.
3. **Links por acordo (Meus Links)** — 1 afiliado → N casas, cada uma com seu `/aff/<code>` e
   contagem de cliques. Hoje a AffiliaCore só tem o `/go/:code` da agência.

## 1. O modelo da Affility em uma figura

```
Operadora (casa) ──publica──▶ Deal/Acordo ──afiliado solicita──▶ Solicitação (status)
   (Deuces)                   "Deuces-CPA-Quinzenal-Crypto-México"      pendente/aprovada/encerrada
                              modelo=CPA, valor=BRL 80, ciclo, moeda, geo        │
                                                                                 ▼ (aprovada)
                                                            Link aprovado  /aff/<code>  ──▶ cliques ──▶ comissões
                                                                                 │
                                                                                 ▼
                                       Carteira: pendente → aprovado → liberado (lote) → sacado (PIX)
```

Entidades que a AffiliaCore **não separa hoje** e deveria: **Operadora** ≠ **Deal/Acordo**
≠ **Solicitação/Parceria** ≠ **Link aprovado**. Hoje "afiliado tem uma marca + um config
CPA/REV" — modelo raso. Um afiliado pode ter **N acordos** (múltiplas casas), cada um com
termos e link próprios (confirmado no FAQ: *"pode solicitar todos os acordos disponíveis e
usar os links aprovados de cada casa"*).

### Convenção de nome de deal (ótima referência)
`Operadora - Modelo - Ciclo - Moeda - Geo` + valor. Ex.:
**`Deuces - CPA - Quinzenal - Crypto - México`** · badges `CPA` `BRL 80`.
- **Modelo**: CPA / RevShare / Híbrido
- **Ciclo**: Quinzenal / Mensal (janela de fechamento/pagamento)
- **Moeda**: BRL / Crypto
- **Geo/Mercado**: filtro "Todos mercados" (México, Brasil, …)

## 2. Catálogo de features (painel do AFILIADO)

| Seção | Rota | O que faz | Detalhes-chave |
|---|---|---|---|
| **Dashboard** | `/` | Resumo financeiro + evolução diária | Cards: Saldo disponível (elegível p/ saque), Comissões no período, Total em saques, Saldo pendente, Total gerado, Links ativos, Cliques nos links. Gráfico "Minhas comissões" diário. "Top deals do período" e "Meus links em destaque". CTA "Solicitar saque". |
| **Relatórios** | `/reports` | Métricas consolidadas por data/operadora/acordo | Comissão total, Cliques, **Cliques únicos**, Registros, **FTDs**, evolução diária (comissões+FTDs), "métricas gerais com **taxas derivadas automaticamente**", **Exportar CSV**, filtro por operadora e por deal. |
| **Parcerias** | `/partnerships` | Marketplace de acordos + solicitações | Abas "Ofertas disponíveis" / "Minhas solicitações". Busca operadora + filtro por mercado. Cada solicitação tem **status** (Aprovada / Encerrada — "descontinuada pela operadora") e, se aprovada, o **link de divulgação**. |
| **Meus Links** | `/my-links` | Links aprovados por casa | 1 card por acordo: logo+nome da operadora, descritor do deal, **Acordo (valor R$)**, **Cliques**, link `/aff/<code>` + **Copiar**. Chips de filtro por casa. |
| **Financeiro** | `/wallet` | Carteira + saque | Estados: **Liberado p/ saque** (por **lotes**), **Saldo aprovado**, **Saldo pendente**, **Total sacado**. Retenção **8% p/ PF**. **Dados de pagamento PIX** (chave+tipo auto-detectado, banco/agência/conta/titular). **Extrato de comissões** (filtros). **Histórico de saques** (pendente/concluída/rejeitada). Botão "Sacar R$ X". |
| **Ferramentas** | `/tools` | Ferramentas de divulgação | Ex.: **App Indicador de Slots** — mini-app hospedado (`/indicador/index.html?rl=<code>`) com o código do afiliado embutido, por casa aprovada. Copiar link + "Abrir prévia". |
| **Ranking** | `/ranking` | Ranking + competições | Aba "Ranking do Período" (por **CPAs** e comissões, nomes anonimizados F***/J***) + aba **"Competições"** (sazonais). Filtro de data / "Mês atual". |
| **Premiações** | `/reward-journey` | (em construção **na própria Affility**) | Jornada de recompensas gamificada — **ainda não existe nem lá** (não é gap). |
| **Meu Perfil** | `/profile` | Conta em 4 abas | **Pessoal** (email fixo, nome, nickname, empresa, telefone, website, país); **Experiência** (perfil, CPAs mensais, **canais de marketing** multi-select, público-alvo → qualifica p/ aprovação); **Pagamento** (PIX/banco); **Segurança** (só troca de senha — **sem 2FA lá também**). |
| **Indique e ganhe 5%** | (card no `/profile`) | Referral self-service | Link+código de convite (`ME49JA3X`). Afiliado ganha **5% sobre a comissão líquida aprovada** dos afiliados que entram pelo convite. Stats: indicados ativos, ganhos aprovados/pendentes. |
| **Chrome/UX** | (global) | — | Busca global ⌘K, sino de notificações, toggle claro/escuro, widget de **Suporte** (chat), **FAQ** (`/faq`, central de dúvidas por categoria). |

**Regras de negócio confirmadas (FAQ):** comissão = métricas aprovadas → só saca **após
liberação financeira** (lote); múltiplas parcerias são permitidas (1 afiliado → N casas).

## 3. Gap analysis vs AffiliaCore

Legenda: ✅ tem · 🟡 parcial · ❌ falta

| Feature Affility | AffiliaCore hoje | |
|---|---|---|
| Marketplace de acordos self-service (Parcerias) | admin atribui casa+CPA/REV à mão; afiliado não escolhe | ❌ |
| Deal como entidade (modelo/ciclo/moeda/geo/valor) | "afiliado tem 1 marca + config" (`affiliate_configs`) | 🟡 |
| Fluxo de aprovação de parceria (solicita→aprova/rejeita/encerra) | convite model-C (admin→afiliado), sem "solicitar acordo" | 🟡 |
| Links por acordo `/aff/<code>` + cliques por link | `/go/:code` da **agência** (não por afiliado×casa) | 🟡 |
| Carteira com saque (lotes, estados, extrato, histórico) | `payment_profiles` só captura PIX/NF; sem wallet/saque | ❌ |
| Retenção de imposto (8% PF) no saque | — | ❌ |
| Relatórios do afiliado + **Export CSV** | dashboards; funil v1 (cliques/FTD/NGR); sem export CSV | 🟡 |
| Ferramentas de divulgação (mini-apps/criativos) | — | ❌ |
| Referral self-service ("indique e ganhe %") | **especiais/rede** é a versão **admin-gerida** (`special_affiliates`) | 🟡 |
| Perfil de qualificação do afiliado (canais/público/volume) | cadastro tem nome/CPF/telefone/social; sem canais/volume | 🟡 |
| Competições sazonais (ranking) | ranking diário + prêmios (`daily_rankings`/`ranking_prizes`) | 🟡 |
| FAQ / Central de dúvidas | — | ❌ |
| Suporte (chat/ticket) | contatos (`contacts`, formulário público) | 🟡 |
| Busca global ⌘K / sino de notificações | sino/avisos (`notices`, `user_notifications`) ✅; busca ⌘K ❌ | 🟡 |
| 2FA | — (Affility também não tem) | — |

**A AffiliaCore já ganha em coisas que o painel de afiliado da Affility nem mostra:** lucro
líquido/margem da **agência** e por casa (`composeAdminProfit`), **trilha de auditoria**
(`/auditoria`), integração OTG, import manual de planilha, white-label por env. O gap é
concentrado na **superfície do afiliado** (self-service).

## 4. Roadmap priorizado (o que construir)

Ordenado por **impacto na percepção "produto maduro" ÷ esforço**. Cada item aterra na
arquitetura atual (coleções Firestore + endpoints `server.ts` + rules; ver `CLAUDE.md`).

### P1 — Carteira + Saque (Financeiro) · ALTO impacto, MÉDIO esforço
O afiliado ver saldo e **pedir saque** é o que mais "vende maturidade". Já temos comissão
calculada (`commission.ts`) e `payment_profiles`.
- Coleções novas: `withdrawals/{id}` (status pendente/aprovado/pago/rejeitado, valor, afiliado, lote), `payout_batches/{id}` (lote liberado pelo financeiro).
- Endpoints (server): `GET /api/wallet` (escopado por papel — reusa `resolveScopedAffiliateIds`), `POST /api/withdrawals` (afiliado solicita), `PATCH /api/withdrawals/:id` (admin aprova/paga), `POST /api/payout-batches` (admin libera lote).
- UI: página `/carteira` (afiliado) + gestão no `/admin`. Estados: pendente→aprovado→**liberado (lote)**→sacado. Extrato + histórico. Retenção configurável por instância (env/settings).
- ⚠️ Dinheiro: toda soma passa por `commission.ts` (fonte única); nada de fórmula inline. Auditar cada transição em `audit_logs`.

### P2 — Deal/Acordo como entidade + Parcerias self-service · ALTO impacto, ALTO esforço
O coração do modelo Affility. Transforma "afiliado tem 1 casa" em "afiliado tem N acordos".
- Coleções: `deals/{id}` (operadora/casa, modelo CPA|RevShare|Híbrido, ciclo, moeda, geo, valor, ativo), `partnership_requests/{id}` (afiliado, deal, status solicitada|aprovada|rejeitada|encerrada).
- Reaproveita `houses` como "operadora". `affiliate_configs` vira o **resultado** de um deal aprovado (taxa por acordo), não config solta.
- UI: `/parcerias` (ofertas + minhas solicitações) p/ afiliado; aprovação no `/admin`.
- **Fasear**: P2a só o admin cria deals e "atribui" (sem self-service) → P2b afiliado solicita e admin aprova. Casa com o "especial = master escopado".

### P3 — Links por acordo (Meus Links) · ALTO impacto, BAIXO/MÉDIO esforço
Já temos `/go/:code` + tracking (`affiliate_links`, `link_clicks`). Estender de "link da
agência" p/ **link por afiliado×deal** aprovado.
- `affiliate_links` ganha `affiliateId`+`dealId`; página `/meus-links` (afiliado) lista os aprovados com cliques e "Copiar". Redirect `/go/:code` já existe.

### P4 — Relatórios do afiliado + Export CSV · MÉDIO impacto, BAIXO esforço
Já temos os dados (resultados OTG/manual + funil v1). Faltam a **tela self-service do
afiliado** com filtros por casa/deal e **exportar CSV** (cliques únicos, registros, FTDs,
comissão, taxas derivadas). Export CSV era pedido recorrente (ver `novaera-affiliates-recon`).

### P5 — Perfil de qualificação (Experiência) · BAIXO esforço, destrava P2
Adicionar ao cadastro/perfil: tipo de perfil, CPAs mensais (faixa), **canais de marketing**
(chips), público-alvo. Alimenta a decisão de aprovar parceria (P2). Campos em `users` (não
sensível) — cuidado só com PII já mediada.

### P6 — Ferramentas de divulgação · MÉDIO impacto, MÉDIO esforço
Criativos/materiais + "mini-apps" com o código do afiliado embutido (modelo "App Indicador
de Slots"). Começar simples: banners/links prontos por casa em Storage; depois mini-app.

### P7 — Referral self-service ("indique e ganhe %") · MÉDIO impacto, MÉDIO esforço
Versão **self-service** do especial/rede: todo afiliado tem link de convite e ganha %
override sobre a comissão líquida dos indicados. Já temos `special_affiliates` + spread de
rede em `commission.ts` — é surfaciar isso ao afiliado comum + o link viral (casa com
`CADASTRO-DIRETO.md`, que já previa link de recrutamento reutilizável).

### Rápidas / polish (baixo esforço)
- **FAQ** (`/faq`, coleção `faq` ou estático) — central de dúvidas por categoria.
- **Busca global ⌘K**.
- **Competições** no ranking (extensão de `daily_rankings`).
- **Suporte**: hoje `contacts`; avaliar chat/ticket.

## 5. Notas de UX/arquitetura (referência de implementação)
- **Estados de dinheiro explícitos** em toda a UI: pendente / aprovado / liberado / sacado.
  O afiliado sempre sabe "quanto e quando". Isso, sozinho, muda a percepção de maturidade.
- **Aprovação como workflow de 1ª classe** (solicitação com status + timestamp + trilha),
  não flag booleana. Encaixa na auditoria server-authoritative que já temos.
- **Anonimização no ranking público** (F***, J***) — privacidade por padrão.
- **Deal descriptor legível** (Operadora-Modelo-Ciclo-Moeda-Geo) vira label em todo lugar.
- **Retenção de imposto/moeda/ciclo por instância** (white-label): mais 3–4 envs/settings,
  no espírito do `VITE_OTG_ENABLED`/`VITE_BRAND_*`.

## Anexo — o que NÃO foi visto
- **Lado operador/admin da Affility** (a conta scrapada é de afiliado). O fluxo de "como a
  operadora publica deal / aprova parceria / libera lote" é inferido do lado do afiliado.
- Telas vazias no período (sem comissão/deal ativo) — estrutura capturada, dados não.
- `Premiações` está "em construção" na própria Affility.
