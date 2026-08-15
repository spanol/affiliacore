# Onboarding + avisos de configuração faltante — mapeamento (2026-08-15)

Mapa da pendência "componente walkthrough de onboarding + avisos sistemáticos sobre
configurações faltantes". Duas varreduras completas do repo (padrões de aviso existentes;
inventário de configurações faltáveis) sintetizadas em: o que já existe, onde estão os
gaps, e a arquitetura proposta. Nada daqui está implementado ainda.

---

## 1 · O que JÁ existe (reaproveitável)

### Canais de aviso, do mais leve ao mais pesado
| canal | onde | características |
|---|---|---|
| Toast | `src/contexts/ToastContext.tsx:10` | `push({type, message})`, efêmero (4s), sem CTA |
| Banner âmbar inline | ~25 ocorrências; o molde completo (ícone + explicação + `<Link>` de correção) é `RegistrationRequests.tsx:185` | padrão visual consolidado `bg-amber-50 dark:bg-amber-950/20` + `AlertTriangle` |
| Chips-filtro agregados | `AffiliatesList.tsx:581,596` ("N sem configuração" / "N sem acesso") | **o proto-aviso-sistemático que já existe**: contagem + clique vira filtro |
| Sino + badge | `NotificationBell.tsx:21` (funde `notices` + `user_notifications`) | visto por `localStorage` `boost_notices_seen_${uid}` |
| Página /avisos | `src/pages/Avisos.tsx` | mural persistente, admin faz CRUD |
| Popup bloqueante | `DirectMessagePopup.tsx:16` (coleção `direct_messages`) | modal full-screen com ACK no servidor; o cron do ranking já usa **id determinístico idempotente** (`server.ts:2463`, `ranking-reminder__{date}__{uid}`) = padrão pronto de "servidor detecta condição → popup 1×/dia" |
| Banner global flutuante | `UpdateBanner.tsx:14` (portal, bottom-center) | receita portal + motion + condição derivada de snapshot |

### Gating / proto-onboarding (moldes p/ o walkthrough)
- `ProtectedRoute` (`App.tsx:52`) já encadeia 5 portões. Dois moldes prontos:
  `mustChangePassword` = **redirect forçado até resolver** (`App.tsx:78`); `mfaPending` =
  **tela cheia substitutiva** (`App.tsx:71`, `TwoFactorChallenge`).
- Primeira tela por papel: `DashboardRedirect` (`App.tsx:272`) + `clientHome` (`App.tsx:47`).
- Fluxo de convite (`InviteAccept.tsx`) e auto-cadastro gated (`Register.tsx:174`).
- **Não existe** gating por configuração incompleta nem flag de primeira visita.

### Primitivos p/ construir o tour (sem lib nova)
- **Nenhuma lib de tour/popover no package.json** (sem joyride/driver/shepherd/floating-ui/radix).
- Disponível: `createPortal` + `motion`/`AnimatePresence` (receitas em `UpdateBanner` e
  `DirectMessagePopup`), `InfoTooltip.tsx` (único balão; CSS hover/focus, sem posicionamento
  dinâmico), padrão "painel ancorado + backdrop" do sino (`NotificationBell.tsx:98-131`).
- `menuItems` (`DashboardLayout.tsx:117-208`) é a fonte única da navegação por papel — a
  lista de âncoras candidatas do tour já está calculada.
- Segmentação: `useAuth().profile` expõe `role`/`isSpecial`/`affiliateId`;
  `OTG_ENABLED`/`MARKETPLACE_ENABLED` segmentam por instância.

### Persistência de "já vi / dispensei"
- `users/{uid}`: a rule **já permite campo novo self-service** (`firestore.rules:47-56` trava
  só `role`/`affiliateId`/`isSpecial`/`phoneVerified*`) e o valor chega em tempo real pelo
  `onSnapshot` do `AuthContext` — zero mudança de servidor/rules p/ `onboarding: {seenAt, version}`.
- Precedente localStorage por uid: `boost_notices_seen_${uid}` (`NotificationBell.tsx:14`).

