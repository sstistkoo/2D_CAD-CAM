// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM invariant: vygenerovaný program NEJEZDÍ materiálem       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Proč zvlášť, když `collision-validator.test.js` už existuje: ten testuje
// VALIDÁTOR na ručně sestavených drahách (umí najít kolizi?). Tenhle testuje
// GENERÁTOR na reálných dílech (nevyrábí kolize?) — a to je něco jiného.
//
// Ta díra byla drahá. `validateToolpath` hlásí ⛔ „Rychloposuv materiálem"
// v aplikaci od 16. 7. 2026 a testuje u rychloposuvu jak destičku, TAK držák
// (collisionValidator.js, větev `block.type === 'G0'`). Emise se ale řídila
// pouze destičkou (`rapidHitsStock`), takže aplikace uměla kolizi NAJÍT, ale
// generátor ji neuměl OBEJÍT — a protože žádný test nepouštěl validátor na
// vygenerovaný G-kód napříč fixtures, sada zůstala 1285/1285 zelená i s
// kolizí 2× 135,3 mm² na `holder-region-roughing` (zavedl ji `e538e66`,
// nalezena až 13. 8. 2026).
//
// Invariant je proto úmyslně TVRDÝ a plošný: žádná fixture, žádná kolize.
// Když sem přibude fixture, která kolizi má z podstaty zadání (a ne kvůli
// dráze), patří do `EXPECTED` i s naměřeným číslem a důvodem — ne zvednutí
// společné meze.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');
const fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort();

// Fixtures s doloženou, zadáním danou kolizí: { soubor: 'proč' }.
// Prázdné = všechny díly jedou čistě. Nepřidávat sem nic, co jde spravit
// v generátoru — od toho je tenhle test.
const EXPECTED = {};

describe('generátor nevyrábí kolize (destička ani držák)', () => {
  it('nalezeny fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const file of fixtures) {
    it(`${file} → dráha nejede materiálem`, async () => {
      const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
      // POZOR: kolize se měří na `calcSim` — dráze naparsované ze skutečně
      // VYGENEROVANÉHO G-kódu (druhý průchod v runCamProg), ne na plánované
      // geometrii průchodů. Autoritativní je to, co stroj opravdu dostane.
      const { calcSim } = await runCamProg(prog);
      const issues = validateToolpath(
        calcSim.simPath, prog.params, calcSim.stockPathSegments,
        { backside: (prog.params || {}).roughingSide === 'left' },
      );
      const detail = issues.map(i =>
        `${i.kind} @X${(i.x * 2).toFixed(1)} Z${i.z.toFixed(1)} = ${i.area.toFixed(1)} mm² (řádek ${i.lineIdx})`,
      ).join('; ');
      if (EXPECTED[file]) {
        expect(issues.length, `${file}: ${EXPECTED[file]} — ${detail}`).toBeGreaterThan(0);
        return;
      }
      expect(issues.length, `${file}: ${detail}`).toBe(0);
    }, 120000);
  }
});
