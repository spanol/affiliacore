# Backlog — Boost Agency

> Esboços capturados de conversa com a diretoria (2026-05-29). **Não implementar ainda** —
> são ideias rascunhadas para refinar em tasks. Cada item tem contexto, escopo aproximado
> e perguntas em aberto.

---

## B1 · Lucro líquido (após repasse aos afiliados)

**Contexto.** A agência recebe comissão das casas (CPA + REV — o `total_commission` que a OTG
reporta). Os afiliados recebem o que está configurado em `affiliate_configs`
(`cpaValue` × CPA qualificados + `revPercentage` × REV). Falta exibir **o que sobra para a agência**.

**Fórmula proposta.**
`Lucro líquido = Σ comissão recebida das casas (OTG total_commission) − Σ comissão repassada aos afiliados (cálculo do Boost por afiliado)`

**Escopo aproximado.**
- Novo card no `AdminDashboard` (lucro líquido consolidado do período).
- Coluna/linha por afiliado em `AffiliatesList` / `AffiliateDetails` (recebido vs. repassado vs. margem).
- Cálculo no `affiliateService` (já temos as duas pontas: `total_commission` da OTG e a comissão calculada por config).

**Respondido pelo Carlos (2026-05-29):**
- Base = exatamente o `total_commission` da OTG (sem acordo por casa). ✅
- Custos fixos a descontar? **Ainda não.** ✅
- Mostrar lucro líquido **por casa e por período**: **sim** → novo item a construir (hoje só temos o consolidado por período via filtro de data).

Ou seja, o `calcNetProfit` atual (`total_commission` direto, sem custos fixos) **deixa de ser provisório** — está correto. Falta só o detalhamento por casa.

---

## B2 · Filtros de data na Boost

**Contexto.** Hoje o Boost fixa o período em `2024-01-01 → hoje` (hardcoded no `affiliateService`).
A dashboard da OTG tem seletor de datas; o Boost precisa do mesmo.

**Escopo aproximado.**
- Date range picker no header das dashboards (admin e client).
- Propagar `startDate` / `endDate` para `fetchAffiliateResults` / `*ByBrand` / `*DailyResults` →
  o proxy `/api/external` já encaminha a query string.
- Presets: hoje, últimos 7 dias, mês atual, mês passado, personalizado.

**Perguntas em aberto.**
- Período padrão ao abrir (mês atual?).
- O afiliado (client) pode escolher livremente o intervalo?

---

## B3 · Afiliado Especial (sub-afiliados / sub-rede)

> Refinado com a diretoria em 2026-05-29. Decisões abaixo travadas; **modelo de comissão
> (spread) ainda a confirmar com o Carlos** — ver "Roteiro p/ o Carlos".

**Conceito.** O MASTER promove um afiliado dele a **afiliado ESPECIAL** e vincula alguns dos
seus afiliados como **sub-afiliados** do especial. O especial ganha uma view parecida com a
do master, porém **escopada à própria sub-rede** e com menos features.

**Decisões (confirmadas com o Carlos em 2026-05-29, salvo Q6).**
- **Papel:** especial = `client` com flag `isSpecial` (NÃO vira admin). Login normal, view diferente.
- **Hierarquia:** modelo **local da Boost** (a OTG não expõe pai/filho). **1 nível** (sub não tem sub-rede própria); 1 especial por afiliado.
- **Poderes do especial:** visualizar a sub-rede + **convidar/gerir** os próprios subs + **definir a comissão dos próprios subs** (limitada à taxa que o MASTER setou para o especial = teto). *(Atualizado: antes era "não mexe em comissão".)*
- **Especial vê o próprio ganho:** spread sobre os subs **+** a própria produção, com **cards separados por afiliado** (dados individuais de cada sub + os dele). A **margem da agência** sobre tudo continua **só no MASTER** (regra do lucro líquido).
- **Comissão = SPREAD (confirmado):** o **MASTER** define a **taxa do especial** sobre os afiliados vinculados (o teto). O **ESPECIAL** define a **taxa de cada sub** (≤ teto). O especial fica com o **spread** = `(taxa do especial − taxa do sub) × produção do sub`, somado por sub, **+** a comissão da produção própria dele (`affiliate_config` normal). Base da casa = `total_commission` exato, **sem custos fixos** (confirmado).
- **Pagamento (Q6, confirmado):** **agência → especial → sub**. A Boost paga ao especial a taxa cheia (sobre a sub-rede + a produção própria); o especial repassa aos subs. Afeta só o relatório de pagamento — o cálculo do ganho é idêntico.

