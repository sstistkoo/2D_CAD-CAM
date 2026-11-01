// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – Cik cak na dílu uživatele po úsecích (1. 11. 2026)      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díl uživatele (odlitek, R5 v úzkém držáku SRDPN): Ú1 hrbol 5-4 s levým
// bokem 5-6-7-8, Ú2 údolí 13…S6, Ú3 vlevo. Fixture nese rozsahy úseků
// a zbytkové polotovary Ú2/Ú3 (jak je aplikace předává po předchozím úseku).
//  Ú1: levý bok hrbolu zleva ze vzduchu až k úrovni S6 (zigzagReverse.js).
//  Ú2: spodek pod S6 cik cakem místo zanořování, až ke stěně 7-8 v Ú1
//      (zigzagFloor.js). Ú3: spodek 19–18 cik cakem i mezi šikmými stěnami.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { maxXAt } from '../js/calculators/cam/passHelpers.js';

const U = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases', 'zigzag-sections.json'), 'utf8'));
const run = (sec, strat) => runCamProg({ params: { ...U.params, roughingStrategy: strat, doFinishing: false },
  contourPoints: U.contourPoints, stockPoints: sec.stock || U.stockPoints, zLimits: sec.z });
const left = (r) => {
  const rm = new MaterialRemoval(r.params, r.calc.stockPathSegments);
  rm.advanceTo(r.calcSim.simPath, r.calcSim.simPath.length);
  return Math.abs(rm.model.area());
};
const hits = (r) => validateToolpath(r.calcSim.simPath, r.params, r.calc.stockPathSegments, {});

