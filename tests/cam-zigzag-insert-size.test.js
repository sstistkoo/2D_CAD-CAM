// Cik cak s různou velikostí kulaté destičky (R10–R20) — díl uživatele
// projekt_2026-11-06 (3) (soustruh, zářez V u bodů 6–7 vedle hrbu, ap 8).
// Uživatel: „rozbil si mně dráhy u cik cak, má to jet v celku z jedné strany
// na druhou … chyba bude ve velikosti plátku" (s R5 dobře, s R20 špatně).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor, sectionStepLimits } from '../js/calculators/cam/sim/xzSections.js';
import { sectionRanges } from '../js/calculators/cam/ops/sections/sectionRanges.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const base = JSON.parse(readFileSync(join(DIR, 'lathe-zigzag-v-insert-size.camprog'), 'utf8'));
// Destička R a úzký držák k ní (jako 🔧 SRDPN úzký: šířka R − 0,5).
const withR = (R, side) => {
  const p = JSON.parse(JSON.stringify(base));
  const k = R / 20;
  p.params = { ...p.params, toolRadius: R, roughingSide: side, doFinishing: false,
    holderProfile: { sideA: base.params.holderProfile.sideA.map((q) => ({ x: q.x * k, z: q.z >= 150 ? 150 : q.z * k })), sideB: [] } };
  return p;
};
const kol = (r) => validateToolpath(r.calcSim.simPath, r.params, r.calc.stockPathSegments, { planStock: true }).filter((e) => e.area > 0.5);
const inside = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c; } return c; };

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
  return { out, stock };
}

describe('Cik cak — zářez V a kapsy pro každou velikost destičky', () => {
  it('R20 zprava po úsecích: zářez V přes hranici úseku jedním cik cakem od stěny ke stěně (Ú2)', async () => {
    // Dřív: cik cak pod vrstvou X88 končil na jejím začátku Z548,3, V za ním
    // sjela jízda po stěně jedním tahem 14 mm a kousky zprava.
    const { out } = await sections(withR(20, 'right'));
    for (const r of out) expect(kol(r)).toHaveLength(0);
    const zz = out[1].calc.passes.filter((p) => p.floorZigzag && !p.beyondStart);
    const v = zz.find((p) => p.moves.some((m) => m.x < 77 && m.z > 548 && m.z < 553) && p.moves.some((m) => m.x < 77 && m.z > 556 && m.z < 562));
    expect(v).toBeTruthy();
  }, 300000);

  it('R10 zprava celý program: zářez V pod spodkem cik caku vybraný (dřív zůstal celý)', async () => {
    const r = await runCamProg(withR(10, 'right'));
    expect(kol(r)).toHaveLength(0);
    const st = machinedFor(r.S, r.calcSim).points;
    for (const [x, z] of [[52, 556], [58, 552], [62, 562]]) expect(inside(st, x, z), `X${x} Z${z}`).toBe(false);
  }, 300000);

  it('R15 zleva po úsecích: hluboká kapsa X309–447 vybraná (dřív 2,9 cm²)', async () => {
    const { out, stock } = await sections(withR(15, 'left'));
    for (const r of out) expect(kol(r)).toHaveLength(0);
    for (const [x, z] of [[60, 330], [60, 360], [60, 390], [70, 420]]) expect(inside(stock, x, z), `X${x} Z${z}`).toBe(false);
  }, 300000);

  it('R20 zleva celý program: navazující obrácená vrstva nejede rychloposuvem přes čelo', async () => {
    const r = await runCamProg(withR(20, 'left'));
    expect(kol(r)).toHaveLength(0);
  }, 300000);

  for (const R of [10, 20]) {
    it(`R${R} zprava po úsecích: údolí pod S7 jedním cik cakem od stěny hrbu k levé stěně (nedělí se hranicí)`, async () => {
      // Díl (4): Ú1 jel cik cak mezi stěnou hrbu a hranicí S7 (N2050 Z556.262)
      // až na X86 a Ú2 vrstvy od hranice doleva (N3050 Z305.948) — „úsek
      // nemá dělit tu dráhu v polotovaru na dvě části".
      const { out } = await sections(withR(R, 'right'));
      for (const r of out) expect(kol(r)).toHaveLength(0);
      // Ú1 vlevo od hrbu pod dno údolí nejede — dno 127 je výška polotovaru,
      // vrstvy jedou středem nosu: mez 127 + R (díl (5) R20: dřív X142/X134
      // k hranici, N2050 Z556.262).
      const fl = 127 + R - 1;
      const low = out[0].calc.passes.some((p) => (p.moves || []).some((m) => m.x < fl && m.z > 550 && m.z < 585)
        || (p.type === 'long' && p.x < fl && Math.max(p.zStart, p.zEnd) < 585 && Math.max(p.zStart, p.zEnd) > 550));
      expect(low).toBe(false);
      // Nic nezajíždí do kontury (díl (5) R20: odskok jízdy po stěně ve V
      // N3550 G1 X72.121 Z558.512 do protější stěny).
      const st = machinedFor(out[1].S, out[1].calcSim).points;
      const top = (pts, z) => { let m = -Infinity; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a.z - z) * (b.z - z) <= 0 && a.z !== b.z) m = Math.max(m, a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z)); } return m; };
      for (let z = 536; z <= 580; z += 1) expect(top(st, z), `Z${z}`).toBeGreaterThan(top(base.contourPoints, z) + 0.1);
      // Ú2: jeden cik cak sahá od stěny hrbu (za hranicí, Z > 575) až k levé stěně (Z < 330).
      const zz = out[1].calc.passes.filter((p) => p.floorZigzag && !p.beyondStart);
      expect(zz.some((p) => p.moves.some((m) => m.x < 126 && m.z > 575) && p.moves.some((m) => m.x < 126 && m.z < 330))).toBe(true);
      // Každá vrstva za hranicí jen jednou (díl (6) R20: kapsa za začátkem úseku
      // jela vrstvu X144 Z596,6 → 556,3 podruhé, N2060).
      const xs = new Map();
      for (const p of out[1].calc.passes) if (p.type === 'zigzag' && !p.wallClean) {
        const seen = new Set();
        for (const m of p.moves) if (m.z > 560 && m.z < 590 && m.x > 100) seen.add(m.x.toFixed(1));
        for (const k of seen) xs.set(k, (xs.get(k) || 0) + 1);
      }
      for (const [k, n] of xs) expect(n, `X${k}`).toBe(1);
    }, 300000);
  }
});

