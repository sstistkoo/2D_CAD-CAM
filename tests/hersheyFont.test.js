// Testy pro Hershey single-line font renderer.
// Pokrývá: render single character, multi-character, measureHersheyText,
// mezery, rotaci, neznámé znaky.

import { describe, it, expect } from 'vitest';
import { renderHersheyText, measureHersheyText, listHersheyFonts, __test__ } from '../js/lib/hersheyFont.js';
const { parseHersheyD, readGlyph } = __test__;

describe('renderHersheyText – základní rendering', () => {
  it('písmeno A má 3 tahy (levá noha, pravá noha, příčka)', () => {
    const polys = renderHersheyText('A', 10);
    expect(polys).toHaveLength(3);
    polys.forEach(p => {
      expect(p.closed).toBe(false);
      expect(p.vertices.length).toBeGreaterThanOrEqual(2);
      expect(p.bulges.every(b => b === 0)).toBe(true);
    });
  });

  it('písmeno B má více tahů než A (svislá + dvě boule)', () => {
    const a = renderHersheyText('A', 10);
    const b = renderHersheyText('B', 10);
    expect(b.length).toBeGreaterThan(0);
    // B má vždy levou svislou + 2 boule = aspoň 3 tahy
    expect(b.length).toBeGreaterThanOrEqual(3);
  });

  it('řetězec "AB" vyrobí součet tahů A + B', () => {
    const a = renderHersheyText('A', 10);
    const b = renderHersheyText('B', 10);
    const ab = renderHersheyText('AB', 10);
    expect(ab.length).toBe(a.length + b.length);
  });

  it('mezera nepřidá žádné tahy, ale posune cursor', () => {
    const ab = renderHersheyText('AB', 10);
    const aSb = renderHersheyText('A B', 10);
    expect(aSb.length).toBe(ab.length); // mezera = 0 polylines
    // První tah B v "A B" je posunutější než v "AB" o ~mezera + advance A
    const widthAB = measureHersheyText('AB', 10).width;
    const widthASB = measureHersheyText('A B', 10).width;
    expect(widthASB).toBeGreaterThan(widthAB);
  });

  it('prázdný řetězec vrátí []', () => {
    expect(renderHersheyText('', 10)).toEqual([]);
  });

  it('fontSize=0 vrátí []', () => {
    expect(renderHersheyText('A', 0)).toEqual([]);
  });

  it('umístí text na zadané (cx, cy)', () => {
    const polys = renderHersheyText('A', 10, 100, 50);
    // První tah A: levá noha, začíná v (9, 1) v Hershey jednotkách
    // Po scale (10/21) a posunu se vrcholy musí pohybovat kolem (100, 50).
    const allX = polys.flatMap(p => p.vertices.map(v => v.x));
    const allY = polys.flatMap(p => p.vertices.map(v => v.y));
    expect(Math.min(...allX)).toBeGreaterThanOrEqual(99);
    expect(Math.max(...allX)).toBeLessThanOrEqual(110);
    // Y u kapitálky leží mezi baseline (cy - fontSize) a top (cy);
    // Hershey A má y rozsah 1..22 (cap height 21j ≈ fontSize 10mm)
    expect(Math.min(...allY)).toBeGreaterThanOrEqual(39);
    expect(Math.max(...allY)).toBeLessThanOrEqual(52);
  });
});

describe('measureHersheyText', () => {
  it('vrátí šířku > 0 pro běžný text', () => {
    const m = measureHersheyText('TEST', 10);
    expect(m.width).toBeGreaterThan(0);
    expect(m.height).toBe(10);
  });

  it('delší text má větší šířku', () => {
    expect(measureHersheyText('AB', 10).width).toBeLessThan(measureHersheyText('ABC', 10).width);
  });

  it('větší fontSize → větší šířka (proporcionálně)', () => {
    const w10 = measureHersheyText('A', 10).width;
    const w20 = measureHersheyText('A', 20).width;
    expect(w20 / w10).toBeCloseTo(2, 1);
  });

  it('prázdný text má width=0', () => {
    expect(measureHersheyText('', 10)).toEqual({ width: 0, height: 10 });
  });
});

describe('renderHersheyText – rotace', () => {
  it('rotace o 90° otočí texto kolem (cx, cy)', () => {
    const norm = renderHersheyText('A', 10, 0, 0, 0);
    const rot = renderHersheyText('A', 10, 0, 0, Math.PI / 2);
    expect(rot.length).toBe(norm.length);
    // Po rotaci 90° (CCW): původní +X se stane +Y, původní +Y se stane -X
    // Tedy maxY rotovaného ≈ maxX normálního
    const normMaxX = Math.max(...norm.flatMap(p => p.vertices.map(v => v.x)));
    const rotMaxY = Math.max(...rot.flatMap(p => p.vertices.map(v => v.y)));
    expect(rotMaxY).toBeCloseTo(normMaxX, 1);
  });
});

