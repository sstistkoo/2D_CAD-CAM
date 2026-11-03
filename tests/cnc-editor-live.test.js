// Zmenšený CNC editor: geometrie živého náhledu na plátně (cncDrawPreview.js → cncEditorLive.js).
import { describe, it, expect } from 'vitest';
import { movePoints, movesBounds, segDist } from '../js/calculators/cncDrawPreview.js';
import { analyzeDrawCode } from '../js/calculators/cncDrawTools.js';

const opts = { diam: false, karusel: false, flip: false };

describe('cncEditorLive – náhled na plátně', () => {
  it('úsečka: soustruh x=Z, y=poloměr', () => {
    const an = analyzeDrawCode('G0 X0 Z0\nG1 X40\nZ-60', opts);
    const pts = movePoints(an.moves[2], false);
    expect(pts[0]).toMatchObject({ x: 0, y: 40 });
    expect(pts[pts.length - 1]).toMatchObject({ x: -60, y: 40 });
    expect(movesBounds(an)).toEqual({ minX: -60, maxX: 0, minY: 0, maxY: 40 });
  });

  it('oblouk se navzorkuje a končí v cílovém bodě', () => {
    const an = analyzeDrawCode('G0 X0 Z0\nG1 X20\nG3 X30 Z-10 R10', opts);
    const arc = an.moves.find(m => m.arc);
    const pts = movePoints(arc, false);
    expect(pts.length).toBeGreaterThan(4);
    const e = pts[pts.length - 1];
    expect(e.x).toBeCloseTo(-10, 6); expect(e.y).toBeCloseTo(30, 6);
    for (const p of pts.slice(1, -1)) expect(Math.hypot(p.x - arc.arc.cz, p.y - arc.arc.cx)).toBeCloseTo(10, 6);
  });

  it('karusel: x=poloměr, y=Z; prázdný kód bez rozměru', () => {
    const an = analyzeDrawCode('G0 X0 Z0\nG1 X40', { ...opts, karusel: true });
    expect(movesBounds(an)).toEqual({ minX: 0, maxX: 40, minY: 0, maxY: 0 });
    expect(movesBounds(analyzeDrawCode('', opts))).toBeNull();
  });
});

describe('segDist (klepnutí na čáru náhledu)', () => {
  it('vzdálenost od úsečky i za jejími konci', () => {
    expect(segDist(5, 3, [0, 0], [10, 0])).toBe(3);
    expect(segDist(13, 4, [0, 0], [10, 0])).toBe(5);
    expect(segDist(1, 1, [0, 0], [0, 0])).toBeCloseTo(Math.SQRT2);
  });
});
