// ✂ Po úsecích s volbou „Nepřejíždět mezi hrby" (ops/sections/humpFirst.js).
// Díl uživatele 12. 11. 2026 (soustruh zleva, PSBNR, ap 4, odlitek se dvěma
// hrby nad údolím polotovaru S8 X126 Z459): bez volby jela každá vrstva přes
// oba hrby a mezi nimi přejížděla rychloposuvem (`G0 Z585.810` — 30 přejezdů).
// S volbou: hrb 1 do dna údolí → hrb 2 do dna údolí → pod dnem vcelku → Úsek 3,
// žádný přejezd, bez kolize.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor, sectionStepLimits } from '../js/calculators/cam/sim/xzSections.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { sectionRanges } from '../js/calculators/cam/ops/sections/sectionRanges.js';
import { humpFirstSteps } from '../js/calculators/cam/ops/sections/humpFirst.js';
import { humpFirstOn } from '../js/calculators/cam/sim/humpFirstOption.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const load = () => JSON.parse(readFileSync(join(DIR, 'lathe-left-hump-first.camprog'), 'utf8'));

// Rychloposuv DOPŘEDU v Z hned po řezu na téže hloubce = přejezd přes mezeru.
function forwardRapids(gcode) {
  let z = null, prevG1 = false, n = 0;
  for (const l of gcode.split('; --- DOKONCOVANI ---')[0].split('\n')) {
    const m = l.match(/^N\d+ (G[01])([^;]*)/);
    if (!m) continue;
    const zm = m[2].match(/Z(-?[\d.]+)/), xm = m[2].match(/X(-?[\d.]+)/);
    if (zm) {
      const nz = +zm[1];
      if (m[1] === 'G0' && !xm && prevG1 && z !== null && nz - z > 5) n++;
      z = nz;
    }
    prevG1 = m[1] === 'G1';
  }
  return n;
}

describe('Nepřejíždět mezi hrby — pořadí kroků po úsecích', () => {
  it('bez volby se kroky nemění (hranice na údolí jen s volbou)', async () => {
    const prog = load();
    prog.params = { ...prog.params, humpFirst: false, doFinishing: false };
    const r0 = await runCamProg(prog);
    expect(r0.calc.sectionPlan.edges.some((e) => e.stockValley)).toBe(false);
    expect(forwardRapids(r0.gcode)).toBeGreaterThan(10);   // výchozí stav: přejezdy mezi hrby
  }, 120000);

  it('hrb 1 → hrb 2 → pod dnem údolí → Úsek 3, bez přejezdů a bez kolize', async () => {
    const prog = load();
    prog.params = { ...prog.params, doFinishing: false };
    const r0 = await runCamProg(prog);
    const plan = r0.calc.sectionPlan;
    const valley = plan.edges.filter((e) => e.stockValley);
    expect(valley).toHaveLength(1);
    expect(Math.abs(valley[0].z - 459.8)).toBeLessThan(1);
    expect(Math.abs(valley[0].x - 127)).toBeLessThan(1);

    const zs = r0.calc.stockWorldPoints.map((p) => p.zReal);
    const steps = humpFirstSteps(humpFirstOn(r0.S.params), plan, sectionRanges(plan, { lo: Math.min(...zs), hi: Math.max(...zs) }, null));
    expect(steps.map((s) => s.name)).toEqual(['Úsek 1 (do Ø254.1)', 'Úsek 2 (do Ø254.1)', 'Úsek 1+2 (pod Ø254.1)', 'Úsek 3']);
    expect(steps[2].depthCap).toBeCloseTo(valley[0].x, 6);

    const base = { z: JSON.parse(JSON.stringify(prog.zLimits)), x: JSON.parse(JSON.stringify(prog.xLimits)) };
    let stock = prog.stockPoints, mode = prog.params.stockMode;
    for (const st of steps) {
      const L = sectionStepLimits(r0.S, st, base);
      const r = await runCamProg({ ...prog, params: { ...prog.params, stockMode: mode }, stockPoints: stock, zLimits: L.zLimits, xLimits: L.xLimits });
      const iss = validateToolpath(r.calcSim.simPath, r.params, r.calc.stockPathSegments, { planStock: true, maxIssues: 500, backside: true });
      expect(iss, st.name).toHaveLength(0);
      expect(forwardRapids(r.gcode), st.name).toBe(0);
      // Krok pod dnem údolí nejede vrstvy nad ním (stěna pravidla 12 se nehledá).
      if (st.depthCap) {
        const xs = [...r.gcode.split('; --- DOKONCOVANI ---')[0].matchAll(/G1 X([\d.]+) F/g)].map((m) => +m[1]);
        expect(xs.length, st.name).toBeGreaterThan(5);
        expect(r.errors.some((e) => /Rozsah X max/.test(e.msg || '')), st.name).toBe(false);
      }
      stock = machinedFor(r.S, r.calcSim).points; mode = 'casting';
    }
  }, 300000);
});
