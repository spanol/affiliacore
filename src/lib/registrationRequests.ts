// Solicitações de cadastro — quem bateu na porta da agência e ainda não virou
// afiliado. Duas portas de entrada, historicamente invisíveis no app:
//
//   · AUTO-CADASTRO (`users`)  — pessoa criou LOGIN no /register (aberto quando a
//     instância liga a vitrine). Nasce `role:'client'` SEM `affiliateId`, então
//     entra no painel e não vê nada. Ninguém era avisado de que ela existia.
//   · LEAD (`contacts`)        — formulário público (Home / LeadDiagnostic). Não
//     tem login; o leitor foi aposentado no B6 e o lead só era consultável pelo
//     console do Firestore.
//
// Núcleo puro: normaliza as duas formas num FEED só, decide o que ainda está
// pendente e resume. Sem Firebase — o servidor injeta os documentos crus.
import { registrationSourceLabel } from './registrationSource';

// Estado da triagem. Ausente = pendente: a solicitação nasce sem carimbo, e é o
// admin que a resolve. NUNCA inferir "arquivado" de ausência.
export type RequestStatus = 'pending' | 'archived';

export type RequestKind = 'signup' | 'lead';

export interface CaptureRequest {
  id: string;              // uid (signup) ou doc id (lead)
  kind: RequestKind;
  name: string;
  email: string;
  phone: string;
  socialMedia: string;
  /** Só do lead: o texto que a pessoa escreveu, e se já foi afiliado antes. */
  presentation?: string;
  experienced?: boolean;
  /** Origem carimbada no boot (?src= / utm_source), ex.: 'vitrine-affiliacore'. */
  source: string | null;
  sourceLabel: string;
  status: RequestStatus;
  /** ISO — data do pedido. Null quando o doc antigo não tem carimbo. */
  createdAt: string | null;
}

// `users/{uid}` só é SOLICITAÇÃO enquanto não tem afiliado: é exatamente o estado
// que prende a pessoa no painel vazio. Admin nunca entra na lista (é a agência).
export function isPendingSignup(user: any): boolean {
  if (!user || user.role === 'admin') return false;
  return String(user.affiliateId ?? '').trim() === '';
}

export function resolveRequestStatus(v: unknown): RequestStatus {
  return String(v ?? '').trim().toLowerCase() === 'archived' ? 'archived' : 'pending';
}

// users/{uid} → solicitação. O `uid` é a chave: é por e-mail que o vínculo é
// feito depois (`/api/link-affiliate-user`), mas é o uid que identifica o doc.
export function signupToRequest(uid: string, user: any): CaptureRequest {
  const source = normSource(user?.source);
  return {
    id: String(uid),
    kind: 'signup',
    name: str(user?.name),
    email: str(user?.email),
    phone: str(user?.phone),
    socialMedia: str(user?.socialMedia),
    source,
    sourceLabel: registrationSourceLabel(source),
    status: resolveRequestStatus(user?.requestStatus),
    createdAt: toIso(user?.createdAt),
  };
}

// contacts/{id} → solicitação. Sem login: a resolução aqui é criar o afiliado e
// CONVIDAR (não há conta para vincular).
export function leadToRequest(id: string, lead: any): CaptureRequest {
  const source = normSource(lead?.source);
  return {
    id: String(id),
    kind: 'lead',
    name: str(lead?.name),
    email: str(lead?.email),
    phone: str(lead?.phone),
    socialMedia: str(lead?.socialMedia),
    presentation: str(lead?.presentation),
    experienced: lead?.affiliateExperience === 'sim',
    source,
    sourceLabel: registrationSourceLabel(source),
    status: resolveRequestStatus(lead?.requestStatus),
    createdAt: toIso(lead?.createdAt),
  };
}

// Feed único, mais recente primeiro. Sem data vai para o fim (dado antigo, de
// antes do carimbo) em vez de disputar o topo com o pedido de hoje.
export function buildCaptureFeed(requests: CaptureRequest[]): CaptureRequest[] {
  return [...(Array.isArray(requests) ? requests : [])].sort((a, b) => {
    const da = a?.createdAt ?? '';
    const db = b?.createdAt ?? '';
    if (da && db) return db.localeCompare(da);
    if (da) return -1;
    if (db) return 1;
    return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'pt-BR');
  });
}

export interface CaptureSummary {
  pending: number;
  signups: number;   // pendentes que JÁ têm login (dá p/ vincular na hora)
  leads: number;     // pendentes sem login (resolve por convite)
  archived: number;
  bySource: Array<{ source: string; label: string; count: number }>;
}

// Resumo da fila. `bySource` é o que mede o canal — é a pergunta que a vitrine
// existe para responder ("a AffiliaCore te manda afiliados").
export function summarizeCapture(requests: CaptureRequest[]): CaptureSummary {
  const list = Array.isArray(requests) ? requests : [];
  const pending = list.filter((r) => r?.status !== 'archived');
  const counts = new Map<string, { label: string; count: number }>();
  for (const r of pending) {
    const key = r?.source ?? '';
    const e = counts.get(key) ?? { label: r?.sourceLabel || 'Direto', count: 0 };
    e.count += 1;
    counts.set(key, e);
  }
  return {
    pending: pending.length,
    signups: pending.filter((r) => r.kind === 'signup').length,
    leads: pending.filter((r) => r.kind === 'lead').length,
    archived: list.length - pending.length,
    bySource: [...counts.entries()]
      .map(([source, e]) => ({ source, label: e.label, count: e.count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR')),
  };
}

const str = (v: unknown): string => String(v ?? '').trim();

const normSource = (v: unknown): string | null => str(v) || null;

// Timestamp do Admin SDK, Date, número ou string ISO → ISO. Nunca lança: data
// ilegível vira null (o feed sabe lidar) em vez de derrubar a listagem inteira.
function toIso(v: any): string | null {
  try {
    if (!v) return null;
    if (typeof v?.toDate === 'function') return v.toDate().toISOString();
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
    if (typeof v === 'number') return new Date(v).toISOString();
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}
