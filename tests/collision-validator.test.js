// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – validace kolizí držáku/destičky (Fáze 2, Clipper2)    ║
// ╚══════════════════════════════════════════════════════════════╝
import { describe, it, expect } from 'vitest';
import {
  validateToolpath, holderProfileLoop, holderWorldLoop,
} from '../js/calculators/cam/collisionValidator.js';
import { polyArea } from '../js/geom/geomCore.js';

// Válec ∅60 × 60 (r=30, čelo z=0), nůž R0.8, hrana 10, držák 20×200
const prms = {
  stockMode: 'cylinder', stockDiameter: 60, stockLength: 60, stockFace: 0,
  toolRadius: 0.8, toolLength: 10, depthOfCut: 2,
  holderWidth: 20, holderLength: 200,
};

describe('holderProfileLoop / holderWorldLoop', () => {
  it('bez vlastního obrysu → obdélník Tloušťka × Délka nad destičkou', () => {
    const loop = holderProfileLoop(prms);
    expect(loop.length).toBe(4);
    expect(Math.abs(polyArea([loop.map(p => ({ x: p.x, z: p.z }))]))).toBeCloseTo(20 * 200, 4);
    // spodní hrana v z0 = max(toolLength, R, 4) = 10
    expect(Math.min(...loop.map(p => p.z))).toBeCloseTo(10, 6);
  });

  it('holderWidth/Length ≤ 0 → null (držák se nehlídá)', () => {
    expect(holderProfileLoop({ ...prms, holderWidth: 0 })).toBeNull();
  });

  it('vlastní obrys (sideA+sideB) má přednost před obdélníkem', () => {
    const p2 = {
      ...prms,
      holderProfile: {
        sideA: [{ x: -2, z: 5 }, { x: -2, z: 50 }],
        sideB: [{ x: 2, z: 5 }, { x: 2, z: 50 }],
      },
    };
    const loop = holderProfileLoop(p2);
    expect(Math.abs(polyArea([loop.map(p => ({ x: p.x, z: p.z }))]))).toBeCloseTo(4 * 45, 4);
  });

  it('světová transformace: +z profilu → +x světa, backside zrcadlí z', () => {
    const w = holderWorldLoop(prms, false);
    // profil z ∈ [10, 210] → svět x ∈ [10, 210]; profil x ∈ [0, 20] → svět z ∈ [0, 20].
    // Náhradní obdélník leží CELÝ na obrobené straně (od 25. 8. 2026) — dřív byl
    // vystředěný na špičku (±10) a půlkou trčel na neobrobenou stranu, do materiálu.
    expect(Math.min(...w.map(p => p.x))).toBeCloseTo(10, 6);
    expect(Math.max(...w.map(p => p.x))).toBeCloseTo(210, 6);
    expect(Math.min(...w.map(p => p.z))).toBeCloseTo(0, 6);
    expect(Math.max(...w.map(p => p.z))).toBeCloseTo(20, 6);
    const asym = { ...prms, holderProfile: { sideA: [{ x: 1, z: 5 }, { x: 1, z: 50 }], sideB: [{ x: 5, z: 5 }, { x: 5, z: 50 }] } };
    const wr = holderWorldLoop(asym, false);
    const wb = holderWorldLoop(asym, true);
    expect(Math.min(...wr.map(p => p.z))).toBeCloseTo(1, 6);
    expect(Math.max(...wb.map(p => p.z))).toBeCloseTo(-1, 6);
  });
});

