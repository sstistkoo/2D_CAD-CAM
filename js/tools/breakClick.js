// ╔══════════════════════════════════════════════════════════════╗
// ║  Rozdělení objektu (Break/Split) – click logika            ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { findObjectAt, calculateAllIntersections } from '../geometry.js';
import { resetHint } from '../ui.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { hasAnchoredPoint } from './anchorClick.js';

/** Normalizuje úhel do [0, 2π). */
function normalizeAngle(a) {
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/** Projekce bodu na úsečku → parametr t ∈ [0,1]. */
function projectOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return { t: 0, x: x1, y: y1 };
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0.01, Math.min(0.99, t)); // avoid degenerate splits at tips
  return { t, x: x1 + t * dx, y: y1 + t * dy };
}

/** Rozdělí objekt v místě kliknutí na dva. */
export function handleBreakClick(wx, wy) {
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Klepněte na objekt k rozdělení"); return; }
  const obj = state.objects[idx];

  if (hasAnchoredPoint(obj)) {
    showToast("Objekt je zakotven – nelze rozdělit");
    return;
  }

  if (obj.type === 'line' || obj.type === 'constr') {
    return breakLine(idx, obj, wx, wy);
  }
  if (obj.type === 'circle') {
    return breakCircle(idx, obj, wx, wy);
  }
  if (obj.type === 'arc') {
    return breakArc(idx, obj, wx, wy);
  }
  if (obj.type === 'polyline') {
    return breakPolyline(idx, obj, wx, wy);
  }

  showToast("Rozdělení tohoto typu objektu není podporováno");
}

// ── Úsečka → 2 úsečky ──

function breakLine(idx, obj, wx, wy) {
  const proj = projectOnSegment(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2);

  pushUndo();
  const origX2 = obj.x2, origY2 = obj.y2;

  // Zkrátit originál
  obj.x2 = proj.x;
  obj.y2 = proj.y;

  // Nová úsečka
  addObject({
    type: obj.type,
    x1: proj.x, y1: proj.y,
    x2: origX2, y2: origY2,
    ...(obj.color ? { color: obj.color } : {}),
  });

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Rozděleno ✓");
}

// ── Kružnice → 2 oblouky ──

function breakCircle(idx, obj, wx, wy) {
  const clickAngle = Math.atan2(wy - obj.cy, wx - obj.cx);
  const oppositeAngle = normalizeAngle(clickAngle + Math.PI);

  pushUndo();

  // Nahradit kružnici obloukem (horní půlka)
  state.objects[idx] = {
    type: 'arc',
    cx: obj.cx, cy: obj.cy, r: obj.r,
    startAngle: clickAngle,
    endAngle: oppositeAngle,
    name: obj.name || `Oblouk ${obj.id}`,
    id: obj.id,
    layer: obj.layer,
    ...(obj.color ? { color: obj.color } : {}),
  };

  // Druhý oblouk (spodní půlka)
  addObject({
    type: 'arc',
    cx: obj.cx, cy: obj.cy, r: obj.r,
    startAngle: oppositeAngle,
    endAngle: clickAngle,
    ...(obj.color ? { color: obj.color } : {}),
  });

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Kružnice rozdělena ✓");
}

// ── Oblouk → 2 oblouky ──

function breakArc(idx, obj, wx, wy) {
  const clickAngle = Math.atan2(wy - obj.cy, wx - obj.cx);

  // Ověřit, že klik je uvnitř oblouku
  const ccw = obj.ccw !== false;
  function arcPos(angle) {
    return ccw
      ? normalizeAngle(angle - obj.startAngle)
      : normalizeAngle(obj.startAngle - angle);
  }
  const sweep = arcPos(obj.endAngle);
  const clickPos = arcPos(clickAngle);

  if (clickPos < 1e-6 || clickPos > sweep - 1e-6) {
    showToast("Klepněte dovnitř oblouku");
    return;
  }

  pushUndo();
  const origEnd = obj.endAngle;

  // Zkrátit originál
  obj.endAngle = clickAngle;

  // Nový oblouk
  const newArc = {
    type: 'arc',
    cx: obj.cx, cy: obj.cy, r: obj.r,
    startAngle: clickAngle,
    endAngle: origEnd,
    ...(obj.color ? { color: obj.color } : {}),
  };
  if (ccw === false) newArc.ccw = false;
  addObject(newArc);

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Oblouk rozdělen ✓");
}

