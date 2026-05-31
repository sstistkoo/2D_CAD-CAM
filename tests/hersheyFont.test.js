// Testy pro Hershey single-line font renderer.
// Pokrývá: render single character, multi-character, measureHersheyText,
// mezery, rotaci, neznámé znaky.

import { describe, it, expect } from 'vitest';
import { renderHersheyText, measureHersheyText } from '../js/lib/hersheyFont.js';

describe('renderHersheyText – základní rendering', () => {
  it('písmeno A má 3 tahy (levá noha, pravá noha, příčka)', () => {
    const polys = renderHersheyText('A', 10);
    expect(polys).toHaveLength(3);
    polys.forEach(p => {
      expect(p.closed).toBe(false);
      expect(p.vertices.length).toBeGreaterThanOrEqual(2);
      expect(p.bulges.every(b => b === 0)).toBe(true);
    });
  });

  it('písmeno B má více tahů než A (svislá + dvě boule)', () => {
    const a = renderHersheyText('A', 10);
    const b = renderHersheyText('B', 10);
    expect(b.length).toBeGreaterThan(0);
    // B má vždy levou svislou + 2 boule = aspoň 3 tahy
    expect(b.length).toBeGreaterThanOrEqual(3);
  });

  it('řetězec "AB" vyrobí součet tahů A + B', () => {
    const a = renderHersheyText('A', 10);
    const b = renderHersheyText('B', 10);
    const ab = renderHersheyText('AB', 10);
    expect(ab.length).toBe(a.length + b.length);
  });

  it('mezera nepřidá žádné tahy, ale posune cursor', () => {
    const ab = renderHersheyText('AB', 10);
    const aSb = renderHersheyText('A B', 10);
    expect(aSb.length).toBe(ab.length); // mezera = 0 polylines
    // První tah B v "A B" je posunutější než v "AB" o ~mezera + advance A
    const widthAB = measureHersheyText('AB', 10).width;
    const widthASB = measureHersheyText('A B', 10).width;
    expect(widthASB).toBeGreaterThan(widthAB);
  });

  it('prázdný řetězec vrátí []', () => {
    expect(renderHersheyText('', 10)).toEqual([]);
  });

  it('fontSize=0 vrátí []', () => {
    expect(renderHersheyText('A', 0)).toEqual([]);
  });

  it('umístí text na zadané (cx, cy)', () => {
    const polys = renderHersheyText('A', 10, 100, 50);
    // První tah A: levá noha, začíná v (9, 1) v Hershey jednotkách
    // Po scale (10/21) a posunu se vrcholy musí pohybovat kolem (100, 50).
    const allX = polys.flatMap(p => p.vertices.map(v => v.x));
    const allY = polys.flatMap(p => p.vertices.map(v => v.y));
    expect(Math.min(...allX)).toBeGreaterThanOrEqual(99);
    expect(Math.max(...allX)).toBeLessThanOrEqual(110);
    // Y u kapitálky leží mezi baseline (cy - fontSize) a top (cy);
    // Hershey A má y rozsah 1..22 (cap height 21j ≈ fontSize 10mm)
    expect(Math.min(...allY)).toBeGreaterThanOrEqual(39);
    expect(Math.max(...allY)).toBeLessThanOrEqual(52);
  });
});

describe('measureHersheyText', () => {
  it('vrátí šířku > 0 pro běžný text', () => {
    const m = measureHersheyText('TEST', 10);
    expect(m.width).toBeGreaterThan(0);
    expect(m.height).toBe(10);
  });

  it('delší text má větší šířku', () => {
    expect(measureHersheyText('AB', 10).width).toBeLessThan(measureHersheyText('ABC', 10).width);
  });

  it('větší fontSize → větší šířka (proporcionálně)', () => {
    const w10 = measureHersheyText('A', 10).width;
    const w20 = measureHersheyText('A', 20).width;
    expect(w20 / w10).toBeCloseTo(2, 1);
  });

  it('prázdný text má width=0', () => {
    expect(measureHersheyText('', 10)).toEqual({ width: 0, height: 10 });
  });
});

describe('renderHersheyText – rotace', () => {
  it('rotace o 90° otočí texto kolem (cx, cy)', () => {
    const norm = renderHersheyText('A', 10, 0, 0, 0);
    const rot = renderHersheyText('A', 10, 0, 0, Math.PI / 2);
    expect(rot.length).toBe(norm.length);
    // Po rotaci 90° (CCW): původní +X se stane +Y, původní +Y se stane -X
    // Tedy maxY rotovaného ≈ maxX normálního
    const normMaxX = Math.max(...norm.flatMap(p => p.vertices.map(v => v.x)));
    const rotMaxY = Math.max(...rot.flatMap(p => p.vertices.map(v => v.y)));
    expect(rotMaxY).toBeCloseTo(normMaxX, 1);
  });
});

describe('renderHersheyText – neznámé znaky', () => {
  it('znak mimo ASCII (např. č) přeskočí bez chyby', () => {
    // 'č' (255) je mimo 33–126; nevyrobí polylines, ale ani nepadne
    const polys = renderHersheyText('Ač', 10);
    const justA = renderHersheyText('A', 10);
    expect(polys).toHaveLength(justA.length);
  });

  it('všechny ASCII znaky 33–126 jsou definované', () => {
    for (let code = 33; code <= 126; code++) {
      const polys = renderHersheyText(String.fromCharCode(code), 10);
      expect(polys.length, `char ${code} "${String.fromCharCode(code)}"`).toBeGreaterThan(0);
    }
  });
});
