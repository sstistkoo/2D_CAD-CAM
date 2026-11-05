// Cik cak ZLEVA na soustruhu: hranice úseku na údolí polotovaru (pravidlo 1,
// „Údolí polotovaru", schválil uživatel 5. 11. 2026 „ano zapni").
// Díl uživatele (projekt_2026-11-05 (8)): bez hranice vrstvy X42–X36 jely od
// čelistí, u Z19 přeskočily rychloposuvem nad kusem až na Z103 a pokračovaly
// (N340 G0 Z-14.050 … N380 G0 Z103.501).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor, sectionStepLimits } from '../js/calculators/cam/sim/xzSections.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { sectionRanges } from '../js/calculators/cam/ops/sections/sectionRanges.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const load = (n) => JSON.parse(readFileSync(join(DIR, n), 'utf8'));

describe('Cik cak zleva — hranice na údolí polotovaru', () => {
  it('úsek končí na údolí (Z≈84), vrstva nepřeskakuje nad kusem do další oblasti, bez kolize', async () => {
    const prog = load('lathe-zigzag-left-valley.camprog');
    prog.params = { ...prog.params, doFinishing: false };
    const r0 = await runCamProg(prog);
    const valley = r0.calc.sectionPlan.edges.filter((e) => e.stockValley);
    expect(valley).toHaveLength(1);
    expect(Math.abs(valley[0].z - 84)).toBeLessThan(3);

    const zs = r0.calc.stockWorldPoints.map((p) => p.zReal);
    const steps = sectionRanges(r0.calc.sectionPlan, { lo: Math.min(...zs), hi: Math.max(...zs) }, null);
    expect(steps.length).toBe(3);
    const base = { z: JSON.parse(JSON.stringify(prog.zLimits)), x: JSON.parse(JSON.stringify(prog.xLimits)) };
    let stock = prog.stockPoints, mode = prog.params.stockMode, first = null;
    for (const st of steps) {
      const L = sectionStepLimits(r0.S, st, base);
      const r = await runCamProg({ ...prog, params: { ...prog.params, stockMode: mode }, stockPoints: stock, zLimits: L.zLimits, xLimits: L.xLimits });
      expect(validateToolpath(r.calcSim.simPath, r.params, r.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
      if (!first) first = r.gcode;
      stock = machinedFor(r.S, r.calcSim).points; mode = 'casting';
    }
    // Úsek od čelistí: žádný rychloposuv přes údolí na druhou stranu (Z > 90).
    expect(first).not.toMatch(/G0 Z(9\d|1\d\d)\.\d+/);
    expect((first.match(/Přejezd materiálem/g) || []).length).toBeLessThanOrEqual(2);
  }, 240000);
});
