// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: idb.js (IndexedDB abstrakce)               ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// Mock DOM (state.js potřebuje document)
vi.stubGlobal('document', {
  getElementById: () => ({
    disabled: false, classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    textContent: '',
  }),
  createElement: () => ({
    className: '', textContent: '', innerHTML: '',
    classList: { add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(), addEventListener: vi.fn(),
    setAttribute: vi.fn(),
  }),
  body: { appendChild: vi.fn() },
  querySelector: () => null,
});

vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768, addEventListener: vi.fn() });
vi.stubGlobal('navigator', { vibrate: vi.fn() });

// Mock render.js
vi.mock('../js/render.js', () => ({ renderAll: vi.fn(), renderAllDebounced: vi.fn() }));

import {
  saveProjectToDB, loadProjectFromDB, deleteProjectFromDB,
  getAllProjects, getProjectNames, setMeta, getMeta,
} from '../js/idb.js';

// ════════════════════════════════════════
// ── Projects API ──
// ════════════════════════════════════════
describe('idb – Projects API', () => {
  const testProject = {
    version: 3,
    objects: [{ type: 'point', x: 0, y: 0, id: 1 }],
    nextId: 2,
  };

  it('saveProjectToDB + loadProjectFromDB', async () => {
    await saveProjectToDB('test1', testProject);
    const loaded = await loadProjectFromDB('test1');
    expect(loaded).toEqual(testProject);
  });

  it('loadProjectFromDB vrátí null pro neexistující projekt', async () => {
    const loaded = await loadProjectFromDB('nonexistent');
    expect(loaded).toBeNull();
  });

  it('deleteProjectFromDB smaže projekt', async () => {
    await saveProjectToDB('toDelete', testProject);
    await deleteProjectFromDB('toDelete');
    const loaded = await loadProjectFromDB('toDelete');
    expect(loaded).toBeNull();
  });

  it('getAllProjects vrátí všechny uložené projekty', async () => {
    await saveProjectToDB('projA', { a: 1 });
    await saveProjectToDB('projB', { b: 2 });
    const all = await getAllProjects();
    expect(all).toHaveProperty('projA');
    expect(all).toHaveProperty('projB');
    expect(all.projA).toEqual({ a: 1 });
  });

  it('getProjectNames vrátí pole názvů', async () => {
    await saveProjectToDB('nameTest', { x: 1 });
    const names = await getProjectNames();
    expect(names).toContain('nameTest');
  });

  it('přepíše existující projekt', async () => {
    await saveProjectToDB('overwrite', { v: 1 });
    await saveProjectToDB('overwrite', { v: 2 });
    const loaded = await loadProjectFromDB('overwrite');
    expect(loaded).toEqual({ v: 2 });
  });
});

// ════════════════════════════════════════
// ── Meta API ──
// ════════════════════════════════════════
describe('idb – Meta API', () => {
  it('setMeta + getMeta', async () => {
    await setMeta('testKey', 'testValue');
    const val = await getMeta('testKey');
    expect(val).toBe('testValue');
  });

  it('getMeta vrátí undefined pro neexistující klíč', async () => {
    const val = await getMeta('noSuchKey');
    expect(val).toBeUndefined();
  });

  it('setMeta přepíše existující hodnotu', async () => {
    await setMeta('replaceKey', 'old');
    await setMeta('replaceKey', 'new');
    const val = await getMeta('replaceKey');
    expect(val).toBe('new');
  });

  it('ukládá složité objekty', async () => {
    const data = { arr: [1, 2, 3], nested: { a: true } };
    await setMeta('complex', data);
    const val = await getMeta('complex');
    expect(val).toEqual(data);
  });

  it('ukládá boolean hodnoty', async () => {
    await setMeta('flag', true);
    const val = await getMeta('flag');
    expect(val).toBe(true);
  });
});
