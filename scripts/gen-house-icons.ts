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
import { mkdirSync, writeFileSync, readdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOUSE_PRESETS, buildHouseIconSvg, buildHouseLogoSvg } from '../src/lib/housePresets';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/brands/presets');
// Logos OFICIAIS já normalizadas (PNG RGBA, moldura transparente cortada). Ficam
// fora de public/ de propósito: são material-fonte do gerador, que as embute no SVG
// — não precisam ser servidas soltas.
const logoDir = resolve(here, 'house-logos');
mkdirSync(outDir, { recursive: true });

const expected = new Set(HOUSE_PRESETS.map((p) => `${p.slug}.svg`));

// Remove órfãos: casa tirada do catálogo não pode deixar SVG solto pra trás.
for (const f of readdirSync(outDir)) {
  if (f.endsWith('.svg') && !expected.has(f)) {
    rmSync(resolve(outDir, f));
    console.log(`  - ${f} (removido: não está mais no catálogo)`);
  }
}

let oficiais = 0;
for (const preset of HOUSE_PRESETS) {
  let svg: string;
  let nota: string;
  if (preset.officialIcon) {
    const png = resolve(logoDir, `${preset.slug}.png`);
    // Falha alto: `officialIcon` declarado sem a arte é erro de catálogo, não algo
    // pra degradar em silêncio p/ o monograma (ninguém perceberia).
    if (!existsSync(png)) {
      throw new Error(`${preset.slug}: officialIcon '${preset.officialIcon}' declarado, mas falta scripts/house-logos/${preset.slug}.png`);
    }
    svg = buildHouseLogoSvg(preset, readFileSync(png).toString('base64'));
    nota = `logo oficial (${preset.officialIcon})`;
    oficiais++;
  } else {
    svg = buildHouseIconSvg(preset);
    nota = `autoral "${preset.monogram}" ${preset.color}`;
  }
  writeFileSync(resolve(outDir, `${preset.slug}.svg`), `${svg}\n`, 'utf8');
  console.log(`  ✓ ${preset.slug.padEnd(18)} ${nota}`);
}

console.log(
  `\n${HOUSE_PRESETS.length} ícones em public/brands/presets/ — ` +
  `${oficiais} com logo oficial, ${HOUSE_PRESETS.length - oficiais} autorais.`
);
