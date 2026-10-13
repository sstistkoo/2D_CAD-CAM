// @vitest-environment happy-dom
// Kreslení plátna simulátoru (blok CANVAS DRAWING → js/calculators/cam/sim/draw*.js):
// vrstvy se kreslí ve správném pořadí a na správných místech — pozadí,
// kontura, dráha (posuvy plně, rychloposuvy čárkovaně), nástroj při simulaci,
// mezní čáry, výběr obdélníkem, SNAP. Vlastní kontura a ruční program
// (DIAMON) — nezávisí na generátoru drah. Test prošel na starém kódu před
// přestěhováním; přesun navíc ověřila sonda, která porovnala celý záznam
// volání kreslení nad všemi fixtures × 32 stavy (shodný).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture, SIM_CANVAS_W, SIM_CANVAS_H } from './helpers/simUi.mjs';

const CONTOUR = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
];
const PROGRAM = [
  'N10 G0 X100 Z10',
  'N20 G1 X40 Z5 F0.2',
  'N30 G1 X40 Z-30',
  'N40 G1 X50 Z-30',
  'N50 G0 X100 Z10',
];
const VIEW = { scale: 4, panX: 500, panY: 300 };
// Soustruh, bez převrácení os: Z → vodorovně, poloměr X → svisle nahoru.
const scr = (x, z) => [VIEW.panX + z * VIEW.scale, VIEW.panY - x * VIEW.scale];

let sim;
beforeAll(async () => {
  installSimDom();
  sim = await openSim(loadFixture('cam/part-1.camprog'));
});
afterAll(async () => { await sim?.close(); });

function setup() {
  const { S } = sim;
  S.params.mode = 'DIAMON';
  S.params.machineStructure = 'lathe';
  S.params.respectInsertGeometry = false;
  S.params.stockMode = 'cylinder';
  S.params.stockDiameter = 66; S.params.stockLength = 66; S.params.stockFace = 2;
  S.flipX = false; S.flipZ = false;
  S.contourPoints = structuredClone(CONTOUR);
  S.guideLines = [];
  S.manualGCode = PROGRAM.join('\n');
  S.gcodeDirty = false;
  S.gcodeEditEnabled = false; S.pointDragEnabled = false;
  S.snapEnabled = false; S._snap = null; S._angleSnapLine = null;
  S.showZLimits = 'off'; S.showSimPath = 'all';
  S.rectSelecting = false; S.rectStart = S.rectEnd = null;
  S.simRunning = false; S.simProgress = 0;
  S.view = { ...VIEW };
  sim.fullUpdate();
}

// Záznam → seznam tahů: každý stroke/fill/strokeRect/fillRect s cestou od
// posledního beginPath a s aktuální barvou a čárkováním.
function strokes() {
  const out = [];
  let path = [], style = {}, dash = [];
  sim.drawCalls().forEach((c, i) => {
    const [k, ...a] = c;
    if (k === '=') { style[a[0]] = a[1]; return; }
    if (k === 'setLineDash') { dash = a[0]; return; }
    if (k === 'beginPath') { path = []; return; }
    if (k === 'moveTo' || k === 'lineTo') { path.push([k, a[0], a[1]]); return; }
    if (k === 'stroke' || k === 'strokeRect') out.push({ i, k, color: style.strokeStyle, dash, path, args: a });
    if (k === 'fill' || k === 'fillRect') out.push({ i, k, color: style.fillStyle, path, args: a });
    if (k === 'fillText') out.push({ i, k, color: style.fillStyle, text: a[0], args: a.slice(1) });
  });
  return out;
}
const near = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
const hasSeg = (s, a, b) => !!s.path && s.path.some((op, j) => op[0] === 'lineTo' && j > 0 && near(s.path[j - 1].slice(1), a) && near(op.slice(1), b));
function redraw(mut) {
  mut?.(sim.S);
  sim.clearDrawCalls();
  sim.draw();
  return strokes();
}

