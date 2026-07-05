// Lógica PURA de segurança/escopo do servidor, extraída do server.ts para ficar
// testável sem subir o Express/Firebase Admin. O server.ts importa e usa estas
// funções nas rotas; os testes exercitam as regras de IDOR/escopo isoladamente.
// [[REVIEW-TEST-PLAN §5 P0.5]]

export interface SpecialAffiliateData {
  active?: boolean;
  subAffiliateIds?: unknown[];
}

// Fonte ÚNICA da definição de "afiliado especial ativo". Antes o server.ts decidia
// de 3 jeitos divergentes: `active === true` (aceite de convite / proxy), `active
// !== false` (vincular login) e `!special?.active` (cap). Doc sem o campo `active`
// caía em resultados diferentes (R7). Regra canônica, fail-closed: só é especial
// quando `active === true`. [[boost-special-flag-desync]]
export function resolveIsSpecial(data?: SpecialAffiliateData | null): boolean {
  return data?.active === true;
}

// Data "de hoje" no fuso informado (default America/Sao_Paulo), independente do
// fuso do processo. O servidor roda em UTC (Cloud Run); usar `new Date().toISOString()`
// cortava o dia errado entre 21h e 23:59 BR — o ranking do dia era gravado/lido com
// a data de amanhã e a tela mostrava "ainda não calculado" (R12). `en-CA` formata
// como YYYY-MM-DD.
export function resolveServerToday(now: Date = new Date(), timeZone = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// "Ontem" no fuso BR — o último dia FECHADO. A OTG só finaliza os resultados de um dia
// no dia seguinte (hoje quase sempre vem vazio às 14h30), então o ranking diário é
// gerado/exibido para ontem. Deriva de resolveServerToday e subtrai 1 dia via UTC
// (calendário puro, sem depender do fuso do processo). Determinístico dado `now`.
export function resolveServerYesterday(now: Date = new Date(), timeZone = 'America/Sao_Paulo'): string {
  const today = resolveServerToday(now, timeZone);
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface ScopeInput {
  role?: string | null;
  endpoint: string;
  // `:id` no path do proxy externo. Presença proíbe o não-admin (ele não pode pedir
  // o desempenho de um id específico via path).
  id?: string | null;
  ownAffiliateId?: string | null;
  special?: SpecialAffiliateData | null;
  // valor cru de `req.query.affiliateIds` (CSV string, array, ou ausente).
  requestedAffiliateIds?: string | string[] | null;
}

// `scoped: null` → admin: passa sem filtrar. `scoped: string[]` → não-admin: força
// estes affiliateIds. `denied` presente → acesso negado (o chamador retorna o 403).
// Shape de campos opcionais (não union discriminado) p/ não depender de narrowing
// estrito no consumidor (server.ts).
export interface ScopeResult {
  scoped: string[] | null;
  denied?: { status: 403; error: string };
}

function deny(error: string): ScopeResult {
  return { scoped: null, denied: { status: 403, error } };
}

// Resolve o conjunto de affiliateIds que o chamador pode consultar no proxy externo.
// É a barreira contra IDOR: um afiliado comum só lê o próprio id; um especial lê a
// própria sub-rede; admin não é filtrado; qualquer id pedido fora do escopo é
// descartado (interseção vazia → 403). Espelha exatamente o server.ts. [[R4]]
export function resolveScopedAffiliateIds(input: ScopeInput): ScopeResult {
  if (input.role === 'admin') return { scoped: null };

  // Não-admin só pode o endpoint `results`, nunca outro endpoint nem um `:id` no path.
  if (input.endpoint !== 'results' || input.id) {
    return deny('Acesso restrito ao seu próprio desempenho.');
  }

  const ownId = input.ownAffiliateId ? String(input.ownAffiliateId) : '';
  if (!ownId) {
    return deny('Sua conta não está vinculada a um afiliado.');
  }

  // Especial ativo amplia o escopo para a própria sub-rede (own + subs vinculados).
  let allowedIds = [ownId];
  if (resolveIsSpecial(input.special) && Array.isArray(input.special?.subAffiliateIds)) {
    allowedIds = [ownId, ...input.special!.subAffiliateIds!.map((s) => String(s))];
  }

  const requestedRaw = input.requestedAffiliateIds;
  const requested = (Array.isArray(requestedRaw) ? requestedRaw.join(',') : String(requestedRaw || ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Sem pedido explícito → todo o escopo permitido. Com pedido → só o que está no
  // escopo (descarta ids de fora, impedindo o afiliado de ler dados alheios).
  const scoped = requested.length ? requested.filter((idr) => allowedIds.includes(idr)) : allowedIds;
  if (scoped.length === 0) {
    return deny('Acesso restrito à sua sub-rede.');
  }
  return { scoped };
}
