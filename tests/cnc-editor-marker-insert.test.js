// @vitest-environment happy-dom
// Kód psaný tlačítky na řádku se značkou KONTURA_START nesmí skončit na stejném řádku.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

describe('CNC editor – řádek se značkou kontury', () => {
  it('kurzor na konci značky → kód na nový řádek pod ni; na začátku → nad ni', async () => {
    installUiDom();
    const { openCncEditor } = await import('../js/calculators/cncEditor.js');
    openCncEditor('G90\n; KONTURA_START — kontura', { drawOnClose: true });
    const ed = [...document.querySelectorAll('[data-el="editor"]')].pop();
    const root = ed.closest('.cne-layout');
    ed.focus();
    ed.selectionStart = ed.selectionEnd = ed.value.length;
    root.querySelector('.cne-quickbar [data-ins="G0 "]').click();
    expect(ed.value).toBe('G90\n; KONTURA_START — kontura\nG0 ');
    // Písmeno osy (123 VYP) za značkou → bez mezery na začátku nového řádku.
    ed.value = 'G90\n; KONTURA_START'; ed.selectionStart = ed.selectionEnd = ed.value.length;
    root.querySelector('.cne-quickbar [data-inp="Z"]').click();
    expect(ed.value).toBe('G90\n; KONTURA_START\nZ');
    ed.value = 'G90\n; KONTURA_START — kontura';
    const ms = ed.value.indexOf(';');
    ed.selectionStart = ed.selectionEnd = ms;
    root.querySelector('.cne-quickbar [data-ins="G1 "]').click();
    expect(ed.value.split('\n')[1]).toBe('G1 ');
    expect(ed.value.split('\n')[2]).toBe('; KONTURA_START — kontura');
  });
});
