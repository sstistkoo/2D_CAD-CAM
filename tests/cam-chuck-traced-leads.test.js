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
