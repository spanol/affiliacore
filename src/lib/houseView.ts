// Projeção da CASA por papel — o que o servidor pode entregar de `houses` a quem
// NÃO é admin. Espelho exato do `sanitizeDealForViewer` (dealType.ts): os campos
// saem REMOVIDOS, nunca zerados — `defaultCpa: 0` seria lido como "taxa
// configurada em R$ 0", e ausência ≠ R$0 é invariante do repo.
//
// POR QUE EXISTE (caça de bugs 26/08/2026, 2 achados ALTA confirmados): o
// `GET /api/houses` é `requireAuth` porque o afiliado precisa de logos, frescor e
// ISS — mas respondia a projeção COMPLETA. Qualquer logado lia `defaultCpa`/
// `defaultRev` (quanto a casa paga à AGÊNCIA: a ponta de receita do lucro
// líquido) e, desde 24/08, a fila `pendingTags` com o dinheiro da produção sem
// dono. Com o CPA do próprio contrato em mãos, a margem da agência sai por
// subtração — exatamente o que "lucro/margem só no /admin do master" proíbe.

/**
 * Campos de GESTÃO da casa: existem para o admin operar (taxa casa→agência,
 * câmbio, conector, fila de tags) e nunca para o afiliado ler.
 */
export const HOUSE_ADMIN_ONLY_FIELDS = [
  'defaultCpa',
  'defaultRev',
  'fxMode',
  'fxRate',
  'revInProfit',
  'pendingTags',
  'pendingTagsAt',
  'integration',
  'integrationExternalId',
  'pullAvailable',
] as const;

/** Admin recebe o objeto intacto; qualquer outro papel recebe SEM os campos de gestão. */
export function sanitizeHouseForViewer<T extends Record<string, unknown>>(
  house: T,
  role: string | null | undefined,
): T {
  if (role === 'admin') return house;
  const out: Record<string, unknown> = { ...house };
  for (const field of HOUSE_ADMIN_ONLY_FIELDS) delete out[field];
  return out as T;
}

export function sanitizeHousesForViewer<T extends Record<string, unknown>>(
  houses: T[] | null | undefined,
  role: string | null | undefined,
): T[] {
  return (Array.isArray(houses) ? houses : []).map((h) => sanitizeHouseForViewer(h, role));
}
