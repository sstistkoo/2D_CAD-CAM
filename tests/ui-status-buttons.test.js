// @vitest-environment happy-dom
// Přepínače stavového řádku: snap k bodům / mřížce / úhlu, režim kót,
// ABS/INC, R/⌀, Soustruh/Karusel, klikací indikátory (.coord-ind) s uložením
// nastavení, 🗑 Smazat kóty a Auto-detekce. Psáno PŘED přesunem z ui.js do
// js/ui/statusButtons.js (docs/plan-refaktoringu-ui.md, Fáze 3) jako
// charakterizace: projde na starém kódu a po přesunu musí projít beze změny.
// Tlačítka btnSnapPts aj. v index.html nejsou (nález č. 3) — test je přidá
// před importem, aby se listenery navěsily a update* funkce měly co měnit.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
import { getMeta, setMeta } from '../js/idb.js';

let ui, state, bridge, undo;
const toast = () => document.querySelector('.toast')?.textContent;
const el = (id) => document.getElementById(id);
const inds = (cls) => [...document.querySelectorAll('.' + cls)].map(i => [i.textContent, i.classList.contains('alt'), i.title]);
const KEYS = ['snapToPoints', 'snapToGrid', 'angleSnap', 'gridSize', 'angleSnapStep', 'showDimensions', 'coordMode', 'xDisplayMode', 'machineType'];
let saved, savedBridge;

beforeAll(async () => {
  installUiDom();
  for (const id of ['btnSnapPts', 'btnSnapGrid', 'btnAngleSnap', 'btnDims', 'btnCoordMode', 'btnXDisplay', 'btnMachineType']) {
    const b = document.createElement('button');
    b.id = id;
    if (id === 'btnSnapPts') b.innerHTML = '<span class="snap-ind"></span>';
    document.body.appendChild(b);
  }
  ui = await import('../js/ui.js');
  ({ state, undo } = await import('../js/state.js'));
  ({ bridge } = await import('../js/bridge.js'));
});
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map(k => [k, state[k]]));
  savedBridge = { updateCoordBarIndicators: bridge.updateCoordBarIndicators, updateMobileCoords: bridge.updateMobileCoords, autoDetectFeatures: bridge.autoDetectFeatures };
  bridge.updateCoordBarIndicators = vi.fn();
  bridge.updateMobileCoords = vi.fn();
  Object.assign(state, { snapToPoints: true, snapToGrid: false, angleSnap: false, gridSize: 10, angleSnapStep: 15, showDimensions: 'all', coordMode: 'abs', xDisplayMode: 'radius', machineType: 'soustruh' });
});
afterEach(() => {
  Object.assign(state, saved);
  Object.assign(bridge, savedBridge);
  document.querySelectorAll('.input-overlay').forEach(o => o.remove());
});

describe('snapy', () => {
  it('snap k bodům: tlačítko přepne, indikátor a mobilní tlačítko', () => {
    el('btnSnapPts').click();
    expect([state.snapToPoints, el('btnSnapPts').querySelector('.snap-ind').className, el('mobileSnap').classList.contains('snap-active'), toast()])
      .toEqual([false, 'snap-ind snap-off', false, 'Snap k bodům: OFF']);
    ui.updateSnapPtsBtn();
    el('btnSnapPts').click();
    expect([state.snapToPoints, el('mobileSnap').classList.contains('snap-active'), toast()]).toEqual([true, true, 'Snap k bodům: ON']);
  });

  it('mřížka a úhel: klik přepne (hláška s krokem), pravý klik otevře dialog kroku', () => {
    el('btnSnapGrid').click();
    expect([state.snapToGrid, el('btnSnapGrid').classList.contains('active'), toast(), bridge.updateCoordBarIndicators.mock.calls.length])
      .toEqual([true, true, 'Snap na mřížku: ON (10)', 1]);
    el('btnAngleSnap').click();
    expect([state.angleSnap, el('btnAngleSnap').classList.contains('active'), toast()]).toEqual([true, true, 'Úhlový snap: ON (15°)']);
    ui.toggleAngleSnap();
    expect([state.angleSnap, toast()]).toEqual([false, 'Úhlový snap: OFF']);
    el('btnSnapGrid').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.input-overlay h3').textContent).toBe('# Velikost mřížky');
    document.querySelector('.input-overlay').remove();
    el('btnAngleSnap').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.input-overlay h3').textContent).toBe('∠ Krok úhlového snapu');
  });
});

