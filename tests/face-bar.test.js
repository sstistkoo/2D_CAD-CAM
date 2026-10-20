// ╔══════════════════════════════════════════════════════════════╗
// ║  ◎ Lišta čela pod nárysem: poloha pod VŠÍ kresbou nárysu      ║
// ╚══════════════════════════════════════════════════════════════╝
// V režimu čela se kreslí do vrstvy čela — úsečka dokreslená do nárysu musí
// lištu odsunout dolů (ležela přes ni, uživatel 20. 10. 2026). Kresba uvnitř
// kruhu bokorysu se nepočítá (bokorys je vedle nárysu).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../js/state.js';
import { getFaceLayer } from '../js/faceView/faceLayer.js';
import { drawFaceReference } from '../js/faceView/faceReference.js';
import { drawnBounds, faceBarGeom } from '../js/faceView/faceBar.js';

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
