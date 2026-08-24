import { describe, it, expect } from 'vitest';
import { HolderGouge, sweepSolid } from '../js/calculators/cam/holderGouge.js';
import { polyArea, toolSweep } from '../js/geom/geomCore.js';
import { toolFootprint, toolFootprintVisual } from '../js/calculators/cam/materialRemoval.js';

// Válcový polotovar ∅100 × 100 (radius 0..50, axiálně −100..0) a obdélníkový
// držák (šířka 20, délka 30) nad špičkou. Držák sedí radiálně v [x+z0, x+z0+30]
// s z0 = max(toolLength, R, 4). Pro toolLength=4 → z0=4.
function baseParams() {
  return {
    toolRadius: 0.8, depthOfCut: 1, toolLength: 4,
    holderWidth: 20, holderLength: 30, holderProfile: null,
    stockMode: 'cylinder', stockDiameter: 100, stockLength: 100, stockFace: 0,
  };
}

// Dvoubodový řezný blok (G1) mezi dvěma body dráhy.
function cutSeg(x0, z0, x1, z1) {
  return [{ x: x0, z: z0 }, { x: x1, z: z1, type: 'G1' }];
}

describe('HolderGouge – akumulovaná stopa vnoření držáku', () => {
  it('obarví oblast, kde držák zajede do materiálu, a ZŮSTANE i po přejetí', () => {
    const g = new HolderGouge(baseParams(), null);
    expect(g.valid).toBe(true);

    // Špička radiálně na 30 → držák radiálně [34, 64] protíná polotovar [0,50].
    const path = cutSeg(30, -20, 30, -10);
    g.advanceTo(path, path.length - 1);
    const areaAfterHit = Math.abs(polyArea(g.gouge));
    expect(areaAfterHit).toBeGreaterThan(0);

    // Ještě jednou totéž (idempotentní posun na stejný index) → beze změny.
    g.advanceTo(path, path.length - 1);
    expect(Math.abs(polyArea(g.gouge))).toBeCloseTo(areaAfterHit, 6);
  });

  it('nehlásí kolizi, když je držák radiálně mimo polotovar', () => {
    const g = new HolderGouge(baseParams(), null);
    // Špička na radiu 50 → držák radiálně [54, 84], polotovar končí na 50.
    const path = cutSeg(50, -20, 50, -10);
    g.advanceTo(path, path.length - 1);
    expect(Math.abs(polyArea(g.gouge))).toBeCloseTo(0, 6);
  });

  it('stopa zůstane, i když dráha skončí mimo materiál (perzistence)', () => {
    const g = new HolderGouge(baseParams(), null);
    // 1. blok: kolize (radius 30). 2. blok: mimo (radius 60).
    const path = [
      { x: 30, z: -20 },
      { x: 30, z: -10, type: 'G1' },
      { x: 60, z: -10, type: 'G0' },
      { x: 60, z: 0, type: 'G0' },
    ];
    g.advanceTo(path, path.length - 1);
    expect(Math.abs(polyArea(g.gouge))).toBeGreaterThan(0);
  });

  it('bez držáku (holderWidth ≤ 0) je akumulátor neplatný', () => {
    const g = new HolderGouge({ ...baseParams(), holderWidth: 0, holderLength: 0 }, null);
    expect(g.valid).toBe(false);
  });
});
// ╔══════════════════════════════════════════════════════════════╗
// ║  Model materiálu: čím se ubírá, než se testuje držák          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// „Červená pod plátkem se po odjetí zase objeví" (nález uživatele 21. 8. 2026).
// HolderGouge je ZÁZNAM — jednou vybarvené místo tam zůstane —, takže všechno,
// co se vybarví omylem, se dřív nebo později odkryje. Dva zdroje omylu, oba
// v modelu MATERIÁLU (ne v detekci):
//   1. ubíralo se tenkým plánovacím profilem místo tělem destičky,
//   2. `toolSweep` vrací jen stopu HRANICE, takže na krátkém kroku zůstal
//      uprostřed neodebraný ostrůvek.
describe('HolderGouge — model materiálu', () => {
  it('ubírá TĚLEM destičky, ne tenkým plánovacím profilem', () => {
    // Rozdíl není kosmetický: u upichováku je plánovací stopa 10,6 mm²,
    // těleso 76,6 mm² — sedmkrát víc. Materiál v tom rozdílu je na plátně
    // dávno pryč, ale držák se do něj v modelu „vnořoval".
    // Upichovák: `toolFootprintVisual` u nejširšího tvaru opravdu popisuje TĚLESO.
    // (Bez zadaného tvaru se vizuální obrys vrátí na plánovací — fallback
    // v toolFootprintVisual —, takže změna nikde nemůže ubrat.)
    const prms = { ...baseParams(), toolShape: 'parting', toolLength: 5,
      toolAngle: 0, toolTipAngle: 90 };
    const g = new HolderGouge(prms, null);
    expect(g.foot).toEqual(toolFootprintVisual(prms));
    expect(Math.abs(polyArea([g.foot])))
      .toBeGreaterThan(Math.abs(polyArea([toolFootprint(prms)])));
  });

  it('zametená plocha obsahuje i obrys samotný (krátký krok nenechá díru)', () => {
    // `toolSweep` sám vydá jen stopu hranice: na tělese 194,5 mm² a kroku
    // 0,2 mm zamete 5,7 mm² ve 4 kusech. Doplněný sweep musí pokrýt aspoň
    // celou stopu, a to v JEDNOM kuse.
    const loop = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 4 }, { x: 0, z: 4 }];
    const seg = [{ x: 20, z: 50 }, { x: 20, z: 49.8 }];
    const own = Math.abs(polyArea([loop]));
    const boundaryOnly = toolSweep(loop, seg);
    const solid = sweepSolid(loop, seg);
    expect(Math.abs(polyArea(boundaryOnly))).toBeLessThan(own);   // doložení díry
    expect(Math.abs(polyArea(solid))).toBeGreaterThanOrEqual(own);
    expect(solid.length).toBe(1);
  });
});
