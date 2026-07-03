/// <reference types="vite/client" />
/// <reference types="react" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
  // add other env vars if you use them, e.g. VITE_API_URL
  readonly [key: string]: string | boolean | number | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injetados pelo Vite `define` no build (vite.config.ts), lidos de public/version.json
// (gerado por scripts/gen-version.mjs). Em ambientes sem o define (vitest/SSR/node) o
// identificador não existe em runtime — sempre acessar via `typeof` (ver src/lib/version.ts).
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __BUILD_COMMIT__: string;
// P4: JSON do web app do Firebase injetado pelo App Hosting (FIREBASE_WEBAPP_CONFIG)
// no build da instância; '' fora do App Hosting → fallback no JSON commitado.
declare const __FIREBASE_WEBAPP_CONFIG__: string;
