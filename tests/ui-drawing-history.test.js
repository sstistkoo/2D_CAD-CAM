// @vitest-environment happy-dom
// 🗑 Smazat vše (uloží výkres do historie smazaných) a dialog 🕓 Historie
// smazaných výkresů (obnovit / přejmenovat / do knihovny / smazat). Psáno
// PŘED přesunem z ui.js do js/ui/drawingHistory.js
// (docs/plan-refaktoringu-ui.md, Fáze 2b) jako charakterizace: projde na
// starém kódu a po přesunu musí projít beze změny.
// V aplikaci se historie otevírá z Nastavení; ui.js na ni věší i tlačítko
// #btnHistory, které v index.html není — test ho do DOM přidá před importem.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
import { settle } from './helpers/simUi.mjs';
import { getMeta, setMeta } from '../js/idb.js';

let state, undo;
const ov = () => document.querySelector('.calc-overlay[data-type="history"]');
const items = () => [...ov().querySelectorAll('.project-item')].map(li => [li.querySelector('.project-name').textContent, li.querySelector('.project-meta').textContent]);
const act = (i, a) => ov().querySelectorAll('.project-item')[i].querySelector(`[data-act="${a}"]`).click();
const toast = () => document.querySelector('.toast')?.textContent;
const line = (id) => ({ type: 'line', id, x1: 0, y1: 0, x2: 10, y2: id, layer: 0 });

async function openHistory() {
  document.getElementById('btnHistory').click();
  await settle(20);
}

beforeAll(async () => {
  installUiDom();
  const b = document.createElement('button');
  b.id = 'btnHistory';
  document.body.appendChild(b);
  await import('../js/ui.js');
  ({ state, undo } = await import('../js/state.js'));
});
beforeEach(async () => {
  await setMeta('deletedHistory', null);
  await setMeta('library', null);
  state.objects = [];
  state.projectName = 'Hřídel';
});
afterEach(() => {
  document.querySelectorAll('.calc-overlay').forEach(o => o.remove());
  vi.unstubAllGlobals();
});

describe('Smazat vše', () => {
  it('prázdný výkres: nic se neptá; zamítnutí: nic se nesmaže', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    document.getElementById('btnClearAll').click();
    expect(confirm).not.toHaveBeenCalled();
    state.objects = [line(1)];
    document.getElementById('btnClearAll').click();
    await settle(10);
    expect(confirm).toHaveBeenCalledWith('Opravdu smazat všechny objekty?');
    expect(state.objects).toHaveLength(1);
    expect(await getMeta('deletedHistory')).toBeNull();
  });

  it('potvrzení: výkres do historie (nejnovější první, max 10), plátno prázdné, jde vrátit Zpět', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    await setMeta('deletedHistory', Array.from({ length: 10 }, (_, i) => ({ id: 'old' + i, name: 'starý ' + i, date: 'd', data: { objects: [] } })));
    state.objects = [line(1), line(2)];
    state.nextId = 3;
    state.selected = 0;
    state.intersections = [{ x: 1, y: 1 }];
    document.getElementById('cncOutput').value = 'G0 X0';
    document.getElementById('btnClearAll').click();
    await vi.waitFor(() => expect(state.objects).toEqual([]));
    expect([state.selected, state.selectedPoint, state.intersections, state.nextId, document.getElementById('cncOutput').value])
      .toEqual([null, null, [], 1, '']);
    const hist = await getMeta('deletedHistory');
    expect(hist).toHaveLength(10);
    expect(hist[0].name).toBe('Hřídel');
    expect(hist[0].id).toMatch(/^del_\d+$/);
    expect(Object.keys(hist[0].data)).toEqual(['objects', 'nextId', 'layers', 'activeLayer', 'nextLayerId']);
    expect([hist[0].data.objects, hist[0].data.nextId]).toEqual([[line(1), line(2)], 3]);
    expect(hist[1].id).toBe('old0');
    expect(hist[9].id).toBe('old8');
    undo();
    expect(state.objects).toEqual([line(1), line(2)]);
  });
});

