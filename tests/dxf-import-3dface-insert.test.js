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
