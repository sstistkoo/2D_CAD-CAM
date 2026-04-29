// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: geometry.js (průsečíky, tečny, operace)     ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mockujeme render.js (přistupuje k DOM přes canvas.js)
vi.mock('../js/render.js', () => ({
  renderAll: vi.fn(),
  renderAllDebounced: vi.fn(),
}));

import {
  intersectLineLine,
  intersectLineCircle,
  intersectCircleCircle,
  tangentsFromPointToCircle,
  tangentsTwoCircles,
  distToObject,
  projectPointToLine,
  offsetObject,
  mirrorObject,
  linearArray,
  rotateObject,
  filletTwoLines,
  circlePositionsTangentToLine,
  circlePositionsTangentToTwoLines,
  circlePositionsTangentToLineAndPoint,
  circleTangentToThreeLines,
  circleTangentToTwoLinesAndPoint,
  circleTangentToLineAndTwoPoints,
  getLines,
  getCircles,
  calculateAllIntersections,
} from '../js/geometry.js';
import { state } from '../js/state.js';

const PI = Math.PI;

// ════════════════════════════════════════
// ── intersectLineLine ──
// ════════════════════════════════════════
describe('intersectLineLine', () => {
  it('kolmý průsečík v bodě (5,5)', () => {
    const r = intersectLineLine(
      { x1: 0, y1: 0, x2: 10, y2: 10 },
      { x1: 0, y1: 10, x2: 10, y2: 0 }
    );
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(5, 8);
    expect(r[0].y).toBeCloseTo(5, 8);
  });

  it('rovnoběžné úsečky → žádný průsečík', () => {
    const r = intersectLineLine(
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x1: 0, y1: 5, x2: 10, y2: 5 }
    );
    expect(r).toHaveLength(0);
  });

  it('T-křížení na konci úsečky', () => {
    const r = intersectLineLine(
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x1: 5, y1: -5, x2: 5, y2: 0 }
    );
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(5, 8);
    expect(r[0].y).toBeCloseTo(0, 8);
  });

  it('mimo rozsah segmentů → žádný průsečík', () => {
    const r = intersectLineLine(
      { x1: 0, y1: 0, x2: 1, y2: 0 },
      { x1: 5, y1: -1, x2: 5, y2: 1 }
    );
    expect(r).toHaveLength(0);
  });

  it('konstrukční (nekonečná) + segment → průsečík', () => {
    const r = intersectLineLine(
      { x1: 0, y1: 0, x2: 1, y2: 0, isConstr: true },
      { x1: 5, y1: -1, x2: 5, y2: 1 }
    );
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(5, 8);
    expect(r[0].y).toBeCloseTo(0, 8);
  });

  it('obě konstrukční → průsečík i daleko od segmentů', () => {
    const r = intersectLineLine(
      { x1: 0, y1: 0, x2: 1, y2: 0, isConstr: true },
      { x1: 100, y1: -1, x2: 100, y2: 1, isConstr: true }
    );
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(100, 8);
  });

  it('totožné úsečky (denom≈0) → žádný průsečík', () => {
    const r = intersectLineLine(
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x1: 0, y1: 0, x2: 10, y2: 0 }
    );
    expect(r).toHaveLength(0);
  });

  it('úsečky sdílí koncový bod', () => {
    const r = intersectLineLine(
      { x1: 0, y1: 0, x2: 5, y2: 5 },
      { x1: 5, y1: 5, x2: 10, y2: 0 }
    );
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(5, 8);
    expect(r[0].y).toBeCloseTo(5, 8);
  });

  it('svislá a vodorovná úsečka', () => {
    const r = intersectLineLine(
      { x1: 0, y1: 0, x2: 10, y2: 0 },  // vodorovná
      { x1: 3, y1: -5, x2: 3, y2: 5 }   // svislá
    );
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(3, 8);
    expect(r[0].y).toBeCloseTo(0, 8);
  });

  it('šikmé úsečky pod ostrým úhlem', () => {
    const r = intersectLineLine(
      { x1: 0, y1: 0, x2: 10, y2: 1 },
      { x1: 0, y1: 1, x2: 10, y2: 0 }
    );
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(5, 8);
    expect(r[0].y).toBeCloseTo(0.5, 8);
  });
});

// ════════════════════════════════════════
// ── intersectLineCircle ──
// ════════════════════════════════════════
describe('intersectLineCircle', () => {
  it('sečna — 2 průsečíky', () => {
    const r = intersectLineCircle(
      { x1: -20, y1: 0, x2: 20, y2: 0 },
      { cx: 0, cy: 0, r: 10 }
    );
    expect(r).toHaveLength(2);
    const xs = r.map(p => p.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-10, 6);
    expect(xs[1]).toBeCloseTo(10, 6);
  });

  it('tečna — 1 průsečík', () => {
    // Vodorovná čára y=10, kružnice (0,0) r=10
    const r = intersectLineCircle(
      { x1: -20, y1: 10, x2: 20, y2: 10 },
      { cx: 0, cy: 0, r: 10 }
    );
    // Tečna vrací 1 bod (deduplikováno — disc≈0 dává oba kořeny stejné)
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(0, 6);
    expect(r[0].y).toBeCloseTo(10, 6);
  });

  it('míjení — žádný průsečík', () => {
    const r = intersectLineCircle(
      { x1: -20, y1: 20, x2: 20, y2: 20 },
      { cx: 0, cy: 0, r: 5 }
    );
    expect(r).toHaveLength(0);
  });

  it('segment krátký — průsečík mimo dosah úsečky', () => {
    // Krátký segment daleko od kružnice
    const r = intersectLineCircle(
      { x1: -100, y1: 0, x2: -90, y2: 0 },
      { cx: 0, cy: 0, r: 10 }
    );
    expect(r).toHaveLength(0);
  });

  it('konstrukční čára — průsečík i mimo dosah segmentu', () => {
    const r = intersectLineCircle(
      { x1: -100, y1: 0, x2: -90, y2: 0, isConstr: true },
      { cx: 0, cy: 0, r: 10 }
    );
    expect(r).toHaveLength(2);
  });

  it('oblouk — průsečík v úhlovém rozsahu', () => {
    // Horní půlkruh 0→π
    const r = intersectLineCircle(
      { x1: -20, y1: 5, x2: 20, y2: 5 },
      { cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: PI }
    );
    // Čára y=5 protíná kružnici r=10 ve dvou bodech, oba v horní půlce
    expect(r.length).toBeGreaterThanOrEqual(1);
    for (const p of r) {
      expect(p.y).toBeCloseTo(5, 6);
    }
  });

  it('oblouk — průsečík mimo úhlový rozsah → filtrováno', () => {
    // Pravá čtvrtina 0→π/4 (malý oblouk)
    // Čára y=5 protíná kružnici r=10 v bodech kde sin>0.5, tj. úhel 30°-150°
    // Úhlový rozsah 0→π/4 (0°-45°) → zachytí bod ~30° = π/6
    const r = intersectLineCircle(
      { x1: -20, y1: 5, x2: 20, y2: 5 },
      { cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: PI / 4 }
    );
    // Bod s y=5 na kružnici r=10: x = ±√(100-25) = ±√75 ≈ ±8.66, angle ≈ ±30°
    // 30° = π/6 < π/4 = 45° → bod v 1. kvadrantu je v rozsahu
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeGreaterThan(0); // pravý bod
  });

  it('degenerovaná úsečka (nulová délka) → prázdné', () => {
    const r = intersectLineCircle(
      { x1: 5, y1: 5, x2: 5, y2: 5 },
      { cx: 0, cy: 0, r: 10 }
    );
    expect(r).toHaveLength(0);
  });

  it('svislá čára protínající kružnici', () => {
    const r = intersectLineCircle(
      { x1: 5, y1: -20, x2: 5, y2: 20 },
      { cx: 0, cy: 0, r: 10 }
    );
    expect(r).toHaveLength(2);
    for (const p of r) {
      expect(p.x).toBeCloseTo(5, 6);
    }
    const ys = r.map(p => p.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-Math.sqrt(75), 4);
    expect(ys[1]).toBeCloseTo(Math.sqrt(75), 4);
  });
});

