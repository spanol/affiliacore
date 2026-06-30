// Núcleo PURO da trilha de auditoria (sem Firebase/React) — rótulos pt-BR, filtro,
// paginação e helpers de exibição. Vive em src/lib com teste colocado (auditView.test.ts)
// porque a lógica de filtro/rotulagem é a parte testável da página /auditoria. [[boost-audit-trail]]

export interface AuditChange {
  field: string;
  before: unknown;
  after: unknown;
}

// Espelha o doc `audit_logs` (formato generalizado da Fase 1) + o espelho legado
// `affiliateId`. createdAt chega como ISO string (serializeTimestamp no server).
export interface AuditLogEntry {
  id?: string;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  action: string;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  changes?: AuditChange[] | null;
  metadata?: Record<string, unknown> | null;
  reason?: string | null;
  affiliateId?: string | null; // espelho legado (tabela antiga em Configurações)
  createdAt?: string | null;
}

// Rótulo pt-BR de cada ação conhecida. Ação desconhecida cai no próprio código
// (não some da UI) — assim ações futuras aparecem mesmo sem mapeamento aqui.
const ACTION_LABELS: Record<string, string> = {
  'affiliate.activate': 'Ativou afiliado',
  'affiliate.deactivate': 'Desativou afiliado',
  'affiliate.sync': 'Sincronizou afiliados (OTG)',
  'affiliate.create_boost': 'Criou afiliado nativo (Boost)',
  'affiliate.link_email': 'Vinculou e-mail a afiliado',
  'invite.create': 'Gerou convite',
  'house.create': 'Criou casa',
  'house.update': 'Editou casa',
  'house.delete': 'Removeu casa',
  'house_results.import': 'Importou resultados',
  'house_results.clear': 'Limpou resultados',
  'config.update': 'Alterou comissão (CPA/REV)',
  'user.create': 'Criou usuário',
  'user.link_affiliate': 'Vinculou login a afiliado',
  'user.accept_invite': 'Aceitou convite (auto-cadastro)',
};

export function actionLabel(action?: string | null): string {
  if (!action) return '—';
  return ACTION_LABELS[action] ?? action;
}

// Tipo de entidade em pt-BR (p/ a coluna "Entidade" e os filtros).
const ENTITY_TYPE_LABELS: Record<string, string> = {
  affiliate: 'Afiliado',
  affiliates: 'Afiliados',
  house: 'Casa',
  house_results: 'Resultados',
  user: 'Usuário',
  affiliate_config: 'Comissão',
};

export function entityTypeLabel(entityType?: string | null): string {
  if (!entityType) return '—';
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

// O que mostrar p/ identificar a entidade: nome no momento > id > traço.
export function entityDisplay(log: AuditLogEntry): string {
  return (log.entityLabel || log.entityId || log.affiliateId || '—') as string;
}

// Quem agiu: nome > e-mail > uid > "Sistema" (cron/sem ator).
export function actorDisplay(log: AuditLogEntry): string {
  return (log.actorName || log.actorEmail || log.actorId || 'Sistema') as string;
}

// millis do createdAt (ISO string) p/ ordenar/filtrar por data; ausente/inválido → 0.
export function logDateMillis(log: AuditLogEntry): number {
  if (!log.createdAt) return 0;
  const t = Date.parse(String(log.createdAt));
  return Number.isFinite(t) ? t : 0;
}

export interface AuditFilters {
  entityType?: string;       // '' = todos
  action?: string;           // '' = todas
  actor?: string;            // actorId exato; '' = todos
  dateFrom?: string;         // 'YYYY-MM-DD' (inclusive)
  dateTo?: string;           // 'YYYY-MM-DD' (inclusive — cobre o dia inteiro)
  search?: string;           // busca livre
}

// Concatena os campos pesquisáveis de um log num texto único (lowercase).
function searchableText(log: AuditLogEntry): string {
  const parts = [
    actionLabel(log.action), log.action,
    entityTypeLabel(log.entityType), log.entityType,
    entityDisplay(log), log.entityId, log.affiliateId,
    actorDisplay(log), log.actorEmail,
    log.reason,
    log.metadata ? JSON.stringify(log.metadata) : '',
    log.changes ? JSON.stringify(log.changes) : '',
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function filterAuditLogs(logs: AuditLogEntry[], filters: AuditFilters = {}): AuditLogEntry[] {
  const term = (filters.search || '').trim().toLowerCase();
  const fromMs = filters.dateFrom ? Date.parse(`${filters.dateFrom}T00:00:00`) : null;
  // dateTo inclusivo: +1 dia e usa "<" p/ cobrir o dia inteiro sem depender da hora.
  const toMs = filters.dateTo ? Date.parse(`${filters.dateTo}T00:00:00`) + 86_400_000 : null;

  return logs.filter((log) => {
    if (filters.entityType && (log.entityType || '') !== filters.entityType) return false;
    if (filters.action && log.action !== filters.action) return false;
    if (filters.actor && (log.actorId || '') !== filters.actor) return false;
    if (fromMs != null || toMs != null) {
      const ms = logDateMillis(log);
      if (fromMs != null && ms < fromMs) return false;
      if (toMs != null && ms >= toMs) return false;
    }
    if (term && !searchableText(log).includes(term)) return false;
    return true;
  });
}

export interface Page<T> {
  items: T[];
  page: number;       // página efetiva (1-based, já clampeada)
  pageSize: number;
  total: number;
  totalPages: number;
}

// Paginação 1-based. `page` é clampeada a [1, totalPages]; lista vazia → 1 página.
export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.trunc(pageSize) || 1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  return { items: items.slice(start, start + size), page: safePage, pageSize: size, total, totalPages };
}

// Valores distintos p/ alimentar os <select> de filtro (ordenados por rótulo pt-BR).
export function uniqueEntityTypes(logs: AuditLogEntry[]): string[] {
  const set = new Set<string>();
  for (const l of logs) if (l.entityType) set.add(l.entityType);
  return [...set].sort((a, b) => entityTypeLabel(a).localeCompare(entityTypeLabel(b), 'pt-BR'));
}

export function uniqueActions(logs: AuditLogEntry[]): string[] {
  const set = new Set<string>();
  for (const l of logs) if (l.action) set.add(l.action);
  return [...set].sort((a, b) => actionLabel(a).localeCompare(actionLabel(b), 'pt-BR'));
}

// Atores distintos como {id, label} (label = nome/e-mail; id = actorId p/ o filtro).
export function uniqueActors(logs: AuditLogEntry[]): Array<{ id: string; label: string }> {
  const map = new Map<string, string>();
  for (const l of logs) {
    if (!l.actorId) continue;
    if (!map.has(l.actorId)) map.set(l.actorId, actorDisplay(l));
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

// Formata um valor solto p/ exibição (vazio → traço; objeto → JSON; resto → string).
function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Resumo curto de uma mudança p/ exibir na linha (ex.: "affiliateId: — → AFF-1").
export function formatChange(change: AuditChange): string {
  return `${change.field}: ${fmtValue(change.before)} → ${fmtValue(change.after)}`;
}

// Resumo da coluna "Detalhe": motivo > mudanças (antes→depois) > metadata > traço.
export function auditDetail(log: AuditLogEntry): string {
  if (log.reason) return log.reason;
  if (log.changes && log.changes.length) return log.changes.map(formatChange).join(' · ');
  if (log.metadata && Object.keys(log.metadata).length) {
    return Object.entries(log.metadata).map(([k, v]) => `${k}: ${fmtValue(v)}`).join(' · ');
  }
  return '—';
}
