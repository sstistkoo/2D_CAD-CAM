import { describe, it, expect } from 'vitest';
import { parseVbdCode, sizeInfo, describePosition, holdersFor, CLEARANCE_DEG, THICKNESS_MM } from '../js/calculators/vbdIso.js';

describe('ISO 1832 – rozpis kódu', () => {
  it('CNMG120408-PM: přípona výrobce není pozice 8/9', () => {
    const r = parseVbdCode('CNMG120408-PM');
    expect([r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9]]).toEqual(['C', 'N', 'M', 'G', '12', '04', '08', '-', '-']);
    expect(r.suffix).toBe('PM');
  });
  it('SCMT09T308 (tloušťka T3), TPGN160304FR (poz. 8 a 9)', () => {
    expect(parseVbdCode('SCMT 09T308')[6]).toBe('T3');
    const t = parseVbdCode('TPGN160304FR');
    expect([t[8], t[9], t.suffix]).toEqual(['F', 'R', '']);
  });
});

describe('velikost: kód = délka břitu, IC podle tvaru', () => {
  it.each([
    ['C', '12', 12.7, 12.9], ['C', '09', 9.525, 9.67], ['C', '06', 6.35, 6.45],
    ['D', '15', 12.7, 15.5], ['D', '11', 9.525, 11.63], ['D', '07', 6.35, 7.75],
    ['V', '16', 9.525, 16.61], ['V', '11', 6.35, 11.07], ['V', '22', 12.7, 22.14],
    ['T', '16', 9.525, 16.5], ['T', '22', 12.7, 22], ['T', '11', 6.35, 11],
    ['S', '09', 9.525, 9.53], ['S', '12', 12.7, 12.7], ['W', '08', 12.7, 8.69], ['W', '06', 9.525, 6.52],
  ])('%s %s → IC %s, břit %s', (shape, code, ic, edge) => {
    const s = sizeInfo(shape, code);
    expect(s.ic).toBe(ic);
    expect(s.edge).toBeCloseTo(edge, 1);
  });
  it('kulatá: kód = průměr', () => expect(sizeInfo('R', '10')).toEqual({ diameter: 10 }));
});

describe('popisy pozic', () => {
  it('tloušťka 04 = 4,76, T3 = 3,97; úhel C = 7°, A = 3°, D = 15°', () => {
    expect(THICKNESS_MM['04']).toBe(4.76);
    expect(describePosition(6, 'T3')).toBe('3,97 mm');
    expect(CLEARANCE_DEG).toMatchObject({ C: 7, A: 3, D: 15, F: 25, N: 0, P: 11 });
  });
  it('typ G = utvařeč na obou stranách, T = zahloubení 40–60° a utvařeč na 1 straně', () => {
    expect(describePosition(4, 'G')).toMatch(/obou stranách/);
    expect(describePosition(4, 'T')).toMatch(/40–60°.*1 straně/);
    expect(describePosition(3, 'M')).toMatch(/s ±0,13/);
  });
});

describe('doporučené držáky', () => {
  it('CNMG → P/D/M CLN, CCMT → SCLC, VBMT → SVJB + SVVBN, DNMG → PDJN', () => {
    expect(holdersFor('C', 'N', 'G')).toMatch(/^PCLNR\/L, DCLNR\/L, MCLNR\/L/);
    expect(holdersFor('C', 'C', 'T')).toBe('SCLCR/L');
    expect(holdersFor('V', 'B', 'T')).toBe('SVJBR/L, SVVBN');
    expect(holdersFor('D', 'N', 'G')).toMatch(/PDJNR\/L/);
  });
});
