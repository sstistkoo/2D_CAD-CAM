// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: duplicitní kóty se nepřidávají              ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('document', {
  getElementById: () => ({
    disabled: false, classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    textContent: '', innerHTML: '', querySelectorAll: () => [],
    appendChild: vi.fn(), style: {},
  }),
  createElement: () => ({
    className: '', textContent: '', innerHTML: '',
    classList: { add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(), addEventListener: vi.fn(),
    setAttribute: vi.fn(), style: {},
  }),
  body: { appendChild: vi.fn() },
  querySelector: () => null,
  querySelectorAll: () => [],
});
vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768, addEventListener: vi.fn() });
vi.stubGlobal('navigator', { vibrate: vi.fn() });

vi.mock('../js/render.js', () => ({ renderAll: vi.fn(), renderAllDebounced: vi.fn() }));
vi.mock('../js/ui.js', () => ({ updateObjectList: vi.fn(), updateProperties: vi.fn() }));
vi.mock('../js/geometry.js', () => ({ calculateAllIntersections: vi.fn() }));
vi.mock('../js/canvas.js', () => ({
  autoCenterView: vi.fn(), drawCanvas: { width: 800, height: 600 },
}));

import { state } from '../js/state.js';
import { addObject } from '../js/objects.js';
import { findDuplicateDimension } from '../js/dimensionDedup.js';
import {
  addDimensionForObject, addLinearDimForLine, addAngleDimensionForLines,
  addAngleDimForPlacement, addArcRadiusLeader,
} from '../js/dialogs/dimension.js';

const dims = () => state.objects.filter(o => o.isDimension);

beforeEach(() => {
  state.objects = [];
  state.undoStack = [];
  state.redoStack = [];
  state.nextId = 1;
  state.activeLayer = 0;
  state.layers = [{ id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false }];
});

describe('duplicitní kóty', () => {
  it('stejná úsečka okótovaná dvakrát → jen jedna kóta', () => {
    const line = addObject({ type: 'line', x1: 0, y1: 50, x2: 150, y2: 50 });
    addDimensionForObject(line);
    addDimensionForObject(line);
    expect(dims()).toHaveLength(1);
  });

  it('jiné odsazení / režim kóty téže vodorovné úsečky je pořád duplicita', () => {
    const line = addObject({ type: 'line', x1: 0, y1: 50, x2: 150, y2: 50 });
    addLinearDimForLine(line, 75, 80);   // vodorovná kóta nad úsečkou
    addLinearDimForLine(line, 75, 110);  // znovu, výš
    addDimensionForObject(line);         // zarovnaná (aligned) = totéž
    expect(dims()).toHaveLength(1);
  });

  it('dvě různé úsečky se stejnou délkou se okótují obě', () => {
    const a = addObject({ type: 'line', x1: 0, y1: 25, x2: 0, y2: 50 });
    const b = addObject({ type: 'line', x1: 200, y1: 25, x2: 200, y2: 50 });
    addDimensionForObject(a);
    addDimensionForObject(b);
    expect(dims()).toHaveLength(2);
  });

  it('kóta mezi dvěma body – obrácené pořadí bodů je duplicita', () => {
    addObject({ type: 'line', x1: 0, y1: 0, x2: 30, y2: 40, isDimension: true, layer: 2 });
    const r = addObject({ type: 'line', x1: 30, y1: 40, x2: 0, y2: 0, isDimension: true, layer: 2 });
    expect(r).toBeNull();
    expect(dims()).toHaveLength(1);
  });

  it('duplicitní kóta nezaloží krok Zpět', () => {
    const line = addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
    addDimensionForObject(line);
    const undoLen = state.undoStack.length;
    addDimensionForObject(line);
    expect(state.undoStack.length).toBe(undoLen);
  });

  it('souřadnicová kóta bodu jen jednou', () => {
    addDimensionForObject({ type: 'point', x: 10, y: 20 });
    addDimensionForObject({ type: 'point', x: 10, y: 20 });
    addDimensionForObject({ type: 'point', x: 10, y: 21 });
    expect(dims()).toHaveLength(2);
  });

  it('úhlová kóta mezi stejnými úsečkami jen jednou, vnější úhel zvlášť', () => {
    const l1 = addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
    const l2 = addObject({ type: 'line', x1: 0, y1: 0, x2: 0, y2: 10 });
    addAngleDimensionForLines(l1, l2);
    addAngleDimForPlacement(l1, l2, 3, 3);    // tentýž 90° úhel
    expect(dims()).toHaveLength(1);
    addAngleDimForPlacement(l1, l2, -3, -3);  // reflexní 270° – jiná kóta
    expect(dims()).toHaveLength(2);
  });

  it('kóta R oblouku jen jednou (i s jiným umístěním popisku)', () => {
    const arc = addObject({ type: 'arc', cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: Math.PI / 2 });
    addArcRadiusLeader(arc, 0.3, 20, 20);
    addArcRadiusLeader(arc, 1.0, 30, 5);
    expect(dims().filter(d => d.dimType === 'radius')).toHaveLength(1);
  });

  it('obdélník okótovaný dvakrát → stále 2 kóty', () => {
    const rect = addObject({ type: 'rect', x1: 0, y1: 0, x2: 40, y2: 20 });
    addDimensionForObject(rect);
    addDimensionForObject(rect);
    expect(dims()).toHaveLength(2);
  });

  it('dočasný popisek měření se nepovažuje za kótu', () => {
    const temp = { type: 'point', x: 1, y: 1, isDimension: true, isCoordLabel: true, isMeasureTemp: true };
    state.objects.push(temp);
    expect(findDuplicateDimension(state.objects, { ...temp, isMeasureTemp: undefined })).toBeNull();
  });

  it('běžné (ne-kótové) objekty se neblokují', () => {
    addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
    const r = addObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
    expect(r).not.toBeNull();
  });
});
