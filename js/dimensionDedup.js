// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kontrola duplicitních kót                         ║
// ║  Kóta se nepřidá, pokud ve výkresu už je kóta, která měří   ║
// ║  totéž (stejné body/prvek, stejný směr měření).             ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Čistý modul bez importů (volá ho objects.js → nesmí vzniknout cyklus).
// Porovnává se CO kóta měří, ne kde leží popisek: dvě kóty téže úsečky
// s různým odsazením jsou duplicitní, dvě kóty různých úseček se stejnou
// hodnotou ne (např. dva stejné průměry na různých osazeních).

const EPS = 1e-4;
const TWO_PI = 2 * Math.PI;

const eq = (a, b) => Math.abs(a - b) < EPS;
const num = (v, fb) => (typeof v === 'number' && isFinite(v) ? v : fb);

function normAng(a) {
  a %= TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}
function angEq(a, b) {
  const d = Math.abs(normAng(a) - normAng(b));
  return d < EPS || Math.abs(d - TWO_PI) < EPS;
}

/**
 * Vrátí popis toho, co kóta měří, nebo null (objekt není porovnatelná kóta).
 * @param {object} o
 */
export function dimensionSignature(o) {
  if (!o || !o.isDimension || o.isMeasureTemp) return null;

  // Kóta souřadnic bodu
  if (o.isCoordLabel || o.dimType === 'coord') {
    if (!isFinite(o.x) || !isFinite(o.y)) return null;
    return { kind: 'C', x: o.x, y: o.y };
  }

  if (o.dimType === 'radius' || o.dimType === 'diameter') {
    return {
      kind: o.dimType === 'radius' ? 'R' : 'D',
      cx: num(o.dimCenterX, NaN), cy: num(o.dimCenterY, NaN), r: num(o.dimRadius, NaN),
    };
  }

  if (o.dimType === 'angular') {
    const cx = num(o.dimCenterX, NaN), cy = num(o.dimCenterY, NaN);
    // Směr osy měřeného úhlu – odliší vrcholové úhly se stejnou velikostí
    let mid = o.dimMidAng;
    if (typeof mid !== 'number' || !isFinite(mid)) {
      mid = Math.atan2((o.y1 + o.y2) / 2 - cy, (o.x1 + o.x2) / 2 - cx);
    }
    return { kind: 'A', cx, cy, angle: num(o.dimAngle, NaN), mid, vsAxis: o.dimVsAxis || null };
  }

  if (o.type !== 'line') return null;

  // Lineární kóta (i starší kóty bez dimType) – měřené body
  const sx1 = num(o.dimSrcX1, o.x1), sy1 = num(o.dimSrcY1, o.y1);
  const sx2 = num(o.dimSrcX2, o.x2), sy2 = num(o.dimSrcY2, o.y2);
  if (![sx1, sy1, sx2, sy2].every(isFinite)) return null;

  // Směr měření: vodorovně (H), svisle (V), nebo skutečná délka (L).
  // Zarovnaná kóta vodorovné/svislé úsečky měří totéž co H/V kóta.
  let kind;
  if (o.dimMode === 'horizontal') kind = 'H';
  else if (o.dimMode === 'vertical') kind = 'V';
  else if (eq(sy1, sy2)) kind = 'H';
  else if (eq(sx1, sx2)) kind = 'V';
  else kind = 'L';

  return { kind, p1: { x: sx1, y: sy1 }, p2: { x: sx2, y: sy2 } };
}

const ptEq = (a, b) => eq(a.x, b.x) && eq(a.y, b.y);

/** Měří obě kóty totéž? */
export function sameDimension(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'C':
      return eq(a.x, b.x) && eq(a.y, b.y);
    case 'R':
    case 'D':
      return eq(a.cx, b.cx) && eq(a.cy, b.cy) && eq(a.r, b.r);
    case 'A':
      return a.vsAxis === b.vsAxis && eq(a.cx, b.cx) && eq(a.cy, b.cy)
        && eq(a.angle, b.angle) && angEq(a.mid, b.mid);
    default: // H / V / L – stejné měřené body (pořadí nehraje roli)
      return (ptEq(a.p1, b.p1) && ptEq(a.p2, b.p2))
        || (ptEq(a.p1, b.p2) && ptEq(a.p2, b.p1));
  }
}

/**
 * Najde ve výkresu kótu, která měří totéž co `candidate`.
 * @param {object[]} objects
 * @param {object} candidate
 * @returns {object|null}
 */
export function findDuplicateDimension(objects, candidate) {
  const sig = dimensionSignature(candidate);
  if (!sig) return null;
  for (const o of objects) {
    if (o === candidate) continue;
    if (sameDimension(sig, dimensionSignature(o))) return o;
  }
  return null;
}
