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

## B3 · Painel de sub-afiliados (afiliados com sub-rede)

**Contexto.** Afiliados "master" que possuem **outros afiliados abaixo deles**. Notamos uma
feature incompleta relacionada a isso (2026-05-28) cujo funcionamento ainda não entendemos —
**precisa investigação** antes de desenhar.

**Sketch conceitual (a validar).**
- Hierarquia: um campo `parentAffiliateId` ligando afiliado → sub-afiliado. Provavelmente um
  **modelo local do Boost**, já que a API v2 (`/affiliates`) não expõe relação pai/filho.
- Novo papel/visão "afiliado master": vê os resultados **agregados da própria sub-rede** + os seus.
- Comissão: override (%) do master sobre a produção dos sub-afiliados.

**Investigação necessária (antes de virar task).**
- A API da OTG (v1?) expõe relação de hierarquia entre afiliados?
- Qual é exatamente a "feature incompleta" que vimos — onde aparece (dashboard da OTG ou nosso código)
  e como se comporta hoje?
- Como o escopo por afiliado (já implementado) se estende para "ver a própria sub-rede".

**Dependências.** Escopo por afiliado no proxy (✅ feito) + novo modelo de hierarquia.

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