// ── Kontura → rozdělení v segmentu ──

function breakPolyline(idx, obj, wx, wy) {
  // Najít nejbližší segment
  const verts = obj.vertices;
  const count = obj.closed ? verts.length : verts.length - 1;
  let bestSeg = 0, bestDist = Infinity;

  for (let i = 0; i < count; i++) {
    const p1 = verts[i], p2 = verts[(i + 1) % verts.length];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 < 1e-12 ? 0 : ((wx - p1.x) * dx + (wy - p1.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = p1.x + t * dx, py = p1.y + t * dy;
    const d = Math.hypot(wx - px, wy - py);
    if (d < bestDist) { bestDist = d; bestSeg = i; }
  }

  const p1 = verts[bestSeg], p2 = verts[(bestSeg + 1) % verts.length];
  const proj = projectOnSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);

  pushUndo();

  if (obj.closed) {
    // Otevřít uzavřenou konturu v místě rozdělení
    const n = verts.length;
    const newVerts = [];
    const newBulges = [];
    // Start from split point, go around
    newVerts.push({ x: proj.x, y: proj.y });
    for (let i = 1; i <= n; i++) {
      const vi = (bestSeg + i) % n;
      newVerts.push({ x: verts[vi].x, y: verts[vi].y });
      newBulges.push(obj.bulges?.[(bestSeg + i - 1) % n] || 0);
    }
    newVerts.push({ x: proj.x, y: proj.y });
    newBulges.push(0);

    obj.vertices = newVerts;
    obj.bulges = newBulges;
    obj.closed = false;
  } else {
    // Rozdělit otevřenou konturu na dvě
    const splitPt = { x: proj.x, y: proj.y };

    const verts1 = verts.slice(0, bestSeg + 1).map(v => ({ x: v.x, y: v.y }));
    verts1.push(splitPt);
    const bulges1 = (obj.bulges || []).slice(0, bestSeg);
    bulges1.push(0);

    const verts2 = [{ x: splitPt.x, y: splitPt.y }];
    for (let i = bestSeg + 1; i < verts.length; i++) {
      verts2.push({ x: verts[i].x, y: verts[i].y });
    }
    const bulges2 = [0];
    for (let i = bestSeg + 1; i < verts.length - 1; i++) {
      bulges2.push(obj.bulges?.[i] || 0);
    }

    // Pokud výsledek má jen 2 body, převést na úsečku
    if (verts1.length === 2) {
      state.objects[idx] = {
        type: 'line',
        x1: verts1[0].x, y1: verts1[0].y,
        x2: verts1[1].x, y2: verts1[1].y,
        name: obj.name, id: obj.id, layer: obj.layer,
        ...(obj.color ? { color: obj.color } : {}),
      };
    } else {
      obj.vertices = verts1;
      obj.bulges = bulges1;
    }

    if (verts2.length === 2) {
      addObject({
        type: 'line',
        x1: verts2[0].x, y1: verts2[0].y,
        x2: verts2[1].x, y2: verts2[1].y,
        ...(obj.color ? { color: obj.color } : {}),
      });
    } else if (verts2.length > 2) {
      addObject({
        type: 'polyline',
        vertices: verts2,
        bulges: bulges2,
        closed: false,
        ...(obj.color ? { color: obj.color } : {}),
      });
    }
  }

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Kontura rozdělena ✓");
}
