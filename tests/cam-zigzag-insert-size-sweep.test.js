// Cik cak při změně velikosti destičky (R15–R20), zleva — přehled 6. 11. 2026
// („zkontroluj, jestli tam nejsou jiné chyby při změně podmínek"):
//  - obrácená vrstva vystoupala / sjela na dno, které už projela jiná vrstva,
//    a projela ho podruhé (zigzagReverse.js `floorDone`): soustruh díl (3) R20
//    X209,22 Z−20…77, díl (2) R15 X45,79 Z−13…10 a X24,3 Z256…359;
//  - odskok na konci cik caku šikmo do stěny o 0,19 mm do přídavku
//    (zigzagFloor.js `retractDir`): díl (2) R20 N1790 G1 X31.230 Z91.083.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor, sectionStepLimits } from '../js/calculators/cam/sim/xzSections.js';
import { sectionRanges } from '../js/calculators/cam/ops/sections/sectionRanges.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const load = (n) => JSON.parse(readFileSync(join(DIR, n), 'utf8'));
const withR = (src, R, side) => {
  const p = JSON.parse(JSON.stringify(src));
  const k = R / (+src.params.toolRadius);
  p.params = { ...p.params, toolRadius: R, roughingSide: side, roughingStrategy: 'zigzag', doFinishing: false,
    holderProfile: { sideA: src.params.holderProfile.sideA.map((q) => ({ x: q.x * k, z: q.z >= 150 ? 150 : q.z * k })), sideB: [] } };
  return p;
};
const kol = (r) => validateToolpath(r.calcSim.simPath, r.params, r.calc.stockPathSegments, { planStock: true }).filter((e) => e.area > 0.5);

// Tatáž vodorovná vrstva ve dvou průchodech (překryv > 3 mm na stejné výšce).
function dups(r) {
  const segs = [];
  r.calc.passes.forEach((p, i) => {
    if (p.type === 'long' && Number.isFinite(p.x)) segs.push({ i, x: p.x, a: Math.min(p.zStart, p.zEnd), b: Math.max(p.zStart, p.zEnd) });
    else if (p.type === 'zigzag' && !p.wallClean && p.moves) for (let k = 1; k < p.moves.length; k++) {
      const m0 = p.moves[k - 1], m1 = p.moves[k];
      if (m1.g === 'G1' && Math.abs(m1.x - m0.x) < 1e-3) segs.push({ i, x: m1.x, a: Math.min(m0.z, m1.z), b: Math.max(m0.z, m1.z) });
    }
  });
  const out = [];
  for (let u = 0; u < segs.length; u++) for (let v = u + 1; v < segs.length; v++) {
    const A = segs[u], B = segs[v];
    if (A.i !== B.i && Math.abs(A.x - B.x) <= 0.05 && Math.min(A.b, B.b) - Math.max(A.a, B.a) > 3) out.push(`X${A.x.toFixed(2)} Z${Math.max(A.a, B.a).toFixed(0)}`);
  }
  return out;
}

// Střed nosu blíž ke kontuře než R + přídavek − 0,05 (čára po ose se nepočítá).
function intoAllowance(r) {
  const lim = (+r.params.toolRadius) + (+r.params.finishAllowance || 0) - 0.05;
  const segs = [];
  for (const s of r.calc.contourSegments) {
    if (s.type === 'arc') {
      let a0 = s.startAngle, a1 = s.endAngle;
      if (s.dir === 'G3') { while (a1 < a0) a1 += 2 * Math.PI; } else { while (a1 > a0) a1 -= 2 * Math.PI; }
      const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * s.r / 0.3));
      let px = s.p1.x, pz = s.p1.z;
      for (let k = 1; k <= n; k++) { const t = a0 + (a1 - a0) * k / n; const x = s.cx + s.r * Math.sin(t), z = s.cz + s.r * Math.cos(t); segs.push([px, pz, x, z]); px = x; pz = z; }
    } else if (!(Math.abs(s.p1.x) < 1e-6 && Math.abs(s.p2.x) < 1e-6)) segs.push([s.p1.x, s.p1.z, s.p2.x, s.p2.z]);
  }
  const dist = (x, z) => { let m = Infinity; for (const [ax, az, bx, bz] of segs) { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz; let t = L ? ((x - ax) * dx + (z - az) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); m = Math.min(m, Math.hypot(ax + dx * t - x, az + dz * t - z)); } return m; };
  const sp = r.calcSim.simPath, hits = [];
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    if (b.type === 'G2' || b.type === 'G3') { if (dist(b.x, b.z) < lim) hits.push([b.x, b.z]); continue; }
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
    for (let k = 0; k <= n; k++) { const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n; if (dist(x, z) < lim) { hits.push([x, z]); break; } }
  }
  return hits;
}

async function sections(prog) {
  const r0 = await runCamProg(prog);
  const zs = r0.calc.stockWorldPoints.map((p) => p.zReal);
  const steps = sectionRanges(r0.calc.sectionPlan, { lo: Math.min(...zs), hi: Math.max(...zs) }, null);
  const lim = { z: JSON.parse(JSON.stringify(prog.zLimits)), x: JSON.parse(JSON.stringify(prog.xLimits)) };
  let stock = prog.stockPoints, mode = prog.params.stockMode;
  const out = [];
  for (const st of steps) {
    const L = sectionStepLimits(r0.S, st, lim);
    const r = await runCamProg({ ...prog, params: { ...prog.params, stockMode: mode }, stockPoints: stock, zLimits: L.zLimits, xLimits: L.xLimits });
    out.push(r);
    stock = machinedFor(r.S, r.calcSim).points; mode = 'casting';
  }
  return out;
}

describe('Cik cak zleva při jiné velikosti destičky — bez dvojích jízd a zajetí do přídavku', () => {
  it('díl (3) R20 celý program: dno u čela X209,22 jen jednou', async () => {
    const r = await runCamProg(withR(load('lathe-zigzag-v-insert-size.camprog'), 20, 'left'));
    expect(kol(r)).toHaveLength(0);
    expect(dups(r)).toEqual([]);
  }, 300000);

  it('díl (2) R15 po úsecích: dna jen jednou (X45,79 u čela, X24,3 Z256–359)', async () => {
    const us = await sections(withR(load('lathe-zigzag-wall-steps.camprog'), 15, 'left'));
    for (const r of us) { expect(kol(r)).toHaveLength(0); expect(dups(r)).toEqual([]); }
  }, 300000);

  it('díl (2) R20 po úsecích: odskok cik caku nezajede do přídavku (N1790)', async () => {
    const us = await sections(withR(load('lathe-zigzag-wall-steps.camprog'), 20, 'left'));
    for (const r of us) expect(kol(r)).toHaveLength(0);
    // Zbývá jen drobnost u osy na pravém konci (X0,5 Z366, < 0,1 mm); u oblouku S19–S20 nic.
    const hits = us.flatMap(intoAllowance).filter(([x]) => x > 5);
    expect(hits).toEqual([]);
  }, 300000);
});
