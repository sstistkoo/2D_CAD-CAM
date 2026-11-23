// Kontrola pořadí P7 (scripts/lib/camRuleOrder.mjs): „přes hrb dřív, než je
// pravá strana hotová". Od 11. 11. 2026 se nehotovo měří jen z materiálu,
// který program později opravdu odebere (`finalLoops`) — klín u strmé stěny,
// který zůstane navždy (hlásí ho P3), pořadí neporuší. Na karuselu se tak
// P7 „vpravo ještě 50,63 mm" ukázal být přesně klínem v drážce.
import { describe, it, expect } from 'vitest';
import { makeOrderChecks } from '../scripts/lib/camRuleOrder.mjs';
import { checkHumpContinuity } from '../scripts/lib/camRuleHump.mjs';
import { topXOnLoop } from '../js/calculators/cam/camMath.js';

const topAt = (loops, z) => {
  let t = null;
  for (const l of loops) { const v = topXOnLoop(l, z); if (v !== null && (t === null || v > t)) t = v; }
  return t;
};
// Díl s přídavkem: rovina X 10, hrb X 30 na Z 40…50 (zprava: pravá strana = Z > 50).
const allowLoop = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 40 }, { x: 30, z: 40 }, { x: 30, z: 50 },
  { x: 10, z: 50 }, { x: 10, z: 100 }, { x: 0, z: 100 }];
const stock = [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 100 }, { x: 0, z: 100 }];
// Stav při startu průchodu za hrbem: vlevo obrobeno na rovinu, vpravo stojí polotovar X 40.
const now = [[{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 40 }, { x: 30, z: 40 }, { x: 30, z: 50 },
  { x: 40, z: 50 }, { x: 40, z: 100 }, { x: 0, z: 100 }]];

const checks = (finalLoops) => makeOrderChecks({
  ap: 3, part: allowLoop, allowLoop, stockLoop: stock, guides: [], cutsFullWidth: false,
  offsetXAt: () => null, dir: 1, topAt, topXOnLoop, pointInLoop: () => 'inside', finalLoops,
});

describe('P7 – přes hrb dřív, než je pravá strana hotová', () => {
  it('pravou stranu program později obrobí → porušení pořadí', () => {
    const c = checks([allowLoop]);   // na konci je všechno na přídavku
    c.onPassStart(0, 12, 20, 12, now);
    expect(c.found.hump).toHaveLength(1);
    expect(c.found.hump[0].v).toBeCloseTo(30, 0);
  });

  it('bez konečného zbytku (null) jako dřív → porušení', () => {
    const c = checks(null);
    c.onPassStart(0, 12, 20, 12, now);
    expect(c.found.hump).toHaveLength(1);
  });

  it('materiál vpravo zůstane navždy (nedosažitelný) → pořadí neporušeno', () => {
    const c = checks(now);   // konec programu = tentýž stav vpravo
    c.onPassStart(0, 12, 20, 12, now);
    expect(c.found.hump).toEqual([]);
  });

  it('zůstane jen část → hlásí se jen to, co se později odebere', () => {
    // Vpravo nakonec zůstane klín do X 25 (15 mm nad přídavkem); teď stojí X 40 → 15 mm „nehotovo".
    const fin = [[{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 40 }, { x: 30, z: 40 }, { x: 30, z: 50 },
      { x: 25, z: 50 }, { x: 25, z: 100 }, { x: 0, z: 100 }]];
    const c = checks(fin);
    c.onPassStart(0, 12, 20, 12, now);
    expect(c.found.hump).toHaveLength(1);
    expect(c.found.hump[0].v).toBeCloseTo(15, 0);
  });
});

// Pravidlo 7 bod 2: PRVNÍ vrstva, která na hrb narazí, jede až na konec —
// i rychloposuvem přes hrb (Cik cak: kus za hrbem bere obrácená vrstva,
// pravidlo 20). Audit 23. 11. 2026, lathe-zigzag-stock-valley `N900`.
describe('P7 – první vrstva pod vrcholem smí pokračovat za hrbem', () => {
  const sp = [{ x: 40, z: 95, type: 'G0' }, { x: 12, z: 95, type: 'G0' }, { x: 12, z: 52, type: 'G1' }];
  it('tatáž hloubka řezala před hrbem, výš pod vrcholem nic → neporušeno', () => {
    const c = makeOrderChecks({ ap: 3, part: allowLoop, allowLoop, stockLoop: stock, guides: [], cutsFullWidth: false,
      offsetXAt: () => null, dir: 1, topAt, topXOnLoop, pointInLoop: () => 'inside', finalLoops: [allowLoop], sp });
    c.onPassStart(sp.length, 12, 20, 12, now);
    expect(c.found.hump).toEqual([]);
  });
  it('před hrbem už jela vrstva výš pod vrcholem → tahle není první, porušení', () => {
    const sp2 = [{ x: 40, z: 95, type: 'G0' }, { x: 20, z: 95, type: 'G0' }, { x: 20, z: 52, type: 'G1' }, ...sp];
    const c = makeOrderChecks({ ap: 3, part: allowLoop, allowLoop, stockLoop: stock, guides: [], cutsFullWidth: false,
      offsetXAt: () => null, dir: 1, topAt, topXOnLoop, pointInLoop: () => 'inside', finalLoops: [allowLoop], sp: sp2 });
    c.onPassStart(sp2.length, 12, 20, 12, now);
    expect(c.found.hump).toHaveLength(1);
  });
});

// Cik cak (pravidlo 20): hrb přejede vrstva zepředu a obrácená vrstva zezadu,
// potkají se na vršku. Audit 23. 11. 2026, karusel ap6 `N1590`, left-valley `N1910`.
describe('P7 – vrstva přes hrb: dvojice jízd u Cik cak', () => {
  // Špičatý hrb (vodorovná jízda po vršku by byla další „vrstva").
  const offsetXAt = (z) => (z >= 40 && z <= 50 ? 30 - Math.abs(z - 45) * 0.4 : 10);
  const run = (zEnd) => [
    { x: 12, z: 95, type: 'G0' }, { x: 12, z: 52, type: 'G1' }, { x: 28, z: 50, type: 'G1' }, { x: 30, z: 45, type: 'G1' },
    { x: 35, z: 45, type: 'G0' },
    { x: 12, z: 10, type: 'G0' }, { x: 12, z: 38, type: 'G1' }, { x: 28, z: 40, type: 'G1' },
    { x: offsetXAt(zEnd), z: zEnd, type: 'G1' }, { x: 35, z: zEnd, type: 'G0' },
  ];
  it('jízdy se potkají → hrb přejetý (jen Cik cak)', () => {
    expect(checkHumpContinuity(run(45.3), offsetXAt, { zigzag: true })).toEqual([]);
    expect(checkHumpContinuity(run(45.3), offsetXAt)).toHaveLength(1);
  });
  it('mezi jízdami zůstane kus hrbu → přerušení', () => {
    expect(checkHumpContinuity(run(42), offsetXAt, { zigzag: true })).toHaveLength(1);
  });
});
