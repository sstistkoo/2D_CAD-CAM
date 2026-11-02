// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – Cik cak po úsecích: na hotovo až na konci, naráz        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 2. 11. 2026: úseky se vyhrubují s přídavkem na hotovo (schody na
// stěnách jen s „Hrub. bez schodků"), pak se naráz vezme všechno na hotovo —
// jedna část „Na hotovo" přes všechny úseky (cam/sim/sectionFinishAtEnd.js).
// Kulatá v úzkém držáku sjede i po vyhrubované svislé stěně (čelo 7-8,
// stěna 18-17) — zigzagSteepLimit v ops/zigzagFloor.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { machinedStockPoints } from '../js/calculators/cam/opParts.js';
import { maxXAt } from '../js/calculators/cam/passHelpers.js';
import { sectionFinishBegin, sectionFinishEnd, baseFinishOnly } from '../js/calculators/cam/sim/sectionFinishAtEnd.js';
import { zigzagSteepLimit } from '../js/calculators/cam/ops/zigzagFloor.js';
import { buildNarrowKnife } from '../js/calculators/narrowHolders.js';

const U = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases', 'zigzag-sections.json'), 'utf8'));

describe('Cik cak — na hotovo až na konci', () => {
  it('díl uživatele: úseky bez dokončení, pak jedno dokončení po čelech a stěnách', async () => {
    let stock = U.stockPoints, mode = U.params.stockMode;
    for (const sec of U.sections) {
      const r = await runCamProg({ params: { ...U.params, stockMode: mode, roughingStrategy: 'zigzag', doFinishing: false },
        contourPoints: U.contourPoints, stockPoints: stock, zLimits: sec.z });
      stock = machinedStockPoints(r.params, r.calc.stockPathSegments, r.calcSim.simPath).points; mode = 'casting';
    }
    expect(stock.length).toBeGreaterThan(5);
    const fin = await runCamProg({ params: { ...U.params, stockMode: 'casting', roughingStrategy: 'zigzag', doFinishing: true, finishOnly: true },
      contourPoints: U.contourPoints, stockPoints: stock, zLimits: { ...U.sections[0].z, rangeActive: false } });
    const L = fin.gcode.split('\n').filter((l) => /^N\d+ G1/.test(l)).map((l) => l.replace(/^N\d+ /, ''));
    // Čelo 7-8 svisle dolů a hned po dně (jeden řetěz, bez odjezdu).
    const k = L.findIndex((l) => /^G1 X35\.156 Z200\.009/.test(l));
    expect(k).toBeGreaterThan(0);
    expect(L[k + 1]).toMatch(/^G1 X11\.744 Z200\.009/);
    expect(L[k + 2]).toMatch(/^G1 X11\.744 Z168/);
    // Stěna 18-17 se nevynechá; pravidlo 15 nic nehlásí.
    expect(L.some((l) => /^G2 X12\.579 Z99\.757/.test(l))).toBe(false);
    expect(fin.gcode).toMatch(/G2 X12\.579 Z99\.757/);
    expect(fin.errors.some((e) => /pravidlo 15/.test(e.msg))).toBe(false);
    expect(validateToolpath(fin.calcSim.simPath, fin.params, fin.calc.stockPathSegments, {})).toHaveLength(0);
    // Dokončení bere jen přídavek (+ zbytek po vrstvách), nikde plnou hloubku.
    const sp = fin.calcSim.simPath;
    let worst = 0;
    for (let i = 1; i < sp.length; i++) {
      if (sp[i].type === 'G0') continue;
      for (let t = 0; t <= 1; t += 0.05) {
        const x = sp[i - 1].x + (sp[i].x - sp[i - 1].x) * t, z = sp[i - 1].z + (sp[i].z - sp[i - 1].z) * t;
        const top = maxXAt(fin.calc.stockPathSegments, z);
        if (top !== null) worst = Math.max(worst, top - (x - 5));
      }
    }
    expect(worst).toBeLessThan(0.8);
  }, 300000);

  it('bez „Hrub. bez schodků" se schody na stěnách nedojíždějí', async () => {
    const sec = U.sections[2];
    const r = await runCamProg({ params: { ...U.params, roughingStrategy: 'zigzag', doFinishing: false, noStepRoughing: false },
      contourPoints: U.contourPoints, stockPoints: sec.stock, zLimits: sec.z });
    expect(r.calc.passes.some((p) => p.floorZigzag)).toBe(true);
    expect(r.calc.passes.some((p) => p.wallClean)).toBe(false);
  }, 180000);

  it('zigzagSteepLimit: svisle jen po vyhrubované stěně, jinak úhel zanoření', () => {
    const prms = { ...buildNarrowKnife({ kind: 'round', radius: 5 }).tool, roughingStrategy: 'zigzag', finishAllowance: 0.2 };
    const face = { type: 'line', p1: { x: 30, z: 100 }, p2: { x: 10, z: 100 } };
    const line = (a, b) => ({ type: 'line', p1: a, p2: b });
    const cleared = [line({ x: 0, z: 120 }, { x: 5.1, z: 120 }), line({ x: 5.1, z: 120 }, { x: 5.1, z: 80 }), line({ x: 5.1, z: 80 }, { x: 0, z: 80 })];
    const full = [line({ x: 0, z: 120 }, { x: 40, z: 120 }), line({ x: 40, z: 120 }, { x: 40, z: 80 }), line({ x: 40, z: 80 }, { x: 0, z: 80 })];
    expect(zigzagSteepLimit(true, prms, face, cleared, 5, 45)).toBe(90);
    expect(zigzagSteepLimit(true, prms, face, full, 5, 45)).toBe(45);
    expect(zigzagSteepLimit(false, prms, face, cleared, 5, 45)).toBe(45);
  });

  it('sectionFinishAtEnd: úseky bez dokončení, za nimi část „Na hotovo" přes celý rozsah', () => {
    const S = { params: { roughingStrategy: 'zigzag', doFinishing: true }, zLimits: { rangeActive: true, rangeStart: 5, rangeEnd: 1 }, xLimits: {} };
    const fin = sectionFinishBegin(S);
    expect(fin.on).toBe(true);
    expect(S.params.doFinishing).toBe(false);
    const mk = (s, o) => ({ name: o.name, gcode: o.gcode, params: JSON.parse(JSON.stringify(s.params)), zLimits: JSON.parse(JSON.stringify(s.zLimits)) });
    const parts = [mk(S, { name: 'Úsek 1', gcode: 'A' })];
    const base = { z: { rangeActive: false }, x: {} };
    const out = sectionFinishEnd(S, fin, { parts, baseLimits: base, regen: () => { S.manualGCode = 'FIN'; }, makePart: mk });
    expect(out.map((p) => p.name)).toEqual(['Úsek 1', 'Na hotovo']);
    expect(out[1].params.finishOnly).toBe(true);
    expect(out[1].zLimits.rangeActive).toBe(false);
    expect(out[0].params.doFinishing).toBe(true);
    expect(S.params.finishOnly).toBe(false);
    // Jiná strategie: beze změny.
    const S2 = { params: { roughingStrategy: 'longitudinal', doFinishing: true } };
    expect(sectionFinishBegin(S2).on).toBe(false);
    expect(S2.params.doFinishing).toBe(true);
    // ↺ Reset s aktivní „Na hotovo": její `finishOnly` se nepřenese
    // (uživatel 2. 11.: hláška „jen dokončovací operace" v záložce Hrub.).
    expect(out[1].finishAtEnd).toBe(true);
    expect(baseFinishOnly(out, 1, true)).toBe(false);
    expect(baseFinishOnly(out, 0, true)).toBe(true);    // ruční volba jinde platí
    const old = [{ params: {} }, { name: 'Na hotovo', params: { finishOnly: true } }];   // soubor bez značky
    expect(baseFinishOnly(old, 1, true)).toBe(false);
  });
});
