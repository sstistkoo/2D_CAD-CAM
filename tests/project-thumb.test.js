import { describe, it, expect } from 'vitest';
import { thumbSVG } from '../js/storage/projectThumb.js';

describe('náhled výkresu v seznamu', () => {
  it('prázdný výkres', () => {
    expect(thumbSVG({ objects: [] })).toContain('prázdný');
    expect(thumbSVG(null)).toContain('prázdný');
  });
  it('úsečka, oblouk, kružnice, kontura s obloukem; kóty a texty ne', () => {
    const svg = thumbSVG({ objects: [
      { type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, layer: 0 },
      { type: 'arc', cx: 100, cy: 10, r: 10, startAngle: -Math.PI / 2, endAngle: 0, ccw: true, layer: 0 },
      { type: 'circle', cx: 50, cy: 40, r: 5, layer: 0 },
      { type: 'polyline', vertices: [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 20, y: 50 }], bulges: [0, 1], closed: false, layer: 3 },
      { type: 'line', x1: -500, y1: 0, x2: 500, y2: 0, isDimension: true },
      { type: 'text', x: 9999, y: 9999, text: 'x' },
    ] });
    expect((svg.match(/<path/g) || []).length).toBe(3);
    expect(svg).toContain('<circle');
    expect(svg).toContain('pt-stock');                 // polotovar slabší čarou
    expect(svg).toMatch(/A[\d.]+ [\d.]+ 0 0 0 /);      // oblouk proti hodinám = sweep 0 (osa y otočená)
    // kóta ani text nerozšířily měřítko: úsečka 0…100 vyplní šířku náhledu
    const m = /M([\d.]+) [\d.]+L([\d.]+)/.exec(svg);
    expect(+m[2] - +m[1]).toBeGreaterThan(50);
  });
  it('osa y výkresu jde nahoru (vyšší y = výš v obrázku)', () => {
    const svg = thumbSVG({ objects: [{ type: 'line', x1: 0, y1: 0, x2: 0, y2: 100 }] });
    const m = /M[\d.]+ ([\d.]+)L[\d.]+ ([\d.]+)/.exec(svg);
    expect(+m[2]).toBeLessThan(+m[1]);
  });
});
