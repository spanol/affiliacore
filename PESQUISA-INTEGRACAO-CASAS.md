# Pesquisa: integração direta com casas de aposta / plataformas de afiliação

**Data:** 2026-07-18 · **Contexto:** hoje a AffiliaCore depende de o cliente-agência já ter uma conexão (Boost→OTG via `x-api-key`). Esta pesquisa mapeia como a plataforma pode se integrar **diretamente** com casas/plataformas de afiliação, sem esse pré-requisito.

**Método:** pipeline de deep research (5 ângulos de busca em paralelo → 14 fontes → 66 alegações extraídas) + verificação manual das alegações estruturais em fonte primária. Alegações marcadas **[V]** foram verificadas hoje na fonte primária; as demais são de fonte única (a fase de verificação adversarial do pipeline falhou por rate-limit — tratar itens sem [V] como "provável, confirmar antes de construir em cima").

---

## TL;DR

1. **Não existe "a API das casas".** Cada casa terceiriza o programa de afiliados para uma plataforma de software (MyAffiliates, Affilka, Cellxpert, Income Access…) ou roda sistema próprio (bet365, Entain). **Só ~61% dos programas iGaming expõem API ao afiliado** (dado StatsDrone, ago/2025); o resto é painel web → scraping/CSV.
2. **O modelo OTG (API key por conta de afiliado) é replicável** em várias plataformas: Affilka tem token self-service no painel do afiliado [V-indireto], MyAffiliates tem XML API para afiliado [V], Cellxpert tem API (guia de conexão de agregador existe).
3. **Achado crítico para o cliente 0:** os programas diretos da **Superbet [V]** e da **Betano** rodam **Income Access (Paysafe)** — que **não tem API de afiliado pública confirmada** (painel + exports). Ou seja: sair da OTG para "direto na Superbet" não é uma troca de API por API; é painel/scraping/agregador.
4. **Já existe "Plaid do iGaming": StatsDrone** (2.174+ programas, conecta por credenciais/API/CSV, expõe API própria de export, cadência diária, atende agências). Alternativa: Routy. Os agregadores mainstream (Strackr, WeCanTrack) não cobrem bem o vertical.
5. **Regulatório BR não bloqueia** o caminho: não há registro estatal de afiliado; a responsabilidade é do operador (solidária). Virar **rede/master-afiliado** é permitido (subcontratação prevista na Portaria 1.231/2024), mas exige contrato com cada casa e compliance de publicidade. LGPD: operar com subid/dados agregados, nunca PII de apostador.

---

## 1. Como o mercado funciona (panorama dos provedores)

Market share de software de afiliação iGaming (StatsDrone, jan/2026, via Tribuna): **MyAffiliates líder**, **Affilka (SOFTSWISS) 17,55%** (maior crescimento), **Cellxpert 10,40%**, seguidos de **Income Access** e **NetRefer**.

| Plataforma | API para o AFILIADO? | Autenticação | Granularidade | Evidência |
|---|---|---|---|---|
| **MyAffiliates** | **Sim [V]** — "Affiliate XML API Access": afiliado gera relatórios via XML API sem login manual; feeds documentados (Feed 1 Users, Feed 4/5 token, Feed 6 User Transactions) | Token | Por campanha/dia; hourly em alguns programas; postbacks suportados | myaffiliates.com/features; wecantrack.com/myaffiliates-integration |
| **Affilka (SOFTSWISS)** | **Sim** — "Statistic token" que o próprio afiliado copia em My Account → Account info | Token estático por conta (não OAuth) | Estatísticas; postback também suportado | support.routy.app (guia "Connecting via API - Affilka") |
| **Cellxpert** | Provável — "Full RESTful API"; Routy mantém guia "Connecting via API - Cellxpert" | A confirmar na doc | A confirmar | statsdrone.com/affiliate-software/cellxpert |
| **Income Access (Paysafe)** | **Não confirmada** — painel com 30+ relatórios, exports CSV/Excel/PDF, SSO, "S2S event relay"; nenhuma doc pública de API de afiliado | — (painel) | Relatórios do painel | paysafe.com/income-access; buscas 2026-07-18 |
| **NetRefer / PartnerMatrix / RavenTrack / Smartico(TAP) / Affise / Alanbase** | Integráveis por agregador ("dynamic variables" no StatsDrone) — detalhe por plataforma a confirmar | Varia | Varia | statsdrone.com (lista de integrações nativas) |
| **Entain Partners** (Sportingbet/BetMGM) | Proprietário; StatsDrone integra com dynamic variables | — | RevShare escalonado 25–35% | statsdrone.com/affiliate-programs/entain-partners |
| **bet365 Partners** | **Proprietário, sem API pública de afiliado** | — (painel) | Exports do painel | findmyaff.com/affiliate-programs/bet365 |

