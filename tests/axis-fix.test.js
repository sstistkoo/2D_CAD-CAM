// Oprava u osy (dialogs/axisFix.js): konec čáry těsně vedle osy → na osu,
// pahýl, který tím zmizí → smazat, přesah osy polotovaru za roh → zkrátit.
// Výkres uživatele 2. 11. 2026 (skica_projekt_1): čelo kontury od X −0,301,
// čelo polotovaru do X 0,786, osa polotovaru do Z 268,76 s pahýlem 1,153.
import { describe, it, expect } from 'vitest';
import { findAxisFixes, applyAxisFixEdits, describeAxisFixes, axisFixKey } from '../js/dialogs/axisFix.js';

const L = (x1, y1, x2, y2, extra = {}) => ({ type: 'line', x1, y1, x2, y2, layer: 0, name: 'Úsečka', ...extra });
const S = (x1, y1, x2, y2) => L(x1, y1, x2, y2, { layer: 3, isStock: true, name: 'Polotovar úsečka' });
const LAYERS = [{ id: 0, name: 'Kontura' }, { id: 3, name: 'Polotovar' }, { id: 4, name: 'Čelo', isFace: true }];

function userDrawing() {
  return [
    L(255.149, -0.301407945342433, 255.149, 36.276),
    L(255.149, 36.276, 205.149, 36.276),
    L(205.149, 36.276, 205.149, 46.276),
    L(205.149, 46.276, 151.72314686377274, 55.69617073558313),
    { type: 'arc', cx: 148.25027221087225, cy: 36, r: 20, startAngle: 1.3962679151872013, endAngle: 1.5707963267948966, layer: 0 },
    L(148.25027221087225, 56, 0, 56),
    S(268.7608375139065, 0, 268.7608375139065, 1.1530067976118032),
    S(-9, 0, 268.7608375139065, 0),
    S(-9.000000000000028, 65, -9, 0),
    S(150.78737750510746, 65, -9.000000000000028, 65),
    S(214.149, 53.82793129267377, 150.78737750510746, 65),
    S(214.149, 45.276, 214.149, 53.82793129267377),
    S(263.06119184882795, 45.275999999999996, 214.149, 45.276),
    S(263.06119184882795, 0.7864002058296364, 263.06119184882795, 45.275999999999996),
    L(0, 56, 0, 0),
    { type: 'circle', layer: 4, cx: 390, cy: 46.28, r: 5 },   // díra v bokorysu — nevadí
  ];
}
const opts = { layers: LAYERS, machineType: 'soustruh' };

describe('oprava u osy — výkres uživatele', () => {
  it('najde čelo pod osou, čelo polotovaru nad osou, pahýl a přesah', () => {
    const objs = userDrawing();
    const f = findAxisFixes(objs, opts);
    const got = f.items.map(it => [it.group, it.kind, +it.amount.toFixed(3)]);
    expect(got).toEqual(expect.arrayContaining([
      ['kontura', 'snap', -0.301],
      ['polotovar', 'stub', 1.153],
      ['polotovar', 'snap', 0.786],
      ['polotovar', 'trim', 5.7],
    ]));
    expect(got).toHaveLength(4);
    expect(describeAxisFixes(f)).toContain('0,301 mm pod osou');
    // Nic se nezměnilo, dokud se oprava nepotvrdí.
    expect(objs[0].y1).toBeCloseTo(-0.3014, 4);
  });

  it('po opravě sedí čela na ose, pahýl je pryč a osa polotovaru končí v rohu', () => {
    const objs = userDrawing();
    const f = findAxisFixes(objs, opts);
    const del = applyAxisFixEdits(f);
    expect(del).toEqual([objs[6]]);
    expect(objs[0]).toMatchObject({ y1: 0, x1: 255.149, y2: 36.276 });
    expect(objs[13]).toMatchObject({ y1: 0, x1: 263.06119184882795 });
    expect(objs[7].x2).toBeCloseTo(263.0612, 4);
    expect(objs[7].y2).toBe(0);
    // Podruhé už není co opravit.
    const rest = objs.filter(o => !del.includes(o));
    expect(findAxisFixes(rest, opts).items).toEqual([]);
  });

  it('otisk plánu je stabilní (odmítnutý plán se nenabízí znovu)', () => {
    expect(axisFixKey(findAxisFixes(userDrawing(), opts))).toBe(axisFixKey(findAxisFixes(userDrawing(), opts)));
  });
});

describe('oprava u osy — co se nehlásí', () => {
  it('konec přesně na ose, dál než 2 mm od osy, nebo napojený konec', () => {
    const objs = [L(50, 0, 50, 20), L(50, 20, 0, 20), L(0, 20, 0, 2.5)];
    expect(findAxisFixes(objs, opts).items).toEqual([]);
  });
  it('vodorovná úsečka u osy se posune celá i s navazující čarou', () => {
    const objs = [L(0, 0.4, 30, 0.4), L(30, 0.4, 30, 20)];
    const f = findAxisFixes(objs, opts);
    applyAxisFixEdits(f);
    expect(objs[0]).toMatchObject({ y1: 0, y2: 0 });
    expect(objs[1]).toMatchObject({ y1: 0, y2: 20 });
  });
  it('vodorovná úsečka u osy navazující na oblouk se neopravuje', () => {
    const arc = { type: 'arc', cx: 30, cy: 10.4, r: 10, startAngle: -Math.PI / 2, endAngle: 0, layer: 0 };
    expect(findAxisFixes([L(0, 0.4, 30, 0.4), arc], opts).items).toEqual([]);
  });
  it('karusel: osa rotace je svislá (poloměr v x)', () => {
    const objs = [L(-0.2, 100, 30, 100), L(30, 100, 30, 0)];
    const f = findAxisFixes(objs, { layers: LAYERS, machineType: 'karusel' });
    expect(f.items.map(it => it.kind)).toEqual(['snap']);
    applyAxisFixEdits(f);
    expect(objs[0].x1).toBe(0);
  });
});
