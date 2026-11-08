// @vitest-environment happy-dom
// Klepnutí prstem na tlačítka editoru nesmí přesunout fokus (klávesnice telefonu).
import { describe, it, expect } from 'vitest';
import { wireNoKeyboard } from '../js/calculators/cncNoKeyboard.js';

const tap = (el, pointerType = 'touch') => {
  const e = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType });
  el.dispatchEvent(e);
  return e.defaultPrevented;
};

describe('wireNoKeyboard', () => {
  it('tlačítka ano, pole pro psaní a myš ne', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button data-hidecom>;👁</button><input class="x"><input readonly class="ro"><textarea></textarea>';
    document.body.appendChild(root);
    wireNoKeyboard(root, root.querySelector('textarea'));
    expect(tap(root.querySelector('button'))).toBe(true);
    expect(tap(root.querySelector('button'), 'mouse')).toBe(false);
    expect(tap(root.querySelector('.x'))).toBe(false);
    expect(tap(root.querySelector('textarea'))).toBe(false);
    expect(root.querySelector('.ro').getAttribute('inputmode')).toBe('none');
  });
});
