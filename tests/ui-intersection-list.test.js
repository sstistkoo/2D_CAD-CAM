// @vitest-environment happy-dom
// Seznam průsečíků v levém panelu (výběr bodů, „Vše", „Číslovat", kopírování
// souřadnic) a rozbalování panelů (togglePanel, volá ho app.js). Psáno PŘED
// přesunem z ui.js do js/ui/intersectionList.js (docs/plan-refaktoringu-ui.md,
// Fáze 2c) jako charakterizace: projde na starém kódu a po přesunu beze změny.
// (happy-dom nenačítá style.css — panel je na začátku „block".)
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
import { settle } from './helpers/simUi.mjs';

let ui, state, bridge;
const ul = () => document.getElementById('intersectionList');
const rows = () => [...ul().children].map(li => (li.className ? `[${li.className}] ` : '') + li.textContent.replace(/\s+/g, ' ').trim());
const cbs = () => [...ul().querySelectorAll('input.int-checkbox')];
const toast = () => document.querySelector('.toast')?.textContent;
let savedBridge;

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  ({ bridge } = await import('../js/bridge.js'));
});
beforeEach(() => {
  savedBridge = { runCncExport: bridge.runCncExport, calculateAllIntersections: bridge.calculateAllIntersections };
  state.intersections = [{ x: 10, y: 5 }, { x: -3.5, y: 0 }];
  state.selectedPoint = null;
  state.showIntersectionNumbers = false;
  state.machineType = 'soustruh';
  state.xDisplayMode = 'radius';
  state.coordMode = 'abs';
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
});
afterEach(() => { Object.assign(bridge, savedBridge); vi.restoreAllMocks(); });

describe('seznam průsečíků', () => {
  it('prázdný → „Žádné průsečíky"', () => {
    state.intersections = [];
    ui.updateIntersectionList();
    expect(rows()).toEqual(['Žádné průsečíky']);
  });

  it('řádky se souřadnicemi podle typu stroje a režimu X', () => {
    ui.updateIntersectionList();
    expect(rows()).toMatchInlineSnapshot(`
      [
        "[select-all-row] VšeČíslovat",
        "Z=10 X=5P1",
        "Z=-3.5 X=0P2",
      ]
    `);
    state.machineType = 'karusel';
    state.xDisplayMode = 'diameter';
    ui.updateIntersectionList();
    expect(rows()).toMatchInlineSnapshot(`
      [
        "[select-all-row] VšeČíslovat",
        "⌀X=20 Z=5P1",
        "⌀X=-7 Z=0P2",
      ]
    `);
  });

  it('výběr bodu, „Vše" a zrušení výběru', () => {
    ui.updateIntersectionList();
    cbs()[2].click();   // [0] Vše, [1] Číslovat, [2] P1, [3] P2
    expect(state.selectedPoint).toEqual([{ x: 10, y: 5 }]);
    expect(rows()[1].startsWith('[selected]')).toBe(true);
    expect(cbs()[0].checked).toBe(false);
    cbs()[0].click();
    expect(state.selectedPoint).toEqual([{ x: 10, y: 5 }, { x: -3.5, y: 0 }]);
    expect(cbs()[0].checked).toBe(true);
    cbs()[3].click();
    expect(state.selectedPoint).toEqual([{ x: 10, y: 5 }]);
    cbs()[0].click();   // „Vše" (nezaškrtnuté) → vybere zbytek
    cbs()[0].click();   // a teď zruší vše
    expect(state.selectedPoint).toBeNull();
  });

  it('Číslovat přepne čísla na výkresu; klik na souřadnice je zkopíruje', async () => {
    ui.updateIntersectionList();
    cbs()[1].click();
    expect(state.showIntersectionNumbers).toBe(true);
    ul().children[2].querySelector('span').click();
    await settle(5);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect([navigator.clipboard.writeText.mock.calls[0][0], toast()]).toMatchInlineSnapshot(`
      [
        "Z-3.5 X0",
        "Zkopírováno: Z-3.5 X0",
      ]
    `);
  });
});

describe('togglePanel', () => {
  it('přepne zobrazení, šipku v hlavičce; otevření Průsečíků / CNC spustí výpočet', () => {
    bridge.calculateAllIntersections = vi.fn();
    bridge.runCncExport = vi.fn();
    const panel = document.getElementById('intPanel');
    const header = panel.previousElementSibling;
    ui.togglePanel('intPanel');
    expect([panel.style.display, header.textContent.trim()]).toEqual(['none', '▸ Průsečíky']);
    expect(bridge.calculateAllIntersections).not.toHaveBeenCalled();
    ui.togglePanel('intPanel');
    expect([panel.style.display, header.textContent.trim()]).toEqual(['block', '▾ Průsečíky']);
    expect(bridge.calculateAllIntersections).toHaveBeenCalledTimes(1);
    ui.togglePanel('cncPanel');
    ui.togglePanel('cncPanel');
    expect(bridge.runCncExport).toHaveBeenCalledTimes(1);
  });
});
