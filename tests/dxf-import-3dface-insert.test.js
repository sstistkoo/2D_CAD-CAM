// Testy DXF importu pro 3DFACE a INSERT/BLOCK entity.
// 3DFACE → uzavřená polylina (3 nebo 4 vrcholy, Z se ignoruje).
// INSERT → expanze blokových entit s aplikovanou translací/rotací/měřítkem.

import { describe, it, expect } from 'vitest';
import { parseDXF } from '../js/dxf.js';

function wrapDXF(entityBlocks, blocksBlocks) {
  const lines = ['0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC'];
  if (blocksBlocks && blocksBlocks.length > 0) {
    lines.push('0', 'SECTION', '2', 'BLOCKS', ...blocksBlocks.flat(), '0', 'ENDSEC');
  }
  lines.push('0', 'SECTION', '2', 'ENTITIES', ...entityBlocks.flat(), '0', 'ENDSEC');
  lines.push('0', 'EOF');
  return lines.join('\n');
}

// ── 3DFACE ──

describe('parseDXF – 3DFACE', () => {
  it('quad (4 různé rohy) → polylina se 4 vrcholy', () => {
    const dxf = wrapDXF([[
      '0', '3DFACE',
      '10', '0', '20', '0', '30', '0',
      '11', '10', '21', '0', '31', '0',
      '12', '10', '22', '10', '32', '0',
      '13', '0', '23', '10', '33', '0',
    ]]);
    const r = parseDXF(dxf);
    expect(r.errors).toEqual([]);
    expect(r.entities).toHaveLength(1);
    expect(r.entities[0].type).toBe('polyline');
    expect(r.entities[0].closed).toBe(true);
    expect(r.entities[0].vertices).toHaveLength(4);
    expect(r.entities[0].vertices[2]).toEqual({ x: 10, y: 10 });
  });

  it('triangle (4. roh = 3. roh) → polylina se 3 vrcholy', () => {
    const dxf = wrapDXF([[
      '0', '3DFACE',
      '10', '0', '20', '0',
      '11', '10', '21', '0',
      '12', '5', '22', '10',
      '13', '5', '23', '10', // = 3. roh
    ]]);
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(1);
    expect(r.entities[0].vertices).toHaveLength(3);
  });

  it('Z souřadnice se ignorují (2D projekce)', () => {
    const dxf = wrapDXF([[
      '0', '3DFACE',
      '10', '0', '20', '0', '30', '100',
      '11', '10', '21', '0', '31', '200',
      '12', '5', '22', '10', '32', '300',
      '13', '5', '23', '10', '33', '300',
    ]]);
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(1);
    // Vrcholy mají jen x/y, žádné z
    r.entities[0].vertices.forEach(v => {
      expect(v.z).toBeUndefined();
    });
  });
});

// ── INSERT / BLOCK ──

