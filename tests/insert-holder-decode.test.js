import { describe, it, expect } from 'vitest';
import { parseHolderCode } from '../js/calculators/insert.js';
import { HOLDER_STYLES, holderStyleByCode, suggestL1 } from '../js/calculators/holderIsoData.js';

describe('parseHolderCode (ISO 5608)', () => {
  it('rozloží běžný kód PCLNR2525 na 7 pozic', () => {
    const r = parseHolderCode('PCLNR2525');
    expect(r).toEqual({ 1: 'P', 2: 'C', 3: 'L', 4: 'N', 5: 'R', 6: '25', 7: '25' });
  });

  it('toleruje mezery a pomlčky', () => {
    const r = parseHolderCode('P-C L N R-2525');
    expect(r).toEqual({ 1: 'P', 2: 'C', 3: 'L', 4: 'N', 5: 'R', 6: '25', 7: '25' });
  });

  it('vrátí prázdné pozice ("-") pro chybějící/kratší vstup', () => {
    const r = parseHolderCode('PCLN');
    expect(r).toEqual({ 1: '-', 2: '-', 3: '-', 4: '-', 5: '-', 6: '-', 7: '-' });
  });

  it('dopočítá jen dostupné pozice u částečného kódu', () => {
    const r = parseHolderCode('PCLNR');
    expect(r).toEqual({ 1: 'P', 2: 'C', 3: 'L', 4: 'N', 5: 'R', 6: '-', 7: '-' });
  });

  it('ignoruje malá/velká písmena', () => {
    const r = parseHolderCode('pclnr2020');
    expect(r[1]).toBe('P');
    expect(r[6]).toBe('20');
  });
});

describe('holderIsoData', () => {
  it('obsahuje κr pro každý styl A-W a je vyhledatelné podle kódu', () => {
    expect(HOLDER_STYLES.length).toBeGreaterThan(0);
    for (const s of HOLDER_STYLES) {
      expect(typeof s.kappa).toBe('number');
      expect(holderStyleByCode(s.code)).toEqual(s);
    }
    expect(holderStyleByCode('Z')).toBeNull();
  });

  it('suggestL1 vrátí nejbližší hodnotu z typické řady', () => {
    expect(suggestL1(25)).toBe(150);
    expect(suggestL1(22)).toBe(125);
    expect(suggestL1(null)).toBeNull();
  });
});
