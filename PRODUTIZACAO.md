# Produtização — vender o Boost para outras agências

> Esboço 2026-07-02 (conversa Vinicius + Claude). Objetivo: transformar o Boost num produto
> white-label vendável para outras agências de afiliados de apostas. Modelo definido:
> **Vinicius faz setup + manutenção; o cliente opera**. Instância dedicada por cliente
> (1 projeto Firebase cada) — SaaS multi-tenant fica para quando houver 5+ clientes.
> ~~Precificação de referência (benchmark 2026-07-02): setup único R$ 3–8 mil + mensalidade
> em degraus por nº de afiliados ativos~~ → ~~v2 (2026-07-25): sem implantação + % sobre a
> margem~~ **v3 VIGENTE desde 2026-07-29 — ver "Modelo de preço vigente" no fim deste doc**:
> volta o modelo 100% FIXO — implantação R$ 3.000 + 1ª mensalidade R$ 600 + R$ 2.500/mês do
> 2º em diante; fundador (3 primeiras) na metade: R$ 1.500 + R$ 300 + R$ 1.250/mês.
> **O % sobre a margem morreu** (o 1º cliente pagante recusou o modelo).
> Carlos = cliente 0 (cortesia).

## Visão das fases

| Fase | Nome | Natureza | Depende de |
|---|---|---|---|
| P0 | Fechar a casa (pendências em voo) | código + operador | — |
| P1 | Endurecimento p/ terceiros | código | — |
| P2 | OTG como módulo desligável | código | — |
| P3 | White-label (marca configurável) | código | — |
| P4 | Playbook "novo cliente em 1 dia" | código + ops | P1–P3 |
| P5 | Comercial (nome, demo, venda) | negócio | P4 (só p/ demo) |

P0–P3 são independentes entre si; P5.1/P5.2 (nome, jurídico) podem rodar em paralelo desde já.

---

## P0 · Fechar a casa

O que já estava combinado e falta entregar antes de pensar em produto:

- **P0.1 — Auditoria Fase 3 (dinheiro/CPA-REV)** — ✅ **ENTREGUE 2026-07-02.**
  `PATCH /api/affiliate-configs/:id` (requireAdmin): whitelist cpaValue/revPercentage/byBrand
  preservando ausência (ausência≠R$0), diff antes→depois + `config.update` no MESMO batch;
  `saveAffiliateConfig`/`saveAffiliateBrandRates` viraram wrappers do PATCH; a rota do
  especial (`/api/special/sub-config`) também audita (autor = especial, metadata `via`);
  ficha do afiliado agora lista mudanças de comissão (`EntityAuditHistory` com
  `['affiliate','affiliate_config']`); rule `affiliate_configs` → `write: if false`
  (nem admin escreve direto). 602 testes + 44 de rules verdes.
  **Operador: `firebase deploy --only firestore:rules` — DEPOIS do deploy do app** (o
  frontend antigo grava direto; deployar a rule antes quebraria o salvar de comissão).
- **P0.2 — Higiene de operador acumulada** (checklist, conferir estado real antes):
  deploy de rules pendente (`affiliate_email_aliases`; `settings` admin-only), App Check
  (follow-up da auditoria de junho), smoke test pendente dos fixes boost-native
  (memória `boost-native-affiliates`), secrets `otg-dash-*` da trilha v1.

## P1 · Endurecimento para entregar a terceiros

Hoje o app é operado por quem o construiu; vendido, ele roda nas mãos de estranhos.

- **P1.1 — Bootstrap do 1º admin** — ✅ **a parte de SEGURANÇA já estava fechada** (verificado
  2026-07-02): a rule de `users` força `role == 'client'` no self-create e trava
  `role`/`affiliateId`/`isSpecial` no update (R6, auditoria de junho). Cliente NÃO consegue
  se promover. O que resta é OPERACIONAL e migra pro P4: script de provisionamento que cria
  o 1º admin da instância nova via Admin SDK (hoje o operador promove manualmente no console).
- **P1.2 — App Check** (já era follow-up da auditoria).
- **P1.3 — Revisão de rules com olhar "instância de terceiro"**: varrer `read: isSignedIn()`
  em dados que numa agência desconhecida seriam sensíveis. (Grande parte já foi na
  auditoria de junho; aqui é um passe final com essa lente.)

## P2 · OTG como módulo desligável

A versão vendida é naturalmente OTG-free (a x-api-key é da operação do Carlos).

- ✅ **NÚCLEO ENTREGUE 2026-07-02**: flag **`VITE_OTG_ENABLED`** (fonte única
  `src/lib/instance.ts`; ausente = ligada → instância atual não muda; `'false'` =
  OTG-free). Servidor: middleware `requireOtg` → 503 `OTG_DISABLED` em
  `/api/external/*`, `affiliates/sync`, `pending-affiliates` (GET/import/refresh) e
  `analytics/refresh`; `computeAndStoreRanking` pula a paginação OTG (ranking sai
  das casas manuais, sem exigir `AFFILIATE_API_KEY`). Cliente: `fetchAffiliateApi`
  (único ponto de saída ao proxy) devolve "sem dados" sintético sem rede;
  menu/rota Roster OTG e botão "Sincronizar afiliados" somem; textos de ajuda
  adaptados. Config documentada em `.env.example` + `apphosting.yaml`
  (BUILD+RUNTIME).
- **Falta (fecha na instância do cliente 0 do white-label):** smoke test
  "instância OTG-free" de ponta a ponta num projeto Firebase novo (P4) — casas
  manuais + import + afiliado nativo + comissão + auditoria + ranking, tudo com a
  flag em `false`.
- Bônus: o mesmo seam vira o ponto de encaixe p/ futuras integrações (outra
  plataforma no lugar da OTG).

## P3 · White-label (marca configurável)

- ✅ **NÚCLEO ENTREGUE 2026-07-03** (branch `feat/p3-branding`): envs
  **`VITE_BRAND_NAME` / `VITE_BRAND_SHORT` / `VITE_BRAND_LOGO_URL` /
  `VITE_BRAND_FAVICON_URL`** (fonte única `src/lib/branding.ts`, mesmo padrão dual
  client/server do P2; ausência de todas = marca Boost atual). Aplicado em: título +
  favicon (runtime, boot do App), login/registro/convite, sidebar, 404, landing
  (Home: copy + logos + footer ©), strings do servidor (`Gerência/Sistema {marca}`)
  e textos neutros onde "Boost" significava "a plataforma" (/casas, avisos,
  ranking, modais). Convenção documentada: `VITE_BRAND_SHORT` é tratado no
  FEMININO no meio de frase.
