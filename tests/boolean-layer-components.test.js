// Fáze 3 krok 3 migrace (docs/geometry-libs-migration.md): rozklad hloubkové
// vrstvy na KOMPONENTY jako základ emise dráhy z HRAN regionů. Ověřuje, že
// extractLayerComponents dá per-komponenta správné Z-rozpětí a spodní hranu
// (řeznou dráhu) — plochou na hloubce pásu tam, kde je díl pod ním, a kopírující
// offset dílu tam, kde díl do pásu stoupá. NEMĚNÍ G-kód (čistá geometrie).
import { describe, it, expect } from 'vitest';
import {
  offsetRegionLoop, buildResidual, extractLayerComponents,
} from '../js/calculators/cam/booleanRoughing.js';
import { buildStockLoop } from '../js/calculators/cam/materialRemoval.js';

// Válcový polotovar r=20, z ∈ [0, −50].
const stock = buildStockLoop(
  { stockMode: 'cylinder', stockDiameter: 40, stockLength: 50, stockFace: 0 }, null);

describe('extractLayerComponents — komponenty vrstvy + spodní hrana', () => {
  // Dílec boss–údolí–boss: r=8 (z 0..−15), boss r=18 (z −15..−25),
  // r=8 (z −25..−40). Polotovar pokračuje do −50.
  const off = [
    { type: 'line', p1: { x: 8, z: 0 }, p2: { x: 8, z: -15 } },
    { type: 'line', p1: { x: 8, z: -15 }, p2: { x: 18, z: -15 } },
    { type: 'line', p1: { x: 18, z: -15 }, p2: { x: 18, z: -25 } },
    { type: 'line', p1: { x: 18, z: -25 }, p2: { x: 8, z: -25 } },
    { type: 'line', p1: { x: 8, z: -25 }, p2: { x: 8, z: -40 } },
  ];
  const residual = buildResidual(stock, offsetRegionLoop(off));

  it('mělký pás [10,15] → DVĚ komponenty (boss je rozdělí), seřazené zprava', () => {
    const comps = extractLayerComponents(residual, 10, 15);
    expect(comps.length).toBe(2);
    // Jízdní pořadí zprava: první komponenta má větší zStart.
    expect(comps[0].zStart).toBeGreaterThan(comps[1].zStart);
    // Pravá komponenta: z 0 (čelo) po boss u −15.
    expect(comps[0].zStart).toBeCloseTo(0, 1);
    expect(comps[0].zEnd).toBeCloseTo(-15, 1);
    // Levá komponenta: od druhého boku bossu (−25) po konec polotovaru (−50).
    expect(comps[1].zStart).toBeCloseTo(-25, 1);
    expect(comps[1].zEnd).toBeCloseTo(-50, 1);
  });

  it('spodní hrana mělkého pásu je plochá na hloubce pásu (díl pod ním)', () => {
    const comps = extractLayerComponents(residual, 10, 15);
    // Díl je v této komponentě na x=8 (< xLo=10) → hrana ploše na xLo.
    for (const p of comps[0].bottomEdge) expect(p.x).toBeCloseTo(10, 1);
    // Hrana jde od zStart k zEnd (klesající Z).
    const be = comps[0].bottomEdge;
    expect(be[0].z).toBeGreaterThan(be[be.length - 1].z);
  });

  it('hluboký pás [16,20] → JEDNA spojitá komponenta přes celý díl', () => {
    const comps = extractLayerComponents(residual, 16, 20);
    expect(comps.length).toBe(1);
    expect(comps[0].zStart).toBeCloseTo(0, 1);
    expect(comps[0].zEnd).toBeCloseTo(-50, 1);
  });

  it('kužel → spodní hrana KOPÍRUJE offset dílu tam, kde stoupá do pásu', () => {
    // Kužel: díl x=10 (z 0..−10) → x=16 (z −20), pak dolů. V pásu [12,18] se
    // hrana zvedá po kuželu (x roste od 12 nahoru), ne ploše.
    const cone = [
      { type: 'line', p1: { x: 10, z: 0 }, p2: { x: 10, z: -10 } },
      { type: 'line', p1: { x: 10, z: -10 }, p2: { x: 16, z: -20 } },
      { type: 'line', p1: { x: 16, z: -20 }, p2: { x: 16, z: -50 } },
    ];
    const res = buildResidual(stock, offsetRegionLoop(cone));
    const comps = extractLayerComponents(res, 12, 18);
    expect(comps.length).toBe(1);
    const be = comps[0].bottomEdge;
    // Vpravo (z blízko 0) je díl na x=10 < 12 → hrana ploše na 12.
    const right = be.find(p => p.z < -1 && p.z > -8);
    expect(right.x).toBeCloseTo(12, 0);
    // V oblasti kužele (z ≈ −15) hrana kopíruje offset (x mezi 12 a 16).
    const mid = be.find(p => p.z < -14 && p.z > -16);
    expect(mid.x).toBeGreaterThan(12.5);
    expect(mid.x).toBeLessThan(16.5);
  });

  it('Z-ořez omezí komponenty na rozsah', () => {
    const comps = extractLayerComponents(residual, 16, 20, -30, -10);
    expect(comps.length).toBe(1);
    expect(comps[0].zStart).toBeCloseTo(-10, 1);
    expect(comps[0].zEnd).toBeCloseTo(-30, 1);
  });

  it('prázdný zbytek → []', () => {
    expect(extractLayerComponents([], 10, 15)).toEqual([]);
  });
});
