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

**Perguntas em aberto.**
- "Comissão recebida da casa" = exatamente o `total_commission` da OTG, ou há acordo diferente por casa?
- Existem custos fixos da agência a descontar (operacional, taxas)?
- Mostrar lucro líquido também por casa e por período?

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

**Decisões (travadas).**
- **Papel:** especial = `client` com flag `isSpecial` (NÃO vira admin). Login normal, view diferente.
- **Hierarquia:** modelo **local da Boost** (a OTG não expõe pai/filho). **1 nível** (sub não tem sub-rede própria); 1 especial por afiliado.
- **Poderes do especial:** visualizar a sub-rede + **convidar/gerir** os próprios subs. **Não** mexe em comissão (isso é só do MASTER).
- **Especial vê o próprio ganho** (o spread dele). A **margem da agência** sobre a sub-rede continua **só no MASTER** (regra do lucro líquido — ver [memória/BACKLOG B1]).
- **Comissão = SPREAD ⚠️ (provisório):** o MASTER define (a) a taxa de cada sub (o que o sub recebe, pago pela agência) e (b) a taxa do especial sobre a produção da sub-rede; o **especial fica com a diferença**. A produção própria do especial é paga pelo `affiliate_config` normal dele.

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
4. **Cálculo do spread + exibição** (ganho do especial; margem da agência só no master) — **bloqueado** até o Carlos confirmar o modelo de comissão.

**Roteiro p/ o Carlos (confirmar antes da Fase 4).**
1. A comissão do especial é **spread** mesmo (ele recebe a taxa da sub-rede e os subs recebem a taxa deles, ficando o especial com a diferença), ou é um **override** (subs recebem normal da agência e o especial ganha um % extra por cima)?
2. O ganho do especial incide **só sobre a produção dos sub-afiliados**, ou também sobre a **produção própria** dele?
3. A taxa do especial é no mesmo formato dos afiliados (**CPA em R$ + REV em %**) ou um **percentual único**?
4. Existe **teto/piso** para a taxa dos subs (e o especial pode mexer nela dentro do teto, ou nunca)?
5. Quem **paga** os subs: a agência direto, ou sai do bolo do especial?
6. Um afiliado pode ser sub de **mais de um** especial? (assumimos que não.)
7. Precisa de **multi-nível** (sub que também é especial) em algum momento? (assumimos 1 nível.)

**Investigação aberta.** A "feature incompleta" notada em 2026-05-28 (OTG ou nosso código?) — checar se há algo a reaproveitar/migrar antes de finalizar.

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

