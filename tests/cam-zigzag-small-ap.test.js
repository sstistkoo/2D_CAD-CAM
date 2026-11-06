// Cik cak na karuselu (geometrie dílu uživatele (9)) s menším ap a z obou
// stran — dřív kolize, které se s ap uživatele neukázaly (kontrola 6. 11. 2026):
//  – zprava ap 1,2, Ú2: kapsa za hranicí jela první vedle vysokého materiálu
//    úseku (zigzagBeyondStart.js — první jen když vedle nic nestojí),
//  – zleva ap 2, Ú3: kapsa končila u hranice a vyjela nahoru podél materiálu
//    Ú3 (návrat zpět do kapsy před výjezdem),
//  – zleva ap 4,8, Ú2: jízda po stěně sjela do nevybraného zářezu V
//    (zigzagFloor.js `coverMin`),
//  – zleva ap 1,2 celý program: vrstva po dně pod klínem řetězu ramp
//    (zigzagReverse.js `clearedUntil`).
// Fixture má uloženou starou bezpečnou polohu X150 Z5 — aplikace ji zahodí
// (CODE_OWNED_PARAMS), tady se nastaví X500 Z500 stejně.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor, xzSectionSteps, sectionStepLimits } from '../js/calculators/cam/sim/xzSections.js';
import { swapSimPath } from '../js/calculators/cam/sim/xzSim.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const kol = (r) => validateToolpath(swapSimPath(r.calcSim.simPath), r.calc._xz.S.params, r.calc._xz.calc.stockPathSegments, { planStock: true }).filter((e) => e.area > 0.5);

async function run(side, ap, sections) {
  const src = JSON.parse(readFileSync(join(DIR, 'carousel-face-swap-xz.camprog'), 'utf8'));
  const prog = { ...src, params: { ...src.params, roughingStrategy: 'zigzag', roughingSide: side, depthOfCut: ap, doFinishing: false, safeX: 500, safeZ: 500 } };
  const r0 = await runCamProg(prog);
  const out = [kol(r0).length];
  if (!sections) return out;
  const { steps } = xzSectionSteps(r0.S, r0.calc);
  const base = { z: JSON.parse(JSON.stringify(prog.zLimits)), x: JSON.parse(JSON.stringify(prog.xLimits)) };
  let stock = prog.stockPoints, mode = prog.params.stockMode;
  for (const st of steps) {
    const L = sectionStepLimits(r0.S, st, base);
    const r = await runCamProg({ ...prog, params: { ...prog.params, stockMode: mode }, stockPoints: stock, zLimits: L.zLimits, xLimits: L.xLimits });
    out.push(kol(r).length);
    stock = machinedFor(r.S, r.calcSim).points; mode = 'casting';
  }
  return out;
}

describe('Cik cak karusel — menší ap, obě strany, bez kolize', () => {
  it('zprava ap 1,2 po úsecích', async () => { expect((await run('right', 1.2, true)).every((n) => n === 0)).toBe(true); }, 600000);
  it('zleva ap 2 po úsecích', async () => { expect((await run('left', 2, true)).every((n) => n === 0)).toBe(true); }, 600000);
  it('zleva ap 4,8 po úsecích', async () => { expect((await run('left', 4.8, true)).every((n) => n === 0)).toBe(true); }, 600000);
  it('zleva ap 1,2 celý program', async () => { expect(await run('left', 1.2, false)).toEqual([0]); }, 600000);
});
