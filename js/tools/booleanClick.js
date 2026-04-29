// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Boolean operace (multi-trim přístup)              ║
// ║  Zachovává přesnou geometrii (oblouky, čáry)               ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import {
  findObjectAt, calculateAllIntersections,
  getLines, getCircles,
  intersectLineLine, intersectLineCircle, intersectCircleCircle
} from '../geometry.js';
import { setHint, updateObjectList, updateProperties } from '../ui.js';
import { renderAll } from '../render.js';
import { getRectCorners } from '../utils.js';
import { showBooleanDialog } from '../dialogs/booleanDialog.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';

// ── Stav nástroje ──
let boolFirstIdx = null;

export function resetBooleanState() {
  boolFirstIdx = null;
}

/**
 * Handler kliknutí pro booleovský nástroj.
 * Fáze 1: klik na první uzavřenou konturu → uloží index
 * Fáze 2: klik na druhou → dialog → provede operaci
 */
export function handleBooleanClick(wx, wy) {
  const idx = findObjectAt(wx, wy);
  if (idx === null) {
    showToast('Klikněte na uzavřený objekt');
    return;
  }

  const obj = state.objects[idx];
  if (!_isClosedShape(obj)) {
    showToast('Objekt není uzavřená kontura (kružnice, obdélník nebo uzavřená polyline)');
    return;
  }

  if (boolFirstIdx === null) {
    // Fáze 1: výběr prvního objektu
    boolFirstIdx = idx;
    state.selected = idx;
    renderAll();
    setHint('Klikněte na druhou uzavřenou konturu');
    return;
  }

  // Fáze 2: výběr druhého objektu
  if (idx === boolFirstIdx) {
    showToast('Vyberte jiný objekt');
    return;
  }

  const objA = state.objects[boolFirstIdx];
  const objB = obj;
  const idxA = boolFirstIdx;
  const idxB = idx;

  // Resetovat stav před dialogem
  boolFirstIdx = null;

  showBooleanDialog((operation) => {
    _executeBooleanOp(idxA, idxB, objA, objB, operation);
  });
}

// ══════════════════════════════════════════════════════════════
// Hlavní logika – multi-trim boolean
// ══════════════════════════════════════════════════════════════

function _executeBooleanOp(idxA, idxB, objA, objB, operation) {
  // 1. Najít průsečíky mezi objekty
  const inters = _findPairIntersections(objA, objB);

  if (inters.length < 2) {
    showToast('Objekty se neprotínají (potřeba alespoň 2 průsečíky)');
    return;
  }

  // 2. Rozdělit oba objekty na segmenty v průsečících
  const partsA = _splitObject(objA, inters);
  const partsB = _splitObject(objB, inters);

  if (partsA.length === 0 || partsB.length === 0) {
    showToast('Nepodařilo se rozdělit objekty v průsečících');
    return;
  }

  // 3. Klasifikovat segmenty (inside/outside) a filtrovat
  const keptParts = [];
  for (const part of partsA) {
    const mid = _getPartMidpoint(part);
    const inside = _isPointInsideObject(mid, objB);
    if (_shouldKeep(inside, 'A', operation)) keptParts.push(part);
  }
  for (const part of partsB) {
    const mid = _getPartMidpoint(part);
    const inside = _isPointInsideObject(mid, objA);
    if (_shouldKeep(inside, 'B', operation)) keptParts.push(part);
  }

  if (keptParts.length === 0) {
    showToast('Výsledek operace je prázdný');
    return;
  }

  // 4. Nahradit originály výsledkem
  pushUndo();
  const toRemove = [idxA, idxB].sort((a, b) => b - a);
  for (const ri of toRemove) state.objects.splice(ri, 1);

  const opLabels = { union: 'Sjednocení', subtract: 'Odečtení', intersect: 'Průnik' };
  for (const part of keptParts) {
    part.id = state.nextId++;
    const label = part.type === 'arc' ? 'Oblouk' : 'Úsečka';
    part.name = `${label} ${part.id}`;
    state.objects.push(part);
  }

  calculateAllIntersections();
  updateAssociativeDimensions();
  updateObjectList();
  updateProperties();
  renderAll();
  showToast(`${opLabels[operation]} ✓ (${keptParts.length} segment${keptParts.length === 1 ? '' : 'ů'})`);
  setHint('Klikněte na první uzavřenou konturu');
}

// ══════════════════════════════════════════════════════════════
// Pomocné funkce
// ══════════════════════════════════════════════════════════════

/** Zjistí, zda je objekt uzavřená kontura. */
function _isClosedShape(obj) {
  if (!obj) return false;
  if (obj.type === 'circle') return true;
  if (obj.type === 'rect') return true;
  if (obj.type === 'polyline' && obj.closed) return true;
  return false;
}

/**
 * Rozhodne, zda segment ponechat.
 * @param {boolean} isInside - je segment uvnitř druhého tvaru?
 * @param {'A'|'B'} source - ze kterého objektu pochází
 * @param {'union'|'subtract'|'intersect'} operation
 */
