// P4 (produtização): config web do Firebase POR INSTÂNCIA. O mesmo repo serve N
// clientes, então o firebase-applet-config.json commitado (projeto do Carlos,
// agencia-boost-app) é só o FALLBACK. No App Hosting, o buildpack injeta a env
// FIREBASE_WEBAPP_CONFIG (JSON do web app do PRÓPRIO projeto do backend) — o
// vite.config a repassa via define (__FIREBASE_WEBAPP_CONFIG__) e cada instância
// builda apontando pro próprio Firebase, sem fork nem editar o JSON do repo.
// PURO/testável — quem inicializa o app é src/lib/firebase.ts.
export function resolveFirebaseConfig<T extends Record<string, unknown>>(
  raw: string | undefined | null,
  fallback: T,
): T {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return fallback;
  try {
    const parsed = JSON.parse(s);
    // Sanidade mínima: objeto com projectId string — senão é lixo/env quebrada.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.projectId === 'string' && parsed.projectId) {
      return parsed as T;
    }
  } catch {
    // JSON inválido → fallback (build local/AI Studio sem a env não pode quebrar)
  }
  return fallback;
}

// Bucket DEFAULT do Storage da instância (logos das casas, server.ts). Mesma
// filosofia acima: nenhum projeto cravado — o antigo default 'agencia-boost-app'
// faria uma instância nova sem env gravar a logo no bucket de OUTRO cliente.
// Ordem: override explícito (FIREBASE_STORAGE_BUCKET) → configs injetadas pelo
// App Hosting (FIREBASE_WEBAPP_CONFIG / FIREBASE_CONFIG, com derivação
// `<projectId>.firebasestorage.app` quando só há o projectId) → project_id da
// service account → null. Null NÃO é erro: instância sem Storage funciona — o
// uploadHouseLogo grava logo pequena como data URL direto no doc da casa.
export function resolveStorageBucket(env: Record<string, string | undefined>): string | null {
  const explicit = String(env.FIREBASE_STORAGE_BUCKET ?? '').trim();
  if (explicit) return explicit;

  for (const key of ['FIREBASE_WEBAPP_CONFIG', 'FIREBASE_CONFIG']) {
    const raw = String(env[key] ?? '').trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const bucket = typeof parsed?.storageBucket === 'string' ? parsed.storageBucket.trim() : '';
      if (bucket) return bucket;
      const projectId = typeof parsed?.projectId === 'string' ? parsed.projectId.trim() : '';
      if (projectId) return `${projectId}.firebasestorage.app`;
    } catch {
      // env quebrada → tenta a próxima fonte
    }
  }

  // Placeholder tipo 'unused' (instância white-label) não parseia → segue null.
  const sa = String(env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '').trim();
  if (sa) {
    try {
      const projectId = JSON.parse(sa)?.project_id;
      if (typeof projectId === 'string' && projectId.trim()) return `${projectId.trim()}.firebasestorage.app`;
    } catch {
      // sem project_id derivável
    }
  }
  return null;
}