describe('simulátor — kreslení plátna', () => {
  it('pozadí → kontura → dráha (posuvy plně, rychloposuvy čárkovaně) → body kontury', () => {
    setup();
    const st = redraw();
    const first = sim.drawCalls().slice(0, 2);
    expect(first).toEqual([['=', 'fillStyle', '#1e1e2e'], ['fillRect', 0, 0, SIM_CANVAS_W, SIM_CANVAS_H]]);

    const contour = st.find(s => s.k === 'stroke' && s.color === '#89b4fa' && hasSeg(s, scr(20, 0), scr(20, -62.4)));
    expect(contour, 'kontura').toBeTruthy();

    const feed = st.find(s => s.k === 'stroke' && s.color === '#a6e3a1' && hasSeg(s, scr(20, 5), scr(20, -30)));
    expect(feed, 'posuvy dráhy').toBeTruthy();
    expect(feed.dash).toEqual([]);
    expect(hasSeg(feed, scr(20, -30), scr(25, -30))).toBe(true);
    const rapid = st.find(s => s.k === 'stroke' && s.color === '#f38ba8' && hasSeg(s, scr(25, -30), scr(50, 10)));
    expect(rapid, 'rychloposuvy dráhy').toBeTruthy();
    expect(rapid.dash).toEqual([6, 6]);

    const labels = st.filter(s => s.k === 'fillText').map(s => s.text);
    expect(labels).toContain('⌀/Čelo');   // úchop válcového polotovaru
    expect(contour.i).toBeLessThan(feed.i);
    expect(feed.i).toBeLessThan(rapid.i);
    expect(rapid.i).toBeLessThan(st.find(s => s.text === '⌀/Čelo').i);
  });

  it('🙈 „jen řez" schová rychloposuvy, „nic" celou dráhu', () => {
    setup();
    let st = redraw(S => { S.showSimPath = 'cut'; });
    expect(st.some(s => s.color === '#a6e3a1' && hasSeg(s, scr(20, 5), scr(20, -30)))).toBe(true);
    expect(st.some(s => s.color === '#f38ba8' && hasSeg(s, scr(25, -30), scr(50, 10)))).toBe(false);
    st = redraw(S => { S.showSimPath = 'none'; });
    expect(st.some(s => s.color === '#a6e3a1' && hasSeg(s, scr(20, 5), scr(20, -30)))).toBe(false);
  });

  it('simulace: nástroj se kreslí jen se spuštěnou / posunutou simulací a vypíše polohu', () => {
    setup();
    redraw();
    const overlay = sim.q('.cam-sim-motion-overlay');
    const translates0 = sim.drawCalls().filter(c => c[0] === 'translate').length;
    expect(overlay.textContent).toBe('');
    redraw(S => { S.simProgress = 0.5; });
    expect(sim.drawCalls().filter(c => c[0] === 'translate').length).toBeGreaterThan(translates0);
    expect(overlay.textContent).not.toBe('');
  });

  it('mezní čáry: čelisti a rozsah svisle v místě Z, s popiskem', () => {
    setup();
    const st = redraw(S => {
      S.showZLimits = 'on';
      Object.assign(S.zLimits, { chuck: -60, chuckActive: true, tailActive: false, rangeStart: 2, rangeEnd: -40, rangeActive: true });
    });
    const x60 = scr(0, -60)[0], x40 = scr(0, -40)[0];
    const chuck = st.find(s => s.k === 'stroke' && s.color === '#f38ba8' && hasSeg(s, [x60, 0], [x60, SIM_CANVAS_H]));
    expect(chuck, 'čelisti').toBeTruthy();
    expect(chuck.dash).toEqual([3, 5]);
    const end = st.find(s => s.k === 'stroke' && s.color === '#f9e2af' && hasSeg(s, [x40, 0], [x40, SIM_CANVAS_H]));
    expect(end, 'konec rozsahu').toBeTruthy();
    expect(end.dash).toEqual([10, 4]);
    const texts = st.filter(s => s.k === 'fillText').map(s => s.text);
    expect(texts).toEqual(expect.arrayContaining(['⛔ Čelisti Z=-60', 'Konec rozsahu ▶ Z=-40']));
    expect(redraw(S => { S.showZLimits = 'off'; }).some(s => s.text === '⛔ Čelisti Z=-60')).toBe(false);
  });

  it('výběr obdélníkem a SNAP se kreslí navrch', () => {
    setup();
    const st = redraw(S => {
      S.rectSelecting = true; S.rectStart = { x: 300, y: 260 }; S.rectEnd = { x: 100, y: 120 };
      S.snapEnabled = true; S._snap = { type: 'point', x: 20, z: -30 };
    });
    const rect = st.find(s => s.k === 'strokeRect' && s.color === '#89b4fa');
    expect(rect.args).toEqual([100, 120, 200, 140]);
    expect(rect.dash).toEqual([4, 4]);
    const [sx, sy] = scr(20, -30);
    const box = st.find(s => s.k === 'strokeRect' && s.color === '#f9e2af');
    expect(box.args).toEqual([sx - 6, sy - 6, 12, 12]);
    const label = st.find(s => s.k === 'fillText' && s.text === 'X: 40.000  Z: -30.000');
    expect(label).toBeTruthy();
    expect(label.args).toEqual([sx, sy - 24]);
    // Navrch: po všem ostatním (dráze i výběru).
    const rapid = st.find(s => s.color === '#f38ba8' && s.k === 'stroke');
    expect(rect.i).toBeGreaterThan(rapid.i);
    expect(label.i).toBeGreaterThan(rect.i);
  });

  it('převrácená osa X (flipX) zrcadlí kontura svisle', () => {
    setup();
    const st = redraw(S => { S.flipX = true; });
    const flip = (x, z) => [VIEW.panX + z * VIEW.scale, VIEW.panY + x * VIEW.scale];
    expect(st.some(s => s.color === '#89b4fa' && hasSeg(s, flip(20, 0), flip(20, -62.4)))).toBe(true);
  });
});