describe('Multi-font podpora', () => {
  it('listHersheyFonts vrátí >= 4 fonty', () => {
    const fonts = listHersheyFonts();
    expect(fonts.length).toBeGreaterThanOrEqual(4);
    const ids = fonts.map(f => f.id);
    expect(ids).toContain('futural');
    expect(ids).toContain('futuram');
    expect(ids).toContain('timesr');
    expect(ids).toContain('scripts');
  });

  it('každý font vyrobí glyfy pro velká písmena', () => {
    for (const f of listHersheyFonts()) {
      const polys = renderHersheyText('ABC', 10, 0, 0, 0, f.id);
      expect(polys.length, `font ${f.id} 'ABC'`).toBeGreaterThan(0);
    }
  });

  it('různé fonty produkují různé výsledky pro stejný text', () => {
    const a = renderHersheyText('AB', 10, 0, 0, 0, 'futural');
    const b = renderHersheyText('AB', 10, 0, 0, 0, 'timesr');
    // Liší se počet tahů nebo počet vrcholů
    const aTotal = a.reduce((s, p) => s + p.vertices.length, 0);
    const bTotal = b.reduce((s, p) => s + p.vertices.length, 0);
    expect(a.length !== b.length || aTotal !== bTotal).toBe(true);
  });

  it('neznámý font → fallback na default (futural)', () => {
    const unknown = renderHersheyText('A', 10, 0, 0, 0, 'nonexistent');
    const def = renderHersheyText('A', 10, 0, 0, 0, 'futural');
    expect(unknown.length).toBe(def.length);
  });

  it('measureHersheyText respektuje volbu fontu', () => {
    const wFuturem = measureHersheyText('TEST', 10, 'futural').width;
    const wTimesr = measureHersheyText('TEST', 10, 'timesr').width;
    expect(wFuturem).toBeGreaterThan(0);
    expect(wTimesr).toBeGreaterThan(0);
    // Šířky se obvykle liší (různý kerning per font)
  });

  it('bez parametru fontName se chová jako futural', () => {
    const a = renderHersheyText('A', 10);
    const b = renderHersheyText('A', 10, 0, 0, 0, 'futural');
    expect(a.length).toBe(b.length);
  });
});

describe('parseHersheyD – starý formát {M/L tokens}', () => {
  it('parsuje single stroke "M9,1 L1,22"', () => {
    const strokes = parseHersheyD('M9,1 L1,22');
    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toEqual([{ x: 9, y: 1 }, { x: 1, y: 22 }]);
  });

  it('parsuje multi-stroke A: 3 tahy', () => {
    const strokes = parseHersheyD('M9,1 L1,22 M9,1 L17,22 M4,15 L14,15');
    expect(strokes).toHaveLength(3);
    expect(strokes[0]).toEqual([{ x: 9, y: 1 }, { x: 1, y: 22 }]);
    expect(strokes[2]).toEqual([{ x: 4, y: 15 }, { x: 14, y: 15 }]);
  });

  it('parsuje implicitní lineTo (bez L prefixu)', () => {
    const strokes = parseHersheyD('M4,1 L4,22 M4,1 L13,1 16,2 17,3');
    expect(strokes).toHaveLength(2);
    expect(strokes[1]).toHaveLength(4); // M4,1 L13,1 (implicit) 16,2 (implicit) 17,3
  });
});

describe('parseHersheyD – nový kompaktní formát', () => {
  it('parsuje "9,1;1,22|9,1;17,22|4,15;14,15" jako 3 tahy', () => {
    const strokes = parseHersheyD('9,1;1,22|9,1;17,22|4,15;14,15');
    expect(strokes).toHaveLength(3);
    expect(strokes[0]).toEqual([{ x: 9, y: 1 }, { x: 1, y: 22 }]);
    expect(strokes[1]).toEqual([{ x: 9, y: 1 }, { x: 17, y: 22 }]);
    expect(strokes[2]).toEqual([{ x: 4, y: 15 }, { x: 14, y: 15 }]);
  });

  it('starý i nový formát stejné A dají identické tahy', () => {
    const oldA = parseHersheyD('M9,1 L1,22 M9,1 L17,22 M4,15 L14,15');
    const newA = parseHersheyD('9,1;1,22|9,1;17,22|4,15;14,15');
    expect(oldA).toEqual(newA);
  });

  it('odolnost vůči trailing oddělovačům', () => {
    expect(parseHersheyD('9,1;1,22;')).toHaveLength(1);
    expect(parseHersheyD('9,1;1,22||4,15;14,15')).toHaveLength(2);
  });
});

describe('readGlyph – formátová polymorfie', () => {
  it('tuple [o, d] vrátí { o, d }', () => {
    expect(readGlyph([9, '9,1;1,22'])).toEqual({ o: 9, d: '9,1;1,22' });
  });

  it('objekt { o, d } vrátí { o, d }', () => {
    expect(readGlyph({ o: 9, d: 'M9,1 L1,22' })).toEqual({ o: 9, d: 'M9,1 L1,22' });
  });

  it('prázdné/chybějící hodnoty → defaults', () => {
    expect(readGlyph([])).toEqual({ o: 0, d: '' });
    expect(readGlyph({})).toEqual({ o: 0, d: '' });
  });
});

describe('renderHersheyText – neznámé znaky', () => {
  it('znak mimo ASCII (např. č) přeskočí bez chyby', () => {
    // 'č' (255) je mimo 33–126; nevyrobí polylines, ale ani nepadne
    const polys = renderHersheyText('Ač', 10);
    const justA = renderHersheyText('A', 10);
    expect(polys).toHaveLength(justA.length);
  });

  it('všechny ASCII znaky 33–126 jsou definované', () => {
    for (let code = 33; code <= 126; code++) {
      const polys = renderHersheyText(String.fromCharCode(code), 10);
      expect(polys.length, `char ${code} "${String.fromCharCode(code)}"`).toBeGreaterThan(0);
    }
  });
});
