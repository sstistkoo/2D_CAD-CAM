import { describe, it, expect } from 'vitest';
import { prepCalcExpr, evalCalcExpr } from '../js/calcPrep.js';

describe('výraz kalkulačky (jako v Boně)', () => {
  it('domyšlené ×, závorky, %, znaky', () => {
    expect(evalCalcExpr('2π')).toBeCloseTo(2 * Math.PI, 12);
    expect(evalCalcExpr('3(2)')).toBe(6);
    expect(evalCalcExpr('(1+1)(2)')).toBe(4);
    expect(evalCalcExpr('2sqrt(9')).toBe(6);
    expect(evalCalcExpr('50%')).toBe(0.5);
    expect(evalCalcExpr('200×10%')).toBe(20);
    expect(evalCalcExpr('200+10%')).toBeCloseTo(220, 9);
    expect(evalCalcExpr('200−10%')).toBeCloseTo(180, 9);
    expect(evalCalcExpr('200÷10%')).toBeCloseTo(2000, 9);
    expect(evalCalcExpr('3×(200+10%)')).toBeCloseTo(660, 9);
    expect(evalCalcExpr('5×-10%')).toBeCloseTo(-0.5, 9);
    expect(evalCalcExpr('8÷2−1')).toBe(3);
    expect(evalCalcExpr('1,5*2')).toBe(3);
    expect(evalCalcExpr('2^10')).toBe(1024);
    expect(evalCalcExpr('sin(30)*2')).toBeCloseTo(1, 12);
    expect(evalCalcExpr('1e+3+1')).toBe(1001);
    expect(evalCalcExpr('')).toBe(null);
    expect(evalCalcExpr('2+')).toBe(null);
    expect(prepCalcExpr('2asin(1')).toBe('2*asin(1)');
  });
});
