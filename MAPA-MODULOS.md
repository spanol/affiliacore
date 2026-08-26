# Mapa de módulos — como cada coleção se conecta

> **Este mapa é TRAVADO por teste.** A fonte declarada é `src/lib/moduleGraph.ts`
> e o `moduleGraph.test.ts` cruza o grafo com o código real (rules ∪ `server.ts` ∪
> `src/services/*`): coleção nova sem entrada, aresta solta, rota de exclusão sem
> contrato de cascata ou coleção sem menção AQUI quebram o `npm test`. Nasceu do
> incidente das casas "Sports" (22–24/08/2026): apagar a casa deixava o
> acordo-rascunho órfão na vitrine porque o acoplamento `houses→deals` não estava
> declarado em lugar nenhum.

## O desenho

```
                         ┌────────────────────────────────────────────┐
                         │                 IDENTIDADE                 │
                         │ users ── auth_totp · phone_verifications   │
                         │   │      invites · affiliate_email_aliases │
                         └───┼────────────────────────────────────────┘
                             ▼
     ┌───────────────────────────────────────────────────────────────────┐
     │                       AFILIADOS (raiz de quase tudo)              │
     │ affiliates ── affiliate_statuses · affiliate_configs              │
     │               pending_affiliates · affiliate_analytics           │
     └──────┬──────────────────┬───────────────────┬────────────────────┘
            │                  │                   │
   ┌────────▼───────┐  ┌───────▼────────────┐  ┌───▼───────────────────────┐
   │      REDE      │  │    DIVULGAÇÃO      │  │    CASAS & RESULTADOS     │
   │ affiliate_     │  │ affiliate_links ─┬─│  │ houses ⇄ integrations     │
   │  uplines       │  │  link_clicks     │ │  │   │  house_results        │
   │ special_       │  │  link_click_stats│ │  │   │  postback_events      │
   │  affiliates    │  └──────────────────┼─┘  │   │  affiliate_tag_aliases│
   │ affiliate_     │                     │    └───┼───────────────────────┘
   │  referrals     │            ┌────────▼────────▼──┐
   └────────────────┘            │    MARKETPLACE     │
                                 │ deals ──────────┐  │
                                 │ partnership_    │  │
                                 │  requests ◄─────┘  │
                                 └────────┬───────────┘
                                          ▼
   ┌────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
   │     FINANCEIRO     │  │     ENGAJAMENTO      │  │      JURÍDICO      │
   │ withdrawal_        │  │ notices · daily_     │  │ legal_documents    │
   │  requests          │  │  rankings · ranking_ │  │ legal_acceptances  │
   │ payment_profiles   │  │  prizes · contacts   │  └────────────────────┘
   └────────────────────┘  │ achievement_tiers    │  ┌────────────────────┐
                           │ achievement_requests │  │     PLATAFORMA     │
                           │ user_notifications   │  │ settings · app_meta│
                           │ direct_messages      │  │ audit_logs         │
                           └──────────────────────┘  │ api_partners       │
                                                     └────────────────────┘
```

A seta significa "carrega o id/slug de": `deals.houseId → houses`,
`partnership_requests.dealId → deals`, e assim por diante. A aresta é declarada no
lado que APONTA (`dependeDe` do grafo), e é dela que a trava deriva os dependentes
de cada coleção.

## As arestas que mais importam (e por quê)

- **`affiliates` é a raiz.** users, invites, affiliate_email_aliases,
  affiliate_statuses, affiliate_configs, pending_affiliates, affiliate_analytics,
  affiliate_uplines, special_affiliates, affiliate_referrals, house_results,
  postback_events, affiliate_tag_aliases, affiliate_links, partnership_requests,
  withdrawal_requests, daily_rankings e achievement_requests apontam para ela.
  **Não existe rota de exclusão de afiliado** — e é de propósito: apagar um
  afiliado é operação de script com backup (recadastro da Infinity, 22/08). Se um
  dia nascer `DELETE /api/affiliates/:id`, a trava vai exigir a decisão de cascata
  para cada uma dessas 18 coleções, e é exatamente esse o ponto.
- **`houses` ⇄ `integrations` é 1:1 em DOIS docs** (`houses.integration` +
  `integrations.houseId`), sempre via `applyIntegrationLink` — escrever um lado só
  desincroniza as duas telas.