describe('parseDXF – INSERT/BLOCK', () => {
  it('jednoduchý INSERT bloku se 2 úsečkami → 2 transformované úsečky', () => {
    const dxf = wrapDXF(
      [[
        '0', 'INSERT',
        '2', 'MYBLOCK',
        '10', '50', '20', '0',
        '41', '1', '42', '1',
        '50', '0',
      ]],
      [[
        '0', 'BLOCK',
        '2', 'MYBLOCK',
        '10', '0', '20', '0',
        '0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '0',
        '0', 'LINE', '10', '10', '20', '0', '11', '10', '21', '5',
        '0', 'ENDBLK',
      ]],
    );
    const r = parseDXF(dxf);
    expect(r.errors).toEqual([]);
    expect(r.entities).toHaveLength(2);
    expect(r.entities[0].type).toBe('line');
    expect(r.entities[0].x1).toBe(50); // 0 + 50 (insert.x)
    expect(r.entities[0].x2).toBe(60); // 10 + 50
    expect(r.entities[1].x1).toBe(60);
    expect(r.entities[1].y2).toBe(5);
  });

  it('INSERT s rotací 90° otočí úsečku', () => {
    const dxf = wrapDXF(
      [[
        '0', 'INSERT', '2', 'B',
        '10', '0', '20', '0',
        '41', '1', '42', '1',
        '50', '90',
      ]],
      [[
        '0', 'BLOCK', '2', 'B',
        '10', '0', '20', '0',
        // Úsečka z (0,0) do (10,0) → po rotaci 90° → (0,0) do (0,10)
        '0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '0',
        '0', 'ENDBLK',
      ]],
    );
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(1);
    expect(r.entities[0].x1).toBeCloseTo(0, 5);
    expect(r.entities[0].y1).toBeCloseTo(0, 5);
    expect(r.entities[0].x2).toBeCloseTo(0, 5);
    expect(r.entities[0].y2).toBeCloseTo(10, 5);
  });

  it('INSERT s měřítkem 2× zvětší geometrii', () => {
    const dxf = wrapDXF(
      [[
        '0', 'INSERT', '2', 'B',
        '10', '0', '20', '0',
        '41', '2', '42', '2',
        '50', '0',
      ]],
      [[
        '0', 'BLOCK', '2', 'B',
        '10', '0', '20', '0',
        '0', 'CIRCLE', '10', '5', '20', '0', '40', '3',
        '0', 'ENDBLK',
      ]],
    );
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(1);
    expect(r.entities[0].type).toBe('circle');
    expect(r.entities[0].cx).toBe(10); // 5 × 2
    expect(r.entities[0].r).toBe(6);   // 3 × 2
  });

  it('INSERT s base point bloku posune origin', () => {
    const dxf = wrapDXF(
      [[
        '0', 'INSERT', '2', 'B',
        '10', '100', '20', '100',
        '41', '1', '42', '1',
      ]],
      [[
        '0', 'BLOCK', '2', 'B',
        '10', '5', '20', '5',  // base point bloku
        '0', 'LINE', '10', '5', '20', '5', '11', '15', '21', '5',
        '0', 'ENDBLK',
      ]],
    );
    const r = parseDXF(dxf);
    // Úsečka v bloku má první bod na base pointu (5,5)
    // Po odečtení base + insert (100,100): (0,0) → (100,100) a (10,0) → (110,100)
    expect(r.entities[0].x1).toBeCloseTo(100, 5);
    expect(r.entities[0].y1).toBeCloseTo(100, 5);
    expect(r.entities[0].x2).toBeCloseTo(110, 5);
  });

  it('INSERT array (rows×cols) vytvoří N×M kopií', () => {
    const dxf = wrapDXF(
      [[
        '0', 'INSERT', '2', 'B',
        '10', '0', '20', '0',
        '41', '1', '42', '1',
        '70', '3',  // cols
        '71', '2',  // rows
        '44', '20', // colSpacing
        '45', '15', // rowSpacing
      ]],
      [[
        '0', 'BLOCK', '2', 'B', '10', '0', '20', '0',
        '0', 'POINT', '10', '0', '20', '0',
        '0', 'ENDBLK',
      ]],
    );
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(6); // 3 × 2
    // Body jsou na (0,0), (20,0), (40,0), (0,15), (20,15), (40,15)
    const positions = r.entities.map(e => `${e.x},${e.y}`).sort();
    expect(positions).toEqual(['0,0', '0,15', '20,0', '20,15', '40,0', '40,15']);
  });

  it('INSERT neznámého bloku vyhodí chybu', () => {
    const dxf = wrapDXF(
      [[
        '0', 'INSERT', '2', 'GHOST',
        '10', '0', '20', '0', '41', '1', '42', '1',
      ]],
    );
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain('GHOST');
  });

  it('BLOCK s víc typy entit (line + circle + arc)', () => {
    const dxf = wrapDXF(
      [[
        '0', 'INSERT', '2', 'MIX',
        '10', '50', '20', '50',
        '41', '1', '42', '1',
      ]],
      [[
        '0', 'BLOCK', '2', 'MIX', '10', '0', '20', '0',
        '0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '0',
        '0', 'CIRCLE', '10', '0', '20', '0', '40', '5',
        '0', 'ARC', '10', '0', '20', '0', '40', '8', '50', '0', '51', '90',
        '0', 'ENDBLK',
      ]],
    );
    const r = parseDXF(dxf);
    expect(r.entities).toHaveLength(3);
    const types = r.entities.map(e => e.type).sort();
    expect(types).toEqual(['arc', 'circle', 'line']);
    // Všechny transformovány o (+50, +50)
    expect(r.entities.find(e => e.type === 'circle').cx).toBe(50);
    expect(r.entities.find(e => e.type === 'circle').cy).toBe(50);
  });

  it('zrcadlený INSERT (41=-1) obrátí směr oblouku, ne jen jeho polohu', () => {
    // Blok: čtvrtkružnice střed (5,0) r=5, 0°→90° (body (10,0)→(5,5)).
    const dxf = wrapDXF(
      [[
        '0', 'INSERT', '2', 'B',
        '10', '0', '20', '0',
        '41', '-1',
      ]],
      [[
        '0', 'BLOCK', '2', 'B', '10', '0', '20', '0',
        '0', 'ARC', '10', '5', '20', '0', '40', '5', '50', '0', '51', '90',
        '0', 'ENDBLK',
      ]],
    );
    const r = parseDXF(dxf);
    expect(r.errors).toEqual([]);
    expect(r.entities).toHaveLength(1);
    const arc = r.entities[0];
    expect(arc.type).toBe('arc');
    // Střed se zrcadlí přes osu Y: (5,0) → (-5,0)
    expect(arc.cx).toBeCloseTo(-5, 6);
    expect(arc.cy).toBeCloseTo(0, 6);
    expect(arc.r).toBeCloseTo(5, 6);
    // Skutečné mirrorované koncové body musí být (-10,0) a (-5,5) – NE
    // (0,0)/(-5,5), což by vyšlo z pouhého "přičti rotaci k oběma úhlům"
    // (špatný start bod i špatná křivost).
    const sx = arc.cx + arc.r * Math.cos(arc.startAngle);
    const sy = arc.cy + arc.r * Math.sin(arc.startAngle);
    const ex = arc.cx + arc.r * Math.cos(arc.endAngle);
    const ey = arc.cy + arc.r * Math.sin(arc.endAngle);
    const pts = [[sx, sy], [ex, ey]].map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).sort();
    expect(pts).toEqual(['-10.000,0.000', '-5.000,5.000']);
  });
});

