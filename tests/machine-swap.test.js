// Přepnutí Soustruh ↔ Karusel: výkres se zrcadlí přes úhlopříčku wx ↔ wy,
// aby díl zůstal na svých souřadnicích X/Z (js/machineSwap.js).
import { describe, it, expect } from 'vitest';
import { swapObjectAxes, swapDrawingAxes } from '../js/machineSwap.js';
import { state } from '../js/state.js';

const TAU = 2 * Math.PI;
const norm = a => ((a % TAU) + TAU) % TAU;
// Bod oblouku v poměru t ∈ ⟨0,1⟩ od začátku ke konci (ccw neuvedeno = CCW)
function arcPoint(o, t) {
  const sweep = o.ccw === false ? -norm(o.startAngle - o.endAngle) : norm(o.endAngle - o.startAngle);
  const a = o.startAngle + sweep * t;
  return { x: o.cx + o.r * Math.cos(a), y: o.cy + o.r * Math.sin(a) };
}

describe('machineSwap – prohození os výkresu', () => {
  it('oblouk: začátek, střed i konec leží na prohozených bodech', () => {
    for (const ccw of [undefined, false, true]) {
      const o = { type: 'arc', cx: -20, cy: 30, r: 5, startAngle: 0.3, endAngle: 2.1, ccw };
      const before = [0, 0.5, 1].map(t => arcPoint(o, t));
      swapObjectAxes(o);
      [0, 0.5, 1].forEach((t, i) => {
        const p = arcPoint(o, t);
        expect(p.x).toBeCloseTo(before[i].y, 9);
        expect(p.y).toBeCloseTo(before[i].x, 9);
      });
    }
  });

  it('polylinie: body prohozené, bulge s opačným znaménkem, vazby H ↔ V', () => {
    const o = { type: 'polyline', vertices: [{ x: -10, y: 20 }, { x: 0, y: 20 }], bulges: [0.4, 0],
      closed: false, segConstraints: { 0: 'horizontal' } };
    swapObjectAxes(o);
    expect(o.vertices).toEqual([{ x: 20, y: -10 }, { x: 20, y: 0 }]);
    expect(o.bulges).toEqual([-0.4, -0]);
    expect(o.segConstraints[0]).toBe('vertical');
  });

  it('úsečka a kóta: body, zdroj kóty, režim i střed', () => {
    const l = { type: 'line', x1: 1, y1: 2, x2: 3, y2: 4, constraint: 'vertical' };
    swapObjectAxes(l);
    expect(l).toMatchObject({ x1: 2, y1: 1, x2: 4, y2: 3, constraint: 'horizontal' });
    const d = { type: 'line', isDimension: true, dimType: 'linear', dimMode: 'horizontal', dimOffset: 7,
      x1: 0, y1: 10, x2: 5, y2: 10, dimSrcX1: 0, dimSrcY1: 3, dimSrcX2: 5, dimSrcY2: 3 };
    swapObjectAxes(d);
    expect(d).toMatchObject({ dimMode: 'vertical', dimOffset: 7, x1: 10, y1: 0, dimSrcX1: 3, dimSrcY1: 0 });
    const a = { type: 'line', isDimension: true, dimType: 'angular', x1: 1, y1: 0, x2: 0, y2: 1,
      dimCenterX: 2, dimCenterY: 5, dimMidAng: Math.PI / 4 + 0.1 };
    swapObjectAxes(a);
    expect(a.dimCenterX).toBe(5);
    expect(a.dimMidAng).toBeCloseTo(Math.PI / 4 - 0.1, 12);
  });

  it('obdélník: střed a rozměry prohozené', () => {
    const o = { type: 'rect', x1: -30, y1: 0, x2: -10, y2: 5 };
    swapObjectAxes(o);
    expect(o).toMatchObject({ x1: 0, y1: -30, x2: 5, y2: -10 });
  });

  it('dvojí prohození vrátí výkres i historii beze změny', () => {
    const objs = [
      { id: 1, type: 'arc', cx: 1, cy: 2, r: 3, startAngle: 0.2, endAngle: 1.4 },
      { id: 2, type: 'circle', cx: -5, cy: 8, r: 2 },
      { id: 3, type: 'text', x: 4, y: 9, text: 'A', rotation: 0 },
    ];
    state.objects = JSON.parse(JSON.stringify(objs));
    state.anchors = [{ x: 1, y: 7 }];
    state.undoStack = [JSON.stringify({ objects: objs, anchors: [] })];
    state.redoStack = [];
    swapDrawingAxes();
    expect(state.objects[1]).toMatchObject({ cx: 8, cy: -5 });
    expect(state.anchors[0]).toEqual({ x: 7, y: 1 });
    expect(JSON.parse(state.undoStack[0]).objects[1]).toMatchObject({ cx: 8, cy: -5 });
    swapDrawingAxes();
    state.objects.forEach((o, i) => {
      for (const k of Object.keys(objs[i])) {
        if (typeof objs[i][k] === 'number') expect(o[k]).toBeCloseTo(objs[i][k], 12);
      }
    });
  });
});
