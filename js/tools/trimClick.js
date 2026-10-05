// ╔══════════════════════════════════════════════════════════════╗
// ║  Oříznutí objektů – click logika                           ║
// ║  Podporuje: úsečky, kružnice, oblouky, obdélníky, kontury  ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { findObjectAt, calculateAllIntersections, getLines, getCircles, intersectLineLine, intersectLineCircle, intersectCircleCircle, findSegmentAt } from '../geometry.js';
import { getLineSegment, analyzeSelection } from './helpers.js';
import { showEndpointChoiceDialog } from '../dialogs.js';
import { isAnchored } from './anchorClick.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { bulgeToArc } from '../utils.js';
import { inheritedProps } from '../objects.js';

// ── Helpers ──

/** Normalizuje úhel do [0, 2π). */
function normalizeAngle(a) {
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/** Sebere průsečíky kružnice/oblouku se všemi ostatními objekty. */
function collectCircleIntersections(idx, circSeg) {
  const pts = [];
  for (let i = 0; i < state.objects.length; i++) {
    if (i === idx) continue;
    const other = state.objects[i];
    if (other.isDimension || other.isCoordLabel || other.skipIntersections) continue;
    for (const seg of getLines(other)) {
      pts.push(...intersectLineCircle(seg, circSeg));
    }
    for (const circ of getCircles(other)) {
      pts.push(...intersectCircleCircle(circSeg, circ));
    }
  }
  // Deduplikace
  const unique = [];
  for (const pt of pts) {
    if (!unique.some(u => Math.hypot(u.x - pt.x, u.y - pt.y) < 1e-6)) {
      unique.push(pt);
    }
  }
  return unique;
}

/** Průsečíky dané úsečky s ostatními segmenty téže polyline (bez segmentu segIdx a přilehlých). */
function collectSamePolylineIntersections(obj, segIdx, lineSeg) {
  const pts = [];
  const n = obj.vertices.length;
  const segCount = obj.closed ? n : n - 1;
  // Přilehlé segmenty sdílí vrchol – jejich "průsečík" je jen spojovací bod, ne trim target
  const prevSeg = (segIdx - 1 + segCount) % segCount;
  const nextSeg = (segIdx + 1) % segCount;
  for (let i = 0; i < segCount; i++) {
    if (i === segIdx || i === prevSeg || i === nextSeg) continue;
    const p1 = obj.vertices[i];
    const p2 = obj.vertices[(i + 1) % n];
    const b = obj.bulges[i] || 0;
    if (b === 0) {
      pts.push(...intersectLineLine(lineSeg, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, isConstr: false }));
    } else {
      const arc = bulgeToArc(p1, p2, b);
      if (arc) {
        pts.push(...intersectLineCircle(lineSeg, { cx: arc.cx, cy: arc.cy, r: arc.r, startAngle: arc.startAngle, endAngle: arc.endAngle, ccw: arc.ccw }));
      }
    }
  }
  return pts;
}

/** Průsečíky daného oblouku s ostatními segmenty téže polyline (bez segmentu segIdx a přilehlých). */
function collectSamePolylineArcIntersections(obj, segIdx, circSeg) {
  const pts = [];
  const n = obj.vertices.length;
  const segCount = obj.closed ? n : n - 1;
  const prevSeg = (segIdx - 1 + segCount) % segCount;
  const nextSeg = (segIdx + 1) % segCount;
  for (let i = 0; i < segCount; i++) {
    if (i === segIdx || i === prevSeg || i === nextSeg) continue;
    const p1 = obj.vertices[i];
    const p2 = obj.vertices[(i + 1) % n];
    const b = obj.bulges[i] || 0;
    if (b === 0) {
      pts.push(...intersectLineCircle({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, isConstr: false }, circSeg));
    } else {
      const arc = bulgeToArc(p1, p2, b);
      if (arc) {
        pts.push(...intersectCircleCircle(circSeg, { cx: arc.cx, cy: arc.cy, r: arc.r, startAngle: arc.startAngle, endAngle: arc.endAngle, ccw: arc.ccw }));
      }
    }
  }
  return pts;
}

/**
 * Přepočítá bulge hodnotu pro oblouk se stejným středem, ale novými koncovými body.
 * p1, p2 jsou nové koncové body ležící na kružnici (cx, cy, r).
 */
function computeNewBulge(p1, p2, cx, cy, ccw) {
  const a1 = Math.atan2(p1.y - cy, p1.x - cx);
  const a2 = Math.atan2(p2.y - cy, p2.x - cx);
  let delta = ccw
    ? normalizeAngle(a2 - a1)
    : normalizeAngle(a1 - a2);
  if (delta < 1e-9) delta = 2 * Math.PI;
  const bulge = Math.tan(delta / 4);
  return ccw ? bulge : -bulge;
}

// ── Odstranění úseku kontury ──

/**
 * Odstraní z kontury úsek mezi body A a B (A leží PŘED B ve směru kontury;
 * bod = { segIdx, x, y }). Sdílené vrcholy se NEposouvají – dřív se tím
 * deformoval sousední segment. Otevřená kontura se rozdělí na začátek..A
 * a B..konec, uzavřená se otevře na jednu konturu B..(přes začátek)..A.
 * Části kratší než jeden segment zaniknou. Volající zajistí pushUndo().
 */
