// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – strategie Cik cak: vrstva za hrbolem ze vzduchu ke stěně ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 1. 11. 2026: vše podle pravidel jako Podélně. Jen vrstva za
// hrbolem, která by se zprava zanořila a vyjela vlevo do prázdného prostoru
// (polotovar tam není), se vezme obráceně: zajet vlevo do volna, brát doprava
// ke stěně hrbolu. Žádné kapsy přes údolí, žádný přejezd mezi úseky.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { buildNarrowKnife } from '../js/calculators/narrowHolders.js';
import { guideHiddenByReverse, sectionPlanForView } from '../js/calculators/cam/sim/zigzagView.js';

const P = (x, z, t = 'G1') => ({ type: t, x, z, r: 0, mode: 'ABS' });
// Hrbol (vrchol r 44), za ním šikmina, schod a svislá stěna do údolí.
const V = [[30, 0], [30, -10], [44, -16], [44, -24], [34, -32], [34, -36], [22, -36], [22, -56], [40, -60], [40, -64], [30, -70], [30, -80]];
const CONTOUR = [P(0, 0, 'G0'), ...V.map(([x, z]) => P(x, z))];
// Odlitek: nad hrbolem plný, hned vlevo od něj svislý skok dolů — údolí prázdné.
const CAST = [P(0, 3, 'G0'), P(48, 3), P(48, -37), P(26, -37), P(26, -55), P(44, -58), P(44, -66), P(34, -70), P(34, -83)];

const run = (over = {}, cast = true, zLimits = null) => runCamProg({
  params: { ...buildNarrowKnife({ kind: 'round', radius: 5 }).tool, roughingStrategy: 'zigzag', roughingSide: 'right', mode: 'RADIUS',
    stockMode: cast ? 'casting' : 'cylinder', stockDiameter: 100, stockLength: 90, stockFace: 3, depthOfCut: 2, feed: 0.12,
    finishAllowance: 0.2, doFinishing: false, ...over },
  contourPoints: CONTOUR, stockPoints: cast ? CAST : [],
  ...(zLimits ? { zLimits } : {}),
});
const left = (r) => {
  const rm = new MaterialRemoval(r.params, r.calc.stockPathSegments);
  rm.advanceTo(r.calcSim.simPath, r.calcSim.simPath.length);
  return Math.abs(rm.model.area());
};
const collisions = (r) => validateToolpath(r.calcSim.simPath, r.params, r.calc.stockPathSegments, { planStock: true });
const noHeader = (g) => g.replace(/HRUBOVANI \([A-Z ]*\)/, '');