describe('validateToolpath', () => {
  it('čistý podélný průchod nad polotovarem → žádný problém', () => {
    // Skim pass 0,5 mm pod povrchem: špička x=29,5, držák od x=39,5 — nad materiálem
    const simPath = [
      { x: 40, z: 10, type: 'G0' },
      { x: 29.5, z: 5, type: 'G0', originalLineIdx: 1 },
      { x: 29.5, z: -55, type: 'G1', originalLineIdx: 2 },
      { x: 40, z: -55, type: 'G0', originalLineIdx: 3 },
    ];
    expect(validateToolpath(simPath, prms, [])).toEqual([]);
  });

  it('zápich hlouběji než dosah → kolize držáku s materiálem', () => {
    // Plunž na x=10 v z=-30: držák (šířka 20, spodek 10 nad špičkou → x=20)
    // zajede do plného materiálu po stranách drážky
    const simPath = [
      { x: 40, z: -30, type: 'G0' },
      { x: 31, z: -30, type: 'G0', originalLineIdx: 1 },
      { x: 10, z: -30, type: 'G1', originalLineIdx: 2 },
    ];
    const issues = validateToolpath(simPath, prms, []);
    expect(issues.length).toBe(1);
    expect(issues[0].kind).toBe('holder');
    expect(issues[0].lineIdx).toBe(2);
    expect(issues[0].area).toBeGreaterThan(10);
  });

  it('rychloposuv skrz materiál → problém typu rapid', () => {
    const simPath = [
      { x: 10, z: 10, type: 'G0' },
      { x: 10, z: -50, type: 'G0', originalLineIdx: 1 },  // G0 skrz válec r=30
    ];
    const issues = validateToolpath(simPath, prms, []);
    expect(issues.length).toBe(1);
    expect(issues[0].kind).toBe('rapid');
    expect(issues[0].lineIdx).toBe(1);
  });

  it('rychloposuv už obrobenou kapsou → bez problému', () => {
    // Nejdřív se odřeže pás z povrchu (x 29→30.8 přes stadion), pak G0 tímtéž místem
    const simPath = [
      { x: 40, z: 5, type: 'G0' },
      { x: 29, z: 5, type: 'G0', originalLineIdx: 1 },
      { x: 29, z: -55, type: 'G1', originalLineIdx: 2 },   // řez (odebere x∈[28.2, 30+])
      { x: 40, z: -55, type: 'G0', originalLineIdx: 3 },
      { x: 29.4, z: -55, type: 'G0', originalLineIdx: 4 }, // zpět do vyřezaného
      { x: 29.4, z: 5, type: 'G0', originalLineIdx: 5 },   // G0 vyřezaným kanálem
    ];
    const issues = validateToolpath(simPath, prms, []);
    expect(issues).toEqual([]);
  });

  it('držák vypnutý (šířka 0) → hlídá se jen rychloposuv', () => {
    const p2 = { ...prms, holderWidth: 0 };
    const plunge = [
      { x: 40, z: -30, type: 'G0' },
      { x: 31, z: -30, type: 'G0', originalLineIdx: 1 },
      { x: 10, z: -30, type: 'G1', originalLineIdx: 2 },
    ];
    expect(validateToolpath(plunge, p2, [])).toEqual([]);
  });

  // ── PROČ TU UŽ NENÍ SAT BROAD-PHASE (26. 8. 2026) ─────────────────────
  // Do tohohle dne uměl validátor volitelně použít Detect-Collisions
  // (`opts.collisions`) jako rychlý filtr. Ta knihovna si konkávní polygon
  // rozloží `quickDecomp`em na konvexní kusy, a když narazí na strop
  // rekurze, VRÁTÍ JEN TO, CO STIHLA — zbytek polygonu tiše zahodí. SAT pak
  // testuje proti méně dílům, než polygon má, takže filtr odpoví „kontakt
  // vyloučen" na skutečném překryvu. Ve validátoru to znamená ZMEŠKANOU
  // KOLIZI (checkAgainstStock vrátí nulu) i přeskočený `stock.cut()`.
  //
  // Původní test tuhle větev pustil s VÁLCEM, tedy čtyřvrcholovým obrysem —
  // proto byl roky zelený. Tady je geometrie, na které to praskne.
  it('DŮVOD ODSTRANĚNÍ: Detect-Collisions podhlásí překryv na složitém obrysu', async () => {
    const dc = await import('../lib/detect-collisions.js');
    // Hřeben: zuby po 2 mm, hřbet u osy. Roste jen počet vrcholů, tvar je
    // pořád stejně „nafouknutý" — čtvereček uvnitř prvního zubu leží uvnitř
    // vždy, ať je zubů kolik chce.
    const comb = (teeth) => {
      const pts = [];
      for (let i = 0; i < teeth; i++) {
        const z = i * 2;
        pts.push({ x: 5, z }, { x: 30, z }, { x: 30, z: z + 1 }, { x: 5, z: z + 1 });
      }
      pts.push({ x: 0, z: (teeth - 1) * 2 + 1 }, { x: 0, z: 0 });
      return pts;
    };
    const probe = [{ x: 12, z: 0.1 }, { x: 20, z: 0.1 }, { x: 20, z: 0.8 }, { x: 12, z: 0.8 }];
    const satSaysHit = (stockLoop) => {
      const system = new dc.System();
      system.insert(new dc.Polygon({ x: 0, y: 0 }, stockLoop.map(p => ({ x: p.z, y: p.x }))));
      const body = new dc.Polygon({ x: 0, y: 0 }, probe.map(p => ({ x: p.z, y: p.x })));
      system.insert(body);
      let hit = false;
      system.checkOne(body, () => { hit = true; return true; });
      system.remove(body);
      return hit;
    };
    const quiet = console.warn;
    console.warn = () => {};   // knihovna hlásí `quickDecomp: max level`
    try {
      // 82 vrcholů ještě projde…
      expect(satSaysHit(comb(20)), '20 zubů').toBe(true);
      // …242 vrcholů už NE, a to je ta tichá chyba.
      expect(satSaysHit(comb(60)), '60 zubů (242 vrcholů)').toBe(false);
    } finally {
      console.warn = quiet;
    }
  });

  it('AABB broad-phase najde kolizi i na tom samém obrysu', () => {
    // Táž geometrie jako výš, ale přes validátor: zápich do hřebenu musí
    // kolizi ohlásit. S SAT filtrem by ji `mayHit` zahodilo.
    const segs = [];
    const pts = [];
    for (let i = 0; i < 60; i++) {
      const z = -i * 2;
      pts.push({ x: 5, z }, { x: 30, z }, { x: 30, z: z - 1 }, { x: 5, z: z - 1 });
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      segs.push({ type: 'line', p1: pts[i], p2: pts[i + 1] });
    }
    const p2 = { ...prms, stockMode: 'casting' };
    // Zápich doprostřed hřebenu: držák (z ∈ [z, z+20]) přejede přes deset
    // zubů, takže kolize je jistá — pokud ji filtr nezahodí.
    const plunge = [
      { x: 40, z: -30.5, type: 'G0' },
      { x: 31, z: -30.5, type: 'G0', originalLineIdx: 1 },
      { x: 10, z: -30.5, type: 'G1', originalLineIdx: 2 },
    ];
    const issues = validateToolpath(plunge, p2, segs);
    expect(issues.length, 'zápich do hřebenu neohlásil nic').toBeGreaterThan(0);
  });
});