function removePolylineSpan(idx, obj, A, B) {
  const V = obj.vertices, n = V.length;
  const segCount = obj.closed ? n : n - 1;
  const bul = i => (obj.bulges && obj.bulges[i]) || 0;
  const same = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;
  // Bulge části segmentu i mezi body a→b (oblouk se stejným středem)
  const partial = (i, a, b) => {
    const bl = bul(i);
    if (!bl) return 0;
    const arc = bulgeToArc(V[i], V[(i + 1) % n], bl);
    return arc ? computeNewBulge(a, b, arc.cx, arc.cy, arc.ccw) : 0;
  };

  // Začátek kontury po A
  const headV = V.slice(0, A.segIdx + 1).map(v => ({ ...v }));
  const headB = [];
  for (let i = 0; i < A.segIdx; i++) headB.push(bul(i));
  if (!same(A, V[A.segIdx])) {
    headB.push(partial(A.segIdx, V[A.segIdx], A));
    headV.push({ x: A.x, y: A.y });
  }
  // Od B po konec (u uzavřené včetně uzavíracího segmentu zpět na vrchol 0)
  const tailV = [], tailB = [];
  const endV = V[(B.segIdx + 1) % n];
  if (!same(B, endV)) {
    tailV.push({ x: B.x, y: B.y });
    tailB.push(partial(B.segIdx, B, endV));
  }
  for (let i = B.segIdx + 1; i <= segCount; i++) {
    tailV.push({ ...V[i % n] });
    if (i < segCount) tailB.push(bul(i));
  }

  const keep = (verts, bulges, target) => {
    target.vertices = verts;
    target.bulges = bulges;
    target.closed = false;
  };
  if (obj.closed) {
    const verts = tailV.concat(headV.slice(1));
    if (verts.length < 2) { state.objects.splice(idx, 1); return; }
    keep(verts, tailB.concat(headB), obj);
    return;
  }
  const headOk = headV.length >= 2, tailOk = tailV.length >= 2;
  if (headOk) keep(headV, headB, obj);
  else if (tailOk) { keep(tailV, tailB, obj); return; }
  else { state.objects.splice(idx, 1); return; }
  if (tailOk) {
    const newId = state.nextId++;
    state.objects.push({
      ...inheritedProps(obj),
      type: 'polyline', vertices: tailV, bulges: tailB, closed: false,
      name: `Kontura ${newId}`, id: newId,
    });
  }
}

/**
 * Po odstranění úseku kontury se segmenty přečíslovaly → výběr segmentu
 * pryč; výběr objektu jen když objekt zanikl (indexy za ním se posunuly).
 */
function _resetSelectionAfterSpan(objRef) {
  state.selectedSegment = null;
  state._selectedSegmentObjIdx = null;
  state.multiSelectedSegments.clear();
  if (state.objects.includes(objRef)) return;
  state.selected = null;
  state.multiSelected.clear();
}

/** removePolylineSpan + výběr + přepočet + hláška (společný konec všech cest). */
function _trimPolylineSpan(idx, obj, A, B) {
  pushUndo();
  removePolylineSpan(idx, obj, A, B);
  _resetSelectionAfterSpan(obj);
  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Oříznuto ✓");
}

// ── Oříznutí kružnice / oblouku ──

