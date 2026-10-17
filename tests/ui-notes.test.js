// @vitest-environment happy-dom
// Poznámkový blok (tlačítko #btnOpenNotes). Psáno PŘED přesunem z ui.js do
// js/ui/notesDialog.js (docs/plan-refaktoringu-ui.md, Fáze 1a) jako
// charakterizace: projde na starém kódu a po přesunu musí projít beze změny.
// IndexedDB přes fake-indexeddb — ukládání jde opravdu přes js/idb.js.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
import { settle } from './helpers/simUi.mjs';
import { getMeta, setMeta } from '../js/idb.js';

const sel = (s) => document.querySelector('.calc-overlay[data-type="notes"] ' + s);
const overlay = () => document.querySelector('.calc-overlay[data-type="notes"]');
const ta = () => sel('#notesArea');
const tabs = () => [...document.querySelectorAll('#notesTabs .notes-tab, #notesTabs .notes-tab-add')].map(b => b.textContent + (b.classList.contains('active') ? '*' : ''));
const act = (name) => sel(`[data-act="${name}"]`).click();
const status = () => ['#notesSaveText', '#notesWordCount', '#notesCharCount', '#notesLineCount'].map(s => sel(s).textContent);
const type = (text) => { ta().value = text; ta().dispatchEvent(new Event('input', { bubbles: true })); };
const toast = () => document.querySelector('.toast')?.textContent;

async function openNotes() {
  document.getElementById('btnOpenNotes').click();
  await vi.waitFor(() => expect(overlay()).toBeTruthy());
  await settle(5);
}
async function closeNotes() {
  sel('.calc-close-btn').click();
  await settle(20);
}

beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
});
beforeEach(async () => {
  await setMeta('userNotesAll', null);
  await setMeta('userNotes', null);
});
afterEach(async () => {
  if (overlay()) await closeNotes();
  vi.unstubAllGlobals();
});