### Detectores puros já prontos (e quem os consome hoje)
| detector | arquivo | consumo atual |
|---|---|---|
| `rateStatus` (ausência ≠ R$0) | `commission.ts:73` | badges no ClientDashboard e AffiliateDetails |
| `needsConfig`/`needsAccess` | `AffiliatesList.tsx:85-95` | chips-filtro (só nessa tela) |
| `hasConfiguredRate`, `groupDropsByReason`, `anomalies` | `network.ts` | painel "Pontos de atenção" do /rede |
| `resolveConnectorSettings().configured` | `integrations.ts:249` | chips em /integracoes + modal de /casas |
| `houseResultsMode` (3 modos) | `integrations.ts:297` | seletor do modal de casas |
| `housesMissingIss` | `tax.ts:106` | **⚠ ZERO call-sites** (implementada e nunca chamada) |
| `SUPPORT_CONTACT_EMPTY` | `supportContact.ts` | sidebar (some em silêncio) |
| `describeFreshness` | `freshness.ts` | `DataFreshness` (informativo, não alerta) |

---

## 2 · Inventário: configurações faltáveis × aviso existente

Legenda: ✅ já avisa · 🟡 avisa parcialmente/só no momento do erro · ❌ falha em silêncio.

### Por afiliado
| condição | detecção | consequência | aviso |
|---|---|---|---|
| CPA/REV de topo não configurado | `rateStatus` | repasse R$ 0 mudo | ✅ (REV sem selo no AffiliateDetails) |
| Doc de config inexistente | `needsConfig` | 0/0 mascarado | ✅ chip no /affiliates |
| Taxa 0 deliberada vs engano | doc existe + valor 0 | upline a custo R$ 0 elegível na rede | ❌ |
| Override `byBrand` ausente | `config.byBrand?.[brandId]` | **fallback silencioso p/ taxa de topo** (contrato por casa errado) | ❌ |
| Mirror sem login (`users`) | `needsAccess` | não loga, não recebe notificação nem popup (batch pula) | ✅ chip/badge |
| Login sem `affiliateId` | rotas devolvem vazio/403 | preso no /profile, dashboards vazios | 🟡 |
| **Especial ativo sem `users.isSpecial`** (bug conhecido) | cruzar `special_affiliates` × `users` | especial não vê /network; catch engole permission-denied | ❌ (só o script offline `scripts/fix/fix-special-flag.mjs`) |
| Especial `fromNetwork` sem uplines | `resolveSpecialSubIds` vazio | gerente não vê ninguém | ✅ no modal |
| Upline sem taxa / drops da árvore | `groupDropsByReason` | rede desaparece, lucro inflado | ✅ /rede |
| Topo de estrutura sem config | `buildRootConfigMap` pula o nó | custo da agência por baixo | ❌ |
| **Convite pendente/expirado** | `invites/{token}` (TTL 7d) | expira em silêncio; **não existe rota de LISTAGEM de invites** | ❌ |
| E-mail alias faltando (casa manual) | `unresolved[]`/`pending` do import | linha não importada, resultado não atribuído | 🟡 só no momento do import |
| ISS da casa ausente | `housesMissingIss` | **regra OPOSTA à de comissão**: ausência = sem retenção; passivo fiscal | ❌ função pronta sem call-site |
| PIX ausente | `!profile?.pixKey` | saque 400 | ✅ na hora do saque |

### Por casa / integração
| condição | detecção | consequência | aviso |
|---|---|---|---|
| Casa sem régua `defaultCpa`/`defaultRev` | campos null | planilha sem coluna comissão → comissão R$ 0 e lucro negativo | ❌ |
| Casa manual sem conector | `houseResultsMode()==='manual'` | pull não roda (só upload) | 🟡 implícito (botão some) |
| Integração sem chave / desligada | `configured()` | pulls 503, cron grava nada | ✅ chips |
| **Vínculo casa↔integração meio-escrito** | `houses.integration` XOR `integrations.houseId` | tela diz "ligada" e o botão da casa não aparece | ❌ (só aviso de transferência no modal) |
| Conector aponta p/ casa inexistente | `houseSnap.exists===false` | pull 404 a cada rodada | ❌ proativo |
| `cpaCurrency` nunca declarado | ausente = EUR | casa BRL lida como euro | 🟡 |
| `revInProfit:false` sem régua CPA | `houseCpaCommissionForRow` | parcela R$ 0 | ❌ |
| Casa `otg` em instância OTG-free | `dataSource:'otg'` + `!OTG_ENABLED` | casa sem fonte nenhuma | ❌ |

