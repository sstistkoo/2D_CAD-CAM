// @vitest-environment happy-dom
// Seznam vrstev (aktivní, barva, přejmenování dvojklikem, oko, zámek)
// a tlačítka ➕ / 🗑 vrstvy. Psáno PŘED přesunem z ui.js do js/ui/layerList.js
// (docs/plan-refaktoringu-ui.md, Fáze 2d) jako charakterizace: projde na
// starém kódu a po přesunu musí projít beze změny.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let ui, state, COLORS;
const ul = () => document.getElementById('layerList');
const row = (i) => ul().children[i];
const rows = () => [...ul().children].map(li => {
  const [vis, lock] = li.querySelectorAll('.layer-icon-btn');
  return [li.className, li.querySelector('.layer-radio').checked, li.querySelector('.layer-name')?.textContent,
    li.querySelector('.layer-color-dot').style.background, vis.className, vis.title, lock.textContent, lock.title];
});
const toast = () => document.querySelector('.toast')?.textContent;
let saved;

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  ({ COLORS } = await import('../js/constants.js'));
});
beforeEach(() => {
  saved = { layers: state.layers, activeLayer: state.activeLayer, nextLayerId: state.nextLayerId };
  state.layers = [
    { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
    { id: 3, name: 'Pomocná', color: '#f38ba8', visible: false, locked: true },
  ];
  state.activeLayer = 0;
  state.nextLayerId = 4;
  state.objects = [];
  ui.updateLayerList();
});
afterEach(() => {
  document.querySelector('.color-popover-overlay')?.remove();
  Object.assign(state, saved);
  state.objects = [];
});

describe('seznam vrstev', () => {
  it('řádky: aktivní, barva, oko, zámek', () => {
    expect(rows()).toEqual([
      ['layer-row active', true, 'Kontura', '#89b4fa', 'layer-icon-btn', 'Skrýt vrstvu', '🔓', 'Zamknout vrstvu'],
      ['layer-row', false, 'Pomocná', '#f38ba8', 'layer-icon-btn off', 'Zobrazit vrstvu', '🔒', 'Odemknout vrstvu'],
    ]);
    expect(row(0).querySelector('.layer-icon-btn').innerHTML).toMatch(/^<svg.*<circle cx="12" cy="12" r="3"><\/circle><\/svg>$/);
    expect(row(1).querySelector('.layer-icon-btn').innerHTML).toMatch(/^<svg.*<line x1="1" y1="1" x2="23" y2="23"><\/line><\/svg>$/);
    expect([...row(0).children].map(c => c.className)).toEqual(['layer-radio', 'layer-color-dot', 'layer-name', 'layer-icon-btn', 'layer-icon-btn']);
  });

  it('přepnutí aktivní vrstvy, oko, zámek', () => {
    const radio = row(1).querySelector('.layer-radio');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    expect(state.activeLayer).toBe(3);
    expect(rows().map(r => r[0])).toEqual(['layer-row', 'layer-row active']);
    row(0).querySelectorAll('.layer-icon-btn')[0].click();
    row(1).querySelectorAll('.layer-icon-btn')[1].click();
    expect([state.layers[0].visible, state.layers[1].locked]).toEqual([false, false]);
    expect(rows()[0][4]).toBe('layer-icon-btn off');
    expect(rows()[1][6]).toBe('🔓');
  });

  it('dvojklik na název: Enter přejmenuje, Escape a prázdný název ponechá', () => {
    const rename = (i, value, key) => {
      row(i).querySelector('.layer-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const inp = row(i).querySelector('.layer-name-input');
      expect(inp.value).toBe(state.layers[i].name);
      inp.value = value;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      inp.dispatchEvent(new Event('blur'));
    };
    rename(1, '  Obrys  ', 'Enter');
    expect([state.layers[1].name, row(1).querySelector('.layer-name').textContent]).toEqual(['Obrys', 'Obrys']);
    rename(1, 'Jiné', 'Escape');
    expect(state.layers[1].name).toBe('Obrys');
    rename(1, '   ', 'Enter');
    expect(state.layers[1].name).toBe('Obrys');
  });

  it('barevná tečka otevře výběr barvy vrstvy', () => {
    row(1).querySelector('.layer-color-dot').click();
    expect(document.querySelector('.color-popover-overlay h3').textContent).toBe('Barva vrstvy „Pomocná“');
  });
});

describe('tlačítka vrstev', () => {
  it('➕ přidá vrstvu s dalším id', () => {
    document.getElementById('btnAddLayer').click();
    expect(state.layers[2]).toEqual({ id: 4, name: 'Vrstva 4', color: COLORS.text, visible: true, locked: false });
    expect([state.nextLayerId, ul().children.length, toast()]).toEqual([5, 3, 'Vrstva 4 přidána']);
  });

  it('🗑 vrstvu 0 smazat nejde; jinou smaže a objekty přesune na Konturu', () => {
    document.getElementById('btnDelLayer').click();
    expect([state.layers.length, toast()]).toEqual([2, 'Nelze smazat vrstvu 0 (Kontura)']);
    state.objects = [{ type: 'point', x: 0, y: 0, layer: 3 }, { type: 'point', x: 1, y: 0, layer: 0 }];
    state.activeLayer = 3;
    document.getElementById('btnDelLayer').click();
    expect([state.layers.map(l => l.id), state.activeLayer, state.objects.map(o => o.layer), toast()])
      .toEqual([[0], 0, [0, 0], 'Vrstva smazána, objekty přesunuty na vrstvu Kontura']);
    expect(ul().children.length).toBe(1);
  });
});
