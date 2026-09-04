// ╔══════════════════════════════════════════════════════════════╗
// ║  Rampa pokračuje AŽ DOLŮ a dobere vrstvy pod poslední ap     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Hloubkový žebřík jde po celé Hloubce (`ap`) od povrchu, takže poslední krok
// obvykle přestřelí hranici, za kterou geometrie nepustí. U NEZAKRYTÉHO vjezdu
// to řeší „poslední (kratší) vrstva" v `ops/roughLong.js`. U `entryCapped`
// (vjezd na hranici rozsahu 📐) se spoléhalo na uzavírací krok řetězu — jenže
// ten je JEDNORÁZOVÝ (`entryRampClosed`), takže po jeho zavření hlubší hloubky
// neměly ŽÁDNÝ mechanismus a materiál pod poslední vrstvou zůstal stát.
//
// Nález uživatele 3.–4. 9. 2026 na tomhle dílu (rozsah Z 283–458, podélně
// zleva, polygon 15°): řetěz se zavřel na hloubce 9,803, hloubky 3,803 / 0,803
// / 0,054 vydaly NULU a pod vrstvou r 6,803 zůstalo až 2,52 mm nad offsetem
// v pásu Z 362–368. Zadání: *„ať to pokračuje až dolů i na rampě a dobere
// všechny vrstvy."*
//
// Hlídají se TŘI věci, každá měla vlastní vadu:
//   1. vrstva pod r 6,803 vůbec VZNIKNE (blok „pokračovat rampou až dolů"),
//   2. vjíždí se do ní RAMPOU a ta bere nejvýš `ap` — kotva musí sednout na
//      podlahu vrstvy nad ní (`residTopFrom` v `ops/long/entryRamp.js`).
//      Před opravou kotva přeskočila na o dva schody vyšší podlahu (r 10,3
//      místo 6,8) a rampa brala 5,9 mm, tedy skoro dvě `ap`,
//   3. v pásu po ní nezůstane materiál nad offsetovou čárou.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';

const fxDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam');
const AP = 3;          // Hloubka (`depthOfCut`) fixture
const LAST_FULL = 6.803;   // poslední vrstva celého žebříku

describe('podélně zleva: rampa pokračuje pod poslední vrstvu žebříku', () => {
  it('part-22: pod r 6,803 vznikne vrstva, vjíždí se rampou ≤ ap a pás Z 355–369 zůstane čistý', async () => {
    const prog = JSON.parse(readFileSync(join(fxDir, 'part-22-zleva-deep-ramp.camprog'), 'utf8'));
    const { calc, calcSim, gcode, params } = await runCamProg(prog);

    const longs = calc.passes.filter(p => p.type === 'long' && Number.isFinite(p.x));
    // ── 1. vrstva pod posledním celým krokem žebříku ──────────────────────
    const deep = longs.filter(p => p.x < LAST_FULL - 0.1).sort((a, b) => b.x - a.x)[0];
    expect(deep, 'pod r 6,803 nevznikla žádná vrstva — žebřík skončil o celé ap dřív').toBeTruthy();
    expect(deep.x).toBeGreaterThan(LAST_FULL - AP - 0.01);   // krok nesmí přesáhnout ap
    expect(deep.x).toBeLessThan(LAST_FULL - 0.25 * AP);      // a musí něco odebrat

    // ── 1b. JDE AŽ DOLŮ a NENÍ TO SLUPKA ─────────────────────────────────
    // Uživatel 4. 9. 2026: *„ta poslední vrstva nejde úplně dolů a nezanořuje
    // se správně, ale je jenom kousek od té předposlední."* Vrstva má dojet
    // k hrubovací kontuře (ta v tom pásu začíná na r 4,061), ne se zastavit
    // na syrovém obrysu (r 4,233) — a nesmí za sebou nechat druhou o 0,118 mm
    // níž s degenerovanou rampou.
    const contourMinX = Math.min(...(calc.offsetPath || [])
      .flatMap(sg => [sg.p1, sg.p2]).filter(q => q && q.z > 355).map(q => q.x));
    expect(deep.x - contourMinX,
      `poslední vrstva stojí ${(deep.x - contourMinX).toFixed(3)} mm nad hrubovací konturou`)
      .toBeLessThan(0.2);
    const slivers = longs.filter(p => p !== deep && Math.abs(p.x - deep.x) < 0.25 * AP);
    expect(slivers.map(p => +p.x.toFixed(3)), 'vedle poslední vrstvy stojí slupka').toEqual([]);

    // ── 2. vjezd je RAMPA a kotva sedí na podlaze vrstvy nad ní ───────────
    expect(deep.ramp, 'do vrstvy se musí vjíždět rampou, ne kolmým zápichem').toBeTruthy();
    const rampDx = deep.ramp.x0 - deep.x;
    expect(rampDx).toBeGreaterThan(0);
    expect(rampDx, `rampa bere ${rampDx.toFixed(3)} mm, víc než ap ${AP}`).toBeLessThanOrEqual(AP + 0.01);
    // Kotva PATŘÍ na podlahu vrstvy nad (r 6,803), ne na o schod vyšší
    // (9,78 / 10,31) — přesně tenhle přeskok dělalo „vyšší ze dvou vzorků".
    expect(Math.abs(deep.ramp.x0 - LAST_FULL)).toBeLessThan(0.1);
    // Úhel rampy = úhel zanoření (15° z natočení polygonu).
    const tan = rampDx / Math.abs(deep.ramp.z0 - deep.zStart);
    expect(tan).toBeCloseTo(Math.tan(15 * Math.PI / 180), 2);
    expect(gcode).toMatch(/Rampa 15\.0°/);

    // ── 3. pás pod poslední vrstvou zůstane bez materiálu nad offsetem ────
    const rm = new MaterialRemoval(params, calcSim.stockPathSegments, { planningOutline: true });
    const sim = calcSim.simPath || [];
    expect(rm.valid && sim.length > 2).toBe(true);
    rm.advanceTo(sim, sim.length - 1);
    const xOffAt = (z) => {
      let top = null;
      for (const s of (calc.offsetPath || [])) {
        const a = s.p1, b = s.p2;
        if (!a || !b) continue;
        if (z < Math.min(a.z, b.z) - 1e-9 || z > Math.max(a.z, b.z) + 1e-9) continue;
        const t = Math.abs(b.z - a.z) < 1e-9 ? 0 : (z - a.z) / (b.z - a.z);
        const x = a.x + (b.x - a.x) * t;
        if (top === null || x > top) top = x;
      }
      return top;
    };
    const xResTopAt = (z) => {
      let top = null;
      for (const lp of rm.model.loops) {
        for (let i = 0; i < lp.length; i++) {
          const a = lp[i], b = lp[(i + 1) % lp.length];
          if ((a.z - z) * (b.z - z) > 0 || Math.abs(a.z - b.z) < 1e-12) continue;
          const x = a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z);
          if (top === null || x > top) top = x;
        }
      }
      return top;
    };
    let worst = 0;
    for (let z = 355; z <= 369; z += 0.05) {
      const xo = xOffAt(z), xr = xResTopAt(z);
      if (xo === null || xr === null) continue;
      if (xr - xo > worst) worst = xr - xo;
    }
    // Před opravou 2,521 mm (celá vrstva stála), po ní 0,000 mm. Práh drží
    // obojí od sebe s rezervou.
    expect(worst, `v pásu Z 355–369 zůstalo ${worst.toFixed(3)} mm nad offsetem`).toBeLessThan(0.5);
  });
});