- **P3.1 · TEMA por instância — ✅ ENTREGUE (2026-07-06, branch `feat/p3.1-theming`):**
  novas envs `VITE_BRAND_ACCENT` (1 hex → `src/lib/theming.ts` gera a escala
  `accent-50..950` + `--color-accent-contrast` por contraste WCAG, tudo puro e
  testado) e `VITE_BRAND_SURFACE` (navy de superfície; a variante clara é
  derivada). Mecânica: tokens `accent-*` no `@theme` do Tailwind v4 (default =
  amber → instância Boost pixel-idêntica sem env) compilam p/ `var()`;
  `applyBrandToDocument` sobrescreve as vars no `:root` em runtime — zero
  rebuild por cliente. Sweep semântico feito nos 26 arquivos: `accent-*` =
  MARCA (botões, nav ativo, focus, badges, spinners); `amber-*` PERMANECE como
  cor de AVISO (pendências, "não configurado", "em captação", ouro do pódio,
  estado sujo de edição) e não muda com o tema. Validado ao vivo: dev com
  `#E11D48` → UI rose com texto de contraste branco; sem env → amber intacto.
- **P3.2 · ESTILO glass por instância — ✅ ENTREGUE (2026-07-06, branch
  `feat/p3.2-glass-theming`):** nova env `VITE_BRAND_STYLE` — `'glass'` (default,
  o look da Boost) ou `'solid'` (fills opacos + blur zerado, look corporativo).
  Mecânica idêntica ao P3.1: as superfícies de MARCA que usavam combos inline
  (`bg-white/90 dark:bg-neutral-950/80 backdrop-blur-md` etc.) viraram tokens
  semânticos no `@theme` — `--color-glass-{chrome,card,frame,banner,thead}(-dark)`
  + `--blur-glass-{soft,medium,strong}` — com defaults EXATOS aos valores antigos
  (regressão-zero p/ Boost); o preset `solid` (`SOLID_STYLE_VARS` em
  `src/lib/theming.ts`) sobrescreve as vars no `:root` em runtime. Sweep: header
  do app (DashboardLayout), cards de auth (Login/Register/InviteAccept), LP
  (nav + vitrine hero + card de contato), UpdateBanner e theads sticky
  (ClientDashboard/AffiliateDetails). **Scrim de modal (bg-black/N +
  backdrop-blur-sm) é FUNCIONAL e ficou fora de propósito** — não muda com o
  tema. `apphosting.boost.yaml` pina `VITE_BRAND_STYLE=glass` explícito.
  Um "tema de cliente" completo agora = `ACCENT` + `SURFACE` + `STYLE` (ex.
  proposta corporativa: `#2563eb` + `solid`; proposta vibrante: `#E11D48` +
  `glass`). Follow-up possível (não feito): preset `flat` que também remove os
  efeitos decorativos da LP/auth (glow-white, bg-grid-white, ambient glows).
- **P3.3 · CANVAS escuro + tema inicial — ✅ ENTREGUE (2026-07-06, mesma branch
  `feat/p3.2-glass-theming`):** motivado pelo teste side-by-side do Vinicius
  (Alfa solid+azul vs Boost em dark "quase iguais") — diagnóstico: no dark, o que
  domina a tela é o CANVAS (`neutral-950/900/800` hardcoded, fora do tema), os
  cards do /admin nunca foram glass e o accent pinta elementos pequenos. Duas
  envs novas: **`VITE_BRAND_CANVAS`** (1 hex → `buildCanvasRamp` re-tinta a ramp
  `--color-neutral-50..950` inteira em runtime; luminosidade FIXA na curva slate
  (contraste preservado p/ qualquer matiz), entrada contribui matiz + saturação
  domada (≤0.55, re-escalada por degrau); os tokens `--color-glass-*-dark`
  acompanham a ramp — translúcidos no glass, opacos no solid) e
  **`VITE_BRAND_THEME`** (`'light'`|`'dark'` = tema inicial p/ usuário sem
  preferência salva; precedência `resolveInitialTheme`: salva > instância > SO;
  ausência = SO = comportamento Boost inalterado, por isso SEM pin no
  apphosting.boost.yaml). Zero sweep: `dark:bg-neutral-900` etc. já compilam p/
  `var(--color-neutral-900)`. Receita "tema corporativo completo" = `ACCENT` +
  `STYLE=solid` + `CANVAS` + `THEME=light`.
- Naming interno (`boostAffiliate`, `boost_<uuid>`, coleções) **não muda**.

## P4 · Playbook "novo cliente em 1 dia"

- ✅ **NÚCLEO ENTREGUE 2026-07-03** (branch `feat/p3-branding`):
  - **Playbook passo a passo em `scripts/provision/README.md`** — projeto Firebase →
    rules → 1º admin → secrets → backend App Hosting + `apphosting.<backend>.yaml`
    (override por instância c/ OTG-free + marca) → cron do ranking → domínio →
    checklist de smoke de aceite.
  - **`scripts/provision/bootstrap-admin.cjs`** — cria/promove o 1º admin da
    instância via Admin SDK (senha temporária forte + `mustChangePassword`;
    idempotente; verifica o role após gravar). Fecha o resto do P1.1.
  - **Config web do Firebase POR INSTÂNCIA** — `src/lib/firebaseConfig.ts` +
    define `__FIREBASE_WEBAPP_CONFIG__`: o App Hosting injeta a config do projeto
    do backend no build (env `FIREBASE_WEBAPP_CONFIG`); o
    `firebase-applet-config.json` commitado virou só fallback de dev. Era o último
    acoplamento de código ao projeto do Carlos.
- **Decisão de arquitetura confirmada**: mesmo repo/`main` para todos os clientes;
  push na main rebuilda todos os backends conectados. Nada de fork por cliente.
