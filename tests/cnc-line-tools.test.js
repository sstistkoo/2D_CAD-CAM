// @vitest-environment happy-dom
// Akce s řádky (≡), výběr šipkami a chyby u řádku v CNC editoru (13. 11. 2026).
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { moveLines, duplicateLines, deleteLines, selectLines, lineBlock } from '../js/calculators/cncLineTools.js';
import { errorsByLine } from '../js/calculators/cncErrMarks.js';
import { installUiDom } from './helpers/uiDom.mjs';

const V = 'A1\nB22\nC333';

describe('cncLineTools – čisté funkce', () => {
  it('blok řádků z výběru; výběr končící na začátku řádku ho nebere', () => {
    expect(lineBlock(V, 4, 4)).toEqual({ ls: 3, le: 6 });
    expect(lineBlock(V, 1, 7)).toEqual({ ls: 0, le: 6 });     // konec na začátku „C333"
    expect(lineBlock(V, 1, 8)).toEqual({ ls: 0, le: 11 });
  });
  it('posun nahoru / dolů i s kurzorem; na kraji null', () => {
    expect(moveLines(V, 4, 4, -1)).toEqual({ value: 'B22\nA1\nC333', s: 1, e: 1 });
    expect(moveLines(V, 4, 4, 1)).toEqual({ value: 'A1\nC333\nB22', s: 9, e: 9 });
    expect(moveLines(V, 0, 0, -1)).toBeNull();
    expect(moveLines(V, 9, 9, 1)).toBeNull();
    expect(moveLines(V, 0, 5, 1).value).toBe('C333\nA1\nB22');   // dva řádky naráz
  });
  it('kopie pod řádek, kurzor v kopii', () => {
    expect(duplicateLines(V, 4, 4)).toEqual({ value: 'A1\nB22\nB22\nC333', s: 8, e: 8 });
  });
  it('smazání řádku (i posledního a jediného)', () => {
    expect(deleteLines(V, 4, 4)).toEqual({ value: 'A1\nC333', s: 3, e: 3 });
    expect(deleteLines(V, 9, 9).value).toBe('A1\nB22');
    expect(deleteLines('X', 0, 0).value).toBe('');
  });
  it('označit celé řádky', () => {
    expect(selectLines(V, 4, 4)).toEqual({ value: V, s: 3, e: 6 });
  });
});

describe('cncErrMarks – chyby po řádcích', () => {
  it('první hláška na řádek, neplatné řádky pryč', () => {
    const m = errorsByLine([{ lineIndex: 2, msg: 'a' }, { lineIndex: 2, msg: 'b' }, { lineIndex: -1, msg: 'x' }, { msg: 'y' }]);
    expect([...m]).toEqual([[2, 'a']]);
  });
});

describe('CNC editor – ≡ řádek a výběr šipkami', () => {
  it('posun řádku dolů jde vzít zpět; Výběr šipkou ▼ označí text', async () => {
    installUiDom();
    const { openCncEditor } = await import('../js/calculators/cncEditor.js');
    document.querySelectorAll('.cne-layout').forEach(r => r.closest('body > *')?.remove());
    openCncEditor('G0 X0 Z0\nG1 Z-5\nG1 X10', { drawOnClose: true });
    const ed = [...document.querySelectorAll('[data-el="editor"]')].pop();
    const root = ed.closest('.cne-layout');
    const bar = root.querySelector('.cne-linebar');
    expect(bar.hidden).toBe(true);
    root.querySelector('[data-line-act="bar"]').click();
    expect(bar.hidden).toBe(false);
    ed.setSelectionRange(0, 0);
    root.querySelector('[data-line-act="down"]').click();
    expect(ed.value.startsWith('G1 Z-5\nG0 X0 Z0')).toBe(true);
    root.querySelector('[data-el="undoArrowBtn"]').click();
    expect(ed.value.startsWith('G0 X0 Z0\nG1 Z-5')).toBe(true);

    ed.setSelectionRange(0, 0);
    root.querySelector('[data-line-act="selmode"]').click();
    const down = root.querySelector('[data-caret="down"]');
    down.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    down.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect([ed.selectionStart, ed.selectionEnd]).toEqual([0, 9]);
    root.querySelector('[data-line-act="selmode"]').click();   // konec výběru → kurzor na konci
    expect([ed.selectionStart, ed.selectionEnd]).toEqual([9, 9]);
  });
});

describe('CNC editor – chyba u řádku', () => {
  it('po validaci má chybný řádek červený pruh a hlášku v nápovědě', async () => {
    installUiDom();
    const { openCncEditor } = await import('../js/calculators/cncEditor.js');
    document.querySelectorAll('.cne-layout').forEach(r => r.closest('body > *')?.remove());
    openCncEditor('G0 X0 Z0\nG1 Z-10\nG2 X40 Z-50 R1', { drawOnClose: true });
    const ed = [...document.querySelectorAll('[data-el="editor"]')].pop();
    const root = ed.closest('.cne-layout');
    await new Promise(r => setTimeout(r, 1000));          // validace běží se zpožděním 800 ms
    const marks = root.querySelectorAll('.cne-errmark');
    expect(marks.length).toBeGreaterThan(0);
    const cs = getComputedStyle(ed), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 20;
    const pad = parseFloat(getComputedStyle(ed).paddingTop) || 0;
    expect([...marks].map(m => parseFloat(m.style.top))).toContain(pad + 2 * lh);
    ed.setSelectionRange(ed.value.indexOf('G2'), ed.value.indexOf('G2'));
    ed.dispatchEvent(new Event('select'));
    await new Promise(r => setTimeout(r, 60));
    expect(root.querySelector('[data-el="hintText"]').innerHTML).toContain('⚠');
  });
});
