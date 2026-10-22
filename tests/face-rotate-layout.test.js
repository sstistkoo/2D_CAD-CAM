// ╔══════════════════════════════════════════════════════════════╗
// ║  Bokorys: poloha posuvníku natočení (osa C)                   ║
// ╚══════════════════════════════════════════════════════════════╝
// Dráha napevno u bokorysu: vlevo (mezi nárysem a bokorysem), při oddálení,
// kdy by ležela přes nárys, vpravo; políčko C pod bokorysem, ne přes nárys
// (uživatel 22. 10. 2026).
import { describe, it, expect, vi } from 'vitest';
import { rotateLayout } from '../js/faceView/faceRotate.js';

vi.mock('../js/ui.js', () => ({ updateLayerList: () => {} }));
vi.mock('../js/canvas.js', () => ({ worldToScreen: (x, y) => [x, -y] }));

const C = [300, 200], R = 40;   // střed a obrys bokorysu [px]

describe('posuvník natočení u bokorysu', () => {
  it('vlevo, když je mezi nárysem a bokorysem místo', () => {
    const g = rotateLayout(C, R, [{ x0: 0, x1: 200, y0: 150, y1: 210 }], 90, 24);
    expect(g.side).toBe('left');
    expect(g.track.x1).toBeLessThan(C[0] - R);
    expect(g.track.x0).toBeGreaterThan(200);
  });

  it('při oddálení (nárys až u bokorysu) přeskočí vpravo', () => {
    const g = rotateLayout(C, R, [{ x0: 0, x1: 250, y0: 150, y1: 210 }], 90, 24);
    expect(g.side).toBe('right');
    expect(g.track.x0).toBeGreaterThan(C[0] + R);
  });

  it('jen bokorys (bez nárysu): vlevo', () => {
    expect(rotateLayout(C, R, [], 90, 24).side).toBe('left');
  });

  it('poloha se posouvá s bokorysem (žádné přisouvání k okraji plátna)', () => {
    const a = rotateLayout(C, R, [], 90, 24);
    const b = rotateLayout([C[0] + 500, C[1] + 30], R, [], 90, 24);
    expect(b.track.x0 - a.track.x0).toBe(500);
    expect(b.track.y0 - a.track.y0).toBe(30);
    expect(b.ctl.x0 - a.ctl.x0).toBe(500);
  });

  it('políčko pod bokorysem se odsune z nárysu i z řádku lišty Z', () => {
    const nar = { x0: 0, x1: 200, y0: 150, y1: 200 };
    const row = { x0: 20, x1: 270, y0: 240, y1: 290 };   // řádek lišty Z přesahuje pod bokorys
    const g = rotateLayout(C, R, [nar, row], 90, 24);
    expect(g.ctl.y0).toBeGreaterThan(C[1] + R);
    expect(g.ctl.x0).toBeGreaterThan(row.x1);
  });
});
