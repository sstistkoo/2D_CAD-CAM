// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kulatá R 10 zleva: kruhové vybrání, údolí a mez úseku   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díl uživatele 28. 9. 2026 („✂ Po úsecích", úsek 1 = Z −13…145,3; kulatá
// R 10, ap 2,5, zleva). Tři nálezy, každý hlídaný zvlášť:
//  1. burst kruhového vybrání (Z 17–51) na dně X 29,727 „našel tutéž kapsu"
//     v údolí Z 82–104 za hrbem a vzal tam tři vrstvy naráz (`N1470 G1
//     Z101.584 ; Přejezd materiálem posuvem`) — ops/long/pocketPass.js,
//     „TÁŽ KAPSA = PŘEKRYV V Z",
//  2. u meze úseku jelo šest zbytků přejezdu přes hrb dokola týž trojúhelník
//     (`G0 X48.331 / G0 Z142.601 / G1 X45.68 Z145.25`) — pocketHumpSplit.js,
//  3. zanoření ve vybrání jelo tětivou 38,7° nad obloukem a dobrání dna pak
//     tentýž kus stěny znovu — klíč plátku `pocketRampAlongWall`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'cam-cases', 'round-r10-recess-left.camprog');
const loadProg = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

let run = null;
const getRun = async () => (run ??= await runCamProg(loadProg()));
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

describe('CAM: kulatá R 10 zleva — vybrání, údolí, mez úseku', () => {
  it('dno vybrání (X 29,727) nevzniká jako vrstva v údolí za hrbem', async () => {
    const { calc } = await getRun();
    const stray = calc.passes.filter(p => p.type === 'long' && near(p.x, 29.727)
      && Math.max(p.zStart, p.zEnd) > 60);
    expect(stray.map(p => `X${p.x.toFixed(3)} Z${p.zStart.toFixed(1)}..${p.zEnd.toFixed(1)}`)).toEqual([]);
    // Údolí jede po vrstvách ap: 34,118 → 31,618 → 29,118 (ne 29,727 mezi nimi).
    const valley = calc.passes.filter(p => p.type === 'long' && p.zStart > 75 && p.zStart < 100 && p.x < 35);
    const order = valley.map(p => +p.x.toFixed(3));
    expect(order.indexOf(29.118)).toBeGreaterThan(order.indexOf(31.618));
  });

  it('u meze úseku jede přejezd přes hrb jen jednou, ne dokola', async () => {
    const { gcode, calc } = await getRun();
    expect(calc.passes.filter(p => p.humpCrossing).length).toBeLessThanOrEqual(1);
    const loops = gcode.split('\n').filter(l => /G0 Z142\.601\b/.test(l));
    expect(loops.length).toBeLessThanOrEqual(1);
  });

  it('zanoření ve vybrání jede po stěně (G1/G3), dobrání dna naváže na jeho konec', async () => {
    const { calc } = await getRun();
    const step = calc.passes.find(p => p.type === 'long' && near(p.x, 31.618) && p.zStart < 35);
    expect(step, 'vrstva X 31,618 ve vybrání').toBeTruthy();
    expect(step.ramp, 'tětiva místo stěny').toBeFalsy();
    expect((step.contourLeadIn || []).some(s => s.type === 'arc')).toBe(true);
    const clean = calc.passes.find(p => p.pocketClean && near(p.x, 29.727, 0.05));
    expect(clean, 'dobrání dna vybrání').toBeTruthy();
    // Začíná až za koncem rampy (Z 28,05), ne nahoře na stěně (Z 23,6 / 25,2).
    expect(clean.contourLeadIn[0].z1).toBeGreaterThan(step.zStart - 0.1);
  });

  it('vrstva údolí X 29,118 nejede nájezdem přes hotové vybrání', async () => {
    const { calc } = await getRun();
    const p = calc.passes.find(q => q.type === 'long' && near(q.x, 29.118) && q.zStart > 75);
    expect(p).toBeTruthy();
    const start = (p.contourLeadIn && p.contourLeadIn[0]) ? p.contourLeadIn[0].z1 : p.zStart;
    expect(start).toBeGreaterThan(70);
  });

  it('bez kolize nástroje a držáku (validátor, planStock, zleva)', async () => {
    const r = await getRun();
    const issues = validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments,
      { planStock: true, backside: true });
    expect(issues.map(i => ({ k: i.kind, x: +(i.x || 0).toFixed(2), z: +(i.z || 0).toFixed(2), a: +(i.area || 0).toFixed(2) }))).toEqual([]);
  });
});