**Modelo de dados (proposto).**
- `special_affiliates/{especialAffiliateId}` = `{ active, subAffiliateIds: string[], networkCpaValue, networkRevPercentage, updatedAt }` — marca o especial, lista os subs e guarda a taxa da sub-rede. **NÃO** guardar hierarquia no mirror `affiliates/` (o sync sobrescreve).
- `users/{uid}.isSpecial` — flag de conveniência p/ roteamento/gating (espelha `special_affiliates`).
- Comissões: `affiliate_configs/{id}` segue valendo p/ produção própria de cada um (especial e subs).

**Permissões / escopo.**
- Proxy: hoje força não-admin ao próprio `affiliateId`. Estender: se `isSpecial`, liberar `results` para os affiliateIds da própria sub-rede (own + subs), **validado no servidor** (lookup em `special_affiliates`).
- `firestore.rules`: `special_affiliates` → leitura p/ signed-in (ou admin + o próprio especial), escrita só admin.

**Fases.**
1. **Modelo + setup do MASTER** — coleção + serviço + rules + UI na lista de afiliados (promover especial, vincular subs, setar as taxas). *(em andamento)*
2. **Escopo no proxy + rules** para a sub-rede do especial.
3. **View do especial** — dashboard escopado (funil da sub-rede + própria produção) + lista de subs + convites; esconder features de master.
4. **Cálculo do spread + exibição** (ganho do especial; margem da agência só no master) — **desbloqueado** (modelo confirmado; só Q6 operacional em aberto, não trava o cálculo).

**Roteiro p/ o Carlos — RESPONDIDO em 2026-05-29** (só falta Q6).
1. Base da casa = exatamente `total_commission`. ✅ *(B1)*
2. Custos fixos a descontar? **Ainda não.** ✅ *(B1)*
3. **Spread** — o master seta a comissão do especial sobre os afiliados vinculados. ✅
4. Ganho do especial = **subs + produção própria**, com **cards separados por afiliado** (dados individuais). ✅
5. O **especial** define a comissão dos próprios subs (teto = a taxa que o master setou pra ele). ✅
6. Pagamento: **agência → especial → sub** (a Boost paga o especial a taxa cheia; ele repassa aos subs). ✅
7. Lucro líquido **por casa e por período**: **sim.** ✅ *(B1 — novo item a construir)*

Travado: 1 especial por afiliado; **1 nível**; o especial vê só a própria sub-rede.

**Origem da feature (resolvido 2026-05-29).** A "feature de sub-afiliado incompleta" notada em 28/05 **É este afiliado especial** — não há sistema legado a investigar; está especificado aqui e em implementação (Fase 1 feita).

**Dependências.** Escopo por afiliado no proxy (✅ feito) + novo modelo de hierarquia (Fase 1).

**Pendência sinalizada (2026-05-29).** Hoje o afiliado loga direto no próprio painel
(`/affiliates/{id}`), mas a sidebar ainda mostra o item **"Clientes" → `/affiliates`**
(lista completa, que dá 403 no proxy para não-admin). Mantido visível por ora; ao
implementar o "afiliado master", redefinir esse item para mostrar a **própria sub-rede**
em vez de esconder/quebrar. Há um `TODO(B3 · afiliado master)` em `DashboardLayout.tsx`.

---

## B4 · Dados bancários do afiliado (para receber os repasses)

