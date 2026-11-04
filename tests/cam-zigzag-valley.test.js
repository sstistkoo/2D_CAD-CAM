// Cik cak — údolí pod čarou zanoření uvnitř úseku (ops/zigzagValley.js).
// Uživatel 4. 11. 2026 (karusel po X, díl `carousel-zigzag-valley`): údolí
// za hrbem, jehož čára zanoření skončí na kontuře, se nemá brát řetězem
// vrstev zanořených po čáře zanoření (u strmé stěny zůstal klín „nedojeto"),
// ale cik cak: vrstva od stěny ke stěně, na konci rampa 45° o ap níž.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor } from '../js/calculators/cam/sim/xzSections.js';
import { swapSimPath } from '../js/calculators/cam/sim/xzSim.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { mirrorPass } from '../js/calculators/cam/zMirror.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const load = (n) => JSON.parse(readFileSync(join(DIR, n), 'utf8'));
const area = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.z - q.x * p.z; }
  return Math.abs(a / 2);
};

describe('Cik cak — údolí za hrbem bez hranice úseku', () => {
  it('karusel po X: obě údolí cik cak, až ke stěně hrbu, bez kolize, méně zbytku', async () => {
    const prog = load('carousel-zigzag-valley.camprog');
    const r = await runCamProg(prog);
    const w = r.calc._xz;
    const zig = w.calc.passes.filter((p) => p.floorZigzag);
    expect(zig.length).toBeGreaterThanOrEqual(2);
    // Údolí mezi hrby (stěna 10–11 strmější než 45°): vrstva X'121 jede
    // doprava až ke stěně (Z' ≈ 603), ne jen na čáru zanoření (Z' 587,9).
    const a = zig.find((p) => p.moves.some((m) => Math.abs(m.x - 121) < 1e-6 && m.z > 500));
    expect(Math.max(...a.moves.filter((m) => Math.abs(m.x - 121) < 1e-6).map((m) => m.z))).toBeGreaterThan(600);
    // Směr se střídá (cik cak), ne všechny vrstvy doleva.
    const dirs = a.moves.slice(1).map((m, i) => Math.sign(m.z - a.moves[i].z)).filter(Boolean);
    expect(dirs.some((d) => d > 0)).toBe(true);
    // Údolí u osy: žádná vrstva už nevjíždí po čáře zanoření od hrbu 4.
    expect(w.calc.passes.some((p) => p.contourLeadIn && Math.abs(p.contourLeadIn[0].z1 - 213.65) < 0.05 && p.contourLeadIn.length === 1)).toBe(false);
    // Bez kolize (v prohozeném světě, nůž svisle — cam/sim/xzSim.js).
    expect(validateToolpath(swapSimPath(r.calcSim.simPath), w.S.params, w.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
    // Zbytek nad konturou: dřív 4589 mm² (klíny u stěn), teď < 1500 mm².
    const contour = prog.contourPoints.slice(0, -1);
    expect(area(machinedFor(r.S, r.calcSim).points) - area(contour)).toBeLessThan(1500);
  }, 240000);

  it('zrcadlo (zleva) překlopí i směr odskoku cik caku', () => {
    const m = mirrorPass({ type: 'zigzag', moves: [{ g: 'G1', x: 1, z: 2 }], xSafe: 3, floorZigzag: true, endDir: -1 });
    expect(m.endDir).toBe(1);
    expect(m.moves[0].z).toBe(-2);
  });
});