- **Falta**: executar o playbook de verdade na instância do cliente 0 (valida P2
  OTG-free + P3 marca + este P4 de uma vez) e a instância demo com dados fictícios.

## P4.1 · Inversão produto ⇄ instância ("des-Boostificação", decisão 2026-07-03)

> Decisão: **NÃO forkar** (fork = manutenção dupla eterna). Em vez disso, inverter a
> titularidade: **o repo é o PRODUTO; o Boost do Carlos vira a instância nº 0**,
> pinada por config. Pós P2/P3/P4 o vínculo com o Boost já é só configuração.

- ✅ **`apphosting.boost.yaml` criado** — pina a instância do Carlos na marca Boost +
  OTG ligada, imune a qualquer flip futuro de defaults.
- **Passo do operador (pode fazer JÁ, 1 min, inócuo):** console App Hosting → backend
  `boost-agency-server` → Settings → Environment → nome **`boost`** → Save. (Hoje os
  valores do yaml são idênticos aos defaults; a associação só passa a importar no flip.)
- ✅ **FLIP EXECUTADO (2026-07-05, na branch):** defaults de `src/lib/branding.ts` →
  **AffiliaCore** + assets placeholder em `public/affiliacore/` + `<title>`/favicon do
  `index.html`. **Cinto-e-suspensório:** a marca Boost do Carlos está pinada em DOIS
  lugares — no `apphosting.yaml` BASE (inline; remover depois) E no
  `apphosting.boost.yaml` (ambiente `boost`) — merge seguro mesmo sem a associação no
  console. Após confirmar a associação, limpar o bloco de marca do base.
- **Restam:**
  1. ✅ **Rename do repo GitHub FEITO (2026-07-06)** — `boost-afiliiados` →
     `spanol/affiliacore`. Confirmou-se na prática que o rename QUEBRA o vínculo do
     Developer Connect (a tela Implantação perde o repositório e o push para de
     disparar rollout): foi refeito o link no console (Configurações → Implantação →
     repo `affiliacore` + branch `main`) e o backend voltou a apontar
     (`gitRepositoryLinks/spanol-affiliacore`). Lição p/ instâncias futuras: renomear
     repo ⇒ relinkar TODO backend que o usa.
  2. **Jurídico (P5.2) espelha**: plataforma AffiliaCore é do Vinicius; a agência do
     Carlos licencia uma instância white-label com a marca Boost dele.
- **Naming interno NÃO muda** (`boost_<uuid>`, coleções, `boostAffiliate.ts`): dados de
  produção dependem, usuário não vê, risco sem ganho.

## P5 · Comercial — quebrado em pedaços pequenos

> A parte "assustadora". Regra: quase tudo aqui se constrói igual a código, em passos
> pequenos e com ajuda. As únicas coisas que SÓ o Vinicius faz: conversar com prospects
> e assinar papel.

- **P5.1 — Nome e marca**: ✅✅ **DECIDIDO (2026-07-05): o produto chama-se
  `AffiliaCore`** — domínio **`affiliacore.com.br`** (com DOIS "f", grafia inglesa)
  **registrado pelo Vinicius** (expira 2027-07-05). ⚠️ `afiliacore.com.br` (um "f", o
  da shortlist) segue LIVRE — recomendado registrar também (~R$40) como typo-defense.
  Pendentes: busca INPI, handle Instagram, logo definitivo (placeholder monocromático
  em `public/affiliacore/`). Shortlist original (2026-07-03):
  | Nome | Domínio livre | Leitura |
  |---|---|---|
  | **AfiliaCore** ⭐ | afiliacore.com.br | soa produto/plataforma B2B; curto |
  | **Afiliagora** ⭐ | afiliagora.com.br | "afilia agora" + ágora (praça); marca própria |
  | PainelAfiliado | painelafiliado.com.br | descritivo, vende sozinho; menos "marca" |
  | Afiliado360 | afiliado360.com.br | descritivo, ideia de visão completa |
  | CentralAfiliados | centralafiliados.com.br | descritivo sólido |
  | AfiliaTec | afiliatec.com.br | tech genérico |
  | GestorAfiliados | gestorafiliados.com.br | descritivo, tom backoffice |
  | RedeBoost | redeboost.com.br | só se quiser manter a família "Boost" (colide c/ a marca do Carlos) |
  Ocupados (descartados): afilia, afiliahub, afiliapp, repassepro, comissa, comissio,
  margemapp, trakto, upafiliados, basebet. Próximo passo: Vinicius escolhe → registrar
  domínio (registro.br, ~R$40/ano) → logo simples. O produto nasce com nome próprio; o
  Boost do Carlos continua sendo a instância dele.
- **P5.2 — Jurídico mínimo (1 visita a advogado)**: (a) formalizar por escrito a
  titularidade do IP com o Carlos — barato agora, caro depois; (b) contrato-modelo de
  licença + serviço (1º mês, **cláusula da cobrança por % sobre a margem** — definição da
  base, direito de conferir os números do painel e o que acontece se a instância for
  desligada no meio do mês —, SLA de manutenção, LGPD — o app guarda PII de afiliados).
- **P5.3 — Demo + vídeo**: instância demo (P4) + GIF/vídeo de ~3min do fluxo completo
  (import de planilha → comissão calculada → portal do afiliado → auditoria → ranking).
- **P5.4 — Landing page one-pager** com preço publicado (diferencial: todo o segmento
  enterprise esconde preço). Hospeda no próprio Firebase Hosting.
- **P5.5 — Precificação publicada**: ~~v1 setup + degraus~~ → ~~v2 (% sobre a margem)~~ →
  **v3 no ar desde 2026-07-29** (implantação + mensalidade fixa; ver o fim deste doc);
  "preço de fundador" (metade de tudo) travado pros 3 primeiros em troca de feedback de perto.
- **P5.6 — Canal de venda**: primeiro cliente vem de indicação (rede do Carlos / mercado de
  afiliados BR), não de marketing pago. Comunidades e grupos de afiliados de apostas como
  segundo canal.

## Estado & próximo passo (atualizado 2026-07-05, noite — inversão DEPLOYADA e provada)