// ── Mix s ostatními entitami ──

describe('parseDXF – 3DFACE/INSERT mix', () => {
  it('3DFACE + INSERT + LINE v jednom souboru', () => {
    const dxf = wrapDXF(
      [
        ['0', 'LINE', '10', '0', '20', '0', '11', '5', '21', '5'],
        [
          '0', '3DFACE',
          '10', '10', '20', '10',
          '11', '20', '21', '10',
          '12', '15', '22', '20',
          '13', '15', '23', '20',
        ],
        [
          '0', 'INSERT', '2', 'B',
          '10', '30', '20', '0',
          '41', '1', '42', '1',
        ],
      ],
      [[
        '0', 'BLOCK', '2', 'B', '10', '0', '20', '0',
        '0', 'CIRCLE', '10', '0', '20', '0', '40', '2',
        '0', 'ENDBLK',
      ]],
    );
    const r = parseDXF(dxf);
    expect(r.errors).toEqual([]);
    expect(r.entities).toHaveLength(3);
    const types = r.entities.map(e => e.type).sort();
    expect(types).toEqual(['circle', 'line', 'polyline']);
  });
});

// ── Zrcadlené entity, MTEXT, výška textu (kontrola CAD 5. 10. 2026) ──
describe('parseDXF – zrcadlená normála (210/220/230 = 0,0,−1)', () => {
  const N = ['210', '0', '220', '0', '230', '-1'];
  const deg = (r) => Math.round(r * 180 / Math.PI);

  it('ARC: střed X obráceně, úhly π − θ s prohozenými konci', () => {
    const r = parseDXF(wrapDXF([['0', 'ARC', '10', '10', '20', '0', '40', '5', '50', '0', '51', '90', ...N]]));
    const a = r.entities[0];
    expect(a.cx).toBe(-10);
    expect(deg(a.startAngle)).toBe(90);
    expect(deg(a.endAngle)).toBe(180);
  });

  it('CIRCLE a LWPOLYLINE: x → −x, bulge mění znaménko', () => {
    const r = parseDXF(wrapDXF([
      ['0', 'CIRCLE', '10', '7', '20', '3', '40', '2', ...N],
      ['0', 'LWPOLYLINE', '90', '2', '70', '0', '10', '1', '20', '0', '42', '0.5', '10', '4', '20', '0', ...N],
    ]));
    expect(r.entities[0].cx).toBe(-7);
    expect(r.entities[1].vertices).toEqual([{ x: -1, y: 0 }, { x: -4, y: 0 }]);
    expect(r.entities[1].bulges[0]).toBe(-0.5);
  });

  it('INSERT se zápornou normálou zrcadlí celý blok', () => {
    const r = parseDXF(wrapDXF(
      [['0', 'INSERT', '2', 'B', '10', '50', '20', '0', ...N]],
      [['0', 'BLOCK', '2', 'B', '10', '0', '20', '0',
        '0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '0', '0', 'ENDBLK']],
    ));
    expect(r.entities[0].x1).toBe(-50);
    expect(r.entities[0].x2).toBe(-60);
  });
});

describe('parseDXF – INSERT: zrcadlení a pole', () => {
  const block = [['0', 'BLOCK', '2', 'B', '10', '0', '20', '0',
    '0', 'LWPOLYLINE', '90', '2', '70', '0', '10', '0', '20', '0', '42', '1', '10', '10', '20', '0',
    '0', 'ENDBLK']];

  it('zrcadlený INSERT (41 = −1) obrátí znaménko bulge kontury', () => {
    const r = parseDXF(wrapDXF([['0', 'INSERT', '2', 'B', '10', '0', '20', '0', '41', '-1', '42', '1']], block));
    expect(r.entities[0].bulges[0]).toBe(-1);
    expect(r.entities[0].vertices[1].x).toBe(-10);
  });

  it('pole INSERTu (70/71, 44/45) se natáčí spolu s blokem', () => {
    const r = parseDXF(wrapDXF([['0', 'INSERT', '2', 'B', '10', '0', '20', '0', '50', '90',
      '70', '2', '71', '1', '44', '100', '45', '0']], block));
    // druhý sloupec: rozteč 100 ve směru natočení 90° → posun (0, 100)
    const second = r.entities[1].vertices[0];
    expect(second.x).toBeCloseTo(0, 9);
    expect(second.y).toBeCloseTo(100, 9);
  });
});

describe('parseDXF – TEXT/MTEXT poloha, natočení, výška', () => {
  it('MTEXT: poloha 10/20 i s kódem 72 (směr psaní), natočení ze směru 11/21', () => {
    const r = parseDXF(wrapDXF([['0', 'MTEXT', '10', '100', '20', '50', '40', '2.5',
      '71', '1', '72', '5', '11', '0', '21', '1', '1', 'POPIS']]));
    const t = r.entities[0];
    expect(t.x).toBe(100);
    expect(t.y).toBe(50);
    expect(t.rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(t.fontSize).toBe(2.5);
  });

  it('MTEXT bez směrového vektoru: kód 50 je v radiánech', () => {
    const r = parseDXF(wrapDXF([['0', 'MTEXT', '10', '0', '20', '0', '40', '3', '50', '0.5', '1', 'X']]));
    expect(r.entities[0].rotation).toBeCloseTo(0.5, 9);
  });

  it('výška textu se nezaokrouhluje (0,4 mm nesmí skončit jako 0)', () => {
    const r = parseDXF(wrapDXF([['0', 'TEXT', '10', '0', '20', '0', '40', '0.4', '1', 'malý']]));
    expect(r.entities[0].fontSize).toBe(0.4);
  });
});
