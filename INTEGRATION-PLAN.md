# Plano de Integração — Boost Agency

> Consolidação da estratégia de integração após o mapeamento da dashboard da OTG e a
> sondagem das APIs (2026-05-29). As trilhas são separadas por **de onde vêm os dados**,
> porque é isso (e não a dificuldade) que define o que é construível agora.
> Itens de backlog detalhados em [`BACKLOG.md`](./BACKLOG.md).

## Fontes de dados

| Fonte | Acesso | O que oferece |
|-------|--------|---------------|
| **API v2 externa** (`/api/v2/external`, `x-api-key` via proxy) | ✅ temos | `affiliates`, `results` (groupBy `affiliate`/`brand`/`date`/`campaign`), `campaigns` |
| **API v1 interna** (`/api/v1`, JWT de sessão da agência) | ❌ **não temos** (401 com nossa chave) | cliques, valores em aposta, canais, ciclo de pagamento |
| **Firebase** (Auth + Firestore) | ✅ nosso | usuários/roles, configs CPA/REV, status, auditoria, convites, espelho de afiliados |

**Conclusão-chave:** o MVP é 100% construível sobre a **v2 + Firebase**. Os dados exclusivos
do v1 dependem de a OTG liberar acesso (ver Trilha C).

---

## Fase 0 — Concluído ✅
- Migração para o Firebase novo (`agencia-boost-app`) + regras por role.
- Onboarding de afiliados (modelo C: convite → auto-cadastro vinculado ao `affiliateId`).
- Exibição de dados reais do afiliado (KPIs, funil, por casa, série diária).
- Autenticação das rotas `/api/*` (`requireAuth`/`requireAdmin`) + **escopo por afiliado** no proxy.
- Correções: admins fora da listagem de afiliados; input de CPA/REV.

---

## Trilha A — MVP sobre a v2 (sem bloqueio, construível já)

| Item | Escopo | Observação |
|------|--------|------------|
| **B2 · Filtros de data** ✅ | date range picker (admin + client) propagando `startDate`/`endDate` ao proxy | **Feito** — `DateRangePicker` + `lib/dateRange` (presets: hoje/7d/30d/mês atual/mês passado/personalizado); padrão = mês atual; client filtra livremente. Removido o `2024-01-01` fixo do `affiliateService`. Conserta a divergência OTG×Boost ao permitir alinhar o período. |
| **B1 · Lucro líquido** | `Σ comissão da casa (results.total_commission) − Σ repasse ao afiliado (config)` | Card no AdminDashboard + por afiliado |
| **Depósitos** | surfacing do campo `deposit` (já vem no results) | trivial |
| **Multi-marca** ⚙️ UI pronta · 🔴 dados bloqueados na OTG | UI multi-marca implementada (filtro por marca + badge no AdminDashboard e AffiliatesList; `lib/brand`). **Verificado 2026-05-30: a API externa retorna SÓ Superbet (37/37 afiliados, `groupBy=brand` só traz Superbet).** O filtro fica oculto com 1 marca e aparece sozinho quando a OTG vincular afiliados SportingBet à nossa `x-api-key`. **Não é tarefa de código — é onboarding operacional na OTG.** |
| **Por Campanha** ✅ | visão analítica por campanha | **Feito** — `aggregateByCampaign` + `CampaignBreakdown` (tabela em sm+, cards no mobile) no `/admin` (rede) e no painel do afiliado (própria comissão). |

## Trilha B — Produto / decisão (v2 + Firebase)

| Item | Bloqueio |
|------|----------|
| **Qualificação do MVP** (quais KPIs entram) | decisão do chefe — usar `public/mvp-inventario.html` |
| **B4 · Dados bancários** (PIX/banco/CNPJ) | decisão + segurança (`firestore.rules` restrito) |
| **B5 · Acessos/visualizações** (settings do admin master) | depende de definir os eixos (por-admin? por-tela?) |

## Trilha C — BLOQUEADA: requer acesso à API v1 da OTG 🔴
Dados: **Cliques · Valores em Aposta · Canais · Ciclo de pagamento.**
Não existem na v2 e o v1 exige JWT de sessão (nossa `x-api-key` dá 401).
**Ação necessária:** pedido formal à OTG (rascunho abaixo). Não é tarefa de código.

## Trilha D — Discovery 🔵
- **B3 · Sub-afiliados** — antes de desenhar, entender a "feature incompleta" e se a OTG
  expõe hierarquia. Provável modelo local (`parentAffiliateId`) + papel "afiliado master".

## Trilha E — Testes 🧪 (em andamento)
Antes não havia test runner. Fundação montada com **Vitest + React Testing Library + jsdom**
(`vitest.config.ts`, setup em `src/test/setup.ts`). Scripts: `npm test`, `npm run test:watch`,
`npm run coverage`. Convenção: arquivos `*.test.ts(x)` ao lado do código.

| Cobertura | Estado |
|-----------|--------|
| `lib/dateRange` (presets, fuso, matchPreset) | ✅ coberto |
| `affiliateService` — helpers defensivos (`extractArray`/`extractApiError`/`isNoDataError`) | ✅ coberto |
| `components/DateRangePicker` (presets, intervalo custom, normalização) | ✅ coberto |
| Demais services, contexts e páginas | ⬜ crescer por fase |
| Handlers de API do `server.ts` (com mock do Firebase Admin) | ⬜ pendente |

**Regra de ouro:** cada nova fase (B1, multi-marca, etc.) entra com seus testes junto.

---

## Bloqueadores a resolver (fora de código)
1. **Acesso à API v1 da OTG** → libera a Trilha C.
2. **Origem da feature de sub-afiliado** → libera a Trilha D (B3).
3. **Qualificação do MVP pelo chefe** → trava o escopo da Trilha B.

## Rascunho — pedido de acesso à OTG (v1)
> Olá, equipe OTG. Estamos integrando o painel Boost via a API externa
> (`/api/v2/external`, com `x-api-key`), que cobre afiliados, resultados e campanhas.
> Precisamos também dos dados que hoje só aparecem na dashboard de vocês e não estão na v2:
> **cliques, valores em aposta (handle), canais e ciclo/relatório de pagamento**.
> Vocês conseguem (a) expor esses campos na API v2 externa, ou (b) nos fornecer uma
> credencial/escopo de API para os endpoints `/api/v1/...` correspondentes? Seguem os
> endpoints que identificamos: `/api/v1/system/global-config`, `/api/v1/payment-cycle/*`.

---

## Sequenciamento recomendado
1. ~~**B2** (rápido + corrige a divergência)~~ ✅ → 2. **B1** (lucro líquido) → 3. **Multi-marca + Por Campanha**
   → 4. **B4/B5** (após decisão do chefe) → 5. **Trilha C** (quando a OTG liberar v1)
   → 6. **B3** (após discovery).
