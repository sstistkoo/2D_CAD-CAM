// @vitest-environment happy-dom
// CNC kód v pravém panelu: podklad řádku s kurzorem, Enter v poznámce, klik pod text.
import { describe, it, expect } from 'vitest';

describe('cncOutputTools', () => {
  it('podklad na řádku s kurzorem a přepočet po přepsání kódu', async () => {
    document.body.innerHTML = '<textarea id="cncOutput" style="line-height:20px;padding-top:0"></textarea>';
    const { wireOutputCurLine } = await import('../js/cncOutputTools.js');
    const ta = document.createElement('textarea');
    ta.style.lineHeight = '20px';
    document.body.appendChild(ta);
    const update = wireOutputCurLine(ta);
    ta.value = 'G0 X0\nG1 Z-10 ; poznámka\nG1 X50';
    ta.selectionStart = ta.selectionEnd = ta.value.indexOf('X50');
    update();
    expect(ta.style.backgroundPosition).toContain('40px');
    expect(document.getElementById('cncOutput').dataset.cncTools).toBe('1');
  });
});