describe('kóty', () => {
  it('cyklus all → intersections → dimensions → none → all a vzhled tlačítka', () => {
    const look = () => [state.showDimensions, el('btnDims').textContent, el('btnDims').classList.contains('active'), el('btnDims').style.background !== '', toast()];
    el('btnDims').click();
    expect(look()).toEqual(['intersections', '📐 Kóty', false, true, 'Kóty: pouze průsečíky']);
    el('btnDims').click();
    expect(look()).toEqual(['dimensions', '📐 Kóty', true, false, 'Kóty: pouze kóty']);
    ui.cycleDimsMode();
    expect(look()).toEqual(['none', '📐 Kóty', false, false, 'Kóty: skryté']);
    state.showDimensions = 'nesmysl';
    ui.cycleDimsMode();
    expect(state.showDimensions).toBe('all');
  });

  it('🗑 Smazat kóty: žádné → hláška; jinak smaže kóty i popisky souřadnic (Zpět vrátí)', () => {
    state.objects = [{ type: 'point', x: 0, y: 0 }];
    el('btnDeleteDims').click();
    expect(toast()).toBe('Žádné kóty ke smazání');
    state.objects = [{ type: 'point', x: 0, y: 0 }, { type: 'line', isDimension: true }, { type: 'text', isCoordLabel: true }];
    state.selected = 1;
    state.multiSelected = new Set([1, 2]);
    state.selectedPoint = [{ x: 0, y: 0 }];
    el('btnDeleteDims').click();
    expect([state.objects.length, state.selected, state.multiSelected.size, state.selectedPoint, toast()]).toEqual([1, null, 0, null, 'Smazáno 2 kót']);
    undo();
    expect(state.objects.length).toBe(3);
    state.objects = [];
  });

  it('Auto-detekce volá bridge.autoDetectFeatures', () => {
    bridge.autoDetectFeatures = vi.fn();
    el('btnAutoDetect').click();
    expect(bridge.autoDetectFeatures).toHaveBeenCalledTimes(1);
  });
});

describe('ABS/INC, R/⌀, typ stroje a indikátory', () => {
  it('tlačítka přepnou stav, vzhled, indikátory a mobilní souřadnice', () => {
    el('btnCoordMode').click();
    el('btnXDisplay').click();
    el('btnMachineType').click();
    expect([state.coordMode, state.xDisplayMode, state.machineType, bridge.updateMobileCoords.mock.calls.length, toast()])
      .toEqual(['inc', 'diameter', 'karusel', 3, 'Karusel – X vodorovně, Z svisle']);
    expect([el('btnCoordMode').textContent, el('btnXDisplay').textContent, el('btnMachineType').textContent]).toEqual(['INC', '⌀', '⚙ Karusel']);
    expect([el('btnCoordMode').classList.contains('active'), el('btnXDisplay').classList.contains('active'), el('btnMachineType').classList.contains('active')]).toEqual([true, true, true]);
    expect([inds('ind-coordmode')[0], inds('ind-xdisplay')[0], inds('ind-machine')]).toMatchInlineSnapshot(`
      [
        [
          "INC",
          true,
          "Souřadnice: INC (inkrementální) – klik přepne na ABS",
        ],
        [
          "⌀",
          true,
          "Osa X: Průměr (⌀) – klik přepne na Poloměr",
        ],
        [
          [
            "KAR",
            true,
            "Typ stroje: Karusel – klik přepne na Soustruh",
          ],
          [
            "KAR",
            true,
            "Typ stroje: Karusel – klik přepne na Soustruh",
          ],
        ],
      ]
    `);
    ui.toggleCoordMode();
    ui.toggleXDisplay();
    ui.toggleMachineType();
    expect([el('btnCoordMode').textContent, el('btnXDisplay').textContent, el('btnMachineType').textContent, el('btnMachineType').style.background])
      .toEqual(['ABS', 'R', '⚙ Soustruh', '']);
    expect(toast()).toBe('Soustruh – Z vodorovně, X svisle');
  });

  it('klik na indikátor přepne hodnotu a uloží nastavení (persistSettings); jiný klik nic', async () => {
    await setMeta('currentProjectData', { objects: [] });
    el('indMachine').click();
    el('indCoordMode').click();
    el('indXDisplay').click();
    el('indGrid').click();
    el('indAngle').click();
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    el('indDims').dispatchEvent(ev);
    expect([state.machineType, state.coordMode, state.xDisplayMode, state.snapToGrid, state.angleSnap, state.showDimensions])
      .toEqual(['karusel', 'inc', 'diameter', true, true, 'intersections']);
    expect(ev.defaultPrevented).toBe(true);
    await vi.waitFor(async () => {
      const d = await getMeta('currentProjectData');
      expect([d.machineType, d.coordMode, d.xDisplayMode, d.snapToGrid, d.angleSnap, d.showDimensions]).toEqual(['karusel', 'inc', 'diameter', true, true, 'intersections']);
    }, { timeout: 2000 });
    const other = document.createElement('span');
    other.className = 'coord-ind';
    document.body.appendChild(other);
    other.click();
    other.remove();
    expect(state.machineType).toBe('karusel');
  });
});
