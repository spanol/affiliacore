import 'dotenv/config';
import { pluralize } from './src/lib/plural';
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import admin from 'firebase-admin';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderErrorPage } from './errorPage';
import { isBotUserAgent, appendSubid, clickStatDay } from './src/lib/tracking';
import { resolveIsSpecial, resolveServerToday, resolveServerYesterday, resolveScopedAffiliateIds, specialNetworkScope } from './src/lib/scope';
import { otgEnabled, marketplaceEnabled } from './src/lib/instance';
import { resolveBrand } from './src/lib/branding';
import { resolveStorageBucket } from './src/lib/firebaseConfig';
import { computeRankingEntries } from './src/lib/ranking';
import { expandAffiliateIdsParam } from './src/lib/affiliateIdsParam';
import { hrDocId, sanitizeMetrics } from './src/lib/houseResultsDoc';
import { makeBoostAffiliateId, normalizeEmailKey } from './src/lib/boostAffiliate';
import { normalizeTag, buildTagIndex } from './src/lib/houseTagImport';
import {
  buildMediaReportUrl, adaptEsportivaRows, toApiDateTo, ESPORTIVA_API_BASE,
} from './src/lib/esportivaPull';
import { buildPullPayload, pullWindow } from './src/lib/housePull';
import { buildStatisticsUrl, adaptLeonBetRows, LEONBET_API_BASE } from './src/lib/leonbetPull';
import {
  parseFomentoPostback, fomentoPostbackDocId, fomentoEventsToPullRows,
  FOMENTO_INTEGRATION_ID, type FomentoEventDoc,
} from './src/lib/fomentoPostback';
import {
  INTEGRATION_CATALOG, findIntegrationSpec, integrationFromDoc, resolveConnectorSettings,
  sanitizeIntegrationPatch, toPublicIntegration, numericSetting,
  type ConnectorSettings, type IntegrationDoc,
} from './src/lib/integrations';
import {
  houseCpaToBrl, resolveCpaCurrency, resolveFxMode, resolveFxRate, resolveMoneyCurrency,
  normalizeFxInput, parseEurBrlRate, parseFxRate,
  FALLBACK_EUR_BRL, FALLBACK_USD_BRL, type FxQuotes,
} from './src/lib/currency';
import { DEFAULT_BRANDS } from './src/lib/brand';
import { projectPartnerResults } from './src/lib/partnerResults';
import { pullApprovedRoster, isOtgLinksConfigured } from './otgLinksPull';
import { pullAnalytics, isOtgAnalyticsConfigured } from './otgAnalyticsPull';
import { analyticsDocId, funnelKey, sanitizeFunnel, hasFunnelActivity } from './src/lib/analyticsDoc';
import { buildVersionPayload, type AppVersion } from './src/lib/version';
import { sanitizePrize, sanitizePrizePatch } from './src/lib/prizes';
import { sanitizeTier, sanitizeTierPatch } from './src/lib/achievements';
import { sanitizeSupportContact, SUPPORT_CONTACT_EMPTY } from './src/lib/supportContact';
import { sanitizeShowcase, buildShowcasePayload } from './src/lib/showcase';
import { parseStandbyLinks, extractTagFromUrl } from './src/lib/linkTriage';
import { buildTaggedUrl, suggestTag, hasUnresolvedPlaceholder } from './src/lib/linkGeneration';
import { buildResultsNotification, type ResultsNotificationVariant } from './src/lib/resultsNotification';
import { normalizeDealInput, buildDealLabel, dealBrandKey, dealToBrandRates, dealFxSpec, buildDraftDealFromHouse } from './src/lib/deal';
import { canTransition, nextStatusAfterPricing, isActivePartnership, selectCurrentPartnerships, PARTNERSHIP_STATUS_LABEL, type PartnershipStatus } from './src/lib/partnership';
import {
  resolveDealType, dealPolicy, effectivePricedBy, sanitizeDealsForViewer, type DealTypeId,
} from './src/lib/dealType';
import { normalizeLegalDocInput, computeNextVersion } from './src/lib/legal';
import { canTransitionWithdrawal, normalizeWithdrawalAmount, type WithdrawalStatus } from './src/lib/withdrawal';
import { buildNetworkTree, resolveRepasseCap, exceedsRepasseCap, hasConfiguredRate } from './src/lib/network';
import { scheduleRateChange, brandRateEntry, isRateConfigured, type BrandRateEntry } from './src/lib/rateHistory';
import { num } from './src/lib/commission';
import {
  isPendingSignup, signupToRequest, leadToRequest, referralToRequest, buildCaptureFeed, resolveRequestStatus,
} from './src/lib/registrationRequests';
import { resolveSpecialSubIds, resolveDirectSubIds, isDirectDownline, resolveDirectUpline, type SpecialRecord } from './src/lib/specialNetwork';
import {
  NETWORK_INVITE_KIND, isNetworkInvite, networkInviteBlock, sanitizeRecruitName, recruitNameError,
} from './src/lib/networkInvite';
import {
  BACKUP_CODE_COUNT,
  buildOtpauthUrl,
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  verifyTotp,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
} from './src/lib/totp';
import {
  buildMfaDisabledClaims,
  buildMfaVerifiedClaims,
  mergeCustomClaims,
  mfaSatisfied,
  MFA_REQUIRED_CODE,
} from './src/lib/mfaSession';
import {
  normalizeBrPhone,
  phoneDocId,
  maskPhoneForLog,
  generateOtpCode,
  generateVerificationToken,
  hashVerificationToken,
  evaluateOtpAttempt,
  canSendOtp,
  buildChallenge,
  verificationTokenValid,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  VERIFICATION_TOKEN_TTL_MS,
  type PhoneChallenge,
} from './src/lib/phoneVerification';
import {
  resolvePhoneVerificationSetup,
  buildSmsProvider,
  buildOtpSmsBody,
  type SmsProvider,
  type PhoneVerificationSetup,
} from './src/lib/smsProvider';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Bucket do Storage (logos das casas), resolvido do AMBIENTE da própria instância
// (override → configs do App Hosting → service account). O default antigo cravava
// 'agencia-boost-app' (instância 0): instância nova sem a env tentava gravar a logo
// no bucket de OUTRO cliente. `null` = instância sem Storage — não é erro; o
// uploadHouseLogo cai no fallback inline (data URL no doc da casa).
const STORAGE_BUCKET = resolveStorageBucket(process.env);

// Inicializa o Firebase Admin (idempotente). Fica DENTRO de uma função — antes era um
// side-effect no topo do módulo — p/ que importar este arquivo nos testes (só para
// pegar `createApp`) não tente ADC/credenciais nem polua o console. Chamado por startServer().
function initAdmin(): { adminApp: admin.app.App | null; adminDb: admin.firestore.Firestore | null } {
  try {
    let adminApp: admin.app.App;
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
    if (rawServiceAccount) {
      try {
        const serviceAccount = JSON.parse(rawServiceAccount);
        adminApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket: STORAGE_BUCKET ?? undefined });
      } catch {
        // Em App Hosting/Cloud Run o ADC do runtime costuma bastar para acessar os
        // recursos do PRÓPRIO projeto. Se a env existir só como placeholder/override
        // (ex.: 'unused' em instâncias white-label), caímos para ADC em vez de matar
        // a inicialização inteira.
        adminApp = admin.initializeApp({ storageBucket: STORAGE_BUCKET ?? undefined });
      }
    } else {
      adminApp = admin.initializeApp({ storageBucket: STORAGE_BUCKET ?? undefined });
    }
    console.log('Firebase Admin initialized');
    return { adminApp, adminDb: adminApp.firestore() };
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error);
    return { adminApp: null, adminDb: null };
  }
}

// Dependências injetáveis. Produção passa o Admin SDK real + o fetch global; os testes
// (supertest) passam mocks de Firestore/verifyIdToken (via adminApp.auth())/fetch p/
// exercitar o ESCOPO e a AUTORIZAÇÃO das rotas sem rede nem Firebase real (R4/R13/R16/R20/R25).
export interface ServerDeps {
  adminApp: admin.app.App | null;
  adminDb: admin.firestore.Firestore | null;
  fetchImpl?: typeof fetch;
  /**
   * Override do provedor de SMS (verificação de telefone). Produção deixa vazio
   * (resolvido por env via resolvePhoneVerificationSetup); os testes injetam um
   * provedor que captura o corpo do SMS em vez de enviar.
   */
  smsProvider?: SmsProvider;
}

