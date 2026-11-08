// Číselník CNC editoru s kalkulačkou: výraz se při OK spočítá.
import { describe, it, expect } from 'vitest';
import { numpadResult, numpadKey, numpadHTML } from '../js/calculators/cncNumpadCalc.js';

describe('numpadResult', () => {
  it('číslo beze změny', () => {
    expect(numpadResult('50')).toBe('50');
    expect(numpadResult('−12.5')).toBe('-12.5');
    expect(numpadResult('')).toBe('');
  });
  it('výraz → výsledek', () => {
    expect(numpadResult('100÷2+5')).toBe('55');
    expect(numpadResult('(20+5)×2')).toBe('50');
    expect(numpadResult('10÷3')).toBe('3.3333');
    expect(numpadResult('5−5')).toBe('0');
  });
  it('neplatný výraz → null', () => {
    expect(numpadResult('(5+')).toBe(null);
    expect(numpadResult('5÷0')).toBe(null);
  });
});
describe('numpadKey / HTML', () => {
  it('C, ⌫ a znaky', () => {
    expect(numpadKey('12+', '3')).toBe('12+3');
    expect(numpadKey('12+', '⌫')).toBe('12');
    expect(numpadKey('12+', 'C')).toBe('');
  });
  it('okno má + i − zvlášť, × ÷ a OK', () => {
    const h = numpadHTML();
    for (const k of ['+', '−', '×', '÷', '⌫', 'C']) expect(h).toContain(`data-nk="${k}"`);
    expect(h).toContain('data-act="numOk"');
    expect(h).toContain('data-el="numInput"');
  });
});
