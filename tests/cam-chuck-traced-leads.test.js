// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – čelisti/koník: ořez platí i pro nájezd a dojezd         ║
// ║  po kontuře                                                    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Ořez Z-limity (calculatePipeline.js) zkracoval jen TĚLO podélného průchodu.
// Díl uživatele 12. 10. 2026 s čelistmi na Z10: dojezd „bez schodků" jel po
// válci až na `G1 Z-4.955` (polygon, 69 mm² za čelistmi) a kulatá měla celý
// průchod „kapsa po kontuře" za nimi — ořez ho obrátil naruby (zStart < zEnd)
// a nájezd po kontuře projel čelistmi (`G1 X30.200 Z-4.225`, `X28 Z-6.425`).
// Mez dnes platí pro programovaný bod (střed nosu), takže se měří ten.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { polyArea, polyDifference, polyIntersect } from '../js/geom/geomCore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures', 'cam-cases', 'round-r10-face-small-fillet.camprog');
const CHUCK = 10;

describe('čelisti: žádný řezný pohyb za ně', () => {
  for (const [shape, R] of [['round', 10], ['polygon', 0.8]]) {
    it(`podélně, ${shape} R ${R}, čelisti Z ${CHUCK}`, async () => {
      const prog = JSON.parse(readFileSync(FIX, 'utf8'));
      Object.assign(prog.params, { roughingStrategy: 'longitudinal', toolShape: shape, toolRadius: R, doFinishing: true });
      prog.zLimits = { ...prog.zLimits, chuck: CHUCK, chuckActive: true };
      const r = await runCamProg(prog);
      const lines = r.gcode.split('\n');
      const bad = r.calcSim.simPath
        .filter(p => p.type !== 'G0' && p.z < CHUCK - 0.05)
        .map(p => (lines[p.originalLineIdx] || '').trim());
      expect(bad).toEqual([]);
    }, 180000);
  }
});

// Čelisti platí pro OBRYS DESTIČKY, ne pro programovaný bod (uživatel
// 12. 10. 2026: „ať nehrozí, že ve skutečnosti do něčeho vjede plátek").
// Dřív střed končil přesně na čelistech a kulatá R 10 odebrala 30 mm² za nimi
// (břit až do Z 1,35 při čelistech Z 10), polygon 3,6 mm².
describe('čelisti: za ně nesáhne žádná část plátku', () => {
  for (const [shape, R] of [['round', 10], ['polygon', 0.8]]) {
    for (const strategy of ['longitudinal', 'face']) {
      it(`${strategy}, ${shape} R ${R}`, async () => {
        const prog = JSON.parse(readFileSync(FIX, 'utf8'));
        Object.assign(prog.params, { roughingStrategy: strategy, toolShape: shape, toolRadius: R, doFinishing: true });
        prog.zLimits = { ...prog.zLimits, chuck: CHUCK, chuckActive: true };
        const r = await runCamProg(prog);
        const rm = new MaterialRemoval(r.params, r.calcSim.stockPathSegments, {});
        const base = rm.model.loops.map(l => l.slice());
        rm.advanceTo(r.calcSim.simPath, r.calcSim.simPath.length - 1);
        const box = [{ x: -1, z: -1e3 }, { x: 1e3, z: -1e3 }, { x: 1e3, z: CHUCK - 0.05 }, { x: -1, z: CHUCK - 0.05 }];
        const behind = Math.abs(polyArea(polyIntersect(polyDifference(base, rm.model.loops), [box])));
        expect(behind).toBeLessThan(0.05);
      }, 180000);
    }
  }
});