describe('poznámkový blok', () => {
  it('bez userNotesAll převezme starý userNotes do záložky „Poznámky"; zavření uloží', async () => {
    await setMeta('userNotes', 'stará poznámka\ndruhý řádek');
    await openNotes();
    expect(sel('.calc-titlebar h3').textContent).toBe('📝 Poznámkový blok');
    expect(overlay().querySelector('.calc-window').classList.contains('notes-window')).toBe(true);
    expect(ta().value).toBe('stará poznámka\ndruhý řádek');
    expect(tabs()).toEqual(['Poznámky*', '+']);
    expect(status()).toMatchInlineSnapshot(`
      [
        "Uloženo",
        "4 slov",
        "26 znaků",
        "Ř 2",
      ]
    `);

    type('nový text');
    expect(status()[0]).toBe('Neuloženo');
    await closeNotes();
    await vi.waitFor(async () => expect(await getMeta('userNotesAll')).toEqual([{ id: 1, title: 'Poznámky', text: 'nový text' }]));
    expect(await getMeta('userNotes')).toBe('nový text');
  });

  it('záložky: přepnutí, nová přes prompt (id = max+1), uložení tlačítkem', async () => {
    await setMeta('userNotesAll', [{ id: 1, title: 'A', text: 'aaa' }, { id: 5, title: 'B', text: 'bbb' }]);
    await openNotes();
    expect(ta().value).toBe('aaa');
    expect(tabs()).toEqual(['A*', 'B', '+']);

    document.querySelectorAll('#notesTabs .notes-tab')[1].click();
    expect(ta().value).toBe('bbb');
    expect(tabs()).toEqual(['A', 'B*', '+']);
    expect(status()[0]).toBe('Neuloženo');

    const prompt = vi.fn(() => 'C');
    vi.stubGlobal('prompt', prompt);
    sel('.notes-tab-add').click();
    expect(prompt).toHaveBeenCalledWith('Název nové záložky:', 'Poznámka 6');
    expect(tabs()).toEqual(['A', 'B', 'C*', '+']);
    expect(ta().value).toBe('');

    type('ccc');
    // tlačítko Uložit není – ukládá se samo po krátké pauze
    expect(sel('[data-act="save"]')).toBeNull();
    await vi.waitFor(async () => expect(await getMeta('userNotesAll')).toEqual([
      { id: 1, title: 'A', text: 'aaa' }, { id: 5, title: 'B', text: 'bbb' }, { id: 6, title: 'C', text: 'ccc' },
    ]), { timeout: 4000 });
    expect(await getMeta('userNotes')).toBe('aaa');
    await vi.waitFor(() => expect(status()[0]).toBe('Uloženo'), { timeout: 4000 });

    // dvojklik = přejmenování
    vi.stubGlobal('prompt', vi.fn(() => 'Céčko'));
    document.querySelectorAll('#notesTabs .notes-tab')[2].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(tabs()).toEqual(['A', 'B', 'Céčko*', '+']);
    // i přejmenování se uloží samo (bez zavření okna)
    await vi.waitFor(async () => expect((await getMeta('userNotesAll'))[2].title).toBe('Céčko'), { timeout: 4000 });
  });

  it('spodní lišta: tři stejná tlačítka s popiskem (bublina pod křížkem), Uložit chybí', async () => {
    await openNotes();
    const btns = [...overlay().querySelectorAll('.notes-actions .notes-btn')];
    expect(btns.map(b => b.dataset.act)).toEqual(['clear', 'copy', 'download']);
    expect(btns.every(b => b.title.length > 10)).toBe(true);
    expect(btns[2].textContent).toBe('💾 Stáhnout');
    expect(sel('.notes-save-indicator').title).toMatch(/automaticky/);
  });

  it('kontextové menu záložky: duplikovat, smazat (s potvrzením)', async () => {
    await setMeta('userNotesAll', [{ id: 1, title: 'A', text: 'aaa' }, { id: 2, title: 'B', text: 'bbb' }]);
    await openNotes();
    const ctx = async (i) => {
      document.querySelectorAll('#notesTabs .notes-tab')[i].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 20 }));
      await settle(5);
      return sel('.notes-ctx');
    };
    let menu = await ctx(0);
    expect([...menu.querySelectorAll('button')].map(b => b.dataset.ctx)).toEqual(['rename', 'duplicate', 'delete']);
    expect([menu.style.left, menu.style.top]).toEqual(['10px', '20px']);
    menu.querySelector('[data-ctx="duplicate"]').click();
    expect(tabs()).toEqual(['A', 'B', 'A (kopie)*', '+']);
    expect(ta().value).toBe('aaa');
    expect(sel('.notes-ctx')).toBeNull();

    vi.stubGlobal('confirm', vi.fn(() => true));
    menu = await ctx(0);
    menu.querySelector('[data-ctx="delete"]').click();
    expect(confirm).toHaveBeenCalledWith('Smazat záložku „A"?');
    expect(tabs()).toEqual(['B', 'A (kopie)*', '+']);
  });

  it('✕ u záložky: prázdná se zavře hned, s textem po potvrzení; poslední ✕ nemá', async () => {
    await setMeta('userNotesAll', [{ id: 1, title: 'A', text: 'aaa' }, { id: 2, title: 'B', text: '' }, { id: 3, title: 'C', text: 'ccc' }]);
    await openNotes();
    const closeBtns = () => [...document.querySelectorAll('#notesTabs .notes-tab-close')];
    expect(closeBtns().length).toBe(3);
    expect(closeBtns()[0].title).toBe('Zavřít záložku „A“');

    // prázdná záložka B – bez ptaní
    const confirmFn = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmFn);
    closeBtns()[1].click();
    expect(confirmFn).not.toHaveBeenCalled();
    expect(tabs()).toEqual(['A*', 'C', '+']);
    expect(status()[0]).toBe('Neuloženo');

    // záložka s textem – zrušené potvrzení nic nesmaže
    closeBtns()[1].click();
    expect(confirmFn).toHaveBeenCalledWith('Zavřít záložku „C“? Její text se smaže.');
    expect(tabs()).toEqual(['A*', 'C', '+']);

    // potvrzeno: zavře aktivní A (rozepsaný text se počítá) → aktivní je C
    vi.stubGlobal('confirm', vi.fn(() => true));
    type('rozepsáno');
    closeBtns()[0].click();
    expect(tabs()).toEqual(['C*', '+']);
    expect(ta().value).toBe('ccc');
    expect(closeBtns().length).toBe(0);

    await vi.waitFor(async () => expect(await getMeta('userNotesAll')).toEqual([{ id: 3, title: 'C', text: 'ccc' }]), { timeout: 4000 });
  });

  it('lišta: tučné, nadpis, Tab, písmo, vymazat; hledání; Ctrl+S', async () => {
    await setMeta('userNotesAll', [{ id: 1, title: 'A', text: 'ahoj světe\nahoj' }]);
    await openNotes();
    ta().setSelectionRange(0, 4);
    act('bold');
    expect(ta().value).toBe('**ahoj** světe\nahoj');
    ta().setSelectionRange(17, 17);
    act('heading');
    expect(ta().value).toBe('**ahoj** světe\n# ahoj');
    ta().setSelectionRange(0, 0);
    ta().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(ta().value).toBe('\t**ahoj** světe\n# ahoj');
    expect(status()).toMatchInlineSnapshot(`
      [
        "Neuloženo",
        "4 slov",
        "22 znaků",
        "Ř 2",
      ]
    `);

    act('fontUp');
    expect(ta().className).toBe('notes-editor font-lg');
    act('fontDown');
    expect(ta().className).toBe('notes-editor');
    act('fontDown');
    expect(ta().className).toBe('notes-editor font-sm');

    act('search');
    expect(sel('#notesSearchBar').classList.contains('open')).toBe(true);
    const si = sel('#notesSearchInput');
    si.focus();
    si.value = 'AHOJ';
    si.dispatchEvent(new Event('input', { bubbles: true }));
    expect(sel('#notesSearchCount').textContent).toBe('1 / 2');
    expect([ta().selectionStart, ta().selectionEnd]).toEqual([3, 7]);
    // Psaní a Enter v poli hledání nechají fokus v poli (dřív skočil do
    // editoru a další písmena přepsala označený nález v poznámce).
    expect(document.activeElement).toBe(si);
    si.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect([sel('#notesSearchCount').textContent, ta().selectionStart, document.activeElement]).toEqual(['2 / 2', 18, si]);
    si.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    expect([sel('#notesSearchCount').textContent, ta().selectionStart]).toEqual(['1 / 2', 3]);
    expect(ta().value).toBe('\t**ahoj** světe\n# ahoj');
    // Tlačítka ▲/▼ přejdou do editoru (nález je tam vidět označený).
    act('searchNext');
    expect(sel('#notesSearchCount').textContent).toBe('2 / 2');
    expect([ta().selectionStart, ta().selectionEnd]).toEqual([18, 22]);
    expect(document.activeElement).toBe(ta());
    si.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sel('#notesSearchBar').classList.contains('open')).toBe(false);

    ta().dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(async () => expect(await getMeta('userNotesAll')).toEqual([{ id: 1, title: 'A', text: '\t**ahoj** světe\n# ahoj' }]));

    vi.stubGlobal('confirm', vi.fn(() => true));
    act('clear');
    expect(ta().value).toBe('');
    expect(toast()).toBe('Záložka vymazána');

    // Escape v poli hledání zavře jen lištu hledání a vrátí kurzor do editoru
    // (dřív bublal na document a ESC z makeOverlay / events.js zavřel celé
    // okno — nález č. 1 v docs/plan-refaktoringu-ui.md). Další Escape z editoru
    // už okno zavře (a zavření uloží).
    act('search');
    const onDoc = vi.fn();
    document.addEventListener('keydown', onDoc);
    sel('#notesSearchInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.removeEventListener('keydown', onDoc);
    await settle(20);
    expect(overlay()).toBeTruthy();
    expect(onDoc).not.toHaveBeenCalled();
    expect(sel('#notesSearchBar').classList.contains('open')).toBe(false);
    expect(document.activeElement).toBe(ta());
    ta().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(20);
    expect(overlay()).toBeNull();
    await vi.waitFor(async () => expect(await getMeta('userNotesAll')).toEqual([{ id: 1, title: 'A', text: '' }]));
  });

  it('druhé otevření při otevřeném okně nic nepřidá', async () => {
    await openNotes();
    document.getElementById('btnOpenNotes').click();
    await settle(20);
    expect(document.querySelectorAll('.calc-overlay[data-type="notes"]').length).toBe(1);
  });
});