**Contexto.** Os afiliados precisam cadastrar onde recebem os repasses. Novo item na **sidebar**:
"Dados Bancários".

**Escopo aproximado.**
- Novo menu na sidebar + página/formulário: **PIX** (chave + tipo), **Banco** (banco/agência/conta),
  **CNPJ** (ou CPF). Editável pelo próprio afiliado; admin visualiza.
- Persistir em coleção própria (ex.: `banking_info/{uid}` ou campo em `users`).

**⚠️ Segurança (dados sensíveis).**
- CNPJ/CPF e dados de conta são sensíveis: `firestore.rules` deve restringir a leitura/escrita
  ao próprio afiliado (e admin). Não logar; não expor em endpoints abertos.
- Avaliar mascarar dados na visão admin.

**Perguntas em aberto.**
- Campos obrigatórios vs. opcionais (PIX só, ou banco completo também)?
- Validação de CNPJ/CPF e de chave PIX?
- Admin edita ou só visualiza?

---

## B5 · Configurações de acesso/visualização de afiliados (conta admin master)

**Contexto.** Em **Configurações** (conta de admin master), poder **limitar acessos e
visualizações de afiliados** — controlar quem vê o quê.

**Sketch conceitual (a validar).**
- Tela em `/settings` (somente admin master) para definir regras de visibilidade/acesso.
- Possíveis eixos: quais afiliados um admin enxerga (escopo por admin); o que cada afiliado
  pode ver/acessar; ativar/desativar áreas por afiliado.
- Persistir as regras (ex.: coleção `access_rules` ou campos em `users`/`settings`) e
  aplicá-las tanto no front (ocultar) quanto no back (`firestore.rules` + escopo no proxy).

**Relacionado.** Conecta com o escopo por afiliado já feito (proxy) e com B3 (sub-afiliados).
Ver também o bug já corrigido: admins não aparecem mais na listagem de afiliados.

**Perguntas em aberto.**
- O limite é por-admin (cada admin gerencia um subconjunto) ou regras globais sobre afiliados?
- Que "visualizações" exatamente queremos poder restringir (telas? métricas? casas?)?
- Há níveis de admin (master vs. admin comum)?

---

## B7 · Feature "Integrações" — camada dedicada p/ integrações externas (OTG, Esportiva Bet, …)

> Rascunhado 08/08/2026 a pedido do Carlos. **FASE 1 ENTREGUE em 08/08/2026** — ver
> "O que foi entregue" no fim desta seção. O texto abaixo é o plano original, mantido
> como registro do racional; as "perguntas em aberto" viraram decisões (respondidas ali).

**Contexto.** Hoje não existe um lugar único para gerenciar as integrações externas (OTG,
Esportiva Bet/TAP, e as que vierem depois). O que existe, espalhado:
- **Configurações (`/settings`, `Settings.tsx`)** tem um card "API de Captura de Dados" que
  salva `{ key: 'client_capture_api_key', value }` em `settings/external_api` **direto do
  client** (`setDoc`, sem passar pelo servidor). ⚠️ **Achado ao investigar:** nada no código lê
  esse valor de volta — não é a chave que a OTG ou a Esportiva realmente usam. É um campo órfão,
  provavelmente sobrevivente do applet original (ver `CLAUDE.md` → "AI Studio applet").
- **As chaves REAIS são env vars / Secret Manager, uma por integração, coladas no
  `apphosting.yaml` de cada instância:** `AFFILIATE_API_KEY` (OTG, lido em `server.ts` em
  vários pontos: proxy `/api/external`, ranking, partner-api) e `ESPORTIVA_API_KEY` +
  `ESPORTIVA_HOUSE_SLUG` + `ESPORTIVA_CPA_BASE` + `ESPORTIVA_API_BASE` (pull horário da
  Esportiva, `server.ts:4520-4575`, núcleo puro em `src/lib/esportivaPull.ts`). Ligar/desligar
  ou trocar a chave hoje = editar secret no Secret Manager + redeploy — **não dá pra fazer pela
  UI**, e não tem toggle (a rota simplesmente responde 503 sem a env var).
