import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin, type ResolvedConfig} from 'vite';
import {resolveBrand} from './src/lib/branding';
import {applyBrandToHtml, resolveBrandMeta} from './src/lib/brandHtml';

// Versão deste build, gerada por scripts/gen-version.mjs (hook prebuild/predev) em
// public/version.json. Injetada no bundle via `define` p/ o cliente saber a própria
// versão e compará-la com a publicada no Firestore (banner de atualização). Ausente
// (ex.: build sem o prebuild) -> 'dev', que desliga o banner.
function readBuildVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, 'public/version.json'), 'utf8'));
  } catch {
    return {version: 'dev', buildTime: '', commit: ''};
  }
}

// P4.1 (marca por instância) no HTML SERVIDO. O index.html é o mesmo p/ todas as
// instâncias e traz os defaults do PRODUTO; o applyBrandToDocument só troca o título
// depois que o JS roda, e rastreador de link (WhatsApp, Telegram, Google) NÃO roda JS
// — o convite que o gerente da Infinity mandou aos afiliados aparecia como
// "AffiliaCore" no card de preview (19/08/2026). Aqui o nome/favicon/OG entram no
// HTML em build time, quando os VITE_BRAND_* da instância já estão resolvidos
// (config.env é exatamente o que vira import.meta.env). Vale no dev também: o Vite
// roda transformIndexHtml no middleware.
function brandHtmlPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'affiliacore:brand-html',
    configResolved(resolved) {
      config = resolved;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html: string) {
        const env = (config?.env ?? {}) as Record<string, unknown>;
        const brand = resolveBrand(env, config?.base ?? '/');
        return applyBrandToHtml(html, brand, resolveBrandMeta(env, brand));
      },
    },
  };
}

export default defineConfig(() => {
  const v = readBuildVersion();
  return {
    define: {
      __APP_VERSION__: JSON.stringify(v.version || 'dev'),
      __BUILD_TIME__: JSON.stringify(v.buildTime || ''),
      __BUILD_COMMIT__: JSON.stringify(v.commit || ''),
      // P4 (produtização): o App Hosting injeta FIREBASE_WEBAPP_CONFIG (JSON do web
      // app do PROJETO do backend) no build — repassada ao bundle p/ cada instância
      // apontar pro próprio Firebase (mesmo repo, sem fork). Vazia em dev/AI Studio
      // → src/lib/firebase.ts cai no firebase-applet-config.json commitado.
      // NÃO é segredo (config web do Firebase é pública por natureza).
      __FIREBASE_WEBAPP_CONFIG__: JSON.stringify(process.env.FIREBASE_WEBAPP_CONFIG || ''),
    },
    plugins: [react(), tailwindcss(), brandHtmlPlugin()],
    // SECURITY (MEDIUM-3): NÃO inlinar GEMINI_API_KEY (nem qualquer segredo) no
    // bundle via `define` — o Vite substituiria `process.env.GEMINI_API_KEY` pelo
    // valor real, vazando a chave a todos os navegadores assim que houvesse uma
    // referência. Qualquer chamada ao Gemini deve viver no backend (server.ts),
    // lendo process.env em runtime e exposta via endpoint autenticado.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Permite abrir a instância dev por domínios do Tailscale durante demos
      // privadas sem depender só de localhost.
      allowedHosts: ['spanol-1.tail82f788.ts.net'],
      watch: {
        // Reference PDFs (design assets) can be locked open in a viewer; a locked
        // file makes the FS watcher throw EBUSY and crash the dev server. They are
        // never imported, so exclude them from watching entirely.
        ignored: ['**/*.pdf'],
      },
    },
  };
});
