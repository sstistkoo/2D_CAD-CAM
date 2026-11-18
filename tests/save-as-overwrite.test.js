// @vitest-environment happy-dom
// Kontrola kódu 18. 11. 2026 – Uložit jako nepřepíše jiný projekt bez dotazu.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let state, pm, idb;
const tick = () => new Promise(r => setTimeout(r, 30));

beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  pm = await import('../js/storage/projectManager.js');
  idb = await import('../js/idb.js');
});

describe('Uložit jako', () => {
  it('existující jiný projekt se přepíše až po potvrzení', async () => {
    await idb.saveProjectToDB('Hřídel', { objects: [{ type: 'line', id: 1, x1: 0, y1: 0, x2: 1, y2: 1 }] });
    state.projectName = 'Bez názvu';
    state.objects = [];
    pm.showSaveAsDialog();
    document.getElementById('saveAsName').value = 'Hřídel';
    document.getElementById('saveAsOk').click();
    await tick();
    // Zatím nepřepsáno, ptá se
    expect((await idb.loadProjectFromDB('Hřídel')).objects).toHaveLength(1);
    expect(state.projectName).toBe('Bez názvu');
    const ok = document.getElementById('confirmDialogOk');
    expect(ok).not.toBeNull();
    ok.click();
    await tick();
    expect((await idb.loadProjectFromDB('Hřídel')).objects).toHaveLength(0);
    expect(state.projectName).toBe('Hřídel');
  });

  it('uložení pod vlastním názvem se neptá', async () => {
    state.projectName = 'Hřídel';
    state.objects = [{ type: 'line', id: 5, x1: 0, y1: 0, x2: 2, y2: 2 }];
    pm.showSaveAsDialog();
    document.getElementById('saveAsOk').click();
    await tick();
    expect(document.getElementById('confirmDialogOk')).toBeNull();
    expect((await idb.loadProjectFromDB('Hřídel')).objects).toHaveLength(1);
  });
});

describe('rozkreslený výkres nese název projektu', () => {
  it('buildProjectData obsahuje projectName (obnoví se po startu v app.js)', () => {
    state.projectName = 'Příruba';
    expect(pm.buildProjectData().projectName).toBe('Příruba');
  });
});

describe('Otevřít projekt vyčistí historii Zpět (uživatel 18. 11. 2026)', () => {
  it('po otevření je Zpět prázdné a rozkreslený výkres = otevřený projekt', async () => {
    await idb.saveProjectToDB('Čep', { objects: [{ type: 'line', id: 1, x1: 0, y1: 0, x2: 3, y2: 0 }], nextId: 2 });
    state.objects = [{ type: 'circle', id: 9, cx: 0, cy: 0, r: 1 }];
    state.undoStack = ['{"objects":[],"anchors":[]}'];
    state.redoStack = ['x'];
    await pm.openProject('Čep');
    expect(state.undoStack).toEqual([]);
    expect(state.redoStack).toEqual([]);
    await tick();
    const cur = await idb.getMeta('currentProjectData');
    expect(cur.projectName).toBe('Čep');
    expect(cur.objects).toHaveLength(1);
  });
});
