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
    // profil z ∈ [10, 210] → svět x ∈ [10, 210]; profil x ±10 → svět z ±10
    expect(Math.min(...w.map(p => p.x))).toBeCloseTo(10, 6);
    expect(Math.max(...w.map(p => p.x))).toBeCloseTo(210, 6);
    expect(Math.max(...w.map(p => p.z))).toBeCloseTo(10, 6);
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

  it('detect-collisions broad-phase dává stejné výsledky', async () => {
    const collisions = await import('../lib/detect-collisions.js');
    const plunge = [
      { x: 40, z: -30, type: 'G0' },
      { x: 31, z: -30, type: 'G0', originalLineIdx: 1 },
      { x: 10, z: -30, type: 'G1', originalLineIdx: 2 },
    ];
    const a = validateToolpath(plunge, prms, []);
    const b = validateToolpath(plunge, prms, [], { collisions });
    expect(b.length).toBe(a.length);
    expect(b[0].kind).toBe('holder');
    // čistá dráha zůstává čistá i s broad-phase
    const clean = [
      { x: 40, z: 10, type: 'G0' },
      { x: 29.5, z: 5, type: 'G0', originalLineIdx: 1 },
      { x: 29.5, z: -55, type: 'G1', originalLineIdx: 2 },
    ];
    expect(validateToolpath(clean, prms, [], { collisions })).toEqual([]);
  });
});