- **`House` (`src/services/houseService.ts`) já tem os campos que apontam pra esse buraco:**
  `integration?: string | null` (nome do conector, ex. `'esportiva-tap'`, auto-carimbado pelo
  pull) e `pullAvailable?: boolean` (anotado pelo servidor = flag `integration` presente **e**
  conector configurado nesta instância → gate do botão "Atualizar" em `/casas`). Ou seja, o
  vínculo casa↔integração já existe conceitualmente; falta a tela que gerencia o outro lado
  (ligar/desligar + a chave) em vez de isso morar só em env var.

**Proposta.**
- Nova página/rota admin **`/integracoes`** (sidebar), substituindo o card "API de Captura de
  Dados" que sai de `/settings`.
- Uma coleção nova, **`integrations/{id}`** (server-only, mesmo padrão de `payment_profiles`/
  `houses`/`special_affiliates`: `read,write: if isAdmin()` nas rules, mas a leitura/escrita de
  verdade passa por endpoint admin — nunca `setDoc` direto do client como o card atual faz).
  Shape sugerido: `{ id: 'esportiva-tap' | 'otg' | ..., label, enabled: boolean, apiKey: string,
  houseId: string | null, config?: Record<string,string>, updatedAt, updatedBy }`. Campos extra
  por integração (ex. `houseSlug`/`cpaBase` da Esportiva) entram em `config`.
- UI: lista de integrações conhecidas (cards, um por conector — OTG, Esportiva Bet, e um slot
  pra próximas), cada uma com: switch liga/desliga, campo de API key (mascarado, tipo password,
  igual ao padrão atual), **seletor de casa já cadastrada** (dropdown das `houses` com
  `dataSource:'manual'`, escreve `houseId` → grava de volta em `houses/{id}.integration`), e
  status de frescor (reaproveita `lastResultsSyncAt`/`lastResultsCheckAt` que `House` já tem).
- Servidor: `GET/POST/PATCH /api/integrations` (admin) — o pull da Esportiva
  (`server.ts:4520+`) passa a ler `enabled`/`apiKey`/`houseId` de `integrations/esportiva-tap`
  em vez de `process.env.ESPORTIVA_*` direto. **Cuidado:** `server.ts` só recarrega em restart
  (sem watch) — mas como a leitura vira Firestore em vez de env var, o toggle passa a valer sem
  redeploy, que é o ganho real da feature.
- Migração da chave da OTG (`AFFILIATE_API_KEY`) pra esse modelo é **opcional/fase 2** — ela
  autentica o proxy `/api/external` inteiro (não é por-casa) e tirá-la do Secret Manager é
  mais sensível; a Fase 1 pode focar só nas integrações "por casa" tipo Esportiva Bet, que já
  têm o campo `House.integration` esperando.

**Perguntas em aberto p/ amanhã.**
- A chave por integração ainda vem de Secret Manager (mais seguro, precisa redeploy pra trocar)
  ou passa a ser 100% Firestore (mais ágil, mas material sensível fora do padrão atual de
  secrets)? Puxa o mesmo dilema do card atual, que já guarda em Firestore sem criptografia própria.
  Ver se o padrão `auth_totp` (rule `read,write: if false`, nem admin lê) se aplica aqui também.
- OTG entra nessa camada na Fase 1 ou fica de fora por enquanto (ela não é "por casa")?
- O card órfão de Configurações (`settings/external_api`) só sai da tela, ou vale também apagar
  o doc/dado morto no Firestore de cada instância?
- Toggle "desligado" deve impedir só o PULL automático, ou também zerar `pullAvailable` na hora
  (afeta o botão "Atualizar" em `/casas` mesmo sem esperar o próximo ciclo do cron)?

### ✅ O que foi ENTREGUE (Fase 1 — 08/08/2026)

