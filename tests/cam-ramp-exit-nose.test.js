// RAMPA, KTERÁ VYJÍŽDÍ Z POLOTOVARU DO PRÁZDNA, končí až za NOSEM (pravidla 4 a 9).
//
// Nález uživatele 31. 10. 2026 (díl `polygon-ramp-exit-nose.camprog` = jeho
// projekt, „Po úsecích" úsek 2, SNMG R 0,8, zanoření 15°): uzavírací rampa
// `G1 X36.697 Z107.555 ; Rampa 15.0°` u bodu polotovaru S14 skončila, jakmile
// z offsetové čáry vyjel STŘED nosu. Přední spodní oblouk nosu materiálu ještě
// dosahoval → u strmého čela zůstal srpek po rádiusu (0,075 mm × 0,2 mm,
// Z 107,3–107,5). *„Zbytky po rádiusu jsou tam, kde materiál vyjíždí do
// prázdného prostoru."* Oprava: `findRampOutTarget` (ops/long/entryRamp.js)
// pustí rampu dál, dokud z offsetové čáry nevyjede celý ten oblouk.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { topXOnLoop } from '../js/calculators/cam/camMath.js';

const FILE = join(__dirname, 'fixtures', 'cam-cases', 'polygon-ramp-exit-nose.camprog');

describe('rampa do prázdna nenechá srpek po rádiusu nosu', () => {
  it('úsek 2 u S14: nad prodloužením rampy nezůstane nic', async () => {
    const r = await runCamProg(JSON.parse(readFileSync(FILE, 'utf8')));
    const lines = r.gcode.split('\n');
    const ramp = lines.find(l => /X36\.\d+ Z107\.\d+ ; Rampa/.test(l));
    expect(ramp, 'uzavírací rampa u S14 chybí').toBeTruthy();
    const end = { x: +/X(-?[\d.]+)/.exec(ramp)[1], z: +/Z(-?[\d.]+)/.exec(ramp)[1] };
    // Rampa sjíždí z X 37,230 Z 109,545 — spodek nosu (R 0,8) leží na přímce.
    const tan = (37.23 - end.x) / (109.545 - end.z);
    const line = (z) => end.x - 0.8 - (end.z - z) * tan;

    const sp = r.calcSim.simPath, fin = lines.findIndex(l => l.includes('DOKONCOVANI'));
    const rm = new MaterialRemoval(r.params, r.calcSim.stockPathSegments, { planningOutline: true });
    rm.advanceTo(sp, sp.findIndex(p => p.originalLineIdx > fin) - 1);
    const top = (z) => {
      let t = null;
      for (const l of rm.model.loops) { const v = topXOnLoop(l, z); if (v !== null && (t === null || v > t)) t = v; }
      return t;
    };
    let worst = 0, at = null;
    for (let z = 107.2; z <= 107.8 + 1e-9; z += 0.025) {
      const t = top(z);
      if (t !== null && t - line(z) > worst) { worst = t - line(z); at = z; }
    }
    // Před opravou 0,075 mm u Z 107,4.
    expect(worst, `srpek ${worst.toFixed(3)} mm @Z${at?.toFixed(3)}`).toBeLessThan(0.02);
  }, 120000);
});
