// ⇋ Zrcadlit kolem osy: soustruh kolem y = 0 (dolů), karusel kolem x = 0 (doleva)
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../js/render.js', () => ({ renderAll: vi.fn(), renderAllDebounced: vi.fn() }));
vi.mock('../js/canvas.js', () => ({ drawCanvas: { width: 800, height: 600 } }));
import { state } from '../js/state.js';
import { mirrorObjectAcrossAxis, mirrorObjectAcrossY, refSnapObjects } from '../js/render/mirrorSnap.js';
import { drawAxisEdges, axisEdgeSnapLines } from '../js/render/mirrorEdges.js';
import { findObjectAt } from '../js/geometry/select.js';

const g = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, setLineDash() {} };
const w2s = (x, y) => [x, -y];

beforeEach(() => {
  state.objects = [];
  state.layers = [{ id: 0, name: 'L', visible: true, locked: false }];
  state.mirrorPreview = true;
  state.mirrorEdges = true;
  state.zoom = 1;
});

describe('mirrorObjectAcrossAxis', () => {
  it('soustruh: y → −y (beze změny proti mirrorObjectAcrossY)', () => {
    state.machineType = 'soustruh';
    const l = { type: 'line', x1: 10, y1: 20, x2: 30, y2: 40 };
    expect(mirrorObjectAcrossAxis(l)).toMatchObject({ x1: 10, y1: -20, x2: 30, y2: -40 });
    expect(mirrorObjectAcrossY(l)).toMatchObject({ y1: -20 });
  });
  it('karusel: x → −x (pravý horní kvadrant → levý horní)', () => {
    state.machineType = 'karusel';
    const l = { type: 'line', x1: 10, y1: 20, x2: 30, y2: 40 };
    expect(mirrorObjectAcrossAxis(l)).toMatchObject({ x1: -10, y1: 20, x2: -30, y2: 40 });
    const pl = { type: 'polyline', vertices: [{ x: 0, y: 0 }, { x: 50, y: 100 }], bulges: [0.3] };
    const m = mirrorObjectAcrossAxis(pl);
    expect(m.vertices).toEqual([{ x: -0, y: 0 }, { x: -50, y: 100 }]);
    expect(m.bulges).toEqual([-0.3]);
  });
  it('karusel: oblouk — konce zrcadlené přes x = 0', () => {
    state.machineType = 'karusel';
    const a = { type: 'arc', cx: 20, cy: 10, r: 5, startAngle: 0, endAngle: Math.PI / 2 };
    const m = mirrorObjectAcrossAxis(a);
    const end = (o, t) => [o.cx + o.r * Math.cos(t), o.cy + o.r * Math.sin(t)];
    const [sx, sy] = end(m, m.startAngle), [ex, ey] = end(m, m.endAngle);
    expect(sx).toBeCloseTo(-25); expect(sy).toBeCloseTo(10);
    expect(ex).toBeCloseTo(-20); expect(ey).toBeCloseTo(15);
    expect(m.ccw).toBe(false);
  });
});

describe('karusel: klik, SNAP a hrany přes osu', () => {
  it('klik na zrcadlo vlevo vybere originál vpravo', () => {
    state.machineType = 'karusel';
    state.objects = [{ type: 'line', layer: 0, x1: 40, y1: 0, x2: 40, y2: 100 }];
    expect(findObjectAt(-40, 50)).toBe(0);
    expect(findObjectAt(40, -50)).toBe(null);   // pod osou nic není
  });
  it('SNAP podklad leží vlevo od osy', () => {
    state.machineType = 'karusel';
    state.objects = [{ type: 'line', layer: 0, x1: 40, y1: 0, x2: 40, y2: 100 }];
    const m = refSnapObjects()[0];
    expect(m).toMatchObject({ x1: -40, y1: 0, x2: -40, y2: 100 });
  });
  it('hrana osazení je vodorovná úsečka přes osu (−r … r) ve stejném Z', () => {
    state.machineType = 'karusel';
    // Profil karuselu: wx = poloměr, wy = Z; osazení v Z 50 z r 40 na r 30
    state.objects = [{
      type: 'polyline', layer: 0, closed: true,
      vertices: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 50 }, { x: 30, y: 50 }, { x: 30, y: 100 }, { x: 0, y: 100 }],
    }];
    drawAxisEdges(g, w2s);
    const lines = axisEdgeSnapLines();
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach(l => expect(l.y1).toBeCloseTo(l.y2));     // vodorovné
    const at50 = lines.filter(l => Math.abs(l.y1 - 50) < 1e-6);
    expect(at50.length).toBeGreaterThan(0);
    expect(Math.min(...at50.flatMap(l => [l.x1, l.x2]))).toBeCloseTo(-30);
  });
});
