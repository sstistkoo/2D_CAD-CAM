// @vitest-environment happy-dom
// Nastavení aplikace se ukládá zvlášť od výkresu (localStorage 'skica-settings',
// js/storage/settingsStore.js).
// Dřív se ukládalo jen do rozkresleného výkresu a při startu se obnovilo jen
// s neprázdným výkresem — po „Smazat vše" nebo na čisté stránce se ztratilo.
// Tolerance úhlového snapu, snap k bodům a otočení osy Z se neukládaly vůbec
// a otočení os / zrcadlení se při startu neobnovilo.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
import { getMeta, setMeta } from '../js/idb.js';

let state, store, saveProject;
let saved;
const stored = () => JSON.parse(localStorage.getItem('skica-settings'));

beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  store = await import('../js/storage/settingsStore.js');
  ({ saveProject } = await import('../js/storage/projectManager.js'));
});
beforeEach(async () => {
  saved = store.collectSettings();
  localStorage.removeItem('skica-settings');
  await setMeta('currentProjectData', null);
});
afterEach(() => { Object.assign(state, saved); });

describe('co se ukládá', () => {
  it('všechna nastavení včetně dřív chybějících (tolerance, snap k bodům, osa Z)', () => {
    expect(store.SETTINGS_KEYS).toEqual(expect.arrayContaining([
      'gridSize', 'snapToPoints', 'snapToGrid', 'angleSnap', 'angleSnapStep', 'angleSnapTolerance',
      'snapQuadrants', 'snapMidpoints', 'snapCenters', 'coordMode', 'incReference', 'machineType',
      'xDisplayMode', 'flipX', 'flipZ', 'mirrorPreview', 'showContourGaps', 'displayDecimals', 'theme',
      'showDimensions', 'showObjectNumbers', 'showIntersectionNumbers',
    ]));
    // výkres (objekty, hladiny, nulový bod) do nastavení nepatří
    for (const k of ['objects', 'layers', 'anchors', 'undoStack']) expect(store.SETTINGS_KEYS).not.toContain(k);
  });
});

describe('obnovení při startu (restoreSettings)', () => {
  it('uložené nastavení se obnoví i bez výkresu', async () => {
    state.angleSnapTolerance = 3;
    state.snapToPoints = false;
    state.flipZ = true;
    state.theme = 'light';
    store.saveSettings();
    Object.assign(state, { angleSnapTolerance: 1, snapToPoints: true, flipZ: false, theme: 'dark' });
    await store.restoreSettings(null);
    expect([state.angleSnapTolerance, state.snapToPoints, state.flipZ, state.theme]).toEqual([3, false, true, 'light']);
  });

  it('starší verze (bez uloženého nastavení): vezme nastavení z uloženého výkresu, i prázdného', async () => {
    state.gridSize = 10;
    state.machineType = 'soustruh';
    await store.restoreSettings({ objects: [], gridSize: 2.5, machineType: 'karusel', theme: 'light' });
    expect([state.gridSize, state.machineType, state.theme]).toEqual([2.5, 'karusel', 'light']);
  });

  it('uložené nastavení má přednost před výkresem; co v něm chybí, doplní výkres', async () => {
    localStorage.setItem('skica-settings', JSON.stringify({ gridSize: 5 }));
    state.coordMode = 'abs';
    await store.restoreSettings({ objects: [{}], gridSize: 1, coordMode: 'inc' });
    expect([state.gridSize, state.coordMode]).toEqual([5, 'inc']);
  });

  it('ABS/INC a nulový bod se obnoví spolu — i k prázdnému výkresu', async () => {
    // dřív: INC a reference z nastavení, ale nulový bod (zobrazení, natočení)
    // jen z výkresu s objekty → INC vůči skrytému, neotočenému bodu
    Object.assign(state, { coordMode: 'inc', incReference: { x: 50, y: 20 }, nullPointActive: true, nullPointAngle: 30 });
    store.saveSettings();
    Object.assign(state, { coordMode: 'abs', incReference: { x: 0, y: 0 }, nullPointActive: false, nullPointAngle: 0 });
    store.restoreSettings({ objects: [] });
    expect([state.coordMode, state.incReference, state.nullPointActive, state.nullPointAngle]).toEqual(['inc', { x: 50, y: 20 }, true, 30]);
  });

  it('neplatné hodnoty přeskočí (výchozí zůstane)', async () => {
    Object.assign(state, { gridSize: 10, theme: 'dark', angleSnapTolerance: 1, displayDecimals: 3, incReference: { x: 0, y: 0 } });
    localStorage.setItem('skica-settings', JSON.stringify({ gridSize: -1, theme: 'modrá', angleSnapTolerance: 90, displayDecimals: '2', incReference: null, snapToGrid: 'ano' }));
    const before = state.snapToGrid;
    await store.restoreSettings(null);
    expect([state.gridSize, state.theme, state.angleSnapTolerance, state.displayDecimals, state.incReference, state.snapToGrid])
      .toEqual([10, 'dark', 1, 3, { x: 0, y: 0 }, before]);
    localStorage.setItem('skica-settings', '{rozbité');
    expect(() => store.restoreSettings({ gridSize: 4 })).not.toThrow();
    expect(state.gridSize).toBe(4);
  });
});

describe('kdy se ukládá', () => {
  it('saveProject (autosave po úpravě, Ctrl+S) uloží i nastavení — pokryje přepínače z klávesnice', async () => {
    state.objects = [];
    state.snapToPoints = false;   // klávesa S nevolá persistSettings
    state.flipZ = true;
    await saveProject({ quiet: true });
    expect(stored().snapToPoints).toBe(false);
    // projekt nese i otočení osy Z (dřív se při otevření vždy vynulovalo)
    expect((await getMeta('currentProjectData')).flipZ).toBe(true);
  });

  it('otevřený projekt: jeho nastavení se uloží hned (ne až s dalším autosave)', async () => {
    state.machineType = 'soustruh';
    state.gridSize = 10;
    store.saveSettings();
    await setMeta('currentProjectData', { objects: [{ type: 'point', id: 1, x: 0, y: 0, layer: 0 }], machineType: 'karusel', gridSize: 5 });
    const { loadProject } = await import('../js/storage/projectManager.js');
    await loadProject();
    expect([stored().machineType, stored().gridSize]).toEqual(['karusel', 5]);
    state.objects = [];
  });

  it('při skrytí stránky (mobil, přepnutí aplikace) a při zavření', () => {
    store.initSettingsAutoSave();
    state.angleSnapTolerance = 7;
    const vis = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
      || Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      delete document.visibilityState;
      if (vis && !Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')) Object.defineProperty(document, 'visibilityState', vis);
    }
    expect(stored().angleSnapTolerance).toBe(7);
    state.angleSnapTolerance = 8;
    window.dispatchEvent(new Event('pagehide'));   // synchronně — stihne se i při obnovení stránky
    expect(stored().angleSnapTolerance).toBe(8);
  });
});
