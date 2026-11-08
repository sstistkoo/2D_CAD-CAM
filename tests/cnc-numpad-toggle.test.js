// @vitest-environment happy-dom
// Tlačítko 123 v horní liště CNC editoru zapíná / vypíná číselník k písmenům os.
import { describe, it, expect } from 'vitest';
import { numpadOn, wireNumpadToggle } from '../js/calculators/cncNumpadToggle.js';

describe('wireNumpadToggle', () => {
  it('výchozí VYP, klik přepíná a pamatuje si stav', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button data-numpadtog>123</button>';
    document.body.appendChild(root);
    wireNumpadToggle(root);
    const b = root.querySelector('button');
    expect(numpadOn()).toBe(false);
    b.click();
    expect(numpadOn()).toBe(true);
    expect(b.classList.contains('active')).toBe(true);
    expect(localStorage.getItem('cne_numpadOn')).toBe('1');
    b.click();
    expect(numpadOn()).toBe(false);
  });
});
