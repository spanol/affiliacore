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