function _shouldKeep(isInside, source, operation) {
  switch (operation) {
    case 'union':     return !isInside;                        // vnější části obou
    case 'subtract':  return source === 'A' ? !isInside : isInside; // A venku + B uvnitř A
    case 'intersect': return isInside;                         // vnitřní části obou
  }
}

// ══════════════════════════════════════════════════════════════
// Hledání průsečíků mezi dvěma objekty
// ══════════════════════════════════════════════════════════════

function _findPairIntersections(objA, objB) {
  const pts = [];
  const linesA = getLines(objA), circlesA = getCircles(objA);
  const linesB = getLines(objB), circlesB = getCircles(objB);

  for (const la of linesA)
    for (const lb of linesB) pts.push(...intersectLineLine(la, lb));
  for (const la of linesA)
    for (const cb of circlesB) pts.push(...intersectLineCircle(la, cb));
  for (const ca of circlesA)
    for (const lb of linesB) pts.push(...intersectLineCircle(lb, ca));
  for (const ca of circlesA)
    for (const cb of circlesB) pts.push(...intersectCircleCircle(ca, cb));

  // Deduplikace
  const unique = [];
  for (const pt of pts) {
    if (!unique.some(u => Math.hypot(u.x - pt.x, u.y - pt.y) < 1e-6)) {
      unique.push(pt);
    }
  }
  return unique;
}

// ══════════════════════════════════════════════════════════════
// Rozdělení objektu na segmenty v průsečících
// ══════════════════════════════════════════════════════════════

function _splitObject(obj, intersections) {
  switch (obj.type) {
    case 'circle':   return _splitCircle(obj, intersections);
    case 'rect':     return _splitRect(obj, intersections);
    case 'polyline': return _splitPolyline(obj, intersections);
    default:         return [];
  }
}

/** Normalizuje úhel do [0, 2π). */
function _normalizeAngle(a) {
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/** Rozdělí kružnici na oblouky v průsečících. */
function _splitCircle(circle, intersections) {
  const angles = [];
  for (const pt of intersections) {
    const d = Math.hypot(pt.x - circle.cx, pt.y - circle.cy);
    if (Math.abs(d - circle.r) < 1e-3) {
      angles.push(Math.atan2(pt.y - circle.cy, pt.x - circle.cx));
    }
  }
  if (angles.length < 2) return [];

  angles.sort((a, b) => _normalizeAngle(a) - _normalizeAngle(b));
  const base = { layer: circle.layer, ...(circle.color ? { color: circle.color } : {}) };
  const arcs = [];
  for (let i = 0; i < angles.length; i++) {
    arcs.push({
      type: 'arc',
      cx: circle.cx, cy: circle.cy, r: circle.r,
      startAngle: angles[i],
      endAngle: angles[(i + 1) % angles.length],
      ...base
    });
  }
  return arcs;
}

/** Rozdělí obdélník — rozloží na 4 hrany a každou rozdělí. */
function _splitRect(rect, intersections) {
  const rc = getRectCorners(rect);
  const base = { layer: rect.layer, ...(rect.color ? { color: rect.color } : {}) };
  const allParts = [];
  for (let i = 0; i < 4; i++) {
    const p1 = rc[i], p2 = rc[(i + 1) % 4];
    const edge = { type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, ...base };
    allParts.push(..._splitLine(edge, intersections));
  }
  return allParts;
}

/** Rozdělí úsečku na segmenty v průsečících. */
function _splitLine(line, intersections) {
  const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-10) return [];

  const onLine = [];
  for (const pt of intersections) {
    const t = ((pt.x - line.x1) * dx + (pt.y - line.y1) * dy) / (len * len);
    if (t > 1e-6 && t < 1 - 1e-6) {
      const projX = line.x1 + t * dx, projY = line.y1 + t * dy;
      if (Math.hypot(pt.x - projX, pt.y - projY) < 1e-3) {
        onLine.push({ x: pt.x, y: pt.y, t });
      }
    }
  }

  const base = { layer: line.layer, ...(line.color ? { color: line.color } : {}) };
  if (onLine.length === 0) {
    return [{ type: 'line', x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2, ...base }];
  }

  onLine.sort((a, b) => a.t - b.t);
  const points = [
    { x: line.x1, y: line.y1 },
    ...onLine,
    { x: line.x2, y: line.y2 }
  ];
  const result = [];
  for (let i = 0; i < points.length - 1; i++) {
    result.push({
      type: 'line',
      x1: points[i].x, y1: points[i].y,
      x2: points[i + 1].x, y2: points[i + 1].y,
      ...base
    });
  }
  return result;
}

