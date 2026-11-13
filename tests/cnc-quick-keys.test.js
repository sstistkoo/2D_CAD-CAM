import { describe, it, expect } from 'vitest';
import { moveCaret, activeCoordG } from '../js/calculators/cncQuickKeys.js';
import { caretInStock, bareMarkerRemoval, normalizeStockMarkers, toggleStock, STOCK_START_LINE as S1, STOCK_END_LINE as E1 } from '../js/calculators/cncStockMarkers.js';

describe('cncQuickKeys – šipky kurzoru', () => {
  const v = 'G0 X10\nG1\nG1 Z-20.5';   // řádky: 0–6, 7–9, 10–19
  it('vlevo / vpravo o znak, na krajích se zastaví', () => {
    expect(moveCaret(v, 0, 'left').pos).toBe(0);
    expect(moveCaret(v, 3, 'left').pos).toBe(2);
    expect(moveCaret(v, 3, 'right').pos).toBe(4);
    expect(moveCaret(v, v.length, 'right').pos).toBe(v.length);
  });
  it('začátek / konec řádku', () => {
    expect(moveCaret(v, 13, 'home').pos).toBe(10);
    expect(moveCaret(v, 13, 'end').pos).toBe(v.length);
    expect(moveCaret(v, 2, 'end').pos).toBe(6);
  });
  it('nahoru / dolů drží sloupec přes krátký řádek', () => {
    let r = moveCaret(v, 15, 'up');          // sloupec 5 → krátký řádek „G1" → jeho konec
    expect(r.pos).toBe(9);
    r = moveCaret(v, r.pos, 'up', r.goal);    // dál nahoru → sloupec 5 v prvním řádku
    expect(r.pos).toBe(5);
    r = moveCaret(v, r.pos, 'down', r.goal);
    r = moveCaret(v, r.pos, 'down', r.goal);
    expect(r.pos).toBe(15);
  });
  it('nahoru z prvního řádku → začátek, dolů z posledního → konec', () => {
    expect(moveCaret(v, 4, 'up').pos).toBe(0);
    expect(moveCaret(v, 12, 'down').pos).toBe(v.length);
  });
});

describe('cncQuickKeys – G90/G91 a kontura/polotovar', () => {
  it('platný režim je poslední G90/G91 do konce řádku, poznámky se nepočítají', () => {
    const v = 'G0 X0 Z0\nG91 X5\nG1 Z-5 ; G90 jen v poznámce\nG90 X20';
    expect(activeCoordG(v, 3)).toBe('G90');
    expect(activeCoordG(v, 10)).toBe('G91');
    expect(activeCoordG(v, v.indexOf('Z-5'))).toBe('G91');
    expect(activeCoordG(v, v.length)).toBe('G90');
  });
  it('polotovar mezi STOCK_START a STOCK_END', () => {
    const v = 'G0 X0\n; STOCK_START\nG1 X5\n; STOCK_END\nG1 X9';
    expect(caretInStock(v, 3)).toBe(false);
    expect(caretInStock(v, v.indexOf('X5'))).toBe(true);
    expect(caretInStock(v, v.length)).toBe(false);
  });
});

describe('cncQuickKeys – přepnutí hned za značkou ji zruší (bez spamu)', () => {
  const S = '; STOCK_START — polotovar (isStock objekty)';
  it('kurzor na řádku za značkou → značka pryč, kód pod ní zůstane', () => {
    const v = `G0 X0\n${S}\nG1 X5`;
    const r = bareMarkerRemoval(v, v.indexOf('G1'));
    expect(r.value).toBe('G0 X0\nG1 X5');
    expect(r.caret).toBe(6);
  });
  it('značka na posledním řádku (i s prázdným řádkem za ní)', () => {
    expect(bareMarkerRemoval(`G0 X0\n${S}`, 6 + S.length).value).toBe('G0 X0');
    const v = `G0 X0\n; STOCK_END\n\n`;
    expect(bareMarkerRemoval(v, v.length).value).toBe('G0 X0\n\n');
  });
  it('za značkou už je kód → nic se neruší (vloží se nová značka)', () => {
    const v = `${S}\nG1 X5\n`;
    expect(bareMarkerRemoval(v, v.length)).toBeNull();
    expect(bareMarkerRemoval('G1 X5', 5)).toBeNull();
  });
});

describe('cncStockMarkers – párování značek (bez dvou STOCK_END pod sebou)', () => {
  it('osiřelý STOCK_END ze snímku uživatele se uklidí', () => {
    const v = '; STOCK_START\nG1 X5\n; STOCK_END\nX0\nZ0\n; STOCK_END\n; P1';
    expect(normalizeStockMarkers(v, 0).value).toBe('; STOCK_START\nG1 X5\n; STOCK_END\nX0\nZ0\n; P1');
  });
  it('spam E S E S … bez kódu se slije, kurzor zůstane na kódu', () => {
    const v = '; STOCK_START\nG1 X5\n; STOCK_END\n; STOCK_START\n; STOCK_END\n; STOCK_START\nG0 Z9';
    const r = normalizeStockMarkers(v, v.indexOf('G0'));
    expect(r.value).toBe('; STOCK_START\nG1 X5\nG0 Z9');
    expect(r.value.slice(r.caret)).toBe('G0 Z9');
  });
  it('K uprostřed polotovaru vloží dvojici – kód pod kurzorem zůstane polotovarem', () => {
    const v = '; STOCK_START\nG1 X5\nG1 Z5\n; STOCK_END';
    const r = toggleStock(v, v.indexOf('G1 Z5'));
    expect(r.value).toBe(`; STOCK_START\nG1 X5\n${E1}\n\n${S1}\nG1 Z5\n; STOCK_END`);
    expect(caretInStock(r.value, r.caret)).toBe(false);
    expect(caretInStock(r.value, r.value.indexOf('G1 Z5'))).toBe(true);
  });
  it('K na konci polotovaru vloží jen konec; druhý klik ho zase zruší', () => {
    const v = '; STOCK_START\nG1 X5\n';
    const r = toggleStock(v, v.length);
    expect(r.value).toBe(`; STOCK_START\nG1 X5\n${E1}\n`);
    expect(toggleStock(r.value, r.caret).value).toBe(v);
  });
  it('P a hned K uprostřed kontury vrátí text beze změny', () => {
    const v = 'G0 X0\nG1 Z5';
    const r = toggleStock(v, 6);
    expect(r.value).toBe(`G0 X0\n${S1}\n\n${E1}\nG1 Z5`);
    expect(toggleStock(r.value, r.caret).value).toBe(v);
  });
  it('P těsně nad polotovarem jen posune jeho začátek (bez druhého STOCK_START)', () => {
    const v = 'G1 X5\n\n; STOCK_START\nG1 X9';
    const r = toggleStock(v, 6);
    expect(r.value.match(/STOCK_START/g)).toHaveLength(1);
    expect(caretInStock(r.value, r.caret)).toBe(true);
  });
});