Dado transversal importante: **apenas ~61% dos programas listados no StatsDrone suportavam API em ago/2025** — qualquer estratégia de cobertura ampla precisa de um fallback não-API (CSV/import manual — que já temos — ou scraping).

## 2. Mapa BR: casa → plataforma de afiliados

| Casa | Plataforma | Sub-afiliados? | Observações |
|---|---|---|---|
| **Superbet** | **Income Access [V]** ("Affiliate Software powered by Income Access, a Paysafe company" no portal oficial affiliates.superbet.com) | ? | Hoje a Boost acessa via OTG (master-afiliado intermediário) |
| **Betano** | Income Access (StatsDrone review) | ? | Mesma limitação de API do Income Access |
| **Sportingbet / BetMGM** | Entain Partners (proprietário) | ? | RevShare 25–35%; Boost acessa via OTG |
| **bet365** | Proprietário | ? | Sem API; só painel/exports |
| **KTO** | **MyAffiliates [V]** | **Sim — 5% sub-affiliate [V]** | RevShare 25–35%, CPA negociado c/ gerente; "API Reporting", "Postbacks", "Dynamic Variables", day-level stats [V] |
| **Estrela Bet** | Plataforma própria (suporte.estrelabet.com/afiliados/plataformas) | ? | CPA fixo ≥ R$30 (não re-verificado) |

Leitura estratégica: a **OTG é um master-afiliado/agência** — o que a Boost consome não é "a API da Superbet", é a API da rede OTG. As casas têm programas diretos próprios, cada um na sua plataforma. **KTO é o alvo direto mais amigável** (MyAffiliates com API + sub-afiliados formais).

## 3. Modelos de integração para a AffiliaCore

### (a) Credencial do próprio cliente por plataforma — "modelo OTG replicado" ⭐ recomendado
O cliente-agência tem conta no programa da casa; cola a credencial (token Affilka, token XML MyAffiliates…) na AffiliaCore; nosso servidor puxa e normaliza. É exatamente o que Routy e StatsDrone fazem em escala comercial — o modelo é validado.
- **Encaixe na arquitetura:** é o padrão OTG generalizado. Mudança estrutural: a credencial deixa de ser env/Secret por instância (`AFFILIATE_API_KEY`) e vira **coleção server-only `connections/{id}`** ({platform, credencial, affiliateAccountId}) mediada pelo Admin SDK (mesmo padrão `settings/external_api`/`affiliate_email_aliases`), + um **conector por plataforma** atrás do proxy existente (paginação/mirror/normalização já existem).
- **Esforço:** M na fundação "connections" + S–M por conector (Affilka é o mais simples; MyAffiliates é XML).

### (b) Postback/S2S + tracking próprio por clique+subid
O clique passa pelo nosso `/go/:code` (fundação já commitada — commit 97d572f), gera clickid; a casa/plataforma dispara postback (registro, FTD, depósito) de volta. Confirmado como o padrão do setor (S2S > pixel).
- **Limitações:** (1) exige **cooperação do operador** — configurar a postback URL e devolver o clickid — não é unilateral; (2) postback simples atribui eventos, mas **RevShare exige atualização contínua de NGR** — sem isso não fecha comissão mensal; a conciliação continua precisando de API de relatórios ou import.
- **Papel:** complementar ao (a) — resolve a atribuição POR JOGADOR (hoje gated na OTG), não substitui relatórios.
- **Esforço:** S–M (endpoint de postback + persistir clickid; taxonomia já desenhada em referências Scaleo).

### (c) Scraping autenticado de painéis
Praticado abertamente pelo StatsDrone ("Chromium headless… using traditional login credentials… just like a real user") como fallback para os ~39% sem API. Viável, mas frágil (quebra a cada redesign), risco de ToS/bloqueio e de credencial de login (não token) sob nossa guarda.
- **Papel:** último recurso, por casa de alto valor sem API (ex.: Income Access). Preferir (e) antes.

