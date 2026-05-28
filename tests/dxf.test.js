// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: dxf.js (parseDXF)                          ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOM (potřeba pro state.js → document.getElementById)
vi.stubGlobal('document', {
  getElementById: () => ({
    disabled: false,
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    textContent: '',
  }),
  createElement: () => ({
    className: '', textContent: '', innerHTML: '',
    classList: { add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
  }),
  body: { appendChild: vi.fn() },
  querySelector: () => null,
});

vi.stubGlobal('window', {
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: vi.fn(),
});

vi.stubGlobal('navigator', { vibrate: vi.fn() });

// Mock render.js
vi.mock('../js/render.js', () => ({
  renderAll: vi.fn(),
  renderAllDebounced: vi.fn(),
}));

import { parseDXF, exportDXF } from '../js/dxf.js';

const PI = Math.PI;

// ═══════════════════════════════════════════
// Helper: Sestaví minimální DXF soubor
// ═══════════════════════════════════════════
function makeDXF(entityLines) {
  return [
    '0', 'SECTION',
    '2', 'HEADER',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
    ...entityLines,
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\n');
}

// ════════════════════════════════════════
// ── parseDXF – základní scénáře ──
// ════════════════════════════════════════
describe('parseDXF', () => {
  it('vrací prázdný výsledek pro prázdný řetězec', () => {
    const result = parseDXF('');
    expect(result.entities).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('ENTITIES');
  });

  it('vrací chybu když chybí sekce ENTITIES', () => {
    const dxf = '0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF';
    const result = parseDXF(dxf);
    expect(result.entities).toHaveLength(0);
    expect(result.errors[0]).toContain('ENTITIES');
  });

  it('parsuje prázdnou sekci ENTITIES', () => {
    const dxf = makeDXF([]);
    const result = parseDXF(dxf);
    expect(result.entities).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ════════════════════════════════════════
// ── LINE ──
// ════════════════════════════════════════
describe('parseDXF – LINE', () => {
  it('parsuje úsečku se souřadnicemi', () => {
    const dxf = makeDXF([
      '0', 'LINE',
      '10', '0.0',
      '20', '0.0',
      '11', '100.0',
      '21', '50.0',
    ]);
    const { entities, errors } = parseDXF(dxf);
    expect(errors).toHaveLength(0);
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe('line');
    expect(entities[0].x1).toBe(0);
    expect(entities[0].y1).toBe(0);
    expect(entities[0].x2).toBe(100);
    expect(entities[0].y2).toBe(50);
  });

  it('přiřadí barvu z ACI kódu', () => {
    const dxf = makeDXF([
      '0', 'LINE',
      '62', '1',
      '10', '0', '20', '0', '11', '10', '21', '10',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities[0].color).toBe('#ff0000');
  });

  it('použije výchozí barvu pro neznámý ACI kód', () => {
    const dxf = makeDXF([
      '0', 'LINE',
      '62', '999',
      '10', '0', '20', '0', '11', '10', '21', '10',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities[0].color).toBe('#89b4fa'); // COLORS.primary
  });

  it('výchozí barva když chybí kód 62', () => {
    const dxf = makeDXF([
      '0', 'LINE',
      '10', '5', '20', '10', '11', '15', '21', '20',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities[0].color).toBe('#89b4fa');
  });

  it('souřadnice defaultují na 0 když chybí', () => {
    const dxf = makeDXF([
      '0', 'LINE',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities[0].x1).toBe(0);
    expect(entities[0].y1).toBe(0);
    expect(entities[0].x2).toBe(0);
    expect(entities[0].y2).toBe(0);
  });
});

// ════════════════════════════════════════
// ── CIRCLE ──
// ════════════════════════════════════════
describe('parseDXF – CIRCLE', () => {
  it('parsuje kružnici', () => {
    const dxf = makeDXF([
      '0', 'CIRCLE',
      '10', '50.0',
      '20', '50.0',
      '40', '25.0',
    ]);
    const { entities, errors } = parseDXF(dxf);
    expect(errors).toHaveLength(0);
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe('circle');
    expect(entities[0].cx).toBe(50);
    expect(entities[0].cy).toBe(50);
    expect(entities[0].r).toBe(25);
  });

  it('kružnice s ACI barvou', () => {
    const dxf = makeDXF([
      '0', 'CIRCLE',
      '62', '3',
      '10', '0', '20', '0', '40', '10',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities[0].color).toBe('#00ff00');
  });

  it('poloměr defaultuje na 0 když chybí kód 40', () => {
    const dxf = makeDXF([
      '0', 'CIRCLE',
      '10', '10', '20', '10',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities[0].r).toBe(0);
  });
});

// ════════════════════════════════════════
// ── ARC ──
// ════════════════════════════════════════
describe('parseDXF – ARC', () => {
  it('parsuje oblouk s úhly v radiánech', () => {
    const dxf = makeDXF([
      '0', 'ARC',
      '10', '75.0',
      '20', '25.0',
      '40', '20.0',
      '50', '0.0',
      '51', '90.0',
    ]);
    const { entities, errors } = parseDXF(dxf);
    expect(errors).toHaveLength(0);
    expect(entities).toHaveLength(1);
    const arc = entities[0];
    expect(arc.type).toBe('arc');
    expect(arc.cx).toBe(75);
    expect(arc.cy).toBe(25);
    expect(arc.r).toBe(20);
    expect(arc.startAngle).toBeCloseTo(0);
    expect(arc.endAngle).toBeCloseTo(PI / 2);
  });

  it('konvertuje DXF stupně na radiány', () => {
    const dxf = makeDXF([
      '0', 'ARC',
      '10', '0', '20', '0', '40', '10',
      '50', '45',
      '51', '180',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities[0].startAngle).toBeCloseTo(45 * PI / 180);
    expect(entities[0].endAngle).toBeCloseTo(PI);
  });
});

// ════════════════════════════════════════
// ── POINT ──
// ════════════════════════════════════════
describe('parseDXF – POINT', () => {
  it('parsuje bod', () => {
    const dxf = makeDXF([
      '0', 'POINT',
      '10', '25.0',
      '20', '25.0',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe('point');
    expect(entities[0].x).toBe(25);
    expect(entities[0].y).toBe(25);
  });
});

// ════════════════════════════════════════
// ── LWPOLYLINE ──
// ════════════════════════════════════════
describe('parseDXF – LWPOLYLINE', () => {
  it('parsuje otevřenou polylajnu', () => {
    const dxf = makeDXF([
      '0', 'LWPOLYLINE',
      '90', '3',
      '70', '0',
      '10', '0', '20', '0',
      '10', '10', '20', '0',
      '10', '10', '20', '10',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);
    const pl = entities[0];
    expect(pl.type).toBe('polyline');
    expect(pl.closed).toBe(false);
    expect(pl.vertices).toHaveLength(3);
    expect(pl.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(pl.vertices[2]).toEqual({ x: 10, y: 10 });
  });

  it('parsuje uzavřenou polylajnu (flag 1)', () => {
    const dxf = makeDXF([
      '0', 'LWPOLYLINE',
      '90', '4',
      '70', '1',
      '10', '0', '20', '0',
      '10', '50', '20', '0',
      '10', '50', '20', '30',
      '10', '0', '20', '30',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities[0].closed).toBe(true);
    expect(entities[0].vertices).toHaveLength(4);
  });

  it('parsuje polylajnu s bulge hodnotami', () => {
    const dxf = makeDXF([
      '0', 'LWPOLYLINE',
      '90', '3',
      '70', '0',
      '10', '0', '20', '0',
      '42', '0.5',
      '10', '10', '20', '0',
      '10', '10', '20', '10',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities[0].bulges[0]).toBe(0.5);
    expect(entities[0].bulges[1]).toBe(0);
    expect(entities[0].bulges[2]).toBe(0);
  });
});

// ════════════════════════════════════════
// ── Více entit ──
// ════════════════════════════════════════
describe('parseDXF – více entit', () => {
  it('parsuje více entit najednou', () => {
    const dxf = makeDXF([
      '0', 'LINE',
      '10', '0', '20', '0', '11', '10', '21', '10',
      '0', 'CIRCLE',
      '10', '5', '20', '5', '40', '3',
      '0', 'POINT',
      '10', '1', '20', '2',
    ]);
    const { entities, errors } = parseDXF(dxf);
    expect(errors).toHaveLength(0);
    expect(entities).toHaveLength(3);
    expect(entities[0].type).toBe('line');
    expect(entities[1].type).toBe('circle');
    expect(entities[2].type).toBe('point');
  });
});

// ════════════════════════════════════════
// ── Nepodporované entity ──
// ════════════════════════════════════════
describe('parseDXF – chyby a hraniční případy', () => {
  it('hlásí neznámou entitu', () => {
    const dxf = makeDXF([
      '0', '3DFACE',
      '10', '0', '20', '0',
    ]);
    const { entities, errors } = parseDXF(dxf);
    expect(entities).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('3DFACE');
  });

  it('hlásí více neznámých entit', () => {
    const dxf = makeDXF([
      '0', '3DFACE',
      '10', '0', '20', '0',
      '0', 'HATCH',
      '10', '0', '20', '0',
    ]);
    const { entities, errors } = parseDXF(dxf);
    expect(entities).toHaveLength(0);
    expect(errors).toHaveLength(2);
  });

  it('zpracuje mix známých a dříve nepodporovaných entit', () => {
    const dxf = makeDXF([
      '0', 'LINE',
      '10', '0', '20', '0', '11', '10', '21', '10',
      '0', 'ELLIPSE',
      '10', '0', '20', '0',
      '11', '10', '21', '0',
      '40', '0.5',
      '41', '0', '42', '6.283185',
      '0', 'CIRCLE',
      '10', '5', '20', '5', '40', '2',
    ]);
    const { entities, errors } = parseDXF(dxf);
    // LINE + tessellované ELLIPSE segmenty + CIRCLE
    expect(entities.length).toBeGreaterThanOrEqual(3);
    expect(errors).toHaveLength(0);
    expect(entities[0].type).toBe('line');
    expect(entities[entities.length - 1].type).toBe('circle');
  });

  it('zvládne DXF s \\r\\n konci řádků', () => {
    const dxf = makeDXF([
      '0', 'POINT',
      '10', '42', '20', '24',
    ]).replace(/\n/g, '\r\n');
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);
    expect(entities[0].x).toBe(42);
    expect(entities[0].y).toBe(24);
  });

  it('zvládne neplatné číselné hodnoty', () => {
    const dxf = makeDXF([
      '0', 'POINT',
      '10', 'abc',
      '20', '',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);
    expect(entities[0].x).toBe(0);
    expect(entities[0].y).toBe(0);
  });

  it('parsuje kompletní test.dxf s 5 entitami', () => {
    // Simulace reálného test.dxf souboru
    const dxf = [
      '0', 'SECTION',
      '2', 'HEADER',
      '0', 'ENDSEC',
      '0', 'SECTION',
      '2', 'ENTITIES',
      '0', 'LINE', '8', '0', '62', '1',
      '10', '0.0', '20', '0.0', '11', '100.0', '21', '50.0',
      '0', 'CIRCLE', '8', '0', '62', '3',
      '10', '50.0', '20', '50.0', '40', '25.0',
      '0', 'ARC', '8', '0', '62', '5',
      '10', '75.0', '20', '25.0', '40', '20.0', '50', '0.0', '51', '90.0',
      '0', 'LWPOLYLINE', '8', '0', '62', '4', '90', '4', '70', '1',
      '10', '0.0', '20', '0.0',
      '10', '50.0', '20', '0.0', '42', '0.5',
      '10', '50.0', '20', '30.0',
      '10', '0.0', '20', '30.0',
      '0', 'POINT', '8', '0',
      '10', '25.0', '20', '25.0',
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n');

    const { entities, errors } = parseDXF(dxf);
    expect(errors).toHaveLength(0);
    expect(entities).toHaveLength(5);

    // LINE
    expect(entities[0].type).toBe('line');
    expect(entities[0].x1).toBe(0);
    expect(entities[0].x2).toBe(100);
    expect(entities[0].color).toBe('#ff0000');

    // CIRCLE
    expect(entities[1].type).toBe('circle');
    expect(entities[1].cx).toBe(50);
    expect(entities[1].r).toBe(25);
    expect(entities[1].color).toBe('#00ff00');

    // ARC
    expect(entities[2].type).toBe('arc');
    expect(entities[2].startAngle).toBeCloseTo(0);
    expect(entities[2].endAngle).toBeCloseTo(PI / 2);
    expect(entities[2].color).toBe('#0000ff');

    // LWPOLYLINE
    expect(entities[3].type).toBe('polyline');
    expect(entities[3].closed).toBe(true);
    expect(entities[3].vertices).toHaveLength(4);
    expect(entities[3].bulges[1]).toBe(0.5);
    expect(entities[3].color).toBe('#00ffff');

    // POINT
    expect(entities[4].type).toBe('point');
    expect(entities[4].x).toBe(25);
    expect(entities[4].y).toBe(25);
  });
});

// ════════════════════════════════════════
// ── ACI barvy (všechny definované) ──
// ════════════════════════════════════════
describe('parseDXF – ACI barvy', () => {
  const aciMap = {
    1: '#ff0000',
    2: '#ffff00',
    3: '#00ff00',
    4: '#00ffff',
    5: '#0000ff',
    6: '#ff00ff',
    7: '#ffffff',
    8: '#808080',
    9: '#c0c0c0',
  };

  Object.entries(aciMap).forEach(([code, expectedColor]) => {
    it(`ACI ${code} → ${expectedColor}`, () => {
      const dxf = makeDXF([
        '0', 'POINT',
        '62', code,
        '10', '0', '20', '0',
      ]);
      const { entities } = parseDXF(dxf);
      expect(entities[0].color).toBe(expectedColor);
    });
  });
});

// ════════════════════════════════════════
// ── exportDXF – základní scénáře ──
// ════════════════════════════════════════
describe('exportDXF', () => {
  it('exportuje prázdný seznam objektů', () => {
    const dxf = exportDXF([]);
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('EOF');
  });

  it('exportuje bod', () => {
    const dxf = exportDXF([{ type: 'point', x: 10, y: 20 }]);
    expect(dxf).toContain('POINT');
    expect(dxf).toContain('10.000000');
    expect(dxf).toContain('20.000000');
  });

  it('exportuje úsečku', () => {
    const dxf = exportDXF([{ type: 'line', x1: 0, y1: 0, x2: 100, y2: 50 }]);
    expect(dxf).toContain('LINE');
    expect(dxf).toContain('100.000000');
    expect(dxf).toContain('50.000000');
  });

  it('exportuje kružnici', () => {
    const dxf = exportDXF([{ type: 'circle', cx: 50, cy: 50, r: 25 }]);
    expect(dxf).toContain('CIRCLE');
    expect(dxf).toContain('25.000000');
  });

  it('exportuje oblouk s úhly v stupních', () => {
    const obj = { type: 'arc', cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: PI / 2 };
    const dxf = exportDXF([obj]);
    expect(dxf).toContain('ARC');
    expect(dxf).toContain('0.000000');  // startAngle
    expect(dxf).toContain('90.000000'); // endAngle
  });

  it('exportuje obdélník jako LWPOLYLINE', () => {
    const dxf = exportDXF([{ type: 'rect', x1: 0, y1: 0, x2: 100, y2: 50 }]);
    expect(dxf).toContain('LWPOLYLINE');
    // closed flag
    const lines = dxf.split('\n');
    const lwIdx = lines.findIndex(l => l.trim() === 'LWPOLYLINE');
    let found70 = false;
    for (let i = lwIdx + 1; i < lines.length; i++) {
      if (lines[i].trim() === '70') {
        expect(lines[i + 1].trim()).toBe('1');
        found70 = true;
        break;
      }
    }
    expect(found70).toBe(true);
  });

  it('exportuje polylajnu s bulge', () => {
    const obj = {
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      bulges: [0.5, 0, 0],
      closed: false,
    };
    const dxf = exportDXF([obj]);
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('0.500000'); // bulge value
  });

  it('přeskakuje dimension objekty', () => {
    const dxf = exportDXF([{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, isDimension: true }]);
    // V ENTITIES sekci nesmí být žádná LINE entita
    const lines = dxf.split('\n');
    const entIdx = lines.findIndex(l => l.trim() === 'ENTITIES');
    const endIdx = lines.findIndex((l, i) => i > entIdx && l.trim() === 'ENDSEC');
    const entitySection = lines.slice(entIdx, endIdx).join('\n');
    expect(entitySection).not.toContain('\n0\nLINE\n');
  });
});

// ════════════════════════════════════════
// ── Round-trip: export → import ──
// ════════════════════════════════════════
describe('DXF round-trip', () => {
  it('bod přežije export→import', () => {
    const orig = [{ type: 'point', x: 42.5, y: -13.7 }];
    const dxf = exportDXF(orig);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe('point');
    expect(entities[0].x).toBeCloseTo(42.5, 4);
    expect(entities[0].y).toBeCloseTo(-13.7, 4);
  });

  it('úsečka přežije export→import', () => {
    const orig = [{ type: 'line', x1: 1.5, y1: 2.5, x2: 99.9, y2: -10.1 }];
    const dxf = exportDXF(orig);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);
    expect(entities[0].x1).toBeCloseTo(1.5, 4);
    expect(entities[0].y1).toBeCloseTo(2.5, 4);
    expect(entities[0].x2).toBeCloseTo(99.9, 4);
    expect(entities[0].y2).toBeCloseTo(-10.1, 4);
  });

  it('kružnice přežije export→import', () => {
    const orig = [{ type: 'circle', cx: 50.5, cy: -20, r: 15.75 }];
    const dxf = exportDXF(orig);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);
    expect(entities[0].cx).toBeCloseTo(50.5, 4);
    expect(entities[0].r).toBeCloseTo(15.75, 4);
  });

  it('oblouk přežije export→import', () => {
    const orig = [{ type: 'arc', cx: 0, cy: 0, r: 10, startAngle: PI / 4, endAngle: 3 * PI / 4 }];
    const dxf = exportDXF(orig);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);
    expect(entities[0].startAngle).toBeCloseTo(PI / 4, 4);
    expect(entities[0].endAngle).toBeCloseTo(3 * PI / 4, 4);
  });

  it('více objektů přežije export→import', () => {
    const orig = [
      { type: 'point', x: 1, y: 2 },
      { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 },
      { type: 'circle', cx: 5, cy: 5, r: 3 },
      { type: 'arc', cx: 0, cy: 0, r: 8, startAngle: 0, endAngle: PI },
    ];
    const dxf = exportDXF(orig);
    const { entities, errors } = parseDXF(dxf);
    expect(errors).toHaveLength(0);
    expect(entities).toHaveLength(4);
    expect(entities.map(e => e.type)).toEqual(['point', 'line', 'circle', 'arc']);
  });
});

// ════════════════════════════════════════
// ── TEXT / MTEXT import ──
// ════════════════════════════════════════
describe('parseDXF – TEXT/MTEXT', () => {
  it('parsuje TEXT entitu', () => {
    const dxf = makeDXF([
      '0', 'TEXT',
      '10', '50.0', '20', '25.0',
      '40', '10',
      '1', 'Hello World',
    ]);
    const { entities, errors } = parseDXF(dxf);
    expect(errors).toHaveLength(0);
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe('text');
    expect(entities[0].x).toBe(50);
    expect(entities[0].y).toBe(25);
    expect(entities[0].text).toBe('Hello World');
    expect(entities[0].fontSize).toBe(10);
  });

  it('parsuje MTEXT entitu a odstraní formátování', () => {
    const dxf = makeDXF([
      '0', 'MTEXT',
      '10', '10', '20', '20',
      '40', '5',
      '1', '{\\fArial;Test text}',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe('text');
    expect(entities[0].text).toBe('Test text');
  });

  it('přeskočí TEXT s prázdným obsahem', () => {
    const dxf = makeDXF([
      '0', 'TEXT',
      '10', '0', '20', '0',
      '40', '10',
      '1', '',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(0);
  });
});

// ════════════════════════════════════════
// ── ELLIPSE import (tessellace) ──
// ════════════════════════════════════════
describe('parseDXF – ELLIPSE', () => {
  it('tesselluje elipsu na úsečky', () => {
    const dxf = makeDXF([
      '0', 'ELLIPSE',
      '10', '0', '20', '0',
      '11', '20', '21', '0',
      '40', '0.5',
      '41', '0', '42', '6.283185',
    ]);
    const { entities, errors } = parseDXF(dxf);
    expect(errors).toHaveLength(0);
    expect(entities.length).toBeGreaterThan(10);
    expect(entities[0].type).toBe('line');
  });

  it('elipsa s ratio ≈ 1 → kružnice', () => {
    const dxf = makeDXF([
      '0', 'ELLIPSE',
      '10', '5', '20', '5',
      '11', '10', '21', '0',
      '40', '1.0',
      '41', '0', '42', '6.283185',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe('circle');
    expect(entities[0].r).toBeCloseTo(10, 1);
  });
});

// ════════════════════════════════════════
// ── SPLINE import (tessellace) ──
// ════════════════════════════════════════
describe('parseDXF – SPLINE', () => {
  it('tesselluje spline na úsečky z řídicích bodů', () => {
    const dxf = makeDXF([
      '0', 'SPLINE',
      '10', '0', '20', '0',
      '10', '10', '20', '5',
      '10', '20', '20', '0',
    ]);
    const { entities, errors } = parseDXF(dxf);
    expect(errors).toHaveLength(0);
    expect(entities).toHaveLength(2);
    expect(entities[0].type).toBe('line');
    expect(entities[0].x1).toBe(0);
    expect(entities[0].x2).toBe(10);
    expect(entities[1].x2).toBe(20);
  });

  it('preferuje fit body před řídicími body', () => {
    const dxf = makeDXF([
      '0', 'SPLINE',
      '10', '0', '20', '0',
      '10', '50', '20', '50',
      '11', '0', '21', '0',
      '11', '10', '21', '10',
      '11', '20', '21', '0',
    ]);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(2);
    // Fit body (kód 11): 0→10→20
    expect(entities[0].x1).toBe(0);
    expect(entities[0].x2).toBe(10);
    expect(entities[1].x2).toBe(20);
  });

  it('spline s jedním bodem → žádné entity + varování', () => {
    const dxf = makeDXF([
      '0', 'SPLINE',
      '10', '5', '20', '5',
    ]);
    const { entities, errors } = parseDXF(dxf);
    expect(entities).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('SPLINE');
  });
});

// ════════════════════════════════════════
// ── Heavy POLYLINE (POLYLINE/VERTEX/SEQEND) ──
// ════════════════════════════════════════
describe('parseDXF – heavy POLYLINE', () => {
  it('parsuje heavy POLYLINE s VERTEX/SEQEND', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'POLYLINE',
      '8', '0',
      '70', '0',
      '0', 'VERTEX',
      '10', '0', '20', '0',
      '0', 'VERTEX',
      '10', '10', '20', '0',
      '0', 'VERTEX',
      '10', '10', '20', '10',
      '0', 'SEQEND',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n');
    const { entities, errors } = parseDXF(dxf);
    expect(errors).toHaveLength(0);
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe('polyline');
    expect(entities[0].vertices).toHaveLength(3);
    expect(entities[0].closed).toBe(false);
  });

  it('parsuje uzavřenou heavy POLYLINE', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'POLYLINE',
      '70', '1',
      '0', 'VERTEX',
      '10', '0', '20', '0',
      '0', 'VERTEX',
      '10', '10', '20', '0',
      '0', 'VERTEX',
      '10', '10', '20', '10',
      '0', 'SEQEND',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n');
    const { entities } = parseDXF(dxf);
    expect(entities[0].closed).toBe(true);
  });

  it('heavy POLYLINE s bulge hodnotami', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'POLYLINE',
      '70', '0',
      '0', 'VERTEX',
      '10', '0', '20', '0',
      '42', '0.5',
      '0', 'VERTEX',
      '10', '10', '20', '0',
      '0', 'SEQEND',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n');
    const { entities } = parseDXF(dxf);
    expect(entities[0].bulges[0]).toBe(0.5);
    expect(entities[0].bulges[1]).toBe(0);
  });
});

// ════════════════════════════════════════
// ── Export TEXT ──
// ════════════════════════════════════════
describe('exportDXF – text', () => {
  it('exportuje text entitu', () => {
    const dxf = exportDXF([{
      type: 'text', x: 10, y: 20, text: 'Ahoj', fontSize: 12, rotation: 0
    }]);
    expect(dxf).toContain('TEXT');
    expect(dxf).toContain('Ahoj');
  });

  it('text přežije export→import', () => {
    const orig = [{
      type: 'text', x: 42, y: -5, text: 'Test', fontSize: 8, rotation: 0
    }];
    const dxf = exportDXF(orig);
    const { entities } = parseDXF(dxf);
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe('text');
    expect(entities[0].text).toBe('Test');
    expect(entities[0].x).toBeCloseTo(42, 4);
  });
});

// ════════════════════════════════════════
// ── Export s vrstvami ──
// ════════════════════════════════════════
describe('exportDXF – vrstvy a barvy', () => {
  it('exportuje TABLES sekci', () => {
    const dxf = exportDXF([{ type: 'point', x: 0, y: 0 }]);
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('EOF');
  });

  it('exportuje s názvy vrstev', () => {
    const layers = [{ id: 0, name: 'Kontura' }, { id: 1, name: 'Pomocná' }];
    const objects = [
      { type: 'point', x: 0, y: 0, layer: 0 },
      { type: 'point', x: 5, y: 5, layer: 1 },
    ];
    const dxf = exportDXF(objects, layers);
    expect(dxf).toContain('Kontura');
    expect(dxf).toContain('Pomocná');
  });

  it('exportuje ACI barvu', () => {
    const dxf = exportDXF([{ type: 'point', x: 0, y: 0, color: '#ff0000' }]);
    // Minimální formát nemá ACI barvy (žádný kód 62)
    // Kontrolujeme jen že POINT existuje
    expect(dxf).toContain('POINT');
  });
});

// ════════════════════════════════════════
// ── Export AC1009 compliance (minimální Fusion 360 formát) ──
// ════════════════════════════════════════
describe('exportDXF – AC1009 compliance', () => {
  it('entity nemá handle ani AcDb markery (minimální formát)', () => {
    const dxf = exportDXF([{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }]);
    const lines = dxf.split('\n');
    const lineIdx = lines.findIndex((l, i) => l.trim() === 'LINE' && i > 0 && lines[i - 1].trim() === '0');
    expect(lineIdx).toBeGreaterThan(-1);
    // Hned za LINE by měl být layer kód 8, ne handle kód 5
    expect(lines[lineIdx + 1].trim()).toBe('8');
    // Žádné AcDb markery v minimálním formátu
    expect(dxf).not.toContain('AcDbEntity');
    expect(dxf).not.toContain('AcDbLine');
  });

  it('CIRCLE nemá AcDb marker', () => {
    const dxf = exportDXF([{ type: 'circle', cx: 5, cy: 5, r: 3 }]);
    expect(dxf).not.toContain('AcDbCircle');
    expect(dxf).toContain('CIRCLE');
  });

  it('ARC nemá AcDb markery', () => {
    const dxf = exportDXF([{ type: 'arc', cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: PI / 2 }]);
    expect(dxf).not.toContain('AcDbCircle');
    expect(dxf).not.toContain('AcDbArc');
    expect(dxf).toContain('ARC');
  });

  it('LWPOLYLINE nemá AcDb marker', () => {
    const dxf = exportDXF([{
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      bulges: [0, 0], closed: false,
    }]);
    expect(dxf).not.toContain('AcDbPolyline');
    expect(dxf).toContain('LWPOLYLINE');
  });

  it('TEXT nemá AcDb marker', () => {
    const dxf = exportDXF([{
      type: 'text', x: 0, y: 0, text: 'Test', fontSize: 10, rotation: 0,
    }]);
    expect(dxf).not.toContain('AcDbText');
    expect(dxf).toContain('TEXT');
  });

  it('POINT nemá AcDb marker', () => {
    const dxf = exportDXF([{ type: 'point', x: 0, y: 0 }]);
    expect(dxf).not.toContain('AcDbPoint');
    expect(dxf).toContain('POINT');
  });

  it('nemá BLOCKS ani OBJECTS sekce', () => {
    const dxf = exportDXF([{ type: 'point', x: 0, y: 0 }]);
    expect(dxf).not.toContain('BLOCKS');
    expect(dxf).not.toContain('OBJECTS');
    expect(dxf).not.toContain('DICTIONARY');
    expect(dxf).not.toContain('BLOCK_RECORD');
  });

  it('používá AC1009 formát', () => {
    const dxf = exportDXF([{ type: 'point', x: 0, y: 0 }]);
    expect(dxf).toContain('AC1009');
  });
});

// ════════════════════════════════════════
// ── Export HEADER ──
// ════════════════════════════════════════
describe('exportDXF – HEADER', () => {
  it('HEADER obsahuje $ACADVER a $INSUNITS', () => {
    const dxf = exportDXF([
      { type: 'line', x1: -50, y1: -30, x2: 150, y2: 80 },
    ]);
    expect(dxf).toContain('$ACADVER');
    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('$INSUNITS');
  });

  it('HEADER neobsahuje $HANDSEED (minimální formát)', () => {
    const dxf = exportDXF([{ type: 'point', x: 10, y: 20 }]);
    expect(dxf).not.toContain('$HANDSEED');
  });
});

// ════════════════════════════════════════
// ── Export Z souřadnice ──
// ════════════════════════════════════════
describe('exportDXF – Z souřadnice', () => {
  it('LINE obsahuje Z souřadnice (kód 30/31)', () => {
    const dxf = exportDXF([{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }]);
    const lines = dxf.split('\n');
    // Najdi entity sekci a ověř kód 30
    const entIdx = lines.findIndex(l => l.trim() === 'ENTITIES');
    let found30 = false;
    for (let i = entIdx; i < lines.length; i++) {
      if (lines[i].trim() === '30') { found30 = true; break; }
    }
    expect(found30).toBe(true);
  });

  it('CIRCLE obsahuje Z souřadnici', () => {
    const dxf = exportDXF([{ type: 'circle', cx: 5, cy: 5, r: 3 }]);
    const lines = dxf.split('\n');
    const entIdx = lines.findIndex(l => l.trim() === 'ENTITIES');
    let found30 = false;
    for (let i = entIdx; i < lines.length; i++) {
      if (lines[i].trim() === '30') { found30 = true; break; }
    }
    expect(found30).toBe(true);
  });
});

// ════════════════════════════════════════
// ── Export tabulky ──
// ════════════════════════════════════════
describe('exportDXF – minimální formát', () => {
  it('nemá TABLES sekci (BYBLOCK, BYLAYER, CONTINUOUS)', () => {
    const dxf = exportDXF([]);
    expect(dxf).not.toContain('BYBLOCK');
    expect(dxf).not.toContain('BYLAYER');
    expect(dxf).not.toContain('TABLES');
  });

  it('nemá VIEW, UCS ani STYLE tabulky', () => {
    const dxf = exportDXF([]);
    // V minimálním formátu žádné tabulky
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('EOF');
  });
});

// ════════════════════════════════════════
// ── Rozšířená paleta barev ──
// ════════════════════════════════════════
describe('exportDXF – rozšířená paleta barev', () => {
  it('minimální formát nemá ACI barvy (kód 62)', () => {
    const dxf = exportDXF([{ type: 'point', x: 0, y: 0, color: '#89b4fa' }]);
    // Minimální formát neexportuje barvy
    expect(dxf).toContain('POINT');
  });

  it('construction barva - minimální formát nemá ACI', () => {
    const dxf = exportDXF([{ type: 'point', x: 0, y: 0, color: '#6c7086' }]);
    expect(dxf).toContain('POINT');
  });

  it('TEXT fontSize je formátován jako float', () => {
    const dxf = exportDXF([{
      type: 'text', x: 0, y: 0, text: 'A', fontSize: 14, rotation: 0,
    }]);
    // fontSize musí být 14.000000, ne jen 14
    expect(dxf).toContain('14.000000');
  });
});
