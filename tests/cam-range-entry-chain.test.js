// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – řetěz zanoření od hranice rozsahu drží mřížku hloubek   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// part-11 zleva (polygon R 0,8 natočený 15°, ap 5) s hranicí na Z 2,153 —
// čelisti (pravidlo 16: tělo plátku do nich nesmí) nebo ruční rozsah 📐.
// Dvě vady, obě 12. 10. 2026:
//  1. Kotva rampy na hranici leží SPODKEM nosu na offsetové čáře
//     (`anchorLiftX` = rádius nosu), mřížka hloubek polygonu ale ve STŘEDU
//     nosu (`noseLiftX` = 0). Test „rampa nevezme víc než jednu vrstvu"
//     porovnával středy, vrstvu 34,566 zahodil, uzavírací krok ji nahradil
//     mělčí 35,366 a další vrstva 29,566 vzala 5,8 mm (openPass.js
//     `freshTooDeep`, roughLong.js `anchorDepthX`).
//  2. Vrstvu 29,566 pak vyjel vjezd, který o řetězu neví (nájezd rampou
//     z povrchu), řetěz zůstal na staré kotvě, uzavírací krok vydal tutéž
//     vrstvu podruhé (40 mm posuvem vzduchem) a vrstvy pod ní vypadly
//     (`advanceChainOver`, `winCovered` v roughLong.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures', 'cam', 'part-11-zleva-casting.camprog');

/** Délka materiálu ve svislici z (sudo-liché pravidlo přes smyčky). */
function colLen(loops, z) {
  const cs = [];
  for (const l of loops) for (let i = 0; i < l.length; i++) {
    const a = l[i], b = l[(i + 1) % l.length];
    if ((a.z - z) * (b.z - z) > 0 || a.z === b.z) continue;
    if ((a.z === z && b.z > z) || (b.z === z && a.z > z)) continue;
    cs.push(a.x + (z - a.z) / (b.z - a.z) * (b.x - a.x));
  }
  cs.sort((p, q) => p - q);
  let s = 0;
  for (let i = 0; i + 1 < cs.length; i += 2) s += cs[i + 1] - cs[i];
  return s;
}

async function check(tweak) {
  const prog = tweak(JSON.parse(readFileSync(FIX, 'utf8')));
  const r = await runCamProg(prog);
  const ap = parseFloat(r.params.depthOfCut);
  // (a) žádný průchod na téže hloubce přes totéž okno Z dvakrát
  const longs = r.calc.passes.filter(p => p.type === 'long' && Number.isFinite(p.zStart) && Number.isFinite(p.zEnd));
  const dup = [];
  for (let i = 0; i < longs.length; i++) for (let j = i + 1; j < longs.length; j++) {
    const a = longs[i], b = longs[j];
    if (Math.abs(a.x - b.x) > 1e-3) continue;
    const lo = Math.max(Math.min(a.zStart, a.zEnd), Math.min(b.zStart, b.zEnd));
    const hi = Math.min(Math.max(a.zStart, a.zEnd), Math.max(b.zStart, b.zEnd));
    if (hi - lo > 5) dup.push(`X ${a.x.toFixed(3)}: Z ${lo.toFixed(1)}…${hi.toFixed(1)}`);
  }
  // (b) žádný posuv v ose Z (řez vrstvy) nevezme radiálně víc než ap
  const sp = r.calcSim.simPath, lines = r.gcode.split('\n');
  const finAt = lines.findIndex(l => /DOKONCOVANI/.test(l));
  const rm = new MaterialRemoval(r.params, r.calcSim.stockPathSegments, {});
  let worst = { v: 0, line: '' };
  for (let i = 1; i < sp.length; i++) {
    const before = rm.model.loops;
    rm.advanceTo(sp, i);
    const a = sp[i - 1], b = sp[i];
    if (b.type === 'G0' || (finAt >= 0 && b.originalLineIdx > finAt)) continue;
    if (Math.abs(b.x - a.x) > 1e-6 || Math.abs(b.z - a.z) < 1e-6) continue;
    const after = rm.model.loops;
    for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z += 0.5) {
      const d = colLen(before, z) - colLen(after, z);
      if (d > worst.v) worst = { v: d, line: (lines[b.originalLineIdx] || '').trim() };
    }
  }
  return { dup, worst, ap };
}

describe('řetěz zanoření od hranice rozsahu drží mřížku hloubek (part-11 zleva)', () => {
  it('hranice z čelistí (pravidlo 16)', async () => {
    const { dup, worst, ap } = await check(p => p);
    expect(dup).toEqual([]);
    expect(worst.v, worst.line).toBeLessThanOrEqual(ap + 0.05);
  }, 180000);

  it('ruční rozsah od Z 2,153 (bez čelistí)', async () => {
    const { dup, worst, ap } = await check(p => ({ ...p, zLimits: { ...p.zLimits, chuckActive: false, rangeStart: 2.153 } }));
    expect(dup).toEqual([]);
    expect(worst.v, worst.line).toBeLessThanOrEqual(ap + 0.05);
  }, 180000);
});
