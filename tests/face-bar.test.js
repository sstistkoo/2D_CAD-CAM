// ╔══════════════════════════════════════════════════════════════╗
// ║  ◎ Lišta čela pod nárysem: poloha pod VŠÍ kresbou nárysu      ║
// ╚══════════════════════════════════════════════════════════════╝
// V režimu čela se kreslí do vrstvy čela — úsečka dokreslená do nárysu musí
// lištu odsunout dolů (ležela přes ni, uživatel 20. 10. 2026). Kresba uvnitř
// kruhu bokorysu se nepočítá (bokorys je vedle nárysu).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../js/state.js';
import { getFaceLayer } from '../js/faceView/faceLayer.js';
import { drawFaceReference, faceCutGeom, cutHit } from '../js/faceView/faceReference.js';
import { drawnBounds, faceBarGeom, faceRangeScale, rangeValueAt } from '../js/faceView/faceBar.js';

// Lišta sahá na seznam vrstev a plátno (DOM) — v Node stačí stuby.
vi.mock('../js/ui.js', () => ({ updateLayerList: () => {} }));
vi.mock('../js/canvas.js', () => ({ worldToScreen: (x, y) => [x, -y] }));

const w2s = (x, y) => [x, -y];
// Kontext plátna, který nic nekreslí (paintFace jen nastaví kruh bokorysu).
const g = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 0 }) : () => g), set: () => true });

beforeEach(() => {
  state.layers = [{ id: 0, name: 'Kontura', visible: true }, { id: 3, name: 'Polotovar', visible: true },
    { id: 7, name: 'Čelo (bokorys)', visible: true, isFace: true, origin: { x: 100, y: 0 } }];
  state.objects = [
    { id: 1, layer: 0, type: 'line', x1: 0, y1: 40, x2: -50, y2: 40 },
    { id: 2, layer: 0, type: 'line', x1: -50, y1: 40, x2: -50, y2: 15 },
    { id: 3, layer: 0, type: 'line', x1: -50, y1: 15, x2: 0, y2: 15 },
    { id: 4, layer: 3, type: 'line', x1: 2, y1: 50, x2: -60, y2: 50, isStock: true },
    { id: 10, layer: 7, type: 'circle', cx: 130, cy: 0, r: 4 },
    { id: 11, layer: 7, type: 'line', x1: 90, y1: -38, x2: 110, y2: -38 },
  ];
  state.machineType = 'soustruh';
  drawFaceReference(g, w2s);
});

describe('lišta čela pod nárysem', () => {
  it('kresba v kruhu bokorysu polohu lišty nemění', () => {
    expect(drawnBounds().minY).toBe(15);
  });

  it('úsečka dokreslená do nárysu (vrstva čela) odsune lištu pod sebe', () => {
    state.objects.push({ id: 20, layer: 7, type: 'line', x1: -40, y1: -30, x2: -10, y2: -30 });
    drawFaceReference(g, w2s);
    expect(drawnBounds().minY).toBe(-30);
    const geo = faceBarGeom(getFaceLayer(), -60, 2, w2s);
    expect(geo.y).toBeGreaterThanOrEqual(30 + 12);
  });

  it('kresba na skryté vrstvě se nepočítá', () => {
    state.layers.push({ id: 5, name: 'Pomocná', visible: false });
    state.objects.push({ id: 21, layer: 5, type: 'line', x1: -40, y1: -80, x2: -10, y2: -80 });
    expect(drawnBounds().minY).toBe(15);
  });
});

describe('dotyk: posuvník a značka řezu', () => {
  it('na dotykovém displeji je jezdec aspoň 1,25× (prst), myš beze změny', () => {
    expect(faceRangeScale(0.7, true)).toBe(1.25);
    expect(faceRangeScale(0.7, false)).toBe(0.7);
    expect(faceRangeScale(1.4, true)).toBe(1.4);
  });

  it('tažení po dráze: hodnota pod prstem, střed jezdce v krajích nad x0 / x1', () => {
    // dráha 100 px + jezdec 16 px při měřítku 1,25 → 120 + 20 px na obrazovce
    const rect = { left: 40, width: 120 + 20 };
    const at = (x, rtl = false) => rangeValueAt(rect, 140 / 1.25, -100, 0, rtl, x);
    expect(at(40 + 10)).toBe(-100);          // střed jezdce v levé krajní poloze
    expect(at(40 + 10 + 60)).toBe(-50);
    expect(at(40 + 130)).toBe(0);
    expect(at(0)).toBe(-100);                // za krajem se zastaví
    expect(at(999)).toBe(0);
    expect(at(40 + 10, true)).toBe(0);       // zrcadlená osa
  });

  it('v nástroji kreslení se řez chytá jen za konce přesahující díl', () => {
    const cut = faceCutGeom();   // řez v Z0 od −span do +span, polotovar R50
    expect(cut.sR).toBe(50);
    const span = cut.b[1];
    const at = r => w2s(cut.z, r);
    // uprostřed dílu (osazení R40): ve Výběru ano, v kreslení ne
    expect(cutHit(cut, w2s, ...at(40), 8, 12)).toBe(true);
    expect(cutHit(cut, w2s, ...at(40), 8, 12, true)).toBe(false);
    // konec za polotovarem a šipka za koncem: chytí se i v kreslení
    expect(cutHit(cut, w2s, ...at((span + 50) / 2), 8, 12, true)).toBe(true);
    expect(cutHit(cut, w2s, ...at(-span - 5), 8, 12, true)).toBe(true);
  });
});

describe('lišta čela stojí pevně', () => {
  it('poloha se při tažení řezu nemění s průměrem v Z (stupňovitý polotovar)', () => {
    const stock = { layer: 3, type: 'line', isStock: true };
    state.objects = [
      { id: 1, layer: 0, type: 'line', x1: 0, y1: 40, x2: -50, y2: 40 },
      { id: 2, layer: 0, type: 'line', x1: -50, y1: 40, x2: -50, y2: 20 },
      { id: 3, layer: 0, type: 'line', x1: -50, y1: 20, x2: -100, y2: 20 },
      { id: 4, ...stock, x1: 2, y1: 45, x2: -50, y2: 45 },
      { id: 5, ...stock, x1: -50, y1: 45, x2: -50, y2: 25 },
      { id: 6, ...stock, x1: -50, y1: 25, x2: -102, y2: 25 },
    ];
    const cuts = [], ys = [-25, -75].map(z => {
      getFaceLayer().faceZ = z;
      drawFaceReference(g, w2s);
      cuts.push(faceCutGeom().b[1]);
      return faceBarGeom(getFaceLayer(), -100, 0, w2s).y;
    });
    expect(cuts[0]).toBeGreaterThan(cuts[1]);    // délka řezu se mění s průměrem…
    expect(ys[0]).toBe(ys[1]);                   // …lišta ne
    expect(ys[0]).toBeGreaterThanOrEqual(cuts[0] + 12);   // pod řezem přes největší průměr
  });
});