- **Criar casa CRIA acordo-rascunho** (`buildDraftDealFromHouse`). O inverso
  existe desde 24/08: apagar a casa leva o rascunho intocado junto
  (`isUntouchedDraftDeal`).
- **`partnership_requests` denormaliza** operadora e label do deal — é o que
  permite `deals` e `houses` sumirem sem cegar a tela do afiliado.
- **`audit_logs` é o para-quedas:** toda exclusão relevante grava o doc inteiro em
  `metadata.snapshot` (`src/lib/auditSnapshot.ts`), então desfazer é reler o log.

## Contratos de exclusão (rota → o destino de cada dependente)

Fonte: `DELETE_CONTRACTS` em `src/lib/moduleGraph.ts` (o teste garante 1:1 com as
rotas `app.delete` do `server.ts`).

| Rota | Apaga | Cascata | Snapshot |
|---|---|---|---|
| `/api/houses/:id` | houses | deals: **apaga-rascunho** (intocado e sem parceria; precificado fica) · todo o resto (configs, resultados, postbacks, aliases, links, parcerias, saques, integrações): **mantém** (histórico) | sim |
| `/api/deals/:id` | deals | parceria viva: **bloqueia** (409; desativar encerra em cascata primeiro) · encerrada: fica denormalizada | sim |
| `/api/affiliate-links/:code` | affiliate_links | link com dono: **bloqueia** (só pool) · cliques/stats: **mantém** | sim |
| `/api/tag-aliases/:tag` | affiliate_tag_aliases | — (a tag volta à fila de pendentes no próximo pull) | não |
| `/api/legal-documents/:id` | legal_documents | aceites: **mantém** (prova sobrevive ao documento) | sim |
| `/api/achievement-tiers/:id` | achievement_tiers | pedidos: **mantém** (ver observações) | não |
| `/api/notices/:id` | notices | — | não |
| `/api/prizes/:id` | ranking_prizes | — | não |
| `/api/house-results` | house_results | — (limpeza por casa/data para reimportar) | não |

### Observações honestas (mantido ≠ perfeito)

Decisões `mantem` que carregam uma ponta conhecida — declaradas aqui em vez de
escondidas:

1. **Casa apagada com conector ligado:** `integrations.houseId` fica apontando
   para o slug morto, e `/integracoes` diz "ligada na casa X" de uma casa que não
   existe. Baixo impacto (o pull 404a), mas é o próximo da fila se incomodar.
2. **Casa apagada com links vivos:** o `/go/:code` continua redirecionando para o
   `registerUrl` já cunhado. É até desejável (o link do WhatsApp não morre), mas o
   clique não vira resultado em casa nenhuma.
3. **Placa de conquista apagada com pedido pendente:** o pedido referencia um tier
   que não existe mais; a tela mostra o pedido sem a placa.

## Como adicionar um módulo novo sem repetir o caso Sports

1. **Coleção nova** → declare em `MODULE_GRAPH` (módulo, descrição, `dependeDe`)
   e cite neste mapa. O teste aponta o que faltou.
2. **Escrita derivada** (criar X também grava Y) → a aresta `Y.dependeDe: [X]`
   entra no grafo, e TODO contrato de exclusão de X passa a exigir a decisão
   sobre Y. É a trava fazendo a pergunta que ninguém fez em 20/08: "e quando a
   casa morrer, o que acontece com o rascunho?".
3. **Rota de exclusão nova** → contrato em `DELETE_CONTRACTS` antes de a rota
   compilar limpo no teste: cascata por dependente + snapshot + travas.
4. **Seed da demo** (trava irmã, `demoCoverage.ts`) → coleção nova também precisa
   de dado na demo ou isenção com motivo.

## O que este mapa NÃO cobre (limites declarados)

- **Acoplamentos que não são coleção↔coleção**: campo dentro do mesmo doc
  (ex.: `houses.pendingTags` gravado pelo pull), claims de token, storage de
  browser. O grafo é do Firestore.
- **Escritas derivadas de CRIAÇÃO** são documentadas nas arestas, mas a trava só
  COBRA decisão nas exclusões — cobrir "criar X exige criar Y" mecanicamente
  exigiria anotar cada rota de escrita; se um segundo incidente da classe
  aparecer, é o upgrade natural.
- Exclusões feitas por script de operador (fora de rota) respondem ao processo de
  smoke/cleanup do CLAUDE.md, não a este contrato.
