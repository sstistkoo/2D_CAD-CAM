import { describe, it, expect } from 'vitest';
import { boltCircle, normAngle } from '../js/calculators/boltCircleMath.js';

describe('boltCircle – díry na roztečné kružnici', () => {
  it('6 děr na Ø100 od 0°: souřadnice a rozteč', () => {
    const r = boltCircle({ count: 6, pcd: 100 });
    expect(r.pitch).toBe(60);
    expect(r.holes[0]).toMatchObject({ x: 50, y: 0, c: 0 });
    expect(r.holes[1].x).toBeCloseTo(25, 10);
    expect(r.holes[1].y).toBeCloseTo(50 * Math.sin(Math.PI / 3), 10);
    expect(r.chord).toBeCloseTo(50, 10);          // šestiúhelník: tětiva = poloměr
  });
  it('všechny díry leží na roztečné kružnici i s posunutým středem', () => {
    const r = boltCircle({ count: 7, pcd: 80, start: 15, cx: 10, cy: -5 });
    for (const h of r.holes) expect(Math.hypot(h.x - 10, h.y + 5)).toBeCloseTo(40, 10);
  });
  it('po směru hodin: úhly klesají, C normované do 0–360', () => {
    const r = boltCircle({ count: 4, pcd: 50, start: 45, cw: true });
    expect(r.holes.map(h => h.c)).toEqual([45, 315, 225, 135]);
    expect(r.holes[1].y).toBeCloseTo(-25 * Math.SQRT1_2, 10);
    const r8 = boltCircle({ count: 8, pcd: 50, start: 45, cw: true });
    expect(r8.holes[1]).toMatchObject({ c: 0, y: 0 });
  });
  it('zadaná rozteč (část kruhu)', () => {
    const r = boltCircle({ count: 3, pcd: 60, start: 90, pitch: 30 });
    expect(r.holes.map(h => h.c)).toEqual([90, 120, 150]);
    expect(r.span).toBe(60);
    expect(r.chord).toBeCloseTo(60 * Math.sin(15 * Math.PI / 180), 10);
  });
  it('neplatné vstupy → null', () => {
    expect(boltCircle({ count: 0, pcd: 50 })).toBeNull();
    expect(boltCircle({ count: 2.5, pcd: 50 })).toBeNull();
    expect(boltCircle({ count: 4, pcd: -1 })).toBeNull();
    expect(boltCircle({ count: 4, pcd: 50, pitch: 0 })).toBeNull();
  });
  it('normAngle', () => {
    expect(normAngle(-90)).toBe(270);
    expect(normAngle(720)).toBe(0);
    expect(normAngle(359.9999999999)).toBe(0);
  });
});
