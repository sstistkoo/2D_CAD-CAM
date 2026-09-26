// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kulatá R 10: vrstvy za stěnou, u osy a dno ve vybrání  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Nálezy uživatele 26. 9. 2026 („✂ Po úsecích", R 10, ap 2,5):
//
//  1. Zleva, úsek 2 (`round-r10-zleva-section2`): po `N3270 G1 Z194.675`
//     chyběly vrstvy 38,1 … 28,1 u stěny drážky. Blok polotovaru Z 196…205
//     leží ZA koncem vrstvy — pod spodkem nosu je vzduch, bere ho bok
//     kružnice nosu. Sken se ptal jen na sloupec pod spodkem nosu, kotva
//     zanoření navíc utekla za hrb a interval u stěny se zahodil.
//  2. Tamtéž u osy: vrstva X 8,095 v Z 356…369 vypadla (kotva `zCap` ležela
//     uvnitř intervalu) a další vrstva brala 5 mm.
//  3. Zprava, úsek 3 (`round-r10-section3-recess`): ve vybrání R 24,5 mezi
//     body 25–24 zůstala pod poslední vrstvou čočka 2,4 mm — dno v oblouku
//     se nehlídalo a hloubka pod ním řezala jinde (v sousedním údolí).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { offsetSilhouetteLoop } from '../js/calculators/cam/toolEnvelope.js';
import { topXOnLoop } from '../js/calculators/cam/camMath.js';
import { polyOffset } from '../js/geom/geomCore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam-cases', name), 'utf8'));

// Nejvyšší zbytek nad dílem + přídavkem v Z-rozsahu (jako P3 „zbytek na dně"
// v scripts/cam_rules_check.mjs).
function maxLeftover(r, zLo, zHi) {
  const P = r.params;
  const rm = new MaterialRemoval(P, r.calcSim.stockPathSegments, {});
  rm.advanceTo(r.calcSim.simPath, r.calcSim.simPath.length - 1);
  const part = offsetSilhouetteLoop(r.calc.contourSegments);
  const allow = Math.max(parseFloat(P.allowanceX) || 0, parseFloat(P.allowanceZ) || 0);
  const o = polyOffset([part], allow);
  const allowLoop = o && o[0] ? o.sort((u, v) => v.length - u.length)[0] : part;
  let worst = 0;
  for (let z = zLo; z <= zHi; z += 0.25) {
    const pt = topXOnLoop(allowLoop, z);
    let top = null;
    for (const l of rm.model.loops) { const t = topXOnLoop(l, z); if (t !== null && (top === null || t > top)) top = t; }
    if (pt !== null && top !== null) worst = Math.max(worst, top - pt);
  }
  return worst;
}

describe('CAM: kulatá R 10 — vrstvy za stěnou a u osy (zleva, úsek 2)', () => {
  it('vrstvy 38,1 … 28,1 dojedou ke stěně drážky (Z ≈ 194,6)', async () => {
    const { calc, params } = await runCamProg(load('round-r10-zleva-section2.camprog'));
    expect(params.toolShape).toBe('round');
    expect(params.roughingSide).toBe('left');
    for (const x of [38.095, 35.595, 33.095, 30.595, 28.095]) {
      const hit = calc.passes.some(p => p.type === 'long' && Math.abs(p.x - x) < 0.01
        && Math.abs(Math.max(p.zStart, p.zEnd) - 194.6) < 0.2);
      expect(hit, `chybí vrstva X ${x} u stěny`).toBe(true);
    }
  });

  it('vrstva X 8,095 u osy nevypadne (další vrstva nebere 2× ap)', async () => {
    const { calc } = await runCamProg(load('round-r10-zleva-section2.camprog'));
    const hit = calc.passes.some(p => p.type === 'long' && Math.abs(p.x - 8.095) < 0.01
      && Math.min(p.zStart, p.zEnd) < 360 && Math.max(p.zStart, p.zEnd) > 368);
    expect(hit).toBe(true);
  });
});

describe('CAM: kulatá R 10 — poslední vrstva na dně vybrání (zprava, úsek 3)', () => {
  it('na dně oblouku R 24,5 jede poslední vrstva a nájezd po kontuře od mělčí vrstvy', async () => {
    const { calc } = await runCamProg(load('round-r10-section3-recess.camprog'));
    const floor = calc.passes.filter(p => p.type === 'long' && Math.abs(p.x - 29.747) < 0.01);
    expect(floor.length).toBe(1);
    const li = floor[0].contourLeadIn || [];
    expect(li.length).toBeGreaterThan(0);
    // Nájezd začíná na úrovni předchozí vrstvy (X 32,166), ne nad ní —
    // nad ní by sjížděl posuvem vzduchem.
    expect(Math.abs(li[0].x1 - 32.166)).toBeLessThan(0.05);
    expect(li.every(s => s.type === 'arc')).toBe(true);
  });

  it('ve vybrání nezůstane víc než přídavek (+0,15 mm)', async () => {
    const r = await runCamProg(load('round-r10-section3-recess.camprog'));
    expect(maxLeftover(r, 23, 47)).toBeLessThan(0.15);
  });
});