Núcleo puro em **`src/lib/integrations.ts`** (+ `integrations.test.ts`), rota **`/integracoes`**
(`src/pages/Integracoes.tsx`, admin-only, item novo na sidebar), serviço
`src/services/integrationService.ts`, endpoints **`GET /api/integrations`** e
**`PUT /api/integrations/:id`** (`requireAdmin`) e a coleção **`integrations/{id}`**.

**Decisões tomadas** (as 4 perguntas acima):
1. **Chave no Firestore, env como FALLBACK.** `resolveConnectorSettings` faz o merge campo a
   campo: doc vence env. Instância que nunca abriu a tela segue lendo o Secret Manager, igual a
   antes — a migração é silenciosa e reversível. Sobre segurança, vale o padrão `auth_totp`, não
   o de `settings`: a rule é **`read, write: if false`** (nem o admin lê pelo SDK do cliente) e
   a chave **nunca volta ao browser** — só `keyMask` (`••••1234`). A auditoria registra
   `keyChanged: true`, jamais o valor.
2. **OTG ficou de fora** (fase 2, como o plano previa): a `AFFILIATE_API_KEY` autentica o proxy
   `/api/external` inteiro, não é por-casa.
3. **O card órfão só saiu da tela.** O doc `settings/external_api` é deixado intacto em cada
   instância: apagar dado em produção é ato de operador, não efeito colateral de refactor.
4. **O toggle zera o `pullAvailable` na hora** — `configured()` virou assíncrono e lê o doc, então
   desligar apaga o botão "Atualizar" em `/casas` sem esperar o cron. (`GET /api/houses` resolve
   o estado do conector **uma vez por request**, não por casa.)

**Detalhes que valem lembrar:**
- **Campo de chave vazio = "não mexe"**, nunca "apagar" (senão salvar o toggle apagaria a
  credencial, já que a tela só recebe a máscara). Remover exige `apiKey: null` — o botão
  "Remover chave". Travado em `sanitizeIntegrationPatch` e em teste de servidor.
- **Catálogo FECHADO** (`INTEGRATION_CATALOG`): id fora dele responde 404 e não cria doc — a
  coleção não vira depósito. Integração nova entra no catálogo + no `PULL_CONNECTORS`.
- **As duas pontas ficam coerentes:** vincular a casa na tela carimba `houses/{slug}.integration`
  (e desvincular limpa a casa antiga), que é a flag que roteia o pull por casa.

**Falta (fase 2):** migrar a OTG pra essa camada; avaliar um segundo conector real
(MyAffiliates/Affilka) — que é o teste de verdade do catálogo.

---

## B6 · ✅ ENTREGUE (08/08/2026) — rota /contacts removida

**Contexto.** O item "Contatos" saiu da sidebar do admin em 2026-06-02 (commit `1aedfb8`),
mas a rota `/contacts` seguia existindo (alcançável por URL, protegida por `requireAdmin`).

**Decisão da pergunta em aberto** ("só a tela de admin ou todo o fluxo?"): **só o LEITOR**.
O formulário público continua vivo e é o que alimenta a captação de leads hoje —
`createContactInquiry` é chamado pela `Home` e pelo `LeadDiagnostic`, e é por ele que entram os
leads tageados de campanha (`registrationSource`). Aposentar o fluxo inteiro mataria a captação.

**Feito.**
- `<Route path="/contacts">` + import fora do `src/App.tsx`; `src/pages/Contacts.tsx` deletada.
- `subscribeToContactInquiries` (e o tipo `ContactInquiry`) removidos do `contactService` — eram
  usados só pela página. Sobrou o service de ESCRITA, com os testes dele.
- **Mantidos:** a coleção `contacts`, a rule dela (create público restrito a shape/tamanho),
  `createContactInquiry` e `registrationSourceLabel` (rótulo da origem, útil se voltar uma tela).