// ════════════════════════════════════════
// ── intersectCircleCircle ──
// ════════════════════════════════════════
describe('intersectCircleCircle', () => {
  it('2 průsečíky', () => {
    const r = intersectCircleCircle(
      { cx: 0, cy: 0, r: 10 },
      { cx: 15, cy: 0, r: 10 }
    );
    expect(r).toHaveLength(2);
    for (const p of r) {
      // Oba body leží na obou kružnicích
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 4);
      expect(Math.hypot(p.x - 15, p.y)).toBeCloseTo(10, 4);
    }
  });

  it('vnější dotyk → 1 průsečík', () => {
    const r = intersectCircleCircle(
      { cx: 0, cy: 0, r: 5 },
      { cx: 10, cy: 0, r: 5 }
    );
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(5, 4);
    expect(r[0].y).toBeCloseTo(0, 4);
  });

  it('vnitřní dotyk → 1 průsečík', () => {
    const r = intersectCircleCircle(
      { cx: 0, cy: 0, r: 10 },
      { cx: 5, cy: 0, r: 5 }
    );
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(10, 4);
    expect(r[0].y).toBeCloseTo(0, 4);
  });

  it('soustředné (stejný střed) → žádný průsečík', () => {
    const r = intersectCircleCircle(
      { cx: 0, cy: 0, r: 5 },
      { cx: 0, cy: 0, r: 10 }
    );
    expect(r).toHaveLength(0);
  });

  it('příliš daleko → žádný průsečík', () => {
    const r = intersectCircleCircle(
      { cx: 0, cy: 0, r: 5 },
      { cx: 100, cy: 0, r: 5 }
    );
    expect(r).toHaveLength(0);
  });

  it('jedna úplně uvnitř druhé → žádný průsečík', () => {
    const r = intersectCircleCircle(
      { cx: 0, cy: 0, r: 20 },
      { cx: 1, cy: 0, r: 3 }
    );
    expect(r).toHaveLength(0);
  });

  it('oblouk — průsečík mimo úhlový rozsah → filtrováno', () => {
    // Kružnice (0,0) r=10 + oblouk (15,0) r=10 startAngle=0, endAngle=PI/4
    // Průsečíky kružnic jsou ±y, ale oblouk pokrývá jen malý rozsah nad osou X
    const r = intersectCircleCircle(
      { cx: 0, cy: 0, r: 10 },
      { cx: 15, cy: 0, r: 10, startAngle: -PI / 8, endAngle: PI / 8 }
    );
    // Bod nahoře bude mimo malý rozsah oblouku
    // Pouze body v úzkém rozsahu ±22.5° projdou
    // Skutečné průsečíky: x=7.5, y=±√(100-56.25)=±√43.75≈±6.61
    // Úhel z (15,0): atan2(±6.61, 7.5-15) = atan2(±6.61, -7.5) ≈ ±139°
    // To je mimo rozsah -22.5°...22.5° → žádný průsečík
    expect(r).toHaveLength(0);
  });

  it('stejné kružnice (d=0) → žádný průsečík', () => {
    const r = intersectCircleCircle(
      { cx: 5, cy: 5, r: 10 },
      { cx: 5, cy: 5, r: 10 }
    );
    expect(r).toHaveLength(0);
  });

  it('symetrické průsečíky podél osy Y', () => {
    const r = intersectCircleCircle(
      { cx: 0, cy: 0, r: 10 },
      { cx: 10, cy: 0, r: 10 }
    );
    expect(r).toHaveLength(2);
    // Průsečíky by měly být symetrické kolem osy X
    const ys = r.map(p => p.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-ys[1], 6);
    // Oba mají stejné X
    expect(r[0].x).toBeCloseTo(r[1].x, 6);
    expect(r[0].x).toBeCloseTo(5, 6);
  });
});

// ════════════════════════════════════════
// ── tangentsFromPointToCircle ──
// ════════════════════════════════════════
describe('tangentsFromPointToCircle', () => {
  it('bod vně kružnice → 2 tečny', () => {
    const r = tangentsFromPointToCircle(20, 0, 0, 0, 5);
    expect(r).toHaveLength(2);
    for (const t of r) {
      // Tečný bod leží na kružnici
      expect(Math.hypot(t.x2, t.y2)).toBeCloseTo(5, 4);
      // Tečna začíná v bodě
      expect(t.x1).toBe(20);
      expect(t.y1).toBe(0);
    }
  });

  it('bod na kružnici → 1 tečna (kolmice)', () => {
    const r = tangentsFromPointToCircle(5, 0, 0, 0, 5);
    expect(r).toHaveLength(1);
  });

  it('bod uvnitř kružnice → žádná tečna', () => {
    const r = tangentsFromPointToCircle(2, 0, 0, 0, 5);
    expect(r).toHaveLength(0);
  });

  it('bod přímo nad středem → symetrické tečny', () => {
    const r = tangentsFromPointToCircle(0, 20, 0, 0, 5);
    expect(r).toHaveLength(2);
    // Tečné body by měly být symetrické kolem osy Y
    expect(r[0].x2).toBeCloseTo(-r[1].x2, 4);
    expect(r[0].y2).toBeCloseTo(r[1].y2, 4);
  });

  it('tečna je kolmá k poloměru v tečném bodě', () => {
    const r = tangentsFromPointToCircle(20, 0, 0, 0, 5);
    for (const t of r) {
      // Vektor poloměru: (t.x2, t.y2)
      // Vektor tečny: (t.x2-t.x1, t.y2-t.y1) = (t.x2-20, t.y2)
      const dot = t.x2 * (t.x2 - 20) + t.y2 * (t.y2 - 0);
      expect(dot).toBeCloseTo(0, 2); // kolmost = skalární součin ≈ 0
    }
  });
});

