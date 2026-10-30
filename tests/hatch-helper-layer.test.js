// SKICA – Testy: šrafy výplně (render/hatch.js) a pomocné vrstvy (helperLayer.js)

import { describe, it, expect } from 'vitest';
import { hatchSegments, defaultHatchStep, HATCH_MODES } from '../js/render/hatch.js';
import { isHelperLayer, canBeHelperLayer, withoutHelperObjects, isHelperObject } from '../js/helperLayer.js';

describe('šrafy — hatchSegments', () => {
  const box = { minX: 0, maxX: 10, minY: 0, maxY: 10 };

  it('čáry mají zadaný úhel a rozteč', () => {
    const segs = hatchSegments(box, 45, 2);
    expect(segs.length).toBeGreaterThan(5);
    for (const [p, q] of segs) {
      expect(Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI).toBeCloseTo(45, 6);
    }
    // Kolmá vzdálenost sousedních čar = rozteč
    const n = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
    const off = segs.map(([p]) => p.x * n.x + p.y * n.y).sort((a, b) => a - b);
    for (let i = 1; i < off.length; i++) expect(off[i] - off[i - 1]).toBeCloseTo(2, 6);
  });

  it('pokryje celý obdélník (každý roh leží mezi krajními čarami)', () => {
    const segs = hatchSegments(box, 135, 1.5);
    const a = 135 * Math.PI / 180, n = { x: -Math.sin(a), y: Math.cos(a) };
    const off = segs.map(([p]) => p.x * n.x + p.y * n.y);
    const lo = Math.min(...off), hi = Math.max(...off);
    for (const c of [[0, 0], [10, 0], [0, 10], [10, 10]]) {
      const v = c[0] * n.x + c[1] * n.y;
      expect(v).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(v).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it('čáry jsou ukotvené k počátku — sousední plochy navazují', () => {
    const a = hatchSegments({ minX: 0, maxX: 10, minY: 0, maxY: 10 }, 45, 2);
    const b = hatchSegments({ minX: 10, maxX: 20, minY: 0, maxY: 10 }, 45, 2);
    const n = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
    const k = segs => segs.map(([p]) => (p.x * n.x + p.y * n.y) / 2);
    for (const v of [...k(a), ...k(b)]) expect(Math.abs(v - Math.round(v))).toBeLessThan(1e-9);
  });

  it('výchozí rozteč roste s velikostí plochy', () => {
    const small = defaultHatchStep([[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]]);
    const big = defaultHatchStep([[{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 80 }]]);
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
    expect(defaultHatchStep([])).toBe(2);
  });

  it('volby obsahují plnou barvu a oba směry + křížem', () => {
    expect(HATCH_MODES.map(m => m.value)).toEqual([null, 45, 135, 'cross']);
  });
});

describe('pomocné vrstvy', () => {
  const layers = [
    { id: 0, name: 'Kontura', helper: true },          // Kontura pomocná být nesmí
    { id: 1, name: 'Konstrukce' },
    { id: 2, name: 'Pomocné', helper: true },
    { id: 3, name: 'Čelo', isFace: true, helper: true },
    { id: 4, name: 'Plášť', isShell: true, helper: true },
  ];

  it('příznak platí jen u běžných vrstev', () => {
    expect(layers.map(isHelperLayer)).toEqual([false, false, true, false, false]);
    expect(layers.map(canBeHelperLayer)).toEqual([false, true, true, false, false]);
  });

  it('objekty pomocné vrstvy se vyřadí, ostatní zůstanou', () => {
    const objs = [{ id: 1, layer: 0 }, { id: 2, layer: 2 }, { id: 3, layer: 1 }, { id: 4, layer: 3 }];
    expect(withoutHelperObjects(objs, layers).map(o => o.id)).toEqual([1, 3, 4]);
    expect(isHelperObject(objs[1], layers)).toBe(true);
    expect(isHelperObject(objs[0], layers)).toBe(false);
  });

  it('bez pomocné vrstvy vrací stejné pole (beze změny pro CAM)', () => {
    const objs = [{ layer: 0 }, { layer: 1 }];
    expect(withoutHelperObjects(objs, [{ id: 0 }, { id: 1 }])).toBe(objs);
  });
});
