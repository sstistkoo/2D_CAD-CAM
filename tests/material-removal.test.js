// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – vizuální úběr materiálu (Fáze 1 migrace na Clipper2)  ║
// ╚══════════════════════════════════════════════════════════════╝
import { describe, it, expect } from 'vitest';
import { MaterialRemoval, buildStockLoop, toolFootprint } from '../js/calculators/cam/materialRemoval.js';
import { polyArea, pointInLoop } from '../js/geom/geomCore.js';

const cylinderPrms = {
  stockMode: 'cylinder', stockDiameter: 40, stockLength: 50, stockFace: 2,
  toolRadius: 0.8,
};

describe('buildStockLoop', () => {
  it('válec → obdélník od osy po poloměr', () => {
    const loop = buildStockLoop(cylinderPrms, []);
    expect(loop.length).toBe(4);
    expect(Math.abs(polyArea([loop]))).toBeCloseTo(20 * 52, 6); // r=20, z ∈ [2,−50]
  });

  it('odlitek → navzorkované segmenty uzavřené k ose', () => {
    const segs = [
      { type: 'line', p1: { x: 0, z: 5 }, p2: { x: 15, z: 5 } },
      { type: 'line', p1: { x: 15, z: 5 }, p2: { x: 15, z: -30 } },
      { type: 'line', p1: { x: 15, z: -30 }, p2: { x: 25, z: -30 } },
      { type: 'line', p1: { x: 25, z: -30 }, p2: { x: 25, z: -60 } },
    ];
    const loop = buildStockLoop({ stockMode: 'casting' }, segs);
    // konec (25,−60) není na ose → uzavřít přes (0,−60) a start je na ose
    expect(Math.abs(polyArea([loop]))).toBeCloseTo(15 * 35 + 25 * 30, 4);
  });

  it('vrací null bez polotovaru', () => {
    expect(buildStockLoop({ stockMode: 'casting' }, [])).toBeNull();
    expect(buildStockLoop({ ...cylinderPrms, stockDiameter: 0 }, [])).toBeNull();
  });
});

describe('toolFootprint', () => {
  it('stadion: půlkruh špičky + tělo směrem k držáku', () => {
    const loop = toolFootprint({ toolRadius: 0.8, depthOfCut: 2 });
    const area = Math.abs(polyArea([loop]));
    const H = 4; // max(2·ap, 3)
    const expected = (Math.PI * 0.8 * 0.8) / 2 + 2 * 0.8 * H;
    expect(area).toBeGreaterThan(expected * 0.93);
    expect(area).toBeLessThanOrEqual(expected);
    expect(pointInLoop({ x: 0, z: 0 }, loop)).toBe('inside');
    expect(pointInLoop({ x: -0.75, z: 0 }, loop)).toBe('inside'); // špička dole
    expect(pointInLoop({ x: 3.9, z: 0 }, loop)).toBe('inside');   // tělo nahoře
    expect(pointInLoop({ x: -0.75, z: 0.5 }, loop)).toBe('outside'); // vedle špičky
  });
});

describe('MaterialRemoval.advanceTo', () => {
  // simPath: rychloposuv k polotovaru, řez podél čela dolů, rychloposuv pryč
  const simPath = [
    { x: 25, z: 10, type: 'G0' },
    { x: 20, z: 0, type: 'G0' },   // nad rohem polotovaru (čelo z=2 → mimo)
    { x: 0, z: 0, type: 'G1' },    // řez čela na osu (skrz materiál z∈[0,2]… kolmo v X)
    { x: 25, z: 10, type: 'G0' },
  ];

  it('G0 rychloposuvy materiál neodebírají', () => {
    const rm = new MaterialRemoval(cylinderPrms, []);
    const before = Math.abs(rm.model.area());
    rm.advanceTo(simPath, 1);       // jen G0 pohyby
    expect(Math.abs(rm.model.area())).toBeCloseTo(before, 6);
  });

  it('řezný úsek odebere materiál a plocha monotónně klesá', () => {
    const rm = new MaterialRemoval(cylinderPrms, []);
    const a0 = Math.abs(rm.model.area());
    rm.advanceTo(simPath, 1.5);     // půlka řezu
    const a1 = Math.abs(rm.model.area());
    rm.advanceTo(simPath, 2);       // celý řez
    const a2 = Math.abs(rm.model.area());
    expect(a1).toBeLessThan(a0);
    expect(a2).toBeLessThan(a1);
    // řez X 20→0 na z=0, stopa = kruh r 0,8 → vyřízne pás do hloubky z≈−0,8,
    // ale jen část x<20; ubraná plocha musí odpovídat řádově pásu 20×0,8
    expect(a0 - a2).toBeGreaterThan(20 * 0.8 * 0.8);
    expect(a0 - a2).toBeLessThan(20 * 1.6 * 1.5);
  });

  it('inkrementální postup = stejný výsledek jako jeden krok', () => {
    const rmA = new MaterialRemoval(cylinderPrms, []);
    const rmB = new MaterialRemoval(cylinderPrms, []);
    for (let f = 0; f <= 3.0001; f += 0.05) rmA.advanceTo(simPath, Math.min(f, 3));
    rmB.advanceTo(simPath, 3);
    expect(Math.abs(rmA.model.area())).toBeCloseTo(Math.abs(rmB.model.area()), 1);
  });

  it('přetočení zpět přepočítá od nuly', () => {
    const rm = new MaterialRemoval(cylinderPrms, []);
    const a0 = Math.abs(rm.model.area());
    rm.advanceTo(simPath, 2);
    expect(Math.abs(rm.model.area())).toBeLessThan(a0);
    rm.advanceTo(simPath, 0);       // rewind na začátek
    expect(Math.abs(rm.model.area())).toBeCloseTo(a0, 6);
  });
});
