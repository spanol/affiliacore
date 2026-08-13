// Conquistas ("Ranking de Conquistas") — premiações que o afiliado DESBLOQUEIA
// ao atingir uma meta individual acumulada (CPAs e/ou comissão em R$), no molde
// da plataforma legada da Infinity (Silver 100K → Diamond 10M, placas). É um
// sistema separado de `ranking_prizes` (aquele premia POSIÇÃO no ranking diário;
// este premia META individual). Núcleo PURO (sem Firebase): o saneamento é
// compartilhado entre as rotas /api/achievement-* do servidor e os forms do
// admin — o server só pode importar de src/lib (mesma regra de commission.ts).

import { num, calcAffiliatePayout, type AffiliateConfig } from './commission';

export interface AchievementTierInput {
  title: string; // o prêmio ("Placa de 10K")
  subtitle?: string; // tier/categoria ("SILVER", "NÍVEL 1")
  description?: string; // regra/entrega em texto livre ("Placa entregue via Correios")
  metaCpas?: number; // meta em CPAs acumulados; 0/ausente = ignorada
  metaCommission?: number; // meta em comissão acumulada (R$, repasse do afiliado); 0/ausente = ignorada
  order?: number; // ordem de exibição (0 primeiro)
  active?: boolean; // desligado = some do roadmap do afiliado
  imageUrl?: string; // imagem da placa: https:// ou data:image/* (mesmo formato de uploadHouseLogo)
}

export interface AchievementTier extends AchievementTierInput {
  id: string;
  active: boolean;
}

export const TIER_TITLE_MAX = 120;
export const TIER_SUBTITLE_MAX = 60;
export const TIER_DESCRIPTION_MAX = 300;
export const TIER_ORDER_MAX = 9999;
export const TIER_META_MAX = 1_000_000_000; // guarda contra dedo gordo, não regra de negócio
// Data URL cabe no doc (limite de 1MB do Firestore) e é baixada por TODO cliente
// logado no onSnapshot — imagem grande aqui degrada o app inteiro, não só o admin.
export const TIER_IMAGE_MAX_CHARS = 400_000;

export type SanitizedTier = {
  title: string;
  subtitle: string;
  description: string;
  metaCpas: number;
  metaCommission: number;
  order: number;
  active: boolean;
  imageUrl: string;
};

// Mesmo shape não-union de prizes.ts: sem strictNullChecks o narrowing de
// discriminated union não funciona nos call-sites.
export interface TierSanitizeResult {
  ok: boolean;
  value?: SanitizedTier;
  error?: string;
}

const TITLE_ERROR = 'Informe o título do prêmio.';
const META_ERROR = 'Defina ao menos uma meta (CPAs ou comissão em R$) maior que zero.';
const ORDER_ERROR = `Ordem inválida — use um número inteiro entre 0 e ${TIER_ORDER_MAX}.`;
const IMAGE_ERROR = 'Imagem inválida — use uma URL https:// ou uma imagem pequena (data:image/*).';

// Valor de meta vindo de form: aceita number ou string nos DOIS formatos de
// decimal ('10000.50' e '10.000,50' pt-BR). Diferente de `num()` (que por
// contrato NÃO parseia vírgula — dado de API), aqui a fonte é digitação humana.
export function parseMetaValue(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 && raw <= TIER_META_MAX ? raw : null;
  }
  if (typeof raw !== 'string') return raw == null ? 0 : null;
  const s = raw.trim();
  if (s === '') return 0;
  let normalized = s.replace(/\s|R\$/g, '');
  if (normalized.includes(',')) {
    // '10.000,50' → '10000.50'; '10000,50' → '10000.50'
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 && n <= TIER_META_MAX ? n : null;
}

function parseOrder(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > TIER_ORDER_MAX) return null;
  return n;
}

function parseImageUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.length > TIER_IMAGE_MAX_CHARS) return null;
  if (/^https:\/\/.+/i.test(s)) return s;
  if (/^data:image\/(png|jpe?g|webp|svg\+xml|gif);base64,/i.test(s)) return s;
  return null;
}

export function sanitizeTier(body: unknown): TierSanitizeResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = String(b.title ?? '').trim().slice(0, TIER_TITLE_MAX);
  if (!title) return { ok: false, error: TITLE_ERROR };
  const metaCpas = parseMetaValue(b.metaCpas);
  const metaCommission = parseMetaValue(b.metaCommission);
  if (metaCpas == null || metaCommission == null) return { ok: false, error: META_ERROR };
  if (metaCpas <= 0 && metaCommission <= 0) return { ok: false, error: META_ERROR };
  const order = parseOrder(b.order);
  if (order == null) return { ok: false, error: ORDER_ERROR };
  const imageUrl = parseImageUrl(b.imageUrl);
  if (imageUrl == null) return { ok: false, error: IMAGE_ERROR };
  return {
    ok: true,
    value: {
      title,
      subtitle: String(b.subtitle ?? '').trim().slice(0, TIER_SUBTITLE_MAX),
      description: String(b.description ?? '').trim().slice(0, TIER_DESCRIPTION_MAX),
      metaCpas,
      metaCommission,
      order,
      active: b.active === undefined ? true : !!b.active,
      imageUrl,
    },
  };
}