**⚠️ Consequência operacional.** A partir daqui **não há leitor de leads dentro do app** — os
`contacts` só são consultáveis pelo console do Firestore. Na prática já era assim desde 06/2026
(sem item na sidebar), mas agora nem por URL. Se a captação crescer, a volta natural é uma tela
de leads mediada por endpoint admin (o padrão do repo), não o `onSnapshot` direto que existia.


---

## ENTREGUE (2026-06-26) — Boost-first: import por Excel + afiliado nativo Boost

Commits na main: **0a10337** (feature) + **fb0330c** (fix). 493 testes verdes; tsc limpo.

- **Import de resultados por Excel (.xlsx)** + botão "Baixar modelo" (todas as colunas + aba de instruções). Núcleo puro `parseResultsRows` (CSV/colado e Excel), `lib/xlsx.ts` (SheetJS via import dinâmico), seleção de aba por casa + fill-down da data.
- **Cruzamento por e-mail de login Boost** (não OTG). Coluna `email` no parser/modelo.
- **Afiliado NATIVO Boost** (`boost_<uuid>`): no preview do import, "Cadastrar na Boost" (cria nativo + convite opt-in) e "Vincular a existente" (alias e-mail→afiliado). PII do e-mail em `affiliate_email_aliases` (server-only); mirror `affiliates` name-only; `fetchAffiliates` une `source:boost`.
- **Fix:** merge manual no por-casa/diário/campanha da REDE do especial (`manualForAffiliates` aceita CSV) + banner "em captação" gated por atividade real.

**Validado ao vivo (PROD):** vincular + import casaram e gravaram o `house_results` atribuído ao afiliado (verificado no Firestore). Dados de teste limpos.

**Pendências de operador:** `firebase deploy --only firestore:rules` (inclui `affiliate_email_aliases`; Admin SDK já funciona sem). **Smoke test dos fixes ainda PENDENTE** (ver memória `boost-native-affiliates` → seção SMOKE TEST RESUME).

**Follow-up (não feito):** afiliado nativo na lista global `/affiliates` com status/config próprios; revisar se o ClientDashboard do especial deve mostrar a rede.

---

## ABERTO (2026-07-31) — fila da Infinity, em ordem de prioridade

Contexto e detalhe técnico em `MIGRACAO-INFINITY-LEGADO.md` §9 e §10.

### 1. ✅ ENTREGUE — Tela de vínculo tag → afiliado (motor `e574806` + casca `7eeb74e`)

Vive DENTRO do modal de import de `/casas` (não é página nova): `affiliate_tag_aliases/{tagNorm}`
(server-only) + `GET/POST/DELETE /api/tag-aliases`. Detalhe em `MIGRACAO-INFINITY-LEGADO.md` §10.
O que falta ali é **negócio**: de quem são as tags órfãs (ver "Bloqueios" no fim).

### 1.1 ✅ ENTREGUE (02/08/2026) — Geração de link a partir do template da casa

**A descoberta que destravou:** a tag de rastreio é **capturada na visita**, não cunhada na casa —
`af2_build_link` do TAP não aceita `afp` como entrada, e os probes `teste01`/`infinitw298` entraram
no relatório da Esportiva sem terem sido emitidos no painel dela. Logo, dar link novo **não depende
da API liberada nem do pool de 288 standby**. Racional completo em `MIGRACAO-INFINITY-LEGADO.md` §9.4.

Entregue: `POST /api/affiliate-links/generate` (admin, idempotente por afiliado × casa, 409 em tag de
outro afiliado) + botão "Gerar link" na `/links` com prévia do destino; núcleo puro em
`src/lib/linkGeneration.ts`. O resultado casa sozinho no import (o índice indexa a tag do link).

**Fica em aberto:** confirmar o crédito de **FTD/CPA** numa tag gerada por nós (a captura de visita
já está provada) — fecha com o primeiro FTD real.

### 2. ✅ ENTREGUE (08/08/2026) — `/avisos` não mostrava as notificações pessoais