function trimCircularObject(idx, obj, wx, wy) {
  const isFullCircle = obj.type === 'circle';
  const cx = obj.cx, cy = obj.cy, r = obj.r;

  const circSeg = isFullCircle
    ? { cx, cy, r }
    : { cx, cy, r, startAngle: obj.startAngle, endAngle: obj.endAngle, ccw: obj.ccw };

  const pts = collectCircleIntersections(idx, circSeg);

  if (isFullCircle && pts.length < 2) {
    showToast("Kružnice potřebuje alespoň 2 průsečíky pro oříznutí");
    return;
  }
  if (!isFullCircle && pts.length === 0) {
    showToast("Žádný průsečík pro oříznutí");
    return;
  }

  const clickAngle = Math.atan2(wy - cy, wx - cx);

  if (isFullCircle) {
    // Seřadit průsečíky podle úhlu
    const sorted = pts.map(p => ({
      ...p,
      angle: Math.atan2(p.y - cy, p.x - cx)
    }));
    sorted.sort((a, b) => normalizeAngle(a.angle) - normalizeAngle(b.angle));

    // Najít dva sousední body, které obklopují kliknutí
    const normClick = normalizeAngle(clickAngle);
    let bracketIdx = 0;

    for (let i = 0; i < sorted.length; i++) {
      const next = (i + 1) % sorted.length;
      const a1 = normalizeAngle(sorted[i].angle);
      const a2 = normalizeAngle(sorted[next].angle);
      let contains;
      if (a1 <= a2) {
        contains = normClick >= a1 - 1e-9 && normClick <= a2 + 1e-9;
      } else {
        contains = normClick >= a1 - 1e-9 || normClick <= a2 + 1e-9;
      }
      if (contains) { bracketIdx = i; break; }
    }

    const nextIdx = (bracketIdx + 1) % sorted.length;

    // Přichytí úhel k nejbližšímu vrcholu polyline – opraví floating-point odchylky
    function snapAngleToVertex(angle) {
      const ex = cx + r * Math.cos(angle), ey = cy + r * Math.sin(angle);
      let bestAngle = angle, bestDist = 0.01; // tolerance 0.01 jednotky
      for (const o of state.objects) {
        if (o.type === 'polyline' && o.vertices) {
          for (const v of o.vertices) {
            const d = Math.hypot(v.x - ex, v.y - ey);
            if (d < bestDist) { bestDist = d; bestAngle = Math.atan2(v.y - cy, v.x - cx); }
          }
        }
        if (o.type === 'line') {
          for (const v of [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }]) {
            const d = Math.hypot(v.x - ex, v.y - ey);
            if (d < bestDist) { bestDist = d; bestAngle = Math.atan2(v.y - cy, v.x - cx); }
          }
        }
      }
      return bestAngle;
    }

    const startAngle = snapAngleToVertex(sorted[nextIdx].angle);
    const endAngle   = snapAngleToVertex(sorted[bracketIdx].angle);

    // Ponechat oblouk od sorted[nextIdx] do sorted[bracketIdx] (CCW)
    pushUndo();
    state.objects[idx] = {
      type: 'arc',
      cx, cy, r,
      startAngle,
      endAngle,
      ccw: true,
      name: obj.name || `Oblouk ${obj.id}`,
      id: obj.id,
      layer: obj.layer,
      ...(obj.color ? { color: obj.color } : {}),
      ...(obj.isStock ? { isStock: true } : {}),
    };
  } else {
    // Oblouk – oříznutí
    const ccw = obj.ccw !== false;

    function arcPos(angle) {
      return ccw
        ? normalizeAngle(angle - obj.startAngle)
        : normalizeAngle(obj.startAngle - angle);
    }

    const sweep = arcPos(obj.endAngle);
    const clickPos = arcPos(clickAngle);

    // Filtrovat průsečíky uvnitř oblouku
    const interior = pts.map(p => {
      const a = Math.atan2(p.y - cy, p.x - cx);
      return { ...p, angle: a, pos: arcPos(a) };
    }).filter(p => p.pos > 1e-9 && p.pos < sweep - 1e-9)
      .sort((a, b) => a.pos - b.pos);

    if (interior.length === 0) {
      showToast("Žádný vhodný průsečík na oblouku");
      return;
    }

    pushUndo();

    // Hranice: [start, ...interior, end]
    const boundaries = [
      { angle: obj.startAngle, pos: 0 },
      ...interior,
      { angle: obj.endAngle, pos: sweep }
    ];

    // Najít segment obsahující kliknutí
    let segIndex = 0;
    for (let i = 0; i < boundaries.length - 1; i++) {
      if (clickPos >= boundaries[i].pos - 1e-9 && clickPos <= boundaries[i + 1].pos + 1e-9) {
        segIndex = i;
        break;
      }
    }

    const leftBound = boundaries[segIndex];
    const rightBound = boundaries[segIndex + 1];

    // Přichytí úhel k nejbližšímu vrcholu – opraví floating-point odchylky
    function snapArcAngle(angle) {
      const ex = cx + r * Math.cos(angle), ey = cy + r * Math.sin(angle);
      let best = angle, bestDist = 0.01;
      for (const o of state.objects) {
        if (o.type === 'polyline' && o.vertices) {
          for (const v of o.vertices) {
            const d = Math.hypot(v.x - ex, v.y - ey);
            if (d < bestDist) { bestDist = d; best = Math.atan2(v.y - cy, v.x - cx); }
          }
        }
        if (o.type === 'line') {
          for (const v of [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }]) {
            const d = Math.hypot(v.x - ex, v.y - ey);
            if (d < bestDist) { bestDist = d; best = Math.atan2(v.y - cy, v.x - cx); }
          }
        }
      }
      return best;
    }

    if (segIndex === 0) {
      // Klik blízko začátku → ořízni začátek
      obj.startAngle = snapArcAngle(rightBound.angle);
    } else if (segIndex === boundaries.length - 2) {
      // Klik blízko konce → ořízni konec
      obj.endAngle = snapArcAngle(leftBound.angle);
    } else {
      // Klik uprostřed → rozdělit oblouk na dva
      const origEnd = obj.endAngle;
      obj.endAngle = snapArcAngle(leftBound.angle);

      const newArcId = state.nextId++;
      const newArc = {
        type: 'arc',
        cx, cy, r,
        startAngle: rightBound.angle,
        endAngle: origEnd,
        name: `Oblouk ${newArcId}`,
        id: newArcId,
        layer: obj.layer,
        ...(obj.color ? { color: obj.color } : {}),
      };
      if (ccw === false) newArc.ccw = false;
      state.objects.push(newArc);
    }
  }

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Oříznuto ✓");
}

// ── Oříznutí obloukového segmentu v polyline ──

function trimArcSegInPolyline(idx, obj, si, wx, wy) {
  const n = obj.vertices.length;
  const p1 = obj.vertices[si];
  const p2 = obj.vertices[(si + 1) % n];
  const b = obj.bulges[si];
  const arc = bulgeToArc(p1, p2, b);
  if (!arc) { showToast("Chyba při výpočtu oblouku"); return; }

  const circSeg = { cx: arc.cx, cy: arc.cy, r: arc.r, startAngle: arc.startAngle, endAngle: arc.endAngle, ccw: arc.ccw };

  // Průsečíky s ostatními objekty
  const pts = collectCircleIntersections(idx, circSeg);
  // Průsečíky s ostatními segmenty téže polyline
  pts.push(...collectSamePolylineArcIntersections(obj, si, circSeg));

  // Deduplikace
  const unique = [];
  for (const pt of pts) {
    if (!unique.some(u => Math.hypot(u.x - pt.x, u.y - pt.y) < 1e-6)) unique.push(pt);
  }

  if (unique.length === 0) { showToast("Žádný průsečík pro oříznutí"); return; }

  const clickAngle = Math.atan2(wy - arc.cy, wx - arc.cx);
  const ccw = arc.ccw;

  function arcPos(angle) {
    return ccw
      ? normalizeAngle(angle - arc.startAngle)
      : normalizeAngle(arc.startAngle - angle);
  }

  const sweep = arcPos(arc.endAngle);
  const clickPos = arcPos(clickAngle);

  const interior = unique.map(p => {
    const a = Math.atan2(p.y - arc.cy, p.x - arc.cx);
    return { ...p, angle: a, pos: arcPos(a) };
  }).filter(p => p.pos > 1e-9 && p.pos < sweep - 1e-9)
    .sort((a, b) => a.pos - b.pos);

  if (interior.length === 0) { showToast("Žádný vhodný průsečík na oblouku"); return; }

  const boundaries = [
    { pos: 0, x: p1.x, y: p1.y },
    ...interior,
    { pos: sweep, x: p2.x, y: p2.y }
  ];

  let segI = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (clickPos >= boundaries[i].pos - 1e-9 && clickPos <= boundaries[i + 1].pos + 1e-9) {
      segI = i; break;
    }
  }

  // Odstranit kliknutý úsek oblouku mezi sousedními hranicemi
  const L = boundaries[segI], R = boundaries[segI + 1];
  _trimPolylineSpan(idx, obj, { segIdx: si, x: L.x, y: L.y }, { segIdx: si, x: R.x, y: R.y });
}

