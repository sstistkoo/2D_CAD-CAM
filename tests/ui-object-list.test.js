// @vitest-environment happy-dom
// Seznam objektů v levém panelu (cyklický výběr „Vše", výběr řádkem
// i checkboxem, mazání, segmenty kontury a obdélníku, Číslovat) a skok
// v CNC kódu na řádek vybraného objektu. Psáno PŘED přesunem z ui.js do
// js/ui/objectList.js a js/ui/cncJump.js (docs/plan-refaktoringu-ui.md,
// Fáze 2e) jako charakterizace: projde na starém kódu a po přesunu beze změny.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

vi.mock('../js/dialogs/mobileEdit.js', async (orig) => ({ ...(await orig()), showEditObjectDialog: vi.fn(), showMobileEditDialog: vi.fn() }));

let ui, state, undo, mobileEdit;
const ul = () => document.getElementById('objectList');
const lis = () => [...ul().children];
const text = (li) => li.textContent.replace(/\s+/g, ' ').trim();
const rows = () => lis().map(li => (li.className ? `[${li.className}] ` : '') + text(li));
const liOf = (label) => lis().find(li => text(li).includes(label));
const toast = () => document.querySelector('.toast')?.textContent;
const sel = () => [state.selected, [...state.multiSelected].sort((a, b) => a - b)];

const L = (id, y, extra = {}) => ({ type: 'line', id, name: `Úsečka ${id}`, x1: 0, y1: y, x2: 10, y2: y, layer: 0, ...extra });
function fixture() {
  state.objects = [
    { type: 'point', id: 1, name: 'Bod 1', x: 0, y: 0, layer: 0 },
    L(2, 5),
    { type: 'circle', id: 3, name: 'Kružnice 3', cx: 0, cy: 0, r: 4, layer: 0 },
    { type: 'line', id: 4, name: 'Kóta 4', isDimension: true, x1: 0, y1: 5, x2: 10, y2: 5, layer: 0 },
    L(5, 9, { isStock: true, name: 'Polotovar 5' }),
    { type: 'line', id: 6, isCamPathNote: true, x1: 0, y1: 0, x2: 1, y2: 1, layer: 0 },
  ];
  state.nextId = 7;
}

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
  ({ state, undo } = await import('../js/state.js'));
  mobileEdit = await import('../js/dialogs/mobileEdit.js');
});
beforeEach(() => {
  vi.clearAllMocks();
  fixture();
  state.selected = null;
  state.multiSelected.clear();
  state.selectedSegment = null;
  state._selectedSegmentObjIdx = null;
  state.multiSelectedSegments.clear();
  state.selectedPoint = null;
  state.showObjectNumbers = false;
  state.undoStack.length = 0;
  ui.updateObjectList();
});
afterEach(() => { state.objects = []; });

