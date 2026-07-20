// Fáze 3 migrace (docs/geometry-libs-migration.md), krok 2 — REGIONY z geometrie.
// Ověřuje napojení booleovské detekce regionů (computeResidualRegions nad
// siluetou polotovaru) do genLongPasses.computeRegions ZA PŘÍZNAKEM
// `booleanRoughing`. regionRoughing je ve fixtures s regionRoughing=true
// spárováno s booleanRoughing=false → boolean region-cesta nemá snapshotové
// pokrytí; tenhle test je její regresní pojistka:
//   1) SEPARACE — booleovské splity odpovídají ručním (stejný signál = horní
//      hrana siluety polotovaru), takže se odlitkové hrby dělí stejně.
//   2) MATERIÁL-PARITA — po projetí celé dráhy zůstává stejně materiálu jako
//      s ruční detekcí (StockModel sweep) → žádný STOJÍCÍ neobrobený materiál.
// Měřeno IZOLOVANĚ na 1 fixture (part-10-zapich-casting; holder-region-roughing
// je v headlessu příliš pomalý a singleton S kontaminuje souhrnný běh).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildStockLoop, toolFootprint } from '../js/calculators/cam/materialRemoval.js';
import { StockModel, toolSweep, polyArea } from '../js/geom/geomCore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');

const hardErrors = (calc) => (calc.foundErrors || []).filter(e =>
  (typeof e === 'string') || (e && e.type && e.type !== 'warning'));

const longMetrics = (calc) => {
  const longs = (calc.passes || []).filter(p => p.type === 'long');
  let zHi = -1e9, zLo = 1e9, xMin = 1e9;
  for (const p of longs) { zHi = Math.max(zHi, p.zStart); zLo = Math.min(zLo, p.zEnd); xMin = Math.min(xMin, p.x); }
  return { count: longs.length, zHi, zLo, xMin };
};

// Zbytkový materiál po projetí celé simulované dráhy (calcSim.simPath).
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

// Zachytí splity regionů přes guarded diagnostický háček v computeRegions.
async function runWithRegions(prog) {
  globalThis.__REGION_LOG__ = [];
  const res = await runCamProg(prog);
  const splits = (globalThis.__REGION_LOG__[0] || {}).splits || [];
  globalThis.__REGION_LOG__ = undefined;
  return { ...res, splits };
}

describe('Fáze 3 krok 2: booleovské regiony ≈ ruční (odlitek s hrbem)', () => {
  it('part-10-zapich-casting: stejné splity, materiál-parita, bez hard-error', async () => {
    const prog = JSON.parse(readFileSync(join(fxDir, 'part-10-zapich-casting.camprog'), 'utf8'));
    expect(prog.params.regionRoughing).toBe(true);   // fixture opravdu region-roughuje

    prog.params.booleanRoughing = false;
    const man = await runWithRegions(prog);
    prog.params.booleanRoughing = true;
    const boo = await runWithRegions(prog);

    expect(hardErrors(man.calc)).toEqual([]);
    expect(hardErrors(boo.calc)).toEqual([]);

    // 1) SEPARACE — fixture má odlitkový hrb → aspoň 1 split, a booleovská
    //    detekce ho umístí stejně jako ruční (± vzorkování dz).
    expect(man.splits.length).toBeGreaterThan(0);
    expect(boo.splits.length).toBe(man.splits.length);
    for (let i = 0; i < man.splits.length; i++) {
      expect(boo.splits[i].z).toBeCloseTo(man.splits[i].z, 0);
      expect(boo.splits[i].xSurf).toBeCloseTo(man.splits[i].xSurf, 0);
    }

    // 2) Stejná hloubka/Z-obálka podélných průchodů.
    const mm = longMetrics(man.calc), mb = longMetrics(boo.calc);
    expect(mb.xMin).toBeCloseTo(mm.xMin, 1);
    expect(mb.zHi).toBeCloseTo(mm.zHi, 1);
    expect(mb.zLo).toBeCloseTo(mm.zLo, 1);

    // 3) MATERIÁL-PARITA — žádný stojící materiál navíc (Δ jen vzorkovací šum).
    const rm = remainingArea(man.S.params, man.calc.stockPathSegments, man.calcSim.simPath);
    const rb = remainingArea(boo.S.params, boo.calc.stockPathSegments, boo.calcSim.simPath);
    expect(Math.abs(rb - rm)).toBeLessThan(10);
  }, 30000);   // part-10 2× (calc+calcSim) + 2 StockModel sweepy
});
