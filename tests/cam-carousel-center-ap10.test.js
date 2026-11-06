// Karusel Od středu, Cik cak, ap 10 — díl uživatele projekt_2026-11-06:
//  – Ú3 N3790: spodní vrstva po dně končila v půlce (X763,8) — pod obrácenou
//    vrstvou o ap výš jede až k čelu 3–4 (zigzagReverse.js `upperEnd`),
//  – Ú2 N2800: hluboká kapsa X309–447 pod Z68,2 brala jízda po stěně jedním
//    tahem 17 mm a vrstva chyběla — cik cak končí na Z68,2 a kapsu vezmou
//    kapsy pod spodkem po ap (zigzagFloor.js `sidePocket`).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor, xzSectionSteps, sectionStepLimits } from '../js/calculators/cam/sim/xzSections.js';
import { swapSimPath } from '../js/calculators/cam/sim/xzSim.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const inside = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c; } return c; };

describe('Karusel Od středu, ap 10 — dno k čelu, kapsa pod údolím po vrstvách', () => {
  it('✂ Po úsecích bez kolize, údolí i dno Ú3 obrobené', async () => {
    const prog = JSON.parse(readFileSync(join(DIR, 'carousel-zigzag-center-ap10.camprog'), 'utf8'));
    prog.params = { ...prog.params, doFinishing: false };
    const r0 = await runCamProg(prog);
    // Celý program (bez ✂ Po úsecích) taky bez kolize: dřív pod S4 vrstvy z rampy
    // jen doprava a Z47 po dně pod klínem (290 mm² držákem), u V zářezu jízda po stěně.
    expect(validateToolpath(swapSimPath(r0.calcSim.simPath), r0.calc._xz.S.params, r0.calc._xz.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
    const { steps } = xzSectionSteps(r0.S, r0.calc);
    const base = { z: JSON.parse(JSON.stringify(prog.zLimits)), x: JSON.parse(JSON.stringify(prog.xLimits)) };
    let stock = prog.stockPoints, mode = prog.params.stockMode;
    for (const st of steps) {
      const L = sectionStepLimits(r0.S, st, base);
      const r = await runCamProg({ ...prog, params: { ...prog.params, stockMode: mode }, stockPoints: stock, zLimits: L.zLimits, xLimits: L.xLimits });
      expect(validateToolpath(swapSimPath(r.calcSim.simPath), r.calc._xz.S.params, r.calc._xz.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
      stock = machinedFor(r.S, r.calcSim).points; mode = 'casting';
    }
    for (const [px, pz] of [[350, 44], [380, 43.5], [330, 44.5], [700, 46.5], [740, 46], [720, 46.2]]) expect(inside(stock, px, pz), `X${px} Z${pz}`).toBe(false);
  }, 300000);
});
