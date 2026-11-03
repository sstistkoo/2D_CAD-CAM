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

let state, bridge, swapObjectsAxes, parseContourAndStockGCode, runCamProg, buildIsoInternalKnife;
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
  ({ buildIsoInternalKnife } = await import('../js/calculators/isoInternalTools.js'));
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
  return { contour: strip(parsed.contour), stock: strip(parsed.stock), bore: strip(parsed.bore || []) };
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
      // Karusel po X (⟲, výchozí od 3. 11. 2026) dráhy záměrně mění — tady se
      // měří starý pohled bez prohození (cam-carousel-swap-xz.test.js měří ten nový).
      params: { machineStructure: structure, roughingStrategy: strategy, mode: 'DIAMON', stockMode: 'casting', doFinishing: true, carouselAlongX: false },
      contourPoints: ids(t.contour, 1),
      stockPoints: ids(t.stock, 100),
    });
    // Program z přenosu ze soustruhu (pohled Soustruh) je referenční.
    const ref = await runCamProg(prog('lathe', lathe));
    const a = await runCamProg(prog('lathe'));
    expect(a.gcode).toBe(ref.gcode);
    expect(ref.gcode.split('\n').length).toBeGreaterThan(20);
    const b = await runCamProg(prog('carousel'));
    expect(b.gcode.replace(' - KARUSEL', ' - SOUSTRUH')).toBe(ref.gcode);   // hlavička uvádí stroj
  }, 120000);
});

// Díra pro vyvrtávání nakreslená jako samostatný řetěz (sekce DIRA přenosu):
// trubka ⌀60 × 40, díra ⌀40 do Z−15 s vydutým R2,5 ve dně, pak ⌀30 do Z−30.
const tubeDrawing = () => [
  L(0, 0, 0, 30), L(0, 30, -40, 30), L(-40, 30, -40, 0),
  L(0, 20, -12.5, 20),
  { type: 'arc', cx: -12.5, cy: 17.5, r: 2.5, startAngle: Math.PI / 2, endAngle: Math.PI, name: 'R2,5' },
  L(-15, 17.5, -15, 15), L(-15, 15, -30, 15), L(-30, 15, -30, 12.5),
];

describe('Karusel v CAM — díra (vyvrtávání)', () => {
  let lathe, karusel;
  beforeAll(() => {
    lathe = transfer(tubeDrawing(), 'soustruh');
    const k = tubeDrawing();
    swapObjectsAxes(k);
    karusel = transfer(k, 'karusel');
  });

  it('přenos z CAD: díra jde do sekce DIRA u obou strojů stejně', () => {
    expect(lathe.bore.length).toBeGreaterThan(3);
    expect(lathe.bore.some(p => p.type === 'G2' || p.type === 'G3')).toBe(true);
    expect(karusel).toEqual(lathe);
  });

  it('CAM: vyvrtávání v pohledu Karusel = Soustruh', async () => {
    const ids = (pts, base) => pts.map((p, i) => ({ id: base + i, mode: 'ABS', ...p }));
    const prog = (structure, t = karusel) => ({
      params: {
        machineStructure: structure, mode: 'DIAMON', stockMode: 'cylinder', stockDiameter: 62,
        stockLength: 45, stockFace: 1, safeX: 100, safeZ: 5, finishOnly: true, doFinishing: false,
        ...buildIsoInternalKnife('BCL', { bar: 20 }).tool,
        boreActive: true, boreZStart: 0, boreDiameter: 40, boreDepth: 30, borePreDiameter: 25, borePreDepth: 35,
      },
      contourPoints: ids(t.contour, 1),
      stockPoints: [],
      borePoints: ids(t.bore, 200),
    });
    const ref = await runCamProg(prog('lathe', lathe));
    expect(ref.gcode).toMatch(/VYVRT/i);
    const b = await runCamProg(prog('carousel'));
    expect(b.gcode.replace(' - KARUSEL', ' - SOUSTRUH')).toBe(ref.gcode);   // hlavička uvádí stroj
  }, 120000);
});

// Poháněné nástroje: v CAD (bokorys) stojí nástroj u karuselu na C 0° (vpravo,
// X+), u soustruhu na C 90° (nahoře, X+) — faceLayer.faceViewC. CAM musí mít
// po otevření stejný výchozí úhel nástroje, jinak by díra nakreslená pod
// nástrojem dostala v NC C posunuté o 90° (tak tomu bylo, dokud se karusel
// v CAM otevíral jako soustruh).
describe('Karusel v CAM — poháněné nástroje (osa C)', () => {
  // Natočení vřetena těsně před najetím na díru (Sinumerik SPOS=…).
  const cOf = (prms) => {
    const i = prms.__block.findIndex(l => /díra 1/.test(l));
    const spos = prms.__block.slice(0, i).reverse().find(l => /^SPOS=/.test(l));
    return Number(spos.match(/^SPOS=(-?[\d.]+)/)[1]);
  };
  const run = async (machineType, holeAngle) => {
    const { syncParamsFromCad, _defaultCamParams } = await import('../js/calculators/cam/camDefaults.js');
    const { newLiveOp } = await import('../js/calculators/cam/live/liveModel.js');
    const { buildLiveBlock } = await import('../js/calculators/cam/live/liveGcode.js');
    const prms = _defaultCamParams();
    syncParamsFromCad(prms, { machineType, xDisplayMode: 'diameter' });
    prms.liveOps = [{ ...newLiveOp('drill', { faceZ: 0, outerD: 100 }, 1), pcd: 60, count: 1, startAngle: holeAngle, depth: 10, peck: 0, dwell: 0 }];
    prms.__block = buildLiveBlock(prms);
    return prms;
  };

  it('díra pod nástrojem (soustruh 90°, karusel 0°) jde na C0 u obou strojů', async () => {
    const l = await run('soustruh', 90);
    const k = await run('karusel', 0);
    expect(l.__block.length).toBeGreaterThan(5);
    expect(cOf(l)).toBe(0);
    expect(cOf(k)).toBe(0);
    // Pohled Soustruh u karuselového výkresu (stav před 2. 11. 2026) → C pootočené.
    const old = await run('karusel', 0);
    old.machineStructure = 'lathe';
    old.__block = (await import('../js/calculators/cam/live/liveGcode.js')).buildLiveBlock(old);
    expect(cOf(old)).toBe(270);
    // Zbytek bloku (X, Z, cyklus) se mezi stroji neliší.
    const body = (p) => p.__block.filter(s => !/^\s*;/.test(s));
    expect(body(k)).toEqual(body(l));
  });
});
