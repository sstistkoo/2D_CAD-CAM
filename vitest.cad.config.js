import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

// „npm run test:cad" – stejná sada jako `npm test`, jen BEZ testů CAM
// pipeline (hrubování/kolize/materiál/držáky/destičky). Ty pouští celý
// .camprog přes camHeadless a jsou pomalé i irelevantní, když se nesahá na
// `js/calculators/cam/**` (viz CLAUDE.md „Bezpečnostní testy podle DŮKAZU,
// ne preventivně" a `scripts/cam_fingerprint.mjs`). `npm test` zůstává beze
// změny – kompletní sada, jak se pouští před PR/push.
//
// Seznam vzorů drž v souladu se skutečným obsahem `tests/` (zkontrolováno
// podle importů, ne jen podle jména souboru – např. `boolean.test.js“ bez
// pomlčky je CAD nástroj Boolean, ne CAM hrubování, a zůstává v sadě).
export default mergeConfig(baseConfig, defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      'tests/cam-*.test.js',
      'tests/boolean-*.test.js',
      'tests/collision-validator.test.js',
      'tests/material-removal.test.js',
      'tests/holder-*.test.js',
      'tests/insert-forbidden-region.test.js',
      'tests/range-entry-ramp.test.js',
      'tests/tool-envelope.test.js',
      'tests/offset-anisotropic.test.js',
      'tests/buildMachinableContour.test.js',
    ],
  },
}));
