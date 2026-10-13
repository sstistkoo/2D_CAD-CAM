// ESLint — hlídač chyb, které testy neodhalí, dokud se nekline na konkrétní
// tlačítko (hlavně „použitá proměnná neexistuje" při stěhování kódu mezi
// soubory, viz docs/plan-rozdeleni-cam-simulatoru.md).
//
// CHYBA (error) = vždy bug → `tests/lint.test.js` spadne (běží v test:cad).
// VAROVÁNÍ (warn) = styl / možná zbytečnost; stávající kód jich má stovky
// a hromadné přepisování by bylo riskantnější než užitečné. Vidět přes
// `npx eslint .` (bez --quiet); `npm run lint` ukazuje jen chyby.
import js from '@eslint/js';
import globals from 'globals';

const STYLE_WARNINGS = Object.fromEntries([
  'no-unused-vars', 'no-useless-assignment', 'no-redeclare', 'no-prototype-builtins',
  'no-useless-escape', 'no-empty', 'no-cond-assign', 'no-fallthrough', 'no-control-regex',
  'no-self-assign', 'no-extra-boolean-cast', 'no-constant-condition', 'no-case-declarations',
  'preserve-caught-error', 'no-constant-binary-expression',
].map(r => [r, 'warn']));

export default [
  // Cizí knihovny (minifikované, UMD) a pracovní kopie jiných nástrojů — nejsou naše.
  { ignores: ['js/lib/**', 'lib/**', 'node_modules/**', 'coverage/**', '.claude/**', '.kilo/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: STYLE_WARNINGS,
  },
  { files: ['sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  { files: ['scripts/**', 'tests/**', '*.config.js', '*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