describe('Historie smazaných výkresů', () => {
  it('prázdná historie → jen hláška', async () => {
    await openHistory();
    expect(ov()).toBeNull();
    expect(toast()).toBe('Žádné smazané výkresy v historii');
  });

  it('seznam (nový i starý formát), obnovení nového formátu vč. vrstev a názvu', async () => {
    const layers = [{ id: 0, name: 'Kontura', color: '#fff', visible: true }, { id: 4, name: 'Pomocná', color: '#f00', visible: true }];
    await setMeta('deletedHistory', [
      { id: 'a', name: 'Příruba', date: '1. 1. 2026', data: { objects: [line(5)], nextId: 6, layers, activeLayer: 4 } },
      { id: 'b', date: '2. 1. 2026', objects: [line(1), line(2)], nextId: 3 },
    ]);
    await openHistory();
    expect(ov().querySelector('.calc-titlebar h3').textContent).toBe('🕓 Historie smazaných výkresů');
    expect(ov().querySelector('p').textContent).toBe('Posledních 2 smazaných výkresů:');
    expect(items()).toEqual([['Příruba', '1. 1. 2026 · 1 objektů'], ['(bez názvu)', '2. 1. 2026 · 2 objektů']]);

    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    state.objects = [line(9)];
    act(0, 'restore');
    await settle(10);
    expect(confirm).toHaveBeenCalledWith('Nahradit aktuální výkres obnoveným?');
    expect(state.objects).toEqual([line(5)]);
    expect([state.nextId, state.layers, state.activeLayer, state.nextLayerId, state.projectName]).toEqual([6, layers, 4, 5, 'Příruba']);
    expect(ov()).toBeNull();
    expect(toast()).toBe('Výkres "Příruba" obnoven ✓');
    undo();
    expect(state.objects).toEqual([line(9)]);
  });

  it('obnovení starého formátu (bez názvu, prázdné plátno → bez dotazu)', async () => {
    await setMeta('deletedHistory', [{ id: 'b', date: '2. 1. 2026', objects: [line(1), line(2)] }]);
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    await openHistory();
    act(0, 'restore');
    await settle(10);
    expect(confirm).not.toHaveBeenCalled();
    expect([state.objects, state.nextId, state.projectName]).toEqual([[line(1), line(2)], 3, 'Hřídel']);
    expect(toast()).toBe('Výkres "2. 1. 2026" obnoven ✓');
  });

  it('přejmenovat, do knihovny, smazat (poslední smazání zavře okno)', async () => {
    await setMeta('deletedHistory', [
      { id: 'a', name: 'A', date: 'd1', data: { objects: [line(1)], nextId: 2 } },
      { id: 'b', name: 'B', date: 'd2', objects: [line(1), line(2)], nextId: 3 },
    ]);
    await openHistory();
    vi.stubGlobal('prompt', vi.fn(() => '  Nový  '));
    act(1, 'rename');
    await vi.waitFor(() => expect(items()[1][0]).toBe('Nový'));
    expect((await getMeta('deletedHistory'))[1].name).toBe('Nový');

    vi.stubGlobal('prompt', vi.fn(() => 'Do knihovny'));
    act(1, 'tolib');
    await vi.waitFor(() => expect(toast()).toBe('Uloženo do knihovny: "Do knihovny"'));
    const lib = await getMeta('library');
    expect([lib.length, lib[0].name, lib[0].objectCount, lib[0].data]).toEqual([1, 'Do knihovny', 2, { objects: [line(1), line(2)], nextId: 3 }]);
    expect(lib[0].id).toMatch(/^lib_\d+$/);

    vi.stubGlobal('confirm', vi.fn(() => true));
    act(0, 'delete');
    await vi.waitFor(() => expect(items()).toEqual([['Nový', 'd2 · 2 objektů']]));
    act(0, 'delete');
    await vi.waitFor(() => expect(ov()).toBeNull());
    expect(toast()).toBe('Historie je prázdná');
    expect(await getMeta('deletedHistory')).toEqual([]);
  });
});