**Feito:** P0.1 ✅ (prod) · P1.1 ✅ · P2 ✅ (prod) · P3 ✅ (prod) · P4 ✅ (prod) ·
P4.1 flip ✅ (**prod, provado**) · P5.1 nome ✅ (**AffiliaCore**, affiliacore.com.br
registrado).

**Inversão em produção (2026-07-05 ~23h30, Vinicius acompanhando), na ordem executada:**
1. Ambiente **`boost`** associado ao backend `boost-agency-server` (console →
   Configurações → Ambiente). Verificado 2×: campo persistiu + CLI
   (`apphosting:backends:get --json`) retorna `"environment": "boost"`.
2. Merge `feat/p3-branding` → main (fast-forward, `e301b39`) + push → deploy OK,
   marca Boost intacta (pin do base ainda ativo).
3. Pin `VITE_BRAND_*` removido do `apphosting.yaml` base (`b818dff`) + push →
   **PROVA: prod sem pin no base segue "Agência Boost"** — a marca do Carlos vem
   exclusivamente do `apphosting.boost.yaml`. Override por ambiente FUNCIONA.
4. **Repo GitHub renomeado → `spanol/affiliacore`** (`gh repo rename` + `git remote
   set-url` local; o remote antigo redireciona).

**P3.1 (tema por instância) ✅ entregue e MERGEADO na main (`e58ad9f`, 2026-07-06).**
**P3.2 (estilo glass) + P3.3 (canvas escuro + tema inicial) ✅ MERGEADOS E
DEPLOYADOS (2026-07-06 ~17h, main `a5db1df`, Vinicius acompanhando):** rollout
automático ~7min (build `2026.07.06-200122`); verificado em prod — version.json
no commit, tokens glass no CSS com os defaults exatos, header do /admin
computando `rgba(10,10,10,0.8)+blur(12px)` (pixel-idêntico), `neutral-900` sem
override na Boost, marca/telas intactas. **A trilha de theming (P3.1–P3.3) está
COMPLETA em produção**: cliente novo = 4 envs (`ACCENT`+`STYLE`+`CANVAS`+`THEME`)
no `apphosting.<cliente>.yaml`, sem rebuild.

**Próximos passos, na ordem (atualizado 2026-07-06, fim da sessão do theming):**
1. **Branding da marca AffiliaCore via Claude design** (decisão do Vinicius,
   2026-07-06): montar a identidade — logo definitivo (substitui o placeholder
   monocromático de `public/affiliacore/`), paleta, tipografia — usando a
   ferramenta de design do Claude. Cobre a pendência "logo" do P5.1.
   ✅ **LOGO DEFINITIVO SHIPADO (2026-07-07):** projeto **"AffiliaCore Design
   System"** no claude.ai/design apresentou 3 direções (A Órbita/indigo/Space
   Grotesk · B Rede/teal/Sora · C Core/ember/Bricolage), paletas geradas pela
   **engine real** (`buildAccentRamp`/`buildCanvasRamp`) com envs `VITE_BRAND_*`
   prontas. **Vinicius escolheu a C ("Core")** — wordmark Bricolage Grotesque
   800/500 **convertido em curvas** (fontkit, shaping+kerning; verificação visual
   por render PNG) + glifo C-núcleo (anel aberto + dot; vira o favicon sozinho).
   `public/affiliacore/` agora tem: `logo.svg` (mono branco, convenção `invert`
   do app), `logo-color-dark.svg` (LP/redes), `logo-color-light.svg`
   (propostas), `favicon.svg` (tile #26181C). Boost intacta (pina
   `/boost-home/*`). Card "✔ Final" no projeto de design mostra os SVGs shipados.
   ✅ **FLIP DE CORES EXECUTADO (2026-07-07, commit `b9390ee`):** o tema do
   produto (ember `#E11D48` + canvas `#26181C` + surface `#3F1D2B`) entra por
   ENV no `apphosting.yaml` BASE — os defaults do `index.css` CONTINUAM
   amber/neutral de propósito (a engine de ramps não reproduz a paleta Tailwind
   exata a partir de 1 hex; a Boost depende dela p/ ficar pixel-idêntica). A
   Boost "des-seta" ACCENT/CANVAS/SURFACE no `apphosting.boost.yaml` (contrato
   não-hex = ausente travado por teste). **DEPLOYADO E PROVADO EM PROD
   (2026-07-07 ~3h20, rollout `e084c6d`):** o 1º rollout com `value: ''`
   (`ace835d`, build-07-07-002) **FALHOU na validação** — confirmando o risco
   previsto; o pin virou **`'none'`** (string não-hex ⇒ resolvers ignoram,
   e084c6d) e o rollout passou. Verificado na tela: Boost pixel-idêntica
   (logo BOOST, amber, canvas neutro) com o base carregando o tema ember.
2. ✅ **LP hero: mock VIVO da dashboard ENTREGUE (2026-07-07, commit
   `ebe5a0a`):** `HeroDashboardMock` (sidebar + métricas + top afiliados +
   funil + desempenho por casa, números fictícios) montado com os tokens do
   tema (`accent-*`/`neutral-*` → var()) e a marca da instância
   (`BRAND.logoUrl/shortName`) — o hero segue `VITE_BRAND_*` sem rebuild. O
   jpeg estático do painel Boost foi removido. Verificado ao vivo nos dois
   temas (default amber e ember por env).
3. ✅ **INSTAGRAM NO AR COM A CAMPANHA LANÇADA (2026-07-07):** conta
   **@affiliacore.br** criada pelo Vinicius (o `@affiliacore` está ocupado por
   perfil inativo — o INPI habilita reivindicar via formulário de marca da
   Meta) e populada via browser: avatar C-núcleo, bio, **conta comercial** e
   **post 1 da campanha PUBLICADO** (injeção canvas à prova de CSP, texto em
   curvas). Kit completo (avatar/capa/4 posts/legendas/checklist) em
   `marketing/affiliacore/` (`808dbc6`); técnica destilada na skill
   **`.claude/skills/instagram/`** (`b41370d`, + versão genérica user-level).
   Restam no app do celular (operador): link `affiliacore.com.br` na bio,
   categoria → "Empresa de software" (busca do IG web quebrada), agendar
   posts 2–4 (Meta Business Suite, dias 3·5·7). LinkedIn: kit pronto, página
   a criar (operador).
