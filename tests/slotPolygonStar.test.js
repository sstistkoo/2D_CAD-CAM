// Testy validátorů Slot/Polygon/Star parametrů.
// Pokrývají hraniční a chybné vstupy. Reálná Maker.js konstrukce se
// netestuje v Node (vyžadovala by browser bundle); ověřeno v náhledu.

import { describe, it, expect } from 'vitest';
import { validateSlotParams } from '../js/dialogs/slotDialog.js';
import { validatePolygonParams } from '../js/dialogs/polygonDialog.js';
import { validateStarParams } from '../js/dialogs/starDialog.js';

// ── Slot ──

describe('validateSlotParams', () => {
  it('akceptuje validní vstup', () => {
    const r = validateSlotParams({ length: 40, width: 10, angle: 15 });
    expect(r.error).toBeUndefined();
    expect(r.params).toEqual({ length: 40, width: 10, angle: 15 });
  });

  it('angle = 0, když není zadán', () => {
    const r = validateSlotParams({ length: 40, width: 10 });
    expect(r.params.angle).toBe(0);
  });

  it('odmítne nulovou délku', () => {
    expect(validateSlotParams({ length: 0, width: 10 }).error).toMatch(/Délka/);
  });

  it('odmítne zápornou délku', () => {
    expect(validateSlotParams({ length: -5, width: 10 }).error).toMatch(/Délka/);
  });

  it('odmítne nulovou šířku', () => {
    expect(validateSlotParams({ length: 40, width: 0 }).error).toMatch(/Šířka/);
  });

  it('odmítne NaN (chybějící input)', () => {
    expect(validateSlotParams({ length: NaN, width: 10 }).error).toMatch(/Délka/);
    expect(validateSlotParams({ length: 40, width: NaN }).error).toMatch(/Šířka/);
  });

  it('odmítne null/undefined vstup', () => {
    expect(validateSlotParams(null).error).toMatch(/Délka/);
    expect(validateSlotParams(undefined).error).toMatch(/Délka/);
  });
});

// ── Polygon ──

describe('validatePolygonParams', () => {
  it('akceptuje validní hexagon', () => {
    const r = validatePolygonParams({ sides: 6, radius: 10, firstAngle: 0 });
    expect(r.error).toBeUndefined();
    expect(r.params).toEqual({ sides: 6, radius: 10, firstAngle: 0, circumscribed: false });
  });

  it('akceptuje trojúhelník (min sides=3)', () => {
    expect(validatePolygonParams({ sides: 3, radius: 5 }).params.sides).toBe(3);
  });

  it('zachová circumscribed flag', () => {
    const r = validatePolygonParams({ sides: 6, radius: 10, circumscribed: true });
    expect(r.params.circumscribed).toBe(true);
  });

  it('odmítne < 3 stran', () => {
    expect(validatePolygonParams({ sides: 2, radius: 10 }).error).toMatch(/3/);
    expect(validatePolygonParams({ sides: 1, radius: 10 }).error).toMatch(/3/);
    expect(validatePolygonParams({ sides: 0, radius: 10 }).error).toMatch(/3/);
  });

  it('odmítne nulový/záporný poloměr', () => {
    expect(validatePolygonParams({ sides: 6, radius: 0 }).error).toMatch(/Poloměr/);
    expect(validatePolygonParams({ sides: 6, radius: -1 }).error).toMatch(/Poloměr/);
  });

  it('firstAngle = 0, když není zadán', () => {
    expect(validatePolygonParams({ sides: 6, radius: 10 }).params.firstAngle).toBe(0);
  });

  it('počet stran je celé číslo (parseInt)', () => {
    // 6.9 → 6 (parseInt zaokrouhlí dolů)
    expect(validatePolygonParams({ sides: 6.9, radius: 10 }).params.sides).toBe(6);
  });
});

// ── Star ──

describe('validateStarParams', () => {
  it('akceptuje validní 5-cípou hvězdu', () => {
    const r = validateStarParams({ points: 5, outerRadius: 20, innerRadius: 8 });
    expect(r.error).toBeUndefined();
    expect(r.params).toEqual({ points: 5, outerRadius: 20, innerRadius: 8 });
  });

  it('akceptuje trojcípou hvězdu (min points=3)', () => {
    expect(validateStarParams({ points: 3, outerRadius: 10, innerRadius: 4 }).params.points).toBe(3);
  });

  it('odmítne < 3 cípy', () => {
    expect(validateStarParams({ points: 2, outerRadius: 10, innerRadius: 4 }).error).toMatch(/cíp/);
  });

  it('odmítne nulový vnější poloměr', () => {
    expect(validateStarParams({ points: 5, outerRadius: 0, innerRadius: 4 }).error).toMatch(/Vnější/);
  });

  it('odmítne nulový vnitřní poloměr', () => {
    expect(validateStarParams({ points: 5, outerRadius: 10, innerRadius: 0 }).error).toMatch(/Vnitřní poloměr musí být/);
  });

  it('odmítne inner ≥ outer', () => {
    expect(validateStarParams({ points: 5, outerRadius: 10, innerRadius: 10 }).error).toMatch(/menší/);
    expect(validateStarParams({ points: 5, outerRadius: 10, innerRadius: 15 }).error).toMatch(/menší/);
  });

  it('akceptuje inner těsně pod outer', () => {
    expect(validateStarParams({ points: 5, outerRadius: 10, innerRadius: 9.99 }).error).toBeUndefined();
  });

  it('počet cípů je celé číslo', () => {
    expect(validateStarParams({ points: 5.7, outerRadius: 10, innerRadius: 4 }).params.points).toBe(5);
  });
});
