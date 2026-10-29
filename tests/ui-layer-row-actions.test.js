// @vitest-environment happy-dom
// Panel Vrstvy: 🗑 v řádku vrstvy smaže její objekty (vrstva zůstane, ↩ Zpět),
// řádek „Hrany přes osu" při zrcadlení přepíná state.mirrorEdges.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let ui, state;
const rows = () => [...document.getElementById('layerList').children];
const row = (name) => rows().find(li => li.textContent.includes(name));
const trash = (li) => [...li.querySelectorAll('button.layer-icon-btn')].find(b => b.title.startsWith('Smazat objekty'));

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
});
beforeEach(() => {
  state.layers = [
    { id: 0, name: 'Kontura', color: '#89b4fa', visible: true, locked: false },
    { id: 1, name: 'Konstrukce', color: '#6c7086', visible: true, locked: false },
  ];
  state.objects = [
    { type: 'line', layer: 0, x1: 0, y1: 0, x2: 10, y2: 0 },
    { type: 'line', layer: 1, x1: 0, y1: -5, x2: 0, y2: 5 },
    { type: 'line', layer: 1, x1: 5, y1: -5, x2: 5, y2: 5 },
  ];
  state.mirrorPreview = false;
  state.mirrorEdges = true;
  state.machineType = 'soustruh';
  ui.updateLayerList();
});
afterEach(() => { delete globalThis.confirm; });

describe('🗑 v řádku vrstvy', () => {
  it('smaže jen objekty vrstvy, vrstva zůstane', () => {
    globalThis.confirm = vi.fn(() => true);
    trash(row('Konstrukce')).click();
    expect(state.objects.map(o => o.layer)).toEqual([0]);
    expect(state.layers.map(l => l.name)).toEqual(['Kontura', 'Konstrukce']);
    expect(trash(row('Konstrukce'))).toBeUndefined();   // prázdná vrstva tlačítko nemá
  });
  it('bez potvrzení nebo u zamčené vrstvy nic nesmaže', () => {
    globalThis.confirm = vi.fn(() => false);
    trash(row('Konstrukce')).click();
    expect(state.objects).toHaveLength(3);
    state.layers[1].locked = true;
    globalThis.confirm = vi.fn(() => true);
    trash(row('Konstrukce')).click();
    expect(state.objects).toHaveLength(3);
  });
});

describe('řádek Hrany přes osu', () => {
  it('jen při zrcadlení na soustruhu; oko přepíná state.mirrorEdges', () => {
    expect(row('Hrany přes osu')).toBeUndefined();
    state.mirrorPreview = true;
    ui.updateLayerList();
    row('Hrany přes osu').querySelector('button.layer-icon-btn').click();
    expect(state.mirrorEdges).toBe(false);
    row('Hrany přes osu').querySelector('button.layer-icon-btn').click();
    expect(state.mirrorEdges).toBe(true);
    state.machineType = 'karusel';
    ui.updateLayerList();
    expect(row('Hrany přes osu')).toBeUndefined();
  });
});
