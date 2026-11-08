// @vitest-environment happy-dom
// Klik pod poslední řádek v CNC editoru → kurzor na konec + nový řádek.
import { describe, it, expect } from 'vitest';
import { wireTapBelow } from '../js/calculators/cncTapBelow.js';

function setup(value) {
  const ta = document.createElement('textarea');
  ta.style.lineHeight = '20px'; ta.style.paddingTop = '10px';
  ta.value = value;
  document.body.appendChild(ta);
  ta.getBoundingClientRect = () => ({ top: 0, left: 0, right: 300, bottom: 300, width: 300, height: 300 });
  let n = 0;
  wireTapBelow(ta, () => { n++; ta.value += '\n'; });
  const click = y => ta.dispatchEvent(new MouseEvent('click', { clientY: y, bubbles: true }));
  return { ta, click, count: () => n };
}

describe('wireTapBelow', () => {
  it('klik pod textem → konec + nový řádek', () => {
    const { ta, click, count } = setup('G90 ; poznámka\nG1 X10 ; dlouhá poznámka');
    ta.selectionStart = ta.selectionEnd = 0;
    click(200);
    expect(count()).toBe(1);
    expect(ta.value.endsWith('\n')).toBe(true);
  });
  it('klik na řádek s textem → nic nepřidá', () => {
    const { click, count } = setup('G90\nG1 X10');
    click(25);
    expect(count()).toBe(0);
  });
  it('poslední řádek už prázdný → jen kurzor na konec', () => {
    const { ta, click, count } = setup('G90\n');
    ta.selectionStart = ta.selectionEnd = 0;
    click(200);
    expect(count()).toBe(0);
    expect(ta.selectionStart).toBe(ta.value.length);
  });
});
