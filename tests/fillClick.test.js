// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: tools/fillClick.js (Vybarvit – uzavřené smyčky) ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOM (stejný vzorec jako tests/objects.test.js)
vi.stubGlobal('document', {
  getElementById: () => ({
    disabled: false,
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    textContent: '',
    innerHTML: '',
    querySelectorAll: () => [],
    appendChild: vi.fn(),
    style: {},
  }),
  createElement: (tag) => ({
    className: '', textContent: '', innerHTML: '',
    classList: { add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    style: {},
  }),
  body: { appendChild: vi.fn() },
  querySelector: () => null,
  querySelectorAll: () => [],
});

vi.stubGlobal('window', {
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: vi.fn(),
});

vi.stubGlobal('navigator', { vibrate: vi.fn() });

vi.mock('../js/render.js', () => ({
  renderAll: vi.fn(),
  renderAllDebounced: vi.fn(),
}));

vi.mock('../js/ui.js', () => ({
  updateObjectList: vi.fn(),
  updateProperties: vi.fn(),
}));

vi.mock('../js/geometry.js', () => ({
  calculateAllIntersections: vi.fn(),
}));

vi.mock('../js/canvas.js', () => ({
  autoCenterView: vi.fn(),
  drawCanvas: { width: 800, height: 600 },
}));

import { state } from '../js/state.js';
import { buildClosedLoops, handleFillAreaClick, FILL_DEFAULT_COLOR, FILL_DEFAULT_ALPHA } from '../js/tools/fillClick.js';

beforeEach(() => {
  state.objects = [];
  state.undoStack = [];
  state.redoStack = [];
  state.nextId = 1;
  state.activeLayer = 0;
  state.selected = null;
  state.multiSelected = new Set();
  state.machineType = 'soustruh';
  state.layers = [
    { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
  ];
});

// Čtvercová smyčka 0,0 → 10,0 → 10,10 → 0,10 → 0,0 jako 4 samostatné úsečky
// (přesně tak, jak nástroj Kontura ve SKICA rozkládá kresbu na jednotlivé
// objekty – viz addPolylineAsSegments).
function squareLines() {
  return [
    { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
    { type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
    { type: 'line', x1: 10, y1: 10, x2: 0, y2: 10 },
    { type: 'line', x1: 0, y1: 10, x2: 0, y2: 0 },
  ];
}

describe('buildClosedLoops', () => {
  it('sestaví jednu uzavřenou smyčku ze 4 úseček čtverce (v libovolném pořadí)', () => {
    const shuffled = [squareLines()[2], squareLines()[0], squareLines()[3], squareLines()[1]];
    const { loops, openCount } = buildClosedLoops(shuffled);
    expect(loops).toHaveLength(1);
    expect(openCount).toBe(0);
    expect(loops[0].length).toBeGreaterThanOrEqual(4);
  });

  it('kružnice je vždy samostatná uzavřená smyčka', () => {
    const { loops, openCount } = buildClosedLoops([{ type: 'circle', cx: 0, cy: 0, r: 5 }]);
    expect(loops).toHaveLength(1);
    expect(openCount).toBe(0);
    // Smyčka kružnice je uzavřená (první a poslední bod ~stejné)
    const first = loops[0][0], last = loops[0][loops[0].length - 1];
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(0.1);
  });

  it('obdélníkový objekt je samostatná uzavřená smyčka', () => {
    const { loops } = buildClosedLoops([{ type: 'rect', x1: 0, y1: 0, x2: 20, y2: 10 }]);
    expect(loops).toHaveLength(1);
  });

  it('uzavřená kontura (polyline.closed) je samostatná smyčka', () => {
    const { loops } = buildClosedLoops([{
      type: 'polyline', closed: true,
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      bulges: [0, 0, 0],
    }]);
    expect(loops).toHaveLength(1);
  });

  it('dvě oddělené smyčky (kontura + polotovar) dají dvě smyčky pro mezikruží', () => {
    const inner = squareLines(); // 0..10
    const outer = [
      { type: 'line', x1: -5, y1: -5, x2: 15, y2: -5 },
      { type: 'line', x1: 15, y1: -5, x2: 15, y2: 15 },
      { type: 'line', x1: 15, y1: 15, x2: -5, y2: 15 },
      { type: 'line', x1: -5, y1: 15, x2: -5, y2: -5 },
    ];
    const { loops, openCount } = buildClosedLoops([...inner, ...outer]);
    expect(loops).toHaveLength(2);
    expect(openCount).toBe(0);
  });

  it('otevřený řetězec (chybí jedna strana) netvoří uzavřenou smyčku', () => {
    const openChain = squareLines().slice(0, 3); // chybí 4. strana
    const { loops, openCount } = buildClosedLoops(openChain);
    expect(loops).toHaveLength(0);
    expect(openCount).toBeGreaterThan(0);
  });

  it('oblouky se řetězí stejně jako úsečky (půlkruh + úsečka = uzavřená D-smyčka)', () => {
    const objs = [
      { type: 'line', x1: -5, y1: 0, x2: 5, y2: 0 },
      { type: 'arc', cx: 0, cy: 0, r: 5, startAngle: 0, endAngle: Math.PI, ccw: true },
    ];
    const { loops, openCount } = buildClosedLoops(objs);
    expect(loops).toHaveLength(1);
    expect(openCount).toBe(0);
  });
});

describe('handleFillAreaClick', () => {
  it('klik mimo jakýkoliv obrys zobrazí toast a nic nevytvoří', () => {
    state.objects = squareLines();
    const obj = handleFillAreaClick(100, 100);
    expect(obj).toBeNull();
    expect(state.objects.filter(o => o.type === 'fill')).toHaveLength(0);
  });

  it('prázdný výkres zobrazí toast a nic nevytvoří', () => {
    const obj = handleFillAreaClick(5, 5);
    expect(obj).toBeNull();
  });

  it('klik dovnitř čtverce vytvoří fill objekt s výchozí barvou/průhledností', () => {
    state.objects = squareLines();
    const obj = handleFillAreaClick(5, 5);
    expect(obj).not.toBeNull();
    expect(obj.type).toBe('fill');
    expect(obj.loops).toHaveLength(1);
    expect(obj.color).toBe(FILL_DEFAULT_COLOR);
    expect(obj.alpha).toBe(FILL_DEFAULT_ALPHA);
    expect(state.objects).toContain(obj);
  });

  it('nevyžaduje žádný předchozí výběr (state.selected/multiSelected prázdné)', () => {
    state.objects = squareLines();
    state.selected = null;
    state.multiSelected = new Set();
    const obj = handleFillAreaClick(5, 5);
    expect(obj).not.toBeNull();
  });

  it('klik dovnitř kružnice funguje stejně jako u úsečkové smyčky', () => {
    state.objects = [{ type: 'circle', cx: 0, cy: 0, r: 8 }];
    const obj = handleFillAreaClick(0, 0);
    expect(obj).not.toBeNull();
    expect(obj.loops).toHaveLength(1);
  });

  it('klik do mezikruží mezi konturou a polotovarem vyplní jen prstenec (2 smyčky, evenodd)', () => {
    const inner = squareLines(); // 0..10
    const outer = [
      { type: 'line', x1: -10, y1: -10, x2: 20, y2: -10 },
      { type: 'line', x1: 20, y1: -10, x2: 20, y2: 20 },
      { type: 'line', x1: 20, y1: 20, x2: -10, y2: 20 },
      { type: 'line', x1: -10, y1: 20, x2: -10, y2: -10 },
    ];
    state.objects = [...inner, ...outer];
    // Bod (-5,-5) leží mezi vnitřním čtvercem (0..10) a vnějším (-10..20) → mezikruží
    const obj = handleFillAreaClick(-5, -5);
    expect(obj).not.toBeNull();
    expect(obj.loops).toHaveLength(2);
    expect(obj.name).toContain('mezikruží');
  });

  it('klik dovnitř vnitřní kontury (uvnitř obou smyček) vyplní jen tu vnitřní, bez díry', () => {
    const inner = squareLines(); // 0..10
    const outer = [
      { type: 'line', x1: -10, y1: -10, x2: 20, y2: -10 },
      { type: 'line', x1: 20, y1: -10, x2: 20, y2: 20 },
      { type: 'line', x1: 20, y1: 20, x2: -10, y2: 20 },
      { type: 'line', x1: -10, y1: 20, x2: -10, y2: -10 },
    ];
    state.objects = [...inner, ...outer];
    const obj = handleFillAreaClick(5, 5); // dovnitř menšího čtverce
    expect(obj).not.toBeNull();
    expect(obj.loops).toHaveLength(1);
  });

  it('ignoruje konstrukční čáry, text a body při hledání obrysu', () => {
    state.objects = [
      ...squareLines(),
      { type: 'constr', x1: -100, y1: 5, x2: 100, y2: 5 },
      { type: 'text', x: 5, y: 5, text: 'x' },
      { type: 'point', x: 5, y: 5 },
    ];
    const obj = handleFillAreaClick(5, 5);
    expect(obj).not.toBeNull();
    expect(obj.loops).toHaveLength(1);
  });

  it('ignoruje objekty na skryté vrstvě', () => {
    state.layers = [
      { id: 0, name: 'Kontura', color: '#89b4fa', visible: false, locked: false },
    ];
    state.objects = squareLines().map(o => ({ ...o, layer: 0 }));
    const obj = handleFillAreaClick(5, 5);
    expect(obj).toBeNull();
  });

  // ── Soustružnický profil otevřený k ose rotace (y=0) ──
  // Typický případ ze skutečné kresby: Kontura i Polotovar jsou nakreslené
  // jako OTEVŘENÝ profil se svislými náběhy dolů na osu na obou koncích,
  // NE jako jedna uzavřená smyčka. Bez dotažení podél osy by "Vybarvit"
  // nenašlo mezi nimi vůbec žádný uzavřený obrys (nahlášený bug).
  function latheProfile() {
    // (0,0) → (0,10) → (5,10) → (5,5) → (10,5) → (10,0) – oba konce na ose
    return [
      { type: 'line', x1: 0, y1: 0, x2: 0, y2: 10 },
      { type: 'line', x1: 0, y1: 10, x2: 5, y2: 10 },
      { type: 'line', x1: 5, y1: 10, x2: 5, y2: 5 },
      { type: 'line', x1: 5, y1: 5, x2: 10, y2: 5 },
      { type: 'line', x1: 10, y1: 5, x2: 10, y2: 0 },
    ];
  }
  function stockProfile() {
    // (-5,0) → (-5,15) → (15,15) → (15,0) – širší a vyšší obal kontury, oba konce na ose
    return [
      { type: 'line', x1: -5, y1: 0, x2: -5, y2: 15 },
      { type: 'line', x1: -5, y1: 15, x2: 15, y2: 15 },
      { type: 'line', x1: 15, y1: 15, x2: 15, y2: 0 },
    ];
  }

  it('otevřený soustružnický profil (oba konce na ose) se dá vybarvit sám o sobě', () => {
    state.objects = latheProfile();
    const obj = handleFillAreaClick(3, 3);
    expect(obj).not.toBeNull();
    expect(obj.loops).toHaveLength(1);
  });

  it('u karuselu (osa nemá stejný význam) se otevřený profil NEuzavře', () => {
    state.machineType = 'karusel';
    state.objects = latheProfile();
    const obj = handleFillAreaClick(3, 3);
    expect(obj).toBeNull();
  });

  it('klik do mezikruží mezi otevřenou konturou a polotovarem (oba dotažené k ose) vybarví jen prstenec', () => {
    state.objects = [...latheProfile(), ...stockProfile()];
    // (-2,5) leží uvnitř polotovaru, ale mimo konturu (ta je jen v rozsahu x 0..10)
    const obj = handleFillAreaClick(-2, 5);
    expect(obj).not.toBeNull();
    expect(obj.loops).toHaveLength(2);
    expect(obj.name).toContain('mezikruží');
  });

  it('klik dovnitř kontury (uvnitř obou profilů) vybarví jen ji, bez díry', () => {
    state.objects = [...latheProfile(), ...stockProfile()];
    const obj = handleFillAreaClick(3, 3);
    expect(obj).not.toBeNull();
    expect(obj.loops).toHaveLength(1);
  });

  it('profil s jen JEDNÍM koncem na ose zůstává otevřený (nedomýšlí se)', () => {
    state.objects = [
      { type: 'line', x1: 0, y1: 0, x2: 0, y2: 10 },   // na ose
      { type: 'line', x1: 0, y1: 10, x2: 10, y2: 10 },
      { type: 'line', x1: 10, y1: 10, x2: 10, y2: 3 }, // konec MIMO osu (y=3)
    ];
    const obj = handleFillAreaClick(3, 3);
    expect(obj).toBeNull();
  });
});
