// @vitest-environment happy-dom
// Nastavení → 💾 Uložit výkres / 📄 Nový výkres; 📁 Výkresy s náhledy (20. 11. 2026).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let state, pm, idb;
async function waitFor(cond, ms = 5000) {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error('waitFor: podmínka nesplněna');
    await new Promise(r => setTimeout(r, 10));
  }
}
const line = id => ({ type: 'line', id, x1: 0, y1: 0, x2: 10, y2: 5, layer: 0 });

beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  pm = await import('../js/storage/projectManager.js');
  idb = await import('../js/idb.js');
});

describe('Nový výkres / Uložit výkres', () => {
  it('pojmenovaný výkres se uloží a otevře se prázdný', async () => {
    state.projectName = 'Příruba';
    state.objects = [line(1), line(2)];
    pm.newDrawing();
    await waitFor(() => state.objects.length === 0);
    expect(state.projectName).toBe('Bez názvu');
    expect((await idb.loadProjectFromDB('Příruba')).objects).toHaveLength(2);
  });

  it('výkres bez názvu: zavření dotazu nic nezahodí, „Uložit pod názvem" uloží a pak nový', async () => {
    state.projectName = 'Bez názvu';
    state.objects = [line(1)];
    pm.newDrawing();
    expect(document.getElementById('ndSave')).not.toBeNull();
    document.querySelector('.input-overlay').remove();          // zavřeno bez volby
    expect(state.objects).toHaveLength(1);
    pm.newDrawing();
    document.getElementById('ndSave').click();
    document.getElementById('saveAsName').value = 'Čep';
    document.getElementById('saveAsOk').click();
    await waitFor(() => state.objects.length === 0);
    expect((await idb.loadProjectFromDB('Čep')).objects).toHaveLength(1);
  });

  it('„Zahodit a nový" otevře prázdný výkres', () => {
    state.projectName = 'Bez názvu';
    state.objects = [line(1)];
    pm.newDrawing();
    document.getElementById('ndDiscard').click();
    expect(state.objects).toHaveLength(0);
  });

  it('Uložit výkres bez názvu se zeptá na název', () => {
    state.projectName = 'Bez názvu';
    pm.saveNamed();
    expect(document.getElementById('saveAsName')).not.toBeNull();
    document.getElementById('saveAsCancel').click();
  });

  it('📁 Výkresy: karty s náhledem', async () => {
    await pm.showProjectsDialog();
    const card = document.querySelector('.proj-gallery .proj-card[data-name="Příruba"]');
    expect(card).not.toBeNull();
    expect(card.querySelector('.proj-thumb path')).not.toBeNull();
    document.querySelector('.input-overlay').remove();
  });
});
