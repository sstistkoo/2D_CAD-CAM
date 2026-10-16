// @vitest-environment happy-dom
// Dialogy „Velikost mřížky" a „Krok úhlového snapu" (pravý klik na tlačítka
// snapu, exporty ui.js). Psáno PŘED přesunem z ui.js do
// js/ui/gridAngleDialogs.js (docs/plan-refaktoringu-ui.md, Fáze 2b) jako
// charakterizace: projde na starém kódu a po přesunu musí projít beze změny.
// (Tlačítko Zrušit obsluhuje globální handler `.btn-cancel-overlay` v app.js.)
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let ui, state;
const ov = () => document.querySelector('.input-overlay');
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const toast = () => document.querySelector('.toast')?.textContent;

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
});
afterEach(() => { document.querySelectorAll('.input-overlay').forEach(o => o.remove()); });

describe('dialog velikosti mřížky', () => {
  it('předvyplní aktuální krok; OK / Enter uloží kladný výraz, jinak jen zavře', () => {
    state.gridSize = 10;
    ui.showGridSizeDialog();
    expect(ov().querySelector('h3').textContent).toBe('# Velikost mřížky');
    const inp = ov().querySelector('#dlgGridSize');
    expect(inp.value).toBe('10');
    inp.value = '5/2';
    ov().querySelector('#dlgGridOk').click();
    expect([state.gridSize, toast(), ov()]).toEqual([2.5, 'Mřížka: 2.5 mm', null]);

    ui.showGridSizeDialog();
    ov().querySelector('#dlgGridSize').value = '-1';
    key(ov().querySelector('#dlgGridSize'), 'Enter');
    expect([state.gridSize, ov()]).toEqual([2.5, null]);

    ui.showGridSizeDialog();
    ov().querySelector('#dlgGridSize').value = '7';
    key(ov().querySelector('#dlgGridSize'), 'Enter');
    expect(state.gridSize).toBe(7);
  });

  it('Escape v poli i klik mimo dialog zavřou bez změny; keydown nebublá dál', () => {
    state.gridSize = 3;
    let bubbled = 0;
    const spy = () => { bubbled++; };
    document.addEventListener('keydown', spy);
    ui.showGridSizeDialog();
    ov().querySelector('#dlgGridSize').value = '9';
    key(ov().querySelector('#dlgGridSize'), 'Escape');
    document.removeEventListener('keydown', spy);
    expect([state.gridSize, ov(), bubbled]).toEqual([3, null, 0]);
    ui.showGridSizeDialog();
    ov().click();
    expect(ov()).toBeNull();
  });
});

describe('dialog kroku úhlového snapu', () => {
  it('předvolba nastaví krok a zavře', () => {
    state.angleSnapStep = 15;
    ui.showAngleSnapDialog();
    expect([...ov().querySelectorAll('.angle-preset')].map(b => b.dataset.deg)).toEqual(['15', '30', '45', '90']);
    ov().querySelector('.angle-preset[data-deg="45"]').click();
    expect([state.angleSnapStep, toast(), ov()]).toEqual([45, 'Úhlový snap: 45°', null]);
  });

  it('vlastní krok a tolerance (OK / Enter); mimo rozsah se ignoruje každé zvlášť', () => {
    state.angleSnapStep = 15;
    state.angleSnapTolerance = 5;
    ui.showAngleSnapDialog();
    expect([ov().querySelector('#dlgAngleStep').value, ov().querySelector('#dlgAngleTol').value]).toEqual(['15', '5']);
    ov().querySelector('#dlgAngleStep').value = '22.5';
    ov().querySelector('#dlgAngleTol').value = '3';
    ov().querySelector('#dlgAngleOk').click();
    expect([state.angleSnapStep, state.angleSnapTolerance, toast()]).toEqual([22.5, 3, 'Úhlový snap: 22.5° (tolerance 3°)']);

    ui.showAngleSnapDialog();
    ov().querySelector('#dlgAngleStep').value = '200';
    ov().querySelector('#dlgAngleTol').value = '10';
    key(ov().querySelector('#dlgAngleStep'), 'Enter');
    expect([state.angleSnapStep, state.angleSnapTolerance, ov()]).toEqual([22.5, 10, null]);

    ui.showAngleSnapDialog();
    ov().querySelector('#dlgAngleStep').value = '30';
    ov().querySelector('#dlgAngleTol').value = '50';
    ov().querySelector('#dlgAngleOk').click();
    expect([state.angleSnapStep, state.angleSnapTolerance]).toEqual([30, 10]);

    ui.showAngleSnapDialog();
    key(ov().querySelector('#dlgAngleStep'), 'Escape');
    expect(ov()).toBeNull();
  });
});
