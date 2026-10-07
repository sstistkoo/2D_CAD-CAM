// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – vrstvy jen nad SKUTEČNÝM polotovarem (pravidlo 9)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Nález 7. 10. 2026: hřídel r 5 × 60 s osazením r 10 (= r polotovaru Ø 20 ×
// 62), polygon CL rε 0,4, Vůle 1. Pásmo vůle před čelem (Z 0…1) je širší než
// odsazení čela (Přídavek Z + rε = 0,5), takže hloubky pod nejmenším průměrem
// v něm našly „materiál":
//   • vrstvy X 3,5 / 2 / 0,5 / 0 jely celé ve vzduchu před čelem,
//   • dojezd první vrstvy jel posuvem po vršku osazení až za konec polotovaru
//     (`G1 Z-62.712`),
//   • s rε 0,8 vznikla „poslední kratší vrstva" X 5,214 v pásu vůle za koncem
//     polotovaru a k ní rampa 5° přes celý díl (`G1 X5.214 Z-62.000`).
// Pravidlo 9 (docs/cam-pravidla.md): co je materiál, rozhoduje nakreslený
// polotovar, ne plánovací obrys s vůlí. Oprava: klíč plátku `realStockLayers`
// (ops/long/realStock.js, bisekce v ops/roughLong.js).
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildIsoKnife } from '../js/calculators/isoToolCatalog.js';

const STOCK_R = 10, STOCK_END = -62;
const shaft = (radius) => {
  const mk = (pts) => pts.map(([z, x], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));
  const params = {
    mode: 'RADIUS', speed: 180, feed: 0.2, depthOfCut: 1.5, retractDistance: 1,
    allowanceX: 0.3, allowanceZ: 0.1, noStepRoughing: true,
    roughingStrategy: 'longitudinal', roughingSide: 'right', stockMode: 'cylinder',
    stockDiameter: 2 * STOCK_R, stockLength: -STOCK_END, stockFace: 0, safeX: 40, safeZ: 5, partOffZ: null,
    ...buildIsoKnife('CL', { shank: '2020', variant: 'pos', size: '09', radius }).tool,
  };
  return { params, contourPoints: mk([[0, 0], [0, 5], [-60, 5], [-60, 10], [-62, 10]]), stockPoints: [] };
};

// Průchody hrubování z G-kódu: řezné pohyby (G1) s polohou X (poloměr) a Z.
function roughPasses(gcode) {
  const lines = gcode.split('\n');
  const a = lines.findIndex(l => /HRUBOVANI/.test(l));
  const b = lines.findIndex(l => /DOKONCOVANI/.test(l));
  const passes = [];
  let x = null, z = null, cur = null;
  for (const l of lines.slice(a, b < 0 ? undefined : b)) {
    if (/^; Průchod/.test(l)) { cur = { title: l, moves: [] }; passes.push(cur); continue; }
    const mx = /\bX(-?\d+(?:\.\d+)?)/.exec(l), mz = /\bZ(-?\d+(?:\.\d+)?)/.exec(l);
    if (mx) x = +mx[1];
    if (mz) z = +mz[1];
    if (cur && /\bG1\b/.test(l)) cur.moves.push({ x, z, axial: !mx, line: l.trim() });
  }
  return passes;
}

describe('CAM: vrstvy hrubování jen nad skutečným polotovarem (pravidlo 9)', () => {
  for (const [radius, R, floorX] of [['04', 0.4, 5.7], ['08', 0.8, 6.1]]) {
    it(`hřídel s osazením, rε ${R}: žádná vrstva ve vůli, poslední vrstva na dně`, async () => {
      const { gcode } = await runCamProg(shaft(radius));
      const passes = roughPasses(gcode);
      expect(passes.length).toBeGreaterThan(0);
      const bad = [];
      for (const p of passes) {
        // Každý průchod musí vjet do polotovaru (čelo je v Z 0) — vrstva celá
        // v pásu vůle před čelem nic neubere.
        const zMin = Math.min(...p.moves.map(m => m.z));
        if (!(zMin < 0)) bad.push(`${p.title}: celý před čelem (Z ≥ ${zMin})`);
        for (const m of p.moves) {
          // Za konec polotovaru nejede nic posuvem (střed nosu nejvýš o rε dál).
          if (m.z < STOCK_END - R) bad.push(`${p.title}: ${m.line} za koncem polotovaru`);
          // Podélně nad polotovarem (r 10) nic posuvem — vršek osazení je
          // vzduch. (Odskok 45° po konci vrstvy je výjezd, ne řez.)
          if (m.axial && m.x - R > STOCK_R + 0.01) bad.push(`${p.title}: ${m.line} nad polotovarem`);
        }
      }
      expect(bad, bad.join('\n')).toEqual([]);
      // Dno (r 5 + Přídavek X 0,3 + rε) se obrobí — poslední vrstva tam je.
      const deepest = Math.min(...passes.flatMap(p => p.moves.filter(m => m.z < -1).map(m => m.x)));
      expect(deepest).toBeCloseTo(floorX, 2);
    });
  }
});
