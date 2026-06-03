# Cadastro direto de afiliados — link de recrutamento (design)

> Capturado em 2026-06-02. **Ainda não implementado** — branch `feature/cadastro-direto`.
> Substitui a ideia inicial de surfacar o link de tracking da OTG (não acessível: o
> endpoint `links` da v2 dá 404 e o `/my-links` é API v1, que rejeita nossa `x-api-key`).
> Em vez disso, a Boost expõe o **próprio** link de cadastro, permitindo afiliados novos
> (que ainda não existem na OTG) se registrarem direto.

## Decisões travadas (Carlos, 2026-06-02)

1. **Tipo de link: reutilizável por recrutador.** Cada master/especial tem UM link fixo e
   compartilhável; qualquer pessoa que abrir se cadastra e fica atrelada a quem compartilhou.
   NÃO expira, NÃO é uso único (diferente do convite `/api/invites` atual, que é token único
   de 7 dias amarrado a um `affiliateId` pré-existente).
2. **Vínculo OTG: cadastro pendente, vincula depois.** O recruta entra como **pendente**
   (conta Firebase + contato, SEM `affiliateId`). Não tem produção/comissão até o **master**
   vincular um `affiliateId` da OTG. Casa com o modelo wrapper (produção vem da OTG).
3. **Quem recruta: master e especial.** Ambos têm link. Quem se cadastra pelo link do
   **especial** vira **sub** dele (atrelamento automático ao linkar o affiliateId depois);
   pelo link do **master**, cai no **pool geral** para triagem.

## Arquitetura proposta

### Modelo de dados
- **`recruit_links/{code}`** (server-only, como `invites`): `{ code, recruiterUid,
  recruiterType: 'master' | 'special', recruiterAffiliateId (só p/ especial), recruiterName,
  active, createdAt }`. **Idempotente por recrutador** — 1 link ativo por `recruiterUid`
  (recriar devolve o existente → link estável).
- **`users/{uid}`** do recruta pendente: `role: 'client'`, **sem `affiliateId`**,
  `pendingAffiliate: true`, `recruitedByUid`, `recruiterType`, `recruiterAffiliateId` (p/
  atrelar como sub ao linkar), + `name`, `phone`, `instagram`. Ao vincular: setar
  `affiliateId`, `pendingAffiliate: false` e, se `recruiterType==='special'`, adicionar o
  novo `affiliateId` ao `special_affiliates/{recruiterAffiliateId}.subAffiliateIds`.

### Endpoints (`server.ts`)
- `POST /api/recruit-link` (`requireAuth`; admin **ou** client com `isSpecial`) → cria/retorna
  o link reutilizável do chamador (idempotente). 403 p/ client comum.
- `GET /api/recruit-link/:code` (público) → `{ recruiterName, recruiterType }` (sem dado sensível).
- `POST /api/recruit-register` (público) → cria Auth user + `users/{uid}` pendente. **Trava de
  segurança:** `role` SEMPRE `'client'`, nunca admin; nunca setar `affiliateId` aqui (fecha a
  brecha conhecida do self-register que deixa o client escolher o próprio role).
- `GET /api/pending-affiliates` (`requireAdmin`) → lista recrutas pendentes (contato + recrutador).
- `POST /api/pending-affiliates/:uid/link` (`requireAdmin`) → vincula `affiliateId` da OTG,
  ativa, e atrela ao especial se aplicável.

### Frontend
- **Card "Link de cadastro / recrutamento"** no `/admin` (AdminDashboard) e no `/network`
  (SpecialDashboard): gera/mostra/copia o link reutilizável (`/cadastro/:code`).
- **Página pública `/cadastro/:code`** (espelha `InviteAccept`, mas p/ afiliado novo):
  coleta nome + e-mail + telefone (WhatsApp) + Instagram + senha. Rota nova em `App.tsx`.
- **Visibilidade dos pendentes p/ o master**: seção/página listando recrutas pendentes com
  ação "vincular afiliado" (escolher o `affiliateId` da OTG). Sem isso o recruta fica órfão.

### ⚠️ UX do recruta pendente (logado sem affiliateId)
Hoje um client sem `affiliateId` que loga cai em `/profile` (ver `clientHome` em `App.tsx`) e o
proxy retorna **403** ("Sua conta não está vinculada a um afiliado") em qualquer fetch de
results. Precisa de um **estado amigável "cadastro em análise"** (no ClientDashboard ou numa
landing pendente) em vez de erro, até o master vincular o affiliateId.

## Pontas soltas / a confirmar
- Link do master: um por admin, ou um link único da agência? (assumido: 1 por admin/recrutador).
- Validação de telefone/Instagram obrigatórios (hoje o convite exige telefone).
- `firestore.rules`: `recruit_links` server-only (sem rule → negado ao client), como `invites`.
- Rate limiting / anti-abuso do registro público reutilizável (link viral = qualquer um cria conta).