/** Rozdělí uzavřenou polyline na segmenty. */
function _splitPolyline(poly, intersections) {
  const verts = poly.vertices;
  const n = verts.length;
  const segCount = poly.closed ? n : n - 1;
  const base = { layer: poly.layer, ...(poly.color ? { color: poly.color } : {}) };
  const allParts = [];

  for (let i = 0; i < segCount; i++) {
    const p1 = verts[i], p2 = verts[(i + 1) % n];
    const bulge = (poly.bulges && poly.bulges[i]) || 0;

    if (Math.abs(bulge) > 1e-6) {
      const arc = _bulgeToArcObj(p1, p2, bulge, base);
      if (arc) allParts.push(..._splitArc(arc, intersections));
    } else {
      const line = { type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, ...base };
      allParts.push(..._splitLine(line, intersections));
    }
  }
  return allParts;
}

/** Rozdělí oblouk na menší oblouky v průsečících. */
function _splitArc(arc, intersections) {
  const ccw = arc.ccw !== false;
  function arcPos(angle) {
    return ccw
      ? _normalizeAngle(angle - arc.startAngle)
      : _normalizeAngle(arc.startAngle - angle);
  }
  const sweep = arcPos(arc.endAngle);

  const onArc = [];
  for (const pt of intersections) {
    const d = Math.hypot(pt.x - arc.cx, pt.y - arc.cy);
    if (Math.abs(d - arc.r) > 1e-3) continue;
    const a = Math.atan2(pt.y - arc.cy, pt.x - arc.cx);
    const pos = arcPos(a);
    if (pos > 1e-6 && pos < sweep - 1e-6) {
      onArc.push({ angle: a, pos });
    }
  }

  const base = {
    layer: arc.layer, ...(arc.color ? { color: arc.color } : {}),
    ...(arc.ccw === false ? { ccw: false } : {})
  };

  if (onArc.length === 0) {
    return [{
      type: 'arc', cx: arc.cx, cy: arc.cy, r: arc.r,
      startAngle: arc.startAngle, endAngle: arc.endAngle, ...base
    }];
  }

  onArc.sort((a, b) => a.pos - b.pos);
  const boundaries = [
    { angle: arc.startAngle },
    ...onArc,
    { angle: arc.endAngle }
  ];
  const result = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    result.push({
      type: 'arc', cx: arc.cx, cy: arc.cy, r: arc.r,
      startAngle: boundaries[i].angle,
      endAngle: boundaries[i + 1].angle, ...base
    });
  }
  return result;
}

/** Převede bulge segment na arc objekt. */
function _bulgeToArcObj(p1, p2, bulge, base) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-10) return null;

  const sagitta = Math.abs(bulge) * d / 2;
  const r = ((d / 2) * (d / 2) + sagitta * sagitta) / (2 * sagitta);
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
  const nx = -dy / d, ny = dx / d;
  const sign = bulge > 0 ? 1 : -1;
  const offset = r - sagitta;
  const cx = mx + sign * nx * offset;
  const cy = my + sign * ny * offset;

  return {
    type: 'arc', cx, cy, r,
    startAngle: Math.atan2(p1.y - cy, p1.x - cx),
    endAngle: Math.atan2(p2.y - cy, p2.x - cx),
    ...(bulge < 0 ? { ccw: false } : {}),
    ...base
  };
}

// ══════════════════════════════════════════════════════════════
// Střed segmentu & test uvnitř tvaru
// ══════════════════════════════════════════════════════════════

/** Vrátí střed segmentu pro klasifikaci inside/outside. */
function _getPartMidpoint(part) {
  if (part.type === 'arc') {
    const ccw = part.ccw !== false;
    let sweep;
    if (ccw) {
      sweep = _normalizeAngle(part.endAngle - part.startAngle);
    } else {
      sweep = _normalizeAngle(part.startAngle - part.endAngle);
    }
    if (sweep < 1e-10) sweep = 2 * Math.PI;
    const mid = ccw
      ? part.startAngle + sweep / 2
      : part.startAngle - sweep / 2;
    return {
      x: part.cx + part.r * Math.cos(mid),
      y: part.cy + part.r * Math.sin(mid)
    };
  }
  if (part.type === 'line') {
    return {
      x: (part.x1 + part.x2) / 2,
      y: (part.y1 + part.y2) / 2
    };
  }
  return { x: 0, y: 0 };
}

/** Test, zda bod leží uvnitř uzavřeného tvaru. */
function _isPointInsideObject(pt, obj) {
  switch (obj.type) {
    case 'circle':
      return Math.hypot(pt.x - obj.cx, pt.y - obj.cy) < obj.r - 1e-6;
    case 'rect': {
      const minX = Math.min(obj.x1, obj.x2), maxX = Math.max(obj.x1, obj.x2);
      const minY = Math.min(obj.y1, obj.y2), maxY = Math.max(obj.y1, obj.y2);
      return pt.x > minX + 1e-6 && pt.x < maxX - 1e-6 &&
             pt.y > minY + 1e-6 && pt.y < maxY - 1e-6;
    }
    case 'polyline':
      return _pointInPolygon(pt, obj.vertices);
    default:
      return false;
  }
}

/** Ray casting point-in-polygon test. */
function _pointInPolygon(pt, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