export interface TierPatchResult {
  ok: boolean;
  patch?: Partial<SanitizedTier>;
  error?: string;
}

// PATCH parcial: só saneia campos PRESENTES; campo presente e inválido derruba
// o patch inteiro (400). A regra "ao menos uma meta > 0" só é reavaliada quando
// o patch mexe em meta E traz as duas zeradas — o servidor valida o resultado
// final combinando com o doc atual (ver rota).
export function sanitizeTierPatch(body: unknown): TierPatchResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Partial<SanitizedTier> = {};
  if (b.title !== undefined) {
    const title = String(b.title ?? '').trim().slice(0, TIER_TITLE_MAX);
    if (!title) return { ok: false, error: TITLE_ERROR };
    patch.title = title;
  }
  if (b.subtitle !== undefined) patch.subtitle = String(b.subtitle ?? '').trim().slice(0, TIER_SUBTITLE_MAX);
  if (b.description !== undefined)
    patch.description = String(b.description ?? '').trim().slice(0, TIER_DESCRIPTION_MAX);
  if (b.metaCpas !== undefined) {
    const metaCpas = parseMetaValue(b.metaCpas);
    if (metaCpas == null) return { ok: false, error: META_ERROR };
    patch.metaCpas = metaCpas;
  }
  if (b.metaCommission !== undefined) {
    const metaCommission = parseMetaValue(b.metaCommission);
    if (metaCommission == null) return { ok: false, error: META_ERROR };
    patch.metaCommission = metaCommission;
  }
  if (b.order !== undefined) {
    const order = parseOrder(b.order);
    if (order == null) return { ok: false, error: ORDER_ERROR };
    patch.order = order;
  }
  if (b.active !== undefined) patch.active = !!b.active;
  if (b.imageUrl !== undefined) {
    const imageUrl = parseImageUrl(b.imageUrl);
    if (imageUrl == null) return { ok: false, error: IMAGE_ERROR };
    patch.imageUrl = imageUrl;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nada para atualizar.' };
  return { ok: true, patch };
}

// Totais ACUMULADOS do afiliado (OTG + casas manuais mesclados pelo consumidor,
// como toda visão por-afiliado). `commission` é o REPASSE do afiliado
// (calcAffiliatePayout), nunca a comissão bruta da agência.
export interface AchievementTotals {
  cpas: number;
  commission: number;
}

// De onde saem os totais que valem para a placa.
//  - 'scoped': o que o SERVIDOR deixa o chamador ver, sem pedir id nenhum. Para o
//    afiliado comum isso é só ele; para o ESPECIAL ativo é own + subs, porque o
//    proxy externo e o /api/house-results escopam ambos pela sub-rede. É o modo
//    padrão desde 13/08: o Maurício quer que a placa conte também os ganhos da
//    rede, e a régua vira a MESMA já exibida no painel do especial — taxa própria
//    aplicada sobre a rede inteira (SpecialDashboard, "comissão total").
//  - 'self': força o próprio id. Só para o ADMIN que também é afiliado — sem isso
//    ele herdaria a produção da agência inteira e desbloquearia tudo.
// Quem tem downline mas NÃO é especial ativo cai em 'scoped' e enxerga só a
// própria produção: a sub-rede é resolvida por `special_affiliates`, não pela
// árvore de upline sozinha.
export type AchievementScope = 'scoped' | 'self';

export function resolveAchievementScope(
  role?: string | null,
  affiliateId?: string | null,
): AchievementScope {
  if (!affiliateId) return 'self'; // sem afiliado vinculado não há o que buscar
  return role === 'admin' ? 'self' : 'scoped';
}

/**
 * Totais acumulados a partir do breakdown POR CASA do afiliado
 * (`fetchAffiliateResultsByBrand`, que já funde OTG + casas manuais).
 *
 * `commission` é o REPASSE do afiliado, somado casa a casa para respeitar a taxa
 * `byBrand` — a mesma regra do BrandBreakdown. NUNCA reimplemente a fórmula
 * aqui: delega a `calcAffiliatePayout`. A meta de comissão do afiliado é o que
 * ELE ganha, nunca a comissão bruta da agência. [[boost-net-profit-rule]]
 */
export function totalsFromBrandRows(
  rows: any[] | null | undefined,
  config?: AffiliateConfig | null,
): AchievementTotals {
  let cpas = 0;
  let commission = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    cpas += num(row?.qualified_cpa);
    commission += calcAffiliatePayout(row, config, String(row?.id ?? ''));
  }
  return { cpas, commission };
}

// Prévia do card no admin: totais SINTÉTICOS derivados da própria meta, para o
// admin ver como o prêmio aparece antes de salvar. Não são dados de afiliado
// nenhum — a fração é ilustrativa e a UI rotula como exemplo.
export type PreviewState = 'progress' | 'unlocked';
export const PREVIEW_FRACTION = 0.65;

