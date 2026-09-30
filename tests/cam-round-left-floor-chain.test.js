// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kulatá R 10 zleva: řetěz zanoření a konec dna bez odskoku ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díl uživatele 30. 9. 2026 (projekt_2026-09-30 (9), „✂ Po úsecích",
// úsek 2 = Z 145,3…373,9; kulatá R 10, ap 2,5, zleva). Nálezy:
//  1. `N4370 G1 X38.095 Z262.325 ; Rampa` a `N5030 G1 X13.095 Z356.768` —
//     rampa nezačínala na konci předchozího zanoření, ale o 0,5 mm dál:
//     předchozí vrstva vjela PO STĚNĚ (sjezd pod 45°) a řetěz ramp se
//     zakládal jen za rampou (ops/long/rule7Layers.js, `plungeLineEnd`),
//  2. `N4860 G1 Z350.188` — vrstva na dně (X 19,637) odskočila, vrátila se
//     rychloposuvem a další vrstva se zanořovala znovu z úrovně nad dnem
//     („taneček"); v celém programu dokonce vjela po stěně přes celé dno
//     (70 mm posuvem). Teď vrstva na dně bez odskoku sjede po stěně na ap
//     (ops/long/rule7FloorJoin.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'cam-cases', 'round-r10-left-floor-chain.camprog');
let run = null;
const getRun = async () => (run ??= await runCamProg(JSON.parse(readFileSync(FIXTURE, 'utf8'))));
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const find = (calc, x, zMin) => calc.passes.find(p => p.type === 'long' && near(p.x, x) && Math.max(p.zStart, p.zEnd) > zMin);

describe('CAM: kulatá R 10 zleva — řetěz zanoření a konec dna bez odskoku', () => {
  it('rampa navazuje přesně na konec sjezdu po stěně předchozí vrstvy', async () => {
    const { calc } = await getRun();
    for (const [xPrev, x] of [[40.595, 38.095], [15.595, 13.095]]) {
      const prev = find(calc, xPrev, 250), p = find(calc, x, 250);
      expect(prev && prev.contourLeadIn, `vrstva X ${xPrev} vjíždí po stěně`).toBeTruthy();
      const end = prev.contourLeadIn[prev.contourLeadIn.length - 1];
      expect(p && p.ramp, `vrstva X ${x} vjíždí rampou`).toBeTruthy();
      expect(p.ramp.x0).toBeCloseTo(end.x2, 2);
      expect(p.ramp.z0, `rampa X ${x} začíná na konci sjezdu`).toBeCloseTo(end.z2, 2);
    }
  });

  it('vrstva na dně X 19,637 pokračuje bez odskoku po stěně na X 18,095', async () => {
    const { calc } = await getRun();
    const i = calc.passes.findIndex(p => p.type === 'long' && near(p.x, 19.637) && Math.max(p.zStart, p.zEnd) > 300);
    expect(i).toBeGreaterThanOrEqual(0);
    const floor = calc.passes[i], next = calc.passes[i + 1];
    expect(floor.noRetract, 'bez odskoku').toBe(true);
    expect(next && near(next.x, 18.095)).toBe(true);
    const li = next.contourLeadIn;
    expect(li && li.length > 0, 'sjezd po stěně').toBe(true);
    expect(li[0].x1).toBeCloseTo(floor.x, 3);
    expect(li[0].z1).toBeCloseTo(floor.zEnd, 3);
    // Sjezd nejede znovu po dně (pravidlo 5): celý je kratší než pár mm.
    const len = li.reduce((a, s) => a + Math.hypot(s.x2 - s.x1, s.z2 - s.z1), 0);
    expect(len).toBeLessThan(3);
    expect(Math.max(next.zStart, next.zEnd)).toBeGreaterThan(368);
  });

  it('bez kolize nástroje a držáku (validátor, planStock, zleva)', async () => {
    const r = await getRun();
    const issues = validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments,
      { planStock: true, backside: true });
    expect(issues.map(i => ({ k: i.kind, x: +(i.x || 0).toFixed(2), z: +(i.z || 0).toFixed(2), a: +(i.area || 0).toFixed(2) }))).toEqual([]);
  });
});
