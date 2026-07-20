// Fáze 3 migrace (docs/geometry-libs-migration.md): geometrické jádro
// hrubování z Clipper2 booleanů. Ověřuje, že zbytkový materiál = polotovar
// − offset kontury, vrstvy = pás ∩ zbytek dávají samostatné REGIONY, a že
// řezné Z-intervaly na hloubce sedí s ručně spočtenou geometrií.
import { describe, it, expect } from 'vitest';
import {
  offsetRegionLoop, buildResidual, sliceLayer, layerZIntervalsAtX,
  buildLayers, residualArea,
} from '../js/calculators/cam/booleanRoughing.js';
import { buildStockLoop } from '../js/calculators/cam/materialRemoval.js';

// Válcový polotovar r=20, z ∈ [0, −50] → obdélník 20×50 = 1000 mm².
const stock = buildStockLoop(
  { stockMode: 'cylinder', stockDiameter: 40, stockLength: 50, stockFace: 0 }, null);

describe('offsetRegionLoop — uzavření dráhy středu špičky k ose', () => {
  it('rovný válec (1 úsečka) → obdélníkové těleso k ose', () => {
    const off = [{ type: 'line', p1: { x: 10, z: 0 }, p2: { x: 10, z: -50 } }];
    const loop = offsetRegionLoop(off);
    // Obsahuje osové body i konce offsetu.
    expect(loop.some(p => Math.abs(p.x - 10) < 1e-6 && Math.abs(p.z) < 1e-6)).toBe(true);
    expect(loop.some(p => Math.abs(p.x) < 1e-6 && Math.abs(p.z + 50) < 1e-6)).toBe(true);
    expect(loop.some(p => Math.abs(p.x) < 1e-6 && Math.abs(p.z) < 1e-6)).toBe(true);
  });

  it('prázdný / degenerovaný offset → []', () => {
    expect(offsetRegionLoop([])).toEqual([]);
    expect(offsetRegionLoop([{ type: 'line', p1: { x: 5, z: 0 }, p2: { x: 5, z: 0 }, isDegenerate: true }])).toEqual([]);
  });
});

describe('buildResidual — polotovar − oblast dílce', () => {
  it('rovný válec r=10 v polotovaru r=20 → mezikruží plochy 500 mm²', () => {
    const off = [{ type: 'line', p1: { x: 10, z: 0 }, p2: { x: 10, z: -50 } }];
    const residual = buildResidual(stock, offsetRegionLoop(off));
    expect(residualArea(residual)).toBeCloseTo(500, 1);   // (20−10)×50
  });

  it('bez oblasti dílce → celý polotovar', () => {
    const residual = buildResidual(stock, []);
    expect(residualArea(residual)).toBeCloseTo(1000, 1);
  });
});

describe('sliceLayer + regiony zadarmo (boss–údolí–boss)', () => {
  // Dílec s výstupkem uprostřed: r=8 (z 0..−15), boss r=18 (z −15..−25),
  // r=8 (z −25..−40). Nad výstupkem je zbytek tenký (x 18..20) → mělká
  // vrstva se v údolí (u výstupku) rozpadne na DVA regiony.
  const off = [
    { type: 'line', p1: { x: 8, z: 0 }, p2: { x: 8, z: -15 } },
    { type: 'line', p1: { x: 8, z: -15 }, p2: { x: 18, z: -15 } },
    { type: 'line', p1: { x: 18, z: -15 }, p2: { x: 18, z: -25 } },
    { type: 'line', p1: { x: 18, z: -25 }, p2: { x: 8, z: -25 } },
    { type: 'line', p1: { x: 8, z: -25 }, p2: { x: 8, z: -40 } },
  ];
  const residual = buildResidual(stock, offsetRegionLoop(off));

  it('plocha zbytku = polotovar − plný profil dílce (580 mm²)', () => {
    // Profil: 8×15 + 18×10 + 8×15 = 420 → zbytek 1000 − 420.
    expect(residualArea(residual)).toBeCloseTo(580, 0);
  });

  it('mělký pás [10,15] → DVA samostatné regiony (výstupek je rozdělí)', () => {
    const loops = sliceLayer(residual, 10, 15);
    expect(loops.length).toBe(2);
  });

  it('hluboký pás [16,20] → JEDEN spojitý region (pod výstupkem už spojeno)', () => {
    // U x≥18 je materiál i nad výstupkem → pás [16,20] je spojitý přes celý Z.
    const loops = sliceLayer(residual, 16, 20);
    expect(loops.length).toBe(1);
  });

  it('Z-intervaly na hloubce X=10 = dva úseky (pravý a levý bok), výstupek přeskočen', () => {
    const loops = sliceLayer(residual, 10, 15);
    const iv = layerZIntervalsAtX(loops, 10);
    expect(iv.length).toBe(2);
    // Jízdní pořadí zprava: první je pravý bok (z 0..−15).
    expect(iv[0].zStart).toBeCloseTo(0, 1);
    expect(iv[0].zEnd).toBeCloseTo(-15, 1);
    expect(iv[1].zStart).toBeCloseTo(-25, 1);
    // Levý bok pokračuje až na konec polotovaru (díl končí na −40, ale
    // polotovar sahá do −50 → pod dílem je plný materiál).
    expect(iv[1].zEnd).toBeCloseTo(-50, 1);
  });
});

describe('buildLayers — hloubková posloupnost', () => {
  const off = [{ type: 'line', p1: { x: 10, z: 0 }, p2: { x: 10, z: -50 } }];
  const residual = buildResidual(stock, offsetRegionLoop(off));

  it('každá hloubka má 1 spojitý interval přes celý díl (0..−50)', () => {
    const layers = buildLayers(residual, [17, 14, 11], 3);
    expect(layers.length).toBe(3);
    for (const L of layers) {
      expect(L.intervals.length).toBe(1);
      expect(L.intervals[0].zStart).toBeCloseTo(0, 1);
      expect(L.intervals[0].zEnd).toBeCloseTo(-50, 1);
    }
  });

  it('Z-ořez [zLo,zHi] omezí intervaly na rozsah obrábění', () => {
    const layers = buildLayers(residual, [15], 5, -30, -10);
    expect(layers[0].intervals.length).toBe(1);
    expect(layers[0].intervals[0].zStart).toBeCloseTo(-10, 1);
    expect(layers[0].intervals[0].zEnd).toBeCloseTo(-30, 1);
  });
});