export function previewTotals(
  tier: Pick<AchievementTier, 'metaCpas' | 'metaCommission'>,
  state: PreviewState,
): AchievementTotals {
  const fraction = state === 'unlocked' ? 1 : PREVIEW_FRACTION;
  return {
    // CPA é contagem inteira; arredondar para baixo garante que só o estado
    // 'unlocked' desbloqueia (um round() poderia empatar com a meta).
    cpas: Math.floor(num(tier.metaCpas) * fraction),
    commission: num(tier.metaCommission) * fraction,
  };
}

export interface TierProgress {
  fraction: number; // 0..1 — menor fração entre as metas definidas
  unlocked: boolean; // todas as metas definidas atingidas
}

// Semântica com as DUAS metas definidas: exige AMBAS (fração = mínimo). O uso
// normal é uma meta só ("CPAs OU comissão", como o form do legado) — aí as duas
// leituras coincidem; no caso ambíguo, a leitura conservadora protege o caixa.
export function tierProgress(
  tier: Pick<AchievementTier, 'metaCpas' | 'metaCommission'>,
  totals: AchievementTotals,
): TierProgress {
  const metas: Array<{ meta: number; total: number }> = [];
  const metaCpas = num(tier.metaCpas);
  const metaCommission = num(tier.metaCommission);
  if (metaCpas > 0) metas.push({ meta: metaCpas, total: num(totals?.cpas) });
  if (metaCommission > 0) metas.push({ meta: metaCommission, total: num(totals?.commission) });
  if (metas.length === 0) return { fraction: 0, unlocked: false }; // tier sem meta não desbloqueia
  const fraction = Math.min(...metas.map((m) => Math.min(Math.max(m.total / m.meta, 0), 1)));
  return { fraction, unlocked: fraction >= 1 };
}

// Ordena o roadmap: ordem de exibição, depois dificuldade (comissão, CPAs),
// empate preserva chegada — espelho do "Ordem de exibição + ID" do legado.
export function sortTiers<T extends { order?: number; metaCommission?: number; metaCpas?: number }>(
  tiers: T[],
): T[] {
  return [...tiers].sort(
    (a, b) =>
      num(a.order) - num(b.order) ||
      num(a.metaCommission) - num(b.metaCommission) ||
      num(a.metaCpas) - num(b.metaCpas),
  );
}

export function activeTiers<T extends { active: boolean }>(tiers: T[]): T[] {
  return tiers.filter((t) => t.active);
}

// Próximo prêmio a buscar: primeiro tier ATIVO ainda bloqueado, na ordem do
// roadmap. Todos desbloqueados → undefined.
export function nextTier<T extends AchievementTier>(tiers: T[], totals: AchievementTotals): T | undefined {
  return sortTiers(activeTiers(tiers)).find((t) => !tierProgress(t, totals).unlocked);
}

export function unlockedTiers<T extends AchievementTier>(tiers: T[], totals: AchievementTotals): T[] {
  return sortTiers(activeTiers(tiers)).filter((t) => tierProgress(t, totals).unlocked);
}

// ---------------------------------------------------------------------------
// Solicitações — o afiliado desbloqueia e SOLICITA o prêmio; o admin aprova.

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type AchievementRequestStatus = (typeof REQUEST_STATUSES)[number];

export interface AchievementRequest {
  id: string;
  tierId: string;
  affiliateId: string;
  affiliateName?: string;
  status: AchievementRequestStatus;
  // Snapshot do progresso DECLARADO no momento do pedido (exibição). A
  // aprovação é humana: o admin confere contra os números do /admin.
  snapshot?: AchievementTotals;
}

export function requestForTier<T extends { tierId: string; status: string }>(
  requests: T[],
  tierId: string,
): T | undefined {
  // Rejeitada não conta — o afiliado pode pedir de novo.
  return requests.find((r) => r.tierId === tierId && r.status !== 'rejected');
}

// O afiliado pode solicitar quando o tier está ativo, desbloqueado e ainda sem
// pedido vivo (pendente/aprovado) para ele.
export function canRequestTier(
  tier: AchievementTier,
  totals: AchievementTotals,
  requests: Array<{ tierId: string; status: string }>,
): boolean {
  if (!tier.active) return false;
  if (!tierProgress(tier, totals).unlocked) return false;
  return requestForTier(requests, tier.id) === undefined;
}

// Rótulo da meta pra pills/tabelas: "50 CPAs", "R$ 10.000,00" ou os dois.
export function tierMetaLabel(tier: Pick<AchievementTier, 'metaCpas' | 'metaCommission'>): string {
  const parts: string[] = [];
  const metaCpas = num(tier.metaCpas);
  const metaCommission = num(tier.metaCommission);
  if (metaCpas > 0) parts.push(`${metaCpas} CPAs`);
  if (metaCommission > 0)
    parts.push(
      `R$ ${metaCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    );
  return parts.join(' + ') || 'sem meta';
}
