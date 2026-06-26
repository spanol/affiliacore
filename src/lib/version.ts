// Controle de versão do app (núcleo PURO, sem Firebase). A versão do bundle é
// carimbada no build (scripts/gen-version.mjs -> public/version.json) e injetada via
// Vite `define` (__APP_VERSION__). O servidor publica a MESMA versão em app_meta/version
// (Firestore) no boot de cada deploy; o cliente compara as duas e oferece o refresh.
//
// `typeof __APP_VERSION__` (e não o uso direto): em vitest/SSR/node o define NÃO roda,
// então o identificador não existe em runtime — `typeof` num identificador inexistente
// devolve 'undefined' sem lançar. No build o Vite substitui o texto pela string literal.

export const LOCAL_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const LOCAL_BUILD_TIME: string =
  typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
export const LOCAL_COMMIT: string =
  typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : '';

export interface AppVersion {
  version: string;
  buildTime?: string;
  commit?: string;
}

// O bundle está desatualizado quando a versão publicada (Firestore, escrita pelo
// servidor no boot do deploy) difere da deste bundle. QUALQUER diferença = desatualizado:
// o servidor só publica a ÚLTIMA versão deployada, então `remote !== local` significa
// "este client carregou um bundle mais velho". Guards (sem banner falso):
//   • remote vazio/ausente -> ainda não publicado / sem doc -> não alerta;
//   • local 'dev' ou vazio -> rodando sem build (dev/test) -> não alerta.
export function isOutdated(local: string, remote: string | null | undefined): boolean {
  if (!remote) return false;
  if (!local || local === 'dev') return false;
  return remote !== local;
}

// Monta o doc publicado no Firestore (sem o updatedAt — adicionado no write com
// serverTimestamp). Normaliza campos opcionais ausentes p/ string vazia.
export function buildVersionPayload(info: AppVersion): AppVersion {
  return {
    version: info.version,
    buildTime: info.buildTime || '',
    commit: info.commit || '',
  };
}

// Recarrega o app p/ baixar o bundle novo. O server serve o index.html com `no-store`
// (server.ts), então o reload busca o index novo -> assets com hash novo -> bundle novo.
export function reloadApp(): void {
  if (typeof window !== 'undefined') window.location.reload();
}
