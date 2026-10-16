// Hlídač velikosti souborů (pokyn uživatele 12. 10. 2026, viz CLAUDE.md
// „ZÁKAZ DALŠÍHO RŮSTU OBŘÍCH SOUBORŮ").
//
// 1) Obří soubory z BUDGET nesmí narůst o víc než SLACK řádků oproti stavu
//    k 12. 10. 2026. Nový kód patří do NOVÉHO souboru (~300–500 ř.).
// 2) Žádný jiný soubor v js/ (mimo js/lib/) nesmí přesáhnout NEW_FILE_MAX řádků.
//
// Když soubor ZMENŠÍŠ (rozdělení), SNIŽ i jeho strop níž — jinak by se do něj
// mohlo zase nenápadně dopsat. Strop ZVYŠOVAT nelze bez dohody s uživatelem.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'js');
const SLACK = 15;
const NEW_FILE_MAX = 1500;

// řádky k 12. 10. 2026
const BUDGET = {
  'calculators/camSimulator.js': 5431,   // rozdělování (docs/plan-rozdeleni-cam-simulatoru.md) — po každém kroku snížit
  'ui.js': 2797,   // rozdělování (docs/plan-refaktoringu-ui.md) — po každém kroku snížit
  'render.js': 3115,
  'calculators/cam/ops/roughLong.js': 3119,
  'calculators/cncEditor.js': 2918,
  'geometry.js': 74,   // rozcestník (rozděleno 16. 10. do js/geometry/) — kód sem nepřidávat
  'calculators/vkContour.js': 2347,
  'storage/fileIO.js': 1988,
  'calculators/camEditor.js': 1897,
  'events.js': 1762,
  'calculators/cam/gcodeEmit.js': 1290,
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'lib') walk(p, out); }
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
const lines = (p) => readFileSync(p, 'utf8').split('\n').length - 1;

const files = walk(ROOT).map(p => ({ rel: relative(ROOT, p).replace(/\\/g, '/'), n: lines(p) }));

describe('velikost souborů js/', () => {
  for (const [rel, max] of Object.entries(BUDGET)) {
    it(`${rel} nenarostl nad ${max}+${SLACK} ř.`, () => {
      const f = files.find(x => x.rel === rel);
      expect(f, `soubor ${rel} už neexistuje — odstraň ho z BUDGET`).toBeTruthy();
      expect(f.n, `${rel} má ${f.n} ř. (strop ${max + SLACK}). Nový kód dej do nového souboru.`)
        .toBeLessThanOrEqual(max + SLACK);
    });
  }

  it(`žádný jiný soubor nemá přes ${NEW_FILE_MAX} ř.`, () => {
    const big = files.filter(f => !(f.rel in BUDGET) && f.n > NEW_FILE_MAX)
      .map(f => `${f.rel} (${f.n})`);
    expect(big, 'rozděl do menších souborů (~300–500 ř.)').toEqual([]);
  });
});