// ── Dvoubodový trim ──

/** Vrátí projekci bodu (wx,wy) na objekt. Výsledek závisí na typu objektu. */
function projectOnObject(obj, wx, wy) {
  if (obj.type === 'line' || obj.type === 'constr') {
    const dx = obj.x2 - obj.x1, dy = obj.y2 - obj.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) return null;
    let t = ((wx - obj.x1) * dx + (wy - obj.y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return { kind: 'line', t, x: obj.x1 + t * dx, y: obj.y1 + t * dy };
  }
  if (obj.type === 'circle') {
    const angle = Math.atan2(wy - obj.cy, wx - obj.cx);
    return { kind: 'circle', angle, x: obj.cx + obj.r * Math.cos(angle), y: obj.cy + obj.r * Math.sin(angle) };
  }
  if (obj.type === 'arc') {
    const ccw = obj.ccw !== false;
    function arcPosA(a) { return ccw ? normalizeAngle(a - obj.startAngle) : normalizeAngle(obj.startAngle - a); }
    const sweep = arcPosA(obj.endAngle);
    let pos = arcPosA(Math.atan2(wy - obj.cy, wx - obj.cx));
    if (pos > sweep) pos = (pos - sweep < 2 * Math.PI - sweep) ? sweep : 0;
    const angle = ccw ? obj.startAngle + pos : obj.startAngle - pos;
    return { kind: 'arc', pos, sweep, angle, x: obj.cx + obj.r * Math.cos(angle), y: obj.cy + obj.r * Math.sin(angle) };
  }
  if (obj.type === 'polyline') {
    const si = findSegmentAt(obj, wx, wy);
    if (si === null) return null;
    const n = obj.vertices.length;
    const p1 = obj.vertices[si], p2 = obj.vertices[(si + 1) % n];
    const b = obj.bulges?.[si] || 0;
    if (b === 0) {
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-12) return null;
      let t = ((wx - p1.x) * dx + (wy - p1.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      return { kind: 'pl-line', segIdx: si, t, x: p1.x + t * dx, y: p1.y + t * dy };
    } else {
      const arc = bulgeToArc(p1, p2, b);
      if (!arc) return null;
      const ccw = arc.ccw;
      function arcPosB(a) { return ccw ? normalizeAngle(a - arc.startAngle) : normalizeAngle(arc.startAngle - a); }
      const sweep = arcPosB(arc.endAngle);
      let pos = arcPosB(Math.atan2(wy - arc.cy, wx - arc.cx));
      if (pos > sweep) pos = (pos - sweep < 2 * Math.PI - sweep) ? sweep : 0;
      const angle = ccw ? arc.startAngle + pos : arc.startAngle - pos;
      return { kind: 'pl-arc', segIdx: si, pos, sweep, arc, angle, x: arc.cx + arc.r * Math.cos(angle), y: arc.cy + arc.r * Math.sin(angle) };
    }
  }
  return null;
}

/** Odstraní úsek kontury mezi body na různých segmentech (P1 → P2 ve směru kontury). */
function trimPolylineBetweenSegments(idx, obj, p1, p2) {
  if (p1.segIdx > p2.segIdx) [p1, p2] = [p2, p1];
  _trimPolylineSpan(idx, obj, p1, p2);
}

/** Odstraní část objektu mezi dvěma projekcemi (výsledek z projectOnObject). */
function trimBetweenProjections(idx, obj, p1, p2) {
  // Cross-segment trim pro polyline
  const bothPl = (p1.kind === 'pl-line' || p1.kind === 'pl-arc') &&
                 (p2.kind === 'pl-line' || p2.kind === 'pl-arc');
  if (bothPl && p1.segIdx !== p2.segIdx) {
    return trimPolylineBetweenSegments(idx, obj, p1, p2);
  }

  if (p1.kind !== p2.kind || p1.segIdx !== p2.segIdx) {
    showToast("Oba body musí být na stejném segmentu objektu");
    return;
  }

  // Segment kontury: odstranit úsek mezi body – NEposouvat sdílené vrcholy
  // (dřív se tím zdeformoval sousední segment / zmizel zbytek oblouku)
  if (p1.kind === 'pl-line' || p1.kind === 'pl-arc') {
    const n = obj.vertices.length;
    const v1 = obj.vertices[p1.segIdx];
    let q1 = p1, q2 = p2;
    if (p1.kind === 'pl-line') {
      const v2 = obj.vertices[(p1.segIdx + 1) % n];
      const dx = v2.x - v1.x, dy = v2.y - v1.y, len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) return;
      const t = p => Math.max(0, Math.min(1, ((p.x - v1.x) * dx + (p.y - v1.y) * dy) / len2));
      const at = tt => ({ segIdx: p1.segIdx, x: v1.x + tt * dx, y: v1.y + tt * dy });
      const [t1, t2] = [t(p1), t(p2)].sort((a, b) => a - b);
      q1 = at(t1); q2 = at(t2);
    } else {
      const arc = p1.arc;
      const pos = p => {
        const a = Math.atan2(p.y - arc.cy, p.x - arc.cx);
        return arc.ccw ? normalizeAngle(a - arc.startAngle) : normalizeAngle(arc.startAngle - a);
      };
      const at = ps => {
        const a = arc.ccw ? arc.startAngle + ps : arc.startAngle - ps;
        return { segIdx: p1.segIdx, x: arc.cx + arc.r * Math.cos(a), y: arc.cy + arc.r * Math.sin(a) };
      };
      const [ps1, ps2] = [pos(p1), pos(p2)].sort((a, b) => a - b);
      q1 = ps1 < 1e-6 ? { segIdx: p1.segIdx, x: v1.x, y: v1.y } : at(ps1);
      q2 = at(ps2);
    }
    _trimPolylineSpan(idx, obj, q1, q2);
    return;
  }
  pushUndo();

  if (p1.kind === 'line') {
    // Přepočítej t z přesných souřadnic (snap point může mít přesnější x,y než parametr t)
    const ldx = obj.x2 - obj.x1, ldy = obj.y2 - obj.y1, lLenSq = ldx * ldx + ldy * ldy;
    let t1 = lLenSq > 1e-12 ? Math.max(0, Math.min(1, ((p1.x - obj.x1) * ldx + (p1.y - obj.y1) * ldy) / lLenSq)) : p1.t;
    let t2 = lLenSq > 1e-12 ? Math.max(0, Math.min(1, ((p2.x - obj.x1) * ldx + (p2.y - obj.y1) * ldy) / lLenSq)) : p2.t;
    if (t1 > t2) [t1, t2] = [t2, t1];
    const px1 = obj.x1 + t1 * ldx, py1 = obj.y1 + t1 * ldy;
    const px2 = obj.x1 + t2 * ldx, py2 = obj.y1 + t2 * ldy;
    if (t1 < 1e-6) { obj.x1 = px2; obj.y1 = py2; }
    else if (t2 > 1 - 1e-6) { obj.x2 = px1; obj.y2 = py1; }
    else {
      const newId = state.nextId++;
      state.objects.push({ ...inheritedProps(obj), type: obj.type, x1: px2, y1: py2, x2: obj.x2, y2: obj.y2, name: `Úsečka ${newId}`, id: newId });
      obj.x2 = px1; obj.y2 = py1;
    }
  }

  else if (p1.kind === 'arc') {
    const ccw = obj.ccw !== false;
    // Přepočítej pos z přesných snap souřadnic
    function arcSnapPos(p) {
      const a = Math.atan2(p.y - obj.cy, p.x - obj.cx);
      return ccw ? normalizeAngle(a - obj.startAngle) : normalizeAngle(obj.startAngle - a);
    }
    let pos1 = arcSnapPos(p1), pos2 = arcSnapPos(p2);
    if (pos1 > pos2) [pos1, pos2] = [pos2, pos1];
    const a1 = ccw ? obj.startAngle + pos1 : obj.startAngle - pos1;
    const a2 = ccw ? obj.startAngle + pos2 : obj.startAngle - pos2;
    if (pos1 < 1e-6) { obj.startAngle = a2; }
    else if (pos2 > p1.sweep - 1e-6) { obj.endAngle = a1; }
    else {
      const newId = state.nextId++;
      state.objects.push({ ...inheritedProps(obj), type: 'arc', cx: obj.cx, cy: obj.cy, r: obj.r, startAngle: a2, endAngle: obj.endAngle, ccw: obj.ccw, name: `Oblouk ${newId}`, id: newId });
      obj.endAngle = a1;
    }
  }

  else if (p1.kind === 'circle') {
    // Přepočítej úhel z přesných snap souřadnic
    let a1 = Math.atan2(p1.y - obj.cy, p1.x - obj.cx);
    let a2 = Math.atan2(p2.y - obj.cy, p2.x - obj.cx);
    // Ponechat oblouk od a2 do a1 (CCW), odebrat od a1 do a2
    state.objects[idx] = { ...inheritedProps(obj), type: 'arc', cx: obj.cx, cy: obj.cy, r: obj.r, startAngle: a2, endAngle: a1, name: obj.name || `Oblouk ${obj.id}`, id: obj.id };
  }

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Oříznuto ✓");
}

// ── Auto-trim: nalezení hranic (snap bodů) na segmentu ──

/** Deduplikuje a seřadí pole hranic podle klíče. */
function deduplicateAndSort(arr, key) {
  const unique = [];
  for (const b of arr) {
    if (!unique.some(u => Math.abs(u[key] - b[key]) < 1e-6)) unique.push(b);
  }
  unique.sort((a, c) => a[key] - c[key]);
  return unique;
}

/**
 * Sbírá všechny snap-relevantní hranice (průsečíky + krajní body) na daném
 * segmentu/objektu. Výsledek je pole {t nebo pos, x, y} seřazené podél objektu.
 */
function collectSegmentBoundaries(idx, obj, proj) {
  const key = (proj.kind === 'line' || proj.kind === 'pl-line') ? 't' : 'pos';
  const result = [];

  // Helper: přidej bod a zkontroluj zda leží na objektu v parametru p ∈ (eps, max-eps)
  const addEndpoints = (circ, v1, v2, dx, dy, lenSq, eps) => {
    if (circ.startAngle === undefined) return;
    for (const ep of [
      { x: circ.cx + circ.r * Math.cos(circ.startAngle), y: circ.cy + circ.r * Math.sin(circ.startAngle) },
      { x: circ.cx + circ.r * Math.cos(circ.endAngle),   y: circ.cy + circ.r * Math.sin(circ.endAngle) },
    ]) {
      const t2 = ((ep.x - v1.x) * dx + (ep.y - v1.y) * dy) / lenSq;
      if (t2 > eps && t2 < 1 - eps) {
        const px = v1.x + t2 * dx, py = v1.y + t2 * dy;
        if (Math.hypot(px - ep.x, py - ep.y) < 0.05) result.push({ [key]: t2, x: px, y: py });
      }
    }
  };

  if (proj.kind === 'line') {
    const dx = obj.x2 - obj.x1, dy = obj.y2 - obj.y1, lenSq = dx * dx + dy * dy;
    result.push({ [key]: 0, x: obj.x1, y: obj.y1 }, { [key]: 1, x: obj.x2, y: obj.y2 });
    const seg = { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2, isConstr: false };
    for (let i = 0; i < state.objects.length; i++) {
      if (i === idx) continue;
      const o = state.objects[i];
      if (o.isDimension || o.isCoordLabel || o.skipIntersections) continue;
      for (const s of getLines(o)) for (const p of intersectLineLine(seg, s)) {
        const t = ((p.x - obj.x1) * dx + (p.y - obj.y1) * dy) / lenSq;
        if (t > 1e-6 && t < 1 - 1e-6) result.push({ [key]: t, ...p });
      }
      for (const c of getCircles(o)) {
        for (const p of intersectLineCircle(seg, c)) {
          const t = ((p.x - obj.x1) * dx + (p.y - obj.y1) * dy) / lenSq;
          if (t > 1e-6 && t < 1 - 1e-6) result.push({ [key]: t, ...p });
        }
        if (c.startAngle !== undefined) addEndpoints(c, obj, obj, dx, dy, lenSq, 1e-6);
      }
    }
  }

  else if (proj.kind === 'pl-line') {
    const si = proj.segIdx, n = obj.vertices.length;
    const v1 = obj.vertices[si], v2 = obj.vertices[(si + 1) % n];
    const dx = v2.x - v1.x, dy = v2.y - v1.y, lenSq = dx * dx + dy * dy;
    result.push({ [key]: 0, x: v1.x, y: v1.y }, { [key]: 1, x: v2.x, y: v2.y });
    const seg = { x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, isConstr: false };
    for (let i = 0; i < state.objects.length; i++) {
      if (i === idx) continue;
      const o = state.objects[i];
      if (o.isDimension || o.isCoordLabel || o.skipIntersections) continue;
      for (const s of getLines(o)) for (const p of intersectLineLine(seg, s)) {
        const t = ((p.x - v1.x) * dx + (p.y - v1.y) * dy) / lenSq;
        if (t > 1e-6 && t < 1 - 1e-6) result.push({ [key]: t, ...p });
      }
      for (const c of getCircles(o)) {
        for (const p of intersectLineCircle(seg, c)) {
          const t = ((p.x - v1.x) * dx + (p.y - v1.y) * dy) / lenSq;
          if (t > 1e-6 && t < 1 - 1e-6) result.push({ [key]: t, ...p });
        }
        if (c.startAngle !== undefined) addEndpoints(c, v1, v2, dx, dy, lenSq, 1e-6);
      }
    }
    // Průsečíky s ostatními segmenty téže kontury (jako u obloukového segmentu)
    for (const p of collectSamePolylineIntersections(obj, si, seg)) {
      const t = ((p.x - v1.x) * dx + (p.y - v1.y) * dy) / lenSq;
      if (t > 1e-6 && t < 1 - 1e-6) result.push({ [key]: t, ...p });
    }
  }

  else if (proj.kind === 'arc' || proj.kind === 'circle') {
    const isCircle = proj.kind === 'circle';
    const ccw = obj.ccw !== false;
    function ap(a) { return isCircle ? normalizeAngle(a) : (ccw ? normalizeAngle(a - obj.startAngle) : normalizeAngle(obj.startAngle - a)); }
    const circSeg = isCircle ? { cx: obj.cx, cy: obj.cy, r: obj.r }
      : { cx: obj.cx, cy: obj.cy, r: obj.r, startAngle: obj.startAngle, endAngle: obj.endAngle, ccw };
    if (!isCircle) {
      result.push({ [key]: 0, x: obj.cx + obj.r * Math.cos(obj.startAngle), y: obj.cy + obj.r * Math.sin(obj.startAngle) });
      result.push({ [key]: proj.sweep, x: obj.cx + obj.r * Math.cos(obj.endAngle), y: obj.cy + obj.r * Math.sin(obj.endAngle) });
    }
    for (const p of collectCircleIntersections(idx, circSeg)) {
      const pos = ap(Math.atan2(p.y - obj.cy, p.x - obj.cx));
      result.push({ [key]: pos, ...p });
    }
  }

  else if (proj.kind === 'pl-arc') {
    const arc = proj.arc, ccw = arc.ccw;
    const si = proj.segIdx, n = obj.vertices.length;
    const v1 = obj.vertices[si], v2 = obj.vertices[(si + 1) % n];
    function ap(a) { return ccw ? normalizeAngle(a - arc.startAngle) : normalizeAngle(arc.startAngle - a); }
    const circSeg = { cx: arc.cx, cy: arc.cy, r: arc.r, startAngle: arc.startAngle, endAngle: arc.endAngle, ccw };
    result.push({ [key]: 0, x: v1.x, y: v1.y });
    result.push({ [key]: proj.sweep, x: v2.x, y: v2.y });
    for (const p of collectCircleIntersections(idx, circSeg)) {
      const pos = ap(Math.atan2(p.y - arc.cy, p.x - arc.cx));
      if (pos > 1e-6 && pos < proj.sweep - 1e-6) result.push({ [key]: pos, ...p });
    }
  }

  return deduplicateAndSort(result, key);
}

/** Pokusí se o auto-trim: najde hranice okolo kliknutého místa a ořízne mezi nimi. */
function attemptAutoTrim(idx, obj, proj, wx, wy) {
  // Kružnice a oblouky (i standalone) → použij robustní trimCircularObject
  if (proj.kind === 'circle' || proj.kind === 'arc') {
    const circSeg = proj.kind === 'circle'
      ? { cx: obj.cx, cy: obj.cy, r: obj.r }
      : { cx: obj.cx, cy: obj.cy, r: obj.r, startAngle: obj.startAngle, endAngle: obj.endAngle, ccw: obj.ccw };
    const pts = collectCircleIntersections(idx, circSeg);
    const minPts = proj.kind === 'circle' ? 2 : 1;
    if (pts.length < minPts) return false;
    trimCircularObject(idx, obj, wx, wy);
    return true;
  }
  // Polyline obloukový segment → použij trimArcSegInPolyline
  if (proj.kind === 'pl-arc') {
    const arc = proj.arc;
    const circSeg = { cx: arc.cx, cy: arc.cy, r: arc.r, startAngle: arc.startAngle, endAngle: arc.endAngle, ccw: arc.ccw };
    const pts = collectCircleIntersections(idx, circSeg);
    if (pts.length === 0) return false;
    trimArcSegInPolyline(idx, obj, proj.segIdx, wx, wy);
    return true;
  }

  const key = (proj.kind === 'line' || proj.kind === 'pl-line') ? 't' : 'pos';
  const clickParam = proj[key] ?? proj.t ?? proj.pos ?? 0;

  const boundaries = collectSegmentBoundaries(idx, obj, proj);
  if (!boundaries || boundaries.length < 2) return false;

  // Najdi nejbližší hranici vlevo a vpravo od kliknutí
  let left = null, right = null;
  for (const b of boundaries) {
    if (b[key] <= clickParam + 1e-9 && (left === null || b[key] > left[key])) left = b;
    if (b[key] >= clickParam - 1e-9 && (right === null || b[key] < right[key])) right = b;
  }
  if (!left || !right || Math.abs(left[key] - right[key]) < 1e-6) return false;

  // Oba krajní body musí existovat jako skutečné hranice (ne jen klik uprostřed ničeho)
  const proj1 = { ...proj, [key]: left[key], x: left.x, y: left.y };
  const proj2 = { ...proj, [key]: right[key], x: right.x, y: right.y };
  trimBetweenProjections(idx, obj, proj1, proj2);
  return true;
}

// ── Stav oříznutí ──
let _trimFirst = null; // { idx, proj }

export function resetTrimState() {
  _trimFirst = null;
}

/**
 * Trim tool – kombinovaný režim:
 *  • Klik na volné místo segmentu (edge snap) → auto-trim mezi snap body na obou stranách
 *  • Klik přímo NA snap bod (endpoint / průsečík) → dvoubodový mód: bod1 → bod2
 */
/**
 * Přichytí projekci ke snap bodům (průsečíky, krajní body) na segmentu.
 * Vrátí upravenou projekci s přesnými souřadnicemi nejbližšího snap bodu.
 */
function snapProjToBoundary(idx, obj, proj) {
  const boundaries = collectSegmentBoundaries(idx, obj, proj);
  if (!boundaries || boundaries.length === 0) return proj;
  const key = (proj.kind === 'line' || proj.kind === 'pl-line') ? 't' : 'pos';
  let best = null, bestDist = Infinity;
  for (const b of boundaries) {
    const d = Math.hypot(b.x - proj.x, b.y - proj.y);
    if (d < bestDist) { bestDist = d; best = b; }
  }
  if (!best) return proj;
  return { ...proj, [key]: best[key], x: best.x, y: best.y };
}

export function handleTrimClick(wx, wy) {
  const idx = findObjectAt(wx, wy);

  if (idx === null) {
    if (_trimFirst !== null) { _trimFirst = null; showToast("Oříznutí zrušeno"); }
    else showToast("Klepněte na objekt k oříznutí");
    return;
  }

  const obj = state.objects[idx];
  if (obj.isDimension || obj.isCoordLabel || obj.skipIntersections) return;

  const proj = projectOnObject(obj, wx, wy);
  if (!proj) { showToast("Oříznutí tohoto objektu není podporováno"); return; }

  // Detekce: je kurzor přichycen ke snap bodu (endpoint/průsečík) nebo jen k hraně?
  const snappedToPoint = state.mouse?.snapType === 'point';

  if (_trimFirst === null) {
    if (!snappedToPoint) {
      // Auto-trim: klik do středu segmentu → najdi hranice a ořízni
      if (attemptAutoTrim(idx, obj, proj, wx, wy)) return;
      // Auto-trim selhal – vstupme do dvoubodového módu se snap na nejbližší hranici
    }
    // Dvoubodový mód: přichyť k nejbližšímu snap bodu na segmentu
    const snapped = snappedToPoint ? { ...proj, x: wx, y: wy } : snapProjToBoundary(idx, obj, proj);
    _trimFirst = { idx, proj: snapped };
    showToast("✓ Bod 1 uložen – klikněte na druhý bod oříznutí");
    return;
  }

  // Dvoubodový mód – druhý bod
  const first = _trimFirst;
  _trimFirst = null;

  if (idx !== first.idx) {
    showToast("Druhý bod musí být na stejném objektu – začněte znovu");
    return;
  }

  // Přichyť druhý bod k nejbližšímu snap bodu
  const snapped2 = snappedToPoint ? { ...proj, x: wx, y: wy } : snapProjToBoundary(idx, obj, proj);

  if (Math.hypot(snapped2.x - first.proj.x, snapped2.y - first.proj.y) < 1e-6) {
    showToast("Oba body jsou na stejném místě – zkuste znovu");
    return;
  }

  trimBetweenProjections(idx, obj, first.proj, snapped2);
}

/** Oříznutí z předvybraného objektu. Vrací true pokud se operace provedla. */
export function trimFromSelection() {
  const { lines, circles } = analyzeSelection();

  // Oříznutí kružnice/oblouku z výběru
  if (circles.length === 1 && lines.length === 0) {
    const circInfo = circles[0];
    const idx = circInfo.idx;
    const obj = state.objects[idx];
    if (!obj) return false;
    showToast("Pro oříznutí kružnice/oblouku klepněte přímo na část, kterou chcete odstranit");
    return true;
  }

  if (lines.length !== 1) return false;

  const lineInfo = lines[0];
  const idx = lineInfo.idx;
  const obj = state.objects[idx];
  if (!obj) return false;

  // Pro polyline s vybraným segmentem musíme použít getLineSegment se segIdx
  let ls;
  if (obj.type === 'polyline' && lineInfo.segIdx !== null) {
    const v = obj.vertices;
    const si = lineInfo.segIdx;
    const n = v.length;
    const p1 = v[si], p2 = v[(si + 1) % n];
    const b = obj.bulges?.[si] || 0;
    if (b !== 0) { showToast("Oříznutí obloukového segmentu není podporováno"); return true; }
    ls = {
      seg: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y },
      setP1: (x, y) => { p1.x = x; p1.y = y; },
      setP2: (x, y) => { p2.x = x; p2.y = y; },
      segIdx: si
    };
  } else {
    ls = getLineSegment(obj, (obj.x1 + obj.x2) / 2, (obj.y1 + obj.y2) / 2);
  }
  if (!ls) return false;

  const dx0 = ls.seg.x2 - ls.seg.x1, dy0 = ls.seg.y2 - ls.seg.y1;
  if (dx0 * dx0 + dy0 * dy0 < 1e-12) { showToast("Úsečka má nulovou délku"); return true; }

  // Najít průsečíky
  const pts = [];
  const lineSeg = { x1: ls.seg.x1, y1: ls.seg.y1, x2: ls.seg.x2, y2: ls.seg.y2, isConstr: false };
  for (let i = 0; i < state.objects.length; i++) {
    if (i === idx) continue;
    const other = state.objects[i];
    if (other.isDimension || other.isCoordLabel || other.skipIntersections) continue;
    for (const seg of getLines(other)) pts.push(...intersectLineLine(lineSeg, seg));
    for (const circ of getCircles(other)) pts.push(...intersectLineCircle(lineSeg, circ));
  }
  if (pts.length === 0) { showToast("Žádný průsečík pro oříznutí"); return true; }

  // Kontrola kotev – zakotvený konec nelze ořezat
  const a1 = isAnchored(ls.seg.x1, ls.seg.y1);
  const a2 = isAnchored(ls.seg.x2, ls.seg.y2);
  if (a1 && a2) { showToast("Oba konce jsou zakotveny – nelze oříznout"); return true; }

  showEndpointChoiceDialog("Oříznutí – výběr konce", ls.seg,
    a1 ? "⚓ Začátek (zakotven)" : "Oříznout ze začátku",
    a2 ? "⚓ Konec (zakotven)" : "Oříznout z konce",
    (end) => {
      if (end === 1 && a1) { showToast("Tento konec je zakotven – nelze oříznout"); return; }
      if (end === 2 && a2) { showToast("Tento konec je zakotven – nelze oříznout"); return; }
      let bestPt = null, bestDist = Infinity;
      for (const p of pts) {
        const d = end === 1
          ? Math.hypot(p.x - ls.seg.x1, p.y - ls.seg.y1)
          : Math.hypot(p.x - ls.seg.x2, p.y - ls.seg.y2);
        if (d < bestDist && d > 1e-9) { bestDist = d; bestPt = p; }
      }
      if (!bestPt) { showToast("Žádný vhodný průsečík"); return; }
      if (ls.segIdx !== null && ls.segIdx !== undefined) {
        // Segment kontury: odstranit úsek od konce segmentu po průsečík –
        // posunutím sdíleného vrcholu by se zdeformoval sousední segment
        const si = ls.segIdx;
        const P = { segIdx: si, x: bestPt.x, y: bestPt.y };
        if (end === 1) _trimPolylineSpan(idx, obj, { segIdx: si, x: ls.seg.x1, y: ls.seg.y1 }, P);
        else _trimPolylineSpan(idx, obj, P, { segIdx: si, x: ls.seg.x2, y: ls.seg.y2 });
        return;
      }
      pushUndo();
      if (end === 1) ls.setP1(bestPt.x, bestPt.y);
      else ls.setP2(bestPt.x, bestPt.y);
      calculateAllIntersections();
      updateAssociativeDimensions();
      renderAll();
      showToast("Oříznuto ✓");
    }
  );
  return true;
}
