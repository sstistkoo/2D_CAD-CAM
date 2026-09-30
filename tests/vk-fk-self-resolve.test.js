// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: VK jako Heidenhain FK – prvky určené hned      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Tři chyby, kdy VK zahazovalo nebo nevyužilo zadané údaje:
//  1. PA + jedna souřadnice konce (X20 Z? PA45) – X se ignorovalo,
//  2. samotné X (Z?) jinde než kotva – paprsek šel po X kotvy, ne po X20,
//  3. PA + PR bez X/Z – řešeno ve formuláři (initVkTab), tady se testuje
//     sdílený řádkový helper, přes který se dopočet zapisuje do syntaxe.

import { describe, it, expect } from 'vitest';
import {
  elementRay,
  solveCornerLineLine,
  solveAngleAndCoordinate,
} from '../js/calculators/vkSolver.js';
import { replaceVkLine, buildVkPreviewData } from '../js/calculators/vkContour.js';
import { state } from '../js/state.js';

describe('elementRay – známá souřadnice je KONEC prvku (FK: FL X20)', () => {
  it('X známé, Z? – paprsek vede po zadaném X, ne po X kotvy', () => {
    const ray = elementRay({ x: 20, z: null, pa: null }, { z: 0, x: 10 });
    expect(ray).toEqual({ z0: 0, x0: 20, angleDeg: 0 });
  });

  it('Z známé, X? – paprsek vede po zadaném Z, ne po Z kotvy', () => {
    const ray = elementRay({ x: null, z: -30, pa: null }, { z: 0, x: 10 });
    expect(ray).toEqual({ z0: -30, x0: 10, angleDeg: 90 });
  });

  it('roh po bodu X10 Z0: „X20 Z?" → známý bod X30 Z-30 vyjde na X20 (dřív X10)', () => {
    const pt = solveCornerLineLine({ z: 0, x: 10 }, { x: 20, z: null, pa: null }, { x: 30, z: -30, pa: null });
    expect(pt.x).toBeCloseTo(20, 9);
    expect(pt.z).toBeCloseTo(-30, 9);
  });
});

describe('solveAngleAndCoordinate – PA + jedna souřadnice konce (FK: FL X.. AN..)', () => {
  it('sražení 45° z X10 Z0 do X20 → Z10', () => {
    const pt = solveAngleAndCoordinate({ z: 0, x: 10 }, { x: 20, z: null, pa: 45 });
    expect(pt.x).toBeCloseTo(20, 9);
    expect(pt.z).toBeCloseTo(10, 9);
    expect(pt.reversed).toBe(false);
  });

  it('kužel 150° z X10 Z0 do Z-30 → X≈27.32', () => {
    const pt = solveAngleAndCoordinate({ z: 0, x: 10 }, { x: null, z: -30, pa: 150 });
    expect(pt.z).toBeCloseTo(-30, 9);
    expect(pt.x).toBeCloseTo(10 + 30 * Math.tan(30 * Math.PI / 180), 6);
    expect(pt.reversed).toBe(false);
  });

  it('konec proti směru PA se dopočte, ale nahlásí jako reversed', () => {
    const pt = solveAngleAndCoordinate({ z: 0, x: 10 }, { x: 20, z: null, pa: 225 });
    expect(pt.z).toBeCloseTo(10, 9);
    expect(pt.reversed).toBe(true);
  });

  it('úhel rovnoběžný se zadanou souřadnicí nemá řešení', () => {
    expect(() => solveAngleAndCoordinate({ z: 0, x: 10 }, { x: 30, z: null, pa: 180 }))
      .toThrow(/rovnoběžný/);
  });

  it('začátek už na zadaném X → nulová délka, chyba', () => {
    expect(() => solveAngleAndCoordinate({ z: 0, x: 20 }, { x: 20, z: null, pa: 45 }))
      .toThrow(/nulovou délku/);
  });
});

describe('replaceVkLine – záplata celého řádku, ne podřetězce', () => {
  it('nepřepíše delší řádek, který nedořešený řádek jen obsahuje', () => {
    const code = 'G0 X10 Z0\nG11 X? Z? PA180 PR10\nG11 X? Z? PA180';
    const out = replaceVkLine(code, 'G11 X? Z? PA180', 'G11 X20 Z-50 PA180');
    expect(out).toBe('G0 X10 Z0\nG11 X? Z? PA180 PR10\nG11 X20 Z-50 PA180');
  });

  it('u dvou stejných řádků bere poslední – opakovaným voláním se záplatují oba', () => {
    const code = 'G0 X10 Z0\nG11 X? Z? PA180\nG11 X? Z? PA180';
    const once = replaceVkLine(code, 'G11 X? Z? PA180', 'B');
    expect(once).toBe('G0 X10 Z0\nG11 X? Z? PA180\nB');
    expect(replaceVkLine(once, 'G11 X? Z? PA180', 'A')).toBe('G0 X10 Z0\nA\nB');
  });

  it('řádek, který v kódu není, nechá syntaxi beze změny', () => {
    const code = 'G0 X10 Z0\nG11 X20 Z-5';
    expect(replaceVkLine(code, 'G11 X? Z?', 'cokoli')).toBe(code);
  });
});


describe('PA/PR – polární rádius je vždy skutečná délka (poloměr)', () => {
  const lastEnd = (code) => {
    const { segments } = buildVkPreviewData(code);
    return segments[segments.length - 1].end;
  };

  it('v režimu průměr PA90 PR10 zvětší PRŮMĚR o 20 (poloměr o 10)', () => {
    const before = state.xDisplayMode;
    state.xDisplayMode = 'diameter';
    try {
      const end = lastEnd('G0 X20 Z0\nG11 X? Z? PA90 PR10');
      expect(end.x).toBeCloseTo(40, 9);
      expect(end.z).toBeCloseTo(0, 9);
    } finally { state.xDisplayMode = before; }
  });

  it('v režimu průměr se délka PR zachová i u šikmé úsečky', () => {
    const before = state.xDisplayMode;
    state.xDisplayMode = 'diameter';
    try {
      const end = lastEnd('G0 X20 Z0\nG11 X? Z? PA150 PR10');
      const dRadius = (end.x - 20) / 2;
      expect(Math.hypot(end.z, dRadius)).toBeCloseTo(10, 9);
    } finally { state.xDisplayMode = before; }
  });

  it('v režimu poloměr se nic nemění', () => {
    const before = state.xDisplayMode;
    state.xDisplayMode = 'radius';
    try {
      const end = lastEnd('G0 X10 Z0\nG11 X? Z? PA90 PR10');
      expect(end.x).toBeCloseTo(20, 9);
    } finally { state.xDisplayMode = before; }
  });
});
