// ╔══════════════════════════════════════════════════════════════╗
// ║  ◎ Bokorys → nárys: díry skrytou čarou, spodek, polotovar     ║
// ╚══════════════════════════════════════════════════════════════╝
// faceView/faceFrontView.js kreslí díry čel do nárysu (tenká čárkovaná čára
// v prvním materiálu za čelem). „◎ Do čela" zapne ⇋ Zrcadlit kolem osy (spodní
// polovina plnou čarou, hrany přes osu — render/mirrorEdges.js) a řez i lišta
// čela pak jdou pod ni. Bokorys ukazuje i větší polotovar za řezem
// (uživatel 20. 10. 2026).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('document', {
  getElementById: () => ({ disabled: false, classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() }, style: {}, textContent: '' }),
  createElement: () => ({ classList: { add: vi.fn() }, style: {}, appendChild: vi.fn(), addEventListener: vi.fn(), setAttribute: vi.fn() }),
  body: { appendChild: vi.fn() },
  querySelector: () => null,
  querySelectorAll: () => [],
});
vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768, addEventListener: vi.fn() });
vi.stubGlobal('navigator', { vibrate: vi.fn() });

vi.mock('../js/render.js', () => ({ renderAll: vi.fn(), renderAllDebounced: vi.fn() }));
vi.mock('../js/ui.js', () => ({ updateObjectList: vi.fn(), updateProperties: vi.fn() }));
vi.mock('../js/geometry.js', () => ({ calculateAllIntersections: vi.fn() }));
vi.mock('../js/canvas.js', () => ({ autoCenterView: vi.fn(), drawCanvas: { width: 800, height: 600 } }));

import { state } from '../js/state.js';
import { faceHoles } from '../js/faceView/faceLayer.js';
import { holeFrontLines, frontHoles } from '../js/faceView/faceFrontView.js';
import { viewRadii, profileAtZ, drawFaceReference, faceCutGeom } from '../js/faceView/faceReference.js';
import { drawHolesToFace } from '../js/faceView/facePattern.js';
import { materialSpan, materialDepth } from '../js/faceView/faceDepth.js';
import { axisEdgeLines, drawAxisEdges, axisEdgeSnapLines } from '../js/render/mirrorEdges.js';
import { refSnapObjects } from '../js/render/mirrorSnap.js';
import { drawFrontView } from '../js/faceView/faceFrontView.js';

// Hřídel Ø40 (Z0–200), příruba Ø90 (Z200–280), čep Ø30 (Z280–340).
const L = (x1, y1, x2, y2, extra = {}) => ({ type: 'line', layer: 0, x1, y1, x2, y2, ...extra });
const profile = () => [
  L(0, 0, 0, 20), L(0, 20, 200, 20), L(200, 20, 200, 45), L(200, 45, 280, 45),
  L(280, 45, 280, 15), L(280, 15, 340, 15), L(340, 15, 340, 0),
];
// Polotovar: Ø50 vlevo, Ø100 přes přírubu, Ø40 vpravo.
const stock = () => [[-2, 0, -2, 25], [-2, 25, 195, 25], [195, 25, 195, 50], [195, 50, 285, 50],
  [285, 50, 285, 20], [285, 20, 342, 20], [342, 20, 342, 0]].map(([a, b, c, d]) => L(a, b, c, d, { layer: 3, isStock: true }));

const O = { x: 440, y: 0 };
const face = { id: 7, name: 'Čelo (bokorys)', visible: true, isFace: true, faceCurrent: true, origin: O, faceZ: 280, faceSide: 'right' };

beforeEach(() => {
  state.layers = [{ id: 0, name: 'Kontura', visible: true }, { id: 3, name: 'Polotovar', visible: true }, { ...face }];
  state.objects = [...profile(), ...stock()];
  state.machineType = 'soustruh';
  state.mirrorPreview = false;
  state.zoom = 1;
});

