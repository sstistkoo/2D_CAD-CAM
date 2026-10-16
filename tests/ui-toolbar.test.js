// @vitest-environment happy-dom
// Lišta nástrojů: tlačítka [data-tool], setTool (auto-uložení rozkreslené
// kontury / tužky, zrušení výběru, zachování výběru u move/rotate, stavový
// řádek, kurzor), Typ čáry, Zaoblení/Zkosení, hinty a ✂ Přídavek (př/pl).
// Psáno PŘED přesunem z ui.js do js/ui/toolbar.js
// (docs/plan-refaktoringu-ui.md, Fáze 3) jako charakterizace: projde na
// starém kódu a po přesunu musí projít beze změny. Dialogy jsou mockované
// (mock platí pro modul, ať ho importuje ui.js nebo js/ui/*, i dynamicky).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
import { settle } from './helpers/simUi.mjs';

vi.mock('../js/dialogs/objectDialogs.js', async (orig) => ({ ...(await orig()), showFilletChamferDialog: vi.fn() }));
vi.mock('../js/dialogs/lineStyleDialog.js', async (orig) => ({ ...(await orig()), openLineStyleDialog: vi.fn() }));
vi.mock('../js/dialogs/stockDialog.js', async (orig) => ({ ...(await orig()), showStockDialog: vi.fn() }));
vi.mock('../js/stockTools.js', async (orig) => ({ ...(await orig()), generateStockFromAllowance: vi.fn(), generateCylinderStock: vi.fn() }));

let ui, state, bridge, drawCanvas, objDialogs, lsDialog, stockDialog, stockTools;
const btn = (tool) => document.querySelector(`[data-tool="${tool}"]`);
const activeTools = () => [...document.querySelectorAll('[data-tool].active')].map(b => b.dataset.tool);
const status = () => [state.tool, document.getElementById('statusTool').textContent, document.getElementById('statusHint').textContent, drawCanvas.style.cursor];
const toast = () => document.querySelector('.toast')?.textContent;
const BRIDGE = ['cancelPolarPicking', 'cancelDrag', 'finishProfileTrace', 'finishChainDimension', 'updateProperties', 'updateMobileCoords',
  'updateMobileRectArmBtn', 'tangentFromSelection', 'filletChamferFromSelection'];
let savedBridge;

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  ({ bridge } = await import('../js/bridge.js'));
  ({ drawCanvas } = await import('../js/canvas.js'));
  objDialogs = await import('../js/dialogs/objectDialogs.js');
  lsDialog = await import('../js/dialogs/lineStyleDialog.js');
  stockDialog = await import('../js/dialogs/stockDialog.js');
  stockTools = await import('../js/stockTools.js');
});
beforeEach(() => {
  vi.clearAllMocks();
  savedBridge = Object.fromEntries(BRIDGE.map(k => [k, bridge[k]]));
  for (const k of ['cancelPolarPicking', 'cancelDrag', 'finishProfileTrace', 'finishChainDimension', 'updateProperties']) bridge[k] = vi.fn();
  state.objects = [];
  state.tool = 'select';
  state.drawing = false;
  state.tempPoints = [];
  state.lineStyleActive = false;
  state.selected = null;
  state.multiSelected.clear();
  state.undoStack.length = 0;
  localStorage.removeItem('skica-stock-dialog');
});
afterEach(() => { Object.assign(bridge, savedBridge); state.tool = 'select'; });

