// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – uzavírací rampa navazuje na konec předchozího zanoření  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díl uživatele 30. 9. 2026 (`projekt_2026-09-30.camprog`, „✂ Po úsecích",
// úsek 2 = Z 195,278 … 107,236; polygon, natočení 15°, ap 2,5, zprava).
// „Průchod 4" (X 39,23) sjel dojezdem po přímce zanoření z X 41,617 Z 123,986
// až na X 39,23 Z 115,074 a pokračoval rovně. Klín pod ním dobírá uzavírací
// rampa (`rampCompletion`, X 37,197) — a ta začínala o celou ap výš, na
// X 41,73 Z 124,404, takže 9,3 mm jela posuvem po dráze, kterou „Průchod 4"
// právě vyřízl (pravidlo 5, pravidlo 10.3):
//   N2870 G1 X41.730 F0.25
//   N2880 G1 X37.197 Z107.486 ; Rampa 15.0°
// *„Proč mi tady dráha nezačíná tam, kde skončilo předchozí zanořování, ale
// bere to zvrchu?"* Oprava: ops/long/rampOverCut.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'cam-cases', 'polygon-section2-ramp-chain.camprog');
let run = null;
const getRun = async () => (run ??= await runCamProg(JSON.parse(readFileSync(FIXTURE, 'utf8'))));
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

describe('CAM: uzavírací rampa nejede po už vyříznuté přímce zanoření', () => {
  it('předchozí vrstva X 39,23 sjela přímku zanoření až na Z 115,074', async () => {
    const { calc } = await getRun();
    const prev = calc.passes.find(p => p.type === 'long' && near(p.x, 39.23)
      && (p.contourLeadOut || []).some(s => near(s.x2, 39.23) && near(s.z2, 115.074)));
    expect(prev, 'dojezd „Průchodu 4" po přímce zanoření').toBeTruthy();
  });

  it('rampa X 37,197 začíná na konci předchozího zanoření, ne o ap výš', async () => {
    const { calc } = await getRun();
    const rc = calc.passes.find(p => p.rampCompletion && near(p.x, 37.197));
    expect(rc, 'uzavírací rampa X 37,197').toBeTruthy();
    expect(rc.ramp.x0).toBeCloseTo(39.23, 2);
    expect(rc.ramp.z0).toBeCloseTo(115.074, 2);
    expect(rc.__rampAnchor, 'pomocná značka nesmí zůstat v průchodu').toBeUndefined();
  });

  it('v G-kódu k ní nástroj sjede nad obrobeným sloupcem a posuvem jede jen rampa', async () => {
    const { gcode } = await getRun();
    const L = gcode.split('\n').map(l => l.replace(/^N\d+ /, ''));
    const i = L.findIndex(l => l.startsWith('G1 X37.197 Z107.486') && l.includes('Rampa'));
    expect(i).toBeGreaterThan(3);
    expect(L.slice(i - 3, i)).toEqual(['G0 Z115.074', 'G0 X41.230', 'G1 X39.230 F0.25']);
    expect(gcode).not.toContain('Z124.404');
  });

  it('bez kolizí (validátor jako simulátor)', async () => {
    const r = await getRun();
    const issues = validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments,
      { planStock: true, backside: false });
    expect(issues.map(i => ({ k: i.kind, x: +(i.x || 0).toFixed(2), z: +(i.z || 0).toFixed(2), a: +(i.area || 0).toFixed(2) }))).toEqual([]);
  });
});
