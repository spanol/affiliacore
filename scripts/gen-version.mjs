// Gera public/version.json com a versão DESTE build. Rodado por `predev`/`prebuild`
// (npm chama `pre<script>` automaticamente) — NUNCA por `start` (prod usa o arquivo
// que o build já produziu, p/ que server e bundle carreguem a MESMA versão).
//
// Fluxo do controle de versão:
//   build/dev  -> este script escreve public/version.json
//   vite.config.ts -> lê o JSON e injeta __APP_VERSION__ no bundle (define)
//   vite build -> copia public/version.json p/ dist/version.json
//   server.ts (boot) -> lê o version.json e publica em app_meta/version (Firestore)
//   client -> compara a versão remota com a do bundle e oferece o refresh
//
// A versão é um carimbo UTC monotônico (sobe a cada deploy) + commit (legibilidade).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', {
    cwd: root,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
} catch {
  // .git ausente (ex.: alguns buildpacks) — versão segue só pelo carimbo de tempo.
}

const d = new Date();
const p = (n) => String(n).padStart(2, '0');
// Carimbo UTC: YYYY.MM.DD-HHmmss. Monotônico (lexicográfico = cronológico) e legível.
// Segundos garantem unicidade mesmo em redeploys próximos.
const version = `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;

let pkgVersion = '';
try {
  pkgVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version || '';
} catch {
  /* sem package.json legível — opcional */
}

const payload = {
  version,
  buildTime: d.toISOString(),
  commit,
  pkgVersion,
};

const out = path.join(root, 'public', 'version.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');

console.log(`[gen-version] ${version} (commit ${commit || 'n/a'}) -> public/version.json`);