### (d) Virar rede / master-afiliado
A agência (ou a própria AffiliaCore) contrata direto com a casa como master e sub-afilia os parceiros — vira "a OTG dos clientes". Override típico do master: **5–15% do NGR** dos subs. Plataformas de operador (Scaleo, Wynta) já modelam multi-tier com propagação de subid, então o arranjo é padrão de mercado.
- É **decisão de negócio** (contratos, vetting, payout, risco), não só de engenharia. O software necessário é em grande parte o que já temos ("especial = master escopado" é literalmente este modelo).
- Regulatório: permitido (ver §4), mas o compliance de publicidade da rede vira nosso problema operacional.

### (e) Agregadores prontos ("Plaid do iGaming") — avaliar buy antes de build
- **StatsDrone**: específico de iGaming, **2.174+ programas**, conecta por credenciais/API/CSV, **API própria de export** ("accounts, brands, campaigns, postbacks and dynamic variables"), cadência diária, ICP inclui **agências e redes**. Cobre MyAffiliates, RavenTrack, ReferOn, Cellxpert, Affilka, **Income Access** (o gap das casas do cliente 0!).
- **Routy**: agregador iGaming concorrente (guias de conexão Affilka/Cellxpert/MyAffiliates); site bloqueou verificação direta (403).
- **Strackr** (282 redes) e **WeCanTrack** (450+): mainstream/e-commerce. WeCanTrack até lista MyAffiliates/Income Access/Cellxpert/NetRefer, mas sem Affilka/PartnerMatrix/bet365/Betano — cobertura iGaming parcial.
- **Papel:** POC AffiliaCore→StatsDrone API com a conta da Boost pode dar cobertura de N casas por 1 integração. Avaliar: custo por conta, ToS de revenda de dados, LGPD (dados ficam com terceiro), latência diária.

## 4. Regulatório BR (condições de contorno)

Base: Lei 14.790/2023 + **Portaria SPA/MF nº 1.231/2024** (publicidade/afiliados; fiscalização desde 01/01/2025). Verificado no texto da portaria **[V]**:
- **Afiliado** definido no Art. 2º, VI: quem "faz publicidade para agente operador de apostas, mediante compensação… atrelada a resultados".
- **Art. 21:** operadores são **responsáveis solidários** pelas ações de publicidade dos afiliados.
- **Art. 22:** contrato **escrito, em português**, especificando deveres do afiliado, mantido **à disposição da SPA**.
- **NÃO existe registro/cadastro/certificação estatal de afiliado** — o vínculo regulatório é sempre via operador.
- Restrições de publicidade dos Arts. 12–13 **aplicam-se aos afiliados** (sem promessa de ganho fácil, sem menores, avisos 18+/jogo responsável).
- **Sub-contratação é permitida** (Art. 22, II, "a"), mas "a responsabilidade do agente operador não pode ser afastada" — ou seja, redes/sub-afiliação são legais, e a casa vai exigir governança da rede.
- **LGPD:** bets tratam CPF, dados financeiros, geolocalização; regulação exige dados de jogadores em data centers no Brasil. Implicação para nós: **operar com dados agregados/pseudonimizados (subid)**; se processarmos dados por jogador (postback), entramos como operador/controlador LGPD — minimização e base legal viram requisito.
- Oportunidade de produto: os deveres do operador (aprovar criativos, contratos, trilha auditável de campanhas) são **features vendáveis** da AffiliaCore — e a trilha de auditoria já existe.

## 5. Recomendação priorizada

| # | Ação | Por quê | Esforço |
|---|---|---|---|
| **P1** | **Fundação "connections"**: coleção server-only de credenciais por conexão (plataforma+conta), generalizando o proxy OTG p/ N conectores | Pré-requisito de tudo; destrava multi-fonte por tenant | **M** |
| **P2** | **Conector Affilka (SOFTSWISS)** | Token self-service pelo próprio afiliado (menor atrito de onboarding); plataforma que mais cresce (17,55%) | **S** |
| **P3** | **Conector MyAffiliates (XML API)** | Líder de mercado global; cobre **KTO** (casa BR com sub-afiliados formais a 5%) — bom alvo p/ 1º cliente fora da OTG | **S–M** |
| **P4** | **POC agregador (StatsDrone)** com a conta da Boost | 1 integração ≈ cauda longa de casas, incluindo **Income Access = Superbet/Betano direto**, que não têm API de afiliado | **S** (POC) |
| **P5** | **Postback próprio**: retomar `/go/:code` + endpoint de postback público | Atribuição por jogador (hoje gated na OTG); casas manuais e MyAffiliates/Affilka suportam | **M** |
| **P6** | **Produto "rede"**: playbook p/ agência virar master-afiliada + features de compliance (aprovação de criativos, contratos, publicidade 18+) | Transforma a limitação regulatória em diferencial; monetiza o modelo OTG p/ nossos clientes | **M–L** (mais negócio que código) |