describe('setTool', () => {
  it('nastaví nástroj, zvýrazní tlačítko, stavový řádek, hint a kurzor', () => {
    ui.setTool('line');
    expect(status()).toMatchInlineSnapshot(`
      [
        "line",
        "Nástroj: Úsečka",
        "Klikněte na počáteční bod úsečky",
        "crosshair",
      ]
    `);
    expect(activeTools()).toEqual(['line']);
    expect([bridge.cancelPolarPicking, bridge.cancelDrag].map(f => f.mock.calls.length)).toEqual([1, 1]);
    ui.setTool('move');
    expect(status()[3]).toBe('move');
    ui.setTool('unknownTool');
    expect(status()[2]).toBe('');
  });

  it('Výběr podruhé zruší výběr; move/rotate výběr zachová', () => {
    state.selected = 1;
    state.multiSelected = new Set([1, 2]);
    ui.setTool('rotate');
    expect([state.selected, [...state.multiSelected]]).toEqual([1, [1, 2]]);
    ui.setTool('select');
    expect(bridge.updateProperties).not.toHaveBeenCalled();
    state.selected = 2;
    state.multiSelected = new Set([1, 2]);
    state.selectedPoint = [{ x: 0, y: 0 }];
    ui.setTool('select');
    expect([state.selected, state.multiSelected.size, state.selectedPoint, bridge.updateProperties.mock.calls.length]).toEqual([null, 0, null, 1]);
  });

  it('rozkreslenou konturu (s Zpět) a tah tužkou uloží; trasování a řetězové kóty dokončí', () => {
    state.nextId = 10;
    Object.assign(state, { tool: 'polyline', drawing: true, tempPoints: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], _polylineBulges: [0.5] });
    ui.setTool('select');
    expect(state.objects.map(o => [o.type, o.name, o.vertices.length, o.bulges])).toEqual([['polyline', 'Kontura 10', 3, [0.5, 0]]]);
    // jeden záznam Zpět (dřív pushUndo() v setTool + další v addObject(), nález č. 6)
    expect([toast(), state.undoStack.length]).toEqual(['Kontura uložena (3 bodů)', 1]);
    Object.assign(state, { tool: 'pencil', drawing: true, tempPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    ui.setTool('line');
    expect(state.objects[1].name).toBe('Tužka 11');
    expect([toast(), state.undoStack.length]).toEqual(['Náčrt tužkou uložen (2 bodů)', 2]);
    Object.assign(state, { tool: 'profileTrace', drawing: true, tempPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    ui.setTool('line');
    Object.assign(state, { tool: 'chainDimension', drawing: true });
    ui.setTool('line');
    expect([bridge.finishProfileTrace.mock.calls.length, bridge.finishChainDimension.mock.calls.length]).toEqual([1, 1]);
  });

  it('auto-uloženou konturu vrátí jedno Zpět', async () => {
    const { undo } = await import('../js/state.js');
    state.objects = [{ type: 'point', id: 1, x: 0, y: 0, layer: 0 }];
    Object.assign(state, { tool: 'polyline', drawing: true, tempPoints: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], _polylineBulges: [] });
    ui.setTool('select');
    expect([state.objects.length, state.undoStack.length]).toEqual([2, 1]);
    undo();
    expect(state.objects.map(o => o.type)).toEqual(['point']);
  });

  it('hint je ve volné zóně stavového řádku (dřív #statusHint nebyl — nález č. 5)', () => {
    const hint = document.querySelector('#statusbar > .statusbar-fill > #statusHint');
    expect(hint).toBeTruthy();
    ui.setHint('Klikněte na počáteční bod úsečky');
    expect(hint.title).toBe('Klikněte na počáteční bod úsečky');   // celý text i při zkrácení
  });

  it('refreshToolbarActive, setHint, resetHint', () => {
    ui.refreshToolbarActive('circle');
    expect(activeTools()).toEqual(['circle']);
    ui.setHint('ahoj');
    expect(document.getElementById('statusHint').textContent).toBe('ahoj');
    state.tool = 'fill';
    ui.resetHint();
    expect(document.getElementById('statusHint').textContent).toBe('Klikněte do plochy, kterou chcete vybarvit');
  });
});

describe('tlačítka [data-tool]', () => {
  it('klik nastaví nástroj, druhý klik vrátí Výběr; akce s výběrem nástroj nepřepne', () => {
    btn('circle').click();
    expect(state.tool).toBe('circle');
    btn('circle').click();
    expect(state.tool).toBe('select');
    bridge.tangentFromSelection = vi.fn(() => true);
    btn('tangent').click();
    expect([state.tool, activeTools(), bridge.tangentFromSelection.mock.calls.length]).toEqual(['select', [], 1]);
    bridge.tangentFromSelection = vi.fn(() => false);
    btn('tangent').click();
    expect(state.tool).toBe('tangent');
  });

  it('Zaoblení/Zkosení: s výběrem hned, jinak dialog → nástroj + hint (F/Y = activateFilletChamfer)', () => {
    bridge.filletChamferFromSelection = vi.fn(() => true);
    btn('filletChamfer').click();
    expect(objDialogs.showFilletChamferDialog).not.toHaveBeenCalled();
    bridge.filletChamferFromSelection = vi.fn(() => false);
    btn('filletChamfer').click();
    const cb = objDialogs.showFilletChamferDialog.mock.calls[0][0];
    cb('fillet', 2);
    expect([state.tool, state._fcMode, state._fcP1, document.getElementById('statusHint').textContent]).toEqual(['filletChamfer', 'fillet', 2, 'Klikněte na roh nebo 1. úsečku (R2)']);
    ui.activateFilletChamfer();
    objDialogs.showFilletChamferDialog.mock.calls[1][0]('chamfer', 1, 3);
    expect(document.getElementById('statusHint').textContent).toBe('Klikněte na roh nebo 1. úsečku (1×3)');
  });

  it('Typ čáry otevře dialog: Použít → kreslicí nástroj zůstane (jinak constr), Vypnout → Výběr', () => {
    ui.setTool('circle');
    btn('constr').click();
    const opts = lsDialog.openLineStyleDialog.mock.calls[0][0];
    expect(opts.active).toBe(false);
    opts.onApply();
    expect([state.lineStyleActive, state.tool, activeTools()]).toEqual([true, 'circle', ['constr', 'circle']]);
    expect(document.getElementById('statusTool').textContent).toMatch(/^Nástroj: .+ \(.+\)$/);
    ui.setTool('trim');
    btn('constr').click();
    lsDialog.openLineStyleDialog.mock.calls[1][0].onApply();
    expect(state.tool).toBe('constr');
    lsDialog.openLineStyleDialog.mock.calls[1][0].onDeactivate();
    expect([state.lineStyleActive, state.tool]).toEqual([false, 'select']);
  });
});

describe('Přídavek na plochu (př/pl)', () => {
  it('otevře dialog s uloženými výchozími; auto → přídavek, válec → válec; volby se uloží', async () => {
    localStorage.setItem('skica-stock-dialog', JSON.stringify({ allowance: 1 }));
    document.getElementById('btnAllowance').click();
    await vi.waitFor(() => expect(stockDialog.showStockDialog).toHaveBeenCalledTimes(1));
    const [cb, defaults] = stockDialog.showStockDialog.mock.calls[0];
    expect(defaults).toEqual({ allowance: 1 });
    cb(null);
    expect(stockTools.generateStockFromAllowance).not.toHaveBeenCalled();
    cb({ mode: 'auto', allowance: 2, chamfer: 0.5, fillet: 1, target: 'contour' });
    expect(stockTools.generateStockFromAllowance).toHaveBeenCalledWith({ allowance: 2, chamfer: 0.5, fillet: 1, asContour: true });
    expect(JSON.parse(localStorage.getItem('skica-stock-dialog'))).toEqual({ allowance: 2, chamfer: 0.5, fillet: 1, target: 'contour' });
    cb({ mode: 'cylinder', allowanceX: 3, allowanceZ: 4, target: 'stock' });
    expect(stockTools.generateCylinderStock).toHaveBeenCalledWith({ allowanceX: 3, allowanceZ: 4, asContour: false });
    expect(JSON.parse(localStorage.getItem('skica-stock-dialog'))).toEqual({ allowance: 1, allowanceX: 3, allowanceZ: 4, target: 'stock' });
    await settle(5);
  });
});
