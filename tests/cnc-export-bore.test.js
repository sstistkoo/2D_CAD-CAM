// Přenos do CAM s dírou pro vyvrtávání (storage/fileIO.js → cam/boreContour.js):
// samostatný řetěz díry (jedním koncem na čele, celý pod hlavním profilem)
// jde v sekci DIRA_START…DIRA_END, ne mezi „mimo profil"; kus vnějšího
// obrysu za mezerou ani cizí čára dírou nejsou. CAM ho přečte do S.borePoints
// a boreChainFromState z něj postaví řetěz od ústí dovnitř.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { parseContourAndStockGCode } from '../js/calculators/cam/gcodeParser.js';
import { boreChainFromState } from '../js/calculators/cam/boreContour.js';

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

let transfer, state, outEl;
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
  transfer = bridgeMod.bridge.buildCamTransfer;
});

const L = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, name: 'Úsečka' });
const setup = (objects) => {
  state.machineType = 'soustruh';
  state.cncOutputMode = 'abs';
  state.intersections = [];
  state.selected = null; state.multiSelected = new Set();
  state.objects = objects;
};
// Vnější profil: čelo Z0 od osy do r30, ⌀60 do Z−40, konec k ose.
const OUTER = () => [L(0, 0, 0, 30), L(0, 30, -40, 30), L(-40, 30, -40, 0)];

describe('přenos do CAM — díra jako samostatný řetěz', () => {
  it('řetěz díry od čela jde do sekce DIRA, ne mezi „mimo profil"', () => {
    const stray = L(10, 50, 20, 50);
    setup([...OUTER(), L(0, 20, -15, 20), L(-15, 20, -15, 15), L(-15, 15, -30, 15), L(-30, 15, -30, 12.5), stray]);
    const res = transfer();
    expect(res.code).toContain('DIRA_START');
    expect(res.leftovers).toEqual([stray]);
    const parsed = parseContourAndStockGCode(res.code);
    expect(parsed.bore.length).toBe(5);
    const k = parsed.bore[0].x / 20;   // průměr / poloměr podle zobrazení
    // Kontura díru neobsahuje: žádný její bod neleží na stěně díry (r 20 / 15 uvnitř dílu).
    expect(parsed.contour.some(q => parseFloat(q.z) < -1 && [20, 15].includes(Math.round(parseFloat(q.x) / k)))).toBe(false);
    const chain = boreChainFromState({ params: { mode: k === 2 ? 'DIAMON' : 'RADIUS' }, borePoints: parsed.bore, contourPoints: parsed.contour });
    expect(chain.source).toBe('separate');
    expect(chain.segs[0].p1).toEqual({ x: 20, z: 0 });
    expect(chain.segs.map(s => s.p2.z)).toEqual([-15, -15, -30, -30]);
  });

  it('kus vnějšího obrysu za mezerou dírou není (leží mimo Z rozsah hlavního profilu)', () => {
    const gapPiece = L(-41, 30, -60, 30);
    setup([...OUTER(), gapPiece]);
    const res = transfer();
    expect(res.code).not.toContain('DIRA_START');
    expect(res.leftovers).toEqual([gapPiece]);
  });

  it('čára nad profilem ani čára, která nezačíná u čela, dírou není', () => {
    const above = L(-5, 35, -20, 35), deep = L(-10, 10, -25, 10);
    setup([...OUTER(), above, deep]);
    const res = transfer();
    expect(res.code).not.toContain('DIRA_START');
    expect(res.leftovers.length).toBe(2);
  });

  it('díra od LEVÉHO čela (vyvrtávání zleva) jde taky do sekce DIRA', () => {
    setup([...OUTER(), L(-40, 20, -25, 20), L(-25, 20, -25, 12.5)]);
    const res = transfer();
    expect(res.code).toContain('DIRA_START');
    expect(res.leftovers).toEqual([]);
    const parsed = parseContourAndStockGCode(res.code);
    const k = parsed.bore.find(q => Math.abs(parseFloat(q.z) + 40) < 1e-6).x / 20;
    const chain = boreChainFromState({ params: { mode: k === 2 ? 'DIAMON' : 'RADIUS', roughingSide: 'left' }, borePoints: parsed.bore, contourPoints: parsed.contour });
    expect(chain.segs[0].p1).toEqual({ x: 20, z: -40 });
  });
});