describe('Cik cak po úsecích — díl uživatele', () => {
  it('Ú1: levý bok hrbolu zleva až k úrovni S6, bez kolize, méně zbytku', async () => {
    const zz = await run(U.sections[0], 'zigzag');
    const xs = zz.calc.passes.filter((p) => p.reversedLayer).map((p) => p.moves[0].x);
    expect(xs.length).toBeGreaterThan(10);
    expect(Math.min(...xs)).toBeLessThan(23);          // až k S6 (r 16,744 + R + přídavek)
    expect(hits(zz)).toHaveLength(0);
    expect(left(zz)).toBeLessThan(left(await run(U.sections[0], 'longitudinal')) - 50);
  }, 180000);

  it('Ú2: spodek cik cakem až ke stěně 7-8 (Z 199,8), bez kolize', async () => {
    const zz = await run(U.sections[1], 'zigzag');
    const fz = zz.calc.passes.filter((p) => p.floorZigzag);
    expect(fz).toHaveLength(1);
    expect(Math.max(...fz[0].moves.map((m) => m.z))).toBeGreaterThan(199.5);
    expect(hits(zz)).toHaveLength(0);
    expect(left(zz)).toBeLessThan(left(await run(U.sections[1], 'longitudinal')) - 50);
  }, 180000);

  it('Ú3: spodek 19–18 (u S15) cik cakem i mezi šikmými stěnami, bez kolize', async () => {
    const zz = await run(U.sections[2], 'zigzag');
    expect(zz.calc.passes.filter((p) => p.floorZigzag)).toHaveLength(1);
    expect(hits(zz)).toHaveLength(0);
    expect(validateToolpath(zz.calcSim.simPath, zz.params, zz.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
    expect(left(zz)).toBeLessThan(left(await run(U.sections[2], 'longitudinal')) - 50);
  }, 180000);

  it('spodek: začátek u pravé stěny, bez výjezdů po stěně nahoru a zpět', async () => {
    const zz = await run(U.sections[1], 'zigzag');
    const mv = zz.calc.passes.find((p) => p.floorZigzag).moves;
    expect(mv[0].z).toBeGreaterThan(199.5);                        // nad pravou stěnou 7-8
    // Žádný pohyb nahoru (+X) uvnitř spodku: vrstva, rampa dolů, vrstva…
    for (let i = 2; i < mv.length; i++) expect(mv[i].x).toBeLessThanOrEqual(mv[i - 1].x + 1e-6);
    expect(validateToolpath(zz.calcSim.simPath, zz.params, zz.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
    // Dno bez dojezdu zpět po stejné hloubce (uživatel: N3970/N3980).
    const n = mv.length;
    expect(Math.abs(mv[n - 1].x - mv[n - 2].x) > 1e-6 || Math.abs(mv[n - 2].x - mv[n - 3].x) > 1e-6).toBe(true);
  }, 180000);

  it('spodek nikde pod hrubovacím offsetem (Ú3 N6200: rampa za šikmou stěnou)', async () => {
    for (const sec of [U.sections[1], U.sections[2]]) {
      const zz = await run(sec, 'zigzag');
      const mv = zz.calc.passes.find((p) => p.floorZigzag).moves;
      const raw = zz.calc.offsetPathNoGuide;
      for (let k = 1; k < mv.length; k++) {
        for (let t = 0; t <= 1; t += 0.02) {
          const x = mv[k - 1].x + (mv[k].x - mv[k - 1].x) * t, z = mv[k - 1].z + (mv[k].z - mv[k - 1].z) * t;
          const f = maxXAt(raw, z);
          if (f !== null) expect(x).toBeGreaterThan(f - 0.01);
        }
      }
    }
  }, 180000);

  it('Ú2 dokončování: po pravém čele 7-8 dolů a po dně (N5290), bez kolize', async () => {
    const sec = U.sections[1];
    const zz = await runCamProg({ params: { ...U.params, roughingStrategy: 'zigzag', doFinishing: true },
      contourPoints: U.contourPoints, stockPoints: sec.stock, zLimits: sec.z });
    const L = zz.gcode.split('\n');
    const k = L.findIndex((l) => /DOKONCOVANI/.test(l));
    const fin = L.slice(k).filter((l) => /^N\d+ G1/.test(l)).slice(0, 3).map((l) => l.replace(/^N\d+ /, ''));
    // Nájezd nad hranou čela, svisle dolů po čele (Z 200), pak po dně doleva.
    expect(fin[1]).toMatch(/^G1 X11\.744 Z199\.99\d/);
    expect(fin[2]).toMatch(/^G1 X11\.744 Z168/);
    expect(validateToolpath(zz.calcSim.simPath, zz.params, zz.calc.stockPathSegments, {})).toHaveLength(0);
  }, 180000);

  it('Ú3: schody na šikmých stěnách 18-17 a 20-19 dojede jízda po offsetu', async () => {
    const zz = await run(U.sections[2], 'zigzag');
    const w = zz.calc.passes.filter((p) => p.wallClean);
    expect(w).toHaveLength(2);
    // Vpravo shora doleva (−Z), vlevo shora doprava (+Z); obě dolů do rohu u dna.
    const dz = w.map((p) => Math.sign(p.moves[p.moves.length - 1].z - p.moves[0].z));
    expect(dz.sort()).toEqual([-1, 1]);
    for (const p of w) for (let k = 2; k < p.moves.length; k++) expect(p.moves[k].x).toBeLessThanOrEqual(p.moves[k - 1].x + 1e-6);
    expect(validateToolpath(zz.calcSim.simPath, zz.params, zz.calc.stockPathSegments, { planStock: true })).toHaveLength(0);
  }, 180000);

  it('obrácené vrstvy: výjezd po oblouku stěny bez schodků (N4270)', async () => {
    const zz = await run(U.sections[1], 'zigzag');
    const rev = zz.calc.passes.filter((p) => p.reversedLayer);
    expect(rev.length).toBeGreaterThan(5);
    // Na oblouku žádný čistě svislý krok (+X bez Z) — jen šikmo po stěně.
    // Nejvyšší vrstva pokračuje po průměru přes vršek hrbolu až dolů na
    // svou výšku (z 135), kde končí vrstva zprava.
    const top = rev[0].moves;
    expect(Math.max(...top.map((m) => m.x))).toBeGreaterThan(45.3);
    expect(top[top.length - 1].z).toBeGreaterThan(134.5);
    expect(top[top.length - 1].x).toBeCloseTo(top[1].x, 3);
    for (const p of rev) {
      for (let k = 2; k < p.moves.length; k++) {
        const a = p.moves[k - 1], b = p.moves[k];
        if (b.x > a.x + 1e-6) expect(Math.abs(b.z - a.z)).toBeGreaterThan(1e-3);
      }
    }
  }, 180000);
});
