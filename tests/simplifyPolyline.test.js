// Pokrývá utility simplifyPolyline() v js/utils.js.
// Funkce odstraňuje kolineární vrcholy mezi dvěma úsečkami; konzervativně
// zachovává vrcholy s libovolným nenulovým bulge a krajní vrcholy
// neuzavřené polyliny.

import { describe, it, expect } from 'vitest';
import { simplifyPolyline } from '../js/utils.js';

const poly = (verts, bulges, closed = true) => ({
  vertices: verts.map(([x, y]) => ({ x, y })),
  bulges: bulges || verts.map(() => 0),
  closed,
});

describe('simplifyPolyline – základní chování', () => {
  it('vrátí kopii pro polylinu se < 3 vrcholy (nemodifikuje vstup)', () => {
    const p = poly([[0, 0], [10, 0]]);
    const out = simplifyPolyline(p);
    expect(out.vertices).toHaveLength(2);
    expect(out.vertices).not.toBe(p.vertices); // alespoň nové pole
    expect(out.vertices).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  });

  it('odebere kolineární vrchol uprostřed úsečky (otevřená)', () => {
    const out = simplifyPolyline(poly([[0, 0], [5, 0], [10, 0]], [0, 0, 0], false));
    expect(out.vertices).toHaveLength(2);
    expect(out.vertices).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  });

  it('zachová roh – nejde o kolineární', () => {
    const out = simplifyPolyline(poly([[0, 0], [10, 0], [10, 10]], [0, 0, 0], false));
    expect(out.vertices).toHaveLength(3);
  });

  it('odebere řetězec kolineárních vrcholů (až do stabilního stavu)', () => {
    const out = simplifyPolyline(poly([[0, 0], [2, 0], [4, 0], [6, 0], [10, 0]], null, false));
    expect(out.vertices).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  });
});

describe('simplifyPolyline – zachování oblouků', () => {
  it('zachová vrchol s odchozím bulge != 0', () => {
    // 3 vrcholy na přímce, ale vrchol 1→2 má bulge (oblouk)
    const out = simplifyPolyline(poly([[0, 0], [5, 0], [10, 0]], [0, 0.5, 0], false));
    expect(out.vertices).toHaveLength(3); // střední vrchol je „začátek oblouku"
  });

  it('zachová vrchol s incoming bulge != 0', () => {
    const out = simplifyPolyline(poly([[0, 0], [5, 0], [10, 0]], [0.5, 0, 0], false));
    expect(out.vertices).toHaveLength(3); // střední vrchol je „konec oblouku"
  });
});

describe('simplifyPolyline – uzavřená polylina', () => {
  it('odebere kolineární vrchol u uzavřeného rectu se zdvojenou hranou', () => {
    // union dvou sousedních rectů (0,0-10,10) + (10,0-20,10) vyrobí
    // 6-vrcholou polylinu s kolineárními body (10,0) a (10,10).
    const out = simplifyPolyline(poly([
      [0, 0], [10, 0], [20, 0], [20, 10], [10, 10], [0, 10],
    ]));
    expect(out.vertices).toHaveLength(4);
    expect(out.closed).toBe(true);
    expect(out.vertices).toEqual([
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 },
    ]);
  });

  it('zachová počáteční vrchol uzavřeného polygonu, pokud je rohem', () => {
    // čtverec s rohem v (0,0) — ne kolineární s předchozím (0,10) a následujícím (10,0)
    const out = simplifyPolyline(poly([
      [0, 0], [10, 0], [10, 10], [0, 10],
    ]));
    expect(out.vertices).toHaveLength(4);
  });

  it('odebere kolineární počáteční vrchol u uzavřené polyliny', () => {
    // (5,0) je uprostřed hrany mezi (0,10)→(10,10) přes uzavření
    // Vlastně to nedává smysl. Test pro start vertex collinearity:
    // verts: [(5,0), (10,0), (10,10), (0,10), (0,0)] – (5,0) leží mezi (0,0)
    // (předchozí přes wrap) a (10,0). Po zjednodušení 4 rohy.
    const out = simplifyPolyline(poly([
      [5, 0], [10, 0], [10, 10], [0, 10], [0, 0],
    ]));
    expect(out.vertices).toHaveLength(4);
  });
});

describe('simplifyPolyline – degenerované vstupy', () => {
  it('zvládne prázdné vstupní pole', () => {
    const out = simplifyPolyline({ vertices: [], bulges: [], closed: true });
    expect(out.vertices).toEqual([]);
  });

  it('vrátí prázdné pole, pokud poly je null', () => {
    const out = simplifyPolyline(null);
    expect(out.vertices).toEqual([]);
    expect(out.bulges).toEqual([]);
  });

  it('zachová polylinu s nulovou délkou hrany (degeneraci)', () => {
    // (0,0), (0,0), (10,0) – tečka v prvním kroku. Funkce by neměla padat.
    const out = simplifyPolyline(poly([[0, 0], [0, 0], [10, 0]], null, false));
    expect(out.vertices.length).toBeGreaterThanOrEqual(2);
  });
});

describe('simplifyPolyline – tolerance', () => {
  it('default tolerance 1e-6 odebere bod kolmo ve vzdálenosti 1e-9', () => {
    const out = simplifyPolyline(poly([[0, 0], [5, 1e-9], [10, 0]], null, false));
    expect(out.vertices).toHaveLength(2);
  });

  it('default tolerance zachová bod kolmo ve vzdálenosti 0.01', () => {
    const out = simplifyPolyline(poly([[0, 0], [5, 0.01], [10, 0]], null, false));
    expect(out.vertices).toHaveLength(3);
  });

  it('zvolená tolerance 0.1 odebere bod kolmo ve vzdálenosti 0.01', () => {
    const out = simplifyPolyline(poly([[0, 0], [5, 0.01], [10, 0]], null, false), 0.1);
    expect(out.vertices).toHaveLength(2);
  });
});