describe('díra v nárysu (holeFrontLines)', () => {
  it('průchozí: dvě skryté hrany od čela k −Z, osa s přesahem', () => {
    const l = holeFrontLines({ c: 40, rh: 3.5, z0: 280, dir: -1, len: 80, tip: false });
    expect(l.hidden).toEqual([[[280, 36.5], [200, 36.5]], [[280, 43.5], [200, 43.5]]]);
    expect(l.center).toEqual([[283, 40], [197, 40]]);
  });
  it('slepá: dno a špička 118° (0,3·Ø za hloubkou), čelo zleva vrtá k +Z', () => {
    const l = holeFrontLines({ c: -10, rh: 5, z0: 0, dir: 1, len: 20, tip: true });
    expect(l.hidden).toHaveLength(4);
    expect(l.hidden[2]).toEqual([[20, -15], [20, -5]]);
    expect(l.hidden[3]).toEqual([[20, -15], [23, -10], [20, -5]]);
    expect(l.center).toEqual([[-3, -10], [26, -10]]);
  });
});

describe('díry čel → nárys (frontHoles)', () => {
  const hole = (x, y, r, holeDepth) => ({ type: 'circle', layer: 7, cx: O.x + x, cy: O.y + y, r, ...(holeDepth ? { holeDepth } : {}) });
  const run = objs => {
    state.objects.push(...objs);
    return frontHoles(faceHoles(), [...profile(), ...stock()], state.machineType);
  };

  it('skrz = jen kudy vede materiálem příruby (bez přesahu), poloha = svislá souřadnice v bokorysu', () => {
    const [h] = run([hole(0, -40, 3.5, { mode: 'through', value: null })]);
    expect(h.lines.hidden[0][0][1]).toBeCloseTo(-43.5, 6);
    expect(h.lines.hidden[0][1][0]).toBeCloseTo(200, 2);
    expect(h.lines.hidden).toHaveLength(2);
  });
  it('do hloubky: válec + špička', () => {
    const [h] = run([hole(40, 0, 3.5, { mode: 'depth', value: 20 })]);
    expect(h.lines.hidden).toHaveLength(4);
    expect(h.lines.hidden[0]).toEqual([[280, -3.5], [260, -3.5]]);
  });
  it('díra bez hloubky je průchozí; díra bez materiálu a pomocná kružnice se vynechají', () => {
    const out = run([
      hole(0, 40, 3.5),
      hole(0, 60, 3.5, { mode: 'through', value: null }),                // mimo přírubu
      { type: 'circle', layer: 7, cx: O.x, cy: O.y, r: 40, dashed: true }, // roztečná
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lines.hidden[0][1][0]).toBeCloseTo(200, 2);
  });
  it('čelo před přírubou (posuvník ve vzduchu): díra začíná v prvním materiálu', () => {
    state.layers[2].faceZ = 312;
    const [h] = run([hole(0, 40, 3.5, { mode: 'through', value: null })]);
    expect(h.lines.hidden[0][0][0]).toBeCloseTo(280, 2);
    expect(h.lines.hidden[0][1][0]).toBeCloseTo(200, 2);
  });
  it('hloubka od čela, která materiál nezasáhne, se nekreslí; přes konec materiálu bez špičky', () => {
    state.layers[2].faceZ = 312;
    const out = run([hole(0, 40, 3.5, { mode: 'depth', value: 20 }), hole(0, -40, 3.5, { mode: 'depth', value: 150 })]);
    expect(out).toHaveLength(1);
    expect(out[0].lines.hidden).toHaveLength(2);
  });
  it('karusel: poloha díry v nárysu = vodorovná souřadnice', () => {
    state.machineType = 'karusel';
    const h = holeFrontLines({ c: 25, rh: 2, z0: 0, dir: -1, len: 5, tip: false });
    expect(h.hidden[0][0]).toEqual([0, 23]);
    // Karusel: deska Ø100 tl. 20 (x = poloměr, y = Z); díra na C0° bere x.
    const disc = [L(0, 0, 50, 0), L(50, 0, 50, -20), L(50, -20, 0, -20)];
    const out = frontHoles([{ face: { ...face, faceZ: 0 }, o: hole(25, 0, 2, { mode: 'depth', value: 5 }) }], disc, 'karusel');
    expect(out[0].lines.center[0][1]).toBe(25);
    expect(out[0].lines.hidden).toHaveLength(4);
  });
});

describe('první materiál pod dírou (materialSpan)', () => {
  it('materiál hned za čelem: start 0, konec = tloušťka (materialDepth beze změny)', () => {
    expect(materialSpan(profile(), 'soustruh', 280, 'right', 36.5, 43.5)).toEqual({ start: 0, end: 80 });
    expect(materialDepth(profile(), 'soustruh', 280, 'right', 36.5, 43.5)).toBe(80);
  });
  it('vzduch před přírubou: start = vzdálenost k přírubě, materialDepth dál null', () => {
    expect(materialSpan(profile(), 'soustruh', 312, 'right', 36.5, 43.5)).toEqual({ start: 32, end: 112 });
    expect(materialDepth(profile(), 'soustruh', 312, 'right', 36.5, 43.5)).toBeNull();
    expect(materialSpan(profile(), 'soustruh', 312, 'right', 60, 70)).toBeNull();
  });
});

describe('bokorys: polotovar za řezem', () => {
  it('zprava ze Z300 je vidět polotovar Ø100 přes přírubu, Ø50 za ním ne', () => {
    const objs = [...profile(), ...stock()];
    const at = profileAtZ(objs, 'soustruh', 300);
    expect(at.stockRadii).toEqual([20]);
    const v = viewRadii(objs, 'soustruh', 300, 'right', { radii: at.stockRadii }, true);
    expect(v.visible).toContain(50);
    expect(v.visible).toContain(20);
    expect(v.visible).not.toContain(25);
  });
  it('zleva ze Z300 (díváme se k +Z) je velký polotovar za zády', () => {
    const objs = [...profile(), ...stock()];
    const at = profileAtZ(objs, 'soustruh', 300);
    const v = viewRadii(objs, 'soustruh', 300, 'left', { radii: at.stockRadii }, true);
    expect(v.visible).not.toContain(50);
  });
  it('díl bez polotovaru: výsledek dílu se nemění', () => {
    const objs = profile();
    const at = profileAtZ(objs, 'soustruh', 300);
    expect(viewRadii(objs, 'soustruh', 300, 'right', at).visible).toEqual([15, 45]);
  });
});

describe('hrany přes osu (mirrorEdges.axisEdgeLines)', () => {
  const at = (lines, z) => lines.filter(l => Math.abs(l.z - z) < 1e-6).map(l => [+l.a.toFixed(3), +l.b.toFixed(3), l.hidden]);

  it('osazení: chybějící kus přes osu plně, čelo dílu už je nakreslené celé', () => {
    const lines = axisEdgeLines(profile());
    expect(at(lines, 200)).toEqual([[-20, 20, false]]);
    expect(at(lines, 280)).toEqual([[-15, 15, false]]);
    expect(at(lines, 0)).toEqual([]);
    expect(at(lines, 340)).toEqual([]);
  });
  it('sražení = hrana přes celý průměr, tečný přechod zaoblení také', () => {
    const objs = [L(0, 0, 0, 18), L(0, 18, 2, 20), L(2, 20, 95, 20),
      { type: 'arc', layer: 0, cx: 95, cy: 25, r: 5, startAngle: -Math.PI / 2, endAngle: 0 },
      L(100, 25, 100, 30), L(100, 30, 150, 30), L(150, 30, 150, 0)];
    const lines = axisEdgeLines(objs);
    expect(at(lines, 2)).toEqual([[-20, 20, false]]);
    expect(at(lines, 95)).toEqual([[-20, 20, false]]);
    expect(at(lines, 100)).toEqual([[-25, 25, false]]);
    expect(at(lines, 50)).toEqual([]);                         // úsečky v jedné přímce hranu nedělají
  });
  it('dno vývrtu uvnitř dílu je zakryté → tenká čárkovaná', () => {
    const objs = [L(0, 0, 0, 30), L(0, 30, 100, 30), L(100, 30, 100, 10), L(100, 10, 60, 10), L(60, 10, 60, 0)];
    const lines = axisEdgeLines(objs);
    expect(at(lines, 60)).toEqual([]);                        // celé dno je nakreslené (svislá + zrcadlo)
    const notch = [L(0, 0, 0, 30), L(0, 30, 100, 30), L(100, 30, 100, 10), L(100, 10, 60, 10), L(60, 10, 55, 0)];
    expect(at(axisEdgeLines(notch), 60)).toEqual([[-10, 10, true]]);   // hrana vývrtu bez svislé čáry
  });
  it('roh na začátku strmého zkosení je viditelný, ne zakrytý', () => {
    const objs = [L(0, 0, 0, 20), L(0, 20, 10, 20), L(10, 20, 15, 45), L(15, 45, 30, 45),
      L(30, 45, 38, 9), L(38, 9, 60, 9), L(60, 9, 60, 0)];
    const lines = axisEdgeLines(objs);
    expect(at(lines, 10)).toEqual([[-20, 20, false]]);
    expect(at(lines, 38)).toEqual([[-9, 9, false]]);
  });
  it('oko „Hrany přes osu" ve Vrstvách je skryje i pro SNAP (state.mirrorEdges)', () => {
    state.objects = profile(); state.layers = [{ id: 0, visible: true }];
    let n = 0;
    const g = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, setLineDash() {}, stroke() { n++; } };
    drawAxisEdges(g, (x, y) => [x, -y]);
    expect(n).toBeGreaterThan(0);
    expect(axisEdgeSnapLines().length).toBeGreaterThan(0);
    state.mirrorEdges = false; n = 0;
    drawAxisEdges(g, (x, y) => [x, -y]);
    expect(n).toBe(0);
    expect(axisEdgeSnapLines()).toEqual([]);
    state.mirrorEdges = true;
  });
  it('polotovar zvlášť: jeho osazení přes osu', () => {
    const lines = axisEdgeLines(stock());
    expect(at(lines, 195)).toEqual([[-25, 25, false]]);
    expect(at(lines, 285)).toEqual([[-20, 20, false]]);
  });
});

