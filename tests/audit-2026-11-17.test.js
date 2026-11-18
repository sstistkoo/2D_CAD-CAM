// Kontrola kódu 17. 11. 2026 – číselné zadání oblouku.
import { describe, it, expect } from 'vitest';
import { arcSweep, signedArcRadius } from '../js/dialogs/numArcSign.js';
import { arcFromEndpointsRadius } from '../js/utils.js';

describe('numerický vstup: R se znaménkem v ručním G-kódu', () => {
  it('oblouk do 180° má kladné R, přes 180° záporné', () => {
    const deg = (d) => d * Math.PI / 180;
    expect(signedArcRadius({ r: 5, sa: 0, ea: deg(90), ccw: true })).toBe(5);
    expect(signedArcRadius({ r: 5, sa: 0, ea: deg(270), ccw: true })).toBe(-5);
    // Stejné úhly po směru hodin: 0 → 270° CW je jen 90°.
    expect(signedArcRadius({ r: 5, sa: 0, ea: deg(270), ccw: false })).toBe(5);
    expect(signedArcRadius({ r: 5, sa: 0, ea: deg(90), ccw: false })).toBe(-5);
    expect(arcSweep(deg(350), deg(10), true)).toBeCloseTo(deg(20), 9);
  });

  it('Start + konec se záporným R postaví dlouhý oblouk a zapíše se zpět záporně', () => {
    const p1 = { x: 0, y: 0 }, p2 = { x: 10, y: 0 };
    for (const ccw of [true, false]) {
      const short = arcFromEndpointsRadius(p1, p2, 8, ccw);
      const long = arcFromEndpointsRadius(p1, p2, 8, ccw, { longArc: true });
      const g = (a) => ({ r: a.r, sa: a.startAngle, ea: a.endAngle, ccw });
      expect(signedArcRadius(g(short))).toBe(8);
      expect(signedArcRadius(g(long))).toBe(-8);
    }
  });
});
