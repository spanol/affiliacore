// Materializa os ícones dos presets de casas em public/brands/presets/<slug>.svg.
//
// O catálogo (src/lib/housePresets.ts) é a fonte ÚNICA de verdade — este script só
// grava em disco o que `buildHouseIconSvg` já gera. Rode depois de mexer em cor,
// monograma ou lista de casas:
//
//   npm run icons:casas
//
// O teste `src/lib/housePresets.test.ts` falha se os arquivos saírem de sincronia
// com o catálogo, então esquecer de rodar isto não passa batido no CI.
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOUSE_PRESETS, buildHouseIconSvg } from '../src/lib/housePresets';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/brands/presets');
mkdirSync(outDir, { recursive: true });

const expected = new Set(HOUSE_PRESETS.map((p) => `${p.slug}.svg`));

// Remove órfãos: casa tirada do catálogo não pode deixar SVG solto pra trás.
for (const f of readdirSync(outDir)) {
  if (f.endsWith('.svg') && !expected.has(f)) {
    rmSync(resolve(outDir, f));
    console.log(`  - ${f} (removido: não está mais no catálogo)`);
  }
}

for (const preset of HOUSE_PRESETS) {
  writeFileSync(resolve(outDir, `${preset.slug}.svg`), `${buildHouseIconSvg(preset)}\n`, 'utf8');
  console.log(`  ✓ ${preset.slug}.svg  ${preset.color}  "${preset.monogram}"`);
}

console.log(`\n${HOUSE_PRESETS.length} ícones gravados em public/brands/presets/`);