// Monta o app Express (middlewares + rotas) SEM ouvir porta nem montar Vite/estático —
// isso fica no startServer(), específico de ambiente. Tudo o que as rotas usam
// (adminApp/adminDb/fetch) vem de `deps`, deixando o app testável de fora via supertest.
export function createApp(deps: ServerDeps) {
  const { adminApp, adminDb } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const app = express();

  // SECURITY (LOW): cabeçalhos de segurança. CSP fica desligada aqui porque exige
  // uma allowlist própria (Tailwind/Vite, Firebase, recharts, avatares dicebear) e
  // precisa ser testada — fica como follow-up; os demais headers (nosniff,
  // Referrer-Policy, HSTS, etc.) já entram. COEP off p/ não bloquear recursos
  // cross-origin legítimos (avatares, storage).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  // O backoffice de casas envia a logo (base64) e o import de resultados (planilha)
  // no corpo — precisam de um teto maior. Parser dedicado ANTES do global (escopado
  // nesses paths): o global de 32kb vira no-op p/ eles (express.json não re-parseia
  // req._body). Demais rotas seguem no limite apertado.
  app.use(['/api/houses', '/api/house-results'], express.json({ limit: '4mb' }));

  // SECURITY (LOW): limite explícito do corpo JSON (evita payloads gigantes).
  app.use(express.json({ limit: '32kb' }));

  // SECURITY (MEDIUM-2): rate limit nas rotas PÚBLICAS de auth (criam/leem contas
  // e convites). Sem isso, dá pra martelar /api/accept-invite (cria usuários reais)
  // e enumerar e-mails. App.set('trust proxy', 1) p/ a chave por IP funcionar atrás
  // do Cloud Run/App Hosting.
  app.set('trust proxy', 1);
  const publicAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
  });

  // --- Auth middlewares -----------------------------------------------------
  // Clients send their Firebase ID token as `Authorization: Bearer <token>`.
  const verifyBearer = async (req: express.Request) => {
    if (!adminApp) return null;
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer (.+)$/);
    if (!match) return null;
    try {
      return await adminApp.auth().verifyIdToken(match[1]);
    } catch {
      return null;
    }
  };

  // Gate do 2FA (TOTP próprio). O `signInWithEmailAndPassword` CONCLUI sozinho — a
  // senha sozinha já rende um ID token válido —, então quem barra a sessão que ainda
  // não digitou o código é o servidor, aqui, para TODA rota autenticada. A regra mora
  // em src/lib/mfaSession (mesma que o client usa p/ mostrar o desafio). Fail-closed.
  const denyMfaPending = (decoded: any, res: express.Response): boolean => {
    if (mfaSatisfied(decoded)) return false;
    res.status(403).json({ error: 'Confirme o código do autenticador para continuar.', code: MFA_REQUIRED_CODE });
    return true;
  };

  // `enforceMfa: false` existe SÓ p/ as rotas do próprio 2FA (status/verificar): é
  // justamente nelas que a sessão ainda não passou pelo segundo fator. Qualquer outra
  // rota usa `requireAuth`.
  const buildRequireAuth = (enforceMfa: boolean): express.RequestHandler => async (req, res, next) => {
    if (!adminApp || !adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    const decoded = await verifyBearer(req);
    if (!decoded) return res.status(401).json({ error: 'Não autenticado.' });
    if (enforceMfa && denyMfaPending(decoded, res)) return;

    let role: string | null = null;
    let affiliateId: string | null = null;
    try {
      const snap = await adminDb.collection('users').doc(decoded.uid).get();
      if (snap.exists) {
        const data = snap.data();
        role = data?.role ?? null;
        affiliateId = data?.affiliateId ?? null;
      }
    } catch {
      // fall through with null role/affiliateId
    }

    (req as any).user = { uid: decoded.uid, email: decoded.email, role, affiliateId, claims: decoded };
    next();
  };

  const requireAuth = buildRequireAuth(true);
  const requireAuthPreMfa = buildRequireAuth(false);

  const requireAdmin: express.RequestHandler = async (req, res, next) => {
    if (!adminApp || !adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    const decoded = await verifyBearer(req);
    if (!decoded) return res.status(401).json({ error: 'Não autenticado.' });
    if (denyMfaPending(decoded, res)) return;
    let name: string | null = null;
    try {
      const snap = await adminDb.collection('users').doc(decoded.uid).get();
      if (!snap.exists || snap.data()?.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso restrito a administradores.' });
      }
      // Nome do admin p/ carimbar o autor nos logs de auditoria (não-forjável: vem
      // do users/{uid} resolvido pelo token, nunca do corpo do request).
      name = snap.data()?.name ?? snap.data()?.displayName ?? null;
    } catch {
      return res.status(500).json({ error: 'Erro ao verificar permissões.' });
    }
    (req as any).user = { uid: decoded.uid, email: decoded.email, name, claims: decoded };
    next();
  };

  // --- P2 (produtização): integração OTG como módulo por instância ----------
  // VITE_OTG_ENABLED='false' → instância OTG-free (white-label): as rotas OTG
  // (proxy externo, sync, pending-affiliates, analytics) respondem 503 e o ranking
  // pula a paginação OTG (fica só com as casas manuais). Ausente/qualquer outro
  // valor → ligada (a instância atual não muda nada). Fonte única: src/lib/instance.
  const OTG_ENABLED = otgEnabled(process.env.VITE_OTG_ENABLED);

  // P3 (produtização): marca da instância nas strings geradas pelo servidor
  // (remetentes de mensagem/lembrete). Mesma fonte única do client: lib/branding.
  const BRAND = resolveBrand(process.env);
  const requireOtg: express.RequestHandler = (_req, res, next) => {
    if (!OTG_ENABLED) {
      return res.status(503).json({ error: 'Integração OTG desativada nesta instância.', code: 'OTG_DISABLED' });
    }
    next();
  };

  // Marketplace de acordos/parcerias (P2/P3): módulo opt-in por instância (default
  // OFF). Na Boost/instância nº 0 as rotas /api/deals e /api/partnerships respondem
  // 404 (feature inexistente) — zero side effect. Liga com VITE_MARKETPLACE_ENABLED.
  const MARKETPLACE_ENABLED = marketplaceEnabled(process.env.VITE_MARKETPLACE_ENABLED);
  // --- Escrita de taxa COM VIGÊNCIA (fonte única) ---------------------------
  // Toda gravação de comissão passa por aqui, nas 4 portas que existem (admin no
  // /admin, especial no sub-config, gerente na precificação, aprovação de parceria).
  // Sem uma porta só, uma delas sobrescreveria a taxa e reprecificaria o histórico
  // enquanto as outras respeitam a vigência — divergência silenciosa, do tipo que
  // só aparece no extrato do afiliado. Ver PLANO-COMISSAO-VIGENCIA.md.
  //
  // Devolve a ENTRADA nova (taxa atual + since + history) pronta p/ merge. Como
  // `history` é array, o merge do Firestore o substitui inteiro, que é o desejado.
  const withRateHistory = (
    before: BrandRateEntry | null | undefined,
    next: { cpaValue?: number; revPercentage?: number },
  ): BrandRateEntry => scheduleRateChange(before, next, resolveServerToday());

  // A entrada atual de uma casa (ou do topo, quando brandKey é null) dentro de um
  // doc de affiliate_configs cru. Espelha a precedência de `resolveBrandRates`.
  const currentRateEntry = (cfg: any, brandKey: string | null): BrandRateEntry | null =>
    brandKey ? (cfg?.byBrand?.[brandKey] ?? null) : brandRateEntry(cfg);

  const requireMarketplace: express.RequestHandler = (_req, res, next) => {
    if (!MARKETPLACE_ENABLED) {
      return res.status(404).json({ error: 'Módulo de marketplace desativado nesta instância.', code: 'MARKETPLACE_DISABLED' });
    }
    next();
  };

  // Tipo de deal padrão da instância. Só decide o que é criado SEM humano escolhendo
  // (o rascunho que nasce junto com a casa) e o pré-marcado do radio em /acordos —
  // o tipo real vive em cada deal. Ausente/desconhecido = 'direto', então instância
  // que nunca ouviu falar disso não muda de comportamento. Ver src/lib/dealType.ts.
  const DEAL_TYPE_DEFAULT: DealTypeId = resolveDealType(process.env.VITE_DEAL_TYPE_DEFAULT);

  // --- Auditoria (server-authoritative) -------------------------------------
  // Cada mutação de admin grava em `audit_logs`: QUEM (autor carimbado pelo token,
  // nunca pelo cliente), O QUÊ (entidade + ação) e, quando faz sentido, o antes→depois
  // (`changes`) + `metadata`. A coleção é APPEND-ONLY nas rules (cliente não escreve/
  // edita/apaga) — o log é a fonte de verdade da trilha. NUNCA quebra a ação principal:
  // falha ao gravar só vai ao console. [[boost-audit-trail]]
  type AuditChange = { field: string; before: unknown; after: unknown };
  interface AuditFields {
    entityType: string;            // 'affiliate' | 'house' | 'affiliate_config' | 'user' | ...
    entityId?: string | null;      // id da entidade (affiliateId, slug, uid, token…)
    entityLabel?: string | null;   // nome no momento (snapshot) p/ exibir sem join
    action: string;                // 'affiliate.deactivate' | 'house.create' | 'config.update' | ...
    changes?: AuditChange[] | null;
    metadata?: Record<string, unknown> | null;
    reason?: string | null;
  }
  function auditEntry(req: express.Request, f: AuditFields) {
    const u = (req as any).user || {};
    const entityId = f.entityId != null ? String(f.entityId) : null;
    return {
      entityType: String(f.entityType),
      entityId,
      entityLabel: f.entityLabel ?? null,
      action: String(f.action),
      actorId: u.uid ?? null,
      actorName: u.name ?? null,
      actorEmail: u.email ?? null,
      changes: f.changes ?? null,
      metadata: f.metadata ?? null,
      reason: f.reason ?? null,
      // Espelho do id p/ a tabela legada (Settings lê `log.affiliateId`) seguir
      // funcionando até a UI nova de /auditoria entrar (Fase 5).
      affiliateId: f.entityType === 'affiliate' ? entityId : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
  }
  // Grava um log de forma autônoma (best-effort). Use quando a mutação não está num batch.
  async function writeAuditLog(req: express.Request, f: AuditFields): Promise<void> {
    if (!adminDb) return;
    try {
      await adminDb.collection('audit_logs').add(auditEntry(req, f));
    } catch (e) {
      console.error('[audit] falha ao gravar log:', e);
    }
  }
  // Anexa o log ao MESMO WriteBatch da mutação (atômico). Use em rotas que já batcham
  // (ex.: import de resultados via commitChunked).
  function appendAuditLog(batch: admin.firestore.WriteBatch, req: express.Request, f: AuditFields): void {
    if (!adminDb) return;
    batch.set(adminDb.collection('audit_logs').doc(), auditEntry(req, f));
  }
  // Diff antes→depois dos campos que de fato mudaram (compara por valor serializado).
  function diffChanges(before: Record<string, unknown> | undefined, patch: Record<string, unknown>, fields: string[]): AuditChange[] {
    const changes: AuditChange[] = [];
    for (const field of fields) {
      if (!(field in patch)) continue;
      const b = before?.[field] ?? null;
      const a = patch[field] ?? null;
      if (JSON.stringify(b) !== JSON.stringify(a)) changes.push({ field, before: b, after: a });
    }
    return changes;
  }
  // Nome do afiliado no mirror `affiliates` (best-effort) p/ o entityLabel do audit —
  // snapshot do nome no momento da ação, exibido sem join na /auditoria.
  async function affiliateNameOf(affiliateId: string): Promise<string | null> {
    if (!adminDb) return null;
    try {
      const snap = await adminDb.collection('affiliates').doc(affiliateId).get();
      return snap.exists ? ((snap.data() as any)?.name ?? null) : null;
    } catch {
      return null;
    }
  }

  // Notificação "novos resultados" (decisão do produto): variante de CONTAGENS ativa;
  // 'money' (R$) fica pronta mas só liga via env RESULTS_NOTIFICATION_VARIANT=money.
  const RESULTS_NOTIF_VARIANT: ResultsNotificationVariant =
    process.env.RESULTS_NOTIFICATION_VARIANT === 'money' ? 'money' : 'counts';

  type ResultMetricsAgg = { registrations: number; first_deposits: number; qualified_cpa: number; total_commission: number };
  // Cria as notificações "novos resultados" (user_notifications) p/ cada afiliado
  // ATRIBUÍDO no upload. Resolve os logins vinculados (users.affiliateId) — afiliado
  // sem login Boost não recebe (ninguém p/ notificar). Best-effort; devolve quantos
  // docs criou (um afiliado pode ter >1 login). 1 notificação por afiliado por upload.
  async function notifyAffiliatesOfResults(
    houseSlug: string,
    houseName: string,
    byAff: Map<string, ResultMetricsAgg>,
  ): Promise<number> {
    if (!adminDb || byAff.size === 0) return 0;
    const batch = adminDb.batch();
    let created = 0;
    for (const [affiliateId, m] of byAff) {
      const usersSnap = await adminDb.collection('users').where('affiliateId', '==', affiliateId).get();
      if (usersSnap.empty) continue;
      const { title, body } = buildResultsNotification(houseName, m, RESULTS_NOTIF_VARIANT);
      usersSnap.forEach((u) => {
        const ref = adminDb!.collection('user_notifications').doc();
        batch.set(ref, {
          recipientUid: u.id,
          affiliateId,
          type: 'results_updated',
          houseSlug,
          houseName,
          title,
          body,
          readAt: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        created++;
      });
    }
    if (created > 0) await batch.commit();
    return created;
  }

  // --- Partner auth (M2M) ---------------------------------------------------
  // Um parceiro externo NÃO é usuário logado (sem Firebase JWT). Ele se autentica
  // com uma API key emitida pela PRÓPRIA Boost (≠ x-api-key da OTG), enviada no
  // header `x-boost-api-key`. Guardamos só o HASH (sha-256) em `api_partners`
  // (server-only) — a key crua é mostrada uma vez na emissão (scripts/partners).
  // `scopes` limita o que cada parceiro pode ler ('*' = tudo). Read-only por ora.
  const hashApiKey = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

  // Rate-limit por key (cai no IP como fallback). Generoso p/ integração server-to-server.
  const partnerLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    // Bucket por API key; sem key, cai no IP NORMALIZADO (ipKeyGenerator mascara
    // o IPv6 num /56 — senão um usuário IPv6 trocaria de IP e burlaria o limite).
    keyGenerator: (req) => String(req.headers['x-boost-api-key'] || ipKeyGenerator(String(req.ip || ''))),
    message: { error: 'Limite de requisições excedido. Aguarde um instante.' },
  });

  const requirePartner: express.RequestHandler = async (req, res, next) => {
    if (!adminApp || !adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    const raw = String(req.headers['x-boost-api-key'] || '').trim();
    if (!raw) return res.status(401).json({ error: 'API key ausente. Envie o header x-boost-api-key.' });
    try {
      const snap = await adminDb
        .collection('api_partners')
        .where('keyHash', '==', hashApiKey(raw))
        .limit(1)
        .get();
      if (snap.empty) return res.status(401).json({ error: 'API key inválida.' });
      const doc = snap.docs[0];
      const data = doc.data() as any;
      if (data.active === false) return res.status(403).json({ error: 'API key desativada.' });
      const scopes: string[] = Array.isArray(data.scopes) ? data.scopes.map(String) : [];
      (req as any).partner = { id: doc.id, name: data.name ?? null, scopes };
      // best-effort: marca último uso (não bloqueia a resposta)
      doc.ref.set({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
      next();
    } catch (error) {
      console.error('Erro ao validar API key de parceiro:', error);
      return res.status(500).json({ error: 'Erro ao validar credenciais.' });
    }
  };

  // Exige um scope específico (ou '*') no parceiro autenticado.
  const requireScope = (scope: string): express.RequestHandler => (req, res, next) => {
    const scopes: string[] = (req as any).partner?.scopes ?? [];
    if (scopes.includes('*') || scopes.includes(scope)) return next();
    return res.status(403).json({ error: `Sua chave não tem acesso a "${scope}".` });
  };
  // --------------------------------------------------------------------------

  const serializeTimestamp = (value: any) => {
    if (value?.toDate && typeof value.toDate === 'function') {
      return value.toDate().toISOString();
    }
    return value ?? null;
  };

  // --- 2FA · TOTP próprio (app autenticador) --------------------------------
  // Substitui o Firebase Multi-Factor (Identity Platform), que exigia upgrade pago
  // do projeto por instância white-label. Aqui o segredo é nosso: fica em
  // `auth_totp/{uid}`, coleção server-only nas rules (`read, write: if false` — nem
  // o admin lê pelo SDK do cliente). Só o Admin SDK toca.
  //
  // Doc: { enabled, secret, pendingSecret, pendingAt, lastCounter, backupCodes[] }
  //   • `secret`      — base32, o mesmo do QR;
  //   • `lastCounter` — passo de 30s do último código aceito → o MESMO código não
  //                     vale duas vezes (anti-replay dentro da janela);
  //   • `backupCodes` — só HASHES sha-256; o código em claro é mostrado uma vez.
  //
  // O enforcement da sessão é o gate em buildRequireAuth (claims + mfaSession.ts).
  const TOTP_PENDING_TTL_MS = 15 * 60 * 1000;
  const totpDoc = (uid: string) => adminDb!.collection('auth_totp').doc(uid);

  const readTotpDoc = async (uid: string) => {
    const snap = await totpDoc(uid).get();
    const data = (snap.exists ? snap.data() : null) as any;
    return {
      enabled: data?.enabled === true,
      secret: typeof data?.secret === 'string' ? data.secret : null,
      pendingSecret: typeof data?.pendingSecret === 'string' ? data.pendingSecret : null,
      pendingAt: typeof data?.pendingAt === 'number' ? data.pendingAt : null,
      lastCounter: typeof data?.lastCounter === 'number' ? data.lastCounter : null,
      backupCodes: Array.isArray(data?.backupCodes) ? data.backupCodes.map(String) : [],
    };
  };

  // `setCustomUserClaims` SOBRESCREVE o objeto inteiro — sempre por cima das atuais.
  const patchCustomClaims = async (uid: string, patch: Record<string, unknown>) => {
    const current = await adminApp!.auth().getUser(uid);
    await adminApp!.auth().setCustomUserClaims(uid, mergeCustomClaims(current?.customClaims as any, patch));
  };

  // Rate limit APERTADO: cada request aqui é uma tentativa de adivinhar 6 dígitos.
  // Bucket por uid (o caller já está autenticado); IP normalizado como fallback.
  const totpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String((req as any).user?.uid || ipKeyGenerator(String(req.ip || ''))),
    message: { error: 'Muitas tentativas de código. Aguarde alguns minutos.' },
  });

  // Estado do 2FA da própria conta. PRÉ-MFA de propósito: é o que o Login consulta
  // logo após a senha, quando a sessão ainda não passou pelo segundo fator.
  app.get('/api/auth/totp/status', requireAuthPreMfa, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const { uid, claims } = (req as any).user;
      const doc = await readTotpDoc(uid);
      res.json({
        enabled: doc.enabled,
        verified: mfaSatisfied(claims),
        backupCodesRemaining: doc.enabled ? doc.backupCodes.length : 0,
      });
    } catch (error) {
      console.error('Erro ao ler status do 2FA:', error);
      res.status(500).json({ error: 'Erro ao consultar o 2FA.' });
    }
  });

  // Passo 1 do enrollment: gera o segredo PENDENTE (nada é ligado ainda) e devolve a
  // otpauth:// p/ o QR. O client desenha o QR — a URL nunca precisa virar imagem aqui.
  app.post('/api/auth/totp/setup', requireAuth, totpLimiter, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const { uid, email } = (req as any).user;
      const doc = await readTotpDoc(uid);
      if (doc.enabled) {
        return res.status(409).json({ error: 'O 2FA já está ativo. Desative antes de configurar de novo.' });
      }
      const secret = generateTotpSecret();
      await totpDoc(uid).set(
        { enabled: false, pendingSecret: secret, pendingAt: Date.now(), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
      res.json({
        secretKey: secret,
        otpauthUrl: buildOtpauthUrl({ secret, account: String(email || uid), issuer: BRAND.shortName }),
        digits: TOTP_DIGITS,
        periodSeconds: TOTP_PERIOD_SECONDS,
      });
    } catch (error) {
      console.error('Erro ao iniciar o 2FA:', error);
      res.status(500).json({ error: 'Erro ao iniciar a configuração do 2FA.' });
    }
  });

  // Passo 2: o código do app prova que o segredo foi guardado → liga o 2FA, emite os
  // códigos de backup (mostrados UMA vez) e já marca ESTA sessão como verificada
  // (senão o usuário se auto-expulsaria ao ativar).
  app.post('/api/auth/totp/activate', requireAuth, totpLimiter, async (req, res) => {
    if (!adminDb || !adminApp) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const { uid, claims } = (req as any).user;
      const doc = await readTotpDoc(uid);
      if (doc.enabled) return res.status(409).json({ error: 'O 2FA já está ativo.' });
      if (!doc.pendingSecret || !doc.pendingAt || Date.now() - doc.pendingAt > TOTP_PENDING_TTL_MS) {
        return res.status(400).json({ error: 'Configuração expirada. Gere um novo QR code.', code: 'TOTP_SETUP_EXPIRED' });
      }

      const matched = verifyTotp(doc.pendingSecret, req.body?.code, { atMs: Date.now() });
      if (matched === null) {
        return res.status(400).json({ error: 'Código inválido. Confira o autenticador e tente novamente.', code: 'TOTP_INVALID_CODE' });
      }

      const backupCodes = generateBackupCodes();
      await totpDoc(uid).set(
        {
          enabled: true,
          secret: doc.pendingSecret,
          pendingSecret: null,
          pendingAt: null,
          lastCounter: matched,
          backupCodes: backupCodes.map(hashBackupCode),
          enabledAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      try {
        await patchCustomClaims(uid, buildMfaVerifiedClaims(claims?.auth_time, Date.now()));
      } catch (claimError) {
        // Sem a claim o gate não enforça — não deixe o 2FA "meio ligado": desfaz.
        await totpDoc(uid).delete().catch(() => {});
        throw claimError;
      }

      await writeAuditLog(req, { entityType: 'user', entityId: uid, action: 'mfa.enable' });
      // `refreshToken: true` → o client PRECISA chamar getIdToken(true) p/ o token
      // novo carregar as claims; senão a próxima request ainda vem sem elas.
      res.json({ enabled: true, backupCodes, refreshToken: true });
    } catch (error) {
      console.error('Erro ao ativar o 2FA:', error);
      res.status(500).json({ error: 'Erro ao ativar o 2FA.' });
    }
  });

  // Segundo fator do LOGIN: aceita o código do app ou um código de backup (uso único).
  // Pré-MFA por definição — é esta rota que tira a sessão do estado pendente.
  app.post('/api/auth/totp/verify', requireAuthPreMfa, totpLimiter, async (req, res) => {
    if (!adminDb || !adminApp) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const { uid, claims } = (req as any).user;
      const doc = await readTotpDoc(uid);
      if (!doc.enabled || !doc.secret) {
        return res.status(400).json({ error: 'Não há 2FA ativo nesta conta.', code: 'TOTP_NOT_ENABLED' });
      }

      const matched = verifyTotp(doc.secret, req.body?.code, { atMs: Date.now() });
      // Código já usado neste passo de 30s → replay, recusa como se fosse inválido.
      const freshTotp = matched !== null && (doc.lastCounter === null || matched > doc.lastCounter);
      const remainingBackup = freshTotp ? null : consumeBackupCode(doc.backupCodes, req.body?.code);

      if (!freshTotp && remainingBackup === null) {
        return res.status(400).json({ error: 'Código inválido. Tente novamente.', code: 'TOTP_INVALID_CODE' });
      }

      await totpDoc(uid).set(
        {
          ...(freshTotp ? { lastCounter: matched } : { backupCodes: remainingBackup }),
          lastVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await patchCustomClaims(uid, buildMfaVerifiedClaims(claims?.auth_time, Date.now()));

      res.json({
        verified: true,
        usedBackupCode: !freshTotp,
        backupCodesRemaining: freshTotp ? doc.backupCodes.length : remainingBackup!.length,
        refreshToken: true,
      });
    } catch (error) {
      console.error('Erro ao verificar o 2FA:', error);
      res.status(500).json({ error: 'Erro ao verificar o código.' });
    }
  });

  // Emite um lote NOVO de códigos de backup (invalida os antigos). Sem isto, quem
  // gasta os 10 códigos fica sem rede de segurança se perder o celular.
  app.post('/api/auth/totp/backup-codes', requireAuth, totpLimiter, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const { uid } = (req as any).user;
      const doc = await readTotpDoc(uid);
      if (!doc.enabled || !doc.secret) {
        return res.status(400).json({ error: 'Não há 2FA ativo nesta conta.', code: 'TOTP_NOT_ENABLED' });
      }
      // Exige um código NOVO do app: gerar códigos de recuperação é uma ação sensível.
      const matched = verifyTotp(doc.secret, req.body?.code, { atMs: Date.now() });
      if (matched === null || (doc.lastCounter !== null && matched <= doc.lastCounter)) {
        return res.status(400).json({ error: 'Código inválido. Tente novamente.', code: 'TOTP_INVALID_CODE' });
      }

      const backupCodes = generateBackupCodes();
      await totpDoc(uid).set(
        { lastCounter: matched, backupCodes: backupCodes.map(hashBackupCode), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
      await writeAuditLog(req, { entityType: 'user', entityId: uid, action: 'mfa.backup_codes.regenerate' });
      res.json({ backupCodes, backupCodesRemaining: BACKUP_CODE_COUNT });
    } catch (error) {
      console.error('Erro ao gerar códigos de backup:', error);
      res.status(500).json({ error: 'Erro ao gerar novos códigos de backup.' });
    }
  });

  // Desliga o 2FA. Exige um código VÁLIDO (app ou backup) mesmo com a sessão já
  // verificada: uma aba esquecida aberta não deve conseguir remover o fator.
  app.post('/api/auth/totp/disable', requireAuth, totpLimiter, async (req, res) => {
    if (!adminDb || !adminApp) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const { uid } = (req as any).user;
      const doc = await readTotpDoc(uid);
      if (!doc.enabled || !doc.secret) {
        return res.status(400).json({ error: 'Não há 2FA ativo nesta conta.', code: 'TOTP_NOT_ENABLED' });
      }

      const matched = verifyTotp(doc.secret, req.body?.code, { atMs: Date.now() });
      const freshTotp = matched !== null && (doc.lastCounter === null || matched > doc.lastCounter);
      if (!freshTotp && consumeBackupCode(doc.backupCodes, req.body?.code) === null) {
        return res.status(400).json({ error: 'Código inválido. Tente novamente.', code: 'TOTP_INVALID_CODE' });
      }

      // Claims primeiro: se o doc sumisse antes, uma falha aqui deixaria o usuário
      // com `totpEnabled` no token e sem segredo p/ verificar — trancado pra fora.
      await patchCustomClaims(uid, buildMfaDisabledClaims());
      await totpDoc(uid).delete();
      await writeAuditLog(req, { entityType: 'user', entityId: uid, action: 'mfa.disable' });
      res.json({ enabled: false, refreshToken: true });
    } catch (error) {
      console.error('Erro ao desativar o 2FA:', error);
      res.status(500).json({ error: 'Erro ao desativar o 2FA.' });
    }
  });

  // --- Validação de telefone por SMS (OTP) — item 7 da call Infinity ---------
  // Núcleo puro em src/lib/phoneVerification (código de 6 dígitos hasheado —
  // nunca em claro —, expiração de 10 min, teto de tentativas); provedor
  // plugável em src/lib/smsProvider. FAIL-SAFE: sem env configurada a feature
  // fica OFF e os cadastros seguem exatamente como antes. Estado do desafio em
  // `phone_verifications/{telefone}` — server-only (rule `read, write: if false`,
  // coleção NOVA: nasce fechada, sem acoplamento de ordem de deploy).
  //
  // Fluxo: send-code (público) → verify-code (público, devolve um token de uso
  // único) → o token entra no accept-invite (server cria o user já verificado)
  // ou no /api/phone/attach (auto-cadastro: o user já existe; o servidor carimba
  // phone + phoneVerified no users/{uid} — campos SERVER-ONLY nas rules, o
  // cliente não pode se auto-marcar verificado).
  const phoneSetup = (): PhoneVerificationSetup =>
    resolvePhoneVerificationSetup(process.env as Record<string, string | undefined>);
  const smsProviderFor = (setup: PhoneVerificationSetup): SmsProvider | null =>
    deps.smsProvider ?? buildSmsProvider(setup, fetchImpl);
  const phoneChallengeRef = (e164: string) => adminDb!.collection('phone_verifications').doc(phoneDocId(e164));
  const readPhoneChallenge = async (e164: string): Promise<PhoneChallenge | null> => {
    const snap = await phoneChallengeRef(e164).get();
    return snap.exists ? ((snap.data() as PhoneChallenge) ?? null) : null;
  };

  // SMS custa dinheiro e OTP é alvo clássico de abuso (SMS pumping/brute force):
  // limite POR IP e POR TELEFONE (keyGenerator no corpo), além do cooldown e do
  // teto de envios POR DESAFIO persistidos no doc (valem entre instâncias/restarts).
  const phoneSendIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitos envios de código. Tente novamente em alguns minutos.' },
  });
  const phoneSendPhoneLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 6,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => normalizeBrPhone((req.body as any)?.phone) ?? ipKeyGenerator(String(req.ip || '')),
    message: { error: 'Muitos envios de código para este telefone. Tente novamente mais tarde.' },
  });
  const phoneVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => normalizeBrPhone((req.body as any)?.phone) ?? ipKeyGenerator(String(req.ip || '')),
    message: { error: 'Muitas tentativas de código. Aguarde alguns minutos.' },
  });

  // Público: a UI dos cadastros pergunta se a verificação está ligada nesta
  // instância. O client trata erro de rede como DESLIGADA (fail-open: a falta
  // do provedor nunca pode trancar o cadastro).
  app.get('/api/phone/status', (_req, res) => {
    res.json({ enabled: phoneSetup().enabled });
  });

  // Público (o afiliado ainda não tem conta no auto-cadastro/convite).
  app.post('/api/phone/send-code', phoneSendIpLimiter, phoneSendPhoneLimiter, async (req, res) => {
    const setup = phoneSetup();
    if (!setup.enabled) {
      return res.status(503).json({ error: 'Verificação por SMS não está habilitada nesta instância.', code: 'PHONE_VERIFICATION_DISABLED' });
    }
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const phone = normalizeBrPhone(req.body?.phone);
      if (!phone) {
        return res.status(400).json({ error: 'Telefone inválido. Informe um celular brasileiro com DDD.', code: 'PHONE_INVALID' });
      }
      const previous = await readPhoneChallenge(phone);
      const gate = canSendOtp(previous, Date.now());
      if (!gate.ok) {
        return res.status(429).json({
          error: gate.reason === 'cooldown'
            ? 'Aguarde um instante para reenviar o código.'
            : 'Limite de envios atingido para este telefone. Tente novamente mais tarde.',
          code: gate.reason === 'cooldown' ? 'OTP_COOLDOWN' : 'OTP_SEND_LIMIT',
          retryInMs: gate.retryInMs,
        });
      }
      const provider = smsProviderFor(setup);
      if (!provider) return res.status(503).json({ error: 'Provedor de SMS indisponível.', code: 'SMS_PROVIDER_UNAVAILABLE' });
      const code = generateOtpCode();
      // Envia ANTES de persistir: se o SMS falhar, o desafio anterior fica
      // intacto (não queima cooldown/teto com um código que nunca chegou).
      try {
        await provider.send(phone, buildOtpSmsBody(code, BRAND.shortName));
      } catch (sendError) {
        console.error('[phone] falha no envio do SMS:', sendError);
        return res.status(502).json({ error: 'Não foi possível enviar o SMS agora. Tente novamente.', code: 'SMS_SEND_FAILED' });
      }
      await phoneChallengeRef(phone).set({
        ...buildChallenge(previous, phone, code, Date.now()),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // O código NUNCA volta na resposta. `dev` avisa a UI que o provedor é o
      // console (demo/emuladores) — o código está no log do SERVIDOR.
      return res.json({ sent: true, cooldownMs: OTP_RESEND_COOLDOWN_MS, expiresInMs: OTP_TTL_MS, dev: provider.id === 'console' });
    } catch (error) {
      console.error('[phone] erro ao enviar código:', error);
      return res.status(500).json({ error: 'Erro ao enviar o código de verificação.' });
    }
  });

  // Público. Sucesso devolve um token de USO ÚNICO que prova a verificação —
  // é ele (nunca o "verified" do client) que o accept-invite/attach exigem.
  app.post('/api/phone/verify-code', phoneVerifyLimiter, async (req, res) => {
    const setup = phoneSetup();
    if (!setup.enabled) {
      return res.status(503).json({ error: 'Verificação por SMS não está habilitada nesta instância.', code: 'PHONE_VERIFICATION_DISABLED' });
    }
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const phone = normalizeBrPhone(req.body?.phone);
      if (!phone) {
        return res.status(400).json({ error: 'Telefone inválido. Informe um celular brasileiro com DDD.', code: 'PHONE_INVALID' });
      }
      const challenge = await readPhoneChallenge(phone);
      const outcome = evaluateOtpAttempt(challenge, phone, req.body?.code, Date.now());
      if (!outcome.ok) {
        if (outcome.reason === 'wrong_code') {
          // Conta a tentativa — 5 erradas travam o desafio (peça código novo).
          await phoneChallengeRef(phone).set({ attempts: (challenge?.attempts ?? 0) + 1 }, { merge: true });
          return res.status(400).json({ error: 'Código inválido. Confira o SMS e tente novamente.', code: 'OTP_INVALID' });
        }
        if (outcome.reason === 'expired') {
          return res.status(410).json({ error: 'Código expirado. Peça um novo código.', code: 'OTP_EXPIRED' });
        }
        if (outcome.reason === 'too_many_attempts') {
          return res.status(429).json({ error: 'Muitas tentativas. Peça um novo código.', code: 'OTP_TOO_MANY_ATTEMPTS' });
        }
        // not_found — mesma mensagem do código errado (não revela se o número tem desafio).
        return res.status(400).json({ error: 'Código inválido. Peça um novo código.', code: 'OTP_INVALID' });
      }
      const token = generateVerificationToken();
      await phoneChallengeRef(phone).set({
        verified: true,
        verifiedAtMs: Date.now(),
        tokenHash: hashVerificationToken(token),
        codeHash: null, // o código aceito não vale de novo (anti-replay)
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return res.json({ verified: true, verificationToken: token, tokenTtlMs: VERIFICATION_TOKEN_TTL_MS });
    } catch (error) {
      console.error('[phone] erro ao verificar código:', error);
      return res.status(500).json({ error: 'Erro ao verificar o código.' });
    }
  });

  // Autenticado: carimba o telefone VERIFICADO no próprio users/{uid} (fluxo do
  // auto-cadastro, onde a conta é criada pelo client SDK antes da verificação
  // "pertencer" a alguém). `phone`+`phoneVerified` são server-only nas rules —
  // esta rota é o ÚNICO caminho de escrita p/ um usuário verificado.
  app.post('/api/phone/attach', requireAuth, async (req, res) => {
    const setup = phoneSetup();
    if (!setup.enabled) {
      return res.status(503).json({ error: 'Verificação por SMS não está habilitada nesta instância.', code: 'PHONE_VERIFICATION_DISABLED' });
    }
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const phone = normalizeBrPhone(req.body?.phone);
      if (!phone) {
        return res.status(400).json({ error: 'Telefone inválido. Informe um celular brasileiro com DDD.', code: 'PHONE_INVALID' });
      }
      const challenge = await readPhoneChallenge(phone);
      if (!verificationTokenValid(challenge, req.body?.verificationToken, Date.now())) {
        return res.status(400).json({ error: 'Verificação de telefone inválida ou expirada. Confirme o número novamente.', code: 'PHONE_TOKEN_INVALID' });
      }
      const { uid } = (req as any).user;
      await adminDb.collection('users').doc(uid).set({
        phone,
        phoneVerified: true,
        phoneVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      // Uso único: o mesmo token não carimba duas contas.
      await phoneChallengeRef(phone).set({ consumedAtMs: Date.now(), consumedByUid: uid }, { merge: true });
      await writeAuditLog(req, {
        entityType: 'user',
        entityId: uid,
        action: 'user.phone_verified',
        metadata: { phone: maskPhoneForLog(phone) },
      });
      return res.json({ verified: true });
    } catch (error) {
      console.error('[phone] erro ao vincular telefone verificado:', error);
      return res.status(500).json({ error: 'Erro ao registrar a verificação do telefone.' });
    }
  });

  // --- Registro do afiliado especial · resolução ÚNICA (papel + sub-rede) ------
  // Toda barreira de escopo do não-admin (proxy externo, configs, analytics, casas
  // manuais) sai daqui. Antes cada rota lia `special_affiliates/{id}` e usava
  // `subAffiliateIds` cru; com a rede N-níveis a lista pode ser DERIVADA da árvore
  // (`fromNetwork`), e derivar em 6 lugares divergiria. Ver src/lib/specialNetwork.ts.
  const readUplineMap = async (): Promise<Record<string, string>> => {
    const snap = await adminDb!.collection('affiliate_uplines').get();
    const out: Record<string, string> = {};
    snap.forEach((d) => {
      const up = (d.data() as any)?.uplineId;
      if (up) out[d.id] = String(up);
    });
    return out;
  };

  const readSpecialsMap = async (): Promise<Record<string, SpecialRecord>> => {
    const snap = await adminDb!.collection('special_affiliates').get();
    const out: Record<string, SpecialRecord> = {};
    snap.forEach((d) => {
      const data = (d.data() as any) ?? {};
      out[d.id] = { ...data, affiliateId: d.id };
    });
    return out;
  };

  // Devolve o registro do especial com a sub-rede já RESOLVIDA (derivada da árvore
  // quando `fromNetwork`, senão a lista gravada). `withSubs: false` pula as duas
  // leituras extras quando o chamador só quer saber se é especial ativo.
  const resolveSpecialRecord = async (
    affiliateId: string,
    opts: { withSubs?: boolean } = {}
  ): Promise<SpecialRecord | null> => {
    const affId = String(affiliateId || '');
    if (!affId || !adminDb) return null;
    const snap = await adminDb.collection('special_affiliates').doc(affId).get();
    if (!snap.exists) return null;
    const record: SpecialRecord = { ...(snap.data() as any), affiliateId: affId };
    if (opts.withSubs === false) return record;
    const [uplines, specials] = await Promise.all([readUplineMap(), readSpecialsMap()]);
    return { ...record, subAffiliateIds: resolveSpecialSubIds(affId, record, { uplines, specials }) };
  };

  // Leitura do registro de especial pelo CLIENT (a rule é admin-only: o doc revela
  // a estrutura comercial da rede). Admin recebe o mapa inteiro; o não-admin recebe
  // só o próprio registro + o dos subs dele — o mesmo escopo do proxy externo, para
  // que a tela do especial (/network) continue funcionando sem ler o Firestore.
  app.get('/api/special-affiliates', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const user = (req as any).user;
      const [uplines, stored] = await Promise.all([readUplineMap(), readSpecialsMap()]);
      const resolved: Record<string, any> = {};
      for (const [id, record] of Object.entries(stored)) {
        const ctx = { uplines, specials: stored };
        resolved[id] = {
          ...record,
          active: record.active === true,
          fromNetwork: record.fromNetwork === true,
          subAffiliateIds: resolveSpecialSubIds(id, record, ctx),
          // Quem ele REPASSA (filhos diretos) ⊆ quem ele VÊ. A tela precisa dos dois
          // para não oferecer um campo de taxa que o POST recusa com 403.
          directSubAffiliateIds: resolveDirectSubIds(id, record, ctx),
        };
      }
      if (user?.role === 'admin') return res.json({ specials: resolved });

      const ownId = user?.affiliateId ? String(user.affiliateId) : '';
      if (!ownId) return res.json({ specials: {} });
      const own = resolved[ownId];
      if (!own || own.active !== true) return res.json({ specials: {} });
      const scoped: Record<string, any> = { [ownId]: own };
      for (const sub of own.subAffiliateIds as string[]) {
        if (resolved[sub]) scoped[sub] = resolved[sub];
      }
      return res.json({ specials: scoped });
    } catch (error: any) {
      console.error('[special-affiliates] get:', error);
      return res.status(500).json({ error: error.message || 'Erro ao carregar afiliados especiais.' });
    }
  });

  // B3 · Afiliado especial define a comissão de um sub-afiliado da própria sub-rede.
  // `affiliate_configs` é admin-only nas rules; este endpoint grava via Admin SDK
  // após validar que o caller é o especial DAQUELE sub. COM teto: a taxa do sub não
  // pode passar da taxa PRÓPRIA do especial (o teto que o master setou) — senão o
  // spread fica negativo. O ganho do especial é o spread sobre essa taxa própria.
  // requireAuth — o especial é `client`.
  app.post('/api/special/sub-config', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const user = (req as any).user;
      const callerAffiliateId = user?.affiliateId ? String(user.affiliateId) : null;
      if (!callerAffiliateId) return res.status(403).json({ error: 'Sua conta não está vinculada a um afiliado.' });

      const { subAffiliateId, cpaValue, revPercentage, brandKey: rawBrandKey } = req.body ?? {};
      const subId = subAffiliateId != null ? String(subAffiliateId) : '';
      if (!subId) return res.status(400).json({ error: 'subAffiliateId é obrigatório.' });
      // Casa ALVO do gesto (chave do byBrand: brandId da OTG ou slug da casa
      // manual). Ausente = gesto de TOPO, o comportamento histórico desta rota.
      // A tela do gerente hoje SEMPRE manda a casa (pedido Infinity 17/08): mexer
      // no topo daqui reprecificava toda casa sem override. Ver lib/subHouseRates.
      const brandKey = rawBrandKey != null ? String(rawBrandKey).trim() : '';

      const cpa = Number(cpaValue) || 0;
      const rev = Number(revPercentage) || 0;
      if (cpa < 0 || rev < 0) return res.status(400).json({ error: 'Valores não podem ser negativos.' });

      const special = await resolveSpecialRecord(callerAffiliateId);
      if (!resolveIsSpecial(special)) return res.status(403).json({ error: 'Você não é um afiliado especial ativo.' });
      const subs = (special!.subAffiliateIds ?? []).map((s: any) => String(s));
      if (!subs.includes(subId)) return res.status(403).json({ error: 'Este afiliado não pertence à sua sub-rede.' });

      // VISÃO ≠ DINHEIRO. A sub-rede que o especial LÊ tem N níveis (ele enxerga a
      // equipe inteira), mas a taxa ele só define para o filho DIRETO: quem paga o
      // neto é o gerente do meio, e mexer nessa taxa por cima mudaria o spread dele
      // sem que ele soubesse. Regressão-zero no modelo de 2 níveis, onde
      // `subAffiliateIds` JÁ é a lista de filhos diretos. Ver lib/specialNetwork.
      const [uplines, specials] = await Promise.all([readUplineMap(), readSpecialsMap()]);
      if (!isDirectDownline(subId, callerAffiliateId, { uplines, specials })) {
        return res.status(403).json({
          error: 'Este afiliado não é seu indicado direto: a comissão dele é definida por quem está acima dele na rede.',
        });
      }

      // Teto = taxa própria do especial (affiliate_configs do callerAffiliateId). A
      // taxa do sub não pode passar do teto (senão o spread do upline fica negativo).
      // É o "Limite de repasse" do legado — regra PURA em lib/network, a mesma que a
      // cascata de rede usa, para não divergir de uma reimplementação inline.
      const ownCfgSnap = await adminDb.collection('affiliate_configs').doc(callerAffiliateId).get();
      const ownCfg = ownCfgSnap.exists ? (ownCfgSnap.data() as any) : {};
      // Ausência ≠ R$ 0: sem taxa PRÓPRIA na casa ele não tem o que repassar, e um
      // teto zerado daria a mensagem errada ("o teto é R$ 0") para um problema que
      // é da agência resolver. Mesma ordem de recusa da precificação de parceria.
      if (brandKey && !hasConfiguredRate(ownCfg, brandKey)) {
        return res.status(400).json({
          error: 'Você ainda não tem taxa nesta casa. Peça à agência antes de definir a comissão do seu afiliado.',
        });
      }
      const cap = resolveRepasseCap(ownCfg, brandKey || undefined);
      if (exceedsRepasseCap({ cpaValue: cpa, revPercentage: rev }, cap)) {
        return res.status(400).json({
          error: brandKey
            ? `A comissão do sub não pode passar da sua taxa nesta casa (teto: R$ ${cap.cpaValue}/CPA · ${cap.revPercentage}% REV).`
            : `A comissão do sub não pode passar da sua taxa (teto: R$ ${cap.cpaValue}/CPA · ${cap.revPercentage}% REV).`,
        });
      }

      // Fase 3 (auditoria de dinheiro): a mudança de taxa do sub também é
      // config.update — autor = o ESPECIAL (carimbado pelo token), antes→depois
      // no MESMO batch da gravação (atômico). [[boost-audit-trail Fase 3]]
      const subRef = adminDb.collection('affiliate_configs').doc(subId);
      const beforeSnap = await subRef.get();
      const beforeCfg = beforeSnap.exists ? (beforeSnap.data() as any) : undefined;
      // VIGÊNCIA: a taxa nova vale de amanhã; o que o sub já gerou fica com a antiga.
      // O segmento é fechado NA CASA quando o gesto tem casa, e na raiz quando não
      // tem (compat). [[PLANO-COMISSAO-VIGENCIA]]
      const rateEntry = withRateHistory(currentRateEntry(beforeCfg, brandKey || null), { cpaValue: cpa, revPercentage: rev });
      // Gravação POR CASA: merge preservando as OUTRAS casas do byBrand — e sem
      // encostar no topo, que é o "valor de contrato" que a agência define.
      const configPatch: Record<string, unknown> = brandKey
        ? { byBrand: { ...(beforeCfg?.byBrand ?? {}), [brandKey]: rateEntry } }
        : (rateEntry as unknown as Record<string, unknown>);
      const changes = diffChanges(
        beforeCfg,
        configPatch,
        brandKey ? ['byBrand'] : ['cpaValue', 'revPercentage'],
      );

      const batch = adminDb.batch();
      batch.set(subRef, {
        affiliateId: subId,
        ...(brandKey ? { byBrand: { [brandKey]: rateEntry } } : configPatch),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (changes.length) {
        appendAuditLog(batch, req, {
          entityType: 'affiliate_config',
          entityId: subId,
          entityLabel: await affiliateNameOf(subId),
          action: 'config.update',
          changes,
          metadata: { via: 'special/sub-config', specialAffiliateId: callerAffiliateId, brandKey: brandKey || null },
        });
      }
      await batch.commit();

      return res.json({ affiliateId: subId, brandKey: brandKey || null, cpaValue: cpa, revPercentage: rev });
    } catch (error: any) {
      console.error('Error setting sub-affiliate config:', error);
      return res.status(500).json({ error: error.message || 'Erro interno.' });
    }
  });

  // Admin · grava o registro de afiliado especial (special_affiliates) E espelha a
  // flag `isSpecial` em TODO login vinculado ao affiliateId. Resolver o uid PELO
  // affiliateId aqui (em vez de exigir o client passar o userUid) elimina o bug
  // recorrente do "especial ativo sem acesso à rede": antes a flag só pousava se a
  // UI tivesse o userUid em mãos, e o fluxo de convite (accept-invite) nunca a
  // setava — então o especial era roteado pra própria view, sem a /network.
  app.post('/api/special-affiliates', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const { affiliateId, active, subAffiliateIds, fromNetwork } = req.body ?? {};
      const affId = affiliateId != null ? String(affiliateId).trim() : '';
      if (!affId) return res.status(400).json({ error: 'affiliateId é obrigatório.' });
      const isActive = active === true;
      // Modo DERIVADO: a sub-rede sai da árvore (`affiliate_uplines`) a cada leitura
      // e a lista NÃO é gravada — uma lista congelada rotaria em silêncio a cada
      // aresta nova, e o gerente deixaria de ver quem entrou na equipe dele depois.
      const derived = isActive && fromNetwork === true;
      const subs = derived
        ? []
        : (Array.isArray(subAffiliateIds) ? subAffiliateIds.map((s: any) => String(s)) : []);

      await adminDb.collection('special_affiliates').doc(affId).set({
        active: isActive,
        fromNetwork: derived,
        subAffiliateIds: isActive ? subs : [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Espelha isSpecial em todo user com este affiliateId (normalmente 1; batch
      // por segurança). Promoção → true; rebaixamento → false.
      const usersSnap = await adminDb.collection('users').where('affiliateId', '==', affId).get();
      if (!usersSnap.empty) {
        const batch = adminDb.batch();
        usersSnap.forEach((d) => batch.set(d.ref, {
          isSpecial: isActive,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }));
        await batch.commit();
      }

      // A resposta devolve a sub-rede EFETIVA (derivada, quando for o caso) — é o
      // que o admin precisa ver para confirmar quantas pessoas o gerente passou a
      // enxergar.
      const effectiveSubs = isActive
        ? (derived
            ? resolveSpecialSubIds(affId, { active: true, fromNetwork: true }, {
                uplines: await readUplineMap(),
                specials: await readSpecialsMap(),
              })
            : subs)
        : [];
      return res.json({
        affiliateId: affId,
        active: isActive,
        fromNetwork: derived,
        subAffiliateIds: effectiveSubs,
        linkedUsers: usersSnap.size,
      });
    } catch (error: any) {
      console.error('Error saving special affiliate:', error);
      return res.status(500).json({ error: error.message || 'Erro interno salvando afiliado especial.' });
    }
  });

  // --- Rede de afiliados · aresta filho→upline (affiliate_uplines) ------------
  // Generaliza o especial+sub-rede (2 níveis) para N níveis, que é o que o legado
  // da Infinity praticava (4). A aresta é EXPLÍCITA e sobrevive ao sync do mirror
  // `affiliates`. Server-only (rule admin-only): quem é upline de quem determina
  // dinheiro (o "lucro sobre equipe"), então nem leitura vai direto ao Firestore.
  // Ver REDE-AFILIADOS.md e src/lib/network.ts. (`readUplineMap` é o helper
  // compartilhado definido junto do resolvedor de especial, mais acima.)

  app.get('/api/affiliate-uplines', requireAdmin, async (_req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      return res.json({ uplines: await readUplineMap() });
    } catch (error: any) {
      console.error('Error fetching affiliate uplines:', error);
      return res.status(500).json({ error: error.message || 'Erro interno.' });
    }
  });

  app.post('/api/affiliate-uplines', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const affId = req.body?.affiliateId != null ? String(req.body.affiliateId).trim() : '';
      const uplineId = req.body?.uplineId != null ? String(req.body.uplineId).trim() : '';
      if (!affId) return res.status(400).json({ error: 'affiliateId é obrigatório.' });
      if (uplineId && uplineId === affId) {
        return res.status(400).json({ error: 'Um afiliado não pode ser upline de si mesmo.' });
      }

      // Barreira de CICLO no WRITE: a árvore nunca fica inconsistente no banco (o
      // núcleo ainda saneia na leitura, mas aqui o admin recebe o erro na hora).
      if (uplineId) {
        const current = await readUplineMap();
        const candidate = { ...current, [affId]: uplineId };
        const ids = new Set<string>([affId, uplineId, ...Object.keys(candidate), ...Object.values(candidate)]);
        const tree = buildNetworkTree([...ids].map((id) => ({ affiliateId: id, uplineId: candidate[id] ?? null })));
        if (tree.dropped.some((d) => d.reason === 'ciclo')) {
          return res.status(400).json({ error: 'Este vínculo criaria um ciclo na rede (o upline já está abaixo deste afiliado).' });
        }
      }

      // Trilha de auditoria: mudar upline MUDA DINHEIRO (o "lucro sobre equipe" que
      // a agência paga junto com o repasse direto sai da taxa do TOPO da estrutura),
      // então a aresta é auditada como qualquer escrita de comissão — antes→depois no
      // MESMO batch da gravação (atômico). Vale para os dois sentidos: definir E
      // remover o vínculo. Diff vazio (re-gravar o mesmo upline) não polui a trilha.
      const ref = adminDb.collection('affiliate_uplines').doc(affId);
      const beforeSnap = await ref.get();
      const before = beforeSnap.exists ? (beforeSnap.data() as any) : undefined;
      const nextUpline = uplineId || null;
      const prevUpline = before?.uplineId ? String(before.uplineId) : null;
      const changes = diffChanges(before, { uplineId: nextUpline }, ['uplineId']);

      const batch = adminDb.batch();
      batch.set(ref, {
        affiliateId: affId,
        uplineId: nextUpline,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (changes.length) {
        // O NOME vem primeiro (id de afiliado é opaco na tela da /auditoria, que
        // exibe `changes` em ordem); o id fica logo atrás como a verdade auditável.
        const nomes = {
          field: 'upline',
          before: prevUpline ? await affiliateNameOf(prevUpline) : null,
          after: nextUpline ? await affiliateNameOf(nextUpline) : null,
        };
        appendAuditLog(batch, req, {
          entityType: 'affiliate_network',
          entityId: affId,
          entityLabel: await affiliateNameOf(affId),
          action: nextUpline ? 'network.set_upline' : 'network.clear_upline',
          changes: [nomes, ...changes],
        });
      }
      await batch.commit();

      return res.json({ affiliateId: affId, uplineId: nextUpline });
    } catch (error: any) {
      console.error('Error saving affiliate upline:', error);
      return res.status(500).json({ error: error.message || 'Erro interno salvando o upline.' });
    }
  });

  // B4 · Dados de pagamento do afiliado (PIX + dados de NF). Preenchidos pelo
  // próprio afiliado; o admin apenas visualiza. São PII → coleção server-only
  // (payment_profiles), gravada via Admin SDK. O afiliado lê/grava o PRÓPRIO
  // perfil (escopado pelo affiliateId do token); o admin lê o de qualquer um.
  const sanitizePaymentProfile = (body: any) => ({
    pixKeyType: body?.pixKeyType ? String(body.pixKeyType).trim() : '',
    pixKey: body?.pixKey ? String(body.pixKey).trim() : '',
    documentType: body?.documentType === 'cnpj' ? 'cnpj' : 'cpf',
    document: body?.document ? String(body.document).trim() : '',
    legalName: body?.legalName ? String(body.legalName).trim() : '',
    address: body?.address ? String(body.address).trim() : '',
  });

  app.get('/api/payment-profile', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const user = (req as any).user;
      const affiliateId = user?.affiliateId ? String(user.affiliateId) : null;
      if (!affiliateId) return res.status(400).json({ error: 'Sua conta não está vinculada a um afiliado.' });
      const snap = await adminDb.collection('payment_profiles').doc(affiliateId).get();
      return res.json(snap.exists ? { affiliateId, ...snap.data() } : { affiliateId });
    } catch (error: any) {
      console.error('Error fetching payment profile:', error);
      return res.status(500).json({ error: error.message || 'Erro interno.' });
    }
  });

  app.post('/api/payment-profile', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const user = (req as any).user;
      const affiliateId = user?.affiliateId ? String(user.affiliateId) : null;
      if (!affiliateId) return res.status(400).json({ error: 'Sua conta não está vinculada a um afiliado.' });
      const data = sanitizePaymentProfile(req.body);
      if (!data.pixKey) return res.status(400).json({ error: 'A chave PIX é obrigatória.' });
      await adminDb.collection('payment_profiles').doc(affiliateId).set({
        affiliateId,
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return res.json({ affiliateId, ...data });
    } catch (error: any) {
      console.error('Error saving payment profile:', error);
      return res.status(500).json({ error: error.message || 'Erro interno.' });
    }
  });

  app.get('/api/payment-profile/:affiliateId', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const { affiliateId } = req.params;
      const snap = await adminDb.collection('payment_profiles').doc(String(affiliateId)).get();
      return res.json(snap.exists ? { affiliateId, ...snap.data() } : { affiliateId });
    } catch (error: any) {
      console.error('Error fetching payment profile (admin):', error);
      return res.status(500).json({ error: error.message || 'Erro interno.' });
    }
  });

  app.post('/api/create-user', requireAdmin, async (req, res) => {
    if (!adminApp || !adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }

    try {
      const { name, email, password, role, affiliateId, mustChangePassword } = req.body;
      if (!email || !password || !name || !role) {
        return res.status(400).json({ error: 'Dados incompletos para criar usuário.' });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const normalizedName = String(name).trim();
      const normalizedRole = String(role);
      // SECURITY (R25): `role` é gravado verbatim e decide o roteamento/escopo. Um
      // valor fora de {admin,client} cairia no fallback /profile silencioso (e poderia
      // confundir checagens futuras). Valida o enum ANTES de criar o usuário no Auth.
      if (normalizedRole !== 'admin' && normalizedRole !== 'client') {
        return res.status(400).json({ error: 'Papel inválido. Use "admin" ou "client".' });
      }
      let userRecord: admin.auth.UserRecord;
      // `created` distingue conta NOVA de conta REAPROVEITADA. A rota sempre
      // devolveu só o uid, e quem chamava não tinha como saber que o e-mail já
      // existia — o que fez uma conta em uso (autocadastro do próprio usuário)
      // ser tratada como recém-criada na Infinity em 30/07/2026, e depois
      // excluída. Reaproveitar continua sendo o comportamento certo (idempotência);
      // o que faltava era DIZER. ⚠️ Reaproveitar NÃO troca a senha: o password do
      // corpo é ignorado quando o e-mail já existe.
      let created = true;

      try {
        userRecord = await adminApp.auth().createUser({
          email: normalizedEmail,
          password: String(password),
          displayName: normalizedName,
        });
      } catch (error: any) {
        if (error.code === 'auth/email-already-exists') {
          userRecord = await adminApp.auth().getUserByEmail(normalizedEmail);
          created = false;
        } else {
          throw error;
        }
      }

      const userDoc = adminDb.collection('users').doc(userRecord.uid);
      await userDoc.set({
        uid: userRecord.uid,
        name: normalizedName,
        email: normalizedEmail,
        role: normalizedRole,
        affiliateId: affiliateId ? String(affiliateId) : null,
        mustChangePassword: !!mustChangePassword,
        avatarUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(normalizedName)}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await writeAuditLog(req, {
        entityType: 'user',
        entityId: userRecord.uid,
        entityLabel: normalizedName,
        action: 'user.create',
        // NUNCA logamos a senha. role/affiliateId definem escopo → ficam na trilha.
        metadata: {
          email: normalizedEmail,
          role: normalizedRole,
          affiliateId: affiliateId ? String(affiliateId) : null,
          mustChangePassword: !!mustChangePassword,
          created,
        },
      });

      return res.json({ uid: userRecord.uid, created });
    } catch (error: any) {
      console.error('Error creating auth user:', error);
      return res.status(500).json({ error: error.message || 'Erro interno criando usuário.' });
    }
  });

  // Vincula um login JÁ EXISTENTE (por e-mail) a um afiliado. Corrige o caso de
  // users/{uid} sem `affiliateId` — que prende o afiliado no /profile, porque o
  // roteamento (clientHome) cai no fallback. Espelha `isSpecial` a partir de
  // special_affiliates. Admin-only (affiliateId/isSpecial só são gravados pelo
  // servidor — as rules proíbem o cliente de setá-los).
  app.post('/api/link-affiliate-user', requireAdmin, async (req, res) => {
    if (!adminApp || !adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const { email, affiliateId } = req.body;
      if (!email || !affiliateId) {
        return res.status(400).json({ error: 'Informe o e-mail do login e o afiliado.' });
      }
      const normalizedEmail = String(email).trim().toLowerCase();
      const affId = String(affiliateId).trim();

      let userRecord: admin.auth.UserRecord;
      try {
        userRecord = await adminApp.auth().getUserByEmail(normalizedEmail);
      } catch (e: any) {
        if (e.code === 'auth/user-not-found') {
          return res.status(404).json({ error: 'Nenhum login encontrado com este e-mail.' });
        }
        throw e;
      }

      // isSpecial espelha special_affiliates (existe e ativo). resolveIsSpecial unifica
      // a regra (active === true) — antes este site usava `active !== false` e divergia
      // dos demais quando o doc não tinha o campo `active`. [[R7]]
      const isSpecial = resolveIsSpecial(await resolveSpecialRecord(affId, { withSubs: false }));

      // Lê o doc atual ANTES do set p/ a auditoria registrar o antes→depois real
      // de affiliateId/isSpecial (mudança de vínculo/escopo).
      const userRef = adminDb.collection('users').doc(userRecord.uid);
      const beforeUser = (await userRef.get()).data() as any;

      await userRef.set({
        affiliateId: affId,
        isSpecial,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      const linkChanges = diffChanges(beforeUser, { affiliateId: affId, isSpecial }, ['affiliateId', 'isSpecial']);
      if (linkChanges.length) {
        await writeAuditLog(req, {
          entityType: 'user',
          entityId: userRecord.uid,
          entityLabel: normalizedEmail,
          action: 'user.link_affiliate',
          changes: linkChanges,
        });
      }

      return res.json({ uid: userRecord.uid, affiliateId: affId, isSpecial });
    } catch (error: any) {
      console.error('Error linking affiliate user:', error);
      return res.status(500).json({ error: error.message || 'Erro interno ao vincular login.' });
    }
  });

  app.get('/api/affiliate-statuses', requireAdmin, async (_req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }

    try {
      const snapshot = await adminDb.collection('affiliate_statuses').get();
      const statuses = snapshot.docs.reduce<Record<string, { status: string; updatedAt: string | null }>>((acc, item) => {
        const data = item.data();
        acc[item.id] = {
          status: data.status || 'inactive',
          updatedAt: serializeTimestamp(data.updatedAt)
        };
        return acc;
      }, {});

      return res.json(statuses);
    } catch (error: any) {
      console.error('Error fetching affiliate statuses:', error);
      return res.status(500).json({ error: error.message || 'Erro interno listando status.' });
    }
  });

  // SECURITY (R5): taxas (CPA/REV/byBrand) são dado comercial sensível. Antes a rule
  // de affiliate_configs era `read: isSignedIn()` e o cliente lia a COLEÇÃO INTEIRA —
  // todo afiliado via a taxa de todos. Agora a leitura é mediada aqui (Admin SDK) e
  // escopada por papel: admin recebe todas; afiliado recebe só a própria + (se especial
  // ativo) as da sub-rede. A rule passa a ser admin-only (cliente direto bloqueado),
  // espelhando payment_profiles/houses. [[REVIEW-TEST-PLAN R5]]
  app.get('/api/affiliate-configs', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const user = (req as any).user;
      if (user?.role === 'admin') {
        const snap = await adminDb.collection('affiliate_configs').get();
        const configs: Record<string, any> = {};
        snap.forEach((d) => { configs[d.id] = d.data(); });
        return res.json({ configs });
      }

      const ownId = user?.affiliateId ? String(user.affiliateId) : '';
      if (!ownId) return res.json({ configs: {} });

      // Própria config + (se especial ativo) as da sub-rede — mesmo escopo do proxy.
      const ids = new Set<string>([ownId]);
      try {
        const special = await resolveSpecialRecord(ownId);
        if (resolveIsSpecial(special)) {
          (special!.subAffiliateIds ?? []).forEach((s: any) => ids.add(String(s)));
        }
      } catch (e) {
        console.error('Erro ao carregar sub-rede p/ configs:', e);
      }

      const configs: Record<string, any> = {};
      await Promise.all([...ids].map(async (id) => {
        const d = await adminDb!.collection('affiliate_configs').doc(id).get();
        if (d.exists) configs[id] = d.data();
      }));
      return res.json({ configs });
    } catch (error: any) {
      console.error('[affiliate-configs] get:', error);
      return res.status(500).json({ error: error.message || 'Erro ao carregar configs.' });
    }
  });

  // Fase 3 (auditoria de dinheiro): a ESCRITA de CPA/REV é mediada aqui — o cliente
  // não grava mais `affiliate_configs` direto (rule: write server-only, nem admin).
  // Whitelist de campos (cpaValue/revPercentage/byBrand) preservando a AUSÊNCIA
  // (ausência≠R$0: campo omitido no body não entra no merge → nunca nasce 0 fantasma)
  // + trilha `config.update` com antes→depois no MESMO batch da gravação (atômico).
  // [[boost-audit-trail Fase 3]]
  app.patch('/api/affiliate-configs/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'affiliateId é obrigatório.' });
      const body = req.body ?? {};

      // Taxa válida = número finito ≥ 0. Inválido NÃO vira 0 (0 é taxa real;
      // ausência≠R$0) — devolve 400 pro editor corrigir.
      const rateNum = (v: unknown): number | null => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : null;
      };

      const patch: Record<string, unknown> = {};
      if ('cpaValue' in body) {
        const n = rateNum(body.cpaValue);
        if (n === null) return res.status(400).json({ error: 'cpaValue inválido (número ≥ 0).' });
        patch.cpaValue = n;
      }
      if ('revPercentage' in body) {
        const n = rateNum(body.revPercentage);
        if (n === null) return res.status(400).json({ error: 'revPercentage inválido (número ≥ 0).' });
        patch.revPercentage = n;
      }
      if ('byBrand' in body) {
        const raw = body.byBrand;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          return res.status(400).json({ error: 'byBrand deve ser um mapa casa → taxas.' });
        }
        const byBrand: Record<string, Record<string, number>> = {};
        for (const [brandId, rates] of Object.entries(raw as Record<string, unknown>)) {
          if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
            return res.status(400).json({ error: `byBrand['${brandId}'] deve ser um objeto de taxas.` });
          }
          const entry: Record<string, number> = {};
          const r = rates as Record<string, unknown>;
          if ('cpaValue' in r) {
            const n = rateNum(r.cpaValue);
            if (n === null) return res.status(400).json({ error: `byBrand['${brandId}'].cpaValue inválido (número ≥ 0).` });
            entry.cpaValue = n;
          }
          if ('revPercentage' in r) {
            const n = rateNum(r.revPercentage);
            if (n === null) return res.status(400).json({ error: `byBrand['${brandId}'].revPercentage inválido (número ≥ 0).` });
            entry.revPercentage = n;
          }
          byBrand[String(brandId)] = entry;
        }
        patch.byBrand = byBrand;
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'Nada para atualizar (cpaValue, revPercentage ou byBrand).' });
      }

      const ref = adminDb.collection('affiliate_configs').doc(id);
      const beforeSnap = await ref.get();
      const beforeCfg = beforeSnap.exists ? (beforeSnap.data() as any) : undefined;

      // VIGÊNCIA (a mesma regra do gerente vale para o admin, senão o mesmo campo
      // teria dois comportamentos). O patch é PARCIAL — pode vir só o CPA —, então a
      // taxa nova é o par COMPLETO: o que veio no corpo por cima do que já valia.
      // Sem isso, mudar só o CPA fecharia o segmento com um REV zerado.
      // O patch é PARCIAL (pode vir só o CPA). Completar o par é papel do núcleo,
      // que preserva a ausência do campo que nunca foi configurado; completar aqui
      // com `num(cur.revPercentage)` gravaria um REV 0 fantasma em quem só tem CPA.
      // Passa-se ADIANTE apenas o que veio no corpo.
      const requested = patch as Record<string, any>;
      if ('cpaValue' in requested || 'revPercentage' in requested) {
        Object.assign(requested, withRateHistory(currentRateEntry(beforeCfg, null), requested));
      }
      if (requested.byBrand) {
        const nextByBrand: Record<string, any> = {};
        for (const [brandId, rates] of Object.entries(requested.byBrand as Record<string, any>)) {
          nextByBrand[brandId] = withRateHistory(currentRateEntry(beforeCfg, brandId), rates);
        }
        requested.byBrand = nextByBrand;
      }

      const changes = diffChanges(
        beforeCfg,
        patch,
        ['cpaValue', 'revPercentage', 'byBrand'],
      );

      const batch = adminDb.batch();
      // merge:true → editar só o topo preserva byBrand e vice-versa (mesma semântica
      // do setDoc antigo do cliente).
      batch.set(ref, {
        ...patch,
        affiliateId: id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (changes.length) {
        appendAuditLog(batch, req, {
          entityType: 'affiliate_config',
          entityId: id,
          entityLabel: await affiliateNameOf(id),
          action: 'config.update',
          changes,
        });
      }
      await batch.commit();

      return res.json({ affiliateId: id, updated: Object.keys(patch), changed: changes.length });
    } catch (error: any) {
      console.error('[affiliate-configs] patch:', error);
      return res.status(500).json({ error: error.message || 'Erro ao salvar comissão.' });
    }
  });

  // Funil da v1 analítica (cliques/cadastros/FTD/NGR), escopado por papel como
  // affiliate-configs: admin vê tudo; afiliado vê só o próprio (+ sub-rede se especial
  // ativo). Dado sensível mediado pelo servidor — cliente NUNCA lê affiliate_analytics
  // direto (rule admin-only). [[espelha /api/affiliate-configs]]
  app.get('/api/affiliate-analytics', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const user = (req as any).user;
      if (user?.role === 'admin') {
        const snap = await adminDb.collection('affiliate_analytics').get();
        const analytics: any[] = [];
        snap.forEach((d) => analytics.push({ id: d.id, ...d.data() }));
        return res.json({ analytics });
      }

      const ownId = user?.affiliateId ? String(user.affiliateId) : '';
      if (!ownId) return res.json({ analytics: [] });

      const ids = new Set<string>([ownId]);
      try {
        const special = await resolveSpecialRecord(ownId);
        if (resolveIsSpecial(special)) {
          (special!.subAffiliateIds ?? []).forEach((s: any) => ids.add(String(s)));
        }
      } catch (e) {
        console.error('Erro ao carregar sub-rede p/ analytics:', e);
      }

      const analytics: any[] = [];
      await Promise.all(
        [...ids].map(async (id) => {
          const snap = await adminDb!.collection('affiliate_analytics').where('affiliateId', '==', id).get();
          snap.forEach((d) => analytics.push({ id: d.id, ...d.data() }));
        })
      );
      return res.json({ analytics });
    } catch (error: any) {
      console.error('[affiliate-analytics] get:', error);
      return res.status(500).json({ error: error.message || 'Erro ao carregar analytics.' });
    }
  });

  app.patch('/api/affiliates/:affiliateId', requireAdmin, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }

    try {
      const { affiliateId } = req.params;
      const { status, reason } = req.body ?? {};

      if (!affiliateId) {
        return res.status(400).json({ error: 'affiliateId é obrigatório.' });
      }

      if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({ error: 'Status inválido. Use active ou inactive.' });
      }

      await adminDb.collection('affiliate_statuses').doc(String(affiliateId)).set({
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Auditoria server-side (substitui o log que era feito pelo cliente).
      await writeAuditLog(req, {
        entityType: 'affiliate',
        entityId: affiliateId,
        action: status === 'active' ? 'affiliate.activate' : 'affiliate.deactivate',
        reason: reason != null && String(reason).trim() ? String(reason).trim() : null,
      });

      return res.json({ affiliateId, status });
    } catch (error: any) {
      console.error('Error updating affiliate status:', error);
      return res.status(500).json({ error: error.message || 'Erro interno atualizando status.' });
    }
  });

  app.get('/api/audit-logs', requireAdmin, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }

    try {
      // ?limit= (default 200, teto 1000). ?entityType=&entityId= filtram o histórico
      // de UMA entidade. Filtro = equality-only (where ==) SEM orderBy → não exige
      // índice composto no Firestore; nesse caso ordenamos por createdAt em memória.
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 1000) : 200;
      const entityType = typeof req.query.entityType === 'string' ? req.query.entityType.trim() : '';
      const entityId = typeof req.query.entityId === 'string' ? req.query.entityId.trim() : '';

      let snapshot;
      let sortInMemory = false;
      if (entityType) {
        // Histórico por entidade: where equality (auto-indexado), ordena em memória.
        let q: any = adminDb.collection('audit_logs').where('entityType', '==', entityType);
        if (entityId) q = q.where('entityId', '==', entityId);
        snapshot = await q.limit(limit).get();
        sortInMemory = true;
      } else {
        snapshot = await adminDb
          .collection('audit_logs')
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get();
      }

      // Extrator defensivo de millis (Timestamp do Admin SDK → toMillis; sentinel/ausente → 0).
      const millisOf = (ts: any): number =>
        ts?.toMillis ? ts.toMillis() : (typeof ts?._seconds === 'number' ? ts._seconds * 1000 : 0);

      let docs = snapshot.docs;
      if (sortInMemory) {
        docs = [...docs].sort((a: any, b: any) => millisOf(b.data()?.createdAt) - millisOf(a.data()?.createdAt));
      }

      const logs = docs.map((item: any) => {
        const data = item.data();
        return {
          id: item.id,
          ...data,
          createdAt: serializeTimestamp(data.createdAt),
          updatedAt: serializeTimestamp(data.updatedAt)
        };
      });

      return res.json(logs);
    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      return res.status(500).json({ error: error.message || 'Erro interno listando logs.' });
    }
  });

  app.post('/api/audit-logs', requireAdmin, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }

    try {
      const { affiliateId, actorId, actorName, action, reason } = req.body ?? {};

      if (!affiliateId || !action) {
        return res.status(400).json({ error: 'affiliateId e action são obrigatórios.' });
      }

      const payload = {
        affiliateId: String(affiliateId),
        actorId: actorId ? String(actorId) : null,
        actorName: actorName ? String(actorName) : null,
        action: String(action),
        reason: reason ? String(reason) : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const docRef = await adminDb.collection('audit_logs').add(payload);

      return res.status(201).json({
        id: docRef.id,
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error creating audit log:', error);
      return res.status(500).json({ error: error.message || 'Erro interno criando log.' });
    }
  });

  // --- Avisos / comunicados da rede (notices) -------------------------------
  // Feed broadcast: o admin publica, o afiliado lê (realtime, regra signed-in).
  // Escrita só pelo servidor (requireAdmin), com saneamento de tamanho/enum.
  const NOTICE_CATEGORIES = ['info', 'importante', 'comunicado'];
  const NOTICE_AUDIENCES = ['all', 'clients', 'specials'];

  const sanitizeNotice = (body: any) => {
    const title = String(body?.title ?? '').trim().slice(0, 160);
    const text = String(body?.body ?? '').trim().slice(0, 5000);
    const category = NOTICE_CATEGORIES.includes(body?.category) ? body.category : 'info';
    const audience = NOTICE_AUDIENCES.includes(body?.audience) ? body.audience : 'all';
    const link = body?.link ? String(body.link).trim().slice(0, 500) : '';
    return { title, text, category, audience, link };
  };

  app.post('/api/notices', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const { title, text, category, audience, link } = sanitizeNotice(req.body);
      if (!title || !text) {
        return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
      }
      const active = req.body?.active === undefined ? true : !!req.body.active;
      const payload = {
        title,
        body: text,
        category,
        audience,
        link: link || null,
        active,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const docRef = await adminDb.collection('notices').add(payload);
      return res.status(201).json({ id: docRef.id, ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    } catch (error: any) {
      console.error('Error creating notice:', error);
      return res.status(500).json({ error: error.message || 'Erro interno criando aviso.' });
    }
  });

  app.patch('/api/notices/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const id = String(req.params.id);
      const patch: Record<string, any> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (req.body?.title !== undefined) patch.title = String(req.body.title).trim().slice(0, 160);
      if (req.body?.body !== undefined) patch.body = String(req.body.body).trim().slice(0, 5000);
      if (req.body?.category !== undefined) patch.category = NOTICE_CATEGORIES.includes(req.body.category) ? req.body.category : 'info';
      if (req.body?.audience !== undefined) patch.audience = NOTICE_AUDIENCES.includes(req.body.audience) ? req.body.audience : 'all';
      if (req.body?.link !== undefined) patch.link = req.body.link ? String(req.body.link).trim().slice(0, 500) : null;
      if (req.body?.active !== undefined) patch.active = !!req.body.active;
      await adminDb.collection('notices').doc(id).set(patch, { merge: true });
      return res.json({ id, updated: true });
    } catch (error: any) {
      console.error('Error updating notice:', error);
      return res.status(500).json({ error: error.message || 'Erro interno atualizando aviso.' });
    }
  });

  app.delete('/api/notices/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      await adminDb.collection('notices').doc(String(req.params.id)).delete();
      return res.json({ deleted: true });
    } catch (error: any) {
      console.error('Error deleting notice:', error);
      return res.status(500).json({ error: error.message || 'Erro interno removendo aviso.' });
    }
  });

  // --- Premiações do ranking (ranking_prizes) --------------------------------
  // Chamariz de captação: o admin cadastra prêmios por posição do ranking; a
  // Home pública exibe (regra de leitura pública) e o /ranking mostra no pódio.
  // Escrita só pelo servidor (requireAdmin), saneamento puro em src/lib/prizes.
  app.post('/api/prizes', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const parsed = sanitizePrize(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const payload = {
        ...parsed.value,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const docRef = await adminDb.collection('ranking_prizes').add(payload);
      return res.status(201).json({ id: docRef.id, ...parsed.value });
    } catch (error: any) {
      console.error('Error creating prize:', error);
      return res.status(500).json({ error: error.message || 'Erro interno criando premiação.' });
    }
  });

  app.patch('/api/prizes/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const parsed = sanitizePrizePatch(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      await adminDb.collection('ranking_prizes').doc(String(req.params.id)).set(
        { ...parsed.patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
      return res.json({ id: String(req.params.id), updated: true });
    } catch (error: any) {
      console.error('Error updating prize:', error);
      return res.status(500).json({ error: error.message || 'Erro interno atualizando premiação.' });
    }
  });

  app.delete('/api/prizes/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      await adminDb.collection('ranking_prizes').doc(String(req.params.id)).delete();
      return res.json({ deleted: true });
    } catch (error: any) {
      console.error('Error deleting prize:', error);
      return res.status(500).json({ error: error.message || 'Erro interno removendo premiação.' });
    }
  });

  // --- Conquistas (achievement_tiers + achievement_requests) ----------------
  // Premiação por META INDIVIDUAL do afiliado (CPAs e/ou comissão acumulada),
  // portada do "Ranking de Conquistas" do legado. Não confundir com
  // `ranking_prizes`, que premia POSIÇÃO no ranking diário.
  //
  // `achievement_tiers` é o catálogo (leitura por qualquer logado — é o roadmap
  // que o afiliado persegue; escrita só aqui). `achievement_requests` guarda o
  // pedido do afiliado + o snapshot dos números dele → server-only nas rules
  // (expor a coleção vazaria ganho de um afiliado para os outros).
  app.post('/api/achievement-tiers', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const parsed = sanitizeTier(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const docRef = await adminDb.collection('achievement_tiers').add({
        ...parsed.value,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await writeAuditLog(req, {
        entityType: 'achievement_tier',
        entityId: docRef.id,
        entityLabel: parsed.value!.title,
        action: 'achievement_tier.create',
      });
      return res.status(201).json({ id: docRef.id, ...parsed.value });
    } catch (error: any) {
      console.error('Error creating achievement tier:', error);
      return res.status(500).json({ error: error.message || 'Erro interno criando conquista.' });
    }
  });

  app.patch('/api/achievement-tiers/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const parsed = sanitizeTierPatch(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const ref = adminDb.collection('achievement_tiers').doc(String(req.params.id));
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Conquista não encontrada.' });
      const before = snap.data() as any;
      // A regra "ao menos uma meta > 0" é do TIER, não do patch: só dá para
      // validar combinando o patch com o que já está gravado.
      const merged = { ...before, ...parsed.patch };
      if (!(Number(merged.metaCpas) > 0) && !(Number(merged.metaCommission) > 0)) {
        return res.status(400).json({ error: 'Defina ao menos uma meta (CPAs ou comissão em R$) maior que zero.' });
      }
      await ref.set(
        { ...parsed.patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
      const changes = diffChanges(before, parsed.patch, [
        'title', 'subtitle', 'description', 'metaCpas', 'metaCommission', 'order', 'active',
      ]);
      if (changes.length > 0) {
        await writeAuditLog(req, {
          entityType: 'achievement_tier',
          entityId: ref.id,
          entityLabel: merged.title,
          action: 'achievement_tier.update',
          changes,
        });
      }
      return res.json({ id: ref.id, updated: true });
    } catch (error: any) {
      console.error('Error updating achievement tier:', error);
      return res.status(500).json({ error: error.message || 'Erro interno atualizando conquista.' });
    }
  });

  app.delete('/api/achievement-tiers/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const id = String(req.params.id);
      const snap = await adminDb.collection('achievement_tiers').doc(id).get();
      await adminDb.collection('achievement_tiers').doc(id).delete();
      await writeAuditLog(req, {
        entityType: 'achievement_tier',
        entityId: id,
        entityLabel: (snap.data() as any)?.title ?? id,
        action: 'achievement_tier.delete',
      });
      return res.json({ deleted: true });
    } catch (error: any) {
      console.error('Error deleting achievement tier:', error);
      return res.status(500).json({ error: error.message || 'Erro interno removendo conquista.' });
    }
  });

  // O afiliado solicita o prêmio de um tier que atingiu. O snapshot enviado é
  // DECLARATÓRIO (exibição para o admin) — a aprovação é humana, conferida
  // contra os números do /admin, então um cliente mentindo no corpo não gera
  // prêmio sozinho. Idempotente: pedido vivo (pendente/aprovado) → 409.
  app.post('/api/achievement-requests', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const user = (req as any).user;
      const affiliateId = String(user?.affiliateId ?? '').trim();
      if (!affiliateId) {
        return res.status(403).json({ error: 'Sua conta não está vinculada a um afiliado.' });
      }
      const tierId = String(req.body?.tierId ?? '').trim();
      if (!tierId) return res.status(400).json({ error: 'tierId é obrigatório.' });

      const tierSnap = await adminDb.collection('achievement_tiers').doc(tierId).get();
      if (!tierSnap.exists) return res.status(404).json({ error: 'Conquista não encontrada.' });
      const tier = tierSnap.data() as any;
      if (tier?.active === false) return res.status(409).json({ error: 'Esta conquista não está mais disponível.' });

      const dup = await adminDb
        .collection('achievement_requests')
        .where('affiliateId', '==', affiliateId)
        .where('tierId', '==', tierId)
        .get();
      // Rejeitada não bloqueia: o afiliado pode pedir de novo (mesma regra de
      // `canRequestTier`).
      if (dup.docs.some((d) => (d.data() as any)?.status !== 'rejected')) {
        return res.status(409).json({ error: 'Você já solicitou este prêmio.' });
      }

      const affSnap = await adminDb.collection('affiliates').doc(affiliateId).get();
      const payload = {
        tierId,
        tierTitle: String(tier?.title ?? ''),
        affiliateId,
        affiliateName: (affSnap.exists ? (affSnap.data() as any)?.name : null) || user?.email || affiliateId,
        status: 'pending',
        snapshot: {
          cpas: Number(req.body?.snapshot?.cpas) || 0,
          commission: Number(req.body?.snapshot?.commission) || 0,
        },
        requestedByUid: user?.uid ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const docRef = await adminDb.collection('achievement_requests').add(payload);
      return res.status(201).json({ id: docRef.id, ...payload });
    } catch (error: any) {
      console.error('Error creating achievement request:', error);
      return res.status(500).json({ error: error.message || 'Erro interno solicitando prêmio.' });
    }
  });

  // Admin vê todas; afiliado só as próprias (a coleção é server-only nas rules).
  app.get('/api/achievement-requests', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const user = (req as any).user;
      let query: admin.firestore.Query = adminDb.collection('achievement_requests');
      if (user?.role !== 'admin') {
        const affiliateId = String(user?.affiliateId ?? '').trim();
        if (!affiliateId) return res.json({ requests: [] });
        query = query.where('affiliateId', '==', affiliateId);
      }
      const snap = await query.get();
      const requests = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      return res.json({ requests });
    } catch (error: any) {
      console.error('Error listing achievement requests:', error);
      return res.status(500).json({ error: error.message || 'Erro interno listando solicitações.' });
    }
  });

  app.patch('/api/achievement-requests/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const status = String(req.body?.status ?? '').trim();
      if (status !== 'approved' && status !== 'rejected') {
        return res.status(400).json({ error: 'Status inválido. Use approved ou rejected.' });
      }
      const ref = adminDb.collection('achievement_requests').doc(String(req.params.id));
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Solicitação não encontrada.' });
      const before = snap.data() as any;
      if (before?.status !== 'pending') {
        return res.status(409).json({ error: 'Esta solicitação já foi decidida.' });
      }
      const note = String(req.body?.note ?? '').trim().slice(0, 300);
      await ref.set(
        {
          status,
          note,
          decidedByUid: (req as any).user?.uid ?? null,
          decidedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // Avisa o afiliado no sino (best-effort: sem login vinculado não há a quem
      // entregar, e isso não pode derrubar a decisão do admin).
      try {
        const usersSnap = await adminDb
          .collection('users')
          .where('affiliateId', '==', String(before?.affiliateId ?? ''))
          .get();
        if (!usersSnap.empty) {
          const batch = adminDb.batch();
          const title = status === 'approved' ? 'Conquista aprovada! 🏆' : 'Solicitação de prêmio recusada';
          const body =
            status === 'approved'
              ? `Seu prêmio "${before?.tierTitle ?? 'conquista'}" foi aprovado.${note ? ` ${note}` : ''}`
              : `A solicitação do prêmio "${before?.tierTitle ?? 'conquista'}" não foi aprovada.${note ? ` ${note}` : ''}`;
          usersSnap.forEach((u) => {
            batch.set(adminDb!.collection('user_notifications').doc(), {
              recipientUid: u.id,
              affiliateId: before?.affiliateId ?? null,
              type: status === 'approved' ? 'achievement_approved' : 'achievement_rejected',
              title,
              body,
              readAt: null,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          });
          await batch.commit();
        }
      } catch (notifyError) {
        console.error('Error notifying achievement decision:', notifyError);
      }

      await writeAuditLog(req, {
        entityType: 'achievement_request',
        entityId: ref.id,
        entityLabel: `${before?.affiliateName ?? before?.affiliateId} · ${before?.tierTitle ?? ''}`,
        action: status === 'approved' ? 'achievement_request.approve' : 'achievement_request.reject',
        reason: note || undefined,
      });
      return res.json({ id: ref.id, status });
    } catch (error: any) {
      console.error('Error deciding achievement request:', error);
      return res.status(500).json({ error: error.message || 'Erro interno decidindo solicitação.' });
    }
  });

  // --- Contato de suporte da instância (aba Suporte → WhatsApp do operador) ---
  // Mora em `settings/support_contact`, e `settings` é admin-only nas rules
  // (tem forma de credencial) — por isso o afiliado lê por AQUI, não direto.
  app.get('/api/support-contact', requireAuth, async (_req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const snap = await adminDb.collection('settings').doc('support_contact').get();
      if (!snap.exists) return res.json({ contact: SUPPORT_CONTACT_EMPTY });
      const data = snap.data() as any;
      return res.json({
        contact: {
          phone: String(data?.phone ?? ''),
          message: String(data?.message ?? ''),
          label: String(data?.label ?? SUPPORT_CONTACT_EMPTY.label),
          active: !!data?.active,
        },
      });
    } catch (error: any) {
      console.error('Error fetching support contact:', error);
      return res.status(500).json({ error: error.message || 'Erro interno lendo contato de suporte.' });
    }
  });

  app.put('/api/support-contact', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const parsed = sanitizeSupportContact(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const ref = adminDb.collection('settings').doc('support_contact');
      const before = (await ref.get()).data() ?? {};
      await ref.set(
        { ...parsed.value, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
      const changes = diffChanges(before, parsed.value!, ['phone', 'message', 'label', 'active']);
      if (changes.length > 0) {
        await writeAuditLog(req, {
          entityType: 'settings',
          entityId: 'support_contact',
          entityLabel: 'Contato de suporte',
          action: 'support_contact.update',
          changes,
        });
      }
      return res.json({ contact: parsed.value });
    } catch (error: any) {
      console.error('Error saving support contact:', error);
      return res.status(500).json({ error: error.message || 'Erro interno salvando contato de suporte.' });
    }
  });

  // --- Vitrine AffiliaCore (opt-in da agência na LP do produto) ---------------
  // A agência escolhe aparecer na seção "clientes" de affiliacore.com.br e escreve
  // a própria apresentação. Mora em `settings/showcase` (admin-only nas rules); a
  // LP lê o payload PÚBLICO montado por buildShowcasePayload — quando a vitrine
  // está desligada, a resposta é só {enabled:false} (o rascunho salvo nunca vaza).
  app.get('/api/showcase', async (_req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    // A LP busca cross-origin; o payload é público por definição (só sai o que a
    // agência optou por exibir), então o CORS aberto aqui não expõe nada a mais.
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const snap = await adminDb.collection('settings').doc('showcase').get();
      return res.json(
        buildShowcasePayload(snap.exists ? (snap.data() as any) : null, {
          name: BRAND.name,
          accent: process.env.VITE_BRAND_ACCENT,
          logoUrl: BRAND.logoUrl,
          logoLightUrl: BRAND.logoLightUrl,
          logoDarkUrl: BRAND.logoDarkUrl,
        }),
      );
    } catch (error: any) {
      console.error('Error building showcase payload:', error);
      return res.status(500).json({ error: error.message || 'Erro interno lendo a vitrine.' });
    }
  });

  // Editor do admin lê a config CRUA (inclusive rascunho com a vitrine desligada).
  app.get('/api/showcase-config', requireAdmin, async (_req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const snap = await adminDb.collection('settings').doc('showcase').get();
      const data = (snap.exists ? snap.data() : null) as any;
      return res.json({
        showcase: {
          enabled: data?.enabled === true,
          description: String(data?.description ?? ''),
          siteUrl: String(data?.siteUrl ?? ''),
        },
      });
    } catch (error: any) {
      console.error('Error fetching showcase config:', error);
      return res.status(500).json({ error: error.message || 'Erro interno lendo a config da vitrine.' });
    }
  });

  app.put('/api/showcase-config', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const parsed = sanitizeShowcase(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const ref = adminDb.collection('settings').doc('showcase');
      const before = (await ref.get()).data() ?? {};
      await ref.set(
        { ...parsed.value, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
      const changes = diffChanges(before, { ...parsed.value! }, ['enabled', 'description', 'siteUrl']);
      if (changes.length > 0) {
        await writeAuditLog(req, {
          entityType: 'settings',
          entityId: 'showcase',
          entityLabel: 'Vitrine AffiliaCore',
          action: 'showcase.update',
          changes,
        });
      }
      return res.json({ showcase: parsed.value });
    } catch (error: any) {
      console.error('Error saving showcase config:', error);
      return res.status(500).json({ error: error.message || 'Erro interno salvando a vitrine.' });
    }
  });

  // --- Mensagens diretas da gerência → afiliado (popup 1:1) -----------------
  // O admin envia escolhendo o afiliado; resolvemos o(s) login(s) vinculado(s)
  // (users.affiliateId) e gravamos `recipientUid` em cada mensagem — a leitura é
  // escopada por recipientUid na regra (query segura, sem get()). Se o afiliado
  // ainda não tem login Boost, não há pra quem entregar o popup → 409 informativo.
  app.post('/api/direct-messages', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const affiliateId = String(req.body?.affiliateId ?? '').trim();
      const title = String(req.body?.title ?? '').trim().slice(0, 160);
      const text = String(req.body?.body ?? '').trim().slice(0, 5000);
      if (!affiliateId) return res.status(400).json({ error: 'affiliateId é obrigatório.' });
      if (!title || !text) return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });

      // Logins vinculados ao afiliado.
      const usersSnap = await adminDb.collection('users').where('affiliateId', '==', affiliateId).get();
      if (usersSnap.empty) {
        return res.status(409).json({ error: 'Este afiliado ainda não tem login vinculado: não há para quem entregar a mensagem.' });
      }

      // Nome do afiliado (mirror) e nome do remetente (admin) p/ exibição.
      const affSnap = await adminDb.collection('affiliates').doc(affiliateId).get();
      const affiliateName = (affSnap.exists ? (affSnap.data() as any)?.name : null)
        || (usersSnap.docs[0].data() as any)?.name || 'Afiliado';
      const adminSnap = await adminDb.collection('users').doc((req as any).user.uid).get();
      const createdByName = (adminSnap.exists ? (adminSnap.data() as any)?.name : null) || `Gerência ${BRAND.shortName}`;

      const batch = adminDb.batch();
      let delivered = 0;
      usersSnap.forEach((u) => {
        const ref = adminDb!.collection('direct_messages').doc();
        batch.set(ref, {
          recipientUid: u.id,
          affiliateId,
          affiliateName,
          title,
          body: text,
          createdByName,
          readAt: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        delivered++;
      });
      await batch.commit();
      return res.status(201).json({ delivered });
    } catch (error: any) {
      console.error('Error sending direct message:', error);
      return res.status(500).json({ error: error.message || 'Erro interno enviando mensagem.' });
    }
  });

  // Marca a própria mensagem como lida (após o afiliado fechar o popup).
  app.post('/api/direct-messages/:id/read', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const id = String(req.params.id);
      const ref = adminDb.collection('direct_messages').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Mensagem não encontrada.' });
      if ((snap.data() as any)?.recipientUid !== (req as any).user.uid) {
        return res.status(403).json({ error: 'Você não pode alterar esta mensagem.' });
      }
      await ref.set({ readAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return res.json({ read: true });
    } catch (error: any) {
      console.error('Error marking direct message read:', error);
      return res.status(500).json({ error: error.message || 'Erro interno marcando leitura.' });
    }
  });

  // --- Ranking diário (snapshot calculado no servidor) ----------------------
  // O afiliado não consegue montar o leaderboard sozinho (o proxy o escopa ao
  // próprio id). Então o admin dispara o cálculo: buscamos os results do DIA
  // (groupBy=affiliate, paginado como o partner-api), calculamos o repasse de cada
  // afiliado (qualified_cpa·CPA + rvs·REV%, taxa default do afiliado) e gravamos
  // daily_rankings/{data} — que todo afiliado lê (leaderboard público com nomes).
  const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;

  // Cotações do dia p/ derivar a comissão das casas manuais em moeda estrangeira.
  // Best-effort via o fetch INJETADO (mesma DI da OTG) → testável e sem rede real nos
  // testes; nunca lança, cai nos fallbacks. Espelha currency.ts (client) sem o cache de
  // módulo do browser. Usa .text()+JSON.parse (igual ao proxy OTG).
  async function fetchFxQuotesForServer(): Promise<FxQuotes> {
    const fallback: FxQuotes = {
      EUR: { rate: FALLBACK_EUR_BRL, live: false, fetchedAt: 0 },
      USD: { rate: FALLBACK_USD_BRL, live: false, fetchedAt: 0 },
    };
    try {
      const resp = await fetchImpl('https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL', {
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) return fallback;
      const text = await resp.text();
      const payload = text ? JSON.parse(text) : null;
      const out = { ...fallback };
      for (const code of ['EUR', 'USD'] as const) {
        const rate = parseFxRate(payload, code) ?? (code === 'EUR' ? parseEurBrlRate(payload) : null);
        if (rate != null) out[code] = { rate, live: true, fetchedAt: Date.now() };
      }
      return out;
    } catch {
      return fallback;
    }
  }

  // Núcleo REUSÁVEL da geração do ranking (fonte única — CLAUDE.md): pagina os results
  // do dia, soma a comissão BRUTA de cada afiliado (mesma base dos dashboards: OTG
  // total_commission + manual derivado da taxa da casa) e grava daily_rankings/{date}.
  // Reusado pela rota admin (botão) E pela rota de cron. Lança em falha dura (Error.status
  // p/ o chamador mapear); code "040" (sem dados) não é erro → grava ranking vazio.
  async function computeAndStoreRanking(
    date: string,
    generatedByName: string,
  ): Promise<{ date: string; count: number; entries: any[] }> {
    if (!adminDb) throw Object.assign(new Error('Firebase Admin não está inicializado.'), { status: 500 });

    // Resultados do dia na OTG, todas as páginas (a OTG entrega pageSize=50).
    // P2: instância OTG-free pula este trecho inteiro (ranking sai só das casas
    // manuais) — e não exige AFFILIATE_API_KEY.
    const rows: any[] = [];
    if (OTG_ENABLED) {
      const BASE_URL = process.env.VITE_AFFILIATE_API_BASE_URL || 'https://affiliate-api-prd.partnersotg.com';
      const apiKey = process.env.AFFILIATE_API_KEY;
      if (!apiKey) throw Object.assign(new Error('Chave de API externa não configurada.'), { status: 500 });

      const baseParams = new URLSearchParams();
      baseParams.set('startDate', date);
      baseParams.set('endDate', date);
      baseParams.set('groupBy', 'affiliate');
      const MAX_PAGES = 50;
      let page = 1;
      let totalPages = 1;
      do {
        const params = new URLSearchParams(baseParams);
        params.set('page', String(page));
        const resp = await fetchImpl(`${BASE_URL}/api/v2/external/results?${params.toString()}`, {
          headers: { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': 'AgenciaBoost-App/1.0' },
        });
        const text = await resp.text();
        let body: any = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        if (!resp.ok) {
          const requestId = crypto.randomBytes(8).toString('hex');
          console.error(`[rankings] ${requestId} results upstream ${resp.status} (page ${page}):`, text);
          // code "040" (sem dados) não é erro: grava ranking vazio.
          if (body?.code === '040') break;
          throw Object.assign(new Error('Falha ao consultar o relatório do dia.'), { status: 502, code: body?.code, requestId });
        }
        const d = body?.data;
        const pageRows = Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : (Array.isArray(body) ? body : []));
        rows.push(...pageRows);
        const tp = Number(d?.meta?.totalPages);
        totalPages = Number.isFinite(tp) && tp > 0 ? tp : 1;
        page++;
      } while (page <= totalPages && page <= MAX_PAGES);
    }

    // Resultados MANUAIS do dia (house_results atribuídos). Entram no ranking com a
    // MESMA comissão bruta dos dashboards; a linha manual tem total_commission=0, então
    // a comissão é DERIVADA pela taxa da casa (houseRateOf abaixo). Sem isso o ranking
    // via só a OTG e saía zerado enquanto a produção estava nas casas manuais.
    const manualSnap = await adminDb.collection('house_results').where('date', '==', date).get();
    const manualRows: any[] = [];
    manualSnap.forEach((d) => manualRows.push(d.data()));

    // Nome do afiliado (mirror). A métrica é a comissão BRUTA por afiliado (total_commission
    // da OTG + comissão derivada das casas manuais) — NÃO depende mais de affiliate_configs;
    // a produção real é quase toda REV-share e as configs eram só-CPA, zerando o ranking.
    const affSnap = await adminDb.collection('affiliates').get();
    const names: Record<string, string> = {};
    affSnap.forEach((d) => {
      const v = d.data() as any;
      if (v?.name) names[d.id] = String(v.name);
    });

    // Taxa das casas manuais p/ derivar a comissão das linhas com total_commission=0.
    // defaultCpa é gravado NA MOEDA DA CASA (`cpaCurrency`, ausente = EUR) → normaliza p/
    // BRL pela cotação da casa (fixa, ou a do dia best-effort), IGUAL ao /admin (houseRateOf).
    // Só busca cotação/casas quando há linha manual — a OTG já traz total_commission em R$.
    let houseRateOf: ((slug: string | undefined) => { defaultCpa: number; defaultRev: number } | undefined) | undefined;
    if (manualRows.length) {
      const quotes = await fetchFxQuotesForServer();
      const housesSnap = await adminDb.collection('houses').get();
      const rateBySlug = new Map<string, { defaultCpa: number; defaultRev: number }>();
      housesSnap.forEach((d) => {
        const v = d.data() as any;
        rateBySlug.set(d.id, {
          defaultCpa: houseCpaToBrl(v?.defaultCpa, v, quotes),
          defaultRev: Number(v?.defaultRev) || 0,
        });
      });
      houseRateOf = (slug) => (slug ? rateBySlug.get(slug) : undefined);
    }

    // Comissão bruta por afiliado (mesma base do /admin): OTG (total_commission) + manual
    // (derivado da taxa da casa). Ver src/lib/ranking.ts p/ a métrica.
    const entries = computeRankingEntries([...rows, ...manualRows], {
      nameById: names,
      houseRateOf,
    });

    await adminDb.collection('daily_rankings').doc(date).set({
      date,
      entries,
      count: entries.length,
      metric: 'commission',
      generatedByName,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { date, count: entries.length, entries };
  }

  // Lembrete diário aos admins (popup de mensagem direta), CIENTE do resultado da
  // geração automática: gerou com dados / sem dados (OTG ainda não atualizou) / falhou.
  // Garante que o admin master seja avisado todo dia (rede de segurança caso o cron
  // não rode/falhe). Id determinístico por (date,uid) → no máx. 1 lembrete por admin
  // por dia (re-run no mesmo dia ATUALIZA o doc, não acumula).
  async function sendRankingReminderToAdmins(
    date: string,
    outcome: { ok: boolean; count: number; error?: string },
  ): Promise<number> {
    if (!adminDb) return 0;
    const adminsSnap = await adminDb.collection('users').where('role', '==', 'admin').get();
    // Por padrão só o admin MASTER recebe o lembrete (MASTER_ADMIN_EMAIL, case-insensitive).
    // Sem a env — ou se o e-mail não casar com nenhum admin — cai p/ TODOS os admins
    // (fallback seguro: alguém sempre é avisado; o warn sinaliza a má-config).
    const masterEmail = (process.env.MASTER_ADMIN_EMAIL || '').trim().toLowerCase();
    let recipients = adminsSnap.docs;
    if (masterEmail) {
      const matched = adminsSnap.docs.filter(
        (u) => String((u.data() as any)?.email || '').trim().toLowerCase() === masterEmail,
      );
      if (matched.length) recipients = matched;
      else console.warn(`[cron] MASTER_ADMIN_EMAIL "${masterEmail}" sem admin correspondente; lembrete vai a todos os admins.`);
    }
    let title: string;
    let body: string;
    if (outcome.ok && outcome.count > 0) {
      title = `Ranking de ${date} gerado`;
      body = `O ranking diário foi gerado automaticamente com ${pluralize(outcome.count, 'afiliado')}. Confira em /ranking.`;
    } else if (outcome.ok) {
      title = `Ranking de ${date} sem dados`;
      body = `A geração automática rodou, mas não há resultados registrados para ${date}. Verifique em /ranking.`;
    } else {
      title = `Falha ao gerar o ranking de ${date}`;
      body = `A geração automática falhou${outcome.error ? ` (${outcome.error})` : ''}. Gere manualmente em /ranking.`;
    }
    let sent = 0;
    for (const u of recipients) {
      await adminDb.collection('direct_messages').doc(`ranking-reminder__${date}__${u.id}`).set({
        recipientUid: u.id,
        affiliateId: 'system',
        affiliateName: 'Sistema',
        title,
        body,
        createdByName: `Sistema ${BRAND.shortName}`,
        readAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      sent++;
    }
    return sent;
  }

  // Gate de cron interno: secret de alto-entropia no header `x-cron-secret`, comparado
  // em tempo constante. Sem RANKING_CRON_SECRET no ambiente → 503 (feature off). Permite
  // que um scheduler externo (Cloud Scheduler) dispare rotinas SEM um token de admin
  // Firebase — que ele não tem como obter. NÃO use em rotas de dado sensível por papel.
  const requireCronSecret: express.RequestHandler = (req, res, next) => {
    const secret = process.env.RANKING_CRON_SECRET || '';
    if (!secret) return res.status(503).json({ error: 'Cron não configurado (defina RANKING_CRON_SECRET).' });
    const provided = String(req.headers['x-cron-secret'] || '');
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Secret de cron inválido.' });
    }
    next();
  };

  app.post('/api/rankings/compute', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    // Data: a do corpo (browser, fuso BR) ou hoje no servidor como fallback.
    const date = isoDateRe.test(String(req.body?.date)) ? String(req.body.date) : resolveServerToday();
    try {
      const adminSnap = await adminDb.collection('users').doc((req as any).user.uid).get();
      const generatedByName = (adminSnap.exists ? (adminSnap.data() as any)?.name : null) || `Gerência ${BRAND.shortName}`;
      const result = await computeAndStoreRanking(date, generatedByName);
      return res.json({ ...result, generatedAt: new Date().toISOString() });
    } catch (error: any) {
      console.error('[rankings] compute:', error);
      return res.status(error.status || 500).json({ error: error.message || 'Erro interno calculando ranking.', code: error.code });
    }
  });

  // Gatilho DIÁRIO (Cloud Scheduler ~14h30 BR). Gera o ranking de ONTEM no fuso BR
  // (resolveServerYesterday) — a OTG só FECHA os resultados de um dia no dia seguinte, então
  // "hoje" às 14h30 vem quase sempre vazio; ontem é o último dia completo. Manda um
  // lembrete/relatório aos admins. Secret-gated (fora do requireAdmin — um cron não tem
  // token Firebase). Idempotente: re-rodar no mesmo dia sobrescreve o ranking e o lembrete.
  // Responde 200 mesmo "sem dados" (o scheduler não deve re-tentar por isso); 502 só na
  // falha real de upstream (aí um retry do scheduler faz sentido).
  app.post('/api/internal/daily-ranking', requireCronSecret, async (_req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    const date = resolveServerYesterday();
    let outcome: { ok: boolean; count: number; error?: string };
    try {
      const result = await computeAndStoreRanking(date, 'Geração automática');
      outcome = { ok: true, count: result.count };
    } catch (error: any) {
      console.error('[cron] daily-ranking geração falhou:', error);
      outcome = { ok: false, count: 0, error: error?.message };
    }
    let reminders = 0;
    try {
      reminders = await sendRankingReminderToAdmins(date, outcome);
    } catch (e) {
      console.error('[cron] daily-ranking lembrete falhou:', e);
    }
    return res.status(outcome.ok ? 200 : 502).json({ date, ok: outcome.ok, count: outcome.count, reminders, error: outcome.error });
  });

  const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  const fetchExternalAffiliates = async (): Promise<any[]> => {
    const BASE_URL = process.env.VITE_AFFILIATE_API_BASE_URL || 'https://affiliate-api-prd.partnersotg.com';
    const apiKey = process.env.AFFILIATE_API_KEY;
    if (!apiKey) throw new Error('Chave de API externa não configurada.');

    const response = await fetchImpl(`${BASE_URL}/api/v2/external/affiliates`, {
      headers: { 'x-api-key': apiKey, 'Accept': 'application/json', 'User-Agent': 'AgenciaBoost-App/1.0' },
    });
    if (!response.ok) {
      throw new Error(`Erro na API externa ao listar afiliados: ${response.status}`);
    }
    const body = await response.json();
    // External shape: { data: { data: [...] } }
    const list = body?.data?.data ?? body?.data ?? body;
    return Array.isArray(list) ? list : [];
  };

  // --- Pré-cadastro (afiliados aprovados na OTG, ainda fora do relatório) -------
  // A OTG separa PROVISIONAMENTO (links.otgpartners) de RELATÓRIO (a x-api-key só
  // traz quem já produziu). Importamos os aprovados como `pending_affiliates` com
  // um affiliateId SINTÉTICO (`pending_<nameKey>_<casa>`) — assim o pendente é
  // cidadão de 1ª classe no fluxo existente (lista/convite/accept/dashboard) sem
  // reescrever nada. A ponte com o relatório é o NOME normalizado; quando o
  // afiliado aparece no relatório, reconciliamos trocando o id sintético pelo
  // real (no doc do pendente e em qualquer login já criado). Ver
  // scripts/otg-approved/README.md e a memória boost-external-api-state.
  const normNameKey = (s?: string | null) =>
    String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const brandNameOf = (aff: any): string => {
    const b = aff?.brand ?? aff?.marca;
    if (!b) return '';
    if (typeof b === 'string') return b;
    return b.name ?? b.nome ?? b.label ?? '';
  };
  const pendingDocId = (nameKey: string, house: string) => `pending_${nameKey}_${normNameKey(house)}`;

  // Casa pendente ↔ afiliado do relatório por (nameKey + casa). Marca o pendente
  // como reconciliado, grava o affiliateId real e reaponta logins já criados.
  const reconcilePending = async (reportingAffiliates: any[]): Promise<number> => {
    if (!adminDb) return 0;
    const byKey = new Map<string, any>();
    for (const a of reportingAffiliates) {
      const nk = normNameKey(a?.name ?? a?.label);
      const hs = normNameKey(brandNameOf(a));
      if (nk) byKey.set(`${nk}|${hs}`, a);
    }
    const pend = await adminDb.collection('pending_affiliates').where('status', '==', 'pending').get();
    let reconciled = 0;
    for (const docSnap of pend.docs) {
      const p = docSnap.data();
      const match = byKey.get(`${String(p.nameKey)}|${normNameKey(p.house)}`);
      const realId = String(match?.id ?? match?._id ?? '').trim();
      if (!realId) continue;
      await docSnap.ref.set(
        { status: 'reconciled', affiliateId: realId, reconciledAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      // reaponta logins existentes que ficaram amarrados ao id sintético
      const linked = await adminDb.collection('users').where('affiliateId', '==', docSnap.id).get();
      for (const u of linked.docs) {
        await u.ref.set({ affiliateId: realId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
      reconciled++;
    }
    return reconciled;
  };

  // Upsert das linhas de aprovados em `pending_affiliates` (id sintético por
  // nameKey+casa). Usado tanto pelo import manual (snapshot) quanto pelo pull
  // automático da OTG — mesma forma de dado, mesma idempotência. NÃO rebaixa um
  // pendente já reconciliado.
  const upsertPendingRows = async (rows: any[]): Promise<{ imported: number; skipped: number }> => {
    if (!adminDb) return { imported: 0, skipped: 0 };
    let imported = 0;
    let skipped = 0;
    for (const r of rows) {
      const name = String(r?.name ?? '').trim();
      const house = String(r?.house ?? '').trim();
      const nameKey = normNameKey(r?.nameKey || name);
      if (!name || !house || !nameKey) { skipped++; continue; }
      const id = pendingDocId(nameKey, house);
      const ref = adminDb.collection('pending_affiliates').doc(id);
      const prev = await ref.get();
      await ref.set({
        id,
        name,
        nameKey,
        house,
        email: r?.email ?? null,
        phone: r?.phone ?? null,
        social: r?.social ?? null,
        registerUrl: r?.registerUrl ?? null,
        // não rebaixa um já reconciliado; novo entra como 'pending'
        status: prev.exists ? (prev.data()!.status || 'pending') : 'pending',
        createdAt: prev.exists ? (prev.data()!.createdAt ?? admin.firestore.FieldValue.serverTimestamp()) : admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      imported++;
    }
    return { imported, skipped };
  };

  // Sync the external affiliate list into the local `affiliates` collection.
  app.post('/api/affiliates/sync', requireAdmin, requireOtg, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const affiliates = await fetchExternalAffiliates();
      let written = 0;
      // Firestore batches are capped at 500 ops; chunk to stay safe.
      for (let i = 0; i < affiliates.length; i += 400) {
        const slice = affiliates.slice(i, i + 400);
        const batch = adminDb.batch();
        for (const aff of slice) {
          const externalId = String(aff.id ?? aff._id ?? '').trim();
          if (!externalId) continue;
          const ref = adminDb.collection('affiliates').doc(externalId);
          batch.set(ref, {
            id: externalId,
            name: aff.name ?? aff.label ?? 'Sem Nome',
            siteId: aff.siteId ?? null,
            brand: aff.brand ?? null,
            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          written++;
        }
        await batch.commit();
      }
      // Após espelhar o relatório, reconcilia os pré-cadastros que já apareceram.
      const reconciled = await reconcilePending(affiliates);
      await writeAuditLog(req, {
        entityType: 'affiliates',
        entityId: null,
        action: 'affiliate.sync',
        metadata: { synced: written, total: affiliates.length, reconciled },
      });
      return res.json({ synced: written, total: affiliates.length, reconciled });
    } catch (error: any) {
      console.error('Error syncing affiliates:', error);
      return res.status(500).json({ error: error.message || 'Erro interno sincronizando afiliados.' });
    }
  });

  // Lista os pré-cadastros (afiliados aprovados importados do snapshot da OTG).
  app.get('/api/pending-affiliates', requireAdmin, requireOtg, async (_req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const snap = await adminDb.collection('pending_affiliates').get();
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.json(rows);
    } catch (error: any) {
      console.error('Error listing pending affiliates:', error);
      return res.status(500).json({ error: error.message || 'Erro interno listando pré-cadastros.' });
    }
  });

  // Importa o snapshot de aprovados (upsert por nameKey+casa) e já reconcilia
  // contra o relatório atual. Não rebaixa pendentes já reconciliados.
  app.post('/api/pending-affiliates/import', requireAdmin, requireOtg, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
      if (!rows) {
        return res.status(400).json({ error: 'Envie { rows: [...] } com as linhas do snapshot.' });
      }
      const { imported, skipped } = await upsertPendingRows(rows);
      // reconcilia imediatamente contra o relatório (quem já produziu some da fila)
      let reconciled = 0;
      try {
        reconciled = await reconcilePending(await fetchExternalAffiliates());
      } catch (e) {
        console.warn('Import: reconciliação adiada (falha ao ler relatório):', (e as any)?.message);
      }
      return res.json({ imported, skipped, reconciled, total: rows.length });
    } catch (error: any) {
      console.error('Error importing pending affiliates:', error);
      return res.status(500).json({ error: error.message || 'Erro interno importando pré-cadastros.' });
    }
  });

  // Puxa o roster de aprovados DIRETO da OTG (Supabase de provisionamento) e faz
  // o mesmo upsert + reconciliação do import manual — tira o "manual" do snapshot.
  // Usa as creds do .env (OTG_LINKS_*). Pode ser chamado por um scheduler externo
  // (cron batendo neste endpoint) ou pelo botão do /admin. Ver otgLinksPull.ts.
  app.post('/api/pending-affiliates/refresh', requireAdmin, requireOtg, async (_req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    if (!isOtgLinksConfigured()) {
      return res.status(503).json({ error: 'Pull automático não configurado (defina OTG_LINKS_* no .env).' });
    }
    try {
      const roster = await pullApprovedRoster();
      const { imported, skipped } = await upsertPendingRows(roster.rows);
      let reconciled = 0;
      try {
        reconciled = await reconcilePending(await fetchExternalAffiliates());
      } catch (e) {
        console.warn('Refresh: reconciliação adiada (falha ao ler relatório):', (e as any)?.message);
      }
      return res.json({ source: 'otg-links', total: roster.total, byHouse: roster.byHouse, imported, skipped, reconciled, fetchedAt: roster.fetchedAt });
    } catch (error: any) {
      console.error('Error refreshing pending affiliates from OTG:', error);
      return res.status(502).json({ error: error.message || 'Erro ao puxar o roster da OTG.' });
    }
  });

  // Persiste o funil da v1 em `affiliate_analytics` (1 doc/afiliado×casa, id
  // determinístico → idempotente) e RECONCILIA: resolve o affiliateId por nameKey|casa
  // (afiliado real do mirror tem prioridade; senão o pending) e ENRIQUECE o pending
  // casado com o resumo do funil — é assim que os afiliados SportingBet "desatualizados"
  // (só-funil, ex.: Lucas) passam a mostrar cliques/cadastros. Ver src/lib/analyticsDoc.
  const persistAnalytics = async (
    rows: Array<{ nameKey: string; affiliate: string; house: string; [k: string]: any }>,
    range: { initialDate: string; finalDate: string }
  ): Promise<{ persisted: number; enrichedPending: number }> => {
    if (!adminDb || !rows.length) return { persisted: 0, enrichedPending: 0 };
    // mapas de junção por nameKey|casa (mesma chave da reconciliação de pending)
    const realByKey = new Map<string, string>();
    const affSnap = await adminDb.collection('affiliates').get();
    affSnap.forEach((d) => {
      const a = d.data() as any;
      const nk = normNameKey(a?.name ?? a?.label);
      const hs = normNameKey(brandNameOf(a));
      if (nk) realByKey.set(`${nk}|${hs}`, String(a?.id ?? d.id));
    });
    const pendingByKey = new Map<string, { ref: any; affiliateId: string }>();
    const pendSnap = await adminDb.collection('pending_affiliates').get();
    pendSnap.forEach((d) => {
      const p = d.data() as any;
      const key = `${normNameKey(p?.nameKey)}|${normNameKey(p?.house)}`;
      pendingByKey.set(key, { ref: d.ref, affiliateId: String(p?.affiliateId ?? d.id) });
    });
    let persisted = 0;
    let enrichedPending = 0;
    for (const row of rows) {
      const key = funnelKey(row.nameKey, row.house);
      const real = realByKey.get(key);
      const pend = pendingByKey.get(key);
      const metrics = sanitizeFunnel(row);
      await adminDb
        .collection('affiliate_analytics')
        .doc(analyticsDocId(row.nameKey, row.house))
        .set(
          {
            nameKey: row.nameKey,
            affiliate: row.affiliate,
            house: row.house,
            ...metrics,
            affiliateId: real ?? pend?.affiliateId ?? null,
            funnelOnly: !real, // true = não está no relatório v2 (caso "Lucas")
            range,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      persisted++;
      // enriquece o pending casado (sem tocar no nome) → mostra atividade no /admin.
      if (pend) {
        await pend.ref.set(
          {
            funnel: metrics,
            hasFunnelActivity: hasFunnelActivity(row),
            funnelUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        enrichedPending++;
      }
    }
    return { persisted, enrichedPending };
  };

  // Núcleo compartilhado do refresh do funil: pull + (se alguma casa respondeu)
  // persist/reconcilia. Usado pela rota ADMIN (botão no /otg-roster) e pela rota de
  // CRON (scheduler). Não lança por casa (resiliência em pullAnalytics); só propaga se
  // o pull inteiro falhar (ex.: login durável caiu → o chamador devolve 502).
  const runAnalyticsRefresh = async (range: { initialDate: string; finalDate: string }) => {
    const result = await pullAnalytics(range, fetchImpl);
    const houses = result.houses.map((h) => ({
      house: h.house,
      available: h.available,
      summary: h.summary,
      count: h.rows.length,
      error: h.error,
    }));
    const anyOk = result.houses.some((h) => h.available);
    const firstErr = result.houses.find((h) => h.error)?.error;
    let persisted = 0;
    let enrichedPending = 0;
    if (anyOk) {
      try {
        const p = await persistAnalytics(result.rows, range);
        persisted = p.persisted;
        enrichedPending = p.enrichedPending;
      } catch (e: any) {
        console.warn('Analytics: persistência adiada (falha ao gravar):', e?.message);
      }
    }
    return { result, houses, anyOk, firstErr, persisted, enrichedPending };
  };

  // v1 ANALÍTICA da OTG: traz cliques + funil inicial + NGR por afiliado×casa —
  // inclusive os só-funil (clique/cadastro sem comissão) que a v2 externa esconde
  // (caso "Lucas Guimarães"). Auth via OTG_DASH_ACCESS_TOKEN (dashboard tem 2FA →
  // sem password-grant; ver SPIKE-OTG-V1-ANALYTICS.md). Range default = mês corrente
  // no fuso BR. Por ora pull+retorna (persistência/UI = próxima fatia).
  app.post('/api/analytics/refresh', requireAdmin, requireOtg, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    if (!isOtgAnalyticsConfigured()) {
      return res.status(503).json({ error: 'v1 analítica não configurada (defina OTG_DASH_API_BASE + OTG_DASH_ACCESS_TOKEN no Secret Manager).' });
    }
    const today = resolveServerToday();
    const isoRe = /^\d{4}-\d{2}-\d{2}$/;
    const initialDate = isoRe.test(String(req.body?.initialDate)) ? String(req.body.initialDate) : `${today.slice(0, 7)}-01`;
    const finalDate = isoRe.test(String(req.body?.finalDate)) ? String(req.body.finalDate) : today;
    try {
      const { result, houses, anyOk, firstErr, persisted, enrichedPending } = await runAnalyticsRefresh({ initialDate, finalDate });
      // Se NENHUMA casa respondeu (todas indisponíveis/erro) E houve erro real — ex.:
      // login OTG falhou → 401/erro em todas — surfacia 502 em vez de um 200-vazio
      // enganoso. (Só superbet-404, sem erro real, segue 200 com rows da sportingbet.)
      if (!anyOk && firstErr) {
        return res.status(502).json({ error: firstErr, range: { initialDate, finalDate }, houses });
      }
      return res.json({
        source: 'otg-v1-analytics',
        range: { initialDate, finalDate },
        houses,
        persisted,
        enrichedPending,
        rows: result.rows,
        fetchedAt: result.fetchedAt,
      });
    } catch (error: any) {
      console.error('Error pulling OTG v1 analytics:', error);
      return res.status(502).json({ error: error.message || 'Erro ao puxar a v1 analítica da OTG.' });
    }
  });

  // CRON do funil v1: um scheduler externo (Cloud Scheduler) atualiza o funil
  // diariamente SEM token admin (que ele não tem) — gated pelo mesmo `requireCronSecret`
  // do ranking (RANKING_CRON_SECRET, header x-cron-secret). Mesma lógica da rota admin
  // (pull + persist/reconcilia), range = mês corrente BR. Ver boost-v1-analytics + CLAUDE.md.
  app.post('/api/internal/analytics-refresh', requireCronSecret, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    if (!isOtgAnalyticsConfigured()) {
      return res.status(503).json({ error: 'v1 analítica não configurada (defina OTG_DASH_EMAIL/PASSWORD/DEVICE_TOKEN).' });
    }
    const today = resolveServerToday();
    const isoRe = /^\d{4}-\d{2}-\d{2}$/;
    const initialDate = isoRe.test(String(req.body?.initialDate)) ? String(req.body.initialDate) : `${today.slice(0, 7)}-01`;
    const finalDate = isoRe.test(String(req.body?.finalDate)) ? String(req.body.finalDate) : today;
    try {
      const { anyOk, firstErr, persisted, enrichedPending, houses } = await runAnalyticsRefresh({ initialDate, finalDate });
      if (!anyOk && firstErr) {
        return res.status(502).json({ ok: false, error: firstErr, range: { initialDate, finalDate }, houses });
      }
      return res.json({ ok: true, range: { initialDate, finalDate }, persisted, enrichedPending, houses });
    } catch (error: any) {
      console.error('Error in analytics cron:', error);
      return res.status(502).json({ ok: false, error: error.message || 'Erro ao atualizar o funil.' });
    }
  });

  // Cria um convite (token single-use, 7d) ligado a um affiliateId. Extraído p/ ser
  // reusado pelo POST /api/invites E pelo cadastro de afiliado nativo Boost.
  const createInviteDoc = async (affiliateId: string, affiliateName?: string | null) => {
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);
    await adminDb!.collection('invites').doc(token).set({
      token,
      affiliateId: String(affiliateId),
      affiliateName: affiliateName ? String(affiliateName) : null,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    });
    return { token, expiresAt: expiresAt.toDate().toISOString() };
  };

  // Admin generates an access invite for an affiliate.
  app.post('/api/invites', requireAdmin, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const { affiliateId, affiliateName } = req.body ?? {};
      if (!affiliateId) {
        return res.status(400).json({ error: 'affiliateId é obrigatório.' });
      }
      const { token, expiresAt } = await createInviteDoc(String(affiliateId), affiliateName);
      // NÃO gravamos o token na trilha (é credencial single-use) — só que houve convite.
      await writeAuditLog(req, {
        entityType: 'affiliate',
        entityId: String(affiliateId),
        entityLabel: affiliateName ? String(affiliateName) : null,
        action: 'invite.create',
        metadata: { expiresAt },
      });
      return res.status(201).json({ token, expiresAt });
    } catch (error: any) {
      console.error('Error creating invite:', error);
      return res.status(500).json({ error: error.message || 'Erro interno criando convite.' });
    }
  });

  // --- Link de cadastro na REDE do especial (15/08/2026) ----------------------
  // O gerente compartilha um link e quem se cadastra por ele já nasce afiliado
  // DENTRO da equipe dele, sem passar pela fila de /solicitacoes. O que continua
  // sendo do master: cunhar o link da CASA (a tag que a casa devolve no relatório).
  // Desenho e invariantes do doc em src/lib/networkInvite.ts.

  // Registro do especial ATIVO de quem chamou, ou null (admin não tem rede própria).
  const resolveCallerSpecial = async (req: express.Request) => {
    const ownId = String((req as any).user?.affiliateId ?? '').trim();
    if (!ownId) return null;
    const record = await resolveSpecialRecord(ownId, { withSubs: false });
    return resolveIsSpecial(record) ? { ownId, record } : null;
  };

  const findNetworkInvite = async (ownerAffiliateId: string) => {
    const snap = await adminDb!
      .collection('invites')
      .where('kind', '==', NETWORK_INVITE_KIND)
      .where('ownerAffiliateId', '==', ownerAffiliateId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    return snap.empty ? null : snap.docs[0];
  };

  // Afiliado de quem entrou pelo link. Idempotente por e-mail: alias existente
  // reusa o id (a mesma regra do POST /api/boost-affiliates) em vez de criar um
  // segundo cadastro para a mesma pessoa. E-mail (PII) só no alias, nunca no mirror.
  const resolveRecruitAffiliate = async (email: string, name: string, createdByUid: string): Promise<string> => {
    const emailKey = normalizeEmailKey(email);
    const aliasRef = emailKey ? adminDb!.collection('affiliate_email_aliases').doc(emailKey) : null;
    if (aliasRef) {
      const snap = await aliasRef.get();
      const existing = snap.exists ? String((snap.data() as any)?.affiliateId ?? '').trim() : '';
      if (existing) return existing;
    }
    const affiliateId = makeBoostAffiliateId(crypto.randomUUID());
    await adminDb!.collection('affiliates').doc(affiliateId).set({
      id: affiliateId,
      name,
      brand: null,
      source: 'boost',
      createdByUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await adminDb!.collection('affiliate_statuses').doc(affiliateId).set({
      status: 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (aliasRef) {
      await aliasRef.set({
        email: emailKey,
        affiliateId,
        name,
        kind: 'boost',
        createdByUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return affiliateId;
  };

  // Coloca o recém-chegado DENTRO da rede de quem recrutou, nos DOIS modelos de
  // especial: a aresta `affiliate_uplines` (que manda no dinheiro e na árvore de N
  // níveis) e, para o especial do modelo antigo (`fromNetwork !== true`, que não
  // deriva da árvore), a lista `subAffiliateIds` — sem ela o gerente não veria quem
  // acabou de entrar. NUNCA rouba upline: quem já é de outra equipe fica onde está.
  const linkRecruitToNetwork = async (
    affiliateId: string,
    ownerId: string,
    ownerRecord: SpecialRecord | null,
  ): Promise<void> => {
    if (!affiliateId || !ownerId || affiliateId === ownerId) return;
    const upRef = adminDb!.collection('affiliate_uplines').doc(affiliateId);
    const upSnap = await upRef.get();
    const current = upSnap.exists ? String((upSnap.data() as any)?.uplineId ?? '').trim() : '';
    if (current && current !== ownerId) return;
    if (!current) {
      // Barreira de CICLO, igual à do POST /api/affiliate-uplines: só é possível
      // reusando um afiliado que já está ACIMA de quem recruta. Melhor entrar sem
      // vínculo (o master resolve) do que corromper a árvore que precifica a rede.
      const currentMap = await readUplineMap();
      const candidate = { ...currentMap, [affiliateId]: ownerId };
      const ids = new Set<string>([affiliateId, ownerId, ...Object.keys(candidate), ...Object.values(candidate)]);
      const tree = buildNetworkTree([...ids].map((id) => ({ affiliateId: id, uplineId: candidate[id] ?? null })));
      if (tree.dropped.some((d) => d.reason === 'ciclo')) {
        console.error('[network-invite] vínculo ignorado: criaria ciclo', { affiliateId, ownerId });
        return;
      }
      await upRef.set({
        affiliateId,
        uplineId: ownerId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    if (ownerRecord?.fromNetwork === true) return; // a subárvore já o inclui
    const ref = adminDb!.collection('special_affiliates').doc(ownerId);
    const snap = await ref.get();
    const subs = Array.isArray((snap.data() as any)?.subAffiliateIds)
      ? (snap.data() as any).subAffiliateIds.map((s: any) => String(s))
      : [];
    if (subs.includes(affiliateId)) return;
    await ref.set({
      subAffiliateIds: [...subs, affiliateId],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  };

  // O link atual do gerente (ou `code: null` quando ele ainda não gerou nenhum).
  app.get('/api/network-invite', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const own = await resolveCallerSpecial(req);
      if (!own) return res.status(403).json({ error: 'Apenas afiliados especiais têm link de cadastro na rede.' });
      const doc = await findNetworkInvite(own.ownId);
      if (!doc) return res.json({ code: null, uses: 0, createdAt: null });
      const data = doc.data() as any;
      return res.json({
        code: doc.id,
        uses: Number(data?.uses ?? 0) || 0,
        createdAt: serializeTimestamp(data?.createdAt),
      });
    } catch (error: any) {
      console.error('[network-invite] get:', error);
      return res.status(500).json({ error: error.message || 'Erro ao carregar o link de cadastro.' });
    }
  });

  // Cria o link (idempotente: devolve o que já existe). `rotate: true` REVOGA o
  // atual e emite outro — é o botão de emergência para um link que vazou.
  app.post('/api/network-invite', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const own = await resolveCallerSpecial(req);
      if (!own) return res.status(403).json({ error: 'Apenas afiliados especiais têm link de cadastro na rede.' });
      const rotate = req.body?.rotate === true;
      const current = await findNetworkInvite(own.ownId);
      if (current && !rotate) {
        const data = current.data() as any;
        return res.json({ code: current.id, uses: Number(data?.uses ?? 0) || 0, rotated: false });
      }
      if (current) {
        await current.ref.set({
          status: 'revoked',
          revokedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      const code = crypto.randomBytes(12).toString('hex');
      await adminDb.collection('invites').doc(code).set({
        token: code,
        kind: NETWORK_INVITE_KIND,
        ownerAffiliateId: own.ownId,
        ownerName: await affiliateNameOf(own.ownId),
        status: 'active',
        uses: 0,
        createdByUid: (req as any).user?.uid ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // NÃO gravamos o code na trilha (é o segredo do link); só que houve emissão.
      await writeAuditLog(req, {
        entityType: 'affiliate',
        entityId: own.ownId,
        entityLabel: await affiliateNameOf(own.ownId),
        action: rotate ? 'network_invite.rotate' : 'network_invite.create',
      });
      return res.status(201).json({ code, uses: 0, rotated: !!current });
    } catch (error: any) {
      console.error('[network-invite] post:', error);
      return res.status(500).json({ error: error.message || 'Erro ao gerar o link de cadastro.' });
    }
  });

  // --- Afiliado nativo Boost (sem OTG) + alias de e-mail ----------------------
  // SECURITY: nome vai no mirror `affiliates` (legível por logado, p/ exibição);
  // e-mail (PII) vai SÓ em affiliate_email_aliases (admin-only). Ver firestore.rules.

  // Cria afiliados nativos Boost em lote a partir do import (nome+email+casa).
  // Idempotente por e-mail: se já existe alias, reusa o affiliateId (não duplica).
  app.post('/api/boost-affiliates', requireAdmin, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const list = Array.isArray(req.body?.affiliates) ? req.body.affiliates : null;
      if (!list || list.length === 0) {
        return res.status(400).json({ error: 'Envie { affiliates: [{ name, email?, house }] }.' });
      }
      const generateInvite = !!req.body?.generateInvite;
      const createdByUid = (req as any).user?.uid ?? null;
      const created: any[] = [];

      for (const item of list) {
        const name = String(item?.name ?? '').trim();
        const house = String(item?.house ?? '').trim();
        const emailKey = normalizeEmailKey(item?.email);
        if (!name) { continue; }

        // Idempotência: e-mail já mapeado -> reusa o afiliado existente.
        let affiliateId: string | null = null;
        let reused = false;
        if (emailKey) {
          const aliasSnap = await adminDb.collection('affiliate_email_aliases').doc(emailKey).get();
          if (aliasSnap.exists && aliasSnap.data()?.affiliateId) {
            affiliateId = String(aliasSnap.data()!.affiliateId);
            reused = true;
          }
        }

        if (!affiliateId) {
          affiliateId = makeBoostAffiliateId(crypto.randomUUID());
          // mirror (name-only) — alimenta a resolução de nome em todo o app.
          await adminDb.collection('affiliates').doc(affiliateId).set({
            id: affiliateId,
            name,
            brand: house ? { name: house } : null,
            source: 'boost',
            createdByUid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          // ativo por padrão (espelha o status dos afiliados gerenciados)
          await adminDb.collection('affiliate_statuses').doc(affiliateId).set({
            status: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          // e-mail (PII) -> alias admin-only
          if (emailKey) {
            await adminDb.collection('affiliate_email_aliases').doc(emailKey).set({
              email: emailKey,
              affiliateId,
              name,
              kind: 'boost',
              createdByUid,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        }

        let invite: { token: string; expiresAt: string } | null = null;
        if (generateInvite) {
          try { invite = await createInviteDoc(affiliateId, name); } catch (e) { console.error('invite p/ boost-affiliate falhou:', e); }
        }
        // Audita só a CRIAÇÃO de afiliado nativo (reuse idempotente não muda nada).
        if (!reused) {
          await writeAuditLog(req, {
            entityType: 'affiliate',
            entityId: affiliateId,
            entityLabel: name,
            action: 'affiliate.create_boost',
            metadata: { house: house || null, hasEmail: !!emailKey, invited: !!invite },
          });
        }
        created.push({ affiliateId, name, email: emailKey || null, reused, invite });
      }

      return res.status(201).json({ created });
    } catch (error: any) {
      console.error('Error creating boost affiliates:', error);
      return res.status(500).json({ error: error.message || 'Erro interno criando afiliados Boost.' });
    }
  });

  // "Vincular a existente": liga um e-mail (de planilha, sem login) a um afiliado já
  // existente. Persistente — reuploads futuros com esse e-mail passam a casar.
  app.post('/api/affiliate-email-aliases', requireAdmin, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const emailKey = normalizeEmailKey(req.body?.email);
      const affiliateId = String(req.body?.affiliateId ?? '').trim();
      if (!emailKey || !affiliateId) {
        return res.status(400).json({ error: 'Informe email e affiliateId.' });
      }
      await adminDb.collection('affiliate_email_aliases').doc(emailKey).set({
        email: emailKey,
        affiliateId,
        kind: 'link',
        createdByUid: (req as any).user?.uid ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      // audit_logs é admin-only (rule), então o e-mail (PII) pode ficar na metadata.
      await writeAuditLog(req, {
        entityType: 'affiliate',
        entityId: affiliateId,
        action: 'affiliate.link_email',
        metadata: { email: emailKey },
      });
      return res.json({ email: emailKey, affiliateId });
    } catch (error: any) {
      console.error('Error creating email alias:', error);
      return res.status(500).json({ error: error.message || 'Erro interno criando alias.' });
    }
  });

  // Lista os aliases de e-mail (p/ o roster do import). Admin-only.
  app.get('/api/affiliate-email-aliases', requireAdmin, async (_req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const snap = await adminDb.collection('affiliate_email_aliases').get();
      const aliases = snap.docs.map((d) => {
        const x = d.data();
        return { email: x.email ?? d.id, affiliateId: x.affiliateId, name: x.name ?? null, kind: x.kind ?? null };
      });
      return res.json({ aliases });
    } catch (error: any) {
      console.error('Error listing email aliases:', error);
      return res.status(500).json({ error: error.message || 'Erro interno listando aliases.' });
    }
  });

  // --- Solicitações de cadastro (captação) ------------------------------------
  // Quem bateu na porta e ainda não é afiliado, pelas DUAS portas de entrada:
  // `users` sem `affiliateId` (auto-cadastro no /register, aberto quando a
  // instância liga a vitrine) e `contacts` (formulário público). Nenhuma das duas
  // tinha leitor no app — o auto-cadastro nunca teve, e o de leads foi aposentado
  // no B6. É PII (telefone, rede social, texto do lead), então a leitura é
  // MEDIADA pelo servidor e admin-only, como payment_profiles/affiliate_configs.
  app.get('/api/registration-requests', requireAdmin, async (_req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const [usersSnap, contactsSnap, referralsSnap] = await Promise.all([
        adminDb.collection('users').get(),
        adminDb.collection('contacts').get(),
        adminDb.collection('affiliate_referrals').get(),
      ]);
      const requests = [
        // `isPendingSignup` é a MESMA regra que a tela usa p/ dizer "pendente" —
        // filtra aqui p/ o doc de quem já é afiliado nem sair do servidor.
        ...usersSnap.docs
          .filter((d) => isPendingSignup(d.data()))
          .map((d) => signupToRequest(d.id, d.data())),
        ...contactsSnap.docs.map((d) => leadToRequest(d.id, d.data())),
        // 3ª porta (call 12/08): indicação feita por um especial, aguardando o master.
        ...referralsSnap.docs.map((d) => referralToRequest(d.id, d.data())),
      ];
      return res.json({ requests: buildCaptureFeed(requests) });
    } catch (error: any) {
      console.error('Error listing registration requests:', error);
      return res.status(500).json({ error: error.message || 'Erro interno listando solicitações.' });
    }
  });

  // Arquiva/desarquiva uma solicitação. É só TRIAGEM: não apaga nada e não mexe
  // em papel nem em vínculo — a pessoa arquivada continua com o login dela.
  app.post('/api/registration-requests/archive', requireAdmin, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const kind = String(req.body?.kind ?? '').trim();
      const id = String(req.body?.id ?? '').trim();
      const archived = req.body?.archived !== false; // default: arquivar
      if ((kind !== 'signup' && kind !== 'lead' && kind !== 'referral') || !id) {
        return res.status(400).json({ error: 'Informe kind ("signup" | "lead" | "referral") e id.' });
      }
      const collectionOf = { signup: 'users', lead: 'contacts', referral: 'affiliate_referrals' } as const;
      const ref = adminDb.collection(collectionOf[kind]).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Solicitação não encontrada.' });
      const before = snap.data() as any;
      // Guarda-corpo: `users` é doc de LOGIN. Arquivar quem já virou afiliado
      // esconderia da fila alguém que nem está nela — sinal de id trocado.
      if (kind === 'signup' && !isPendingSignup(before)) {
        return res.status(409).json({ error: 'Este login já está vinculado a um afiliado.' });
      }
      const status = archived ? 'archived' : 'pending';
      await ref.set({ requestStatus: status, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await writeAuditLog(req, {
        entityType: kind === 'signup' ? 'user' : kind === 'referral' ? 'affiliate_referral' : 'contact',
        entityId: id,
        entityLabel: String(before?.name ?? before?.email ?? id),
        action: archived ? 'request.archive' : 'request.restore',
        changes: [{ field: 'requestStatus', before: resolveRequestStatus(before?.requestStatus), after: status }],
      });
      return res.json({ id, kind, status });
    } catch (error: any) {
      console.error('Error archiving registration request:', error);
      return res.status(500).json({ error: error.message || 'Erro interno arquivando solicitação.' });
    }
  });

  // --- Indicação de afiliado pelo ESPECIAL (call Infinity 12/08 · item 5) -----
  // O gerente indica; o MASTER confirma em /solicitacoes (3ª origem da fila), e a
  // aprovação cria o afiliado + convite e o vincula à rede de quem indicou. É PII
  // de terceiro sem conta, então a coleção `affiliate_referrals` é server-only
  // (rule `read, write: if false`) e todo acesso passa por aqui.

  app.post('/api/affiliate-referrals', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const user = (req as any).user;
      const ownAffiliateId = String(user?.affiliateId ?? '').trim();
      // Gate: admin OU afiliado especial ATIVO (resolveIsSpecial é a definição
      // única; o registro vem de resolveSpecialRecord). Sub comum não indica.
      const special = ownAffiliateId ? await resolveSpecialRecord(ownAffiliateId, { withSubs: false }) : null;
      if (user?.role !== 'admin' && !resolveIsSpecial(special)) {
        return res.status(403).json({ error: 'Apenas afiliados especiais podem indicar cadastros.' });
      }
      const name = String(req.body?.name ?? '').trim();
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      if (!name) return res.status(400).json({ error: 'Informe o nome do indicado.' });
      // E-mail é obrigatório: é ele que vira convite de login na aprovação.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Informe um e-mail válido: o convite de acesso vai para ele.' });
      }
      const doc = {
        name,
        email,
        phone: String(req.body?.phone ?? '').trim() || null,
        note: String(req.body?.note ?? '').trim() || null,
        referrerAffiliateId: ownAffiliateId || null,
        referrerName: ownAffiliateId ? await affiliateNameOf(ownAffiliateId) : null,
        referrerUid: String(user?.uid ?? '') || null,
        requestStatus: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const ref = await adminDb.collection('affiliate_referrals').add(doc);
      await writeAuditLog(req, {
        entityType: 'affiliate_referral',
        entityId: ref.id,
        entityLabel: name,
        action: 'referral.create',
        metadata: { referrerAffiliateId: ownAffiliateId || null },
      });
      return res.json({ id: ref.id });
    } catch (error: any) {
      console.error('Error creating affiliate referral:', error);
      return res.status(500).json({ error: error.message || 'Erro interno criando a indicação.' });
    }
  });

  // Lista as indicações: admin vê todas; o especial vê SÓ as próprias (é assim
  // que ele acompanha "aguardando aprovação" sem enxergar a fila da agência).
  app.get('/api/affiliate-referrals', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    try {
      const user = (req as any).user;
      const ownAffiliateId = String(user?.affiliateId ?? '').trim();
      let query: admin.firestore.Query = adminDb.collection('affiliate_referrals');
      if (user?.role !== 'admin') {
        if (!ownAffiliateId) return res.status(403).json({ error: 'Sem afiliado vinculado.' });
        query = query.where('referrerAffiliateId', '==', ownAffiliateId);
      }
      const snap = await query.get();
      return res.json({ referrals: buildCaptureFeed(snap.docs.map((d) => referralToRequest(d.id, d.data()))) });
    } catch (error: any) {
      console.error('Error listing affiliate referrals:', error);
      return res.status(500).json({ error: error.message || 'Erro interno listando indicações.' });
    }
  });

  // --- Alias de TAG -> afiliado (import do relatório da CASA) -----------------
  // O relatório da casa agrupa pela tag de rastreio (`?afp=infinitw02`), não por
  // e-mail. As tags que saíram de um link nosso já casam sozinhas (o índice as extrai
  // da `registerUrl` do `affiliate_links`); estas rotas guardam a decisão do admin
  // para as demais — a variante digitada à mão no painel da casa, que nenhum link
  // nosso cobre. Doc id = tag normalizada. Espelha /api/affiliate-email-aliases.

  // Lista os apelidos de tag (p/ o índice do import). Admin-only.
  app.get('/api/tag-aliases', requireAdmin, async (_req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const snap = await adminDb.collection('affiliate_tag_aliases').get();
      const aliases = snap.docs.map((d) => {
        const x = d.data() as any;
        return {
          tag: x.tag ?? d.id,
          affiliateId: x.affiliateId,
          houseSlug: x.houseSlug ?? null,
        };
      });
      return res.json({ aliases });
    } catch (error: any) {
      console.error('Error listing tag aliases:', error);
      return res.status(500).json({ error: error.message || 'Erro interno listando apelidos de tag.' });
    }
  });

  // Vincula uma tag a um afiliado existente (persistente: o próximo upload já casa).
  app.post('/api/tag-aliases', requireAdmin, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const tag = normalizeTag(req.body?.tag);
      const affiliateId = String(req.body?.affiliateId ?? '').trim();
      const houseSlug = String(req.body?.houseSlug ?? '').trim() || null;
      if (!tag || !affiliateId) {
        return res.status(400).json({ error: 'Informe tag e affiliateId.' });
      }
      await adminDb.collection('affiliate_tag_aliases').doc(tag).set({
        tag,
        affiliateId,
        houseSlug,
        createdByUid: (req as any).user?.uid ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await writeAuditLog(req, {
        entityType: 'affiliate',
        entityId: affiliateId,
        entityLabel: await affiliateNameOf(affiliateId),
        action: 'affiliate.link_tag',
        metadata: { tag, house: houseSlug },
      });
      return res.json({ tag, affiliateId, houseSlug });
    } catch (error: any) {
      console.error('Error creating tag alias:', error);
      return res.status(500).json({ error: error.message || 'Erro interno vinculando a tag.' });
    }
  });

  // Desfaz o vínculo (o admin errou o dono). A tag volta a ficar pendente no import.
  app.delete('/api/tag-aliases/:tag', requireAdmin, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const tag = normalizeTag(req.params.tag);
      if (!tag) return res.status(400).json({ error: 'Tag inválida.' });
      const ref = adminDb.collection('affiliate_tag_aliases').doc(tag);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Apelido de tag não encontrado.' });
      const previous = String((snap.data() as any)?.affiliateId ?? '');
      await ref.delete();
      await writeAuditLog(req, {
        entityType: 'affiliate',
        entityId: previous || tag,
        action: 'affiliate.unlink_tag',
        metadata: { tag },
      });
      return res.json({ tag, removed: true });
    } catch (error: any) {
      console.error('Error deleting tag alias:', error);
      return res.status(500).json({ error: error.message || 'Erro interno removendo o apelido.' });
    }
  });

  // Public: validate an invite token and return the affiliate it is bound to.
  app.get('/api/invites/:token', publicAuthLimiter, async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const { token } = req.params;
      const snap = await adminDb.collection('invites').doc(String(token)).get();
      if (!snap.exists) {
        return res.status(404).json({ error: 'Convite não encontrado.' });
      }
      const data = snap.data()!;
      // Link de cadastro na rede: reutilizável e sem validade — o que o invalida é
      // a revogação OU o dono ter deixado de ser especial ativo. A tela usa o `kind`
      // para pedir o NOME (o afiliado ainda não existe) e dizer de quem é a rede.
      if (isNetworkInvite(data)) {
        const blocked = networkInviteBlock(data);
        if (blocked) return res.status(410).json({ error: blocked });
        const owner = String(data.ownerAffiliateId ?? '').trim();
        const record = owner ? await resolveSpecialRecord(owner, { withSubs: false }) : null;
        if (!resolveIsSpecial(record)) {
          return res.status(410).json({ error: 'Este link de cadastro não está mais ativo. Fale com quem te convidou.' });
        }
        return res.json({
          kind: NETWORK_INVITE_KIND,
          affiliateId: null,
          affiliateName: null,
          referrerName: data.ownerName ?? null,
          status: 'active',
        });
      }
      if (data.status === 'used') {
        return res.status(410).json({ error: 'Este convite já foi utilizado.' });
      }
      if (data.expiresAt?.toMillis && data.expiresAt.toMillis() < Date.now()) {
        return res.status(410).json({ error: 'Este convite expirou.' });
      }
      return res.json({
        affiliateId: data.affiliateId,
        affiliateName: data.affiliateName ?? null,
        status: data.status,
      });
    } catch (error: any) {
      console.error('Error fetching invite:', error);
      return res.status(500).json({ error: error.message || 'Erro interno lendo convite.' });
    }
  });

  // Public: affiliate accepts an invite, creating their own login linked to the affiliateId.
  app.post('/api/accept-invite', publicAuthLimiter, async (req, res) => {
    if (!adminApp || !adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }
    try {
      const { token, email, password, phone, socialMedia, cpf } = req.body ?? {};
      if (!token || !email || !password) {
        return res.status(400).json({ error: 'Token, e-mail e senha são obrigatórios.' });
      }
      const normalizedPhone = String(phone ?? '').trim();
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'O telefone é obrigatório.' });
      }
      const normalizedSocialMedia = String(socialMedia ?? '').trim();
      const normalizedCpf = String(cpf ?? '').trim();

      // Verificação de telefone por SMS (quando LIGADA na instância): o aceite
      // só conclui com um token de verificação válido pro telefone informado —
      // o servidor grava o E.164 verificado + phoneVerified (server-only).
      // Feature OFF → segue exatamente como antes (fail-safe).
      const phoneVerification = phoneSetup();
      let verifiedPhone: string | null = null;
      if (phoneVerification.enabled) {
        verifiedPhone = normalizeBrPhone(normalizedPhone);
        if (!verifiedPhone) {
          return res.status(400).json({ error: 'Telefone inválido. Informe um celular brasileiro com DDD.', code: 'PHONE_INVALID' });
        }
        const challenge = await readPhoneChallenge(verifiedPhone);
        if (!verificationTokenValid(challenge, req.body?.phoneVerificationToken, Date.now())) {
          return res.status(400).json({ error: 'Confirme seu telefone pelo código SMS antes de concluir o cadastro.', code: 'PHONE_NOT_VERIFIED' });
        }
      }

      const inviteRef = adminDb.collection('invites').doc(String(token));
      const inviteSnap = await inviteRef.get();
      if (!inviteSnap.exists) {
        return res.status(404).json({ error: 'Convite não encontrado.' });
      }
      const invite = inviteSnap.data()!;
      const network = isNetworkInvite(invite);

      // Link de cadastro na REDE (reutilizável): o que valida não é used/expirado,
      // e sim o link estar ativo E quem recruta continuar sendo especial ativo.
      let ownerAffiliateId = '';
      let ownerSpecial: SpecialRecord | null = null;
      if (network) {
        const blocked = networkInviteBlock(invite);
        if (blocked) return res.status(410).json({ error: blocked });
        ownerAffiliateId = String(invite.ownerAffiliateId ?? '').trim();
        ownerSpecial = ownerAffiliateId ? await resolveSpecialRecord(ownerAffiliateId, { withSubs: false }) : null;
        if (!resolveIsSpecial(ownerSpecial)) {
          return res.status(410).json({ error: 'Este link de cadastro não está mais ativo. Fale com quem te convidou.' });
        }
        // O afiliado ainda não existe: o nome vem de quem está se cadastrando.
        const nameError = recruitNameError(req.body?.name);
        if (nameError) return res.status(400).json({ error: nameError });
      } else {
        if (invite.status === 'used') {
          return res.status(410).json({ error: 'Este convite já foi utilizado.' });
        }
        if (invite.expiresAt?.toMillis && invite.expiresAt.toMillis() < Date.now()) {
          return res.status(410).json({ error: 'Este convite expirou.' });
        }
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const affiliateName = network
        ? sanitizeRecruitName(req.body?.name)
        : (invite.affiliateName || normalizedEmail);

      let userRecord: admin.auth.UserRecord;
      try {
        userRecord = await adminApp.auth().createUser({
          email: normalizedEmail,
          password: String(password),
          displayName: affiliateName,
        });
      } catch (error: any) {
        if (error.code === 'auth/email-already-exists') {
          return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login.' });
        }
        throw error;
      }

      // Afiliado do novo login. Convite pessoal: o id já veio no convite. Link de
      // rede: o afiliado NASCE aqui (nativo Boost) e é ligado à equipe de quem
      // recrutou — a criação vem DEPOIS da conta para um e-mail já cadastrado (409)
      // não deixar afiliado órfão no mirror.
      let affId: string;
      if (network) {
        affId = await resolveRecruitAffiliate(normalizedEmail, affiliateName, userRecord.uid);
        await linkRecruitToNetwork(affId, ownerAffiliateId, ownerSpecial);
      } else {
        affId = String(invite.affiliateId);
      }

      // Se este afiliado já foi marcado como especial ANTES de aceitar o convite,
      // espelha isSpecial no doc novo — senão ele se cadastra sem acesso à /network
      // (bug recorrente do especial sem flag). Resolvido pelo affiliateId do convite.
      const isSpecial = resolveIsSpecial(await resolveSpecialRecord(affId, { withSubs: false }));

      await adminDb.collection('users').doc(userRecord.uid).set({
        uid: userRecord.uid,
        name: affiliateName,
        email: normalizedEmail,
        role: 'client',
        affiliateId: affId,
        isSpecial,
        phone: verifiedPhone ?? normalizedPhone,
        ...(verifiedPhone
          ? { phoneVerified: true, phoneVerifiedAt: admin.firestore.FieldValue.serverTimestamp() }
          : {}),
        socialMedia: normalizedSocialMedia,
        cpf: normalizedCpf,
        mustChangePassword: false,
        avatarUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(affiliateName)}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // O convite PESSOAL é credencial de uma pessoa: queima no primeiro aceite. O
      // link de rede é canal de captação: segue valendo, só contabiliza o uso.
      await inviteRef.set(network
        ? {
            uses: (Number(invite.uses) || 0) + 1,
            lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUsedByUid: userRecord.uid,
          }
        : {
            status: 'used',
            usedByUid: userRecord.uid,
            usedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

      // Consome o desafio de telefone (uso único) — best-effort: a conta já foi
      // criada, falha aqui não pode derrubar o cadastro.
      if (verifiedPhone) {
        await phoneChallengeRef(verifiedPhone)
          .set({ consumedAtMs: Date.now(), consumedByUid: userRecord.uid }, { merge: true })
          .catch(() => {});
      }

      // Rota PÚBLICA (sem requireAuth): o autor é o próprio afiliado que se cadastrou.
      // Carimba o user recém-criado em req p/ auditEntry atribuir a ele (não fica nulo).
      (req as any).user = { uid: userRecord.uid, email: normalizedEmail, name: affiliateName };
      await writeAuditLog(req, {
        entityType: 'user',
        entityId: userRecord.uid,
        entityLabel: normalizedEmail,
        action: network ? 'user.join_network' : 'user.accept_invite',
        metadata: { affiliateId: affId, isSpecial, ...(network ? { uplineAffiliateId: ownerAffiliateId } : {}) },
      });

      return res.status(201).json({ uid: userRecord.uid, affiliateId: affId });
    } catch (error: any) {
      console.error('Error accepting invite:', error);
      return res.status(500).json({ error: error.message || 'Erro interno aceitando convite.' });
    }
  });

  // Proxy route for Affiliate API to handle multiple endpoints dynamically
  app.get('/api/external/:endpoint/:id?', requireAuth, requireOtg, async (req, res) => {
    try {
      const { endpoint, id } = req.params;
      const BASE_URL = process.env.VITE_AFFILIATE_API_BASE_URL || 'https://affiliate-api-prd.partnersotg.com';
      const apiKey = process.env.AFFILIATE_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: 'Chave de API não configurada' });
      }

      // Per-affiliate scoping: non-admins may only read `results`, never another
      // endpoint. Normal afiliados ficam restritos ao próprio id; o afiliado
      // ESPECIAL (B3) pode ler a própria sub-rede (own + subs vinculados). O
      // conjunto permitido é resolvido NO SERVIDOR (special_affiliates) e os
      // affiliateIds pedidos pelo cliente são validados contra ele.
      const user = (req as any).user;
      if (user?.role !== 'admin') {
        // Carrega a sub-rede do especial só no caminho válido (results, sem :id, com
        // affiliateId); resolveScopedAffiliateIds cuida de todos os 403. [[R4]]
        let special: any = null;
        if (adminDb && endpoint === 'results' && !id && user?.affiliateId) {
          try {
            special = await resolveSpecialRecord(String(user.affiliateId));
          } catch (e) {
            console.error('Erro ao carregar sub-rede do afiliado especial:', e);
          }
        }
        const decision = resolveScopedAffiliateIds({
          role: user?.role,
          endpoint,
          id,
          ownAffiliateId: user?.affiliateId,
          special,
          requestedAffiliateIds: req.query.affiliateIds as any,
        });
        if (decision.denied) return res.status(decision.denied.status).json({ error: decision.denied.error });
        if (decision.scoped) req.query.affiliateIds = decision.scoped.join(',');
      }

      // A API externa NÃO aceita affiliateIds separados por vírgula (devolve vazio);
      // ela espera o parâmetro REPETIDO (affiliateIds=a&affiliateIds=b). Expandimos
      // aqui — senão o afiliado especial (own + subs) e o filtro multi-marca por
      // campanha (vários ids) recebem 0 linhas. Os demais params passam direto.
      const outParams = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query as Record<string, any>)) {
        if (value == null) continue;
        if (key === 'affiliateIds') {
          expandAffiliateIdsParam(value).forEach((affId) => outParams.append('affiliateIds', affId));
        } else {
          outParams.append(key, String(value));
        }
      }
      const queryString = outParams.toString();
      const targetUrl = id
        ? `${BASE_URL}/api/v2/external/${endpoint}/${id}${queryString ? '?' + queryString : ''}`
        : `${BASE_URL}/api/v2/external/${endpoint}${queryString ? '?' + queryString : ''}`;
        
      console.log(`Proxying request to: ${targetUrl}`);
      
      const response = await fetchImpl(targetUrl, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json',
          'User-Agent': 'AgenciaBoost-App/1.0',
        },
      });

      const responseText = await response.text();
      let responseBody: any = null;
      try {
        responseBody = responseText ? JSON.parse(responseText) : null;
      } catch {
        responseBody = null;
      }

      if (!response.ok) {
        // SECURITY (MEDIUM-1): o corpo bruto do upstream (details/message/host/IDs
        // internos) fica SÓ no log do servidor; ao cliente vai um erro genérico +
        // requestId p/ correlação. Mantém-se apenas o `code` curto (ex.: "040"),
        // que a UI usa p/ distinguir "sem dados" de erro real — não é sensível.
        const requestId = crypto.randomBytes(8).toString('hex');
        console.error(`[external-proxy] ${requestId} upstream ${response.status} em ${endpoint}:`, responseText);
        return res.status(response.status).json({
          error: 'Falha ao consultar a API externa.',
          code: responseBody?.code || responseBody?.errorCode,
          requestId,
        });
      }

      if (responseBody !== null) {
        return res.json(responseBody);
      }

      const requestId = crypto.randomBytes(8).toString('hex');
      console.error(`[external-proxy] ${requestId} resposta não-JSON do upstream em ${endpoint}:`, responseText);
      return res.status(502).json({
        error: 'Resposta inválida da API externa.',
        requestId,
      });
    } catch (error) {
      console.error('Proxy Exception:', error);
      res.status(500).json({ 
        error: 'Erro interno no servidor proxy', 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // --- Link de divulgação da agência (tracking + redirect) ------------------
  // O afiliado compartilha boost.../go/:code em vez da URL da casa. O servidor
  // registra o clique (subid-ready: gera um clickId e o passa como ?subid pra
  // casa — quando a OTG ligar o postback, vira atribuição por jogador) e
  // redireciona pro registerUrl real do afiliado naquela casa. PÚBLICO (sem auth:
  // qualquer visitante abre). Provado por probe (2026-06-17): o subid sobrevive
  // até a URL final de cadastro e convive com o `wm` (ref do afiliado).
  const GO_FALLBACK = process.env.GO_FALLBACK_URL || '/';
  // Limite generoso só p/ conter abuso de writes (humano não clica 60x/min). Não
  // usa o publicAuthLimiter (mais estrito) p/ não barrar tráfego legítimo do link.
  const goLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
  app.get('/go/:code', goLimiter, async (req, res) => {
    const code = String(req.params.code || '').trim();
    if (!adminDb || !code) return res.redirect(302, GO_FALLBACK);
    try {
      const snap = await adminDb.collection('affiliate_links').doc(code).get();
      const link = snap.exists ? (snap.data() as any) : null;
      if (!link || link.active === false || !link.registerUrl) {
        return res.redirect(302, GO_FALLBACK);
      }

      const clickId = crypto.randomBytes(12).toString('hex'); // = o subid
      const ua = String(req.headers['user-agent'] || '');
      const referer = String(req.headers['referer'] || '');
      const bot = isBotUserAgent(ua);
      // LGPD: nunca guardamos o IP cru — só um hash truncado e salgado (dedup/fraude).
      const ipHash = crypto
        .createHash('sha256')
        .update(String(req.ip || '') + (process.env.IP_HASH_SALT || ''))
        .digest('hex')
        .slice(0, 16);
      const day = clickStatDay(new Date());
      const affiliateId = link.affiliateId ?? null;
      const brandId = link.brandId ?? null;

      // Clique cru (subid=clickId, p/ casar com o futuro postback) + contador
      // diário (séries temporais) + totais no próprio link (leitura barata p/ a
      // dashboard). Await garante o flush antes do redirect no Cloud Run.
      await Promise.all([
        adminDb.collection('link_clicks').doc(clickId).set({
          clickId, code, affiliateId, brandId,
          isBot: bot,
          ua: ua.slice(0, 300),
          referer: referer.slice(0, 300),
          ipHash,
          ts: admin.firestore.FieldValue.serverTimestamp(),
        }),
        adminDb.collection('link_click_stats').doc(`${code}__${day}`).set({
          code, affiliateId, brandId, date: day,
          clicks: admin.firestore.FieldValue.increment(bot ? 0 : 1),
          botClicks: admin.firestore.FieldValue.increment(bot ? 1 : 0),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }),
        adminDb.collection('affiliate_links').doc(code).set({
          clicks: admin.firestore.FieldValue.increment(bot ? 0 : 1),
          botClicks: admin.firestore.FieldValue.increment(bot ? 1 : 0),
          lastClickAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }),
      ]);

      res.cookie('boost_click', clickId, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      return res.redirect(302, appendSubid(String(link.registerUrl), clickId));
    } catch (e) {
      console.error('[go] erro no redirect de clique:', e);
      return res.redirect(302, GO_FALLBACK);
    }
  });

  // Cria (idempotente por afiliado×casa) o link de divulgação de um afiliado.
  // Admin only. Reusar = link estável (não muda o code já compartilhado).
  app.post('/api/affiliate-links', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const { affiliateId, brandId, registerUrl } = req.body || {};
      if (!affiliateId || !registerUrl) {
        return res.status(400).json({ error: 'affiliateId e registerUrl são obrigatórios' });
      }
      const normBrand = brandId != null ? String(brandId) : null;
      const existing = await adminDb
        .collection('affiliate_links')
        .where('affiliateId', '==', String(affiliateId))
        .where('brandId', '==', normBrand)
        .limit(1)
        .get();
      if (!existing.empty) {
        const docRef = existing.docs[0].ref;
        await docRef.set(
          { registerUrl: String(registerUrl), active: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
        const fresh = await docRef.get();
        return res.json({ code: docRef.id, ...(fresh.data() as any) });
      }
      const code = crypto.randomBytes(6).toString('base64url'); // ~8 chars URL-safe
      const payload = {
        code,
        affiliateId: String(affiliateId),
        brandId: normBrand,
        registerUrl: String(registerUrl),
        active: true,
        clicks: 0,
        botClicks: 0,
        createdByUid: (req as any).user?.uid ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await adminDb.collection('affiliate_links').doc(code).set(payload);
      return res.status(201).json(payload);
    } catch (e) {
      console.error('[affiliate-links] erro ao criar link:', e);
      return res.status(500).json({ error: 'Erro ao criar o link' });
    }
  });

  // Lista os links: admin vê todos; ESPECIAL vê os da própria rede (own + subs,
  // como GET /api/affiliate-configs — item 1 da call Infinity 12/08); afiliado
  // comum vê só o(s) dele. Os totais de clique vêm direto do doc do link
  // (incrementados no /go) — leitura barata.
  app.get('/api/affiliate-links', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const user = (req as any).user;
      let query: admin.firestore.Query = adminDb.collection('affiliate_links');
      if (user?.role !== 'admin') {
        if (!user?.affiliateId) {
          return res.status(403).json({ error: 'Sua conta não está vinculada a um afiliado.' });
        }
        const ownId = String(user.affiliateId);
        const scope = specialNetworkScope(ownId, await resolveSpecialRecord(ownId));
        if (scope.size > 0) {
          // Filtro em memória, não `where in`: a sub-rede pode passar de 30 ids
          // (limite do Firestore) e a coleção já é varrida inteira pelo admin.
          // O pool de standby (affiliateId null) fica de fora — é da agência.
          const all = await query.get();
          const links = all.docs
            .map((d) => ({ code: d.id, ...(d.data() as any) }))
            .filter((l: any) => scope.has(String(l.affiliateId ?? '')));
          return res.json({ links });
        }
        query = query.where('affiliateId', '==', ownId);
      }
      const snap = await query.get();
      const links = snap.docs.map((d) => ({ code: d.id, ...(d.data() as any) }));
      return res.json({ links });
    } catch (e) {
      console.error('[affiliate-links] erro ao listar links:', e);
      return res.status(500).json({ error: 'Erro ao listar os links' });
    }
  });

  // Tag -> dono, a partir dos links já emitidos mais os apelidos salvos. Fonte
  // ÚNICA das DUAS portas que cunham link (a tela /links e a aprovação de parceria
  // do marketplace): com dois índices, cada porta sugeriria uma tag que a outra já
  // deu a alguém, e a colisão só apareceria no relatório da casa.
  const loadTagOwners = async (): Promise<Map<string, string>> => {
    const [linksSnap, aliasSnap] = await Promise.all([
      adminDb!.collection('affiliate_links').get(),
      adminDb!.collection('affiliate_tag_aliases').get(),
    ]);
    const ownerByTag = new Map<string, string>();
    for (const d of linksSnap.docs) {
      const data = d.data() as any;
      const owner = String(data?.affiliateId ?? '').trim();
      const tag = normalizeTag(data?.tag) || normalizeTag(extractTagFromUrl(String(data?.registerUrl ?? '')));
      // Placeholder cru não é tag de ninguém: reservá-lo faria o próximo afiliado
      // receber uma tag com sufixo por causa de uma colisão que não existe.
      if (!tag || hasUnresolvedPlaceholder(tag)) continue;
      // Link do POOL (standby) entra com dono VAZIO: a tag já foi cunhada na casa,
      // então não pode ser SUGERIDA a mais ninguém — mas segue reivindicável de
      // propósito, que é o que atribuir um link do pool significa. Dono real vence
      // o pool: senão a tag de alguém ficaria mascarada e o 409 não dispararia.
      const prev = ownerByTag.get(tag);
      if (prev === undefined || (!prev && owner)) ownerByTag.set(tag, owner);
    }
    for (const d of aliasSnap.docs) {
      const data = d.data() as any;
      const tag = normalizeTag(data?.tag ?? d.id);
      const owner = String(data?.affiliateId ?? '').trim();
      if (tag && owner) ownerByTag.set(tag, owner); // apelido vence, como no import
    }
    return ownerByTag;
  };

  // Gera o link de um afiliado a partir do TEMPLATE da casa (`registerUrlTemplate`)
  // + uma tag nossa. Admin OU afiliado especial ativo — o especial só gera para a
  // PRÓPRIA rede (ele mesmo + subs; item 1 da call Infinity 12/08). Sub comum
  // segue 403: o link dele é emitido pelo gerente ou pela agência.
  //
  // Por que isto existe sem depender da API da casa: a tag de rastreio é um
  // parâmetro DINÂMICO capturado na visita do jogador — a doc do TAP by Smartico
  // não aceita `afp` como entrada do `af2_build_link`, e os probes `teste01` /
  // `infinitw298` apareceram no relatório da Esportiva sem terem sido cunhados no
  // painel dela. Ver src/lib/linkGeneration.ts e MIGRACAO-INFINITY-LEGADO.md §9.4.
  //
  // A tag gravada no link já casa o resultado sozinha no próximo import do
  // relatório da casa (`buildTagIndex` indexa a tag do link atribuído) — o que sai
  // daqui NÃO precisa de apelido manual na tela de vínculo.
  app.post('/api/affiliate-links/generate', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const affiliateId = String(req.body?.affiliateId ?? '').trim();
      const brandKey = String(req.body?.brandId ?? '').trim();
      if (!affiliateId) return res.status(400).json({ error: 'affiliateId é obrigatório.' });
      if (!brandKey) return res.status(400).json({ error: 'Escolha a casa: o link sai do template dela.' });

      // Escopo do não-admin: especial ativo, e o alvo dentro da rede dele. O
      // registro vem RESOLVIDO por resolveSpecialRecord (fonte única da sub-rede);
      // a regra do conjunto é pura em specialNetworkScope (src/lib/scope.ts).
      const caller = (req as any).user;
      if (caller?.role !== 'admin') {
        const ownId = String(caller?.affiliateId ?? '').trim();
        const scope = specialNetworkScope(ownId, ownId ? await resolveSpecialRecord(ownId) : null);
        if (scope.size === 0) {
          return res.status(403).json({ error: 'Apenas a agência e afiliados especiais geram links.' });
        }
        if (!scope.has(affiliateId)) {
          return res.status(403).json({ error: 'Este afiliado não pertence à sua rede.' });
        }
      }

      // Casa pela mesma convenção do client (`dealBrandKey`): brandId da OTG
      // quando existe, senão o slug — e o id do doc como último recurso.
      const housesSnap = await adminDb.collection('houses').get();
      const house = housesSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .find((h) => [h.brandId, h.slug, h.id].map((v) => String(v ?? '').trim()).includes(brandKey));
      if (!house) return res.status(404).json({ error: 'Casa não encontrada.' });
      const template = String(house.registerUrlTemplate ?? '').trim();
      if (!template) {
        return res.status(400).json({
          error: `A casa "${house.name ?? brandKey}" não tem link de cadastro cadastrado. Preencha o campo em /casas.`,
        });
      }

      // Tags já em uso: links emitidos + apelidos salvos. Serve para sugerir sem
      // colidir E para recusar a tag digitada que já é de outra pessoa.
      const ownerByTag = await loadTagOwners();

      const requested = normalizeTag(req.body?.tag);
      const tag = requested || suggestTag(
        { name: await affiliateNameOf(affiliateId), affiliateId },
        ownerByTag.keys(),
        req.body?.tagPrefix,
      );
      const currentOwner = ownerByTag.get(tag);
      if (currentOwner && currentOwner !== affiliateId) {
        // Reusar a tag de outro afiliado passaria o resultado dele (o histórico
        // inclusive) para o novo dono no próximo import.
        return res.status(409).json({ error: `A tag "${tag}" já é de outro afiliado. Escolha outra.` });
      }

      const registerUrl = buildTaggedUrl(template, tag, req.body?.tagParam);
      if (!registerUrl) {
        return res.status(400).json({ error: 'O link de cadastro da casa não é uma URL http(s) válida.' });
      }

      // Idempotente por afiliado × casa, igual ao POST /api/affiliate-links: o
      // code é o que o afiliado já compartilhou e não pode mudar.
      const existing = await adminDb
        .collection('affiliate_links')
        .where('affiliateId', '==', affiliateId)
        .where('brandId', '==', brandKey)
        .limit(1)
        .get();

      let code: string;
      let created: boolean;
      if (!existing.empty) {
        code = existing.docs[0].id;
        created = false;
        await existing.docs[0].ref.set(
          { tag, registerUrl, active: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true },
        );
      } else {
        code = crypto.randomBytes(6).toString('base64url');
        created = true;
        await adminDb.collection('affiliate_links').doc(code).set({
          code,
          affiliateId,
          brandId: brandKey,
          tag,
          registerUrl,
          active: true,
          clicks: 0,
          botClicks: 0,
          createdByUid: (req as any).user?.uid ?? null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await writeAuditLog(req, {
        entityType: 'affiliate',
        entityId: affiliateId,
        entityLabel: await affiliateNameOf(affiliateId),
        action: 'link.generate',
        metadata: { code, tag, brandId: brandKey, house: house.slug ?? house.id, created },
      });
      return res.status(created ? 201 : 200).json({ code, tag, registerUrl, brandId: brandKey, created });
    } catch (e) {
      console.error('[affiliate-links] erro ao gerar link:', e);
      return res.status(500).json({ error: 'Erro ao gerar o link' });
    }
  });

  // --- Pool de STANDBY + atribuição (triagem de links) ----------------------
  // Links já cunhados na casa e ainda SEM DONO. Guardamos como doc de
  // `affiliate_links` com `affiliateId: null` e `active: false`: o /go/:code
  // recusa link inativo, então um link do pool nunca redireciona nem conta
  // clique antes de ser atribuído a alguém.
  app.post('/api/affiliate-links/standby', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      // O MESMO parser puro que a UI usa na pré-visualização — sem drift entre
      // o que o admin vê antes de enviar e o que é gravado.
      const { links, invalid } = parseStandbyLinks(String(req.body?.text ?? ''));
      if (links.length === 0) {
        return res.status(400).json({ error: 'Nenhum link válido. Cole URLs http(s), uma por linha.', invalid });
      }
      const brandId = req.body?.brandId != null && String(req.body.brandId).trim() !== ''
        ? String(req.body.brandId)
        : null;

      // Não recria o que já existe (o import costuma ser re-colado inteiro).
      const existingSnap = await adminDb.collection('affiliate_links').get();
      const existingUrls = new Set(
        existingSnap.docs.map((d) => String((d.data() as any)?.registerUrl ?? '')).filter(Boolean),
      );

      const batch = adminDb.batch();
      let created = 0;
      let skipped = 0;
      for (const item of links) {
        if (existingUrls.has(item.registerUrl)) {
          skipped++;
          continue;
        }
        const code = crypto.randomBytes(6).toString('base64url');
        batch.set(adminDb.collection('affiliate_links').doc(code), {
          code,
          affiliateId: null,
          brandId,
          registerUrl: item.registerUrl,
          tag: item.tag || null,
          active: false, // standby: só vira entregável ao ser atribuído
          clicks: 0,
          botClicks: 0,
          createdByUid: (req as any).user?.uid ?? null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        created++;
      }
      if (created > 0) await batch.commit();
      await writeAuditLog(req, {
        entityType: 'affiliate_link',
        entityLabel: `Standby (${created} links)`,
        action: 'link.standby_import',
        metadata: { created, skipped, invalid: invalid.length, brandId },
      });
      return res.status(201).json({ created, skipped, invalid });
    } catch (e) {
      console.error('[affiliate-links] erro no import de standby:', e);
      return res.status(500).json({ error: 'Erro ao importar os links de standby' });
    }
  });

  // Atribui um link do pool a um afiliado (o "Pegar do Standby" do legado).
  app.post('/api/affiliate-links/:code/assign', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const affiliateId = String(req.body?.affiliateId ?? '').trim();
      if (!affiliateId) return res.status(400).json({ error: 'affiliateId é obrigatório.' });
      const ref = adminDb.collection('affiliate_links').doc(String(req.params.code));
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Link não encontrado.' });
      const before = snap.data() as any;
      const owner = String(before?.affiliateId ?? '').trim();
      // Um link já distribuído carrega histórico de cliques de OUTRA pessoa —
      // reatribuir misturaria as atribuições. Libere ao pool antes.
      if (owner && owner !== affiliateId) {
        return res.status(409).json({ error: 'Este link já pertence a outro afiliado. Libere-o para o standby antes.' });
      }
      if (!String(before?.registerUrl ?? '').trim()) {
        return res.status(400).json({ error: 'Este link não tem URL de cadastro: não há para onde enviar o afiliado.' });
      }
      await ref.set(
        {
          affiliateId,
          active: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await writeAuditLog(req, {
        entityType: 'affiliate',
        entityId: affiliateId,
        action: 'link.assign',
        metadata: { code: ref.id, brandId: before?.brandId ?? null, tag: before?.tag ?? null },
      });
      return res.json({ code: ref.id, affiliateId, active: true });
    } catch (e) {
      console.error('[affiliate-links] erro ao atribuir link:', e);
      return res.status(500).json({ error: 'Erro ao atribuir o link' });
    }
  });

  // Devolve o link ao pool (o botão "Standby" de cada linha no legado).
  app.post('/api/affiliate-links/:code/release', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const ref = adminDb.collection('affiliate_links').doc(String(req.params.code));
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Link não encontrado.' });
      const before = snap.data() as any;
      await ref.set(
        {
          affiliateId: null,
          active: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await writeAuditLog(req, {
        entityType: 'affiliate',
        entityId: String(before?.affiliateId ?? '') || undefined,
        action: 'link.release',
        metadata: { code: ref.id, brandId: before?.brandId ?? null },
      });
      return res.json({ code: ref.id, released: true });
    } catch (e) {
      console.error('[affiliate-links] erro ao liberar link:', e);
      return res.status(500).json({ error: 'Erro ao liberar o link' });
    }
  });

  // Remove do pool. Só link SEM dono: apagar link distribuído destruiria o
  // histórico de cliques já atribuído a alguém.
  app.delete('/api/affiliate-links/:code', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const ref = adminDb.collection('affiliate_links').doc(String(req.params.code));
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Link não encontrado.' });
      const before = snap.data() as any;
      if (String(before?.affiliateId ?? '').trim()) {
        return res.status(409).json({ error: 'Este link pertence a um afiliado. Libere-o para o standby antes de remover.' });
      }
      await ref.delete();
      await writeAuditLog(req, {
        entityType: 'affiliate_link',
        entityId: ref.id,
        action: 'link.delete',
        metadata: { registerUrl: before?.registerUrl ?? null },
      });
      return res.json({ deleted: true });
    } catch (e) {
      console.error('[affiliate-links] erro ao remover link:', e);
      return res.status(500).json({ error: 'Erro ao remover o link' });
    }
  });

  // === Backoffice de CASAS (betting houses) =================================
  // Fonte de verdade do registro de casas (substitui o KNOWN_BRANDS hardcoded):
  // o admin cria/edita casas em /casas. Tudo via Admin SDK; o cliente nunca toca
  // `houses` direto (rules server-only) — lê pelo GET autenticado p/ logos/filtros.
  const slugifyHouse = (s: string) =>
    String(s ?? '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  // Sobe a logo (data URL base64) pro Storage e devolve a URL de download. Usa
  // download-token (compatível com uniform bucket-level access — makePublic falha).
  // Instância SEM Storage (bucket nunca criado no projeto — caso real: a Infinity
  // nunca ativou o Storage e o upload da logo da LEON morria em "bucket inexistente",
  // 2026-08-14): logo pequena é gravada como a PRÓPRIA data URL no doc da casa —
  // auto-contida, funciona em <img src> e no GET /api/houses sem bucket nenhum.
  // O teto inline existe porque o doc do Firestore tem limite de 1MiB; acima dele
  // só com o Storage ativado mesmo.
  const INLINE_LOGO_MAX_BYTES = 200 * 1024;
  const uploadHouseLogo = async (slug: string, dataUrl: string): Promise<string> => {
    const m = /^data:(image\/(png|jpe?g|webp|svg\+xml));base64,(.+)$/i.exec(String(dataUrl));
    if (!m) throw new Error('Logo inválida (envie PNG, JPG, WEBP ou SVG).');
    const mime = m[1];
    const ext = m[2].toLowerCase() === 'jpeg' ? 'jpg' : m[2].toLowerCase().replace('svg+xml', 'svg');
    const buffer = Buffer.from(m[3], 'base64');
    if (buffer.length > 2 * 1024 * 1024) throw new Error('Logo muito grande (máx. 2MB).');
    try {
      const bucket = admin.storage().bucket();
      const filePath = `house-logos/${slug}-${Date.now()}.${ext}`;
      const token = crypto.randomUUID();
      await bucket.file(filePath).save(buffer, {
        resumable: false,
        contentType: mime,
        metadata: { cacheControl: 'public,max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } },
      });
      return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
    } catch (e) {
      if (buffer.length <= INLINE_LOGO_MAX_BYTES) return `data:${mime};base64,${m[3]}`;
      console.error('[houses] Storage indisponível e a logo não cabe inline:', e);
      throw new Error('O Storage desta instância não está ativado (crie o bucket no console do Firebase) e a imagem passa de 200KB. Envie uma imagem menor ou ative o Storage.');
    }
  };

  // Semeia as casas-semente (DEFAULT_BRANDS) na 1ª vez que a coleção está vazia,
  // p/ produção nunca ficar sem Superbet/SportingBet. Idempotente.
  // P5.3 (produtização): as sementes são casas OTG — numa instância OTG-free
  // (demo/white-label) elas nasceriam "fantasma" (dataSource 'otg' nunca recebe
  // dado sem a API). Instância OTG-free começa com /casas vazio; o admin (ou o
  // seed-demo.cjs) cria as casas manuais dela.
  const ensureHousesSeeded = async () => {
    if (!adminDb || !OTG_ENABLED) return;
    const snap = await adminDb.collection('houses').limit(1).get();
    if (!snap.empty) return;
    const batch = adminDb.batch();
    DEFAULT_BRANDS.forEach((b, i) => {
      batch.set(adminDb!.collection('houses').doc(b.slug), {
        slug: b.slug,
        name: b.name,
        brandId: b.id ?? null,
        logo: b.logo ?? null,
        registerUrlTemplate: null,
        active: b.active !== false,
        order: i,
        dataSource: b.dataSource ?? 'otg', // sementes vêm da OTG
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  };

  const houseFromDoc = (d: admin.firestore.DocumentSnapshot) => {
    const data = (d.data() as any) || {};
    return {
      id: d.id,
      slug: data.slug ?? d.id,
      name: data.name ?? d.id,
      brandId: data.brandId ?? null,
      logo: data.logo ?? null,
      registerUrlTemplate: data.registerUrlTemplate ?? null,
      active: data.active !== false,
      order: Number.isFinite(Number(data.order)) ? Number(data.order) : 0,
      dataSource: data.dataSource === 'manual' ? 'manual' : 'otg',
      defaultCpa: Number.isFinite(Number(data.defaultCpa)) ? Number(data.defaultCpa) : null,
      defaultRev: Number.isFinite(Number(data.defaultRev)) ? Number(data.defaultRev) : null,
      // Moeda do CPA. Normalizada na leitura (ausente = EUR): a casa antiga não tem o
      // campo e o valor dela ESTÁ em euro — o client nunca precisa adivinhar.
      cpaCurrency: resolveCpaCurrency(data.cpaCurrency),
      // Regime da cotação. Ausente = 'live': a casa em euro sempre converteu pela
      // cotação do dia, e mudar esse default reinterpretaria o CPA de quem já existe.
      fxMode: resolveFxMode(data.fxMode, 'live'),
      fxRate: Number.isFinite(Number(data.fxRate)) && Number(data.fxRate) > 0 ? Number(data.fxRate) : null,
      // Alíquota de ISS retida no repasse ao afiliado. VARIA POR CASA (ver src/lib/tax.ts).
      issPercent: Number.isFinite(Number(data.issPercent)) ? Number(data.issPercent) : null,
      // Toggle "REV no lucro líquido" (call Infinity 12/08). Ausente = true (sempre foi assim).
      revInProfit: data.revInProfit !== false,
      // Frescor do dado (pull horário OU upload) — o afiliado lê isto no painel.
      // Timestamp vira ISO: o client não tem o SDK admin para desserializar.
      lastResultsSyncAt: data.lastResultsSyncAt?.toDate?.().toISOString?.() ?? data.lastResultsSyncAt ?? null,
      // Última VERIFICAÇÃO do conector (rodada vazia também carimba) ≠ último dado.
      lastResultsCheckAt: data.lastResultsCheckAt?.toDate?.().toISOString?.() ?? data.lastResultsCheckAt ?? null,
      lastResultsSyncSource: data.lastResultsSyncSource ?? null,
      lastResultsDate: data.lastResultsDate ?? null,
      // Conector de pull declarado PELA casa (auto-carimbado pelo conector).
      integration: data.integration ?? null,
      // Id da casa DENTRO da integração multiHouse (ex.: offer_id na rede
      // Fomento/Offer18) — é por ele que o postback acha a casa.
      integrationExternalId: data.integrationExternalId ?? null,
    };
  };

  // Fonte ÚNICA do vínculo casa↔integração (B7). O vínculo é 1:1 e vive em DOIS
  // docs — `houses/{slug}.integration` (a flag que roteia o pull e liga o botão
  // "Atualizar") e `integrations/{id}.houseId` (o alvo que o conector puxa).
  // DUAS telas podem criá-lo: /integracoes (pelo lado da integração) e o modal de
  // /casas (pelo lado da casa). Escrever só um lado faz a tela dizer "ligada na
  // casa X" enquanto o botão da casa X não aparece — por isso todo mundo passa
  // por aqui. Trocar de casa LIMPA a anterior: o conector serve uma casa só.
  const applyIntegrationLink = async (integrationId: string, houseSlug: string | null) => {
    if (!adminDb) return;
    const ref = adminDb.collection('integrations').doc(integrationId);
    const snap = await ref.get();
    const prevHouse = snap.exists ? (String((snap.data() as any)?.houseId ?? '').trim() || null) : null;
    if (prevHouse === houseSlug) return;
    await ref.set({ id: integrationId, houseId: houseSlug }, { merge: true });
    if (prevHouse) {
      // `null`, não FieldValue.delete(): o leitor normaliza (`data.integration ??
      // null`) e um campo explicitamente nulo é mais fácil de auditar/testar que
      // a ausência dele.
      await adminDb.collection('houses').doc(prevHouse)
        .set({ integration: null }, { merge: true })
        .catch((e) => console.error('[integrations] falha ao limpar a casa antiga:', e));
    }
    if (houseSlug) {
      await adminDb.collection('houses').doc(houseSlug)
        .set({ integration: integrationId }, { merge: true })
        .catch((e) => console.error('[integrations] falha ao carimbar a casa:', e));
    }
  };

  // Rede 1:N (multiHouse): o MESMO id externo (offer_id) em duas casas faria o
  // postback creditar a casa errada sem nenhum erro na tela. Recusado na gravação.
  const findExternalIdClash = async (
    integrationId: string,
    externalId: string,
    exceptSlug: string,
  ): Promise<string | null> => {
    if (!adminDb) return null;
    const snap = await adminDb.collection('houses').where('integrationExternalId', '==', externalId).get();
    const clash = snap.docs.find(
      (d) => d.id !== exceptSlug && String((d.data() as any)?.integration ?? '').trim() === integrationId,
    );
    return clash ? String((clash.data() as any)?.name ?? clash.id) : null;
  };

  // Lista as casas (qualquer signed-in: o afiliado precisa p/ logos/filtros).
  app.get('/api/houses', requireAuth, async (_req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      await ensureHousesSeeded();
      const snap = await adminDb.collection('houses').get();
      const houses = snap.docs
        .map(houseFromDoc)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'pt-BR'));
      // "Atualizar" em /casas é 100% dirigido pela FLAG da casa: `integration`
      // (carimbada pelo conector) + conector configurado nesta instância. Sem a
      // anotação o botão aparecia em toda casa manual e sempre puxava a
      // Esportiva (bug 08/08/2026).
      //
      // B7: "configurado" passou a depender de `integrations/{id}` (chave +
      // toggle da tela /integracoes). Resolve UMA vez por request e reusa — não
      // por casa, senão N casas = N leituras do mesmo doc. Desligar a integração
      // apaga o botão na hora, sem esperar o próximo ciclo do cron.
      const connectorReady = new Map<string, boolean>();
      await Promise.all(
        Object.keys(PULL_CONNECTORS).map(async (id) => {
          connectorReady.set(id, await PULL_CONNECTORS[id].configured());
        }),
      );
      return res.json({
        houses: houses.map((h) => ({
          ...h,
          pullAvailable: !!(h.integration && connectorReady.get(h.integration)),
        })),
      });
    } catch (e) {
      console.error('[houses] erro ao listar:', e);
      return res.status(500).json({ error: 'Erro ao listar as casas' });
    }
  });

  // Cria uma casa (admin). doc id = slug (único).
  app.post('/api/houses', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const { name, brandId, registerUrlTemplate, active, order, dataSource, logoBase64, integration } = req.body || {};
      const wantedIntegration = integration ? String(integration).trim() : '';
      const wantedSpec = wantedIntegration ? findIntegrationSpec(wantedIntegration) : null;
      if (wantedIntegration && !wantedSpec) {
        return res.status(400).json({ error: `Integração desconhecida: "${wantedIntegration}".` });
      }
      const externalId = String(req.body?.integrationExternalId ?? '').trim() || null;
      // Taxa padrão da casa (comissão casa→agência): número finito OU null (vazio).
      const numOrNull = (v: any) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
      const cleanName = String(name ?? '').trim();
      if (!cleanName) return res.status(400).json({ error: 'O nome da casa é obrigatório.' });
      const slug = slugifyHouse(req.body?.slug || cleanName);
      if (!slug) return res.status(400).json({ error: 'Slug inválido.' });
      // Moeda + regime de cotação viajam juntos: cotação fixa sem valor é recusada
      // AQUI, senão a casa nasceria com um CPA que não converte.
      const houseCurrency = resolveCpaCurrency(req.body?.cpaCurrency);
      const houseFxMode = resolveFxMode(req.body?.fxMode, 'live');
      const houseFxInput = normalizeFxInput(houseCurrency, houseFxMode, req.body?.fxRate);
      if ('error' in houseFxInput) return res.status(400).json({ error: houseFxInput.error });
      const houseFx = { currency: houseCurrency, fxMode: houseFxMode, fxRate: houseFxInput.fxRate };
      const ref = adminDb.collection('houses').doc(slug);
      if ((await ref.get()).exists) {
        return res.status(409).json({ error: `Já existe uma casa com o slug "${slug}".` });
      }
      if (wantedSpec?.multiHouse && externalId) {
        const clash = await findExternalIdClash(wantedIntegration, externalId, slug);
        if (clash) {
          return res.status(409).json({ error: `O ID "${externalId}" já está na casa "${clash}".` });
        }
      }
      let logo: string | null = null;
      if (logoBase64) logo = await uploadHouseLogo(slug, String(logoBase64));
      await ref.set({
        slug,
        name: cleanName,
        brandId: brandId ? String(brandId) : null,
        logo,
        registerUrlTemplate: registerUrlTemplate ? String(registerUrlTemplate) : null,
        active: active !== false,
        order: Number.isFinite(Number(order)) ? Number(order) : 0,
        // Casa nova nasce 'manual' (recebe upload); a OTG fica nas sementes.
        dataSource: dataSource === 'otg' ? 'otg' : 'manual',
        defaultCpa: numOrNull(req.body?.defaultCpa),
        defaultRev: numOrNull(req.body?.defaultRev),
        // Moeda em que a casa paga o CPA — gravada SEMPRE (casa nova nasce explícita),
        // junto do REGIME de cotação (do dia × fixa) e da cotação fixa quando houver.
        cpaCurrency: houseFx.currency,
        fxMode: houseFx.fxMode,
        fxRate: houseFx.fxRate,
        issPercent: numOrNull(req.body?.issPercent),
        // Rede 1:N grava a flag DIRETO na casa (o vínculo por applyIntegrationLink
        // é 1:1 e desligaria a casa anterior da mesma rede) + o id externo dela.
        ...(wantedSpec?.multiHouse ? { integration: wantedIntegration, integrationExternalId: externalId } : {}),
        createdByUid: (req as any).user?.uid ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Casa nova já nascendo integrada: o vínculo vale nos DOIS docs.
      if (wantedIntegration && !wantedSpec?.multiHouse) await applyIntegrationLink(wantedIntegration, slug);
      // ...e já nascendo com o acordo, p/ o admin não recadastrar a operadora em
      // /acordos. RASCUNHO (inativo): card sem baseline nem taxa na vitrine é pior
      // que card nenhum, e é a mesma decisão dos presets (PESQUISA-PRESETS-DEALS).
      // Nunca derruba a criação da casa: falha aqui só vai ao console.
      if (MARKETPLACE_ENABLED) {
        try {
          const draft = buildDraftDealFromHouse({ slug, name: cleanName }, DEAL_TYPE_DEFAULT);
          if (draft) {
            const dealRef = adminDb.collection('deals').doc();
            await dealRef.set({
              ...draft,
              label: buildDealLabel(draft),
              createdByUid: (req as any).user?.uid ?? null,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            await writeAuditLog(req, {
              entityType: 'deal', entityId: dealRef.id, entityLabel: buildDealLabel(draft),
              action: 'deal.create', metadata: { via: 'house.create', houseId: slug, draft: true },
            });
          }
        } catch (e) {
          console.error('[houses] casa criada, mas o rascunho de acordo falhou:', e);
        }
      }
      await writeAuditLog(req, {
        entityType: 'house', entityId: slug, entityLabel: cleanName, action: 'house.create',
        metadata: { dataSource: dataSource === 'otg' ? 'otg' : 'manual', integration: wantedIntegration || null },
      });
      return res.status(201).json(houseFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[houses] erro ao criar:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao criar a casa' });
    }
  });

  // Atualiza uma casa (admin). Patch parcial; logoBase64 troca a logo.
  app.patch('/api/houses/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const ref = adminDb.collection('houses').doc(String(req.params.id));
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Casa não encontrada.' });
      const body = req.body || {};
      const patch: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (body.name != null) {
        const cleanName = String(body.name).trim();
        if (!cleanName) return res.status(400).json({ error: 'O nome da casa é obrigatório.' });
        patch.name = cleanName;
      }
      if (body.brandId !== undefined) patch.brandId = body.brandId ? String(body.brandId) : null;
      if (body.registerUrlTemplate !== undefined) patch.registerUrlTemplate = body.registerUrlTemplate ? String(body.registerUrlTemplate) : null;
      if (body.active !== undefined) patch.active = body.active !== false;
      if (body.order !== undefined && Number.isFinite(Number(body.order))) patch.order = Number(body.order);
      if (body.dataSource !== undefined) patch.dataSource = body.dataSource === 'otg' ? 'otg' : 'manual';
      const numOrNull = (v: any) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
      if (body.defaultCpa !== undefined) patch.defaultCpa = numOrNull(body.defaultCpa);
      if (body.defaultRev !== undefined) patch.defaultRev = numOrNull(body.defaultRev);
      // A rota NÃO reescala nada: grava o par (valor, moeda) que chegou. Quem decide se
      // o número muda é a TELA — o modal converte o valor ao trocar a moeda, preservando
      // o R$ efetivo. Reinterpretar sem converter ("isto sempre foi R$") é possível pela
      // API, mas não tem caminho na UI hoje: lá é apagar o campo e redigitar. Só grava quando
      // MUDA de fato: casa antiga (sem o campo) já é EUR pela normalização, e escrever
      // 'EUR' nela só produziria uma linha de auditoria fantasma.
      if (body.cpaCurrency !== undefined) {
        const nextCurrency = resolveCpaCurrency(body.cpaCurrency);
        if (nextCurrency !== resolveCpaCurrency((snap.data() as any)?.cpaCurrency)) {
          patch.cpaCurrency = nextCurrency;
        }
      }
      // Regime de cotação. Validado contra a moeda RESULTANTE (a do patch, ou a que
      // já estava): mudar só o regime para "fixa" sem informar a cotação deixaria a
      // casa com um CPA que não converte, e o sintoma seria comissão zerada.
      if (body.fxMode !== undefined || body.fxRate !== undefined) {
        const stored = (snap.data() as any) || {};
        const currency = patch.cpaCurrency ?? resolveCpaCurrency(stored.cpaCurrency);
        const nextMode = body.fxMode !== undefined
          ? resolveFxMode(body.fxMode, 'live')
          : resolveFxMode(stored.fxMode, 'live');
        const rawRate = body.fxRate !== undefined ? body.fxRate : stored.fxRate;
        const fx = normalizeFxInput(currency, nextMode, rawRate);
        if ('error' in fx) return res.status(400).json({ error: fx.error });
        patch.fxMode = nextMode;
        patch.fxRate = fx.fxRate;
      }
      if (body.issPercent !== undefined) patch.issPercent = numOrNull(body.issPercent);
      // Toggle "REV no lucro líquido" (call 12/08): grava booleano cru; ausente
      // no doc = true (a leitura normaliza). Mudar isto MUDA o lucro do /admin.
      if (body.revInProfit !== undefined) patch.revInProfit = body.revInProfit !== false;
      if (body.logoBase64) patch.logo = await uploadHouseLogo((snap.data() as any)?.slug ?? ref.id, String(body.logoBase64));
      else if (body.logo === null) patch.logo = null;

      // Vínculo com uma integração, escolhido no modal de /casas ("Pull automático").
      // Catálogo fechado: id desconhecido é erro do chamador, não doc novo.
      const slugOfHouse = (snap.data() as any)?.slug ?? ref.id;
      const prevIntegration = String((snap.data() as any)?.integration ?? '').trim() || null;
      let nextIntegration: string | null | undefined;
      if (body.integration !== undefined) {
        const wanted = body.integration ? String(body.integration).trim() : '';
        if (wanted && !findIntegrationSpec(wanted)) {
          return res.status(400).json({ error: `Integração desconhecida: "${wanted}".` });
        }
        nextIntegration = wanted || null;
        // O campo da casa é escrito por applyIntegrationLink (que cuida dos DOIS
        // lados); aqui o DESVINCULAR (sem integração destino) e a rede 1:N, cujo
        // vínculo é só a flag da casa (applyIntegrationLink desligaria a casa
        // anterior da mesma rede).
        if (!nextIntegration && prevIntegration) patch.integration = null;
        if (nextIntegration && findIntegrationSpec(nextIntegration)?.multiHouse) patch.integration = nextIntegration;
      }

      // Id da casa dentro da rede 1:N (ex.: offer_id da Fomento). Duplicado entre
      // casas da MESMA rede é recusado: o postback creditaria a casa errada.
      if (body.integrationExternalId !== undefined) {
        patch.integrationExternalId = String(body.integrationExternalId ?? '').trim() || null;
      }
      const effectiveIntegration = nextIntegration !== undefined ? nextIntegration : prevIntegration;
      const effectiveExternalId = patch.integrationExternalId !== undefined
        ? patch.integrationExternalId
        : (String((snap.data() as any)?.integrationExternalId ?? '').trim() || null);
      if (effectiveIntegration && findIntegrationSpec(effectiveIntegration)?.multiHouse && effectiveExternalId) {
        const clash = await findExternalIdClash(effectiveIntegration, effectiveExternalId, slugOfHouse);
        if (clash) {
          return res.status(409).json({ error: `O ID "${effectiveExternalId}" já está na casa "${clash}".` });
        }
      }

      await ref.set(patch, { merge: true });

      if (nextIntegration !== undefined && nextIntegration !== prevIntegration) {
        if (prevIntegration && !findIntegrationSpec(prevIntegration)?.multiHouse) {
          await applyIntegrationLink(prevIntegration, null);
        }
        if (nextIntegration && !findIntegrationSpec(nextIntegration)?.multiHouse) {
          await applyIntegrationLink(nextIntegration, slugOfHouse);
        }
      }

      // Auditoria: só os campos que de fato mudaram (antes→depois). 'logo' marcada à
      // parte (não logamos o base64/URL inteiro — só que houve troca).
      const changes = diffChanges(snap.data() as any, patch,
        ['name', 'brandId', 'registerUrlTemplate', 'active', 'order', 'dataSource', 'defaultCpa', 'defaultRev', 'cpaCurrency', 'fxMode', 'fxRate', 'issPercent', 'revInProfit', 'integrationExternalId']);
      if ('logo' in patch) changes.push({ field: 'logo', before: '(anterior)', after: patch.logo ? '(nova)' : null });
      // `integration` fica fora do diffChanges: no desvínculo o patch carrega um
      // FieldValue.delete(), que o diff leria como valor.
      if (nextIntegration !== undefined && nextIntegration !== prevIntegration) {
        changes.push({ field: 'integration', before: prevIntegration, after: nextIntegration });
      }
      if (changes.length) {
        await writeAuditLog(req, {
          entityType: 'house', entityId: String(req.params.id),
          entityLabel: patch.name ?? (snap.data() as any)?.name ?? null,
          action: 'house.update', changes,
        });
      }
      return res.json(houseFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[houses] erro ao atualizar:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao atualizar a casa' });
    }
  });

  // Remove uma casa (admin).
  app.delete('/api/houses/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const ref = adminDb.collection('houses').doc(String(req.params.id));
      const snap = await ref.get(); // lê antes p/ guardar o nome na auditoria
      await ref.delete();
      await writeAuditLog(req, {
        entityType: 'house', entityId: String(req.params.id),
        entityLabel: (snap.data() as any)?.name ?? null, action: 'house.delete',
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error('[houses] erro ao remover:', e);
      return res.status(500).json({ error: 'Erro ao remover a casa' });
    }
  });

  // === Acordos (deals) + Parcerias (marketplace, P2) =======================
  // Um DEAL é uma oferta de uma operadora (casa) com termos de comissão. Uma
  // PARCERIA liga afiliado→deal com status (solicitada→aprovada/recusada/encerrada).
  // Ao APROVAR, a taxa do deal é gravada no affiliate_configs.byBrand[chave-da-casa]
  // (mesmo caminho auditado do PATCH de config — o núcleo commission.ts não muda) e
  // um affiliate_links é emitido p/ o /go. Ver PESQUISA-AFFILITY.md e src/lib/deal.ts.
  const dealFromDoc = (d: admin.firestore.DocumentSnapshot) => {
    const x = (d.data() as any) || {};
    return {
      id: d.id,
      houseId: x.houseId ?? null,
      operatorName: x.operatorName ?? '',
      model: x.model ?? 'cpa',
      cpaValue: Number.isFinite(Number(x.cpaValue)) ? Number(x.cpaValue) : 0,
      revPercentage: Number.isFinite(Number(x.revPercentage)) ? Number(x.revPercentage) : 0,
      cycle: x.cycle ?? 'mensal',
      currency: x.currency ?? 'BRL',
      geo: x.geo ?? '',
      active: x.active !== false,
      order: Number.isFinite(Number(x.order)) ? Number(x.order) : 0,
      // Tipo + KPIs da vitrine. Deal ANTIGO não tem `type` e resolve como 'direto'
      // na leitura: é o que dispensa migração. Ver src/lib/dealType.ts.
      type: resolveDealType(x.type),
      baseline: Number.isFinite(Number(x.baseline)) ? Number(x.baseline) : 0,
      rollover: Number.isFinite(Number(x.rollover)) ? Number(x.rollover) : 0,
      // AUSENTE ≠ 0 também aqui. `Number(null)` é 0 e passa no isFinite, então a
      // checagem ingênua transformava "a casa não tem GGR" em "a casa tem GGR de
      // 0%" na leitura, e o formulário do admin abria com um zero que ninguém
      // digitou. Achado na verificação na demo (17/08).
      ggrPercentage: x.ggrPercentage == null || x.ggrPercentage === ''
        ? null
        : (Number.isFinite(Number(x.ggrPercentage)) ? Number(x.ggrPercentage) : null),
      // Meta mínima de CPAs por ciclo. Acordo antigo não tem o campo e lê 0 = "a casa
      // não estipulou meta"; o card não desenha a linha (visibleKpis). Sem migração.
      minCpaGoal: Number.isFinite(Number(x.minCpaGoal)) ? Number(x.minCpaGoal) : 0,
      // Câmbio. Regime AUSENTE = 'none' = não converte, que é o que o acordo antigo
      // fazia (a moeda era etiqueta e o número ia cru para o byBrand). É por aqui
      // que a APROVAÇÃO recebe o regime — sem estes dois campos ela converteria
      // sempre pelo default e o dado histórico mudaria de valor.
      fxMode: resolveFxMode(x.fxMode, 'none'),
      fxRate: Number.isFinite(Number(x.fxRate)) && Number(x.fxRate) > 0 ? Number(x.fxRate) : null,
    };
  };
  const partnershipFromDoc = (d: admin.firestore.DocumentSnapshot) => {
    const x = (d.data() as any) || {};
    return {
      id: d.id,
      affiliateId: x.affiliateId ?? null,
      dealId: x.dealId ?? null,
      status: (x.status ?? 'requested') as PartnershipStatus,
      code: x.code ?? null,
      operatorName: x.operatorName ?? '',
      dealLabel: x.dealLabel ?? '',
      houseId: x.houseId ?? null,
      requestedAt: x.requestedAt ?? null,
      decidedAt: x.decidedAt ?? null,
    };
  };

  // Lista deals. Admin vê todos; afiliado vê só os ATIVOS de CASA ATIVA, e com as
  // taxas já cortadas quando o tipo do deal as esconde dele.
  //
  // Duas coisas aqui não são cosméticas:
  // 1. A SANITIZAÇÃO é do servidor. Esconder o CPA só na tela deixa o valor no JSON,
  //    a um devtools de distância. Ver sanitizeDealForViewer.
  // 2. Casa PAUSADA some da vitrine. É o risco que o cliente descreveu na call de
  //    15/08: operação pausa a Esportiva e o afiliado ainda vê a oferta lá. Filtrar
  //    na leitura (em vez de desativar os deals em cascata) mantém o gesto
  //    reversível: reativar a casa devolve a oferta sem tocar em dado.
  app.get('/api/deals', requireAuth, requireMarketplace, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const isAdmin = (req as any).user?.role === 'admin';
      const [snap, housesSnap] = await Promise.all([
        adminDb.collection('deals').get(),
        isAdmin ? Promise.resolve(null) : adminDb.collection('houses').get(),
      ]);
      const pausedHouses = new Set<string>();
      housesSnap?.forEach((d) => { if ((d.data() as any)?.active === false) pausedHouses.add(d.id); });
      const deals = snap.docs
        .map(dealFromDoc)
        .filter((d) => isAdmin || (d.active && !pausedHouses.has(String(d.houseId))))
        .sort((a, b) => a.order - b.order || a.operatorName.localeCompare(b.operatorName, 'pt-BR'));
      return res.json({ deals: sanitizeDealsForViewer(deals, isAdmin ? 'admin' : 'affiliate') });
    } catch (e: any) {
      console.error('[deals] erro ao listar:', e);
      return res.status(500).json({ error: 'Erro ao listar acordos' });
    }
  });

  // Cria um deal (admin). Valida pelo núcleo puro; operatorName vem do form (ou é
  // derivado da casa no client). Label armazenado p/ exibir sem re-montar.
  app.post('/api/deals', requireAdmin, requireMarketplace, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const { deal, error } = normalizeDealInput(req.body || {});
      if (error || !deal) return res.status(400).json({ error: error || 'Dados do acordo inválidos.' });
      const ref = adminDb.collection('deals').doc();
      await ref.set({
        ...deal,
        label: buildDealLabel(deal),
        createdByUid: (req as any).user?.uid ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await writeAuditLog(req, {
        entityType: 'deal', entityId: ref.id, entityLabel: buildDealLabel(deal),
        action: 'deal.create', metadata: { houseId: deal.houseId, model: deal.model, cpaValue: deal.cpaValue, revPercentage: deal.revPercentage },
      });
      return res.status(201).json(dealFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[deals] erro ao criar:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao criar acordo' });
    }
  });

  // Atualiza um deal (admin). Ao DESATIVAR, encerra em cascata as parcerias vivas
  // daquele deal (espelha "descontinuada pela operadora" do Affility) e desativa os
  // links emitidos — o afiliado deixa de divulgar um acordo que não existe mais.
  app.patch('/api/deals/:id', requireAdmin, requireMarketplace, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const id = String(req.params.id || '').trim();
      const ref = adminDb.collection('deals').doc(id);
      const before = await ref.get();
      if (!before.exists) return res.status(404).json({ error: 'Acordo não encontrado.' });
      const merged = { ...(before.data() as any), ...(req.body || {}) };
      const { deal, error } = normalizeDealInput(merged);
      if (error || !deal) return res.status(400).json({ error: error || 'Dados do acordo inválidos.' });

      const patch = { ...deal, label: buildDealLabel(deal), updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      const changes = diffChanges(before.data() as any, patch,
        ['operatorName', 'model', 'cpaValue', 'revPercentage', 'cycle', 'currency', 'geo', 'active', 'houseId', 'minCpaGoal']);
      await ref.set(patch, { merge: true });
      if (changes.length) {
        await writeAuditLog(req, { entityType: 'deal', entityId: id, entityLabel: patch.label, action: 'deal.update', changes });
      }

      // Cascata de encerramento quando o deal é desativado.
      const wasActive = (before.data() as any)?.active !== false;
      if (wasActive && deal.active === false) {
        const parts = await adminDb.collection('partnership_requests').where('dealId', '==', id).get();
        const batch = adminDb.batch();
        let touched = 0;
        for (const p of parts.docs) {
          const st = (p.data() as any)?.status;
          if (st === 'requested' || st === 'approved') {
            batch.set(p.ref, { status: 'discontinued', decidedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            const code = (p.data() as any)?.code;
            if (code) batch.set(adminDb.collection('affiliate_links').doc(String(code)), { active: false }, { merge: true });
            touched++;
          }
        }
        if (touched) await batch.commit();
      }
      return res.json(dealFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[deals] erro ao atualizar:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao atualizar acordo' });
    }
  });

  // Lista parcerias. Admin vê todas (filtro opcional ?status); afiliado vê só as
  // dele (escopo forçado pelo token — nunca confia em affiliateId do cliente).
  app.get('/api/partnerships', requireAuth, requireMarketplace, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const user = (req as any).user;
      const isAdmin = user?.role === 'admin';
      let docs: admin.firestore.QueryDocumentSnapshot[] = [];

      if (isAdmin) {
        docs = (await adminDb.collection('partnership_requests').get()).docs;
      } else {
        const ownId = user?.affiliateId ? String(user.affiliateId) : '';
        if (!ownId) return res.json({ partnerships: [] });
        // O GERENTE precisa ver a fila dos filhos DIRETOS: é ele quem precifica.
        // Só os DIRETOS, e não a subárvore inteira — VISÃO ≠ DINHEIRO, a mesma
        // fronteira que `isDirectDownline` aplica na escrita. Trazer o neto aqui
        // mostraria uma fila que a rota de precificação recusaria com 403.
        const ids = [ownId];
        const special = await resolveSpecialRecord(ownId, { withSubs: false });
        if (resolveIsSpecial(special)) {
          const [uplines, specials] = await Promise.all([readUplineMap(), readSpecialsMap()]);
          for (const sub of resolveDirectSubIds(ownId, special!, { uplines, specials })) {
            if (!ids.includes(sub)) ids.push(sub);
          }
        }
        // `in` do Firestore aceita no máximo 30 valores por consulta.
        for (let i = 0; i < ids.length; i += 30) {
          const snap = await adminDb.collection('partnership_requests')
            .where('affiliateId', 'in', ids.slice(i, i + 30)).get();
          docs.push(...snap.docs);
        }
        // A BARREIRA é este filtro, não a query. A consulta acima é otimização (traz
        // menos documento da rede); confiar nela para escopo faria a segurança
        // depender de um operador funcionar. Sem esta linha o teste de IDOR que já
        // existia passou a vazar a parceria de outro afiliado.
        const allowed = new Set(ids);
        docs = docs.filter((d) => allowed.has(String((d.data() as any)?.affiliateId)));
      }

      const wantStatus = typeof req.query.status === 'string' ? req.query.status : null;
      // UMA linha por afiliado×acordo (o estado atual): a duplicata que o POST
      // antigo deixou criar (não conhecia `priced`) virava duas entradas na tela
      // do afiliado e duas filas p/ o gerente. O dedupe roda ANTES do filtro de
      // status — depois dele, um `?status=requested` ressuscitaria justamente a
      // duplicata superada que a lista completa esconde.
      const list = selectCurrentPartnerships(docs.map(partnershipFromDoc))
        .filter((p) => !wantStatus || p.status === wantStatus);

      // Carimba QUEM precifica cada parceria. A tela precisa disso para falar a
      // verdade ao afiliado ("aguardando seu gerente" × "em análise"): sem o
      // carimbo ela teria que adivinhar pela política do deal e erraria justamente
      // no afiliado sem gerente, que na prática espera a agência.
      const dealIds = [...new Set(list.map((p) => String(p.dealId)).filter(Boolean))];
      const deals = new Map<string, any>();
      await Promise.all(dealIds.map(async (id) => {
        const d = await adminDb!.collection('deals').doc(id).get();
        if (d.exists) deals.set(id, dealFromDoc(d));
      }));
      // A árvore é lida UMA vez para a lista inteira, e só quando algum deal é do
      // tipo gerenciado. Resolver parceria a parceria releria duas coleções por
      // linha, o que numa fila de 50 seriam 100 leituras para a mesma resposta.
      const needsTree = list.some((p) => dealPolicy(deals.get(String(p.dealId))).pricedBy === 'upline');
      const tree = needsTree
        ? await Promise.all([readUplineMap(), readSpecialsMap()]).then(([uplines, specials]) => ({ uplines, specials }))
        : null;
      const partnerships = list.map((p) => {
        const policy = dealPolicy(deals.get(String(p.dealId)));
        const upId = tree ? resolveDirectUpline(String(p.affiliateId), tree) : null;
        const eligible = !!upId && resolveIsSpecial(tree!.specials[upId]);
        return { ...p, pricedBy: effectivePricedBy(policy, eligible) };
      });
      return res.json({ partnerships });
    } catch (e: any) {
      console.error('[partnerships] erro ao listar:', e);
      return res.status(500).json({ error: 'Erro ao listar parcerias' });
    }
  });

  // Solicita uma parceria. O afiliado só pede p/ si (affiliateId do token); admin pode
  // pedir por outro (body.affiliateId). Idempotente por (afiliado × deal) enquanto a
  // parceria estiver VIVA (isActivePartnership: solicitada/precificada/aprovada) —
  // recusada/encerrada libera novo pedido. `priced` TEM que contar como viva: sem ela
  // o pedido repetido criava um doc novo e o afiliado via a mesma casa duas vezes.
  app.post('/api/partnerships', requireAuth, requireMarketplace, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const user = (req as any).user;
      const isAdmin = user?.role === 'admin';
      const affiliateId = isAdmin && req.body?.affiliateId ? String(req.body.affiliateId) : (user?.affiliateId ? String(user.affiliateId) : '');
      if (!affiliateId) return res.status(403).json({ error: 'Sua conta não está vinculada a um afiliado.' });
      const dealId = String(req.body?.dealId ?? '').trim();
      if (!dealId) return res.status(400).json({ error: 'dealId é obrigatório.' });

      const dealSnap = await adminDb.collection('deals').doc(dealId).get();
      if (!dealSnap.exists) return res.status(404).json({ error: 'Acordo não encontrado.' });
      const deal = dealFromDoc(dealSnap);
      if (!deal.active) return res.status(409).json({ error: 'Este acordo não está mais disponível.' });
      // Casa PAUSADA barra ENTRADA nova (pedido do cliente, 16/08), sem tocar em
      // quem já está dentro: o afiliado aprovado antes da pausa continua com o link
      // e com o histórico. Espelha o filtro da vitrine no GET /api/deals.
      const houseActiveSnap = await adminDb.collection('houses').doc(String(deal.houseId)).get();
      if (houseActiveSnap.exists && (houseActiveSnap.data() as any)?.active === false) {
        return res.status(409).json({ error: 'Esta operadora está com a operação pausada. Tente novamente quando ela voltar.' });
      }

      // Idempotência: já existe parceria viva p/ este afiliado×deal? Reusa.
      const existing = await adminDb.collection('partnership_requests').where('affiliateId', '==', affiliateId).get();
      const alive = existing.docs.find((d) => {
        const x = d.data() as any;
        return String(x.dealId) === dealId && isActivePartnership((x.status ?? 'requested') as PartnershipStatus);
      });
      if (alive) return res.status(200).json(partnershipFromDoc(alive));

      const ref = adminDb.collection('partnership_requests').doc();
      await ref.set({
        affiliateId, dealId,
        status: 'requested',
        code: null,
        operatorName: deal.operatorName,
        dealLabel: buildDealLabel(deal),
        houseId: deal.houseId,
        requestedByUid: user?.uid ?? null,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await writeAuditLog(req, {
        entityType: 'partnership', entityId: ref.id, entityLabel: buildDealLabel(deal),
        action: 'partnership.request', metadata: { affiliateId, dealId },
      });
      return res.status(201).json(partnershipFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[partnerships] erro ao solicitar:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao solicitar parceria' });
    }
  });

  // Resolve QUEM precifica esta parceria. Num acordo `gerenciado` é o gerente do
  // afiliado, mas só quando existe um elegível: afiliado no topo da estrutura, ou
  // cujo upline deixou de ser especial ativo, cai na fila do admin — senão a
  // solicitação ficaria presa em `requested` sem ninguém para atender.
  const resolvePartnershipPricing = async (deal: { type?: any }, affiliateId: string) => {
    const policy = dealPolicy(deal as any);
    if (policy.pricedBy !== 'upline') return { policy, pricedBy: 'admin' as const, uplineId: null as string | null };
    const [uplines, specials] = await Promise.all([readUplineMap(), readSpecialsMap()]);
    const uplineId = resolveDirectUpline(affiliateId, { uplines, specials });
    const eligible = !!uplineId && resolveIsSpecial(specials[uplineId]);
    return {
      policy,
      pricedBy: effectivePricedBy(policy, eligible),
      uplineId: eligible ? uplineId : null,
    };
  };

  // Guarda COMUM das ações do gerente sobre uma parceria (precificar e recusar).
  // Fica num helper para as duas rotas não divergirem: a de recusa nasceria com uma
  // cópia da checagem de escopo, e cópia de barreira é como escopo vaza.
  // Devolve `{ fail }` (status + mensagem pt-BR) OU o contexto já resolvido.
  const loadPartnershipForUpline = async (req: express.Request, id: string) => {
    const user = (req as any).user;
    const isAdmin = user?.role === 'admin';
    const callerAffiliateId = user?.affiliateId ? String(user.affiliateId) : '';
    if (!isAdmin && !callerAffiliateId) {
      return { fail: { status: 403, error: 'Sua conta não está vinculada a um afiliado.' } };
    }
    const ref = adminDb!.collection('partnership_requests').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return { fail: { status: 404, error: 'Parceria não encontrada.' } };
    const cur = snap.data() as any;
    const affiliateId = String(cur.affiliateId);

    const dealSnap = await adminDb!.collection('deals').doc(String(cur.dealId)).get();
    if (!dealSnap.exists) return { fail: { status: 404, error: 'Acordo da parceria não existe mais.' } };
    const deal = dealFromDoc(dealSnap);
    // Só o TIPO importa para saber se o gerente manda nesta parceria; QUEM pode
    // gravar é a checagem de identidade logo abaixo, sem reler a árvore 2×.
    if (dealPolicy(deal).pricedBy !== 'upline') {
      return { fail: { status: 400, error: 'A comissão deste acordo é definida pela agência, não pelo gerente.' } };
    }
    if (!isAdmin) {
      const special = await resolveSpecialRecord(callerAffiliateId, { withSubs: false });
      if (!resolveIsSpecial(special)) {
        return { fail: { status: 403, error: 'Você não é um afiliado especial ativo.' } };
      }
      const [uplines, specials] = await Promise.all([readUplineMap(), readSpecialsMap()]);
      if (!isDirectDownline(affiliateId, callerAffiliateId, { uplines, specials })) {
        return {
          fail: {
            status: 403,
            error: 'Este afiliado não é seu indicado direto: a comissão dele é definida por quem está acima dele na rede.',
          },
        };
      }
    }
    return {
      ctx: {
        ref, cur, deal, affiliateId, isAdmin, callerAffiliateId,
        from: (cur.status ?? 'requested') as PartnershipStatus,
      },
    };
  };

  // Avisa o afiliado quando a parceria dele é RECUSADA (pedido do cliente, 16/08).
  // Sem isso ele fica esperando um link que não vem, sem sinal nenhum na tela.
  // Best-effort: nunca derruba a decisão que acabou de ser gravada.
  const notifyPartnershipRejected = async (affiliateId: string, operatorName: string) => {
    if (!adminDb || !affiliateId) return;
    try {
      const usersSnap = await adminDb.collection('users').where('affiliateId', '==', affiliateId).get();
      if (usersSnap.empty) return;
      const batch = adminDb.batch();
      usersSnap.forEach((u) => {
        batch.set(adminDb!.collection('user_notifications').doc(), {
          recipientUid: u.id,
          affiliateId,
          type: 'partnership_rejected',
          title: 'Solicitação de parceria recusada',
          body: `Sua solicitação para ${operatorName || 'a operadora'} não foi aprovada. Fale com seu gerente para entender os próximos passos.`,
          readAt: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (e) {
      console.error('[partnerships] falha ao notificar a recusa:', e);
    }
  };

  // O GERENTE define a comissão do afiliado dele nesta casa (acordo `gerenciado`).
  // É o pedido da call de 15/08: "na Esportiva é 110 que ele tem, ele vai colocar
  // 100, ele vai pegar 10 reais" — o spread é a receita do gerente, e tirar isso do
  // suporte é metade do valor da feature.
  //
  // Reusa as guardas que já estavam no ar, em vez de reinventar escopo:
  //  - resolveIsSpecial: definição ÚNICA de especial ativo.
  //  - isDirectDownline: VISÃO ≠ DINHEIRO. Ele enxerga a subárvore inteira mas só
  //    precifica o filho DIRETO; mexer na taxa de um neto mudaria o spread do
  //    gerente do meio pelas costas dele.
  //  - resolveRepasseCap POR CASA: aqui o gesto é por casa, então o teto tem que
  //    olhar o byBrand do gerente (no /api/special/sub-config, que grava a taxa de
  //    TOPO, o teto de topo continua sendo o certo).
  // O admin também pode chamar: é a saída para gerente que sumiu, senão a
  // solicitação fica travada esperando alguém que não vem.
  app.post('/api/partnerships/:id/price', requireAuth, requireMarketplace, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const id = String(req.params.id || '').trim();
      const loaded = await loadPartnershipForUpline(req, id);
      if (loaded.fail) return res.status(loaded.fail.status).json({ error: loaded.fail.error });
      const { ref, cur, deal, affiliateId, isAdmin, callerAffiliateId, from } = loaded.ctx!;
      const user = (req as any).user;

      if (deal.active === false) {
        return res.status(409).json({ error: 'Este acordo está pausado. Fale com a agência antes de definir a comissão.' });
      }
      // Reprecificar uma parceria APROVADA é permitido (pedido do cliente, 16/08) e
      // não a manda de volta para "aguardando link": o link já existe e segue
      // valendo, muda só a taxa, a partir de amanhã. Ver nextStatusAfterPricing.
      const nextStatus = nextStatusAfterPricing(from);
      if (!nextStatus) {
        return res.status(409).json({ error: `Não dá para definir a comissão de uma parceria ${PARTNERSHIP_STATUS_LABEL[from]?.toLowerCase() ?? from}.` });
      }

      const cpa = Number(req.body?.cpaValue) || 0;
      const rev = Number(req.body?.revPercentage) || 0;
      if (cpa < 0 || rev < 0) return res.status(400).json({ error: 'Valores não podem ser negativos.' });

      // Chave do byBrand pela CASA do deal (brandId OTG ou slug manual), a mesma que
      // a aprovação usa — senão a taxa não casaria com a agregação por casa.
      const houseSnap = await adminDb.collection('houses').doc(String(deal.houseId)).get();
      const house = houseSnap.exists
        ? houseFromDoc(houseSnap)
        : { id: String(deal.houseId), slug: String(deal.houseId), brandId: null } as any;
      const brandKey = dealBrandKey(house);

      if (!isAdmin) {
        const ownCfgSnap = await adminDb.collection('affiliate_configs').doc(callerAffiliateId).get();
        const ownCfg = ownCfgSnap.exists ? (ownCfgSnap.data() as any) : {};
        // Ausência ≠ R$ 0: sem taxa PRÓPRIA nesta casa ele não tem o que repassar, e
        // um teto zerado daria a mensagem errada ("o teto é R$ 0") para um problema
        // que é da agência resolver.
        if (!hasConfiguredRate(ownCfg, brandKey)) {
          return res.status(400).json({
            error: 'Você ainda não tem taxa nesta casa. Peça à agência antes de definir a comissão do seu afiliado.',
          });
        }
        const cap = resolveRepasseCap(ownCfg, brandKey);
        if (exceedsRepasseCap({ cpaValue: cpa, revPercentage: rev }, cap)) {
          return res.status(400).json({
            error: `A comissão do afiliado não pode passar da sua taxa nesta casa (teto: R$ ${cap.cpaValue}/CPA e ${cap.revPercentage}% REV).`,
          });
        }
      }

      // Grava no byBrand[brandKey] (merge, preservando as outras casas) — o gesto é
      // POR CASA. Auditoria de dinheiro no MESMO batch, autor carimbado pelo token.
      // COM VIGÊNCIA: a taxa nova vale de amanhã, o que já foi gerado fica na antiga.
      const cfgRef = adminDb.collection('affiliate_configs').doc(affiliateId);
      const cfgBefore = await cfgRef.get();
      const cfgData = cfgBefore.exists ? (cfgBefore.data() as any) : undefined;
      const curByBrand = cfgData?.byBrand || {};
      const brandEntry = withRateHistory(currentRateEntry(cfgData, brandKey), { cpaValue: cpa, revPercentage: rev });
      const nextByBrand = { ...curByBrand, [brandKey]: brandEntry };
      const cfgChanges = diffChanges(cfgData, { byBrand: nextByBrand }, ['byBrand']);

      const batch = adminDb.batch();
      batch.set(cfgRef, {
        affiliateId,
        byBrand: { [brandKey]: brandEntry },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(ref, {
        status: nextStatus,
        pricedByUid: user?.uid ?? null,
        pricedByAffiliateId: isAdmin ? null : callerAffiliateId,
        pricedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (cfgChanges.length) {
        appendAuditLog(batch, req, {
          entityType: 'affiliate_config', entityId: affiliateId,
          entityLabel: await affiliateNameOf(affiliateId),
          action: 'config.update', changes: cfgChanges,
          metadata: { via: 'partnership/price', brandKey, dealId: cur.dealId },
        });
      }
      appendAuditLog(batch, req, {
        entityType: 'partnership', entityId: id, entityLabel: buildDealLabel(deal),
        action: 'partnership.price',
        metadata: { affiliateId, dealId: cur.dealId, brandKey, cpaValue: cpa, revPercentage: rev, byAdmin: isAdmin },
      });
      await batch.commit();
      return res.json(partnershipFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[partnerships] erro ao precificar:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao definir a comissão' });
    }
  });

  // O GERENTE recusa a solicitação do filho direto (pedido do cliente, 16/08). Sem
  // isso ele só teria o botão de aceitar, e uma solicitação que ele não quer atender
  // ficaria pendurada na fila dele para sempre. Mesma guarda da precificação.
  // Recusar vale com o acordo PAUSADO: dizer não nunca deve ficar bloqueado.
  app.post('/api/partnerships/:id/reject', requireAuth, requireMarketplace, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const id = String(req.params.id || '').trim();
      const loaded = await loadPartnershipForUpline(req, id);
      if (loaded.fail) return res.status(loaded.fail.status).json({ error: loaded.fail.error });
      const { ref, cur, deal, affiliateId, isAdmin, callerAffiliateId, from } = loaded.ctx!;

      if (!canTransition(from, 'rejected', 'upline')) {
        return res.status(409).json({ error: `Transição inválida (${from} → rejected).` });
      }

      const batch = adminDb.batch();
      batch.set(ref, {
        status: 'rejected',
        decidedByUid: (req as any).user?.uid ?? null,
        decidedByAffiliateId: isAdmin ? null : callerAffiliateId,
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      // Recusa não mexe na taxa: se o gerente já tinha precificado e mudou de ideia,
      // o que ele gravou no byBrand fica (a comissão histórica não se estorna).
      appendAuditLog(batch, req, {
        entityType: 'partnership', entityId: id, entityLabel: buildDealLabel(deal),
        action: 'partnership.reject',
        metadata: { affiliateId, dealId: cur.dealId, byAdmin: isAdmin, via: 'upline' },
      });
      await batch.commit();
      await notifyPartnershipRejected(affiliateId, deal.operatorName);
      return res.json(partnershipFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[partnerships] erro ao recusar:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao recusar a parceria' });
    }
  });

  // Decide uma parceria (admin): approve | reject | discontinue. canTransition barra
  // pulos inválidos. Na APROVAÇÃO: aplica a taxa do deal no byBrand do afiliado (mesmo
  // batch auditado do config.update) e emite o affiliate_links (código do /go).
  app.patch('/api/partnerships/:id', requireAdmin, requireMarketplace, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const id = String(req.params.id || '').trim();
      const ref = adminDb.collection('partnership_requests').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Parceria não encontrada.' });
      const cur = snap.data() as any;
      const from = (cur.status ?? 'requested') as PartnershipStatus;
      const to = String(req.body?.status ?? '') as PartnershipStatus;
      if (!['approved', 'rejected', 'discontinued'].includes(to)) {
        return res.status(400).json({ error: 'status deve ser approved, rejected ou discontinued.' });
      }

      const affiliateId = String(cur.affiliateId);
      const dealSnap = await adminDb.collection('deals').doc(String(cur.dealId)).get();
      if (!dealSnap.exists) return res.status(404).json({ error: 'Acordo da parceria não existe mais.' });
      const deal = dealFromDoc(dealSnap);

      // Num acordo gerenciado com gerente elegível, `requested → approved` é BARRADO:
      // o caminho passa por `priced`, senão o admin aprovaria antes do gerente
      // definir a comissão (e, pior, gravaria a taxa do deal — ver abaixo).
      const { pricedBy } = await resolvePartnershipPricing(deal, affiliateId);
      if (!canTransition(from, to, pricedBy)) {
        return res.status(409).json({
          error: from === 'requested' && to === 'approved' && pricedBy === 'upline'
            ? 'O gerente deste afiliado ainda não definiu a comissão dele.'
            : `Transição inválida (${from} → ${to}).`,
        });
      }

      if (to === 'approved') {
        // A taxa do DEAL só é aplicada quando a aprovação vem direto de `requested`
        // (acordo direto, ou gerenciado sem gerente elegível: sem intermediário, o
        // afiliado recebe os termos da oferta). Vindo de `priced`, a taxa JÁ foi
        // gravada pelo gerente e reescrevê-la aqui trocaria os R$ 100 dele pelos
        // R$ 110 do deal, apagando o spread sem erro na tela. Aqui só sai o link.
        const applyDealRates = from === 'requested';
        // Resolve a chave do byBrand pela CASA do deal (brandId OTG ou slug manual).
        const houseSnap = await adminDb.collection('houses').doc(String(deal.houseId)).get();
        const house = houseSnap.exists ? houseFromDoc(houseSnap) : { id: String(deal.houseId), slug: String(deal.houseId), brandId: null, registerUrlTemplate: null } as any;
        const brandKey = dealBrandKey(house);
        // CONVERSÃO NA APROVAÇÃO (decisão 17/08): o acordo pode estar em dólar ou
        // euro, mas o `byBrand` — e todo o núcleo de comissão — é em R$. Converter
        // aqui CONGELA o que o afiliado ganha: a partir daqui o câmbio mexe na
        // receita da casa, não no repasse já concedido. Só busca cotação quando o
        // acordo de fato depende dela.
        const dealFx = dealFxSpec(deal);
        const needsQuote = dealFx.currency !== 'BRL' && dealFx.fxMode === 'live';
        // UMA cotação por aprovação: buscar de novo para a auditoria poderia
        // registrar um número diferente do que foi gravado no byBrand.
        const dealQuotes = needsQuote ? await fetchFxQuotesForServer() : undefined;
        const usedFxRate = resolveFxRate(dealFx, dealQuotes);
        const rates = dealToBrandRates(deal, dealQuotes);
        // Sem cotação não se grava dinheiro. `null` só acontece em acordo de cotação
        // FIXA sem valor (o validador de escrita já barra); falhar aqui é melhor que
        // conceder uma taxa inventada e descobrir no extrato.
        if (applyDealRates && !rates) {
          return res.status(400).json({
            error: 'O acordo está em moeda estrangeira sem cotação definida. Ajuste o acordo antes de aprovar.',
          });
        }

        // Aplica a taxa no affiliate_configs.byBrand[brandKey] preservando as outras
        // casas (merge do mapa) — MESMO caminho auditado do PATCH de config.
        const cfgRef = adminDb.collection('affiliate_configs').doc(affiliateId);
        const cfgBefore = applyDealRates ? await cfgRef.get() : null;
        const cfgData = cfgBefore?.exists ? (cfgBefore.data() as any) : undefined;
        const curByBrand = cfgData?.byBrand || {};
        // Mesma vigência das outras portas: conceder a taxa do deal não reprecifica
        // o que o afiliado já tenha gerado nesta casa (parceria reaberta depois de
        // encerrada, por exemplo).
        const brandEntry = withRateHistory(currentRateEntry(cfgData, brandKey), rates ?? { cpaValue: 0, revPercentage: 0 });
        const nextByBrand = { ...curByBrand, [brandKey]: brandEntry };
        const cfgChanges = applyDealRates ? diffChanges(cfgData, { byBrand: nextByBrand }, ['byBrand']) : [];

        // Emite (idempotente por afiliado×brandKey) o link de divulgação p/ o /go.
        //
        // A TAG é obrigatória aqui, e é o que esta rota errava: gravar o
        // `registerUrlTemplate` CRU deixa o `{tag}` literal na URL, então toda
        // visita chega na casa sob a mesma tag e o resultado dos afiliados vira
        // um balde só. `buildTaggedUrl` é a mesma porta do /affiliate-links/generate
        // — a diferença entre as duas era exatamente o bug.
        let code: string | null = cur.code ?? null;
        let linkSnap: admin.firestore.DocumentSnapshot | null = null;
        if (code) {
          linkSnap = await adminDb.collection('affiliate_links').doc(code).get();
        } else {
          const existingLink = await adminDb.collection('affiliate_links')
            .where('affiliateId', '==', affiliateId).where('brandId', '==', brandKey).limit(1).get();
          if (!existingLink.empty) {
            linkSnap = existingLink.docs[0];
            code = existingLink.docs[0].id;
          } else {
            code = crypto.randomBytes(6).toString('base64url');
          }
        }

        const template = String((house as any).registerUrlTemplate ?? '').trim();
        // Reaproveita a tag que o link já tem: o `code` é estável e pode já estar
        // circulando, então trocar a tag agora tiraria do afiliado o que ele já
        // trouxe. Placeholder gravado por engano NÃO conta como tag existente.
        const storedTag = normalizeTag((linkSnap?.data() as any)?.tag);
        let tag = storedTag && !hasUnresolvedPlaceholder(storedTag) ? storedTag : '';
        if (!tag && template) {
          tag = suggestTag(
            { name: await affiliateNameOf(affiliateId), affiliateId },
            (await loadTagOwners()).keys(),
          );
        }
        // Sem template não há link (casa OTG, ou casa cujo cadastro ainda não foi
        // configurado): o doc nasce inativo e o afiliado vê "link indisponível".
        const registerUrl = template ? buildTaggedUrl(template, tag) : '';

        const batch = adminDb.batch();
        if (applyDealRates) {
          batch.set(cfgRef, { byBrand: { [brandKey]: brandEntry }, affiliateId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
        batch.set(adminDb.collection('affiliate_links').doc(code), {
          code, affiliateId, brandId: brandKey,
          registerUrl: registerUrl || null,
          // A tag fica no doc além de na URL: é ela que o `buildTagIndex` lê para
          // casar o relatório da casa de volta com o afiliado.
          ...(tag ? { tag } : {}),
          dealId: String(cur.dealId),
          active: !!registerUrl,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        batch.set(ref, { status: 'approved', code, decidedByUid: (req as any).user?.uid ?? null, decidedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        // Auditoria: a mudança de taxa (config.update — honra a invariante de dinheiro)
        // E a decisão da parceria.
        if (cfgChanges.length) {
          appendAuditLog(batch, req, { entityType: 'affiliate_config', entityId: affiliateId, entityLabel: await affiliateNameOf(affiliateId), action: 'config.update', changes: cfgChanges });
        }
        appendAuditLog(batch, req, { entityType: 'partnership', entityId: id, entityLabel: buildDealLabel(deal), action: 'partnership.approve', metadata: { affiliateId, dealId: cur.dealId, brandKey, ratesFrom: applyDealRates ? 'deal' : 'gerente', ...(applyDealRates && rates ? { cpaValue: rates.cpaValue, revPercentage: rates.revPercentage, currency: dealFx.currency, ...(dealFx.currency !== 'BRL' ? { fxMode: dealFx.fxMode, fxRate: usedFxRate } : {}) } : {}), linkIssued: !!registerUrl, ...(tag ? { tag } : {}) } });
        await batch.commit();
        return res.json(partnershipFromDoc(await ref.get()));
      }

      // reject | discontinue: muda status e desativa o link (se houver). Não mexe na
      // taxa já aplicada (encerrar não estorna comissão histórica).
      const batch = adminDb.batch();
      batch.set(ref, { status: to, decidedByUid: (req as any).user?.uid ?? null, decidedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      if (cur.code) batch.set(adminDb.collection('affiliate_links').doc(String(cur.code)), { active: false }, { merge: true });
      appendAuditLog(batch, req, { entityType: 'partnership', entityId: id, entityLabel: buildDealLabel(deal), action: `partnership.${to === 'rejected' ? 'reject' : 'discontinue'}`, metadata: { affiliateId, dealId: cur.dealId } });
      await batch.commit();
      if (to === 'rejected') await notifyPartnershipRejected(affiliateId, deal.operatorName);
      return res.json(partnershipFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[partnerships] erro ao decidir:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao decidir parceria' });
    }
  });

  // === Jurídico versionado (Tier 1, modo SOFT) ===============================
  // Documentos (Acordo de Afiliação, Código de Conduta, Pagamentos) com versão
  // DERIVADA (computeNextVersion — nunca digitada) + registro de aceite carimbado
  // pelo servidor. NADA aqui bloqueia login/uso (modo soft até revisão jurídica do
  // conteúdo) — ver PLANO-INTEGRACAO-AFFILITY.md. Conteúdo NÃO é seedado
  // automaticamente: só existe o que o admin escrever.
  const legalDocFromDoc = (d: admin.firestore.DocumentSnapshot) => {
    const x = (d.data() as any) || {};
    return {
      id: d.id,
      slug: x.slug ?? d.id,
      title: x.title ?? '',
      content: x.content ?? '',
      version: Number.isFinite(Number(x.version)) ? Number(x.version) : 1,
      active: x.active !== false,
    };
  };

  // Lista documentos jurídicos. Requer login (qualquer papel — não-admin vê só os
  // ATIVOS; admin vê rascunhos/inativos também p/ revisar antes de publicar).
  // Conteúdo não é sensível; exigir login aqui é só p/ simplificar o middleware —
  // se no futuro precisar linkar de fora (ex.: rodapé do /register), isso vira um
  // endpoint público separado, não uma mudança neste.
  app.get('/api/legal-documents', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const snap = await adminDb.collection('legal_documents').get();
      const isAdmin = (req as any).user?.role === 'admin'; // pode ser undefined (rota pública) — ok
      const docs = snap.docs.map(legalDocFromDoc).filter((d) => isAdmin || d.active);
      return res.json({ documents: docs });
    } catch (e: any) {
      console.error('[legal-documents] erro ao listar:', e);
      return res.status(500).json({ error: 'Erro ao listar documentos' });
    }
  });

  // Cria um documento jurídico (admin). Versão inicial = 1 (computeNextVersion sem "before").
  app.post('/api/legal-documents', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const { doc, error } = normalizeLegalDocInput(req.body || {});
      if (error || !doc) return res.status(400).json({ error: error || 'Dados do documento inválidos.' });
      const ref = adminDb.collection('legal_documents').doc();
      const version = computeNextVersion(null, doc.content);
      await ref.set({ ...doc, version, updatedByUid: (req as any).user?.uid ?? null, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await writeAuditLog(req, { entityType: 'legal_document', entityId: ref.id, entityLabel: doc.title, action: 'legal_document.create', metadata: { slug: doc.slug, version } });
      return res.status(201).json(legalDocFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[legal-documents] erro ao criar:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao criar documento' });
    }
  });

  // Atualiza um documento (admin). A versão é RECALCULADA aqui (nunca aceita do
  // body) — se o conteúdo mudou, bumpa e os aceites antigos ficam obsoletos
  // (hasAcceptedLatest compara a versão exata).
  app.patch('/api/legal-documents/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const id = String(req.params.id || '').trim();
      const ref = adminDb.collection('legal_documents').doc(id);
      const before = await ref.get();
      if (!before.exists) return res.status(404).json({ error: 'Documento não encontrado.' });
      const beforeData = before.data() as any;
      const merged = { ...beforeData, ...(req.body || {}) };
      const { doc, error } = normalizeLegalDocInput(merged);
      if (error || !doc) return res.status(400).json({ error: error || 'Dados do documento inválidos.' });

      const version = computeNextVersion({ content: beforeData?.content, version: beforeData?.version }, doc.content);
      const patch = { ...doc, version, updatedByUid: (req as any).user?.uid ?? null, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      const changes = diffChanges(beforeData, patch, ['title', 'content', 'active', 'version']);
      await ref.set(patch, { merge: true });
      if (changes.length) {
        await writeAuditLog(req, { entityType: 'legal_document', entityId: id, entityLabel: doc.title, action: 'legal_document.update', changes, metadata: { versionBumped: version !== (beforeData?.version ?? 1) } });
      }
      return res.json(legalDocFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[legal-documents] erro ao atualizar:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao atualizar documento' });
    }
  });

  // Remove um documento (admin). Aceites antigos ficam órfãos mas inofensivos (só
  // guardam slug/versão — não referenciam o doc por id).
  app.delete('/api/legal-documents/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const ref = adminDb.collection('legal_documents').doc(String(req.params.id));
      const snap = await ref.get();
      await ref.delete();
      await writeAuditLog(req, { entityType: 'legal_document', entityId: String(req.params.id), entityLabel: (snap.data() as any)?.title ?? null, action: 'legal_document.delete' });
      return res.json({ ok: true });
    } catch (e) {
      console.error('[legal-documents] erro ao remover:', e);
      return res.status(500).json({ error: 'Erro ao remover documento' });
    }
  });

  // Aceites do usuário logado (server-only — o cliente nunca lê/escreve a coleção
  // direto; rules bloqueiam mesmo admin). GET devolve os do PRÓPRIO uid.
  app.get('/api/legal-acceptances', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const uid = (req as any).user?.uid;
      const snap = await adminDb.collection('legal_acceptances').where('uid', '==', uid).get();
      const acceptances = snap.docs.map((d) => d.data());
      return res.json({ acceptances });
    } catch (e: any) {
      console.error('[legal-acceptances] erro ao listar:', e);
      return res.status(500).json({ error: 'Erro ao listar aceites' });
    }
  });

  // Registra o aceite do usuário logado para o documento ATIVO de um slug. uid e
  // acceptedAt são carimbados pelo servidor a partir do token — o cliente não pode
  // forjar aceite de outra pessoa nem a data. Idempotente por (uid, slug): reaceitar
  // a MESMA versão é no-op-ish (sobrescreve com o mesmo valor); versão nova = novo aceite.
  app.post('/api/legal-acceptances', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const uid = (req as any).user?.uid;
      const slug = String(req.body?.slug ?? '').trim();
      if (!slug) return res.status(400).json({ error: 'slug é obrigatório.' });
      const docSnap = await adminDb.collection('legal_documents').where('slug', '==', slug).where('active', '==', true).limit(1).get();
      if (docSnap.empty) return res.status(404).json({ error: 'Documento não encontrado ou inativo.' });
      const doc = legalDocFromDoc(docSnap.docs[0]);
      const id = `${uid}_${slug}`;
      await adminDb.collection('legal_acceptances').doc(id).set({
        uid, slug, version: doc.version, acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await writeAuditLog(req, { entityType: 'legal_document', entityId: doc.id, entityLabel: doc.title, action: 'legal_document.accept', metadata: { slug, version: doc.version, uid } });
      return res.status(201).json({ uid, slug, version: doc.version });
    } catch (e: any) {
      console.error('[legal-acceptances] erro ao registrar aceite:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao registrar aceite' });
    }
  });

  // === Carteira + Saque (Tier 1, sem gateway) ================================
  // O afiliado SOLICITA um saque (valor que ele mesmo informa, vendo os dashboards
  // já existentes); o admin APROVA/REJEITA e depois marca PAGO quando transferir
  // manualmente fora do sistema (não há integração PIX no repo). O servidor NÃO
  // recalcula/valida o "saldo apurado" de forma independente nesta entrega — isso
  // ficaria pra uma v2 com ledger; o admin decide olhando os números que já vê no
  // /admin ou na ficha do afiliado antes de aprovar. Auditado (withdrawal.*).
  const withdrawalFromDoc = (d: admin.firestore.DocumentSnapshot) => {
    const x = (d.data() as any) || {};
    return {
      id: d.id,
      affiliateId: x.affiliateId ?? null,
      amount: Number.isFinite(Number(x.amount)) ? Number(x.amount) : 0,
      status: (x.status ?? 'requested') as WithdrawalStatus,
      houseKey: x.houseKey ?? null,
      houseLabel: x.houseLabel ?? null,
      note: x.note ?? null,
      pixSnapshot: x.pixSnapshot ?? null,
      requestedAt: x.requestedAt ?? null,
      decidedAt: x.decidedAt ?? null,
    };
  };

  // Lista saques. Admin vê todos (filtro opcional ?affiliateId/?status); afiliado
  // vê só os dele (escopo forçado pelo token).
  app.get('/api/withdrawals', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const user = (req as any).user;
      let q: admin.firestore.Query = adminDb.collection('withdrawal_requests');
      if (user?.role !== 'admin') {
        if (!user?.affiliateId) return res.json({ withdrawals: [] });
        q = q.where('affiliateId', '==', String(user.affiliateId));
      } else if (typeof req.query.affiliateId === 'string' && req.query.affiliateId) {
        q = q.where('affiliateId', '==', req.query.affiliateId);
      }
      const snap = await q.get();
      const wantStatus = typeof req.query.status === 'string' ? req.query.status : null;
      const withdrawals = snap.docs.map(withdrawalFromDoc).filter((w) => !wantStatus || w.status === wantStatus);
      return res.json({ withdrawals });
    } catch (e: any) {
      console.error('[withdrawals] erro ao listar:', e);
      return res.status(500).json({ error: 'Erro ao listar saques' });
    }
  });

  // Solicita um saque. O afiliado só pede p/ si (affiliateId do token); admin pode
  // pedir por outro (body.affiliateId, ex.: registrar um saque combinado por fora).
  // Exige payment_profile com chave PIX cadastrada (senão pra onde pagar?).
  app.post('/api/withdrawals', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const user = (req as any).user;
      const isAdmin = user?.role === 'admin';
      const affiliateId = isAdmin && req.body?.affiliateId ? String(req.body.affiliateId) : (user?.affiliateId ? String(user.affiliateId) : '');
      if (!affiliateId) return res.status(403).json({ error: 'Sua conta não está vinculada a um afiliado.' });

      const amount = normalizeWithdrawalAmount(req.body?.amount);
      if (amount === null) return res.status(400).json({ error: 'Valor inválido (número positivo em R$).' });

      // Casa do saque (pedido da Infinity): o AFILIADO solicita os ganhos de UMA
      // casa por vez — sem casa, 400. Admin registrando um saque combinado por
      // fora pode omitir (docs antigos também não têm). O rótulo é snapshot de
      // exibição (a casa pode ser renomeada depois); a chave é o dado canônico.
      const houseKey = String(req.body?.houseKey ?? '').trim().slice(0, 120) || null;
      const houseLabel = String(req.body?.houseLabel ?? '').trim().slice(0, 120) || null;
      if (!isAdmin && !houseKey) {
        return res.status(400).json({ error: 'Informe a casa a que o saque se refere.' });
      }

      const profileSnap = await adminDb.collection('payment_profiles').doc(affiliateId).get();
      const profile = profileSnap.exists ? (profileSnap.data() as any) : null;
      if (!profile?.pixKey) {
        return res.status(400).json({ error: 'Cadastre sua chave PIX em Financeiro antes de solicitar um saque.' });
      }

      const ref = adminDb.collection('withdrawal_requests').doc();
      await ref.set({
        affiliateId, amount, status: 'requested',
        houseKey, houseLabel,
        note: req.body?.note ? String(req.body.note).slice(0, 500) : null,
        // Snapshot do PIX no momento da solicitação — a chave pode mudar depois; a
        // trilha tem que mostrar pra ONDE foi (ou seria) pago.
        pixSnapshot: { pixKeyType: profile.pixKeyType ?? null, pixKey: profile.pixKey ?? null, documentType: profile.documentType ?? null, document: profile.document ?? null, legalName: profile.legalName ?? null },
        requestedByUid: user?.uid ?? null,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await writeAuditLog(req, {
        entityType: 'withdrawal', entityId: ref.id, entityLabel: await affiliateNameOf(affiliateId),
        action: 'withdrawal.request', metadata: { affiliateId, amount, houseKey, houseLabel },
      });
      return res.status(201).json(withdrawalFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[withdrawals] erro ao solicitar:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao solicitar saque' });
    }
  });

  // Decide um saque (admin): approved | rejected | paid. canTransitionWithdrawal
  // barra pulos inválidos (ex.: requested→paid direto, ou mexer num terminal).
  app.patch('/api/withdrawals/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const id = String(req.params.id || '').trim();
      const ref = adminDb.collection('withdrawal_requests').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Solicitação não encontrada.' });
      const cur = snap.data() as any;
      const from = (cur.status ?? 'requested') as WithdrawalStatus;
      const to = String(req.body?.status ?? '') as WithdrawalStatus;
      if (!['approved', 'rejected', 'paid'].includes(to)) {
        return res.status(400).json({ error: 'status deve ser approved, rejected ou paid.' });
      }
      if (!canTransitionWithdrawal(from, to)) {
        return res.status(409).json({ error: `Transição inválida (${from} → ${to}).` });
      }
      const note = req.body?.note ? String(req.body.note).slice(0, 500) : (cur.note ?? null);
      await ref.set({ status: to, note, decidedByUid: (req as any).user?.uid ?? null, decidedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await writeAuditLog(req, {
        entityType: 'withdrawal', entityId: id, entityLabel: await affiliateNameOf(String(cur.affiliateId)),
        action: `withdrawal.${to}`, metadata: { affiliateId: cur.affiliateId, amount: cur.amount, houseKey: cur.houseKey ?? null, houseLabel: cur.houseLabel ?? null },
      });
      return res.json(withdrawalFromDoc(await ref.get()));
    } catch (e: any) {
      console.error('[withdrawals] erro ao decidir:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao decidir saque' });
    }
  });

  // === Resultados MANUAIS por casa (upload) =================================
  // Casas 'manual' recebem resultados via planilha. Cada doc = uma linha
  // (casa, data, afiliado|null=agregado) com as métricas no shape de `results`.
  // O merge com a OTG é feito no cliente (affiliateService) — aqui só persistimos.
  // `hrDocId` (id determinístico = reimport idempotente) e `sanitizeMetrics`
  // (coage as 6 métricas) vivem em src/lib/houseResultsDoc.ts (testados isolados).
  // Commit em lotes (< 500 ops por batch do Firestore).
  const commitChunked = async (ops: ((b: admin.firestore.WriteBatch) => void)[]) => {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = adminDb!.batch();
      ops.slice(i, i + 450).forEach((fn) => fn(batch));
      await batch.commit();
    }
  };

  // Lista linhas manuais no range. Admin → todas; afiliado → só as ATRIBUÍDAS a ele
  // (nunca o agregado/não-atribuído, que revelaria o total da casa).
  app.get('/api/house-results', requireAuth, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const user = (req as any).user;
      const start = req.query.start ? String(req.query.start) : null;
      const end = req.query.end ? String(req.query.end) : null;
      const houseSlug = req.query.houseSlug ? String(req.query.houseSlug) : null;
      // range de data é single-field (sem índice composto); demais filtros em código.
      let q: admin.firestore.Query = adminDb.collection('house_results');
      if (start) q = q.where('date', '>=', start);
      if (end) q = q.where('date', '<=', end);
      const snap = await q.get();
      let rows = snap.docs.map((d) => d.data() as any);
      if (houseSlug) rows = rows.filter((r) => r.houseSlug === houseSlug);
      if (user?.role !== 'admin') {
        // Escopo da sub-rede resolvido NO SERVIDOR (special_affiliates), MESMO padrão
        // do proxy externo (R4): o especial ATIVO vê o manual atribuído a own + subs;
        // o afiliado comum só ao próprio id. Sem isso a /network do especial
        // subcontava — não via o manual dos subs (o OTG já vem escopado à rede pelo
        // proxy). O agregado/não-atribuído (affiliateId null) nunca entra no escopo
        // permitido, então não vaza o total da casa. [[boost-houses-backoffice]]
        let special: any = null;
        if (user?.affiliateId) {
          try {
            special = await resolveSpecialRecord(String(user.affiliateId));
          } catch (e) {
            console.error('Erro ao carregar sub-rede do afiliado especial:', e);
          }
        }
        const decision = resolveScopedAffiliateIds({
          role: user?.role,
          endpoint: 'results',
          ownAffiliateId: user?.affiliateId,
          special,
        });
        if (decision.denied) return res.status(decision.denied.status).json({ error: decision.denied.error });
        const allowed = new Set(decision.scoped ?? []);
        rows = rows.filter((r) => allowed.has(String(r.affiliateId ?? '')));
      }
      rows = rows.map((r) => ({
        houseSlug: r.houseSlug,
        date: r.date,
        affiliateId: r.affiliateId ?? null,
        ...sanitizeMetrics(r),
      }));
      return res.json({ rows });
    } catch (e) {
      console.error('[house-results] erro ao listar:', e);
      return res.status(500).json({ error: 'Erro ao listar os resultados' });
    }
  });

  // Importa (admin): substitui as linhas da casa nas DATAS presentes no upload
  // (apaga as antigas daquelas datas e grava as novas) — reenviar um dia sobrescreve.
  app.post('/api/house-results/import', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const { houseSlug, rows } = req.body || {};
      const slug = String(houseSlug ?? '').trim();
      if (!slug) return res.status(400).json({ error: 'houseSlug é obrigatório.' });
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Nenhuma linha para importar.' });

      const houseSnap = await adminDb.collection('houses').doc(slug).get();
      if (!houseSnap.exists) return res.status(404).json({ error: 'Casa não encontrada.' });

      // Normaliza e valida as linhas.
      const dates = new Set<string>();
      const clean = rows.map((r: any) => {
        const date = String(r?.date ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Data inválida na linha: "${date}".`);
        dates.add(date);
        const affiliateId = r?.affiliateId != null && String(r.affiliateId).trim() ? String(r.affiliateId).trim() : null;
        return { houseSlug: slug, date, affiliateId, ...sanitizeMetrics(r) };
      });

      // Apaga as linhas existentes da casa nas datas do upload (single-field por
      // houseSlug, sem índice composto; filtra a data em código).
      const existing = await adminDb.collection('house_results').where('houseSlug', '==', slug).get();
      const toDelete = existing.docs.filter((d) => dates.has((d.data() as any)?.date));

      const uid = (req as any).user?.uid ?? null;
      const importedAt = admin.firestore.FieldValue.serverTimestamp();
      const ops: ((b: admin.firestore.WriteBatch) => void)[] = [];
      toDelete.forEach((d) => ops.push((b) => b.delete(d.ref)));
      clean.forEach((row) => {
        const ref = adminDb!.collection('house_results').doc(hrDocId(row.houseSlug, row.date, row.affiliateId));
        ops.push((b) => b.set(ref, { ...row, importedByUid: uid, importedAt }));
      });

      // Agrega as métricas por afiliado ATRIBUÍDO (p/ a notificação celebratória —
      // 1 por afiliado, não 1 por linha/dia). sanitizeMetrics já coage p/ número.
      const houseName = (houseSnap.data() as any)?.name ?? slug;
      const byAff = new Map<string, ResultMetricsAgg>();
      for (const row of clean) {
        if (!row.affiliateId) continue;
        const a = byAff.get(row.affiliateId) ?? { registrations: 0, first_deposits: 0, qualified_cpa: 0, total_commission: 0 };
        a.registrations += Number(row.registrations) || 0;
        a.first_deposits += Number(row.first_deposits) || 0;
        a.qualified_cpa += Number(row.qualified_cpa) || 0;
        a.total_commission += Number(row.total_commission) || 0;
        byAff.set(row.affiliateId, a);
      }

      // Carimbo de frescor, igual ao do pull: a casa que só recebe planilha
      // também precisa dizer ao afiliado quando o dado foi atualizado.
      ops.push((b) => b.set(houseSnap.ref, {
        lastResultsSyncAt: importedAt,
        lastResultsSyncSource: 'upload',
        lastResultsDate: [...dates].sort().pop() ?? null,
      }, { merge: true }));

      // Auditoria do upload — atômica com a gravação dos resultados (mesmo batch).
      ops.push((b) => appendAuditLog(b, req, {
        entityType: 'house_results', entityId: slug, entityLabel: houseName, action: 'house_results.import',
        metadata: { dates: [...dates].sort(), imported: clean.length, deleted: toDelete.length, attributedAffiliates: byAff.size },
      }));

      await commitChunked(ops);

      // Notifica cada afiliado atribuído (best-effort — nunca derruba o import já gravado).
      let notified = 0;
      try {
        notified = await notifyAffiliatesOfResults(slug, houseName, byAff);
      } catch (e) {
        console.error('[house-results] falha ao notificar afiliados:', e);
      }

      return res.json({ ok: true, imported: clean.length, dates: [...dates].sort(), deleted: toDelete.length, notified });
    } catch (e: any) {
      console.error('[house-results] erro ao importar:', e);
      return res.status(500).json({ error: e?.message || 'Erro ao importar os resultados' });
    }
  });

  // Limpa as linhas de uma casa (admin); ?date= limpa só aquele dia.
  app.delete('/api/house-results', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const slug = String(req.query.houseSlug ?? '').trim();
      if (!slug) return res.status(400).json({ error: 'houseSlug é obrigatório.' });
      const date = req.query.date ? String(req.query.date) : null;
      const snap = await adminDb.collection('house_results').where('houseSlug', '==', slug).get();
      const docs = snap.docs.filter((d) => !date || (d.data() as any)?.date === date);
      const ops: ((b: admin.firestore.WriteBatch) => void)[] = docs.map((d) => (b) => { b.delete(d.ref); });
      ops.push((b) => appendAuditLog(b, req, {
        entityType: 'house_results', entityId: slug, action: 'house_results.clear',
        metadata: { date: date ?? 'todas', deleted: docs.length },
      }));
      await commitChunked(ops);
      return res.json({ ok: true, deleted: docs.length });
    } catch (e) {
      console.error('[house-results] erro ao limpar:', e);
      return res.status(500).json({ error: 'Erro ao limpar os resultados' });
    }
  });

  // === PULL automático do relatório da casa (Esportiva / TAP by Smartico) ====
  // Substitui o export manual pela API. Roda de hora em hora pelo Cloud Scheduler
  // (header x-cron-secret) e também no clique do admin em /casas. Contrato,
  // reconciliação e armadilhas: MIGRACAO-INFINITY-LEGADO.md §9.5.
  //
  // B7: a configuração do conector vem de `integrations/{id}` (tela /integracoes)
  // com o env como FALLBACK — resolveConnectorSettings é a fonte única. Antes era
  // `process.env.ESPORTIVA_*` direto, e ligar/desligar ou trocar a chave exigia
  // redeploy. Sem chave em lugar nenhum (ou desligado na tela) a rota responde
  // 503 — mesmo desenho do cron de ranking.
  const loadIntegrationDoc = async (id: string): Promise<IntegrationDoc | null> => {
    if (!adminDb) return null;
    try {
      const snap = await adminDb.collection('integrations').doc(id).get();
      return snap.exists ? integrationFromDoc(id, snap.data()) : null;
    } catch (e) {
      // Falha de leitura NÃO pode derrubar o pull: cai no env (comportamento antigo).
      console.error(`[integrations] falha ao ler ${id}:`, e);
      return null;
    }
  };

  const connectorSettings = async (id: string): Promise<ConnectorSettings | null> => {
    const spec = findIntegrationSpec(id);
    if (!spec) return null;
    return resolveConnectorSettings(spec, await loadIntegrationDoc(id), process.env);
  };

  // Cron OU admin: o Scheduler não tem token de usuário, e o admin não tem o
  // secret. Presença do header decide qual porta é usada — nunca as duas juntas.
  const allowCronOrAdmin: express.RequestHandler = (req, res, next) =>
    req.headers['x-cron-secret'] ? requireCronSecret(req, res, next) : requireAdmin(req, res, next);

  // A API tem rate limit agressivo ("Too many requests from the same account").
  // Uma janela por rodada + até 3 tentativas espaçadas cobre a rodada horária sem
  // martelar a casa.
  const fetchEsportivaReport = async (url: string, key: string): Promise<any> => {
    let last: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetchImpl(url, { headers: { authorization: key, accept: 'application/json' } });
      const text = await response.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { body = null; }
      if (body && Array.isArray(body.data)) return body;
      last = body ?? text.slice(0, 200);
      const rateLimited = typeof last === 'object' && /too many requests/i.test(String(last?.message ?? ''));
      if (!rateLimited) break; // erro de permissão/chave não melhora com espera
      if (attempt < 3) await new Promise((r) => setTimeout(r, 15000 * attempt));
    }
    throw new Error(
      typeof last === 'object' && last?.message ? String(last.message) : 'Resposta inesperada da API da casa.',
    );
  };

  const esportivaPullHandler: express.RequestHandler = async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    const settings = await connectorSettings('esportiva-tap');
    if (!settings?.enabled) {
      return res.status(503).json({ error: 'Integração desligada em Integrações.' });
    }
    const key = settings.apiKey;
    if (!key) return res.status(503).json({ error: 'Pull não configurado (informe a chave em Integrações).' });

    const slug = settings.houseSlug;
    // O botão de /casas manda a casa CLICADA — o conector serve uma casa só por
    // instância, então pedir outra é erro do chamador e responde 400 (antes o
    // slug era ignorado e qualquer clique puxava a Esportiva).
    const requestedSlug = String(req.body?.houseSlug ?? '').trim();
    if (requestedSlug && requestedSlug !== slug) {
      return res.status(400).json({ error: `A casa "${requestedSlug}" não tem integração direta de resultados.` });
    }
    try {
      const houseSnap = await adminDb.collection('houses').doc(slug).get();
      if (!houseSnap.exists) return res.status(404).json({ error: `Casa "${slug}" não encontrada.` });
      const houseName = (houseSnap.data() as any)?.name ?? slug;

      const days = Number(req.body?.days);
      // 7 dias de reprocessamento (era 2): CPA qualificado é creditado com DIAS de
      // atraso e a API o atribui à data do EVENTO original — com 2 dias, crédito
      // retroativo além de ontem nunca entrava (causa real da divergência que o
      // painel antigo acusou em julho/2026). Reescrever a janela é idempotente,
      // então o custo de 7 é só a leitura.
      const { dateFrom, dateTo } = pullWindow(resolveServerToday(), Number.isFinite(days) && days > 0 ? days : 7);
      // `dateTo` acima é INCLUSIVO (hoje); a API trata `date_to` como EXCLUSIVO —
      // sem o +1 aqui, "hoje" nunca entrava na consulta. Ver toApiDateTo().
      const url = buildMediaReportUrl(dateFrom, toApiDateTo(dateTo), settings.config.apiBase || ESPORTIVA_API_BASE);
      const body = await fetchEsportivaReport(url, key);

      const { rows: pullRows, cpaRemainder, skipped } = adaptEsportivaRows(body.data, {
        cpaBase: numericSetting(settings.config, 'cpaBase', 120),
      });

      // Tag -> afiliado pelo MESMO índice do import manual (links + apelidos):
      // uma fonte só, senão a atribuição diverge entre o upload e o cron.
      const [linksSnap, aliasSnap] = await Promise.all([
        adminDb.collection('affiliate_links').get(),
        adminDb.collection('affiliate_tag_aliases').get(),
      ]);
      const tagIndex = buildTagIndex(
        linksSnap.docs.map((d) => d.data() as any),
        aliasSnap.docs.map((d) => ({ ...(d.data() as any), tag: (d.data() as any)?.tag ?? d.id })),
      );
      const payload = buildPullPayload(pullRows, tagIndex as any);

      if (payload.rows.length === 0) {
        // Janela vazia NÃO é falha: a casa fecha o dia com atraso (~1 dia), então
        // de madrugada a janela (ontem..hoje) costuma vir sem linha nenhuma — foi
        // o "cron sumido" de 08/08 (200 sem writes, auditoria muda). Carimba a
        // VERIFICAÇÃO e a flag do conector mesmo assim: sem isso o /casas sugere
        // robô quebrado e a flag `integration` nunca chega numa instância cujas
        // rodadas estão todas vazias. O frescor do DADO (lastResultsSyncAt) fica
        // intacto de propósito — ele mede dado, não checagem.
        await houseSnap.ref.set({
          lastResultsCheckAt: admin.firestore.FieldValue.serverTimestamp(),
          integration: 'esportiva-tap',
        }, { merge: true });
        return res.json({ ok: true, house: slug, dateFrom, dateTo, imported: 0, attributed: 0, pending: [], note: 'A casa não devolveu linhas nessa janela.' });
      }

      // Mesma semântica do upload: as datas da janela são REESCRITAS, então
      // reprocessar o dia (o que a rodada horária faz o tempo todo) nunca duplica.
      const dates = new Set(payload.dates);
      const existing = await adminDb.collection('house_results').where('houseSlug', '==', slug).get();
      const toDelete = existing.docs.filter((d) => dates.has((d.data() as any)?.date));

      const importedAt = admin.firestore.FieldValue.serverTimestamp();
      const ops: ((b: admin.firestore.WriteBatch) => void)[] = [];
      toDelete.forEach((d) => ops.push((b) => b.delete(d.ref)));
      payload.rows.forEach((row) => {
        const ref = adminDb!.collection('house_results').doc(hrDocId(slug, row.date, row.affiliateId));
        ops.push((b) => b.set(ref, {
          houseSlug: slug, date: row.date, affiliateId: row.affiliateId, ...sanitizeMetrics(row),
          importedByUid: (req as any).user?.uid ?? null, importedAt, source: 'api',
        }));
      });

      // Carimbo de frescor — é o que o afiliado lê no painel ("atualizado há X").
      ops.push((b) => b.set(houseSnap.ref, {
        lastResultsSyncAt: importedAt,
        lastResultsCheckAt: importedAt,
        lastResultsSyncSource: 'api',
        lastResultsDate: payload.dates[payload.dates.length - 1] ?? null,
        // A casa DECLARA seu conector: é a flag que liga o "Atualizar" em /casas
        // e roteia o pull por casa. Auto-carimbada aqui — instância que já roda o
        // cron ganha a flag na primeira rodada, sem migração de dados.
        integration: 'esportiva-tap',
      }, { merge: true }));

      // Auditoria: 1 por rodada. `pendingTags` é a fila da tela de vínculo e
      // `cpaRemainder` > 0 é o alarme de régua de CPA trocada (§9.5).
      ops.push((b) => appendAuditLog(b, req, {
        entityType: 'house_results', entityId: slug, entityLabel: houseName, action: 'house_results.pull',
        metadata: {
          dateFrom, dateTo, imported: payload.rows.length, deleted: toDelete.length,
          attributed: payload.attributed, pendingTags: payload.pending.map((p) => p.tag),
          cpaRemainder: Number(cpaRemainder.toFixed(2)), skipped,
          via: req.headers['x-cron-secret'] ? 'cron' : 'admin',
        },
      }));

      await commitChunked(ops);

      // NÃO notifica afiliado aqui de propósito: a rodada é HORÁRIA e o upload
      // manual já celebra resultado novo — notificar a cada hora viraria spam.
      return res.json({
        ok: true, house: slug, dateFrom, dateTo,
        imported: payload.rows.length, deleted: toDelete.length,
        attributed: payload.attributed, pending: payload.pending,
        cpaRemainder: Number(cpaRemainder.toFixed(2)), skipped,
      });
    } catch (e: any) {
      console.error('[esportiva-pull] falhou:', e);
      return res.status(502).json({ error: e?.message || 'Falha ao puxar o relatório da casa.' });
    }
  };
  // Rota do CRON (o Cloud Scheduler já aponta pra cá) — e retrocompat do admin.
  app.post('/api/internal/esportiva-pull', allowCronOrAdmin, esportivaPullHandler);

  // Pull da LEON Bet (R2D Partners) — mesma forma do pull da Esportiva acima,
  // mas mais simples: a API já devolve `cpa_qualified` como CONTAGEM (sem
  // régua/divisão) e o `end` do range é INCLUSIVO (sem o `+1` do toApiDateTo).
  // Atraso observado é T+1 (ver leonbetPull.ts) — a janela usa mais dias de
  // reprocessamento que a Esportiva por causa disso.
  const leonbetPullHandler: express.RequestHandler = async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    const settings = await connectorSettings('leonbet-r2d');
    if (!settings?.enabled) {
      return res.status(503).json({ error: 'Integração desligada em Integrações.' });
    }
    const token = settings.apiKey;
    if (!token) return res.status(503).json({ error: 'Pull não configurado (informe o token em Integrações).' });

    const slug = settings.houseSlug;
    const requestedSlug = String(req.body?.houseSlug ?? '').trim();
    if (requestedSlug && requestedSlug !== slug) {
      return res.status(400).json({ error: `A casa "${requestedSlug}" não tem integração direta de resultados.` });
    }
    try {
      const houseSnap = await adminDb.collection('houses').doc(slug).get();
      if (!houseSnap.exists) return res.status(404).json({ error: `Casa "${slug}" não encontrada.` });
      const houseName = (houseSnap.data() as any)?.name ?? slug;

      const days = Number(req.body?.days);
      // 5 dias de folga: o T+1 confirmado no recon exige mais reprocessamento
      // do que os 2 dias da Esportiva (que já cobrem a correção de D−1 dela).
      const { dateFrom, dateTo } = pullWindow(resolveServerToday(), Number.isFinite(days) && days > 0 ? days : 5);
      const merchant = numericSetting(settings.config, 'merchant', 1);
      const url = buildStatisticsUrl(dateFrom, dateTo, token, merchant, LEONBET_API_BASE);
      const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
      const text = await response.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { body = null; }
      if (!Array.isArray(body)) {
        const msg = body && typeof body === 'object' && body.status ? String(body.status) : 'Resposta inesperada da API da casa.';
        throw new Error(msg);
      }

      const { rows: pullRows, skipped } = adaptLeonBetRows(body);

      // Tag -> afiliado pelo MESMO índice do import manual (links + apelidos):
      // uma fonte só, senão a atribuição diverge entre o upload e o cron.
      const [linksSnap, aliasSnap] = await Promise.all([
        adminDb.collection('affiliate_links').get(),
        adminDb.collection('affiliate_tag_aliases').get(),
      ]);
      const tagIndex = buildTagIndex(
        linksSnap.docs.map((d) => d.data() as any),
        aliasSnap.docs.map((d) => ({ ...(d.data() as any), tag: (d.data() as any)?.tag ?? d.id })),
      );
      const payload = buildPullPayload(pullRows, tagIndex as any);

      if (payload.rows.length === 0) {
        await houseSnap.ref.set({
          lastResultsCheckAt: admin.firestore.FieldValue.serverTimestamp(),
          integration: 'leonbet-r2d',
        }, { merge: true });
        return res.json({ ok: true, house: slug, dateFrom, dateTo, imported: 0, attributed: 0, pending: [], note: 'A casa não devolveu linhas nessa janela.' });
      }

      // Mesma semântica do upload: as datas da janela são REESCRITAS, então
      // reprocessar o dia (o que a rodada faz o tempo todo) nunca duplica.
      const dates = new Set(payload.dates);
      const existing = await adminDb.collection('house_results').where('houseSlug', '==', slug).get();
      const toDelete = existing.docs.filter((d) => dates.has((d.data() as any)?.date));

      const importedAt = admin.firestore.FieldValue.serverTimestamp();
      const ops: ((b: admin.firestore.WriteBatch) => void)[] = [];
      toDelete.forEach((d) => ops.push((b) => b.delete(d.ref)));
      payload.rows.forEach((row) => {
        const ref = adminDb!.collection('house_results').doc(hrDocId(slug, row.date, row.affiliateId));
        ops.push((b) => b.set(ref, {
          houseSlug: slug, date: row.date, affiliateId: row.affiliateId, ...sanitizeMetrics(row),
          importedByUid: (req as any).user?.uid ?? null, importedAt, source: 'api',
        }));
      });

      ops.push((b) => b.set(houseSnap.ref, {
        lastResultsSyncAt: importedAt,
        lastResultsCheckAt: importedAt,
        lastResultsSyncSource: 'api',
        lastResultsDate: payload.dates[payload.dates.length - 1] ?? null,
        integration: 'leonbet-r2d',
      }, { merge: true }));

      ops.push((b) => appendAuditLog(b, req, {
        entityType: 'house_results', entityId: slug, entityLabel: houseName, action: 'house_results.pull',
        metadata: {
          dateFrom, dateTo, imported: payload.rows.length, deleted: toDelete.length,
          attributed: payload.attributed, pendingTags: payload.pending.map((p) => p.tag),
          skipped, via: req.headers['x-cron-secret'] ? 'cron' : 'admin',
        },
      }));

      await commitChunked(ops);

      return res.json({
        ok: true, house: slug, dateFrom, dateTo,
        imported: payload.rows.length, deleted: toDelete.length,
        attributed: payload.attributed, pending: payload.pending, skipped,
      });
    } catch (e: any) {
      console.error('[leonbet-pull] falhou:', e);
      return res.status(502).json({ error: e?.message || 'Falha ao puxar o relatório da casa.' });
    }
  };
  app.post('/api/internal/leonbet-pull', allowCronOrAdmin, leonbetPullHandler);

  // === FOMENTO (rede Offer18) · POSTBACK =====================================
  // A 1ª integração por PUSH: a rede chama /api/postback/fomento a cada conversão
  // e o dia da casa é RECOMPUTADO a partir do ledger `postback_events` (fonte da
  // verdade, idempotente por offer|event|click). Sem pull de relatório: a chave
  // da Reports API ainda não existe e o postback não depende dela (verificado em
  // 19/08/2026, RECON-FOMENTO-OFFER18.md). Dinheiro NÃO entra pelas linhas: só
  // contagens (lead=cadastro, ftd=FTD+CPA) — a comissão deriva da taxa padrão da
  // casa (defaultCpa em EUR, conversão ao vivo na leitura), como toda casa EUR
  // sem comissão importada. O payout/moeda crus ficam no ledger p/ auditoria.

  // Rede 1:N: a casa é achada pelo offer_id (`integrationExternalId`), nunca pelo
  // houseId do doc da integração (que é o vínculo 1:1 dos conectores de pull).
  const fomentoHouseByOffer = async (offerId: string) => {
    if (!adminDb) return null;
    const snap = await adminDb.collection('houses').where('integrationExternalId', '==', offerId).get();
    return snap.docs.find(
      (d) => String((d.data() as any)?.integration ?? '').trim() === FOMENTO_INTEGRATION_ID,
    ) ?? null;
  };

  // Recomputa e REESCREVE os dias com evento no ledger (mesma semântica do
  // upload/pull: datas presentes são reescritas, reprocessar nunca duplica; dia
  // sem evento não é tocado, então upload manual de outros dias convive).
  // `onlyDays` limita a janela: o disparo recomputa só o dia do evento; o botão
  // "Atualizar" reprocessa a janela p/ reatribuir tags vinculadas depois.
  const fomentoRecompute = async (
    houseDoc: { id: string; ref: any; data: () => any },
    offerId: string,
    onlyDays: string[] | null,
    byUid: string | null,
  ) => {
    const slug = String((houseDoc.data() as any)?.slug ?? houseDoc.id);
    const eventsSnap = await adminDb!.collection('postback_events').where('offerId', '==', offerId).get();
    const wanted = onlyDays ? new Set(onlyDays) : null;
    const events = eventsSnap.docs
      .map((d) => d.data() as FomentoEventDoc)
      .filter((e) => !wanted || wanted.has(String(e?.day ?? '')));
    const { rows: pullRows, ignored } = fomentoEventsToPullRows(events);

    // Tag -> afiliado pelo MESMO índice do import manual (links + apelidos):
    // uma fonte só, senão a atribuição diverge entre o postback e o upload.
    const [linksSnap, aliasSnap] = await Promise.all([
      adminDb!.collection('affiliate_links').get(),
      adminDb!.collection('affiliate_tag_aliases').get(),
    ]);
    const tagIndex = buildTagIndex(
      linksSnap.docs.map((d) => d.data() as any),
      aliasSnap.docs.map((d) => ({ ...(d.data() as any), tag: (d.data() as any)?.tag ?? d.id })),
    );
    const payload = buildPullPayload(pullRows, tagIndex as any);

    const stampedAt = admin.firestore.FieldValue.serverTimestamp();
    if (payload.rows.length === 0) {
      await houseDoc.ref.set({
        lastResultsCheckAt: stampedAt,
        integration: FOMENTO_INTEGRATION_ID,
      }, { merge: true });
      return { payload, deleted: 0, ignored };
    }

    const dates = new Set(payload.dates);
    const existing = await adminDb!.collection('house_results').where('houseSlug', '==', slug).get();
    const toDelete = existing.docs.filter((d) => dates.has((d.data() as any)?.date));

    const ops: ((b: admin.firestore.WriteBatch) => void)[] = [];
    toDelete.forEach((d) => ops.push((b) => b.delete(d.ref)));
    payload.rows.forEach((row) => {
      const rowRef = adminDb!.collection('house_results').doc(hrDocId(slug, row.date, row.affiliateId));
      ops.push((b) => b.set(rowRef, {
        houseSlug: slug, date: row.date, affiliateId: row.affiliateId, ...sanitizeMetrics(row),
        importedByUid: byUid, importedAt: stampedAt, source: 'postback',
      }));
    });
    ops.push((b) => b.set(houseDoc.ref, {
      lastResultsSyncAt: stampedAt,
      lastResultsCheckAt: stampedAt,
      lastResultsSyncSource: 'postback',
      lastResultsDate: payload.dates[payload.dates.length - 1] ?? null,
      integration: FOMENTO_INTEGRATION_ID,
    }, { merge: true }));
    await commitChunked(ops);
    return { payload, deleted: toDelete.length, ignored };
  };

  // Endpoint PÚBLICO que a rede chama. A barreira é o SEGREDO da query (`s=`,
  // comparado em tempo constante), guardado em integrations/fomento-offer18 —
  // IP atrás do Cloud Run não é barreira confiável sozinho. Sem auditoria por
  // disparo de propósito: o próprio ledger é a trilha, e um audit_log por
  // conversão viraria ruído na /auditoria.
  const fomentoPostbackHandler: express.RequestHandler = async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    const settings = await connectorSettings(FOMENTO_INTEGRATION_ID);
    if (!settings?.enabled || !settings.apiKey) {
      return res.status(503).json({ error: 'Postback da Fomento não configurado nesta instância.' });
    }
    const rawSecret = (req.query as any)?.s;
    const provided = String(Array.isArray(rawSecret) ? rawSecret[0] ?? '' : rawSecret ?? '');
    const a = Buffer.from(provided);
    const b = Buffer.from(settings.apiKey);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ error: 'Segredo do postback inválido.' });
    }
    const parsed = parseFomentoPostback(req.query as Record<string, unknown>);
    // 400 de propósito: o erro aparece no log de postback da Offer18, que é onde
    // um template mal colado se denuncia.
    if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
    const data = parsed.data;
    try {
      // Dia BR do RECEBIMENTO (fonte única resolveServerToday) — o token de data
      // não existe no postback. Divergência de corte perto da meia-noite é
      // limitação declarada; a reconciliação fina virá com a Reports API.
      const day = resolveServerToday();
      const eventDoc = {
        offerId: data.offerId, event: data.event, tag: data.tag, clickId: data.clickId,
        playerId: data.playerId, payout: data.payout, currency: data.currency, day,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const docId = fomentoPostbackDocId(data);
      let duplicate = false;
      if (docId) {
        const eventRef = adminDb.collection('postback_events').doc(docId);
        duplicate = (await eventRef.get()).exists;
        // Retry da rede cai no MESMO doc (id determinístico): o original é
        // preservado (dia inclusive — retry de madrugada não migra a conversão
        // de dia) e o recompute não muda.
        if (!duplicate) await eventRef.set(eventDoc);
      } else {
        // Sem aff_click_id não há âncora de dedupe: aceita com id automático.
        await adminDb.collection('postback_events').add(eventDoc);
      }

      const houseDoc = await fomentoHouseByOffer(data.offerId);
      if (!houseDoc) {
        // Oferta ainda sem casa: o evento fica no ledger e entra quando o admin
        // vincular a casa e clicar em "Atualizar". 200 de propósito: 4xx viraria
        // retry na rede por um estado que é nosso.
        return res.json({ ok: true, unmapped: true });
      }
      if (duplicate) return res.json({ ok: true, house: houseDoc.id, duplicate: true });

      await fomentoRecompute(houseDoc as any, data.offerId, [day], null);
      return res.json({ ok: true, house: houseDoc.id, day });
    } catch (e: any) {
      console.error('[fomento-postback] falhou:', e);
      return res.status(500).json({ error: 'Falha ao processar o postback.' });
    }
  };
  app.get('/api/postback/fomento', fomentoPostbackHandler);
  app.post('/api/postback/fomento', fomentoPostbackHandler);

  // Botão "Atualizar" de /casas: reprocessa a janela a partir do LEDGER, sem
  // nenhuma chamada externa — o uso típico é reatribuir tags que ganharam dono
  // (link emitido ou apelido salvo) depois dos disparos.
  const fomentoRecomputeHandler: express.RequestHandler = async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    const settings = await connectorSettings(FOMENTO_INTEGRATION_ID);
    if (!settings?.enabled) {
      return res.status(503).json({ error: 'Integração desligada em Integrações.' });
    }
    const slug = String(req.body?.houseSlug ?? '').trim();
    if (!slug) return res.status(400).json({ error: 'Informe a casa (houseSlug).' });
    try {
      const houseSnap = await adminDb.collection('houses').doc(slug).get();
      if (!houseSnap.exists) return res.status(404).json({ error: `Casa "${slug}" não encontrada.` });
      const offerId = String((houseSnap.data() as any)?.integrationExternalId ?? '').trim();
      if (!offerId) {
        return res.status(400).json({ error: 'Defina o ID da oferta da Fomento no cadastro desta casa.' });
      }
      const days = Number(req.body?.days);
      const span = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
      const { dateFrom, dateTo } = pullWindow(resolveServerToday(), span);
      const windowDays: string[] = [];
      const cursor = new Date(`${dateFrom}T12:00:00Z`);
      while (cursor.toISOString().slice(0, 10) <= dateTo) {
        windowDays.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      const { payload, deleted, ignored } = await fomentoRecompute(
        houseSnap as any, offerId, windowDays, (req as any).user?.uid ?? null,
      );
      await writeAuditLog(req, {
        entityType: 'house_results', entityId: slug,
        entityLabel: (houseSnap.data() as any)?.name ?? slug, action: 'house_results.pull',
        metadata: {
          dateFrom, dateTo, imported: payload.rows.length, deleted,
          attributed: payload.attributed, pendingTags: payload.pending.map((p) => p.tag),
          ignored, via: 'postback-recompute',
        },
      });
      return res.json({
        ok: true, house: slug, dateFrom, dateTo,
        imported: payload.rows.length, deleted,
        attributed: payload.attributed, pending: payload.pending,
        note: payload.rows.length === 0 ? 'Nenhum evento de postback na janela.' : undefined,
      });
    } catch (e: any) {
      console.error('[fomento-recompute] falhou:', e);
      return res.status(500).json({ error: e?.message || 'Falha ao reprocessar o postback da casa.' });
    }
  };

  // Registro de CONECTORES de pull POR CASA. A casa declara o seu na flag
  // `integration` do doc dela (auto-carimbada pelo conector a cada rodada) —
  // Esportiva é uma CASA, não um gateway: integração nova (ex.: MyAffiliates)
  // entra como um item novo aqui, sem mexer em rota nem em UI.
  // `configured` é ASSÍNCRONO desde o B7: a resposta depende do doc
  // `integrations/{id}` (chave + toggle), não mais só de uma env em memória.
  const PULL_CONNECTORS: Record<string, { configured: () => Promise<boolean>; handler: express.RequestHandler }> = {
    'esportiva-tap': {
      configured: async () => !!(await connectorSettings('esportiva-tap'))?.configured,
      handler: esportivaPullHandler,
    },
    'leonbet-r2d': {
      configured: async () => !!(await connectorSettings('leonbet-r2d'))?.configured,
      handler: leonbetPullHandler,
    },
    // Push, não pull: o "Atualizar" reprocessa o ledger de postback (reatribui
    // tags), nunca chama a rede.
    [FOMENTO_INTEGRATION_ID]: {
      configured: async () => !!(await connectorSettings(FOMENTO_INTEGRATION_ID))?.configured,
      handler: fomentoRecomputeHandler,
    },
  };

  // Pull POR CASA — o botão "Atualizar" de /casas chama a casa CLICADA e a rota
  // resolve o conector DELA pela flag; casa sem integração automática responde
  // 400 (nunca mais "clicou na Stake, puxou a Esportiva").
  app.post('/api/houses/:slug/pull', requireAdmin, async (req, res, next) => {
    if (!adminDb) return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    const slug = String(req.params.slug || '').trim();
    try {
      const snap = await adminDb.collection('houses').doc(slug).get();
      if (!snap.exists) return res.status(404).json({ error: `Casa "${slug}" não encontrada.` });
      const integration = String((snap.data() as any)?.integration ?? '').trim();
      const connector = integration ? PULL_CONNECTORS[integration] : undefined;
      if (!connector) {
        return res.status(400).json({ error: `A casa "${slug}" não tem integração automática de resultados.` });
      }
      if (!(await connector.configured())) {
        return res.status(503).json({ error: 'A integração desta casa não está configurada nesta instância.' });
      }
      // O handler do conector valida o alvo por `houseSlug` — repassa a casa clicada.
      req.body = { ...(req.body ?? {}), houseSlug: slug };
      return connector.handler(req, res, next);
    } catch (e: any) {
      console.error('[house-pull] falhou:', e);
      return res.status(500).json({ error: 'Erro ao iniciar o pull da casa.' });
    }
  });

  // === B7 · INTEGRAÇÕES (admin) =============================================
  // Gestão das integrações externas por instância. A coleção `integrations` é a
  // mais fechada depois de `auth_totp` (`read, write: if false` — NEM o admin lê
  // direto): guarda credencial de casa, então todo acesso passa por aqui, com
  // Admin SDK. A chave NUNCA volta ao browser em claro — só `keyMask`.
  app.get('/api/integrations', requireAdmin, async (_req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    try {
      const items = await Promise.all(
        INTEGRATION_CATALOG.map(async (spec) => {
          const snap = await adminDb!.collection('integrations').doc(spec.id).get();
          const data = snap.exists ? (snap.data() as any) : null;
          return toPublicIntegration(spec, data ? integrationFromDoc(spec.id, data) : null, process.env, {
            updatedAt: serializeTimestamp(data?.updatedAt),
            updatedBy: data?.updatedBy ?? null,
          });
        }),
      );
      return res.json({ integrations: items });
    } catch (e) {
      console.error('[integrations] erro ao listar:', e);
      return res.status(500).json({ error: 'Erro ao carregar as integrações' });
    }
  });

  app.put('/api/integrations/:id', requireAdmin, async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível' });
    const spec = findIntegrationSpec(req.params.id);
    // Catálogo fechado: id fora dele não cria doc (a coleção não é depósito).
    if (!spec) return res.status(404).json({ error: 'Integração desconhecida.' });
    try {
      const ref = adminDb.collection('integrations').doc(spec.id);
      const before = await ref.get();
      const beforeDoc = before.exists ? integrationFromDoc(spec.id, before.data()) : null;
      const patch = sanitizeIntegrationPatch(req.body, spec);

      const prevHouse = beforeDoc?.houseId ?? null;
      const nextHouse = patch.houseId !== undefined ? patch.houseId : prevHouse;
      // `houseId` sai do patch: quem grava o vínculo (nos dois docs) é o helper.
      const { houseId: _ignored, ...rest } = patch;

      await ref.set(
        {
          ...rest,
          id: spec.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: (req as any).user?.uid ?? null,
        },
        { merge: true },
      );

      if (nextHouse !== prevHouse) await applyIntegrationLink(spec.id, nextHouse);

      // Auditoria SEM a chave (é credencial): registra que mudou, não o valor.
      const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
      if (patch.enabled !== undefined && patch.enabled !== beforeDoc?.enabled) {
        changes.push({ field: 'enabled', before: beforeDoc?.enabled ?? null, after: patch.enabled });
      }
      if (patch.houseId !== undefined && patch.houseId !== prevHouse) {
        changes.push({ field: 'houseId', before: prevHouse, after: patch.houseId });
      }
      await writeAuditLog(req, {
        entityType: 'integration', entityId: spec.id, entityLabel: spec.label,
        action: 'integration.update',
        changes: changes.length ? changes : null,
        metadata: { keyChanged: patch.apiKey !== undefined },
      });

      const after = await ref.get();
      const afterData = after.data() as any;
      return res.json(
        toPublicIntegration(spec, integrationFromDoc(spec.id, afterData), process.env, {
          updatedAt: serializeTimestamp(afterData?.updatedAt),
          updatedBy: afterData?.updatedBy ?? null,
        }),
      );
    } catch (e) {
      console.error('[integrations] erro ao salvar:', e);
      return res.status(500).json({ error: 'Erro ao salvar a integração' });
    }
  });

  // === API do PARCEIRO (read-only, M2M) =====================================
  // Superfície estável e versionada (/api/partner/v1/*) exposta a um parceiro
  // externo via API key da Boost (requirePartner). Read-only. Envelope fixo
  // { data, total, generatedAt } p/ não vazar a inconsistência de shape da OTG.
  // Ver PARTNER-API.md e a memória boost-partner-api.
  const partnerEnvelope = (data: any[]) => ({ data, total: data.length, generatedAt: new Date().toISOString() });
  const partnerApi = express.Router();
  partnerApi.use(partnerLimiter, requirePartner);

  // Afiliados PENDENTES de cadastro (aprovados na OTG, ainda fora do relatório).
  // É o dado-chave da integração. Filtros opcionais: ?status=pending|reconciled, ?house=.
  partnerApi.get('/pending-affiliates', requireScope('pending-affiliates'), async (req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível.' });
    try {
      const snap = await adminDb.collection('pending_affiliates').get();
      // Carlos (2026-06-17): esconder PII de contato (email/phone) do parceiro por ora.
      // Removidos no servidor; o resto (nome, casa, status, registerUrl…) segue.
      let rows = snap.docs.map((d) => {
        const { email, phone, ...rest } = d.data() as any;
        void email; void phone;
        return { id: d.id, ...rest };
      });
      const status = req.query.status ? String(req.query.status) : null;
      const house = req.query.house ? String(req.query.house).toLowerCase() : null;
      if (status) rows = rows.filter((r) => String(r.status || 'pending') === status);
      if (house) rows = rows.filter((r) => String(r.house || '').toLowerCase() === house);
      return res.json(partnerEnvelope(rows));
    } catch (error: any) {
      console.error('[partner-api] pending-affiliates:', error);
      return res.status(500).json({ error: 'Erro ao listar afiliados pendentes.' });
    }
  });

  // Afiliados reconciliados/ativos (espelho do relatório). Inclui registerUrl
  // (link de cadastro) quando houver — do affiliate_links ou do pré-cadastro.
  partnerApi.get('/affiliates', requireScope('affiliates'), async (_req, res) => {
    if (!adminDb) return res.status(500).json({ error: 'Servidor indisponível.' });
    try {
      const [affSnap, linkSnap, pendSnap] = await Promise.all([
        adminDb.collection('affiliates').get(),
        adminDb.collection('affiliate_links').get(),
        adminDb.collection('pending_affiliates').where('status', '==', 'reconciled').get(),
      ]);
      // mapa affiliateId → registerUrl (link de divulgação tem prioridade; senão o do pré-cadastro)
      const urlById = new Map<string, string>();
      for (const d of pendSnap.docs) {
        const p = d.data() as any;
        if (p.affiliateId && p.registerUrl) urlById.set(String(p.affiliateId), p.registerUrl);
      }
      for (const d of linkSnap.docs) {
        const l = d.data() as any;
        if (l.affiliateId && l.registerUrl) urlById.set(String(l.affiliateId), l.registerUrl);
      }
      const rows = affSnap.docs.map((d) => {
        const a = d.data() as any;
        return {
          id: d.id,
          name: a.name ?? null,
          siteId: a.siteId ?? null,
          brand: a.brand ?? null,
          registerUrl: urlById.get(d.id) ?? null,
        };
      });
      return res.json(partnerEnvelope(rows));
    } catch (error: any) {
      console.error('[partner-api] affiliates:', error);
      return res.status(500).json({ error: 'Erro ao listar afiliados.' });
    }
  });

  // Resultados/produção agregados (proxy do relatório da OTG). Query obrigatória:
  // ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD ; opcional ?groupBy=affiliate|brand|date|campaign
  // (default affiliate) e ?affiliateIds=a,b (expandido p/ o formato repetido da OTG).
  partnerApi.get('/results', requireScope('results'), async (req, res) => {
    const BASE_URL = process.env.VITE_AFFILIATE_API_BASE_URL || 'https://affiliate-api-prd.partnersotg.com';
    const apiKey = process.env.AFFILIATE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Chave de API externa não configurada.' });
    const startDate = req.query.startDate ? String(req.query.startDate) : '';
    const endDate = req.query.endDate ? String(req.query.endDate) : '';
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate e endDate são obrigatórios (YYYY-MM-DD).' });
    }
    try {
      // Params base da consulta (a página é setada por iteração abaixo).
      const baseParams = new URLSearchParams();
      baseParams.set('startDate', startDate);
      baseParams.set('endDate', endDate);
      baseParams.set('groupBy', req.query.groupBy ? String(req.query.groupBy) : 'affiliate');
      // a OTG não aceita affiliateIds CSV — expande p/ parâmetro repetido.
      expandAffiliateIdsParam(req.query.affiliateIds).forEach((affId) => baseParams.append('affiliateIds', affId));

      // PAGINAÇÃO: a OTG entrega só pageSize=50 por página (page=N até totalPages;
      // pageSize/limit maiores dão erro). Sem isto, o parceiro via só os 50 primeiros
      // afiliados. Varremos todas as páginas e concatenamos. Trava de segurança em
      // MAX_PAGES (2500 linhas) — se estourar, logamos o truncamento (não silencioso).
      const MAX_PAGES = 50;
      const all: any[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const params = new URLSearchParams(baseParams);
        params.set('page', String(page));
        const resp = await fetchImpl(`${BASE_URL}/api/v2/external/results?${params.toString()}`, {
          headers: { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': 'AgenciaBoost-App/1.0' },
        });
        const text = await resp.text();
        let body: any = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        if (!resp.ok) {
          const requestId = crypto.randomBytes(8).toString('hex');
          console.error(`[partner-api] ${requestId} results upstream ${resp.status} (page ${page}):`, text);
          return res.status(502).json({ error: 'Falha ao consultar o relatório.', code: body?.code, requestId });
        }
        const d = body?.data;
        const rows = Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : (Array.isArray(body) ? body : []));
        all.push(...rows);
        const tp = Number(d?.meta?.totalPages);
        totalPages = Number.isFinite(tp) && tp > 0 ? tp : 1;
        page++;
      } while (page <= totalPages && page <= MAX_PAGES);

      if (totalPages > MAX_PAGES) {
        console.warn(`[partner-api] results truncado: ${totalPages} páginas > limite ${MAX_PAGES}. Retornando ${all.length} linhas.`);
      }

      // Carlos (2026-06-17): pro parceiro só CADASTRO, DEPÓSITOS e CPA (contagem) —
      // NADA de valores (R$). Whitelist derruba total_commission/cpa/rvs/deposit e
      // qualquer campo monetário. Ver src/lib/partnerResults.ts.
      return res.json(partnerEnvelope(projectPartnerResults(all)));
    } catch (error: any) {
      console.error('[partner-api] results:', error);
      return res.status(500).json({ error: 'Erro ao consultar resultados.' });
    }
  });

  app.use('/api/partner/v1', partnerApi);
  // ==========================================================================

  // Block requests to dotfiles / sensitive paths (e.g. /.git, /.env) with a branded
  // page. In dev the Vite fs middleware would otherwise return a raw 403 that leaks
  // the absolute disk path; in prod these are just paths we never want to serve.
  // Placed after /api/* (so the API keeps working) and before the SPA/static layer.
  // Só dotfiles na RAIZ (/.git, /.env, /.ssh…). Não casa caminhos internos do Vite
  // como /node_modules/.vite/deps/* — bloqueá-los quebraria o dev server.
  app.use((req, res, next) => {
    if (/^\/\.[^/]/.test(req.path)) {
      return res.status(404).type('html').send(
        renderErrorPage({
          status: 404,
          title: 'Página não encontrada',
          message: 'O endereço que você tentou acessar não existe ou não está disponível.',
        })
      );
    }
    next();
  });

  return app;
}

// Controle de versão: publica a versão DESTE deploy em app_meta/version (Firestore) no
// boot. Como cada deploy é um processo novo com um version.json novo (gerado no build
// por scripts/gen-version.mjs), a versão "eleva" sozinha a cada deploy — os clientes com
// a aba aberta veem o doc mudar (onSnapshot) e ganham o banner de atualização. Fica FORA
// do createApp (depende de build/FS) p/ não atrapalhar os testes via supertest. Escreve
// só se a versão mudou — o Cloud Run pode reiniciar a instância sem deploy novo, e isso
// manteria o updatedAt refletindo deploys reais. Os secrets do Admin SDK só existem em
// RUNTIME (apphosting.yaml), então a publicação tem que ser no boot, nunca no build.
function readBuildVersion(): AppVersion | null {
  // Em prod a versão vem de dist/version.json (Vite copia public/ -> dist/); em dev,
  // direto de public/version.json (gerado pelo predev). Tenta os dois.
  const candidates = [
    path.join(process.cwd(), 'dist', 'version.json'),
    path.join(process.cwd(), 'public', 'version.json'),
  ];
  for (const file of candidates) {
    try {
      const info = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (info?.version) return info as AppVersion;
    } catch {
      /* arquivo ausente neste ambiente — tenta o próximo */
    }
  }
  return null;
}

async function publishAppVersion(adminDb: admin.firestore.Firestore | null) {
  if (!adminDb) return;
  const info = readBuildVersion();
  if (!info?.version) {
    console.warn('App version: version.json não encontrado; pulando publicação.');
    return;
  }
  try {
    const ref = adminDb.collection('app_meta').doc('version');
    const snap = await ref.get();
    if (snap.exists && snap.data()?.version === info.version) return; // sem mudança
    await ref.set(
      { ...buildVersionPayload(info), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    console.log(`App version published: ${info.version}`);
  } catch (err) {
    console.error('Failed to publish app version:', err);
  }
}

// Sobe o servidor de verdade: inicializa o Admin SDK, monta o app via createApp e
// adiciona a camada específica de ambiente (Vite em dev / estático + fallback SPA em
// prod). Essa camada NÃO entra no createApp p/ manter o app testável e sem dependência
// de build/Vite.
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const { adminApp, adminDb } = initAdmin();
  const app = createApp({ adminApp, adminDb });

  // Publica a versão deste deploy (best-effort, não bloqueia o boot).
  void publishAppVersion(adminDb);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Assets têm hash no nome (imutáveis): cache do Express padrão é seguro —
    // um build novo gera um nome novo, então não há staleness.
    // `index: false` para que o index.html passe SEMPRE pelo fallback abaixo.
    // CORP `cross-origin` SÓ nos estáticos: o helmet global põe `same-origin` em
    // tudo, e o Chrome bloqueia (ERR_BLOCKED_BY_RESPONSE.NotSameOrigin) a logo da
    // instância embutida na vitrine de affiliacore.com.br — 200 no curl, imagem
    // vazia no browser (achado 2026-08-12). O bundle/assets de marca são públicos
    // por definição; as rotas /api seguem `same-origin`.
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
      }),
    );

    // Serve o index.html sem cache nem validadores. CRÍTICO: o ETag default do
    // Express é (tamanho + mtime); o index.html tem sempre 555 bytes e o buildpack
    // do App Hosting preserva o mtime, então o ETag NÃO muda entre deploys. Com
    // revalidação (no-cache) o browser recebia 304 e mantinha um index.html velho
    // apontando p/ um hash de asset que o build novo apagou → 404 / tela branca a
    // cada deploy. `no-store` + etag/lastModified desligados elimina o 304.
    const sendIndex = (res: express.Response) => {
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'), { etag: false, lastModified: false });
    };

    app.get('*', (req, res) => {
      // O fallback SPA é só para rotas de cliente. Se um request de ARQUIVO
      // (com extensão, ex.: /assets/index-*.js) chega aqui, o arquivo não existe
      // nesta build — devolver 404 em vez do index.html, que o browser carregaria
      // com o MIME errado ("Expected a JavaScript module…").
      if (path.extname(req.path)) {
        return res.status(404).type('html').send(
          renderErrorPage({
            status: 404,
            title: 'Recurso não encontrado',
            message: 'O arquivo solicitado não existe nesta versão da aplicação.',
          })
        );
      }
      sendIndex(res);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// Auto-start só quando o processo é o servidor (tsx server.ts). Vitest seta
// VITEST=true e NODE_ENV='test'; o guard impede que importar este arquivo p/ pegar
// `createApp` num teste (supertest) suba o Vite e ouça a porta. Dev (NODE_ENV
// undefined) e prod (production) rodam normalmente.
if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
  startServer();
}
