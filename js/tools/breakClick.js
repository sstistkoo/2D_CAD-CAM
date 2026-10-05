// ╔══════════════════════════════════════════════════════════════╗
// ║  Rozdělení objektu (Break/Split) – click logika            ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, withUndoBatch, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { addObject, inheritedProps } from '../objects.js';
import { findObjectAt, calculateAllIntersections } from '../geometry.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { bulgeToArc, distPointToSegment } from '../utils.js';
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

  withUndoBatch(() => {
    const origX2 = obj.x2, origY2 = obj.y2;

    // Zkrátit originál
    obj.x2 = proj.x;
    obj.y2 = proj.y;

    // Nová úsečka
    addObject({
      ...inheritedProps(obj),
      type: obj.type,
      x1: proj.x, y1: proj.y,
      x2: origX2, y2: origY2,
    });
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

  withUndoBatch(() => {
    // Nahradit kružnici obloukem (horní půlka)
    state.objects[idx] = {
      ...inheritedProps(obj),
      type: 'arc',
      cx: obj.cx, cy: obj.cy, r: obj.r,
      startAngle: clickAngle,
      endAngle: oppositeAngle,
      name: obj.name || `Oblouk ${obj.id}`,
      id: obj.id,
    };

    // Druhý oblouk (spodní půlka)
    addObject({
      ...inheritedProps(obj),
      type: 'arc',
      cx: obj.cx, cy: obj.cy, r: obj.r,
      startAngle: oppositeAngle,
      endAngle: clickAngle,
    });
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

  withUndoBatch(() => {
    const origEnd = obj.endAngle;

    // Zkrátit originál
    obj.endAngle = clickAngle;

    // Nový oblouk
    const newArc = {
      ...inheritedProps(obj),
      type: 'arc',
      cx: obj.cx, cy: obj.cy, r: obj.r,
      startAngle: clickAngle,
      endAngle: origEnd,
    };
    if (ccw === false) newArc.ccw = false;
    addObject(newArc);
  });

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Oblouk rozdělen ✓");
}

// ── Kontura → rozdělení v segmentu ──

/**
 * Bod dělení na segmentu i kontury + bulge obou vzniklých částí. U oblouku
 * leží bod NA oblouku a obě části zůstanou oblouky (dřív se bod promítl na
 * tětivu a z oblouku vznikly dvě úsečky).
 * @returns {{dist:number, x:number, y:number, b1:number, b2:number}|null}
 */
function splitOnSegment(p1, p2, b, wx, wy) {
  if (!b) {
    const proj = projectOnSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);
    return { dist: distPointToSegment(wx, wy, p1.x, p1.y, p2.x, p2.y), x: proj.x, y: proj.y, b1: 0, b2: 0 };
  }
  const arc = bulgeToArc(p1, p2, b);
  if (!arc) return null;
  const sweep = 4 * Math.atan(Math.abs(b));
  const a = Math.atan2(wy - arc.cy, wx - arc.cx);
  let pos = arc.ccw ? normalizeAngle(a - arc.startAngle) : normalizeAngle(arc.startAngle - a);
  // Klik mimo oblouk → vzdálenost k bližšímu konci
  const outside = pos > sweep;
  const dist = outside
    ? Math.min(Math.hypot(wx - p1.x, wy - p1.y), Math.hypot(wx - p2.x, wy - p2.y))
    : Math.abs(Math.hypot(wx - arc.cx, wy - arc.cy) - arc.r);
  pos = Math.max(0.01 * sweep, Math.min(0.99 * sweep, outside ? (pos - sweep < 2 * Math.PI - pos ? sweep : 0) : pos));
  const ang = arc.ccw ? arc.startAngle + pos : arc.startAngle - pos;
  const sign = b > 0 ? 1 : -1;
  return {
    dist,
    x: arc.cx + arc.r * Math.cos(ang), y: arc.cy + arc.r * Math.sin(ang),
    b1: sign * Math.tan(pos / 4), b2: sign * Math.tan((sweep - pos) / 4),
  };
}

function breakPolyline(idx, obj, wx, wy) {
  // Najít nejbližší segment (u oblouku vzdálenost k oblouku, ne k tětivě)
  const verts = obj.vertices;
  const n = verts.length;
  const count = obj.closed ? n : n - 1;
  const bul = i => obj.bulges?.[i] || 0;
  let bestSeg = -1, best = null;
  for (let i = 0; i < count; i++) {
    const sp = splitOnSegment(verts[i], verts[(i + 1) % n], bul(i), wx, wy);
    if (sp && (!best || sp.dist < best.dist)) { best = sp; bestSeg = i; }
  }
  if (!best) { showToast("Konturu se nepodařilo rozdělit"); return; }
  const splitPt = { x: best.x, y: best.y };

  withUndoBatch(() => {
    if (obj.closed) {
      // Otevřít uzavřenou konturu v místě rozdělení:
      // bod → v[bestSeg+1] → … → v[bestSeg] → bod
      const newVerts = [{ ...splitPt }];
      const newBulges = [best.b2];
      for (let i = 1; i <= n; i++) {
        const vi = (bestSeg + i) % n;
        newVerts.push({ x: verts[vi].x, y: verts[vi].y });
        if (i < n) newBulges.push(bul(vi));
      }
      newVerts.push({ ...splitPt });
      newBulges.push(best.b1);

      obj.vertices = newVerts;
      obj.bulges = newBulges;
      obj.closed = false;
    } else {
      // Rozdělit otevřenou konturu na dvě
      const verts1 = verts.slice(0, bestSeg + 1).map(v => ({ x: v.x, y: v.y }));
      verts1.push({ ...splitPt });
      const bulges1 = [];
      for (let i = 0; i < bestSeg; i++) bulges1.push(bul(i));
      bulges1.push(best.b1);

      const verts2 = [{ ...splitPt }];
      for (let i = bestSeg + 1; i < n; i++) verts2.push({ x: verts[i].x, y: verts[i].y });
      const bulges2 = [best.b2];
      for (let i = bestSeg + 1; i < n - 1; i++) bulges2.push(bul(i));

      // Výsledek se 2 body a rovným segmentem → úsečka
      if (verts1.length === 2 && !bulges1[0]) {
        state.objects[idx] = {
          ...inheritedProps(obj),
          type: 'line',
          x1: verts1[0].x, y1: verts1[0].y,
          x2: verts1[1].x, y2: verts1[1].y,
          name: obj.name, id: obj.id,
        };
      } else {
        obj.vertices = verts1;
        obj.bulges = bulges1;
      }

      if (verts2.length === 2 && !bulges2[0]) {
        addObject({
          ...inheritedProps(obj),
          type: 'line',
          x1: verts2[0].x, y1: verts2[0].y,
          x2: verts2[1].x, y2: verts2[1].y,
        });
      } else {
        addObject({
          ...inheritedProps(obj),
          type: 'polyline',
          vertices: verts2,
          bulges: bulges2,
          closed: false,
        });
      }
    }
  });

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Kontura rozdělena ✓");
}