// ════════════════════════════════════════
// ── tangentsTwoCircles ──
// ════════════════════════════════════════
describe('tangentsTwoCircles', () => {
  it('oddělené kružnice → 4 tečny (2 vnější + 2 vnitřní)', () => {
    const r = tangentsTwoCircles(0, 0, 5, 30, 0, 5);
    expect(r).toHaveLength(4);
  });

  it('stejný poloměr daleko → vnější tečny jsou rovnoběžné', () => {
    const r = tangentsTwoCircles(0, 0, 5, 50, 0, 5);
    // Vnější tečny (první 2) mají stejný úhel
    const tanAngle0 = Math.atan2(r[0].y2 - r[0].y1, r[0].x2 - r[0].x1);
    const tanAngle1 = Math.atan2(r[1].y2 - r[1].y1, r[1].x2 - r[1].x1);
    // Oba úhly by měly být ~0 (vodorovné), nebo zrcadlové
    expect(Math.abs(tanAngle0)).toBeCloseTo(Math.abs(tanAngle1), 2);
  });

  it('dotykající se kružnice → 4 tečny (2 vnější + 2 degenerované vnitřní)', () => {
    const r = tangentsTwoCircles(0, 0, 5, 10, 0, 5);
    // Funkce neděduplikuje — vnitřní tečny splývají v bodě dotyku
    expect(r).toHaveLength(4);
  });

  it('soustředné (d=0) → žádná tečna', () => {
    const r = tangentsTwoCircles(0, 0, 5, 0, 0, 10);
    expect(r).toHaveLength(0);
  });

  it('kružnice překrývající se → 2 vnější tečny', () => {
    // r1 + r2 > d → žádné vnitřní, ale |r1-r2| < d → vnější existují
    const r = tangentsTwoCircles(0, 0, 10, 8, 0, 10);
    expect(r).toHaveLength(2);
  });

  it('tečné body leží na příslušných kružnicích', () => {
    const r = tangentsTwoCircles(0, 0, 5, 30, 0, 8);
    for (const t of r) {
      expect(Math.hypot(t.x1, t.y1)).toBeCloseTo(5, 2);
      expect(Math.hypot(t.x2 - 30, t.y2)).toBeCloseTo(8, 2);
    }
  });
});