4. Registrar `afiliacore.com.br` (um "f") como typo-defense (~R$40) + **INPI**
   (classes 42/35 — também destrava a reivindicação do @affiliacore).
5. Executar o playbook (`scripts/provision/README.md`) na instância do cliente 0.
6. ✅ **P5.4 LANDING COMERCIAL NO AR (2026-07-07, deploy verificado em
   https://affiliacore-br.web.app):** one-pager estático em
   `landing/` (identidade C: ember/plum, Bricolage+Inter self-hosted, logo em
   curvas) com hero + mock de dashboard em CSS puro, features, white-label,
   **preço publicado** (implantação + mensalidade, card de preço de fundador
   — *os valores mudaram 2×; a tabela vigente está no fim do doc*) e CTA pro
   direct do @affiliacore.br.
   Servida pelo **projeto Firebase PRÓPRIO `affiliacore`** (decisão
   2026-07-07: a presença comercial do produto NÃO mora no projeto da
   instância 0), site `affiliacore-br`, alias `www` no `.firebaserc` —
   deploy: **`firebase deploy --only hosting --project www`** (bloco
   `hosting` no `firebase.json`, `public: landing`; rules seguem no default
   `agencia-boost-app`). LIÇÕES: (a) `backdrop-filter` no header sticky
   causou white-out de compositing no Chrome/Windows → header sólido +
   `html{background}`; (b) site-ID de Hosting deletado fica **tombstoned
   global pra sempre** — o `affiliacore` original foi deletado do
   agencia-boost-app na migração e nunca mais pode ser recriado (daí o
   `-br`). Domínio **affiliacore.com.br adicionado no console do projeto
   novo**; a zona DNS fica na **GoDaddy** (nameservers domaincontrol.com,
   NÃO registro.br); o `A 199.36.158.100` já entrou — **falta o OPERADOR**:
   REMOVER os 2 `A` do parking (13.248.243.5 / 76.223.105.230) e TROCAR o
   TXT p/ `hosting-site=affiliacore-br` (o antigo `hosting-site=affiliacore`
   sai); cert TLS provisiona em até ~24h. Link na bio do IG = app do celular
   (web não edita o campo Site): apontar pro https://affiliacore.com.br.
   ✅ **DOMÍNIO NO AR NO MESMO DIA** (DNS GoDaddy limpo pelo operador —
   pegadinha: o parking era UM registro `A @ "Parked"`; cert emitido em
   ~30min) + **www conectado como redirect 301 → apex** (CNAME www →
   affiliacore-br.web.app). ✅ **BACKEND DE LEADS NO AR (mesmo dia):** form
   "Receber contato" na seção final da LP grava DIRETO no **Firestore do
   projeto `affiliacore`** (southamerica-east1, criado no console) via REST
   sem SDK e sem API key; `firestore.affiliacore.rules` = **create-only com
   whitelist** (nome/whatsapp obrigatórios, afiliados/origem opcionais;
   read/update/delete negados — consulta de leads SÓ pelo console) +
   honeypot no client. Config **separada por projeto**:
   `firebase.affiliacore.json` (hosting + firestore do produto) — deploy:
   `firebase deploy --config firebase.affiliacore.json --project www
   --only hosting,firestore`; o `firebase.json` raiz voltou a ser só da
   instância (NUNCA deployar o firestore.rules raiz no projeto
   `affiliacore` — são bancos diferentes). E2E provado em prod (lead pelas
   2 vias + negativos 403; teste limpo e confirmado no console). Leads
   chegam SEM notificação (Spark) — consultar no console; e-mail/push =
   futuro com Blaze.
7. ✅ **P5.3 · DEMO — LADO DE CÓDIGO PRONTO (2026-07-07/08, sessão "agora é a
   demo"; commits na main SEM push).** Desenho: instância OTG-free
   "AffiliaCore Demo" no projeto `affiliacore` (mesmo da landing), dados
   fictícios, acesso controlado (SEM link na LP; credenciais revogáveis +
   reset periódico). Entregue:
   - **`scripts/provision/seed-demo.cjs`** — seed determinístico (PRNG com
     semente fixa + maior-resto em centavos): na janela "Últimos 30 dias" os
     totais batem EXATOS com o mock da LP (comissão R$ 24.831,90 · FTD 312 ·
     cadastros 1.204 · CPA 187 · REV R$ 6.591,90 · Superbet/Betano/BetMGM),
     ~30 dias anteriores a ~87% (comparações fazem sentido), atividade
     garantida ONTEM (ranking gera pódio com ≥10), 38 afiliados nativos
     (20 produtores com pesos das barras do mock: Yago/Ana/Lucas/... + 18
     em captação), especial (Ana) com sub-rede de 3, 2 sem config (estado
     "não configurado"), avisos + notificação + trilha de auditoria
     plausível. Logins: demo@/afiliado@/especial@affiliacore.com.br.
     Modos: `--plan` (valida a matemática SEM Firebase — rodado ✔),
     `--wipe --yes` (reset TOTAL verificado por query; `leads` PROTEGIDO
     por contagem antes/depois), `--rotate` (senhas novas + revoga
     sessões), `--verify-only`. GUARD: aborta fora do projeto `affiliacore`.
   - **`scripts/provision/build-affiliacore-rules.cjs`** — o banco do
     `affiliacore` agora serve leads E demo ⇒ `firestore.affiliacore.rules`
     virou arquivo GERADO = firestore.rules (instância) + bloco `leads`;
     regenerar + re-deployar a cada mudança de rules.
   - **`apphosting.demo.yaml`** (ambiente `demo`): OTG-free, marca
     "AffiliaCore Demo", tema ember herdado do base, e **neutralização dos
     secrets OTG do base** (`value: 'unused'`; NUNCA '' — rollout reprova
     env vazio). ⚠️ Essa neutralização é OBRIGATÓRIA em QUALQUER instância
     nova (o base referencia otg-links-*/otg-dash-*/affiliate-api-key que só
     existem no projeto do Carlos) — playbook §4 atualizado.
   - **Fixes de produto p/ instância OTG-free**: (a) auto-seed de casas
     (`ensureHousesSeeded`) gateado por OTG — demo não nasce com
     Superbet/SportingBet 'otg' fantasma (+2 testes no server.test.ts);
     (b) card "Total CPA" do /admin (que seria R$ 0,00 eterno — CPA-dinheiro
     só existe na OTG) vira **"Total depositado"** quando OTG off.
   - **Playbook § "Instância DEMO"** no scripts/provision/README.md com os
     GATES DO OPERADOR: Blaze no projeto `affiliacore`, Auth e-mail/senha,
     app Web, deploy das rules mescladas, service account, 2 secrets,
     backend + ambiente `demo`, seed e smoke (checklist).
   - Gap de fidelidade CONHECIDO p/ o item (b): a LP mostra "Total CPA
     R$ 18.240" — na demo esse card é "Total depositado" (instância manual
     não tem CPA-dinheiro). Ao refinar os mocks da LP, espelhar o card novo.
8. ✅ **P5.3b · MOCKS DA LP FIÉIS — DEPLOYADO EM PROD (2026-07-08, decisão
   do Vinicius: "montar a demo não vale o esforço agora; primeiro a
   fidelidade da LP").** A demo P5.3 fica ESTACIONADA com o lado de código
   pronto (item 7) — executar o playbook do operador só quando houver lead
   que justifique. Entregue e verificado em https://affiliacore.com.br
   (200 + conteúdo novo confirmado por curl e na tela via localhost):
   - **Hero = réplica do /admin real**: sidebar com "Principal" + chip
     "Admin · Sua Agência", header com badge "Visão geral" / preset
     "Últimos 30 dias" / CTA "Convidar afiliado", 4 cards com os labels e
     NÚMEROS do HeroDashboardMock do app (38 · R$ 24.831,90 · Total
     depositado R$ 97.100,00 · REV R$ 6.591,90), gráfico "Top afiliados
     por comissão" (Yago/Ana/Lucas/...), "Funil da rede" (1.204/312/187,
     tendência em accent) e "Desempenho por casa" (Superbet/Betano/BetMGM
     — mesmos valores do mock/seed da demo).
   - **Seção nova "Por dentro do produto"**: 3 vinhetas fiéis — pódio do
     /ranking (1º/2º/3º LUGAR), trilha da /auditoria (labels REAIS de
     ação: "Alterou comissão (CPA/REV)" com antes→depois, "Importou
     resultados", "Gerou convite"; copy do append-only) e portal do
     afiliado ("Comissão total" + pill do contrato CPA+REV).
   - **HeroDashboardMock do app** também ganhou o card por instância
     (OTG on = Total CPA; OTG-free = Total depositado) — app, LP e futura
     demo contam a MESMA história numérica.
9. ✅ **P5.3c · DEMO COM COBERTURA TOTAL + TRAVA DE REGRESSÃO (2026-08-17,
   pedido "grande cobertura de cenários para gravar mídia nova").** A demo
   deixou de mostrar só o núcleo: `DEMO_FULL=1 npm run dev` sobe emuladores +
   seed base + `seed-demo-extras.cjs` num comando, e a demo ganhou 133
   afiliados, 7 casas, carteira em todos os status COM casa, marketplace
   (acordo direto E gerenciado, fila do gerente e "Aguardando link"),
   conquistas (5 placas + fila), links com pool de standby, jurídico,
   integração `esportiva-tap` ligada, `/solicitacoes` nas 3 naturezas,
   settings (Suporte na sidebar + vitrine), taxa com vigência/byBrand,
   2º especial `fromNetwork` e auditoria rica. Smoke Playwright nas 32
   telas dos 3 papéis: nenhuma vazia. **A demo também virou parte da
   harness**: `src/lib/demoCoverage.ts` + teste travam coleção nova sem
   dado e enum novo sem registro (achou sozinha `affiliate_tag_aliases` e
   o status `priced`) — ver o invariante no CLAUDE.md. O `seed-demo-extras`
   agora roda também contra o Firestore REAL da demo (`--live --yes`, com
   guard de projeto + proteção dos `leads` verificada por query), que é o
   que faltava para a instância deployada não nascer pobre.
10. **PRÓXIMO — a demo deployada depende SÓ de gates de operador** (nada de
   código pendente; playbook em `scripts/provision/README.md` § "Instância
   DEMO", passos 1 a 9): (a) Blaze no projeto `affiliacore`; (b) Auth
   e-mail/senha; (c) app Web registrado; (d) rules MESCLADAS
   (`build-affiliacore-rules.cjs` + deploy com `--config
   firebase.affiliacore.json --project www` — NUNCA o `firestore.rules`
   raiz, apagaria o bloco `leads`); (e) service account + os 2 secrets;
   (f) backend App Hosting com o ambiente `demo`; (g) seed 8a + 8b; (h)
   smoke. Fora disso: typo-defense afiliacore.com.br + INPI/Instagram
   (link na bio ainda pendente — operador); playbook no cliente 0; P5.2
   jurídico; formalizar degraus do P5.5.

## 🎨 Fundo preto = padrão de label (2026-07-28)

**Reclamação do cliente Infinity:** modais e "outras features" com o fundo
avermelhado. **Causa:** o P5.1 pinou o tema ember do PRODUTO
(`VITE_BRAND_ACCENT/CANVAS/SURFACE`) no `apphosting.yaml` **base** — que é
herdado por toda instância. Infinity e Previsão declaravam só o próprio
`ACCENT`, então herdavam `CANVAS #26181C` + `SURFACE #3F1D2B`; e o CANVAS não é
"o fundo da página": ele re-tinta a ramp `--color-neutral-*` INTEIRA + os tokens
glass escuros (`theming.ts`), ou seja, modais, cards, bordas e cabeçalhos. Duas
labels vivas com a cara errada, e os comentários dos dois yamls afirmavam o
contrário ("canvas/surface seguem o neutro default").

**Executado o "plano B" que o próprio `apphosting.boost.yaml` já previa:**

- `apphosting.yaml` (base) **não declara mais tema nenhum** — o padrão de
  qualquer instância volta a ser o default do `index.css`: canvas neutro (preto)
  + surface navy `#141C2A`.
- O ember do produto **mudou de arquivo, não sumiu**: vive em
  `apphosting.demo.yaml` (a vitrine AffiliaCore, ainda estacionada). Se um dia
  existir outra instância "cara do produto", ela declara os 3 hexes.
- Label declara só o que é DELA (tipicamente `VITE_BRAND_ACCENT`): Infinity
  segue roxa `#8332B9`, Previsão verde `#00B919` — as duas agora sobre preto.
- Boost mantém os `'none'` como pin explícito da instância 0 (redundantes hoje,
  seguro se o base voltar a ter tema).
- **Invariante travado em `src/lib/instanceTheming.test.ts`**: lê os yamls,
  mescla base+instância pelo `resolveThemeTokens` real e falha se (a) o base
  ganhar `VITE_BRAND_*`, ou (b) alguma label emitir `--color-neutral-*` /
  `--color-brand` / `--color-glass-*`. A demo é a exceção declarada.
- Playbook (`scripts/provision/README.md`), skill `provision-instance` e
  `.env.example` atualizados: **não declarar `CANVAS`/`SURFACE` numa label** sem
  o cliente pedir.

⚠️ **Operador:** as `VITE_BRAND_*` são BUILD — Infinity e Previsão só ficam
pretas no **próximo rollout** de cada backend.

## 🎨 Superfície pública tematizada — LP + auth (2026-07-28)

**Reclamação do cliente Infinity, na sequência da anterior:** a landing padrão
não usava o roxo da marca em lugar nenhum. **Causa:** o accent estava certo em
env e na engine, mas a `Home.tsx` nunca foi tematizada — CTA `bg-white`, glows
`bg-white/5`, ícones `text-neutral-400`, zero classe `accent-*`. O único roxo da
página vinha do `HeroDashboardMock` (a mini-dashboard do hero, que já usava os
tokens). Ou seja: a LP era monocromática por construção, em toda instância.

**Solução — tokens próprios da LP, acesos só por quem declara accent:**

- `index.css` ganhou `--color-lp-cta` / `-cta-text` / `-cta-hover` / `-icon` /
  `-focus` / `-glow` / `-halo` (landing, fundo escuro fixo), com defaults = o
  monocromático EXATO de hoje (`#fff`, `#0a0a0a`, `#e5e5e5`, `#a3a3a3`,
  branco/5%, branco/20%); e `--color-auth-cta` / `-cta-text` / `-cta-hover`
  (metade CLARA do card de auth), com defaults apontando p/ `var(--color-brand)`
  / `var(--color-brand-light)` — ou seja, ainda seguem `VITE_BRAND_SURFACE` de
  quem declarar. **A metade ESCURA das telas de auth reusa os `--color-lp-*`**
  (mesmo papel: marca sobre fundo escuro), por isso não há `-dark` duplicado.
- `buildPublicTokens` (`theming.ts`) deriva os 10 da ramp accent e
  `resolveThemeTokens` só os emite **dentro do `if (accent)`**. Sem
  `VITE_BRAND_ACCENT` nada é emitido → **Boost e AffiliaCore ficam
  pixel-idênticas**; Infinity/Previsão falam a cor do cliente sem código por
  label.
- **Por que não apontar as classes direto p/ `accent-*`:** o accent tem default
  ÂMBAR no `@theme`, então isso pintaria a superfície pública de TODA instância
  de âmbar — exatamente o vazamento que o fix do fundo preto acabou de fechar.
- Consumidores: `Home.tsx` (nav, menu mobile, CTA do hero, "Aplicar para
  Parceria", 2 blobs de fundo, ícones dos StatCards, foco dos inputs),
  `HomePrizesSection.tsx` (CTA do pódio) e as 5 telas de auth — `Login`,
  `Register`, `ForgotPassword`, `ResetPassword`, `InviteAccept` (6 CTAs, 18
  inputs, 8 links/spinners; padrão de classe idêntico nas cinco). A utility
  `.glow-white` virou `.glow-lp` (segue `--color-lp-halo`).
- Ouro/prata/bronze do pódio seguem FIXOS (âmbar = ouro), como já era.
- **Invariantes travados:** `theming.test.ts` (sem accent → nenhuma
  `--color-lp-*`/`--color-auth-*`; canvas/surface sozinhos não acendem;
  auth-cta == lp-cta, p/ o visitante não ver duas cores de marca entre a LP e o
  login; hover escurece o CTA nos dois temas; glow/halo saem com alpha) e
  `instanceTheming.test.ts` (Infinity = accent-500 na LP E no auth; Boost =
  vazia).

**Deixado de fora de propósito:** `NotFound.tsx` (CTA `bg-slate-900
dark:bg-brand`, lógica invertida — mapear mudaria pixel da Boost) e `Terms.tsx`
(botão one-off). Ambos precisam de decisão de design antes, não de token.

⚠️ **Operador:** BUILD como as demais — a Infinity só fica roxa no **próximo
rollout**.

## 🌗 LP theme-aware + toggle público (2026-07-28)

A landing nasceu dark-only (herança do scaffold do designer): ~93 classes
escuras hardcoded, ignorando o `ThemeContext` que já envolvia o app inteiro.
Agora ela **segue o mesmo tema do app** — preferência salva > `VITE_BRAND_THEME`
> SO, sem exceção — e tem o toggle na nav.

- **`ThemeToggle`** (`src/components/ThemeToggle.tsx`) foi EXTRAÍDO do
  `DashboardLayout` (era inline) e é usado nos dois lugares: o pedido foi "o
  mesmo switch da dashboard", então tem que ser o mesmo componente, não uma
  cópia que diverge depois. `compact` esconde o rótulo (nav da LP).
- **Convenção do par claro/escuro** (a mesma de `Login`/`DashboardLayout`):
  superfície `slate-50`/branco ↔ `neutral-950`/`900`; texto
  `slate-900`/`600`/`400` ↔ `white`/`neutral-400`/`500`; borda `slate-200` ↔
  `neutral-800`; CTA `--color-auth-*` ↔ `--color-lp-*`.
- **3 tokens novos** só para o claro da LP: `--color-lp-icon-light`,
  `--color-lp-glow-light`, `--color-lp-halo-light` (um glow branco sobre
  `slate-50` seria invisível). No claro os detalhes saem de degraus mais
  ESCUROS da ramp (600, não 400) e os alphas são menores — fundo claro não
  absorve a cor como o preto. O CTA claro reusa `--color-auth-*`, então **LP
  clara e login claro mostram o mesmo botão**.
- `.glow-white`/`.bg-grid-white` viraram `.glow-lp`/`.bg-grid-lp` e trocam de
  tinta por `.dark` (CSS cru — `@variant dark` só vale em classe gerada).
- **`HeroDashboardMock` deixou de ser dark-only**: no claro reproduz o `/admin`
  claro, então o hero mostra de verdade o que o afiliado vai ver.
- O logo da marca é claro (feito p/ fundo escuro): no claro leva `invert`, o
  mesmo tratamento que o card de Login já usava.
- **`src/test/setup.ts` ganhou stub de `window.matchMedia`** (guardado por
  `typeof window`, porque o setup roda também nos testes `environment: node`).
  Sem ele NENHUM teste conseguia renderizar o `ThemeProvider`.

⚠️ **Operador:** como a LP passou a seguir o SO, visitante com SO claro vê a
landing CLARA. Foi decisão consciente (consistência com o app); se algum cliente
quiser a porta de entrada sempre escura, o caminho é `VITE_BRAND_THEME=dark` no
yaml da instância.

## 💰 Modelo de preço vigente (v3 — no ar desde 2026-07-29)

Terceira versão. Substitui a **v2** (2026-07-25: sem implantação, 1º mês
fechado + % sobre a margem líquida a partir de 3% com piso), que por sua vez
substituiu a v1 de referência (setup R$ 3–8 mil + degraus por nº de
afiliados). Decidido pelo Vinicius; publicado em `landing/index.html`
(affiliacore.com.br) e refletido no `marketing/affiliacore/CAMPANHA-LANCAMENTO.md`
e no `marketing/affiliacore/cookbook-nova-label.html`.

| | Padrão | Fundador (3 primeiras agências) |
|---|---|---|
| **Implantação** (uma vez, na assinatura) | R$ 3.000 | R$ 1.500 |
| **1ª mensalidade** (mês da implantação) | R$ 600 | R$ 300 |
| **Mensalidade** (do 2º mês em diante) | R$ 2.500 | R$ 1.250 |

- **Por que voltou o fixo:** a **Infinity** — 1º cliente PAGANTE, contrato
  fechado em 2026-07-30 — **recusou trabalhar com % sobre a receita/margem**.
  O deal assinado é exatamente a coluna "fundador": R$ 1.500 de implantação,
  R$ 300 de 1ª mensalidade e R$ 1.250/mês do 2º em diante. A tabela pública
  foi ajustada pra que o contrato assinado FOSSE o preço de fundador, não uma
  exceção fora da tabela.
- **Volta a taxa de implantação** (R$ 3.000 / R$ 1.500), a mesma heurística
  do benchmark original: a implantação é trabalho concentrado (instância,
  marca, domínio, migração das taxas, onboarding) e cobrá-la separada
  qualifica o lead — a v2 tinha zerado essa barreira e ela fazia falta.
- **Fundador = metade de TUDO** (implantação, 1ª mensalidade e mensalidade),
  travado enquanto for cliente. Regra simples de comunicar e de honrar.
- **Economia da mensalidade:** ~R$ 250/mês é o custo de infra da instância
  (Firebase/App Hosting) que a AffiliaCore cobre. No fundador, R$ 1.250 −
  R$ 250 = **R$ 1.000 de margem por cliente/mês**; no padrão, R$ 2.250.
- **Sumiu o % sobre a margem** e, com ele, o risco estrutural da v2: a base da
  fatura era um número que o próprio CLIENTE configurava (o repasse), então
  inflar o repasse no painel reduzia a conta da AffiliaCore. Preço fixo não
  tem esse vetor — e vira argumento de venda ("a AffiliaCore não entra na sua
  comissão; se você dobrar, a conta é a mesma").
- ⚠️ **Trade-off aceito:** sem % não há upside automático em cliente grande.
  O crescimento da receita passa a vir de **nº de instâncias**, não do tamanho
  de cada uma. Se algum dia entrar um cliente de volume muito alto, a
  negociação é caso a caso (ex.: mensalidade maior por SLA/integrações), não
  percentual.
- **Reajuste:** preço travado em contrato, reajuste só na renovação anual —
  publicado na LP, então tem que valer no contrato do P5.2.

## 🚪 A Boost saiu do repo (2026-07-30)

O Carlos decidiu **recolher a label com a codebase**: a Boost passou a viver no repo
próprio `spanol/boost`, e o backend App Hosting `boost-agency-server` (projeto
`agencia-boost-app`) builda **de lá** — verificado por
`firebase apphosting:backends:list --project agencia-boost-app`, que mostra
`Repository: spanol-boost`. Deixa de ser a "instância nº 0" deste repo.

**Removido:** `apphosting.boost.yaml`. As referências a ele nos comentários do
`apphosting.yaml`/`apphosting.demo.yaml`/`branding.ts` foram reescritas.

**Os dois testes que citavam a Boost sobreviveram como CONTRATO, não como caso
particular** — a regra que eles guardam vale para qualquer label:
- `theming.test.ts`: env de tema com `''` ou `'none'` equivale a ausente (o "des-set").
- `instanceTheming.test.ts`: label sem accent não emite `--color-lp-*`/`--color-auth-*`
  (superfície pública fica pixel-idêntica). Agora testado contra o base + um accent
  `'none'`, em vez de ler o yaml que saiu. `LABELS` = `['infinity', 'previsao']`.

**⚠️ O risco que a saída deixou, e que foi fechado junto.** O `.firebaserc` tinha
`"default": "agencia-boost-app"` — ou seja, um `firebase deploy --only firestore:rules`
digitado aqui publicava no projeto de um cliente **cujo código vem de outro repo**. Foi
exatamente assim que, em 30/07, as rules fecharam na frente da build e todo afiliado
especial da Boost ficou sem ver equipe. Agora:
- **não existe mais alias `default`** — todo comando exige `--project` explícito
  (aliases: `infinity`, `www`);
- o predeploy hook tem `agencia-boost-app` como **`blocked`**, com a mensagem dizendo
  que as rules dela se deployam do repo dela.