// Úsek 2 téhož dílu (Z 145,3…373,9, polotovar po úseku 1). Nálezy 28. 9. 2026:
//  • údolí Z 239–270: vrstvy 55,595 … 40,595 jely jako „kapsa po kontuře"
//    a znovu jako dobírání ramp; 35,595 a 30,595 ještě potřetí jako odložené
//    vjezdy (roughLong.js `sameDepthCovers`),
//  • `G0 X40.656 Z195.228` — rychloposuv nosem do kůry (klíč `airSplitFullNose`),
//  • sjezdy 84° po čele Z 345–357 (guideOffsetJoin.js, krok 2b) a kolmý
//    `G1 X19.243` pod řetězem ramp (klíč `leadInStartNoPlunge`),
//  • poslední vrstva u osy objížděla nájezdem celý díl (klíč `leadInTailBelowPrev`).
const FIXTURE2 = join(__dirname, 'fixtures', 'cam-cases', 'round-r10-left-section2.camprog');
let run2 = null;
const getRun2 = async () => (run2 ??= await runCamProg(JSON.parse(readFileSync(FIXTURE2, 'utf8'))));

describe('CAM: kulatá R 10 zleva — úsek 2 (údolí za přírubou, čelo)', () => {
  it('žádná hloubka neběží v údolí za přírubou dvakrát', async () => {
    const { calc } = await getRun2();
    const ps = calc.passes.filter(p => p.type === 'long' && Number.isFinite(p.x)
      && Math.min(p.zStart, p.zEnd) > 239 && Math.min(p.zStart, p.zEnd) < 300 && Math.abs(p.zEnd - p.zStart) > 1);
    const dup = [];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (Math.abs(a.x - b.x) > 1e-6) continue;
      const ov = Math.min(Math.max(a.zStart, a.zEnd), Math.max(b.zStart, b.zEnd))
        - Math.max(Math.min(a.zStart, a.zEnd), Math.min(b.zStart, b.zEnd));
      if (ov > 1) dup.push(`X${a.x.toFixed(3)}`);
    }
    expect(dup).toEqual([]);
  });

  it('nic nesjíždí do materiálu strměji než 45° (rampy i nájezdy po kontuře)', async () => {
    const { calc } = await getRun2();
    const steep = [];
    for (const p of calc.passes) {
      if (p.type !== 'long') continue;
      if (p.ramp && Math.abs(p.ramp.z0 - p.zStart) > 1e-6
          && (p.ramp.x0 - p.x) / Math.abs(p.ramp.z0 - p.zStart) > 1.001) steep.push(`rampa X${p.x.toFixed(3)}`);
      for (const s of p.contourLeadIn || []) {
        if (s.type !== 'line' || !(s.x1 - s.x2 > 0.05)) continue;
        if ((s.x1 - s.x2) / Math.max(Math.abs(s.z2 - s.z1), 1e-9) > 1.001)
          steep.push(`nájezd X${p.x.toFixed(3)} (${s.x1.toFixed(3)},${s.z1.toFixed(3)})`);
      }
    }
    expect(steep).toEqual([]);
    expect(/G1 X19\.243 F/.test((await getRun2()).gcode)).toBe(false);
  });

  it('poslední vrstva u osy nejede nájezdem přes celý díl', async () => {
    const { calc } = await getRun2();
    // Od 29. 9. 2026 vjíždějí vrstvy u čela řetězem ramp a ty, které pak nic
    // neberou (X 5,595 … 0), vypadnou (ops/long/leadInChain.js) — hlídá se
    // každá vrstva u osy, která zůstala: nájezd ani rampa nezačíná za čelem.
    const last = calc.passes.filter(p => p.type === 'long' && p.x < 9 && Math.max(p.zStart, p.zEnd) > 355);
    expect(last.length).toBeGreaterThan(0);
    for (const p of last) {
      const z0 = p.contourLeadIn?.length ? p.contourLeadIn[0].z1 : p.ramp ? p.ramp.z0 : p.zStart;
      expect(z0).toBeGreaterThan(355);
    }
  });

  it('bez kolize nástroje a držáku (validátor, planStock, zleva)', async () => {
    const r = await getRun2();
    const issues = validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments,
      { planStock: true, backside: true });
    expect(issues.map(i => ({ k: i.kind, x: +(i.x || 0).toFixed(2), z: +(i.z || 0).toFixed(2), a: +(i.area || 0).toFixed(2) }))).toEqual([]);
  });
});