describe('spodní polovina nárysu (⇋ Zrcadlit kolem osy)', () => {
  const g = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
    closePath() {}, setLineDash() {}, fillText() {}, measureText: () => ({ width: 10 }),
  };
  const w2s = (x, y) => [x, -y];

  it('„◎ Do čela" zrcadlení zapne (soustruh)', () => {
    const n = drawHolesToFace({ holes: [{ x: 0, y: 40 }, { x: 0, y: -40 }], d: 7, depth: { mode: 'through', value: null } });
    expect(n).toBe(2);
    expect(state.mirrorPreview).toBe(true);
  });
  it('karusel zrcadlí kolem jiné osy — nezapíná', () => {
    state.machineType = 'karusel';
    drawHolesToFace({ holes: [{ x: 0, y: 40 }], d: 7, depth: { mode: 'depth', value: 5 } });
    expect(state.mirrorPreview).toBe(false);
  });
  it('se zrcadlením jde řez (a lišta čela) přes obě poloviny, bez něj jen kousek pod osu', () => {
    drawFaceReference(g, w2s);
    const off = faceCutGeom();
    expect(off.loMax).toBe(-10);   // přesah 10 px při zoomu 1
    state.mirrorPreview = true;
    drawFaceReference(g, w2s);
    const on = faceCutGeom();
    expect(on.loMax).toBeCloseTo(-on.spanMax, 6);
    expect(on.lo).toBeLessThan(-40);
  });
});

