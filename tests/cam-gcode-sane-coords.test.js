// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM invariant: vygenerovaný program nemá nesmyslné souřadnice ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Reálný nález uživatele 27. 8. 2026 (upichovák, Úhel zanoření = Auto = 90°):
//
//   ; Průchod 17 (oblouk G3)
//   N1150 G0 X486708894.740
//
// Kotva rampy `stockEntryRamp` se krokovala po Δz a násobila `tan(úhel)`.
// Při 90° je tan(90°) = 1,6e16, takže „krok 0,5 mm v Z" znamenal skok
// 8e15 mm v X — a přesně to se vydalo do NC programu. Sada byla přitom celá
// zelená: žádný test se nedíval na to, jestli jsou čísla vůbec z tohoto
// světa (kolize se počítají v materiálu, a 486 tisíc kilometrů nad dílem
// žádná kolize není).
//
// Invariant je proto plošný a hloupý: každé X/Z/CR v každé fixture musí být
// v rozsahu, který existuje na skutečném stroji.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');
const fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort();

// Největší karusel má pojezd v jednotkách metrů; 10 m je s rezervou strop.
const MAX_MM = 10000;

describe('CAM: souřadnice v G-kódu jsou z tohoto světa', () => {
  fixtures.forEach(file => {
    it(`${file} → žádné |X|/|Z|/CR nad ${MAX_MM} mm`, async () => {
      const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
      const { gcode } = await runCamProg(prog);
      const bad = [];
      gcode.split('\n').forEach((line, i) => {
        if (line.trim().startsWith(';')) return;
        for (const m of line.matchAll(/(?:^|\s)(?:X|Z|CR=)(-?\d+(?:\.\d+)?)/g)) {
          if (Math.abs(parseFloat(m[1])) > MAX_MM) bad.push(`ř.${i + 1}: ${line.trim()}`);
        }
      });
      expect(bad.slice(0, 5)).toEqual([]);
    }, 120000);
  });
});
