import { describe, it, expect, beforeEach, vi } from 'vitest';

// stockTools táhne DOM moduly (ui/render/canvas) — pro čistou geometrii stačí prázdné stuby.
vi.mock('../js/ui.js', () => ({ updateObjectList: () => {} }));
vi.mock('../js/render.js', () => ({ renderAll: () => {} }));
vi.mock('../js/canvas.js', () => ({ fitViewToWorldBounds: () => {} }));
vi.mock('../js/geometry.js', () => ({ calculateAllIntersections: () => {} }));
import { state } from '../js/state.js';
import { findContourBranches, findContourGaps, findContourDuplicates } from '../js/stockTools.js';

const L = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2 });

// Profil: osa (0,0) → (0,57) → (150,57) → (205,46) → schod (205,36) → (250,36) → (255,0)
const profile = () => [
  L(0, 0, 0, 57), L(0, 57, 150, 57), L(150, 57, 205.149, 46.276),
  L(205.149, 46.276, 205.149, 36.276), L(205.149, 36.276, 250, 36.276), L(250, 36.276, 255, 0),
];

describe('findContourBranches', () => {
  beforeEach(() => { state.objects = []; });

  it('souvislý profil bez větvení nic nehlásí', () => {
    state.objects = profile();
    expect(findContourBranches()).toEqual([]);
    expect(findContourGaps()).toEqual([]);
  });

  it('šikmá úsečka přes starý schod = dvě větvení (nález 29. 9. 2026)', () => {
    state.objects = [...profile(), L(205.149, 46.276, 250, 36.276)];
    const b = findContourBranches();
    expect(b).toHaveLength(2);
    expect(b.every(p => p.branch)).toBe(true);
    // mezery to nejsou — proto to findContourGaps dřív nepoznal
    expect(findContourGaps()).toEqual([]);
  });

  it('polotovar a konstrukční čáry se nepočítají', () => {
    state.objects = [...profile(),
      { ...L(205.149, 46.276, 300, 46.276), isStock: true },
      { type: 'constr', x1: 205.149, y1: 46.276, x2: 0, y2: 0 }];
    expect(findContourBranches()).toEqual([]);
  });
});

describe('findContourDuplicates', () => {
  beforeEach(() => { state.objects = []; });

  it('bez zdvojení nic nehlásí', () => {
    state.objects = profile();
    expect(findContourDuplicates()).toEqual([]);
  });

  it('úsečka dvakrát přes sebe (i obráceně) = jedna kopie navíc, maže se ta pozdější (nález 30. 9. 2026)', () => {
    const objs = profile();
    const copy = L(250, 36.276, 205.149, 36.276); // stejný schod, nakreslený opačně
    state.objects = [...objs, copy];
    const d = findContourDuplicates();
    expect(d).toHaveLength(1);
    expect(d[0].obj).toBe(copy);
    expect(d[0].keep).toBe(objs[4]);
    // její konce vyjdou jako větvení — bez ní ne
    expect(findContourBranches()).toHaveLength(2);
    expect(findContourBranches(new Set([copy]))).toEqual([]);
  });

  it('úsečka jen s jedním společným koncem není zdvojení', () => {
    state.objects = [...profile(), L(205.149, 46.276, 250, 36.276)];
    expect(findContourDuplicates()).toEqual([]);
  });

  it('úsečka přes kus polyline: maže se úsečka, ne polyline', () => {
    const pl = { type: 'polyline', vertices: [{ x: 0, y: 0 }, { x: 0, y: 57 }, { x: 150, y: 57 }], bulges: [0, 0] };
    const line = L(0, 57, 150, 57);
    state.objects = [line, pl];
    const d = findContourDuplicates();
    expect(d).toHaveLength(1);
    expect(d[0].obj).toBe(line);
    expect(d[0].keep).toBe(pl);
  });

  it('oblouk: stejný oblouk obráceně = zdvojení, doplňkový oblouk mezi týmiž body ne', () => {
    const A = { type: 'arc', cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: Math.PI / 2, ccw: true };
    const sameRev = { type: 'arc', cx: 0, cy: 0, r: 10, startAngle: Math.PI / 2, endAngle: 0, ccw: false };
    const complement = { type: 'arc', cx: 0, cy: 0, r: 10, startAngle: Math.PI / 2, endAngle: 0, ccw: true };
    state.objects = [A, sameRev];
    expect(findContourDuplicates().map(d => d.obj)).toEqual([sameRev]);
    state.objects = [A, complement];
    expect(findContourDuplicates()).toEqual([]);
  });

  it('polotovar přes konturu se nepočítá (je to běžné, ne chyba)', () => {
    state.objects = [...profile(), { ...L(0, 57, 150, 57), isStock: true }];
    expect(findContourDuplicates()).toEqual([]);
  });
});
