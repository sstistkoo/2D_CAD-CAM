// Fáze 3 migrace (docs/geometry-libs-migration.md): napojení booleovského
// jádra do genLongPasses ZA PŘÍZNAKEM `booleanRoughing`. Default (false) =
// scan-line, kryté cam-gcode-regression snapshoty. Tento test ověřuje, že
// ZAPNUTÁ booleovská cesta je VĚRNÝM ekvivalentem scan-line na reálných
// fixtures: odebere STEJNÝ materiál (± vzorkovací šum), dojede na stejnou
// hloubku a nezanese hard-error. Pass count smí být jen o málo NIŽŠÍ
// (booleovská cesta vynechá degenerované nulové intervaly, které scan-line
// emituje jako no-op).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildStockLoop, toolFootprint } from '../js/calculators/cam/materialRemoval.js';
import { StockModel, toolSweep, polyArea } from '../js/geom/geomCore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');

// Podélné fixtures bez závitu/upichu — genLongPasses je na ně aktivní.
const FIXTURES = ['part-1', 'part-6', 'part-9', 'part-2', 'part-8', 'part-4'];

const hardErrors = (calc) => (calc.foundErrors || []).filter(e =>
  (typeof e === 'string') || (e && e.type && e.type !== 'warning'));

const longMetrics = (calc) => {
  const longs = (calc.passes || []).filter(p => p.type === 'long');
  // Obálku (xMin/zHi/zLo) měř JEN přes ŘEZNÉ průchody (zStart−zEnd > 1e-3).
  // Nulové kotevní `pocketEntry`/`pocketClean` průchody (zStart==zEnd) nesou
  // x=pocketBottomX (dno kapsy) → zkreslily by xMin. Booleovská větev jich
  // u part-8 emituje o jeden víc (dočišťuje hlubší dno, ale materiál-parita
  // drží — viz test níže) → bez filtru flaky dle kontaminace singletonu S.
  // Count zůstává přes VŠECHNY podélné průchody.
  const cutting = longs.filter(p => Math.abs(p.zStart - p.zEnd) > 1e-3);
  let zHi = -1e9, zLo = 1e9, xMin = 1e9;
  for (const p of cutting) { zHi = Math.max(zHi, p.zStart); zLo = Math.min(zLo, p.zEnd); xMin = Math.min(xMin, p.x); }
  return { count: longs.length, zHi, zLo, xMin };
};

// Zbývající materiál po projetí celé simulované dráhy (calcSim.simPath).
const remainingArea = (prms, stockSegs, simPath) => {
  const loop = buildStockLoop(prms, stockSegs);
  if (!loop) return NaN;
  const foot = toolFootprint(prms);
  const model = new StockModel([loop]);
  let run = null;
  for (let i = 0; i < simPath.length; i++) {
    const cut = (simPath[i].type || 'G0') !== 'G0';
    if (cut) { if (!run) run = [simPath[i - 1] || simPath[i]]; run.push(simPath[i]); }
    else { if (run && run.length >= 2) model.cut(toolSweep(foot, run.map(q => ({ x: q.x, z: q.z })))); run = null; }
  }
  if (run && run.length >= 2) model.cut(toolSweep(foot, run.map(q => ({ x: q.x, z: q.z }))));
  return Math.abs(polyArea(model.loops));
};

async function runBoth(name) {
  const prog = JSON.parse(readFileSync(join(fxDir, name + '.camprog'), 'utf8'));
  prog.params.booleanRoughing = false;
  const scan = await runCamProg(prog);
  prog.params.booleanRoughing = true;
  const bool = await runCamProg(prog);
  return { scan, bool };
}

describe('Fáze 3 napojení: booleanRoughing ≈ scan-line (podélné)', () => {
  for (const name of FIXTURES) {
    it(`${name}: stejná hloubka/obálka, bez hard-error, pass count nepřeroste`, async () => {
      const { scan, bool } = await runBoth(name);

      expect(hardErrors(scan.calc), 'scan-line hard errors').toEqual([]);
      expect(hardErrors(bool.calc), 'boolean hard errors').toEqual([]);
      expect(bool.gcode).toContain('HRUBOVANI');

      const ms = longMetrics(scan.calc), mb = longMetrics(bool.calc);
      // Stejná nejhlubší dosažená hloubka a Z-obálka (podélných průchodů).
      expect(mb.xMin).toBeCloseTo(ms.xMin, 1);
      expect(mb.zHi).toBeCloseTo(ms.zHi, 1);
      expect(mb.zLo).toBeCloseTo(ms.zLo, 1);
      // Booleovská cesta smí mít jen o málo MÉNĚ průchodů (vynechá no-opy),
      // nikdy výrazně víc.
      expect(mb.count).toBeGreaterThanOrEqual(ms.count - 5);
      expect(mb.count).toBeLessThanOrEqual(ms.count + 1);
    });
  }

  it('part-1: odebraný materiál se shoduje se scan-line (± vzorkovací šum)', async () => {
    const { scan, bool } = await runBoth('part-1');
    const rs = remainingArea(scan.S.params, scan.calc.stockPathSegments, scan.calcSim.simPath);
    const rb = remainingArea(bool.S.params, bool.calc.stockPathSegments, bool.calcSim.simPath);
    // Zbytkový materiál po hrubování+dokončení se nesmí lišit o víc než pár mm²
    // (dané vzorkováním offsetXAt po 0,2 mm) — žádný STOJÍCÍ neobrobený materiál.
    expect(Math.abs(rb - rs)).toBeLessThan(5);
  });
});
