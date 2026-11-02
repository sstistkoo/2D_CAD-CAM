// Karusel v CAM (uživatel 2. 11. 2026): tentýž díl nakreslený pro soustruh
// a pro karusel (přepnutí SOU → KAR prohodí výkres, machineSwap.js) musí
// do CAM dorazit jako STEJNÁ kontura a CAM z ní musí vygenerovat STEJNÝ
// program — pohled Karusel (machineStructure 'carousel') mění jen náhled,
// ne dráhy (X radiální, Z osa vřetena u obou strojů).
import { describe, it, expect, vi, beforeAll } from 'vitest';

function makeEl() {
  const el = new Proxy(function () {}, {
    get(t, p) {
      if (p === 'value') return t.__value ?? '';
      if (p === 'style' || p === 'classList' || p === 'dataset') return makeEl();
      if (p === 'getContext') return () => makeEl();
      if (p === 'querySelector' || p === 'getElementById') return () => makeEl();
      if (p === 'querySelectorAll') return () => [];
      if (p === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 800, height: 600 });
      if (p === Symbol.toPrimitive) return () => '';
      return makeEl();
    },
    set(t, p, v) { if (p === 'value') t.__value = v; return true; },
    apply() { return makeEl(); },
  });
  return el;
}

let state, bridge, swapObjectsAxes, parseContourAndStockGCode, runCamProg;
beforeAll(async () => {
  const outEl = { value: '', addEventListener() {}, focus() {}, setSelectionRange() {} };
  vi.stubGlobal('document', new Proxy({}, {
    get(t, p) {
      if (p === 'getElementById') return (id) => (id === 'cncOutput' ? outEl : makeEl());
      if (p === 'querySelectorAll') return () => [];
      if (p === 'addEventListener') return () => {};
      return makeEl();
    },
  }));
  vi.stubGlobal('window', new Proxy({ addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), devicePixelRatio: 1 }, {
    get(t, p) { return p in t ? t[p] : makeEl(); },
  }));
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() }, userAgent: 'node' });
  await import('../js/storage/fileIO.js');
  ({ bridge } = await import('../js/bridge.js'));
  ({ state } = await import('../js/state.js'));
  ({ swapObjectsAxes } = await import('../js/machineSwap.js'));
  ({ parseContourAndStockGCode } = await import('../js/calculators/cam/gcodeParser.js'));
  ({ runCamProg } = await import('./helpers/camHeadless.mjs'));
});

const L = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, name: 'Úsečka' });
// Soustruh: svět x = Z, y = X (poloměr). Čelo, vypouklé R5, osazení, vydutý R4.
const latheDrawing = () => [
  L(0, 0, 0, 25),
  { type: 'arc', cx: -5, cy: 25, r: 5, startAngle: 0, endAngle: Math.PI / 2, name: 'R5' },
  L(-5, 30, -26, 30),
  { type: 'arc', cx: -26, cy: 34, r: 4, startAngle: -Math.PI / 2, endAngle: Math.PI, ccw: false, name: 'R4' },
  L(-30, 34, -30, 45),
  L(-30, 45, -60, 45),
];
// Tvarový polotovar (odlitek) nakreslený v CAD — jde do CAM v sekci STOCK.
const S_ = (x1, y1, x2, y2) => ({ ...L(x1, y1, x2, y2), isStock: true, name: 'Polotovar' });
const stockDrawing = () => [S_(2, 0, 2, 33), S_(2, 33, -28, 48), S_(-28, 48, -62, 48), S_(-62, 48, -62, 0)];

function transfer(objects, machineType) {
  state.machineType = machineType;
  state.xDisplayMode = 'diameter';
  state.cncOutputMode = 'abs';
  state.flipX = false; state.flipZ = false;
  state.intersections = [];
  state.selected = null; state.multiSelected = new Set();
  state.objects = objects;
  const parsed = parseContourAndStockGCode(bridge.buildCamTransfer().code);
  const strip = (pts) => pts.map(({ type, x, z, r }) => ({ type, x, z, r }));
  return { contour: strip(parsed.contour), stock: strip(parsed.stock) };
}

describe('Karusel v CAM — stejná kontura i stejné dráhy jako soustruh', () => {
  let lathe, karusel;
  beforeAll(() => {
    lathe = transfer([...latheDrawing(), ...stockDrawing()], 'soustruh');
    const k = [...latheDrawing(), ...stockDrawing()];
    swapObjectsAxes(k);                 // co udělá přepnutí SOU → KAR v CAD
    karusel = transfer(k, 'karusel');
  });

  it('přenos z CAD: karusel = soustruh (body i smysl oblouků G2/G3)', () => {
    expect(lathe.contour.length).toBeGreaterThan(4);
    expect(lathe.contour.some(p => p.type === 'G2') && lathe.contour.some(p => p.type === 'G3')).toBe(true);
    expect(lathe.stock.length).toBeGreaterThanOrEqual(4);
    expect(karusel).toEqual(lathe);
  });

  it.each(['longitudinal', 'face'])('CAM (%s): pohled Karusel generuje tentýž G-kód jako Soustruh', async (strategy) => {
    const ids = (pts, base) => pts.map((p, i) => ({ id: base + i, mode: 'ABS', ...p }));
    const prog = (structure, t = karusel) => ({
      params: { machineStructure: structure, roughingStrategy: strategy, mode: 'DIAMON', stockMode: 'casting', doFinishing: true },
      contourPoints: ids(t.contour, 1),
      stockPoints: ids(t.stock, 100),
    });
    // Program z přenosu ze soustruhu (pohled Soustruh) je referenční.
    const ref = await runCamProg(prog('lathe', lathe));
    const a = await runCamProg(prog('lathe'));
    expect(a.gcode).toBe(ref.gcode);
    expect(ref.gcode.split('\n').length).toBeGreaterThan(20);
    const b = await runCamProg(prog('carousel'));
    expect(b.gcode).toBe(ref.gcode);
  }, 120000);
});