Achado em 31/07 testando a notificação de novos resultados. O **sino** (`NotificationBell`) junta
`notices` **+** `user_notifications`; a página **`/avisos` lê só `notices`**. O botão "Ver todos"
do rodapé do sino (`NotificationBell.tsx:126`) navega para `/avisos` — ou seja, o afiliado vê
"🎉 Novos resultados na Superbet!" no dropdown, clica em "Ver todos" e cai numa página que
**estruturalmente não consegue** mostrar aquilo. Passou do dropdown, não há onde recuperar.

Pesa mais num cenário de import diário, onde essas notificações serão as mais frequentes.

**Entregue** (a proposta recomendada): a página assina as DUAS coleções e exibe em seções
separadas — "Suas notificações" (pessoais, escopo `recipientUid`, mesma assinatura do sino) +
"Avisos da agência" (o mural). Os cabeçalhos de seção só aparecem quando há notificação pessoal:
instância sem import de resultados vê a tela idêntica à de antes. O estado vazio agora exige as
**duas** listas vazias — antes, mural vazio + notificação pessoal escondia a notificação.
Testes em `src/pages/Avisos.test.tsx`.

### 3. Lançamento manual do dia (linha única)

O legado tinha o botão **"Novo dia"**: o operador digitava a linha diária de cada afiliado na tela.
Nosso `houseResults` aceita **só planilha/CSV** — não há formulário de linha única.
Perdeu urgência quando a atribuição da Esportiva se mostrou funcional (§5.1), mas continua sendo
atrito real para atualização diária.

### 4. Materiais / banners para o afiliado

Não existe (`rg 'material|banner|criativo'` só bate em `UpdateBanner`, que é outra coisa).
O legado tinha materiais por categoria + carrossel no dashboard do afiliado. Primeira pergunta de
influenciador e de afiliado migrado.

### 5. Meta de CPA mensal

Não existe. O legado tinha meta por competência com "Feito / Faltam / %" e **zerando na virada do
mês**. As Conquistas (entregues) são **acumuladas**, não mensais — são complementares, não substitutas.

### 6. CPA Abuser

Detectava CPA abusado e **descontava do saque**, com detalhamento por tag no extrato. Quando isso foi
mapeado (27/07) não tínhamos carteira; agora `/financeiro` + `/saques` existem, então o desconto tem
onde morar. Pesa na Esportiva, onde o RevShare pode ser negativo e a margem já é fina.

### 7. Menores (uso diário do legado, sem equivalente)

- **Chat interno afiliado↔admin com anexo** — o nosso `directMessageService` é MÃO ÚNICA
  (admin → afiliado, popup + read receipt); sem resposta e sem anexo.
- **WhatsApp via Evolution API** (cria grupo, adiciona, promove admin) — temos só `supportContact`.
- **Acesso de Bets por usuário** (quais casas cada afiliado enxerga) — sem `visibleHouses`/`allowedBrands`.
- **Aprovação com CPA no ato** — `pending_affiliates` aprova e convida, mas não define a taxa no momento.
- **Log de visualização com IP** — a nossa auditoria é server-authoritative e append-only (melhor),
  mas não registra "Fulano visualizou", que a deles fazia.

### Bloqueios que NÃO são nossos

- ~~**Cron da Esportiva** depende da casa isentar `/api/*` do challenge~~ → **RESOLVIDO 04/08/2026**:
  era o HOST errado. `https://boapi3.smartico.ai/api/af2_media_report_af` responde sem Cloudflare e
  reconcilia exato com o export manual; a chave é de **afiliado** (métodos `_af`). Detalhes,
  contrato e as duas armadilhas (CPA vem em R$ sem contagem; rate limit) no §9.5. **Virou trabalho
  NOSSO:** conector + cron D−1 + a chave como secret da instância.
- **Convites dos 159 afiliados** dependem da decisão de **quem honra os R$ 32.306,40** de passivo.
- **Vínculo das tags** depende de o Maurício informar de quem são `infinitw280`, `292`, `193`, `01`
  e se `infinitw280tem`/`280gay` são a mesma pessoa da `280`.
