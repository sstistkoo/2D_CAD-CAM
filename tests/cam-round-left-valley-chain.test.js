// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kulatá R 10 zleva: řetěz ramp v údolí, dobrání, levý konec ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díl uživatele 29. 9. 2026 (projekt_2026-09-29, „✂ Po úsecích", úsek 1 =
// Z −13…145,3; kulatá R 10, ap 2,5, zleva). Nálezy při kontrole po úsecích:
//  1. údolí Z 82–104: kroky řetězu X 24,118 … 18,079 (`pocketReposition`)
//     jely nájezd po 45° stěně pokaždé od rohu X 29,118 Z 82,41 — 5, 7,5,
//     10 a 11 mm po čáře, kterou předchozí krok právě projel
//     (ops/long/pocketPass.js, „NÁJEZD PO STĚNĚ OD KONCE PŘEDCHOZÍHO KROKU"),
//  2. dobrání kapsy („kapsa bez schodků") jelo znovu celou rampu (15,6 mm)
//     a dno (6 mm) — poslední krok dosedl 0,1 mm za dno, navázání se
//     zamítlo (pocketPass.js, `reachedBottom` / `cleanBottomZ`),
//  3. levý konec: nájezd po plošině X 41,066 začínal na Z −9, jen o Vůli Z
//     před polotovarem — kružnice nosu tam bokem zapichovala (`G1 X41.066`
//     kolmo; ops/long/leadInChain.js, prodloužení dozadu).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'cam-cases', 'round-r10-left-valley-chain.camprog');
let run = null;
const getRun = async () => (run ??= await runCamProg(JSON.parse(readFileSync(FIXTURE, 'utf8'))));
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

describe('CAM: kulatá R 10 zleva — řetěz ramp v údolí, dobrání, levý konec', () => {
  it('kroky řetězu v údolí navazují na konec předchozího kroku (nájezd ≤ ap)', async () => {
    const { calc } = await getRun();
    const steps = calc.passes.filter(p => p.type === 'long' && p.pocketReposition
      && p.contourLeadIn && p.contourLeadIn.length && p.zStart > 80 && p.zStart < 100);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    for (const p of steps) {
      const drop = p.contourLeadIn[0].x1 - p.x;
      expect(drop, `nájezd X ${p.x.toFixed(3)} od X ${p.contourLeadIn[0].x1.toFixed(3)}`).toBeLessThanOrEqual(2.5 + 0.05);
    }
  });

  it('dobrání kapsy v údolí nejede znovu rampu ani dno', async () => {
    const { calc } = await getRun();
    const clean = calc.passes.find(p => p.pocketClean && near(p.x, 18.079, 0.05));
    expect(clean, 'dobrání dna X 18,079').toBeTruthy();
    expect(clean.contourLeadIn, 'nájezd po projeté rampě').toBeFalsy();
    // Začíná až na konci dna (Z 99,4), kam dojel poslední krok řetězu.
    expect(clean.zStart).toBeGreaterThan(99);
    expect(clean.cleanApproach).toBeTruthy();
  });

  it('nájezd po plošině levého konce začíná za dosahem nosu, ne zápichem', async () => {
    const { gcode, calc } = await getRun();
    const p = calc.passes.find(q => q.type === 'long' && q.contourLeadIn
      && near(q.contourLeadIn[0].x1, 41.066) && q.zStart < 40);
    expect(p).toBeTruthy();
    // Polotovar začíná na Z −8: začátek nejméně R + 1 mm před Vůlí Z.
    expect(p.contourLeadIn[0].z1).toBeLessThanOrEqual(-19.9);
    expect(/G0 Z-9\.000\s*\n\S*\s*G1 X41\.066/.test(gcode)).toBe(false);
  });

  it('bez kolize nástroje a držáku (validátor, planStock, zleva)', async () => {
    const r = await getRun();
    const issues = validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments,
      { planStock: true, backside: true });
    expect(issues.map(i => ({ k: i.kind, x: +(i.x || 0).toFixed(2), z: +(i.z || 0).toFixed(2), a: +(i.area || 0).toFixed(2) }))).toEqual([]);
  });
});