describe('Cik cak — vrstva za hrbolem obráceně', () => {
  for (const side of ['right', 'left']) {
    it(`odlitek ${side}: vrstvy za hrbolem ze vzduchu ke stěně, bez kolize, méně zbytku`, async () => {
      const zz = await run({ roughingSide: side });
      const rev = zz.calc.passes.filter((p) => p.reversedLayer);
      expect(rev.length).toBeGreaterThan(3);
      // Vjezd rychloposuvem ve vzduchu, pak posuvem PROTI obvyklému směru ke
      // stěně: zprava je obvyklý −Z, takže +Z; zleva (zrcadlo) naopak.
      const sgn = side === 'right' ? 1 : -1;
      for (const p of rev) {
        expect(p.moves[0].g).toBe('G0');
        expect(p.moves[1].g).toBe('G1');
        expect(sgn * (p.moves[1].z - p.moves[0].z)).toBeGreaterThan(0);
      }
      expect(collisions(zz)).toHaveLength(0);
      const lg = await run({ roughingSide: side, roughingStrategy: 'longitudinal' });
      expect(left(zz)).toBeLessThan(left(lg) - 15);
    }, 120000);
  }

  it('tyč (vlevo materiál): G-kód shodný s Podélně', async () => {
    for (const side of ['right', 'left']) {
      const zz = await run({ roughingSide: side }, false);
      const lg = await run({ roughingSide: side, roughingStrategy: 'longitudinal' }, false);
      expect(zz.calc.passes.some((p) => p.reversedLayer)).toBe(false);
      expect(noHeader(zz.gcode)).toBe(noHeader(lg.gcode));
    }
  }, 120000);

  it('držák širší než destička → jen podélně a varování', async () => {
    const zz = await run({ holderProfile: null, holderWidth: 20, holderLength: 150 });
    expect(zz.calc.passes.some((p) => p.reversedLayer)).toBe(false);
    expect(zz.errors.some((e) => /Cik cak: držák/.test(e.msg))).toBe(true);
  }, 120000);

  it('Po úsecích: úsek končí na hranici, vjezd ze vzduchu za ní (bez materiálu) projde', async () => {
    // Rozsah jako Ú1: konec Z −40 (kousek za stěnou polotovaru Z −37).
    const zz = await run({}, true, { rangeActive: true, rangeStart: 10, rangeEnd: -40 });
    expect(zz.calc.passes.filter((p) => p.reversedLayer).length).toBeGreaterThan(3);
    expect(collisions(zz)).toHaveLength(0);
  }, 120000);

  it('obrácené vrstvy za sebou: odskok, rychloposuv rovnou nad vjezd, dolů, nové ap', async () => {
    const zz = await run({}, true, { rangeActive: true, rangeStart: 10, rangeEnd: -46 });
    const rev = zz.calc.passes.filter((p) => p.reversedLayer);
    expect(rev.length).toBeGreaterThan(3);
    expect(rev.slice(1).every((p) => p.chain)).toBe(true);
    // Za odskokem (G1 X Z) přímo G0 Z (doleva v téže výšce) a G0 X (dolů).
    const L = zz.gcode.split('\n').filter((l) => /^N\d+/.test(l)).map((l) => l.replace(/^N\d+ /, ''));
    const k = L.findIndex((l, i) => /^G1 X[\d.]+ Z-?[\d.]+$/.test(l) && /^G0 Z/.test(L[i + 1] || '') && /^G0 X/.test(L[i + 2] || ''));
    expect(k).toBeGreaterThan(0);
  }, 120000);

  it('po vrstvě odskok šikmo od stěny, ne výjezd nahoru', async () => {
    const zz = await run();
    const L = zz.gcode.split('\n');
    // Za každou obrácenou vrstvou (ke stěně +Z) následuje G1 s X i Z (odskok
    // zpět −Z), žádné „G0 X…" samotné nahoru.
    const rev = zz.calc.passes.filter((p) => p.reversedLayer);
    expect(rev.length).toBeGreaterThan(3);
    const odskok = L.filter((l) => /^N\d+ G1 X[\d.]+ Z-?[\d.]+$/.test(l));
    expect(odskok.length).toBeGreaterThanOrEqual(rev.length);
  }, 120000);
});

describe('Cik cak — náhled (zigzagView.js)', () => {
  const calc = {
    passes: [{ type: 'zigzag', reversedLayer: true, moves: [{ g: 'G0', x: 40, z: -50 }, { g: 'G1', x: 40, z: -34 }] }],
    interferenceGuides: [{ plungeLimit: true, z1: -48, z2: -36, x1: 30, x2: 42 }, { plungeLimit: true, z1: -10, z2: -2, x1: 30, x2: 38 }],
    sectionPlan: { sections: [], edges: [{ z: -44, x: 33 }, { z: -5, x: 20 }] },
    stockPathSegments: [{ type: 'line', p1: { x: 48, z: 3 }, p2: { x: 48, z: -44 } }, { type: 'line', p1: { x: 48, z: -44 }, p2: { x: 28, z: -44 } }, { type: 'line', p1: { x: 28, z: -44 }, p2: { x: 28, z: -80 } }],
  };
  it('čára zanoření v obrácené oblasti se nekreslí, jinde ano', () => {
    expect(guideHiddenByReverse(calc, calc.interferenceGuides[0])).toBe(true);
    expect(guideHiddenByReverse(calc, calc.interferenceGuides[1])).toBe(false);
  });
  it('hranice úseku u obrácených vrstev až dolů na polotovar (S6)', () => {
    const v = sectionPlanForView(calc);
    expect(v.edges[0].x).toBeCloseTo(28, 6);
    expect(v.edges[1]).toEqual(calc.sectionPlan.edges[1]);
  });
});