// ════════════════════════════════════════
// ── distToObject ──
// ════════════════════════════════════════
describe('distToObject', () => {
  it('vzdálenost k bodu', () => {
    expect(distToObject({ type: 'point', x: 10, y: 0 }, 0, 0)).toBeCloseTo(10, 8);
  });

  it('vzdálenost k úsečce', () => {
    expect(distToObject({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, 5, 3)).toBeCloseTo(3, 8);
  });

  it('vzdálenost ke kružnici', () => {
    // Bod (20,0), kružnice (0,0) r=10 → vzdálenost od obvodu = 10
    expect(distToObject({ type: 'circle', cx: 0, cy: 0, r: 10 }, 20, 0)).toBeCloseTo(10, 8);
  });

  it('vzdálenost ke kružnici — bod uvnitř', () => {
    expect(distToObject({ type: 'circle', cx: 0, cy: 0, r: 10 }, 3, 0)).toBeCloseTo(7, 8);
  });

  it('vzdálenost k oblouku — bod v úhlovém rozsahu', () => {
    const d = distToObject(
      { type: 'arc', cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: PI / 2 },
      15, 0
    );
    expect(d).toBeCloseTo(5, 8);
  });

  it('vzdálenost k oblouku — bod mimo úhlový rozsah (penalizace)', () => {
    const d = distToObject(
      { type: 'arc', cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: PI / 4 },
      -15, 0 // bod naproti oblouku
    );
    // Vzdálenost od kružnice = 5, ale mimo rozsah → +100
    expect(d).toBeGreaterThan(100);
  });

  it('vzdálenost k obdélníku', () => {
    const d = distToObject(
      { type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 },
      5, -3 // bod pod spodní hranou
    );
    expect(d).toBeCloseTo(3, 8);
  });

  it('vzdálenost k polyline (přímé segmenty)', () => {
    const d = distToObject(
      {
        type: 'polyline',
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
        bulges: [0, 0],
        closed: false,
      },
      5, 3
    );
    expect(d).toBeCloseTo(3, 8);
  });

  it('neznámý typ → Infinity', () => {
    expect(distToObject({ type: 'alien' }, 0, 0)).toBe(Infinity);
  });
});

// ════════════════════════════════════════
// ── projectPointToLine ──
// ════════════════════════════════════════
describe('projectPointToLine', () => {
  it('projekce na vodorovnou přímku', () => {
    const p = projectPointToLine(5, 7, 0, 0, 10, 0);
    expect(p.x).toBeCloseTo(5, 8);
    expect(p.y).toBeCloseTo(0, 8);
  });

  it('projekce na svislou přímku', () => {
    const p = projectPointToLine(7, 5, 0, 0, 0, 10);
    expect(p.x).toBeCloseTo(0, 8);
    expect(p.y).toBeCloseTo(5, 8);
  });

  it('projekce na šikmou přímku', () => {
    // Přímka (0,0)→(10,10), bod (0,10) → projekce (5,5)
    const p = projectPointToLine(0, 10, 0, 0, 10, 10);
    expect(p.x).toBeCloseTo(5, 8);
    expect(p.y).toBeCloseTo(5, 8);
  });

  it('bod na přímce → vrátí sám sebe', () => {
    const p = projectPointToLine(5, 5, 0, 0, 10, 10);
    expect(p.x).toBeCloseTo(5, 8);
    expect(p.y).toBeCloseTo(5, 8);
  });

  it('degenerovaný segment → vrátí počáteční bod', () => {
    const p = projectPointToLine(5, 5, 3, 3, 3, 3);
    expect(p.x).toBeCloseTo(3, 8);
    expect(p.y).toBeCloseTo(3, 8);
  });

  it('projekce za konec segmentu (t>1) — nekonečná přímka', () => {
    // projectPointToLine neomezuje t na [0,1]
    const p = projectPointToLine(20, 3, 0, 0, 10, 0);
    expect(p.x).toBeCloseTo(20, 8);
    expect(p.y).toBeCloseTo(0, 8);
  });
});

// ════════════════════════════════════════
// ── offsetObject ──
// ════════════════════════════════════════
describe('offsetObject', () => {
  it('offset úsečky vlevo', () => {
    const obj = { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, name: 'L1' };
    const result = offsetObject(obj, 5, 1);
    expect(result).not.toBeNull();
    expect(result.type).toBe('line');
    // Offset vodorovné úsečky o 5 nahoru (normála je -dy, dx → 0, 10 → normála -1, 0...
    // wait: dx=10, dy=0, len=10, nx = -0/10*5 = 0, ny = 10/10*5 = 5
    // Takže y1 a y2 se posune o 5
    expect(result.y1).toBeCloseTo(5, 8);
    expect(result.y2).toBeCloseTo(5, 8);
    expect(result.x1).toBeCloseTo(0, 8);
    expect(result.x2).toBeCloseTo(10, 8);
  });

  it('offset úsečky vpravo (side=-1)', () => {
    const obj = { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, name: 'L1' };
    const result = offsetObject(obj, 5, -1);
    expect(result.y1).toBeCloseTo(-5, 8);
    expect(result.y2).toBeCloseTo(-5, 8);
  });

  it('offset kružnice — zvětšení poloměru', () => {
    const obj = { type: 'circle', cx: 0, cy: 0, r: 10, name: 'C1' };
    const result = offsetObject(obj, 5, 1);
    expect(result.r).toBeCloseTo(15, 8);
    expect(result.cx).toBe(0);
    expect(result.cy).toBe(0);
  });

  it('offset kružnice — zmenšení poloměru', () => {
    const obj = { type: 'circle', cx: 0, cy: 0, r: 10, name: 'C1' };
    const result = offsetObject(obj, 5, -1);
    expect(result.r).toBeCloseTo(5, 8);
  });

  it('offset kružnice — poloměr by byl záporný → null', () => {
    const obj = { type: 'circle', cx: 0, cy: 0, r: 3, name: 'C1' };
    expect(offsetObject(obj, 5, -1)).toBeNull();
  });

  it('offset obdélníku — zvětšení', () => {
    const obj = { type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10, name: 'R1' };
    const result = offsetObject(obj, 2, 1);
    expect(result.x1).toBeCloseTo(-2, 8);
    expect(result.y1).toBeCloseTo(-2, 8);
    expect(result.x2).toBeCloseTo(12, 8);
    expect(result.y2).toBeCloseTo(12, 8);
  });

  it('offset obdélníku — zmenšení do nuly → null', () => {
    const obj = { type: 'rect', x1: 0, y1: 0, x2: 4, y2: 4, name: 'R1' };
    expect(offsetObject(obj, 3, -1)).toBeNull();
  });

  it('offset bodu → null', () => {
    expect(offsetObject({ type: 'point', x: 0, y: 0 }, 5, 1)).toBeNull();
  });

  it('offset oblouku', () => {
    const obj = { type: 'arc', cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: PI, name: 'A1' };
    const result = offsetObject(obj, 5, 1);
    expect(result.r).toBeCloseTo(15, 8);
    expect(result.startAngle).toBe(0);
    expect(result.endAngle).toBe(PI);
  });
});

// ════════════════════════════════════════
// ── mirrorObject ──
// ════════════════════════════════════════
describe('mirrorObject', () => {
  it('zrcadlení bodu přes osu X', () => {
    const result = mirrorObject({ type: 'point', x: 5, y: 10, name: 'P1' }, 'x');
    expect(result.x).toBeCloseTo(5, 8);
    expect(result.y).toBeCloseTo(-10, 8);
  });

  it('zrcadlení bodu přes osu Z (svisle)', () => {
    const result = mirrorObject({ type: 'point', x: 5, y: 10, name: 'P1' }, 'z');
    expect(result.x).toBeCloseTo(-5, 8);
    expect(result.y).toBeCloseTo(10, 8);
  });

  it('zrcadlení bodu přes vlastní osu', () => {
    // Osa Y=0 (vodorovná přes počátek)
    const result = mirrorObject(
      { type: 'point', x: 3, y: 7, name: 'P1' },
      'custom',
      { x: 0, y: 0 }, { x: 10, y: 0 }
    );
    expect(result.x).toBeCloseTo(3, 8);
    expect(result.y).toBeCloseTo(-7, 8);
  });

  it('zrcadlení úsečky přes osu X', () => {
    const result = mirrorObject(
      { type: 'line', x1: 0, y1: 5, x2: 10, y2: 15, name: 'L1' },
      'x'
    );
    expect(result.x1).toBeCloseTo(0, 8);
    expect(result.y1).toBeCloseTo(-5, 8);
    expect(result.x2).toBeCloseTo(10, 8);
    expect(result.y2).toBeCloseTo(-15, 8);
  });

  it('zrcadlení kružnice', () => {
    const result = mirrorObject(
      { type: 'circle', cx: 5, cy: 10, r: 3, name: 'C1' },
      'x'
    );
    expect(result.cx).toBeCloseTo(5, 8);
    expect(result.cy).toBeCloseTo(-10, 8);
    expect(result.r).toBe(3); // poloměr se nemění
  });

  it('zrcadlení obdélníku', () => {
    const result = mirrorObject(
      { type: 'rect', x1: 1, y1: 2, x2: 5, y2: 8, name: 'R1' },
      'x'
    );
    expect(result.y1).toBeCloseTo(-2, 8);
    expect(result.y2).toBeCloseTo(-8, 8);
  });

  it('zrcadlení polyline obrací bulge', () => {
    const result = mirrorObject(
      {
        type: 'polyline',
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
        bulges: [0.5],
        closed: false, name: 'PL1'
      },
      'x'
    );
    expect(result.bulges[0]).toBeCloseTo(-0.5, 8);
  });

  it('nemodifikuje originální objekt', () => {
    const orig = { type: 'point', x: 5, y: 10, name: 'P1' };
    mirrorObject(orig, 'x');
    expect(orig.y).toBe(10); // bez změny
  });

  it('výsledek nemá id', () => {
    const result = mirrorObject({ type: 'point', x: 5, y: 10, id: 99, name: 'P1' }, 'x');
    expect(result.id).toBeUndefined();
  });
});

// ════════════════════════════════════════
// ── linearArray ──
// ════════════════════════════════════════
describe('linearArray', () => {
  it('3 kopie bodu s posunem dx=10', () => {
    const copies = linearArray({ type: 'point', x: 0, y: 0, name: 'P1' }, 10, 0, 3);
    expect(copies).toHaveLength(3);
    expect(copies[0].x).toBeCloseTo(10, 8);
    expect(copies[1].x).toBeCloseTo(20, 8);
    expect(copies[2].x).toBeCloseTo(30, 8);
  });

  it('kopie úsečky s diagonálním posunem', () => {
    const copies = linearArray(
      { type: 'line', x1: 0, y1: 0, x2: 5, y2: 5, name: 'L1' }, 3, 4, 2
    );
    expect(copies).toHaveLength(2);
    expect(copies[0].x1).toBeCloseTo(3, 8);
    expect(copies[0].y1).toBeCloseTo(4, 8);
    expect(copies[1].x1).toBeCloseTo(6, 8);
    expect(copies[1].y1).toBeCloseTo(8, 8);
  });

  it('kopie kružnice', () => {
    const copies = linearArray(
      { type: 'circle', cx: 0, cy: 0, r: 5, name: 'C1' }, 20, 0, 2
    );
    expect(copies[0].cx).toBeCloseTo(20, 8);
    expect(copies[0].r).toBe(5); // poloměr se nemění
    expect(copies[1].cx).toBeCloseTo(40, 8);
  });

  it('kopie polyline', () => {
    const copies = linearArray(
      {
        type: 'polyline',
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
        bulges: [0], closed: false, name: 'PL1'
      }, 5, 5, 1
    );
    expect(copies[0].vertices[0].x).toBeCloseTo(5, 8);
    expect(copies[0].vertices[0].y).toBeCloseTo(5, 8);
    expect(copies[0].vertices[1].x).toBeCloseTo(15, 8);
  });

  it('count=0 → prázdné pole', () => {
    const copies = linearArray({ type: 'point', x: 0, y: 0, name: 'P1' }, 10, 0, 0);
    expect(copies).toHaveLength(0);
  });

  it('kopie nemají id', () => {
    const copies = linearArray({ type: 'point', x: 0, y: 0, id: 1, name: 'P1' }, 10, 0, 1);
    expect(copies[0].id).toBeUndefined();
  });
});

// ════════════════════════════════════════
// ── rotateObject ──
// ════════════════════════════════════════
describe('rotateObject', () => {
  it('rotace bodu o 90° kolem počátku', () => {
    const obj = { type: 'point', x: 10, y: 0 };
    rotateObject(obj, 0, 0, PI / 2);
    expect(obj.x).toBeCloseTo(0, 6);
    expect(obj.y).toBeCloseTo(10, 6);
  });

  it('rotace bodu o 180°', () => {
    const obj = { type: 'point', x: 5, y: 3 };
    rotateObject(obj, 0, 0, PI);
    expect(obj.x).toBeCloseTo(-5, 6);
    expect(obj.y).toBeCloseTo(-3, 6);
  });

  it('rotace bodu o 360° → stejná pozice', () => {
    const obj = { type: 'point', x: 7, y: 11 };
    rotateObject(obj, 0, 0, 2 * PI);
    expect(obj.x).toBeCloseTo(7, 6);
    expect(obj.y).toBeCloseTo(11, 6);
  });

  it('rotace kolem jiného středu', () => {
    // Bod (10,5) otočený o 90° kolem (5,5)
    const obj = { type: 'point', x: 10, y: 5 };
    rotateObject(obj, 5, 5, PI / 2);
    expect(obj.x).toBeCloseTo(5, 6);
    expect(obj.y).toBeCloseTo(10, 6);
  });

  it('rotace úsečky', () => {
    const obj = { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
    rotateObject(obj, 0, 0, PI / 2);
    expect(obj.x1).toBeCloseTo(0, 6);
    expect(obj.y1).toBeCloseTo(0, 6);
    expect(obj.x2).toBeCloseTo(0, 6);
    expect(obj.y2).toBeCloseTo(10, 6);
  });

  it('rotace kružnice — střed se otočí, poloměr zůstane', () => {
    const obj = { type: 'circle', cx: 10, cy: 0, r: 5 };
    rotateObject(obj, 0, 0, PI / 2);
    expect(obj.cx).toBeCloseTo(0, 6);
    expect(obj.cy).toBeCloseTo(10, 6);
    expect(obj.r).toBe(5);
  });

  it('rotace oblouku — posune start/endAngle', () => {
    const obj = { type: 'arc', cx: 10, cy: 0, r: 5, startAngle: 0, endAngle: PI / 2 };
    rotateObject(obj, 0, 0, PI / 4);
    expect(obj.startAngle).toBeCloseTo(PI / 4, 6);
    expect(obj.endAngle).toBeCloseTo(3 * PI / 4, 6);
  });

  it('rotace polyline', () => {
    const obj = {
      type: 'polyline',
      vertices: [{ x: 10, y: 0 }, { x: 20, y: 0 }],
      bulges: [0], closed: false,
    };
    rotateObject(obj, 0, 0, PI / 2);
    expect(obj.vertices[0].x).toBeCloseTo(0, 6);
    expect(obj.vertices[0].y).toBeCloseTo(10, 6);
    expect(obj.vertices[1].x).toBeCloseTo(0, 6);
    expect(obj.vertices[1].y).toBeCloseTo(20, 6);
  });

  it('in-place modifikace', () => {
    const obj = { type: 'point', x: 10, y: 0 };
    const same = obj;
    rotateObject(obj, 0, 0, PI / 2);
    expect(same.x).toBeCloseTo(0, 6);
    expect(same.y).toBeCloseTo(10, 6);
  });
});

// ════════════════════════════════════════
// ── filletTwoLines ──
// ════════════════════════════════════════
describe('filletTwoLines', () => {
  it('zaoblení dvou kolmých úseček', () => {
    const l1 = { type: 'line', x1: 0, y1: 0, x2: 0, y2: 20 };
    const l2 = { type: 'line', x1: 0, y1: 0, x2: 20, y2: 0 };
    const result = filletTwoLines(l1, l2, 5);
    expect(result.ok).toBe(true);
    expect(result.arc).toBeDefined();
    expect(result.arc.r).toBeCloseTo(5, 4);
    // Oblouk by měl mít rovný tečný bod na obou úsečkách
    const startPt = {
      x: result.arc.cx + result.arc.r * Math.cos(result.arc.startAngle),
      y: result.arc.cy + result.arc.r * Math.sin(result.arc.startAngle),
    };
    const endPt = {
      x: result.arc.cx + result.arc.r * Math.cos(result.arc.endAngle),
      y: result.arc.cy + result.arc.r * Math.sin(result.arc.endAngle),
    };
    // Tečné body leží na osách (kolmých úsečkách)
    expect(
      Math.abs(startPt.x) < 0.01 || Math.abs(startPt.y) < 0.01
    ).toBe(true);
    expect(
      Math.abs(endPt.x) < 0.01 || Math.abs(endPt.y) < 0.01
    ).toBe(true);
  });

  it('rovnoběžné úsečky → chyba', () => {
    const l1 = { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
    const l2 = { type: 'line', x1: 0, y1: 5, x2: 10, y2: 5 };
    const result = filletTwoLines(l1, l2, 5);
    expect(result.ok).toBe(false);
  });

  it('zaoblení ořízne úsečky', () => {
    const l1 = { type: 'line', x1: -20, y1: 0, x2: 0, y2: 0 };
    const l2 = { type: 'line', x1: 0, y1: 0, x2: 0, y2: 20 };
    filletTwoLines(l1, l2, 5);
    // Úsečky by se měly zkrátit k tečným bodům
    // l1 měla koncový bod na (0,0), teď by měla končit na (−5, 0) nebo podobně
    const l1EndX = l1.x2;
    const l2EndY = l2.y1;
    // Tečný bod na l1 je 5 od průsečíku (0,0) ve směru l1 (doleva)
    expect(Math.abs(l1EndX)).toBeCloseTo(5, 2);
  });

  it('zaoblení tupého úhlu — oblouk se napojí přesně', () => {
    // Dvě úsečky svírající tupý úhel (~120°)
    const l1 = { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
    const l2 = { type: 'line', x1: 0, y1: 0, x2: -5, y2: 8.66 };
    const result = filletTwoLines(l1, l2, 3);
    expect(result.ok).toBe(true);
    const arc = result.arc;
    // Ověříme, že tečné body oblouku leží přesně na kružnici oblouku
    const startPt = {
      x: arc.cx + arc.r * Math.cos(arc.startAngle),
      y: arc.cy + arc.r * Math.sin(arc.startAngle),
    };
    const endPt = {
      x: arc.cx + arc.r * Math.cos(arc.endAngle),
      y: arc.cy + arc.r * Math.sin(arc.endAngle),
    };
    // Tečné body musí ležet na příslušných úsečkách (y≈0 pro l1, nebo na l2)
    const onL1 = Math.abs(startPt.y) < 0.01 || Math.abs(endPt.y) < 0.01;
    expect(onL1).toBe(true);
    // CCW sweep musí být menší než π (minor arc)
    const sweep = ((arc.endAngle - arc.startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    expect(sweep).toBeLessThan(Math.PI);
    // Právě oříznutý koncový bod úsečky musí odpovídat tečnému bodu oblouku
    // l1 se ořízne na end blíže k průsečíku → l1.x1 (bližší k 0,0)
    const tp1 = { x: l1.x1, y: l1.y1 };
    const tp2 = { x: l2.x1, y: l2.y1 };
    const dTP1 = Math.hypot(tp1.x - arc.cx, tp1.y - arc.cy);
    const dTP2 = Math.hypot(tp2.x - arc.cx, tp2.y - arc.cy);
    expect(dTP1).toBeCloseTo(arc.r, 6);
    expect(dTP2).toBeCloseTo(arc.r, 6);
  });

  it('zaoblení — oblouk vždy minor arc', () => {
    // Test různých orientací úseček
    const configs = [
      // lines meeting at origin, various angles
      { l1: {x1:0,y1:0,x2:10,y2:0}, l2: {x1:0,y1:0,x2:0,y2:10} },
      { l1: {x1:10,y1:0,x2:0,y2:0}, l2: {x1:0,y1:0,x2:0,y2:10} },
      { l1: {x1:0,y1:0,x2:10,y2:0}, l2: {x1:0,y1:10,x2:0,y2:0} },
      { l1: {x1:10,y1:0,x2:0,y2:0}, l2: {x1:0,y1:10,x2:0,y2:0} },
    ];
    for (const cfg of configs) {
      const result = filletTwoLines(cfg.l1, cfg.l2, 2);
      expect(result.ok).toBe(true);
      const arc = result.arc;
      const sweep = ((arc.endAngle - arc.startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      expect(sweep).toBeLessThan(Math.PI);
      expect(sweep).toBeGreaterThan(0);
    }
  });
});

// ════════════════════════════════════════
// ── circlePositionsTangentToLine ──
// ════════════════════════════════════════
describe('circlePositionsTangentToLine', () => {
  it('dvě pozice tečné k vodorovné úsečce', () => {
    const positions = circlePositionsTangentToLine(5, 5, 3, 0, 0, 10, 0);
    expect(positions).toHaveLength(2);
    // Obě pozice mají y = ±3 (vzdálenost od úsečky y=0)
    const ys = positions.map(p => p.cy).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-3, 6);
    expect(ys[1]).toBeCloseTo(3, 6);
  });

  it('x-ová souřadnice je projekce na úsečku', () => {
    // Kružnice se středem (7, 5), úsečka vodorovná (0,0)→(10,0)
    const positions = circlePositionsTangentToLine(7, 5, 3, 0, 0, 10, 0);
    for (const p of positions) {
      expect(p.cx).toBeCloseTo(7, 6); // projekce zachovává x
    }
  });
});

// ════════════════════════════════════════
// ── circlePositionsTangentToTwoLines ──
// ════════════════════════════════════════
describe('circlePositionsTangentToTwoLines', () => {
  it('dvě kolmé úsečky → 4 pozice', () => {
    const l1 = { x1: -10, y1: 0, x2: 10, y2: 0 };
    const l2 = { x1: 0, y1: -10, x2: 0, y2: 10 };
    const positions = circlePositionsTangentToTwoLines(5, l1, l2);
    expect(positions).toHaveLength(4);
    // Všechny středy by měly být ve vzdálenosti 5 od obou přímek
    for (const p of positions) {
      expect(Math.abs(p.cy)).toBeCloseTo(5, 4); // vzdálenost od x-ové osy
      expect(Math.abs(p.cx)).toBeCloseTo(5, 4); // vzdálenost od y-ové osy
    }
  });

  it('V-úhel (sevřené úsečky) → jen pozice uvnitř úhlu', () => {
    // Dvě úsečky z jednoho bodu tvořící V-úhel (45°)
    const l1 = { x1: 0, y1: 0, x2: 10, y2: 0 };   // vodorovná
    const l2 = { x1: 0, y1: 0, x2: 7, y2: 7 };     // pod 45°
    const positions = circlePositionsTangentToTwoLines(2, l1, l2);
    // Mělo by vrátit jen 1 pozici (uvnitř úhlu), ne 4
    expect(positions.length).toBeLessThanOrEqual(2);
    expect(positions.length).toBeGreaterThanOrEqual(1);
    // Kružnice musí ležet uvnitř sevřeného úhlu (kladné x i y)
    for (const p of positions) {
      expect(p.cx).toBeGreaterThan(0);
      expect(p.cy).toBeGreaterThan(0);
    }
  });

  it('rovnoběžné úsečky → 0 pozic (nebo nekonečno)', () => {
    const l1 = { x1: 0, y1: 0, x2: 10, y2: 0 };
    const l2 = { x1: 0, y1: 5, x2: 10, y2: 5 };
    const positions = circlePositionsTangentToTwoLines(2, l1, l2);
    // Rovnoběžné přímky: offsety jsou rovnoběžné → žádný průsečík, nebo 0 pozic
    expect(positions).toHaveLength(0);
  });
});

// ════════════════════════════════════════
// ── circlePositionsTangentToLine – konečné úsečky ──
// ════════════════════════════════════════
describe('circlePositionsTangentToLine – finite', () => {
  it('projekce na úsečku → 2 pozice', () => {
    // Kružnice se středem (5,5), úsečka (0,0)→(10,0), projekce v x=5 → na úsečce
    const positions = circlePositionsTangentToLine(5, 5, 3, 0, 0, 10, 0);
    expect(positions).toHaveLength(2);
  });

  it('projekce mimo úsečku → 0 pozic', () => {
    // Kružnice se středem (20,5), úsečka (0,0)→(10,0), projekce v x=20 → mimo úsečku
    const positions = circlePositionsTangentToLine(20, 5, 3, 0, 0, 10, 0);
    expect(positions).toHaveLength(0);
  });
});

// ════════════════════════════════════════
// ── circlePositionsTangentToLineAndPoint – konečné úsečky ──
// ════════════════════════════════════════
describe('circlePositionsTangentToLineAndPoint – finite', () => {
  it('bod u úsečky → pozice s tečným bodem na úsečce', () => {
    // Úsečka (0,0)→(10,0), bod (5,5), r=3
    const positions = circlePositionsTangentToLineAndPoint(3, 0, 0, 10, 0, 5, 5);
    expect(positions.length).toBeGreaterThan(0);
    for (const p of positions) {
      // Tečný bod musí ležet na úsečce (0≤x≤10)
      expect(p.cx).toBeGreaterThanOrEqual(-1);
      expect(p.cx).toBeLessThanOrEqual(11);
    }
  });

  it('bod daleko od úsečky → méně pozic', () => {
    // Bod je daleko, tečné body by padly mimo krátkou úsečku
    const positions = circlePositionsTangentToLineAndPoint(2, 0, 0, 3, 0, 50, 50);
    // Pozice s tečným bodem mimo úsečku (0,0)→(3,0) jsou odfiltrovány
    for (const p of positions) {
      // Ověříme, že projekce středu na úsečku je v rozsahu
      const dx = 3, dy = 0;
      const t = ((p.cx - 0) * dx + (p.cy - 0) * dy) / (dx * dx + dy * dy);
      expect(t).toBeGreaterThanOrEqual(-0.01);
      expect(t).toBeLessThanOrEqual(1.01);
    }
  });
});

// ════════════════════════════════════════
// ── circleTangentToThreeLines – konečné úsečky ──
// ════════════════════════════════════════
describe('circleTangentToThreeLines – finite', () => {
  it('trojúhelník → vepsaná kružnice', () => {
    // Trojúhelník: (0,0)→(10,0), (10,0)→(5,8), (5,8)→(0,0)
    const l1 = { x1: 0, y1: 0, x2: 10, y2: 0 };
    const l2 = { x1: 10, y1: 0, x2: 5, y2: 8 };
    const l3 = { x1: 5, y1: 8, x2: 0, y2: 0 };
    const positions = circleTangentToThreeLines(l1, l2, l3);
    // Měla by existovat vepsaná kružnice
    expect(positions.length).toBeGreaterThanOrEqual(1);
    // Všechny pozice musí mít kladný poloměr
    for (const p of positions) {
      expect(p.r).toBeGreaterThan(0);
    }
  });

  it('V-úhel se dvěma krátkými rameny + příčka → omezené pozice', () => {
    // Dvě krátká ramena + krátká příčka → tečná kružnice nemůže být připsaná
    const l1 = { x1: 0, y1: 0, x2: 5, y2: 0 };
    const l2 = { x1: 0, y1: 0, x2: 3, y2: 4 };
    const l3 = { x1: 5, y1: 0, x2: 3, y2: 4 };
    const positions = circleTangentToThreeLines(l1, l2, l3);
    // Připsané kružnice mimo trojúhelník by měly být odfiltrovány
    expect(positions.length).toBeLessThan(4);
    for (const p of positions) {
      expect(p.r).toBeGreaterThan(0);
    }
  });
});

// ════════════════════════════════════════
// ── circleTangentToTwoLinesAndPoint – konečné úsečky ──
// ════════════════════════════════════════
describe('circleTangentToTwoLinesAndPoint – finite', () => {
  it('V-úhel + bod uvnitř → omezené pozice', () => {
    const l1 = { x1: 0, y1: 0, x2: 10, y2: 0 };
    const l2 = { x1: 0, y1: 0, x2: 7, y2: 7 };
    const positions = circleTangentToTwoLinesAndPoint(l1, l2, 5, 2);
    // Pozice kde tečný bod padne mimo úsečku se odfiltrují
    for (const p of positions) {
      expect(p.r).toBeGreaterThan(0);
    }
  });
});

// ════════════════════════════════════════
// ── circleTangentToLineAndTwoPoints – konečné úsečky ──
// ════════════════════════════════════════
describe('circleTangentToLineAndTwoPoints – finite', () => {
  it('tečná k úsečce přes dva body', () => {
    // Úsečka (0,0)→(10,0), body (3,4) a (7,4)
    const positions = circleTangentToLineAndTwoPoints(0, 0, 10, 0, 3, 4, 7, 4);
    expect(positions.length).toBeGreaterThan(0);
    for (const p of positions) {
      expect(p.r).toBeGreaterThan(0);
      // Oba body musí ležet na kružnici
      const d1 = Math.hypot(p.cx - 3, p.cy - 4);
      const d2 = Math.hypot(p.cx - 7, p.cy - 4);
      expect(d1).toBeCloseTo(p.r, 3);
      expect(d2).toBeCloseTo(p.r, 3);
    }
  });

  it('body daleko od krátké úsečky → méně pozic', () => {
    // Krátká úsečka (0,0)→(2,0), body daleko (30,5) a (35,5)
    const positions = circleTangentToLineAndTwoPoints(0, 0, 2, 0, 30, 5, 35, 5);
    // Tečný bod by padl daleko mimo úsečku → odfiltrováno
    for (const p of positions) {
      // Projekce středu na úsečku musí být v rozsahu
      const t = p.cx / 2; // úsečka (0,0)→(2,0)
      expect(t).toBeGreaterThanOrEqual(-0.01);
      expect(t).toBeLessThanOrEqual(1.01);
    }
  });
});

// ════════════════════════════════════════
// ── getLines / getCircles ──
// ════════════════════════════════════════
describe('getLines', () => {
  it('úsečka → 1 segment', () => {
    const lines = getLines({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 5 });
    expect(lines).toHaveLength(1);
    expect(lines[0].x1).toBe(0);
    expect(lines[0].x2).toBe(10);
  });

  it('konstrukční čára → 1 segment s isConstr', () => {
    const lines = getLines({ type: 'constr', x1: 0, y1: 0, x2: 10, y2: 0 });
    expect(lines).toHaveLength(1);
    expect(lines[0].isConstr).toBe(true);
  });

  it('obdélník → 4 segmenty', () => {
    expect(getLines({ type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 })).toHaveLength(4);
  });

  it('kružnice → 0 segmentů', () => {
    expect(getLines({ type: 'circle', cx: 0, cy: 0, r: 10 })).toHaveLength(0);
  });

  it('polyline (otevřená, přímé segmenty)', () => {
    const lines = getLines({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      bulges: [0, 0],
      closed: false,
    });
    expect(lines).toHaveLength(2);
  });

  it('polyline (uzavřená, 3 body)', () => {
    const lines = getLines({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      bulges: [0, 0, 0],
      closed: true,
    });
    expect(lines).toHaveLength(3); // including closing segment
  });

  it('polyline s bulge — přeskočí obloukové segmenty', () => {
    const lines = getLines({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
      bulges: [0.5, 0],
      closed: false,
    });
    expect(lines).toHaveLength(1); // jen druhý segment je přímý
  });

  it('bod → 0 segmentů', () => {
    expect(getLines({ type: 'point', x: 0, y: 0 })).toHaveLength(0);
  });
});

describe('getCircles', () => {
  it('kružnice → 1 segment', () => {
    const circs = getCircles({ type: 'circle', cx: 0, cy: 0, r: 10 });
    expect(circs).toHaveLength(1);
    expect(circs[0].r).toBe(10);
  });

  it('oblouk → 1 segment s úhly', () => {
    const circs = getCircles({
      type: 'arc', cx: 0, cy: 0, r: 10,
      startAngle: 0, endAngle: PI / 2,
    });
    expect(circs).toHaveLength(1);
    expect(circs[0].startAngle).toBe(0);
    expect(circs[0].endAngle).toBe(PI / 2);
  });

  it('úsečka → 0 segmentů', () => {
    expect(getCircles({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 })).toHaveLength(0);
  });

  it('polyline s bulge → obloukové segmenty', () => {
    const circs = getCircles({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
      bulges: [0.5, 0],
      closed: false,
    });
    expect(circs).toHaveLength(1); // jen první segment s bulge
  });

  it('polyline bez bulge → 0 oblouků', () => {
    const circs = getCircles({
      type: 'polyline',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      bulges: [0],
      closed: false,
    });
    expect(circs).toHaveLength(0);
  });
});

// ════════════════════════════════════════
// ── calculateAllIntersections – bod na objektu ──
// ════════════════════════════════════════
describe('calculateAllIntersections – bod na objektu', () => {
  beforeEach(() => {
    state.objects = [];
    state.intersections = [];
    state.layers = [{ id: 0, name: 'L0', visible: true, locked: false, color: '#fff' }];
  });

  it('bod ležící na kružnici → průsečík', () => {
    state.objects = [
      { type: 'point', x: 10, y: 0, id: 1, layer: 0 },
      { type: 'circle', cx: 0, cy: 0, r: 10, id: 2, layer: 0 },
    ];
    calculateAllIntersections();
    expect(state.intersections).toHaveLength(1);
    expect(state.intersections[0].x).toBeCloseTo(10, 4);
    expect(state.intersections[0].y).toBeCloseTo(0, 4);
  });

  it('bod ležící na úsečce → průsečík', () => {
    state.objects = [
      { type: 'point', x: 5, y: 0, id: 1, layer: 0 },
      { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, id: 2, layer: 0 },
    ];
    calculateAllIntersections();
    expect(state.intersections).toHaveLength(1);
    expect(state.intersections[0].x).toBeCloseTo(5, 4);
    expect(state.intersections[0].y).toBeCloseTo(0, 4);
  });

  it('bod mimo kružnici → žádný průsečík', () => {
    state.objects = [
      { type: 'point', x: 20, y: 0, id: 1, layer: 0 },
      { type: 'circle', cx: 0, cy: 0, r: 10, id: 2, layer: 0 },
    ];
    calculateAllIntersections();
    expect(state.intersections).toHaveLength(0);
  });

  it('dva body na kružnici → 2 průsečíky', () => {
    state.objects = [
      { type: 'point', x: 10, y: 0, id: 1, layer: 0 },
      { type: 'point', x: 0, y: 10, id: 2, layer: 0 },
      { type: 'circle', cx: 0, cy: 0, r: 10, id: 3, layer: 0 },
    ];
    calculateAllIntersections();
    expect(state.intersections).toHaveLength(2);
  });
});