describe('seznam objektů', () => {
  it('řádky: ikona, pořadí (kóty bez čísla), název bez koncového čísla; poznámky CAM se nezobrazí', () => {
    expect(rows()).toMatchInlineSnapshot(`
      [
        "[select-all-row] Vše✏️✕",
        "·1.Bod✏️✕",
        "/2.Úsečka✏️✕",
        "○3.Kružnice✏️✕",
        "⌗Kóta✏️✕",
        "/4.Polotovar✏️✕",
      ]
    `);
    expect(liOf('Kóta').querySelector('.obj-checkbox')).toBeNull();
  });

  it('„Vše" cyklicky: vše → kontura → polotovar → nic', () => {
    const cb = () => ul().querySelector('.select-all-row .obj-checkbox');
    const mode = () => ul().querySelector('.select-all-row').children[2].textContent;
    cb().click();
    expect([sel(), mode(), cb().checked]).toEqual([[0, [0, 1, 2, 4]], '(vše)', true]);
    cb().click();
    expect([sel(), mode(), cb().indeterminate]).toEqual([[0, [0, 1, 2]], '(kontura)', true]);
    cb().click();
    expect([sel(), mode()]).toEqual([[4, [4]], '(polotovar)']);
    cb().click();
    expect([sel(), mode()]).toEqual([[null, []], '']);
  });

  it('výběr checkboxem a klikem na řádek (přidat, odebrat, zbyde jeden)', () => {
    const cb = (label) => liOf(label).querySelector('.obj-checkbox');
    const span = (label) => liOf(label).children[1];
    cb('Úsečka').click();
    expect(sel()).toEqual([1, [1]]);
    cb('Kružnice').click();
    expect(sel()).toEqual([2, [1, 2]]);
    cb('Kružnice').click();
    expect(sel()).toEqual([1, []]);
    expect(liOf('Úsečka').className).toBe('selected');
    span('Bod').click();
    expect(sel()).toEqual([0, [0, 1]]);
    span('Bod').click();
    expect(sel()).toEqual([1, []]);
    span('Úsečka').click();
    expect(sel()).toEqual([null, []]);
    span('Kružnice').click();
    expect(sel()).toEqual([2, []]);
  });

  it('řádek s vybraným bodem objektu má „has-points"; Číslovat přepne čísla', () => {
    state.selectedPoint = [{ x: 10, y: 5 }];
    ui.updateObjectList();
    expect(liOf('Úsečka').className).toBe('has-points');
    expect(liOf('Úsečka').querySelector('.obj-checkbox').indeterminate).toBe(true);
    const num = document.getElementById('objNumberCb');
    num.checked = true;
    num.onchange();
    expect(state.showObjectNumbers).toBe(true);
  });

  it('✏️ u řádku vybere objekt a otevře úpravu; ✏️ v řádku „Vše" otevře hromadnou úpravu', () => {
    liOf('Kružnice').querySelector('.edit-btn').click();
    expect(sel()).toEqual([2, []]);
    expect(mobileEdit.showEditObjectDialog).toHaveBeenCalledWith(2);
    ul().querySelector('.select-all-row .edit-btn').click();
    expect(mobileEdit.showMobileEditDialog).toHaveBeenCalledTimes(1);
  });

  it('✕ u řádku smaže objekt i jeho kótu, výběr přepočítá podle identity; Zpět vrátí', () => {
    state.objects[3].sourceObjId = 2;   // kóta úsečky 2 (osiřelá se smaže)
    const polo = state.objects[4];
    state.selected = 4;
    ui.updateObjectList();
    liOf('Úsečka').querySelector('.del-btn').click();
    expect(state.objects.map(o => o.id)).toEqual([1, 3, 5, 6]);
    expect(state.selected).toBe(state.objects.indexOf(polo));
    expect(state.undoStack.length).toBe(1);
    undo();
    expect(state.objects.map(o => o.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('✕ v řádku „Vše" smaže vybrané (bez kót); nic vybráno → hláška', () => {
    ul().querySelector('.select-all-row .del-btn').click();
    expect([state.objects.length, toast()]).toEqual([6, 'Nejsou vybrány žádné objekty']);
    state.selected = 0;
    state.multiSelected = new Set([0, 2, 3]);
    ui.updateObjectList();
    ul().querySelector('.select-all-row .del-btn').click();
    expect(state.objects.map(o => o.id)).toEqual([2, 4, 5, 6]);
    expect([sel(), state.undoStack.length]).toEqual([[null, []], 1]);
  });

  it('kontura: segmenty se rozbalí, výběr segmentů (i „Vše"), smazání prostředního ji rozdělí', () => {
    state.objects = [{ type: 'polyline', id: 1, name: 'Kontura 1', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 10 }], bulges: [0, 0.5, 0], closed: false, layer: 0 }];
    state.nextId = 2;
    state.selected = 0;
    ui.updateObjectList();
    expect(rows()).toMatchInlineSnapshot(`
      [
        "[select-all-row] Vše(vše)✏️✕",
        "[selected] ⛓1.Kontura✏️✕",
        "[seg-item seg-select-all-row] Vše",
        "[seg-item] /1.Úsečka✕",
        "[seg-item] ⌒2.Oblouk✕",
        "[seg-item] /3.Úsečka✕",
      ]
    `);
    const segCbs = () => [...ul().querySelectorAll('.seg-item .obj-checkbox')];
    segCbs()[2].click();
    expect([[...state.multiSelectedSegments.get(0)], state.selectedSegment, state._selectedSegmentObjIdx]).toEqual([[1], 1, 0]);
    expect(segCbs()[0].indeterminate).toBe(true);
    segCbs()[0].click();
    expect([[...state.multiSelectedSegments.get(0)], state.selectedSegment]).toEqual([[0, 1, 2], 2]);
    segCbs()[0].click();
    expect([state.multiSelectedSegments.size, state.selectedSegment]).toEqual([0, null]);
    lis()[4].children[1].click();   // klik na „Oblouk"
    expect([state.selectedSegment, state.multiSelectedSegments.size]).toEqual([1, 0]);
    lis()[4].querySelector('.del-btn').click();
    expect(state.objects.map(o => [o.type, o.vertices.length])).toEqual([['polyline', 2], ['polyline', 2]]);
    expect([toast(), state.undoStack.length]).toEqual(['Segment smazán ✓', 1]);
  });

  it('obdélník: 4 strany s délkou, klik přepíná výběr strany, smazání strany ho rozloží na 3 úsečky', () => {
    state.objects = [{ type: 'point', id: 1, x: 0, y: 0, layer: 0 }, { type: 'rect', id: 2, name: 'Obdélník 2', x1: 0, y1: 0, x2: 30, y2: 10, layer: 0 }, { type: 'point', id: 3, x: 5, y: 5, layer: 0 }];
    state.nextId = 4;
    state.selected = 1;
    state.multiSelected = new Set([1, 2]);
    ui.updateObjectList();
    expect(rows().filter(r => r.startsWith('[seg-item]'))).toMatchInlineSnapshot(`
      [
        "[seg-item] /Úsečka 1 (30.0)✕",
        "[seg-item] /Úsečka 2 (10.0)✕",
        "[seg-item] /Úsečka 3 (30.0)✕",
        "[seg-item] /Úsečka 4 (10.0)✕",
      ]
    `);
    const side = (i) => lis().filter(li => li.className.startsWith('seg-item'))[i];
    side(1).children[0].click();
    expect([[...state.multiSelectedSegments.get(1)], state.selectedSegment]).toEqual([[1], 1]);
    side(3).children[0].click();
    side(1).children[0].click();
    expect([[...state.multiSelectedSegments.get(1)], state.selectedSegment]).toEqual([[3], 3]);
    side(0).querySelector('.del-btn').click();
    expect(state.objects.map(o => o.type)).toEqual(['point', 'line', 'line', 'line', 'point']);
    expect(state.objects.slice(1, 4).map(o => [o.id, o.name])).toEqual([[4, 'Úsečka 4'], [5, 'Úsečka 5'], [6, 'Úsečka 6']]);
    expect([sel(), toast()]).toEqual([[null, [4]], 'Segment smazán – obdélník rozložen ✓']);
  });

  it('deleteObjectsByIndices (export): smaže, vyresetuje výběr a tažení', () => {
    state.selected = 1;
    state.dragging = true;
    state.dragObjIdx = 1;
    ui.deleteObjectsByIndices([2, 0, 2]);
    expect(state.objects.map(o => o.id)).toEqual([2, 4, 5, 6]);
    expect([sel(), state.dragging, state.dragObjIdx]).toEqual([[null, []], false, null]);
  });
});

describe('skok v CNC kódu na vybraný objekt', () => {
  const CODE = ['; === SKICA ===', 'G90', '; STOCK_START', '; POLOTOVAR — Úsečka (délka: 10.000)', '; STOCK_END',
    '; Úsečka 2 (délka: 10.000)', 'G1 X10', '; Kružnice (R: 4.000)', 'G2 X0'].join('\n');
  it('výběr objektu označí jeho komentář (polotovar v bloku STOCK), jen při změně výběru', () => {
    const out = document.getElementById('cncOutput');
    out.value = CODE;
    const range = () => [out.selectionStart, out.selectionEnd, out.value.slice(out.selectionStart, out.selectionEnd)];
    state.selected = 1;
    ui.updateProperties();
    expect(range()).toEqual([CODE.indexOf('; Úsečka 2'), CODE.indexOf('\nG1 X10'), '; Úsečka 2 (délka: 10.000)']);
    out.setSelectionRange(0, 0);
    out.blur();
    ui.updateProperties();   // stejný výběr → nic
    expect(range()[0]).toBe(0);
    state.selected = 2;
    ui.updateProperties();
    expect(range()[2]).toBe('; Kružnice (R: 4.000)');
    state.objects[4].name = 'Úsečka 5';
    out.blur();
    state.selected = 4;
    ui.updateProperties();
    expect(range()[2]).toBe('; POLOTOVAR — Úsečka (délka: 10.000)');
    out.blur();
    state.selected = null;
    ui.updateProperties();
  });
});
