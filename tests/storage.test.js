// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: storage/projectManager.js                   ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Globals must be set via vi.hoisted for top-level document access in projectManager.js
vi.hoisted(() => {
  // fake-indexeddb must be set up before idb.js is loaded
  require('fake-indexeddb/auto');

  const mockEl = () => ({
    disabled: false,
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
    textContent: '', innerHTML: '', querySelectorAll: () => [],
    appendChild: () => {}, style: {},
    addEventListener: () => {},
    setAttribute: () => {},
    querySelector: () => null,
  });
  globalThis.document = {
    getElementById: () => mockEl(),
    createElement: () => mockEl(),
    body: { appendChild: () => {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  globalThis.window = { innerWidth: 1024, innerHeight: 768, addEventListener: () => {} };
  Object.defineProperty(globalThis, 'navigator', {
    value: { vibrate: () => {} },
    writable: true, configurable: true,
  });
});

// Mock render.js
vi.mock('../js/render.js', () => ({ renderAll: vi.fn(), renderAllDebounced: vi.fn() }));

// Mock ui.js
vi.mock('../js/ui.js', () => ({
  updateObjectList: vi.fn(), updateProperties: vi.fn(),
  updateLayerList: vi.fn(), updateStatusProject: vi.fn(),
  updateMachineTypeBtn: vi.fn(), updateXDisplayBtn: vi.fn(),
  updateNullPointUI: vi.fn(),
}));

// Mock geometry.js
vi.mock('../js/geometry.js', () => ({
  calculateAllIntersections: vi.fn(),
}));

// Mock canvas.js
vi.mock('../js/canvas.js', () => ({
  autoCenterView: vi.fn(), drawCanvas: { width: 800, height: 600 },
}));

import { state, undo } from '../js/state.js';
import {
  saveProject, loadProject, openProject, deleteProject,
  renameProject, duplicateProject, newProject,
} from '../js/storage/projectManager.js';
import {
  saveProjectToDB, loadProjectFromDB, getProjectNames,
  setMeta, getMeta,
} from '../js/idb.js';

// ════════════════════════════════════════
// ── saveProject + loadProject ──
// ════════════════════════════════════════
describe('projectManager – save/load', () => {
  beforeEach(() => {
    state.objects = [];
    state.undoStack = [];
    state.redoStack = [];
    state.nextId = 1;
    state.activeLayer = 0;
    state.selected = null;
    state.intersections = [];
    state.projectName = 'Test projekt';
    state.gridSize = 10;
    state.coordMode = 'abs';
    state.machineType = 'soustruh';
    state.xDisplayMode = 'radius';
    state.layers = [
      { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
    ];
    state.nextLayerId = 1;
  });

  it('saveProject uloží do IDB a loadProject načte zpět', async () => {
    // Přidat testovací objekt
    state.objects = [{ type: 'point', x: 42, y: 24, id: 1, name: 'Bod 1', layer: 0 }];
    state.nextId = 2;

    await saveProject();

    // Vyčistit stav
    state.objects = [];
    state.nextId = 1;

    // Načíst
    await loadProject();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0].x).toBe(42);
    expect(state.objects[0].y).toBe(24);
  });

  it('loadProject s žádnými daty zobrazí toast', async () => {
    // Smazat currentProjectData
    await setMeta('currentProjectData', undefined);
    state.objects = [{ type: 'point', x: 1, y: 1 }];
    // loadProject nemá data → nezmění stav
    await loadProject();
    // Toast se zobrazí ale objects zůstanou
    expect(state.objects).toHaveLength(1);
  });
});

// ════════════════════════════════════════
// ── openProject ──
// ════════════════════════════════════════
describe('projectManager – openProject', () => {
  beforeEach(() => {
    state.objects = [];
    state.undoStack = [];
    state.redoStack = [];
    state.nextId = 1;
    state.activeLayer = 0;
    state.selected = null;
    state.projectName = 'Bez názvu';
    state.layers = [
      { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
    ];
  });

  it('otevře existující projekt', async () => {
    const projectData = {
      version: 3,
      objects: [
        { type: 'line', x1: 0, y1: 0, x2: 50, y2: 50, id: 1, name: 'Úsečka 1', layer: 0 },
      ],
      nextId: 2,
      gridSize: 5,
    };
    await saveProjectToDB('myProject', projectData);

    await openProject('myProject');
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0].type).toBe('line');
    expect(state.projectName).toBe('myProject');
  });

  it('neexistující projekt – zobrazí toast, nezmění stav', async () => {
    const objsBefore = state.objects.length;
    await openProject('neexistuje_xyz_99');
    expect(state.objects).toHaveLength(objsBefore);
  });
});

// ════════════════════════════════════════
// ── deleteProject ──
// ════════════════════════════════════════
describe('projectManager – deleteProject', () => {
  it('smaže projekt z IDB', async () => {
    await saveProjectToDB('toDeleteProj', { v: 1 });
    await deleteProject('toDeleteProj');
    const loaded = await loadProjectFromDB('toDeleteProj');
    expect(loaded).toBeNull();
  });
});

// ════════════════════════════════════════
// ── renameProject ──
// ════════════════════════════════════════
describe('projectManager – renameProject', () => {
  it('přejmenuje projekt', async () => {
    await saveProjectToDB('original', { data: 'test' });
    state.projectName = 'original';

    await renameProject('original', 'nový název');

    const oldData = await loadProjectFromDB('original');
    expect(oldData).toBeNull();
    const newData = await loadProjectFromDB('nový název');
    expect(newData).toEqual({ data: 'test' });
    expect(state.projectName).toBe('nový název');
  });

  it('ignoruje prázdný název', async () => {
    await saveProjectToDB('orig', { d: 1 });
    await renameProject('orig', '');
    const data = await loadProjectFromDB('orig');
    expect(data).not.toBeNull();
  });

  it('odmítne pokud cílový název už existuje', async () => {
    await saveProjectToDB('a', { x: 1 });
    await saveProjectToDB('b', { x: 2 });
    await renameProject('a', 'b');
    // 'a' stále existuje (rename se nesměl provést)
    const dataA = await loadProjectFromDB('a');
    expect(dataA).not.toBeNull();
  });
});

// ════════════════════════════════════════
// ── duplicateProject ──
// ════════════════════════════════════════
describe('projectManager – duplicateProject', () => {
  it('vytvoří kopii projektu', async () => {
    await saveProjectToDB('source', { objects: [{type: 'point', x: 1, y: 2}] });

    await duplicateProject('source');

    const names = await getProjectNames();
    const copyName = names.find(n => n.includes('kopie'));
    expect(copyName).toBeDefined();
    const copy = await loadProjectFromDB(copyName);
    expect(copy.objects).toEqual([{type: 'point', x: 1, y: 2}]);
  });
});

// ════════════════════════════════════════
// ── newProject ──
// ════════════════════════════════════════
describe('projectManager – newProject', () => {
  beforeEach(() => {
    state.objects = [{ type: 'point', x: 1, y: 1, id: 1 }];
    state.undoStack = [];
    state.redoStack = [];
    state.nextId = 2;
    state.activeLayer = 0;
  });

  it('vyčistí stav a nastaví výchozí vrstvy', () => {
    newProject();
    expect(state.objects).toHaveLength(0);
    expect(state.nextId).toBe(1);
    expect(state.projectName).toBe('Bez názvu');
    expect(state.layers).toHaveLength(3);
    expect(state.layers[0].name).toBe('Kontura');
    expect(state.layers[1].name).toBe('Konstrukce');
    expect(state.layers[2].name).toBe('Kóty');
    expect(state.nextLayerId).toBe(3);
  });

  it('uloží undo před vyčištěním', () => {
    newProject();
    expect(state.undoStack.length).toBeGreaterThan(0);
    // Undo obnoví předchozí objekt
    undo();
    expect(state.objects).toHaveLength(1);
  });
});
