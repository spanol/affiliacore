# Auditoria Final de Segurança & Arquitetura — Agência Boost

**Data:** 2026-06-24 · **Escopo:** código comitado na `main`, pós-Fases 1–4 do `REVIEW-TEST-PLAN.md` · **Método:** revisão adversarial multi-agente (6 dimensões → verificação adversarial de cada achado → síntese), seguida de remediação das issues confirmadas.

## 1. Veredito executivo

A plataforma está **fundamentalmente segura** para os três papéis (`admin`, `client`, `especial`). As correções estruturais das Fases 1–4 **seguram no código comitado**, confirmadas caso a caso (seção 4). Das ~24 hipóteses levantadas, **12 foram refutadas adversarialmente** (seção 3) — nenhuma das vulnerabilidades "assustadoras" (IDOR do proxy, path-traversal, open-redirect, escrita bloqueada de `affiliate_configs`) é real; cada uma tem o guard exato que a segura.

Sobraram **5 issues reais** (0 críticas, 0 altas após calibração) — todas da **mesma classe** que a auditoria mirava, vazando por superfícies sem teste. **4 foram corrigidas nesta sessão**; 1 é ação de operador (App Check).

| # | Severidade | Issue | Status |
|---|---|---|---|
| 1 | média | `settings/{id}` legível por qualquer signed-in (doc credential-shaped) | ✅ **corrigida** (rule `isAdmin()` + teste de rules) |
| 2 | média | `AffiliatesList` persiste `{cpaValue:0,revPercentage:0}` fantasma (ausência≠R$0) | ✅ **corrigida** (`buildBrandConfigTopPayload` + guarda) |
| 3 | média | `clickStatDay()` usa UTC (bucket de cliques desloca à noite BR) | ✅ **corrigida** (`resolveServerToday`/fuso BR + teste) |
| 4 | baixa | `SpecialDashboard` chart por afiliado ignora `byBrand` (display) | ✅ **corrigida** (passa `brandId`) |
| 5 | baixa | Formulário de contato sem rate-limit/captcha | ⏳ **follow-up de operador** — Firebase App Check |

**Bônus (achado property-based):** `num()` lançava em `Number({"toString":false})` — JSON válido. Blindado (objeto não-array → 0) para nunca crashar o cálculo de dinheiro.

## 2. Issues confirmadas e remediação

**1 · `settings-api-key-read` (média).** `firestore.rules` concedia `read: if isSignedIn()` em `settings/{settingId}` — qualquer afiliado autenticado lia `settings/external_api` (forma de credencial). O proxy vivo usa `process.env.AFFILIATE_API_KEY`, então o doc é órfão/legado, mas a rule sobre-concedia em qualquer setting sensível. **Fix:** `allow read, write: if isAdmin()` (espelha o fix R5 de `affiliate_configs`). Único leitor vivo é a tela Settings (admin); `fetchSetting` do client é código morto. Teste de rules movido para o bloco admin-only. **Pende `firebase deploy --only firestore:rules` (operador) p/ valer em prod.**

**2 · `affiliates-list-phantom-zero` (média).** `handleSaveConfig` em `AffiliatesList.tsx` montava o payload com `{cpaValue: Number(raw)||0, revPercentage: Number(raw)||0}` e gravava sempre os dois campos — um "Salvar" sem digitar nada persistia 0/0, e `rateStatus` passava a ler "configurado" num afiliado sem taxa. **Fix:** roteado pela pura já testada `buildBrandConfigTopPayload` (só grava campo digitado agora ou já-numérico; `null` → não cria doc fantasma); defaults dos inputs trocados de `0` p/ vazio (UX de "não configurado"). Mesma regra do `BrandConfigEditor`.

**3 · `clickstatday-utc` (média).** `clickStatDay()` em `src/lib/tracking.ts` fazia `date.toISOString().slice(0,10)` (UTC). Entre 21h–23h59 BR (Cloud Run = UTC) o clique caía no bucket de amanhã — mesma classe do R12 já corrigido no ranking. **Fix:** delega a `resolveServerToday(date)` (fuso `America/Sao_Paulo`, fonte única). Teste reescrito para provar o comportamento BR.

