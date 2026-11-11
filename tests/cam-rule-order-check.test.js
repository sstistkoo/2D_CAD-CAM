// Kontrola pořadí P7 (scripts/lib/camRuleOrder.mjs): „přes hrb dřív, než je
// pravá strana hotová". Od 11. 11. 2026 se nehotovo měří jen z materiálu,
// který program později opravdu odebere (`finalLoops`) — klín u strmé stěny,
// který zůstane navždy (hlásí ho P3), pořadí neporuší. Na karuselu se tak
// P7 „vpravo ještě 50,63 mm" ukázal být přesně klínem v drážce.
import { describe, it, expect } from 'vitest';
import { makeOrderChecks } from '../scripts/lib/camRuleOrder.mjs';
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
