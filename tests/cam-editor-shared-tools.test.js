// @vitest-environment happy-dom
// CAM editor převzal úpravy kreslicího editoru (8. 11. 2026).
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

describe('CAM editor – sdílené úpravy', () => {
  it('nový číselník, 123, ;👁, písmeno osy bez číselníku, podklad řádku', async () => {
    installUiDom();
    const { openCamEditor } = await import('../js/calculators/camEditor.js');
    openCamEditor('G0 X10 Z0 ; start\nG1 Z-20');
    const ov = document.querySelector('.calc-overlay[data-type="cam-editor"]') || document.body;
    expect(ov.querySelector('.cnp-grid')).toBeTruthy();
    expect(ov.querySelector('[data-numpadtog]')).toBeTruthy();
    expect(ov.querySelector('[data-hidecom]')).toBeTruthy();
    expect(ov.querySelector('.cne-curline')).toBeTruthy();
    const ed = ov.querySelector('[data-el="editor"]');
    ed.focus();
    ed.selectionStart = ed.selectionEnd = ed.value.length;
    ov.querySelector('.cne-quickbar [data-inp="X"]').click();
    expect(ed.value.endsWith(' X')).toBe(true);
    expect(ov.querySelector('[data-el="numModal"]').style.display).toBe('none');
  });
});
