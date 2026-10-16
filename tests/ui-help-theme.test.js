// @vitest-environment happy-dom
// Název projektu ve stavovém řádku, nápověda (❓, ✕, klik mimo, první
// spuštění) a přepnutí motivu. Psáno PŘED přesunem z ui.js do
// js/ui/helpTheme.js (docs/plan-refaktoringu-ui.md, Fáze 3) jako
// charakterizace: projde na starém kódu a po přesunu musí projít beze změny.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
import { getMeta, setMeta } from '../js/idb.js';

let ui, state, COLORS;
const help = () => document.getElementById('helpOverlay');
const visible = () => help().classList.contains('visible');
const toast = () => document.querySelector('.toast')?.textContent;

beforeAll(async () => {
  installUiDom();
  // #statusProject v index.html není (nález č. 5 v plánu) — test ho přidá.
  const sp = document.createElement('span');
  sp.id = 'statusProject';
  document.body.appendChild(sp);
  ui = await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  ({ COLORS } = await import('../js/constants.js'));
});
afterEach(() => { help().classList.remove('visible'); });

describe('stavový řádek a nápověda', () => {
  it('název projektu', () => {
    state.projectName = 'Hřídel';
    ui.updateStatusProject();
    expect(document.getElementById('statusProject').textContent).toBe('Projekt: Hřídel');
    state.projectName = '';
    ui.updateStatusProject();
    expect(document.getElementById('statusProject').textContent).toBe('Projekt: Bez názvu');
  });

  it('show / hide / toggle; ❓ přepíná, ✕ a klik na pozadí zavřou, klik dovnitř ne', () => {
    ui.showHelp();
    expect(visible()).toBe(true);
    ui.hideHelp();
    expect(visible()).toBe(false);
    ui.toggleHelp();
    ui.toggleHelp();
    expect(visible()).toBe(false);
    document.getElementById('btnHelp').click();
    expect(visible()).toBe(true);
    help().firstElementChild.click();
    expect(visible()).toBe(true);
    help().click();
    expect(visible()).toBe(false);
    document.getElementById('btnHelp').click();
    document.getElementById('helpCloseBtn').click();
    expect(visible()).toBe(false);
  });

  it('první spuštění: nápověda jednou a zapamatuje si to', async () => {
    await setMeta('helpShown', null);
    await ui.checkFirstRunHelp();
    expect(visible()).toBe(true);
    await vi.waitFor(async () => expect(await getMeta('helpShown')).toBe('1'));
    help().classList.remove('visible');
    await ui.checkFirstRunHelp();
    expect(visible()).toBe(false);
  });
});

describe('motiv', () => {
  it('applyTheme: třída na body, barvy plátna, hláška', () => {
    state.theme = 'light';
    ui.applyTheme();
    const light = { ...COLORS };
    expect([document.body.classList.contains('light-theme'), toast()]).toEqual([true, 'Světlý motiv']);
    state.theme = 'dark';
    ui.applyTheme();
    expect([document.body.classList.contains('light-theme'), toast()]).toEqual([false, 'Tmavý motiv']);
    expect(light).not.toEqual({ ...COLORS });
  });
});

