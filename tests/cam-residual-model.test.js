// ╔══════════════════════════════════════════════════════════════╗
// ║  Model zbytku pro rychloposuvy × reálně projetá dráha         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Emise si vede zbytkový polotovar (`rapidStock`) a podle NĚJ rozhoduje,
// jestli smí pustit rychloposuv. Když si ten model myslí, že materiál už
// není, a on tam stojí, jede `G0` materiálem — proto se odchylka měří jen
// v tomhle jednom směru (realita výš než model).
//
// Nález 12. 8. 2026: model byl o 0,30–0,47 mm níž než realita, protože
// OBLOUKY trasovaných nájezdů/dojezdů se do něj zapisovaly TĚTIVOU. Tětiva
// leží u vypuklého tvaru hlouběji v materiálu než skutečná dráha, takže
// model „odebral" pásek o výšce sagitty, který ve skutečnosti zůstal stát.
// Po opravě (`noteCutArc` vzorkuje oblouk) je odchylka ≤ 0,035 mm.
//
// Druhý nález (12. 8. 2026): trasovaný nájezd po kontuře nemusí dojet až na
// hloubku vrstvy a tělo se emituje jako `G1 Z…` BEZ X, tedy modálně mělčeji —
// zatímco `setPos(pass.x, …)` tvrdil opak. Na part-8 se tak vrstva X24,478
// vůbec neodebrala, ale model si ji připsal (rozdíl 3,3 mm; holder-region
// 4,5 mm). Emise teď na hloubku sjede, a když tam držák nepustí, zůstane na
// hloubce nájezdu a MODEL SE TO DOZVÍ (`emitBodyX`). Po opravě ≤ 0,03 mm.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { StockModel, toolSweep } from '../js/geom/geomCore.js';
import { buildStockLoop, toolFootprint } from '../js/calculators/cam/materialRemoval.js';

// Nejvyšší materiál na svislici Z (null = smyčky tam nesahají).
function topAt(loops, z) {
  let top = null;
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
        const x = a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
        if (top === null || x > top) top = x;
      }
    }
  }
  return top;
}

// Zbytek podle REÁLNĚ projeté dráhy — řezné bloky `simPath` do StockModelu,
// stejně jako to dělá validateToolpath.
function replayReality(calc, calcSim, prms) {
  const stock = new StockModel([buildStockLoop(prms, calc.stockPathSegments)]);
  const foot = toolFootprint(prms);
  const sp = calcSim.simPath || [];
  let cur = null;
  const blocks = [];
  for (let i = 1; i < sp.length; i++) {
    const p = sp[i];
    const li = p.originalLineIdx ?? (cur ? cur.lineIdx : null);
    const type = p.type || 'G0';
    if (!cur || li !== cur.lineIdx || type !== cur.type) {
      cur = { lineIdx: li, type, pts: [sp[i - 1], p] };
      blocks.push(cur);
    } else cur.pts.push(p);
  }
  for (const b of blocks) {
    if (b.type === 'G0') continue;              // rychloposuv neřeže
    const pts = b.pts.map(p => ({ x: p.x, z: p.z }));
    if (pts.length < 2) continue;
    try { stock.cut(toolSweep(foot, pts)); } catch { /* model je jen měřidlo */ }
  }
  return stock;
}

async function worstOvercut(name) {
  const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures/cam', `${name}.camprog`), 'utf8'));
  globalThis.__RAPID_STOCK_DUMP__ = [];
  let dumps;
  let run;
  try {
    run = await runCamProg(prog);
    dumps = globalThis.__RAPID_STOCK_DUMP__;
  } finally {
    delete globalThis.__RAPID_STOCK_DUMP__;
  }
  expect(dumps.length, 'seam nevydal model — emise ho přestala plnit').toBeGreaterThan(0);
  const model = dumps[0];
  const { calc, calcSim, S } = run;
  const real = replayReality(calc, calcSim, S.params);

  const loop0 = buildStockLoop(S.params, calc.stockPathSegments);
  let zLo = Infinity, zHi = -Infinity;
  for (const p of loop0) { if (p.z < zLo) zLo = p.z; if (p.z > zHi) zHi = p.z; }

  let worst = 0, worstZ = null;
  for (let z = zLo + 0.25; z < zHi; z += 0.25) {
    const m = topAt(model, z), r = topAt(real.loops, z);
    if (m === null || r === null) continue;
    if (r - m > worst) { worst = r - m; worstZ = z; }
  }
  return { worst, worstZ };
}

describe('model zbytku pro rychloposuvy nelže o materiálu', () => {
  // Fixtures s oblouky v trasovaných dojezdech — právě ty tětiva podřezávala.
  for (const name of ['part-1', 'part-4', 'part-10-zapich-casting', 'part-14-finish-holder']) {
    it(`${name}: model není níž než realita`, async () => {
      const { worst, worstZ } = await worstOvercut(name);
      expect(worst, `model o ${worst.toFixed(3)} mm níž než realita @Z${worstZ}`)
        .toBeLessThanOrEqual(0.05);
    }, 120000);
  }

  // Fixtures, kde lead nedojel na hloubku vrstvy (druhý nález). Izolovaně
  // měly 3,3 / 4,5 mm, po opravě 0,012 / 0,029 — proto stejná mez jako výš.
  // POZOR při ladění: v sadě singleton `S` přenese params z předchozích
  // fixtures a část vad se zamaskuje; reprodukce je JEDEN PROCES NA FIXTURE
  // (postup v docs/geometry-libs-migration.md).
  for (const name of ['part-8', 'holder-region-roughing', 'holder-casting-slanted-face']) {
    it(`${name}: model není níž než realita`, async () => {
      const { worst, worstZ } = await worstOvercut(name);
      expect(worst, `model o ${worst.toFixed(3)} mm níž než realita @Z${worstZ}`)
        .toBeLessThanOrEqual(0.05);
    }, 120000);
  }
});