### Por instância / operador
| condição | detecção | consequência | aviso |
|---|---|---|---|
| `RANKING_CRON_SECRET` ausente | rota 503 | ranking só manual | 🟡 (503; nenhuma tela mostra) |
| **Cloud Scheduler não roda** (ranking/pulls/analytics) | proxy: `daily_rankings/{ontem}` inexistente; `lastResultsCheckAt` velho | dados congelam; o próprio lembrete depende do cron | ❌ (nenhum check "não bateu ontem") |
| `VITE_BRAND_*` ausentes | fallback AffiliaCore | marca errada na label | ❌ (deliberado mas mudo) |
| Par de logos light/dark incompleto | par ignorado | `invert` no escuro | ❌ |
| SMS `'true'` sem credencial | modo `console` | **OTP vai pro log do servidor, parece funcionando** | ❌ (`/api/phone/status` não expõe o `mode`) |
| `FIREBASE_WEBAPP_CONFIG` ausente | fallback | **builda apontando pro projeto do Carlos** | ❌ |
| `LEONBET_*` fora do `.env.example`/apphosting | gap de doc | operador não tem de onde saber | ❌ |
| Token de device do dash OTG (TTL ~8h) | expira sozinho | funil congela | ❌ |
| Contato de suporte não configurado | `SUPPORT_CONTACT_EMPTY` | item some da sidebar sem avisar o admin | ❌ |
| Vitrine `enabled` com descrição vazia | estado válido e silencioso | card sem apresentação na LP | ❌ |
| Placas/prêmios sem cadastro | coleções vazias | roadmap vazio p/ afiliado | ✅ empty states |
| Rules × código dessincronizados | predeploy hook | incidente 2026-07-30 | ✅ (só no deploy, não em runtime) |

### Health
**Não existe** endpoint de health/status/diagnóstico. Os agregadores mais próximos:
`GET /api/houses` (deriva `pullAvailable` mas não o motivo), `GET /api/integrations`
(espelho do outro lado do vínculo, sem cruzar), `GET /api/registration-requests`
(`buildCaptureFeed` = o padrão de agregação server-side a copiar). Dados **sem leitor
nenhum** hoje: `invites`, cruzamento isSpecial, cruzamento casa↔integração,
`housesMissingIss`, estado do Scheduler, `keyFromEnv`/bucket/webapp-config.

---

## 3 · Arquitetura proposta

### A · Núcleo puro: `src/lib/setupChecks.ts`
Motor de checks no padrão da casa (puro, testável, importável pelo server):
```ts
interface SetupCheck {
  id: string;                       // 'affiliate-sem-taxa', 'casa-sem-iss', ...
  scope: 'affiliate'|'house'|'integration'|'instance';
  severity: 'critical'|'warning'|'info';
  audience: 'admin'|'client'|'special';
  fixRoute: string;                 // '/affiliates?filtro=sem-config'
}
interface SetupFinding { checkId; subjectId?; subjectName?; message; }
```
Reusa os detectores existentes (`rateStatus`, `housesMissingIss`, `needsConfig`,
`configured`, drops/anomalias da rede) em vez de reimplementar. Mensagens em pt-BR
**sem travessão no meio de frase** (regra de copy).

### B · Agregador server-side: `GET /api/setup-status` (requireAdmin)
Cruza o que o client não pode ler: `invites` vencidos (hoje sem rota de listagem),
`special_affiliates × users.isSpecial`, `houses.integration × integrations.houseId`,
frescor vs cron (`lastResultsCheckAt` velho; `daily_rankings/{ontem}` ausente),
ambiente (`keyFromEnv`, SMS `mode`, bucket, brand). Molde: `buildCaptureFeed`.
Sem expor segredo nenhum: só o achado, nunca o valor. Fase 2 pode ganhar variante
escopada pro especial (padrão "especial = master escopado").

