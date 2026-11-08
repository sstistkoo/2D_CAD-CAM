// @vitest-environment happy-dom
// Podklad pod řádkem s kurzorem v CNC editoru.
import { describe, it, expect } from 'vitest';
import { wireCurrentLine } from '../js/calculators/cncCurLine.js';

describe('wireCurrentLine', () => {
  it('pruh je na řádku s kurzorem', () => {
    const ed = document.createElement('textarea');
    ed.style.lineHeight = '20px'; ed.style.paddingTop = '10px';
    const bd = document.createElement('div');
    document.body.append(ed, bd);
    ed.value = 'G90\nG1 X10\nG1 Z5';
    const update = wireCurrentLine(ed, bd);
    ed.selectionStart = ed.selectionEnd = ed.value.indexOf('Z5');
    update();
    const bar = bd.querySelector('.cne-curline');
    expect(bar.style.top).toBe('50px');
    expect(bar.style.height).toBe('20px');
  });
});
