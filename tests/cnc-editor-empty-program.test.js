// @vitest-environment happy-dom
// Prázdný program ('') je platný soubor: editor ho musí zobrazit (název, historie
// Zpět), ne tiše přeskočit. Dřív: „Vymazat editor" → 🎯 bod z plátna → návrat
// a Zpět už vymazaný kód nevrátil.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

const lastEditor = () => [...document.querySelectorAll('[data-el="editor"]')].pop();
const closeAll = () => document.querySelectorAll('.cne-layout').forEach(r => r.closest('body > *')?.remove());

describe('CNC editor – prázdný program', () => {
  it('otevření s prázdným kódem z plátna zobrazí soubor CNC_PROGRAM.MPF', async () => {
    installUiDom();
    const { openCncEditor } = await import('../js/calculators/cncEditor.js');
    closeAll();
    openCncEditor('', { drawOnClose: true });
    const ed = lastEditor();
    expect(ed.value).toBe('');
    expect(ed.closest('.cne-layout').querySelector('[data-el="filename"]').textContent).toBe('CNC_PROGRAM.MPF');
  });

  it('přepínač ✎K/✎P a G90/G91 v liště reagují na kód', async () => {
    installUiDom();
    const { openCncEditor } = await import('../js/calculators/cncEditor.js');
    closeAll();
    openCncEditor('G90 G0 X10 Z0\nG1 Z-5', { drawOnClose: true });
    const ed = lastEditor(), root = ed.closest('.cne-layout');
    ed.selectionStart = ed.selectionEnd = ed.value.length;
    const g = root.querySelector('[data-el="lineGBtn"]');
    g.click();
    expect(ed.value.split('\n').some(l => /^G91 /.test(l))).toBe(true);
    expect(g.textContent).toBe('G91');
    const k = root.querySelector('[data-el="stockToggleBtn"]');
    k.click();
    expect(ed.value).toMatch(/STOCK_START/);
    expect(k.textContent).toBe('✎P');
    k.click();   // hned zpět bez kódu → značka pryč
    expect(ed.value).not.toMatch(/STOCK_/);
    expect(k.textContent).toBe('✎K');
  });
});
