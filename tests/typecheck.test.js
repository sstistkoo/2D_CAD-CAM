// Typová kontrola (TypeScript nad JSDoc) jako součást test:cad — stejně jako
// lint.test.js. Rozsah, baseline a proč: scripts/typecheck.mjs.
// Nová chyba v js/calculators/cam/**, js/geom/**, js/geometry/** test shodí;
// staré (scripts/typecheck-baseline.json) smí jen ubývat.
import { describe, it, expect } from 'vitest';
import { runTsc, compare } from '../scripts/typecheck.mjs';

describe('typová kontrola (npm run typecheck)', () => {
  it('výpočetní jádro nemá nové typové chyby', () => {
    const { grown, stale } = compare(runTsc());
    expect([...grown, ...stale.map((s) => `${s}: v baseline, ale neexistuje → npm run typecheck -- --update`)],
      'Nové typové chyby (oprav JSDoc nebo kód; baseline se nezvyšuje):').toEqual([]);
  }, 180_000);

  it('baseline hlídá: soubor s víc chybami, než je povoleno, neprojde', () => {
    const errs = [{ file: 'js/geom/x.js', line: 1, col: 1, code: 'TS2339', msg: 'm' }, { file: 'js/geom/x.js', line: 2, col: 1, code: 'TS2339', msg: 'm' }];
    expect(compare(errs, { 'js/geom/x.js': 2 }).grown).toEqual([]);
    expect(compare(errs, { 'js/geom/x.js': 1 }).grown).toHaveLength(1);
    expect(compare(errs, {}).grown).toHaveLength(1);
  });
});