### C · Entrega dos avisos (3 intensidades, todas com canal pronto)
1. **Card "Saúde da configuração" no /admin**: lista de findings com link de correção.
   Molde visual: banner de `RegistrationRequests.tsx:185`. Chips agregados por escopo
   (o padrão do /affiliates, promovido a global).
2. **Badge no sino**: findings viram itens no feed (via `user_notifications` geradas
   pelo agregador, dedupe por checkId+subjectId).
3. **Crítico → popup**: `direct_messages` com id determinístico (padrão
   `ranking-reminder__{date}__{uid}`), máx 1/dia por condição. Candidatos: cron parado,
   SMS em modo console, especial dessincronizado.

### D · Walkthrough: `OnboardingTour` (sem lib externa)
- Montado no `DashboardLayout` (só área autenticada, ao lado do `DirectMessagePopup`).
- Passos declarativos por papel + instância; âncoras via atributo `data-tour` nos itens
  de `menuItems` e nos cards-chave; posicionamento por `getBoundingClientRect` + portal +
  motion; overlay com spotlight; **mobile: bottom-sheet** (padrão do painel do sino).
- Persistência: `users/{uid}.onboarding = {seenAt, version}` (rule atual já permite;
  chega pelo snapshot do AuthContext). `version` permite reexibir quando o tour mudar.
  Entrada manual "Rever o tour" no menu do perfil.
- Trigger: primeiro acesso (perfil sem a flag) APÓS os portões existentes (2FA,
  mustChangePassword) — o tour entra DEPOIS do último portão do `ProtectedRoute`, nunca antes.
- Roteiros iniciais:
  - **Admin** (instância recém-provisionada): /casas → taxas em /affiliates → convites →
    /integracoes → /ranking (cron) → /settings (suporte + vitrine).
  - **Afiliado**: dashboard (cards de taxa) → /financeiro (PIX!) → /conquistas → /avisos.
  - **Especial**: /network → Meus afiliados (links da rede) → taxa de sub.
- Sinergia: o passo do tour pode LER o `setup-status` e virar checklist vivo
  ("2 de 5 pendências resolvidas") em vez de tour cego.

### E · Fases de entrega
1. **F1 ✅ ENTREGUE 15/08/2026**: `src/lib/setupChecks.ts` (motor puro, 8 checks,
   testes colocados) + `SetupHealthCard` no /admin (só renderiza com pendência;
   recebe roster/configs/especiais da página e busca users/casas/integrações
   sozinho). Checks: especiais dessincronizados (critical), afiliados sem taxa,
   ISS inconsistente, pull sem chave, vínculo casa↔conector pela metade, casa OTG
   órfã, casa manual sem régua, afiliados sem acesso. `housesMissingIss` ganhou o
   1º call-site; `fetchRegisteredUsers` passou a expor `isSpecial`. Verificado na
   demo emulada (claro+escuro, CTA navega). Zero mudança de servidor/rules.
2. **F2**: `GET /api/setup-status` com os cruzamentos server-only (invites, isSpecial,
   vínculo 1:1, cron/frescor, ambiente) + `user_notifications`/popup p/ críticos.
3. **F3**: `OnboardingTour` por papel, persistência em `users/{uid}`.
4. **F4**: tour-checklist integrado ao setup-status; variante escopada do especial.

### Invariantes a respeitar
- Dado sensível mediado pelo servidor; o agregador devolve achados, nunca valores de chave/PII.
- Ausência ≠ R$0 em toda mensagem de taxa (`rateStatus`, nunca `|| 0`).
- Copy sem travessão de IA; strings novas em pt-BR.
- Se alguma coleção nova fechar por rule: código PRIMEIRO, rules DEPOIS (predeploy hook).
- Lógica em `src/lib` com teste colocado; server importa só de `src/lib`.
