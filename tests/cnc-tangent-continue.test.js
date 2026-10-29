// CNC Editor – úsečka úhlem: „⟿ Tečně" = odklon 0° od směru konce předchozího oblouku.
import { describe, it, expect } from 'vitest';
import { analyzeDrawCode, moveAtOrBefore, moveDirDeg, angleLineEnd } from '../js/calculators/cncDrawTools.js';

function tangentEnd(code, L = 7) {
  const an = analyzeDrawCode(code, {});
  const lines = code.split('\n').length - 1;
  const p = moveAtOrBefore(an, lines);
  const dir = moveDirDeg(p, an);
  const end = angleLineEnd(p.to, dir + 0, { L }, an.xs);   // odklon 0° = beze změny směru
  return { an, p, dir, end };
}

describe('tečné pokračování za obloukem', () => {
  for (const g of ['G02', 'G03']) {
    it(`${g}: nová úsečka je kolmá na poloměr v koncovém bodě oblouku`, () => {
      const { an, p, end } = tangentEnd(`G90 G00 X0 Z0\n${g} X10 Z-10 R10`);
      expect([2, 3]).toContain(p.g);                          // tlačítko ⟿ Tečně se ukazuje jen za obloukem
      const a = p.arc;
      const rz = p.to.z - a.cz, rx = p.to.x - a.cx;          // poloměr do koncového bodu
      const dz = end.z - p.to.z, dx = end.x / an.xs - p.to.x; // směr nové úsečky
      expect(rz * dz + rx * dx).toBeCloseTo(0, 6);            // kolmost = tečna
      expect(Math.hypot(dz, dx)).toBeCloseTo(7, 6);           // zadaná délka
    });
  }
  it('za úsečkou G1 pokračuje ve stejném směru', () => {
    const { p, end } = tangentEnd('G90 G00 X0 Z0\nG01 X10 Z-10', 5);
    expect(p.g).toBe(1);                                     // za úsečkou se „Tečně" nenabízí
    const k = 5 / Math.hypot(10, 10);
    expect(end.z - p.to.z).toBeCloseTo(-10 * k, 6);
    expect(end.x - p.to.x).toBeCloseTo(10 * k, 6);
  });
});