**4 · `special-dashboard-inline-calc` (baixa).** O chart por afiliado do `SpecialDashboard` usava a taxa de topo (`ownConfig.cpaValue`) sem `brandId`, divergindo dos cards/lucro líquido da mesma tela quando havia override por casa. Só display (o payout real já honrava `byBrand`). **Fix:** passa `brandIdOf(rowAff(r))` + `resolveBrandRates`, espelhando os cards.

**5 · `contact-inquiry-no-rate-limit` (baixa).** `createContactInquiry` faz `addDoc` direto (sem rota de servidor); a rule restringe o create ao shape+tamanho, mas não há rate-limit/captcha. **Não há `POST /api/contacts`**, então `express-rate-limit` é inaplicável — a alavanca correta é **Firebase App Check** (já nomeado como follow-up na própria rule). Spam é recuperável por delete do admin; sem bypass de auth/PII. **Ação de operador.**

## 3. Achados refutados (registro)

Investigados e refutados com a closure exata: `missing-endpoint-affiliate-configs-write` (a rule é `read,write: if isAdmin()` — permite admin via client SDK, o repro estava errado), `direct-firestore-read-affiliates` (mirror não-sensível, PII vive em coleções admin-only), `unvalidated-proxy-endpoint` / path-traversal (barrado por `resolveScopedAffiliateIds`; `BASE_URL` fixo), `open-redirect-via-registerurl` (destino é admin-controlado via `requireAdmin`), `invalid-date-format-accepted` (3 sites são `requireAdmin`; sem corrupção de dado válido), `no-cors-config` (sem CORS = SOP bloqueia leitura cross-origin; auth real é `requireAuth/requireAdmin`), `email`/`password` sem validação Boost (Firebase Auth valida server-side), `console-log-proxy-url` (`x-api-key` só em header), `missing-return-in-proxy-error` (statement terminal), `affiliateid-not-escaped-in-pending-key` (doc IDs nunca são parseados de volta), `message-read-marking-race` (`setDismissed` no `finally`, `readAt` server-side).

## 4. Closures confirmadas (Fases 1–4)

- **Money-math:** núcleo puro em `src/lib/commission.ts` (single source); `calcAffiliatePayout`/`resolveBrandRates`/`rateStatus`/`num` intactos; `composeAdminProfit` mantém "agregado == Σ cards". Os 2 desvios reais (issues 2 e 4) eram call-sites inline que não reusavam as puras — agora religados.
- **Role-scoping / IDOR:** `resolveScopedAffiliateIds` (`src/lib/scope.ts`) segura o proxy; não-admin 403 em endpoint≠`results` e `affiliateIds` forçado ao próprio. `resolveIsSpecial (active===true)` é a definição única.
- **`affiliate_configs` admin-only** (R5) e **rules travando role/affiliateId/isSpecial** no self-update (R6): de pé. A omissão análoga em `settings` (issue 1) foi fechada.
- **AuthContext** reset de loading no swap (R14): de pé. **Ranking** server byBrand + fuso BR: de pé (a regressão era no `clickStatDay`, issue 3, mesma classe).
- **Coleções server-only** (`invites`, `pending_affiliates`) e **Storage**: catch-all deny + Admin SDK.

## 5. Observações de arquitetura / dívida

1. **Dois editores de taxa inline.** `BrandConfigEditor` (via `buildBrandConfigTopPayload`) e o editor inline da `AffiliatesList` (agora também roteado pela pura). Consolidar num componente único é dívida aberta.
2. **Varrer `read: if isSignedIn()` por sensibilidade.** Restam `affiliates`/`special_affiliates`/`notices`/`daily_rankings` como signed-in-read (todos não-sensíveis/decisão de produto). `settings` foi apertado.
3. **Fuso centralizado:** `resolveServerToday` é a fonte única; considerar lint/grep proibindo `toISOString().slice(0,10)` no servidor.
4. **Hardening defensivo (backlog, não-urgente):** allowlist de endpoint no proxy, allowlist http/https em `registerUrl`, validação semântica de data — todos defense-in-depth (refutados como vuln presente).

## 6. Recomendações finais

- **Operador:** `firebase deploy --only firestore:rules` (issue 1) e habilitar **Firebase App Check** (issue 5).
- **Não fazer** (refutados — evitar trabalho inventado): endpoint POST p/ `affiliate_configs`, mover `fetchAffiliateById` p/ o servidor, allowlist obrigatória de proxy/redirect, validação de senha/e-mail server-side, hash de doc IDs.
