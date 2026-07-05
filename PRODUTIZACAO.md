# Produtização — vender o Boost para outras agências

> Esboço 2026-07-02 (conversa Vinicius + Claude). Objetivo: transformar o Boost num produto
> white-label vendável para outras agências de afiliados de apostas. Modelo definido:
> **Vinicius faz setup + manutenção; o cliente opera**. Instância dedicada por cliente
> (1 projeto Firebase cada) — SaaS multi-tenant fica para quando houver 5+ clientes.
> Precificação de referência (benchmark 2026-07-02): setup único R$ 3–8 mil + mensalidade
> em degraus por nº de afiliados ativos (~R$ 600–1.500/mês); Carlos = cliente 0 (cortesia).

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
- **Fora do núcleo (P3.1, avaliar depois):** cor primária configurável — o app
  usa `amber-*` hardcoded em dezenas de arquivos (inclusive com semântica de
  aviso); remapear exige token de accent via CSS var + varredura cuidadosa.
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
  1. **Rename do repo GitHub** `boost-afiliiados` → `affiliacore`: o GitHub redireciona
     remotes/URLs antigos; RECONFERIR a conexão App Hosting/Developer Connect de cada
     backend após o rename (refazer o link se o build parar de disparar).
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
  licença + serviço (setup, mensalidade, SLA de manutenção, LGPD — o app guarda PII de
  afiliados).
- **P5.3 — Demo + vídeo**: instância demo (P4) + GIF/vídeo de ~3min do fluxo completo
  (import de planilha → comissão calculada → portal do afiliado → auditoria → ranking).
- **P5.4 — Landing page one-pager** com preço publicado (diferencial: todo o segmento
  enterprise esconde preço). Hospeda no próprio Firebase Hosting.
- **P5.5 — Precificação v1 publicada**: setup + degraus de mensalidade (referência no topo
  deste doc); "preço de fundador" travado pros 2–3 primeiros em troca de depoimento.
- **P5.6 — Canal de venda**: primeiro cliente vem de indicação (rede do Carlos / mercado de
  afiliados BR), não de marketing pago. Comunidades e grupos de afiliados de apostas como
  segundo canal.

## Próximo passo recomendado

**P0.1 (Auditoria Fase 3)** — já tem plano detalhado, fecha a pendência de segurança
combinada e é pré-requisito natural de P1. Em paralelo (sem código): começar P5.1
(shortlist de nomes) quando o Vinicius quiser.