describe('SNAP na podklad (render/mirrorSnap.refSnapObjects)', () => {
  const g = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
    closePath() {}, setLineDash() {}, fillText() {}, measureText: () => ({ width: 10 }),
  };
  const w2s = (x, y) => [x, -y];

  it('se zrcadlením: spodní polovina (bez kresby čel) + díry v nárysu', () => {
    state.objects.push({ type: 'circle', layer: 7, cx: O.x, cy: O.y - 40, r: 3.5, holeDepth: { mode: 'through', value: null } });
    state.mirrorPreview = true;
    drawFaceReference(g, w2s);
    drawFrontView(g, w2s);
    const refs = refSnapObjects();
    // zrcadlo rohu příruby (280, 45) → (280, −45)
    expect(refs.some(o => o.type === 'line' && o.x1 === 200 && o.y1 === -45 && o.x2 === 280 && o.y2 === -45)).toBe(true);
    // kružnice čela se nezrcadlí
    expect(refs.some(o => o.type === 'circle')).toBe(false);
    // hrany díry v nárysu (Z280 → Z200 ve výšce −43,5)
    expect(refs.some(o => o.type === 'line' && Math.abs(o.y1 + 43.5) < 1e-6 && Math.abs(o.x1 - 280) < 1e-3 && Math.abs(o.x2 - 200) < 1e-3)).toBe(true);
  });
  it('bez zrcadlení jen díry v nárysu', () => {
    state.objects.push({ type: 'circle', layer: 7, cx: O.x, cy: O.y + 40, r: 3.5 });
    drawFaceReference(g, w2s);
    drawFrontView(g, w2s);
    const refs = refSnapObjects();
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every(o => o.type === 'line' && o.y1 > 0 && o.y2 > 0)).toBe(true);
  });
});
