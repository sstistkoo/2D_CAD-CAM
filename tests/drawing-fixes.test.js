// Kontrola výkresu (dialogs/drawingFixes.js): mezery, konec u čáry (T),
// skoro vodorovné / svislé úsečky — jen jednoznačné opravy, kontura
// a polotovar zvlášť. Uživatel 2. 11. 2026: „tuning proti chybám
// s automatickou opravou … s možností to zaškrtnout".
import { describe, it, expect } from 'vitest';
import { findDrawingFixes } from '../js/dialogs/drawingFixes.js';
import { applyFixItems } from '../js/dialogs/fixShared.js';

const L = (x1, y1, x2, y2, extra = {}) => ({ type: 'line', x1, y1, x2, y2, layer: 0, name: 'Úsečka', ...extra });
const S = (x1, y1, x2, y2) => L(x1, y1, x2, y2, { layer: 3, isStock: true, name: 'Polotovar úsečka' });
const opts = { layers: [{ id: 0 }, { id: 3 }], machineType: 'soustruh' };
const kinds = (objs) => findDrawingFixes(objs, opts).map(it => it.kind);

// Čistý profil: čelo Z100 od osy do r20, ⌀40 do Z50, schod na r30, ⌀60 do Z0, k ose.
const clean = () => [L(100, 0, 100, 20), L(100, 20, 50, 20), L(50, 20, 50, 30), L(50, 30, 0, 30), L(0, 30, 0, 0)];

describe('kontrola výkresu', () => {
  it('čistý výkres — nic', () => {
    expect(kinds(clean())).toEqual([]);
  });

  it('mezera v rohu se spojí do průsečíku prodloužených úseček', () => {
    const o = clean();
    o[1].x2 = 50.2;              // vodorovná končí 0,2 mm před svislou
    o[2].y1 = 20.1;              // a svislá 0,1 mm nad ní
    const items = findDrawingFixes(o, opts);
    expect(items.map(it => it.kind)).toEqual(['gap']);
    expect(items[0].label).toMatch(/mezera 0,224 mm/);
    applyFixItems(items);
    expect(o[1]).toMatchObject({ x2: 50, y2: 20 });
    expect(o[2]).toMatchObject({ x1: 50, y1: 20 });
    expect(kinds(o)).toEqual([]);
  });

  it('mezera u oblouku: úsečka se přitáhne na konec oblouku, oblouk se nemění', () => {
    const arc = { type: 'arc', cx: 50, cy: 20, r: 10, startAngle: 0, endAngle: Math.PI / 2, layer: 0 };
    const o = [L(100, 0, 100, 20), L(100, 20, 60.3, 20), arc, L(50, 30, 0, 30), L(0, 30, 0, 0)];
    const items = findDrawingFixes(o, opts);
    expect(items.map(it => it.kind)).toEqual(['gap']);
    applyFixItems(items);
    expect(o[1].x2).toBeCloseTo(60, 9);
    expect(o[1].y2).toBeCloseTo(20, 9);
    expect(arc.r).toBe(10);
  });

  it('konec těsně před čarou (T) se prodlouží, přes čáru se zkrátí', () => {
    // svislá čára schodu Z50 vede r15→r35, vodorovné na ni nedosahují / přesahují
    const o = [L(100, 0, 100, 20), L(100, 20, 50.3, 20), L(50, 15, 50, 35), L(50.3, 30, 0, 30), L(0, 30, 0, 0)];
    const items = findDrawingFixes(o, opts);
    expect(items.map(it => it.kind).sort()).toEqual(['extend', 'trimTee']);
    applyFixItems(items);
    expect(o[1].x2).toBeCloseTo(50, 9);
    expect(o[3].x1).toBeCloseTo(50, 9);
  });

  it('skoro svislá úsečka se narovná; posune se „méně kulatý" konec i s navazující čarou', () => {
    const o = clean();
    o[0].x1 = 100; o[0].x2 = 100.03; o[1].x1 = 100.03;   // čelo Z100 → 100,03 nahoře
    const items = findDrawingFixes(o, opts);
    expect(items.map(it => it.kind)).toEqual(['straighten']);
    expect(items[0].label).toMatch(/skoro svislá čára \(odchylka 0,03 mm v Z\)/);
    applyFixItems(items);
    expect(o[0].x2).toBe(100);
    expect(o[1].x1).toBe(100);
    expect(kinds(o)).toEqual([]);
  });

  it('mikron na řetězu rovných úseček se nepřenáší dál: srovná se celý řetěz až k oblouku / šikmé čáře', () => {
    // polotovar: 149,544→167,259 (o 0,001 šikmá) → 196,278 vodorovně → svisle
    const o = [S(149.544, 16.743, 167.259, 16.744), S(167.259, 16.744, 196.278, 16.744), S(196.278, 16.744, 196.278, 40)];
    const items = findDrawingFixes(o, opts);
    expect(items.map(it => it.kind)).toEqual(['straighten']);
    applyFixItems(items);
    expect(o.map(l => [l.y1, l.y2])).toEqual([[16.743, 16.743], [16.743, 16.743], [16.743, 40]]);
    expect(findDrawingFixes(o, opts)).toEqual([]);
  });

  it('krátká úsečka a velká odchylka se nerovnají (může být záměr)', () => {
    const o = clean();
    o[2].x2 = 50.04;  o[3].x1 = 50.04;                     // schod jen 10 mm, 0,04 mm — rovná se
    expect(kinds(o)).toEqual(['straighten']);
    const k = clean();
    k[2].x2 = 50.2; k[3].x1 = 50.2;                        // 0,2 mm = kužel, ne chyba
    expect(kinds(k)).toEqual([]);
  });

  it('kontura a polotovar se navzájem nespojují', () => {
    const o = [...clean(), S(100.3, 0, 100.3, 25), S(100.3, 25, -5, 25)];
    expect(findDrawingFixes(o, opts).filter(it => it.group === 'kontura')).toEqual([]);
  });

  it('dvě volné konce na ose se nespojují (osa tvar uzavírá)', () => {
    const o = [L(100, 0, 100, 20), L(100, 20, 0.3, 20), L(0, 20, 0, 0), L(0.3, 0, 99.8, 0)];
    expect(findDrawingFixes(o, opts).some(it => it.kind === 'gap' && it.at.includes('X0 '))).toBe(false);
  });
});
