// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – rozsah X s kulatou: meze platí pro BŘIT, ne střed nosu  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dráha je dráha STŘEDU nosu, kulatá ale řeže o R (`noseLiftX`) níž a dál.
// Meze rozsahu X (📐) se porovnávaly se středem, takže R 10 (díl uživatele
// 12. 10. 2026) s X min 15 hrubovala i dokončovala až na X 4–5 a s X max 22
// (pravidlo 12) sáhla do stěny nad stropem až na X 24,9. Měří se plocha,
// kterou program (hrubování + dokončování) odebere za mezí, na modelu úběru.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { polyArea, polyDifference, polyIntersect } from '../js/geom/geomCore.js';
import { XMAX_WALL_TOL } from '../js/calculators/cam/rangeX.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures', 'cam-cases', 'round-r10-face-small-fillet.camprog');

/** Plocha odebraná v pásu X ∈ [x0, x1] za celý program [mm²]. */
async function removedIn(strategy, xLimits, x0, x1) {
  const prog = JSON.parse(readFileSync(FIX, 'utf8'));
  prog.params.roughingStrategy = strategy;
  prog.params.doFinishing = true;
  prog.xLimits = { rangeXMin: null, rangeXMax: null, minActive: false, maxActive: false, active: true, ...xLimits };
  const r = await runCamProg(prog);
  const sp = r.calcSim.simPath;
  const rm = new MaterialRemoval(r.params, r.calcSim.stockPathSegments, {});
  const base = rm.model.loops.map(l => l.slice());
  rm.advanceTo(sp, sp.length - 1);
  const removed = polyDifference(base, rm.model.loops);
  const box = [{ x: x0, z: -1e3 }, { x: x1, z: -1e3 }, { x: x1, z: 1e3 }, { x: x0, z: 1e3 }];
  return Math.abs(polyArea(polyIntersect(removed, [box])));
}

describe('rozsah X s kulatou R 10 — za mez nesáhne ani nos', () => {
  for (const strategy of ['face', 'longitudinal']) {
    it(`${strategy}: X min 15 — pod X 15 se nic neodebere`, async () => {
      const a = await removedIn(strategy, { rangeXMin: 15, minActive: true }, 0.01, 15 - 0.05);
      expect(a).toBeLessThan(0.05);
    }, 180000);

    it(`${strategy}: X max 22 — materiálu nad stropem se nástroj nedotkne (pravidlo 12)`, async () => {
      const a = await removedIn(strategy, { rangeXMax: 22, maxActive: true }, 22 + XMAX_WALL_TOL, 100);
      expect(a).toBeLessThan(0.05);
    }, 180000);
  }
});
