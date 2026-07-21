// Núcleo PURO do jurídico versionado (Acordo de Afiliação, Código de Conduta,
// Pagamentos — convergente Affility+NovaEra). SEM Firebase. Modo SOFT nesta entrega:
// mecanismo de versionamento + aceite, mas NADA bloqueia login/uso — o conteúdo é
// escrito pelo admin (não seedado automaticamente) e deve passar por revisão
// jurídica antes de ser tratado como vinculante. Ver PLANO-INTEGRACAO-AFFILITY.md.

export interface LegalDocument {
  id: string;
  slug: string;
  title: string;
  content: string;   // texto puro (sem HTML/markdown — renderizado com whitespace-pre-wrap)
  version: number;
  active: boolean;
  updatedAt?: any;
}

export interface LegalAcceptance {
  uid: string;
  slug: string;
  version: number;
  acceptedAt?: any;
}

// Valida entrada de criação/edição. slug é o identificador ESTÁVEL do documento
// (não muda entre versões — é o que liga um aceite antigo ao doc atual). Não lança.
export function normalizeLegalDocInput(raw: any): { doc?: { slug: string; title: string; content: string; active: boolean }; error?: string } {
  const slug = String(raw?.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!slug) return { error: 'slug é obrigatório (identificador estável do documento).' };
  const title = String(raw?.title ?? '').trim();
  if (!title) return { error: 'Título é obrigatório.' };
  const content = String(raw?.content ?? '').trim();
  if (!content) return { error: 'Conteúdo é obrigatório.' };
  return { doc: { slug, title, content, active: raw?.active !== false } };
}

// A VERSÃO é derivada, nunca digitada pelo admin — evita esquecer de bumpar ao
// editar o texto (o que deixaria aceites antigos parecendo válidos p/ um texto
// novo). Documento novo → versão 1. Conteúdo mudou → +1. Só título/active mudarem
// (sem tocar o texto) → mantém a versão (não invalida aceites à toa).
export function computeNextVersion(before: { content?: string; version?: number } | null | undefined, nextContent: string): number {
  if (!before) return 1;
  const prevVersion = Number.isFinite(Number(before.version)) && Number(before.version) > 0 ? Number(before.version) : 1;
  return before.content === nextContent ? prevVersion : prevVersion + 1;
}

// O aceite só vale para a versão EXATA que foi aceita — se o admin editou o texto
// depois, o aceite antigo fica obsoleto (o afiliado precisa aceitar de novo).
export function hasAcceptedLatest(acceptance: LegalAcceptance | null | undefined, doc: Pick<LegalDocument, 'version'> | null | undefined): boolean {
  if (!acceptance || !doc) return false;
  return acceptance.version === doc.version;
}
