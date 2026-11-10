// Přepočet G90 ↔ G91 (js/calculators/gcodeCoordConvert.js) – tlačítko G90/G91
// v CAM Editoru (compact: false) a CNC Editoru (compact: true). Do 10. 11. 2026
// měl každý editor vlastní kopii; nad 96 NC programy z fixtures a ručními
// případy dával modul totéž co obě kopie (kromě dělení nulou, viz níž).
import { describe, it, expect } from 'vitest';
import { codeToAbsolute, codeToIncremental, evalParam } from '../js/calculators/gcodeCoordConvert.js';

const ABS = 'G90\nG0 X50 Z2\nG1 Z-20 F0.2\nG1 X60 Z-25\nG0 X100 Z50\nM30';

describe('codeToIncremental', () => {
  it('nájezd v ose zůstane absolutní, navazující pohyby přírůstkově', () => {
    expect(codeToIncremental(ABS).split('\n')).toEqual([
      'G90', 'G90 G0 X50 Z2', 'G91 G1 Z-22 F0.2', 'G91 G1 X10 Z-5', 'G91 G0 X40 Z75', 'M30',
    ]);
  });

  it('compact (CNC Editor): G90/G91 jen při změně', () => {
    expect(codeToIncremental(ABS, new Map(), { compact: true }).split('\n')).toEqual([
      'G90', 'G0 X50 Z2', 'G91 G1 Z-22 F0.2', 'G1 X10 Z-5', 'G0 X40 Z75', 'M30',
    ]);
  });

  it('číslo bloku zůstane první', () => {
    expect(codeToIncremental('N10 G0 X10 Z0\nN20 G1 X12 Z-2')).toBe('N10 G90 G0 X10 Z0\nN20 G91 G1 X2 Z-2');
  });
});

describe('codeToAbsolute', () => {
  it.each([false, true])('zpětný převod vrátí původní souřadnice (compact %s)', (compact) => {
    const back = codeToAbsolute(codeToIncremental(ABS, new Map(), { compact }), new Map(), { compact });
    const coords = (s) => s.match(/[XZ]-?[\d.]+/g);
    expect(coords(back)).toEqual(coords(ABS));
    expect(back).not.toMatch(/G91/);
  });

  it('bez compact se každé G91 přepíše na G90, s compact se po G90 vypustí', () => {
    const inc = 'G90 G0 X10 Z5\nG91 G1 X2 Z-3';
    expect(codeToAbsolute(inc)).toBe('G90 G0 X10 Z5\nG90 G1 X12 Z2');
    expect(codeToAbsolute(inc, new Map(), { compact: true })).toBe('G90 G0 X10 Z5\nG1 X12 Z2');
  });

  it('G74/G75 (pevný bod) se nepřepočítává ani neposouvá polohu', () => {
    const inc = 'G90 G0 X10 Z0\nG75 X0 Z0\nG91 G1 X1 Z-1';
    expect(codeToAbsolute(inc).split('\n')).toEqual(['G90 G0 X10 Z0', 'G75 X0 Z0', 'G90 G1 X11 Z-1']);
  });
});

describe('R-parametry a výrazy', () => {
  it('R z editoru i přiřazení v kódu; vstupní Map se nemění', () => {
    const prm = new Map([['R1', 10]]);
    const out = codeToIncremental('R2=R1*2\nG0 X=R1 Z5\nG1 X=R2 Z(R1-15)', prm);
    expect(out.split('\n').slice(1)).toEqual(['G90 G0 X10 Z5', 'G91 G1 X10 Z-10']);
    expect([...prm.keys()]).toEqual(['R1']);
  });

  it('nevyhodnotitelná hodnota zůstane jako text (dřív dělení nulou zapsalo „XInfinity")', () => {
    expect(codeToAbsolute('G0 X10 Z0\nG1 X10/0 Z-5')).toBe('G0 X10 Z0\nG1 X10/0 Z-5');
    expect(codeToAbsolute('G0 X10 Z0\nG1 Xabc Z-5')).toBe('G0 X10 Z0\nG1 Xabc Z-5');
    expect(evalParam('1+', new Map())).toBeNaN();
    expect(evalParam('(2+3)*R4', new Map([['R4', 2]]))).toBe(10);
  });
});