**Sequência sugerida:** P1→P2 prova o conceito multi-conector com o menor conector possível; P4 roda em paralelo (é avaliação, não build); P3 abre o primeiro alvo BR concreto (KTO); P5/P6 depois, guiados por demanda de cliente.

**O que NÃO fazer agora:** scraping de painéis (frágil/risco) antes de esgotar (a)+(e); virar rede (P6) sem cliente âncora pedindo.

---

## Fontes

**Verificadas em fonte primária (2026-07-18):**
- Portal oficial Superbet Affiliates — "powered by Income Access, a Paysafe company": https://affiliates.superbet.com/
- StatsDrone, review KTO Affiliates (MyAffiliates, sub-afiliados 5%, API/postbacks): https://statsdrone.com/affiliate-programs/kto-affiliates/
- Portaria SPA/MF nº 1.231/2024 (texto integral): https://www.legisweb.com.br/legislacao/?id=462714
- MyAffiliates — features (Affiliate XML API Access): https://myaffiliates.com/features/ · integração WeCanTrack: https://wecantrack.com/myaffiliates-integration/ · client Perl da API (feeds): https://github.com/deriv-com/perl-WebService-MyAffiliates
- Income Access (Paysafe) — plataforma/relatórios: https://www.paysafe.com/en/income-access/

**Fonte única (coletadas pelo pipeline, não re-verificadas):**
- Routy support — "Connecting via API - Affilka (Softswiss)" (Statistic token self-service): https://support.routy.app/hc/en-us/articles/16059897381009
- StatsDrone — home (2.174+ programas; credenciais/API/CSV; API de export): https://statsdrone.com/ · bot documentation (Chromium headless p/ painéis sem API): https://statsdrone.com/statsdrone-bot-documentation/ · marco 2.100 integrações + 61% com API (ago/2025): https://redesign.statsdrone.com/blog/statsdrone-celebrates-2100-affiliate-program-integrations/ · perfil MyAffiliates: https://statsdrone.com/affiliate-software/myaffiliates/ · perfil Cellxpert: https://statsdrone.com/affiliate-software/cellxpert/ · review Betano (Income Access): https://statsdrone.com/affiliate-programs/betano-affiliates/ · review Entain Partners: https://statsdrone.com/affiliate-programs/entain-partners/
- Market share jan/2026 (MyAffiliates líder; Affilka 17,55%; Cellxpert 10,40%): https://tribuna.com/en/casino/news/2026-01-13-statsdrone-myaffiliates-leads-affiliate-software-market-affilka-and-cellxpert-in-top-thre/
- bet365 Partners proprietário: https://findmyaff.com/affiliate-programs/bet365/
- Scaleo — S2S postback iGaming: https://www.scaleo.io/blog/s2s-postback-integration-for-igaming-affiliate-software/ · taxonomia subid/clickid: https://www.scaleo.io/blog/subid-click-id-architecture-for-casino-affiliates-tracking-taxonomy/ · sub-affiliate management (override 5–15% NGR): https://www.scaleo.ai/igaming-sub-affiliate-management/
- Wynta — redes multi-tier: https://wynta.com/blog/sub-affiliate-networks-managing-multi-tier-commission-structures/
- TheAffiliatePlatform — S2S vs pixel: https://www.theaffiliateplatform.com/en/post/en-post-affiliate-tracking-s2s-postback-pixel
- Track360 — guia integração de plataformas: https://track360.io/blog/affiliate-platform-api-integration-guide · guia afiliados BR 2026: https://track360.io/blog/afiliados-apostas-esportivas
- Strackr — API unificada (282 redes, mainstream): https://strackr.com/affiliate-api · WeCanTrack — 450+ integrações: https://wecantrack.com/affiliate-networks/
- Baptista Luz — análise Portaria 1.231/2024: https://baptistaluz.com.br/publicidade-de-apostas-novidades-da-portaria-spa-mf-n-1-231-2024/ · SPA/MF índice de legislação: https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/apostas-de-quota-fixa/legislacao · Migalhas — LGPD e bets: https://www.migalhas.com.br/depeso/422159/lgpd-e-bets-um-marco-regulatorio-em-construcao · JOTA — Bets e LGPD: https://www.jota.info/opiniao-e-analise/artigos/bets-e-lgpd-desafios-para-as-casas-de-apostas-esportivas
