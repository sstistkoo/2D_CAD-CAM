// CNC export kružnice (runCncExport, case "circle") → zpět „Vykreslit" (parseGcodeToObjects).
// Do 10. 11. 2026 se střed psal natvrdo „I0 K∓r", což platí jen pro soustruh;
// na karuselu (svět x = osa X) vyšel střed o r vedle a kružnice se po zpětném
// načtení rozpadla. Převzato z neuložené práce ve worktree 3. 8. 2026.
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

let runCncExport, parseGcodeToObjects, state;
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
  const { bridge } = await import('../js/bridge.js');
  ({ state } = await import('../js/state.js'));
  ({ parseGcodeToObjects } = await import('../js/storage/gcodeParse.js'));
  runCncExport = bridge.exportCncAsDrawn;
});

const CASES = [
  ['soustruh', 'radius'], ['soustruh', 'diameter'],
  ['karusel', 'radius'], ['karusel', 'diameter'],
];

describe('CNC export kružnice – střed I/K podle stroje', () => {
  it.each(CASES)('%s / %s: export → Vykreslit vrátí kružnici na stejné místo', (machine, xMode) => {
    state.machineType = machine;
    state.xDisplayMode = xMode;
    state.cncOutputMode = 'abs';
    state.flipX = false; state.flipZ = false;
    state.intersections = [];
    state.selected = null; state.multiSelected = new Set();
    state.objects = [{ type: 'circle', cx: 40, cy: 15, r: 6, name: 'Kružnice' }];

    const code = runCncExport();
    // Zhuštěný výstup: druhý půlkruh bez modálního G02, čísla bez koncových nul.
    const arcLines = code.split('\n').filter(l => /\bI-?[\d.]+ K-?[\d.]+/.test(l.replace(/;.*$/, '')));
    expect(arcLines).toHaveLength(2);
    // Střed leží ve světové ose x: soustruh → Z (K), karusel → X (I). I je poloměr.
    const [first, second] = arcLines.map(l => l.replace(/;.*$/, ''));
    if (machine === 'karusel') {
      expect(first).toMatch(/\bI-6 K0\b/); expect(second).toMatch(/\bI6 K0\b/);
    } else {
      expect(first).toMatch(/\bI0 K-6\b/); expect(second).toMatch(/\bI0 K6\b/);
    }

    const arcs = parseGcodeToObjects(code).objs.filter(o => o.type === 'arc');
    expect(arcs).toHaveLength(2);
    for (const a of arcs) {
      expect(a.cx).toBeCloseTo(40, 3);
      expect(a.cy).toBeCloseTo(15, 3);
      expect(a.r).toBeCloseTo(6, 3);
    }
  });
});
