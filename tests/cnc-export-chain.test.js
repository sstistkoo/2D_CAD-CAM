// CNC export (runCncExport) – kontura jako jeden řetěz (jediné G00 + navazující
// G01) a polotovar bez prefixu u každého řádku (nález uživatele 3. 10. 2026).
import { describe, it, expect, vi, beforeAll } from 'vitest';

// Minimální DOM: fileIO.js i jeho importy sahají na document/window už při načtení.
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

let runCncExport, state, outEl;
beforeAll(async () => {
  outEl = { value: '', addEventListener() {}, focus() {}, setSelectionRange() {} };
  const doc = new Proxy({}, {
    get(t, p) {
      if (p === 'getElementById') return (id) => (id === 'cncOutput' ? outEl : makeEl());
      if (p === 'querySelectorAll') return () => [];
      if (p === 'addEventListener') return () => {};
      return makeEl();
    },
  });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new Proxy({ addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), devicePixelRatio: 1 }, {
    get(t, p) { return p in t ? t[p] : makeEl(); },
  }));
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() }, userAgent: 'node' });
  const mod = await import('../js/storage/fileIO.js');
  const bridgeMod = await import('../js/bridge.js');
  ({ state } = await import('../js/state.js'));
  runCncExport = bridgeMod.bridge.exportCncAsDrawn;
});

const L = (x1, y1, x2, y2, extra = {}) => ({ type: 'line', x1, y1, x2, y2, name: 'Úsečka', ...extra });

describe('runCncExport – řetězení a značky', () => {
  it('kontura nakreslená v různých směrech jde jako jedno G00 + navazující G01', () => {
    state.machineType = 'soustruh';
    state.cncOutputMode = 'abs';
    state.intersections = [];
    state.selected = null; state.multiSelected = new Set();
    // Obrys jako ve screenshotu: segmenty nakreslené v libovolném směru.
    state.objects = [
      L(0, 0, 50, 0),     // 1
      L(100, 20, 50, 0),  // 2 (obráceně)
      L(100, 20, 100, 40),// 3
      L(0, 40, 100, 40),  // 4
    ];
    const code = runCncExport();
    // Zhuštěný zápis: `G90 G00 X0 Z0` je jediný rychloposuv, dál jen G01 (modální).
    const rapids = code.split('\n').filter(l => /\bG0?0\b/.test(l.replace(/;.*$/, '')));
    expect(rapids.length).toBe(1);
    expect(code.match(/\bG0?1\b/g)?.length).toBe(1); // G01 se píše jen při změně
    expect(code).toContain('; KONTURA_START');
    expect(code).not.toMatch(/POLOTOVAR —/);
    // Editor z Kalkulaček: bez G28/M30, G00 má poznámku, úsečka „název+pořadí, L=…".
    expect(code).not.toMatch(/G28|M30/);
    expect(code).toMatch(/G00 [^\n]*; startovní bod/);
    expect(code).toMatch(/; Úsečka 1, L=50\b/);
  });

  it('pořadí zůstává jako se kreslilo; G00 jen tam, kde kresba skočí', () => {
    state.objects = [
      L(0, 0, 10, 0), L(10, 0, 10, 10),          // 1, 2 navazují
      L(50, 50, 60, 50), L(60, 50, 60, 60),      // 3, 4 po skoku
    ];
    const code = runCncExport();
    const names = [...code.matchAll(/Úsečka (\d)/g)].map(m => m[1]);
    expect(names).toEqual(['1', '2', '3', '4']);
    expect(code.split('\n').filter(l => /\bG0?0\b/.test(l.replace(/;.*$/, ''))).length).toBe(2);
  });

  it('první úsečka se otočí podle toho, kterým koncem navazuje druhá', () => {
    // nakresleno „pozpátku": 1 končí tam, kde 2 začíná, až po otočení
    state.objects = [L(10, 0, 0, 0), L(10, 0, 10, 10)];
    const code = runCncExport();
    expect(code.split('\n').filter(l => /\bG0?0\b/.test(l.replace(/;.*$/, ''))).length).toBe(1);
  });

  it('hlavička editoru je stručná, polotovar je mezi STOCK_START/STOCK_END bez prefixu u řádků', () => {
    state.objects = [
      L(0, 0, 50, 0), L(50, 0, 50, 10),
      L(0, 20, 60, 20, { isStock: true }), L(60, 20, 60, 30, { isStock: true }),
    ];
    const code = runCncExport();
    const iStart = code.indexOf('; STOCK_START');
    const iEnd = code.indexOf('; STOCK_END');
    expect(code).not.toMatch(/Datum|Počet objektů|SKICA/);
    expect(iStart).toBeGreaterThan(code.indexOf('; KONTURA_START'));
    expect(iEnd).toBeGreaterThan(iStart);
    expect(code).not.toMatch(/POLOTOVAR —/);
  });
});

describe('runCncExport – znaménko R u oblouku přes 180°', () => {
  // Kladné R by stroj ujel KRATŠÍM obloukem mezi týmiž body (kontrola CAD
  // 6. 10. 2026) – oblouk přes 180° musí mít R < 0.
  const rOf = (code) => [...code.matchAll(/^G0[23][^;\n]*\bR(-?[\d.]+)/gm)].map(m => parseFloat(m[1]));

  it('samostatný oblouk 270° → R záporné, 90° → R kladné', () => {
    state.machineType = 'soustruh'; state.cncOutputMode = 'abs'; state.intersections = [];
    state.selected = null; state.multiSelected = new Set();
    state.objects = [{ type: 'arc', cx: 0, cy: 20, r: 10, startAngle: 0, endAngle: 3 * Math.PI / 2, name: 'A' }];
    expect(rOf(runCncExport())).toEqual([-10]);
    state.objects = [{ type: 'arc', cx: 0, cy: 20, r: 10, startAngle: 0, endAngle: Math.PI / 2, name: 'A' }];
    expect(rOf(runCncExport())).toEqual([10]);
  });

  it('oblouk po směru hodin: výseč se počítá ve směru oblouku', () => {
    // CW z 0° do 90° = 270° výseč
    state.objects = [{ type: 'arc', cx: 0, cy: 20, r: 10, startAngle: 0, endAngle: Math.PI / 2, ccw: false, name: 'A' }];
    expect(rOf(runCncExport())).toEqual([-10]);
  });

  it('oblouk kontury s |bulge| > 1 → R záporné', () => {
    state.objects = [{ type: 'polyline', vertices: [{ x: 40, y: 20 }, { x: 60, y: 20 }], bulges: [2], closed: false, name: 'P' }];
    const [r] = rOf(runCncExport());
    expect(r).toBeLessThan(0);
  });
});
