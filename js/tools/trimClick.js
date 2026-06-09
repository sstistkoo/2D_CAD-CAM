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
import { distPointToSegment, getRectCorners, bulgeToArc } from '../utils.js';

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
    { pos: 0 },
    ...interior,
    { pos: sweep }
  ];

  let segI = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (clickPos >= boundaries[i].pos - 1e-9 && clickPos <= boundaries[i + 1].pos + 1e-9) {
      segI = i; break;
    }
  }

  pushUndo();

  if (segI === 0) {
    // Ořízni začátek: posuň p1 na první průsečík
    const np = interior[0];
    obj.vertices[si] = { x: np.x, y: np.y };
    obj.bulges[si] = computeNewBulge({ x: np.x, y: np.y }, p2, arc.cx, arc.cy, ccw);
  } else if (segI === boundaries.length - 2) {
    // Ořízni konec: posuň p2 na poslední průsečík
    const np = interior[interior.length - 1];
    obj.vertices[(si + 1) % n] = { x: np.x, y: np.y };
    obj.bulges[si] = computeNewBulge(p1, { x: np.x, y: np.y }, arc.cx, arc.cy, ccw);
  } else {
    // Uprostřed: ořízni blíže kliknuté straně
    const leftBound = boundaries[segI];
    const rightBound = boundaries[segI + 1];
    if (clickPos - boundaries[0].pos < boundaries[boundaries.length - 1].pos - clickPos) {
      const np = rightBound;
      obj.vertices[si] = { x: np.x, y: np.y };
      obj.bulges[si] = computeNewBulge({ x: np.x, y: np.y }, p2, arc.cx, arc.cy, ccw);
    } else {
      const np = leftBound;
      obj.vertices[(si + 1) % n] = { x: np.x, y: np.y };
      obj.bulges[si] = computeNewBulge(p1, { x: np.x, y: np.y }, arc.cx, arc.cy, ccw);
    }
  }

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Oříznuto ✓");
}

// ── Oříznutí hrany obdélníku (rozloží na úsečky) ──

function trimRectEdge(idx, obj, wx, wy) {
  const rc = getRectCorners(obj);

  // Najít nejbližší hranu
  let closestEdge = 0, closestDist = Infinity;
  for (let i = 0; i < 4; i++) {
    const d = distPointToSegment(wx, wy, rc[i].x, rc[i].y, rc[(i + 1) % 4].x, rc[(i + 1) % 4].y);
    if (d < closestDist) { closestDist = d; closestEdge = i; }
  }

  const p1 = rc[closestEdge];
  const p2 = rc[(closestEdge + 1) % 4];
  const edgeSeg = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, isConstr: false };

  // Průsečíky hrany s ostatními objekty (ne s obdélníkem samotným)
  const pts = [];
  for (let i = 0; i < state.objects.length; i++) {
    if (i === idx) continue;
    const other = state.objects[i];
    if (other.isDimension || other.isCoordLabel || other.skipIntersections) continue;
    for (const seg of getLines(other)) {
      pts.push(...intersectLineLine(edgeSeg, seg));
    }
    for (const circ of getCircles(other)) {
      pts.push(...intersectLineCircle(edgeSeg, circ));
    }
  }

  if (pts.length === 0) { showToast("Žádný průsečík pro oříznutí"); return; }

  // Určit stranu oříznutí
  const a1 = isAnchored(p1.x, p1.y);
  const a2 = isAnchored(p2.x, p2.y);
  if (a1 && a2) { showToast("Oba konce jsou zakotveny – nelze oříznout"); return; }

  let trimEnd;
  if (a1) { trimEnd = 2; }
  else if (a2) { trimEnd = 1; }
  else {
    const d1 = Math.hypot(wx - p1.x, wy - p1.y);
    const d2 = Math.hypot(wx - p2.x, wy - p2.y);
    trimEnd = d1 < d2 ? 1 : 2;
  }

  let bestPt = null, bestDist = Infinity;
  for (const p of pts) {
    const d = trimEnd === 1
      ? Math.hypot(p.x - p1.x, p.y - p1.y)
      : Math.hypot(p.x - p2.x, p.y - p2.y);
    if (d < bestDist && d > 1e-9) { bestDist = d; bestPt = p; }
  }
  if (!bestPt) { showToast("Žádný vhodný průsečík"); return; }

  // Rozložit obdélník na 4 úsečky s oříznutím cílové hrany
  pushUndo();
  const newLines = [];
  for (let i = 0; i < 4; i++) {
    const lp1 = rc[i];
    const lp2 = rc[(i + 1) % 4];
    const lineId = state.nextId++;
    const line = {
      type: 'line',
      x1: lp1.x, y1: lp1.y,
      x2: lp2.x, y2: lp2.y,
      name: `Úsečka ${lineId}`,
      id: lineId,
      layer: obj.layer,
      ...(obj.color ? { color: obj.color } : {}),
    };
    if (i === closestEdge) {
      if (trimEnd === 1) { line.x1 = bestPt.x; line.y1 = bestPt.y; }
      else { line.x2 = bestPt.x; line.y2 = bestPt.y; }
    }
    newLines.push(line);
  }
  state.objects.splice(idx, 1, ...newLines);

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Obdélník rozložen a oříznuto ✓");
}

// ── Oříznutí úsečky ──

function trimLineSeg(idx, obj, ls, wx, wy) {
  // Guard: zero-length segment
  const dx0 = ls.seg.x2 - ls.seg.x1, dy0 = ls.seg.y2 - ls.seg.y1;
  if (dx0 * dx0 + dy0 * dy0 < 1e-12) { showToast("Úsečka má nulovou délku"); return; }

  // Collect all intersection points on this line segment from other objects
  const pts = [];
  const lineSeg = { x1: ls.seg.x1, y1: ls.seg.y1, x2: ls.seg.x2, y2: ls.seg.y2, isConstr: false };
  for (let i = 0; i < state.objects.length; i++) {
    if (i === idx) continue;
    const other = state.objects[i];
    if (other.isDimension || other.isCoordLabel || other.skipIntersections) continue;
    for (const seg of getLines(other)) {
      pts.push(...intersectLineLine(lineSeg, seg));
    }
    for (const circ of getCircles(other)) {
      pts.push(...intersectLineCircle(lineSeg, circ));
      // Krajní body oblouku jako kandidáti (tečna: průsečík leží mimo úhlový rozsah → standardně odmítnut)
      if (circ.startAngle !== undefined) {
        for (const endPt of [
          { x: circ.cx + circ.r * Math.cos(circ.startAngle), y: circ.cy + circ.r * Math.sin(circ.startAngle) },
          { x: circ.cx + circ.r * Math.cos(circ.endAngle),   y: circ.cy + circ.r * Math.sin(circ.endAngle)   },
        ]) {
          // Ověř, že krajní bod leží na úsečce (t ∈ [0,1])
          const dx = lineSeg.x2 - lineSeg.x1, dy = lineSeg.y2 - lineSeg.y1;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 1e-12) continue;
          const t = ((endPt.x - lineSeg.x1) * dx + (endPt.y - lineSeg.y1) * dy) / lenSq;
          if (t < -1e-6 || t > 1 + 1e-6) continue;
          const px = lineSeg.x1 + t * dx, py = lineSeg.y1 + t * dy;
          if (Math.hypot(px - endPt.x, py - endPt.y) < 0.01) pts.push({ x: px, y: py });
        }
      }
    }
  }

  // Také průsečíky s ostatními segmenty téže polyline (pokud jde o polyline segment)
  if (obj.type === 'polyline' && ls.segIdx !== null) {
    pts.push(...collectSamePolylineIntersections(obj, ls.segIdx, lineSeg));
  }

  if (pts.length === 0) { showToast("Žádný průsečík pro oříznutí"); return; }

  // Determine which end of the line is closer to click point
  const a1 = isAnchored(ls.seg.x1, ls.seg.y1);
  const a2 = isAnchored(ls.seg.x2, ls.seg.y2);
  if (a1 && a2) { showToast("Oba konce jsou zakotveny – nelze oříznout"); return; }
  let trimEnd;
  if (a1) { trimEnd = 2; }
  else if (a2) { trimEnd = 1; }
  else {
    const d1 = Math.hypot(wx - ls.seg.x1, wy - ls.seg.y1);
    const d2 = Math.hypot(wx - ls.seg.x2, wy - ls.seg.y2);
    trimEnd = d1 < d2 ? 1 : 2;
  }

  // Find intersection closest to the trimmed end
  let bestPt = null, bestDist = Infinity;
  for (const p of pts) {
    const d = trimEnd === 1
      ? Math.hypot(p.x - ls.seg.x1, p.y - ls.seg.y1)
      : Math.hypot(p.x - ls.seg.x2, p.y - ls.seg.y2);
    if (d < bestDist && d > 1e-9) {
      bestDist = d;
      bestPt = p;
    }
  }
  if (!bestPt) { showToast("Žádný vhodný průsečík"); return; }

  pushUndo();
  if (trimEnd === 1) { ls.setP1(bestPt.x, bestPt.y); }
  else { ls.setP2(bestPt.x, bestPt.y); }

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Oříznuto ✓");
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

/** Rozdělí polyline na dvě části: [start..P1] a [P2..end]. */
function trimPolylineBetweenSegments(idx, obj, p1, p2) {
  // Zajistíme, že si1 ≤ si2
  if (p1.segIdx > p2.segIdx) [p1, p2] = [p2, p1];
  const si1 = p1.segIdx, si2 = p2.segIdx;
  const n = obj.vertices.length;
  // Pracujeme vždy jako otevřená polyline (split otevře i uzavřenou)
  const segCount = n - 1;

  const P1 = { x: p1.x, y: p1.y };
  const P2 = { x: p2.x, y: p2.y };

  // Část 1: v[0..si1] + P1
  const verts1 = obj.vertices.slice(0, si1 + 1).map(v => ({ ...v }));
  const bulges1 = (obj.bulges || []).slice(0, si1);
  const p1AtVertex = Math.hypot(P1.x - obj.vertices[si1].x, P1.y - obj.vertices[si1].y) < 1e-6;
  if (!p1AtVertex) {
    if (p1.kind === 'pl-arc') {
      bulges1.push(computeNewBulge(obj.vertices[si1], P1, p1.arc.cx, p1.arc.cy, p1.arc.ccw));
    } else {
      bulges1.push(0);
    }
    verts1.push(P1);
  }

  // Část 2: P2 + v[si2+1..end]
  const verts2 = [];
  const bulges2 = [];
  const nextVert = obj.vertices[Math.min(si2 + 1, n - 1)];
  const p2AtVertex = nextVert && si2 + 1 < n &&
    Math.hypot(P2.x - nextVert.x, P2.y - nextVert.y) < 1e-6;
  if (!p2AtVertex && si2 + 1 < n) {
    verts2.push(P2);
    if (p2.kind === 'pl-arc' && p2.arc) {
      bulges2.push(computeNewBulge(P2, obj.vertices[si2 + 1], p2.arc.cx, p2.arc.cy, p2.arc.ccw));
    } else {
      bulges2.push(0);
    }
  }
  for (let i = si2 + 1; i < n; i++) verts2.push({ ...obj.vertices[i] });
  for (let i = si2 + 1; i < segCount; i++) bulges2.push((obj.bulges || [])[i] || 0);

  // Sanity check: bulges musí mít délku verts - 1
  while (bulges1.length > verts1.length - 1) bulges1.pop();
  while (bulges2.length > verts2.length - 1) bulges2.pop();

  pushUndo();

  // Modifikuj stávající objekt na část 1 (pokud má ≥ 2 vrcholy)
  if (verts1.length >= 2) {
    obj.vertices = verts1;
    obj.bulges = bulges1;
    obj.closed = false;
  } else {
    state.objects.splice(idx, 1);
  }

  // Přidej část 2 jako nový objekt (pokud má ≥ 2 vrcholy)
  if (verts2.length >= 2) {
    const newId = state.nextId++;
    state.objects.push({
      type: 'polyline',
      vertices: verts2,
      bulges: bulges2,
      closed: false,
      name: obj.name || `Kontura ${newId}`,
      id: newId,
      layer: obj.layer,
      ...(obj.color ? { color: obj.color } : {}),
      ...(obj.isStock ? { isStock: true } : {}),
    });
  }

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Oříznuto ✓");
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
      state.objects.push({ type: 'line', x1: px2, y1: py2, x2: obj.x2, y2: obj.y2, name: `Úsečka ${newId}`, id: newId, layer: obj.layer, ...(obj.isStock ? { isStock: true } : {}) });
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
      state.objects.push({ type: 'arc', cx: obj.cx, cy: obj.cy, r: obj.r, startAngle: a2, endAngle: obj.endAngle, ccw: obj.ccw, name: `Oblouk ${newId}`, id: newId, layer: obj.layer, ...(obj.isStock ? { isStock: true } : {}) });
      obj.endAngle = a1;
    }
  }

  else if (p1.kind === 'circle') {
    // Přepočítej úhel z přesných snap souřadnic
    let a1 = Math.atan2(p1.y - obj.cy, p1.x - obj.cx);
    let a2 = Math.atan2(p2.y - obj.cy, p2.x - obj.cx);
    const newId = state.nextId++;
    // Ponechat oblouk od a2 do a1 (CCW), odebrat od a1 do a2
    state.objects[idx] = { type: 'arc', cx: obj.cx, cy: obj.cy, r: obj.r, startAngle: a2, endAngle: a1, name: obj.name || `Oblouk ${newId}`, id: obj.id, layer: obj.layer, ...(obj.color ? { color: obj.color } : {}), ...(obj.isStock ? { isStock: true } : {}) };
  }

  else if (p1.kind === 'pl-line') {
    const si = p1.segIdx;
    const n = obj.vertices.length;
    const v1 = obj.vertices[si], v2 = obj.vertices[(si + 1) % n];
    const pldx = v2.x - v1.x, pldy = v2.y - v1.y, plLenSq = pldx * pldx + pldy * pldy;
    // Přepočítej t ze snap souřadnic pro přesnost
    let t1 = plLenSq > 1e-12 ? Math.max(0, Math.min(1, ((p1.x - v1.x) * pldx + (p1.y - v1.y) * pldy) / plLenSq)) : p1.t;
    let t2 = plLenSq > 1e-12 ? Math.max(0, Math.min(1, ((p2.x - v1.x) * pldx + (p2.y - v1.y) * pldy) / plLenSq)) : p2.t;
    if (t1 > t2) [t1, t2] = [t2, t1];
    const pt1 = { x: v1.x + t1 * pldx, y: v1.y + t1 * pldy };
    const pt2 = { x: v1.x + t2 * pldx, y: v1.y + t2 * pldy };
    if (t1 < 1e-6) { obj.vertices[si] = { ...obj.vertices[si], ...pt2 }; }
    else if (t2 > 1 - 1e-6) { obj.vertices[(si + 1) % n] = { ...obj.vertices[(si + 1) % n], ...pt1 }; }
    else {
      // Střed – zachovat větší část, ořezat menší
      obj.vertices[(si + 1) % n] = { ...obj.vertices[(si + 1) % n], ...pt1 };
      const newId = state.nextId++;
      state.objects.push({ type: 'line', x1: pt2.x, y1: pt2.y, x2: v2.x, y2: v2.y, name: `Úsečka ${newId}`, id: newId, layer: obj.layer, ...(obj.isStock ? { isStock: true } : {}) });
    }
  }

  else if (p1.kind === 'pl-arc') {
    const si = p1.segIdx;
    const n = obj.vertices.length;
    const arc = p1.arc;
    const ccw = arc.ccw;
    // Přepočítej pos z přesných snap souřadnic
    function plArcSnapPos(p) {
      const a = Math.atan2(p.y - arc.cy, p.x - arc.cx);
      return ccw ? normalizeAngle(a - arc.startAngle) : normalizeAngle(arc.startAngle - a);
    }
    let pos1 = plArcSnapPos(p1), pos2 = plArcSnapPos(p2);
    if (pos1 > pos2) [pos1, pos2] = [pos2, pos1];
    const a1 = ccw ? arc.startAngle + pos1 : arc.startAngle - pos1;
    const a2 = ccw ? arc.startAngle + pos2 : arc.startAngle - pos2;
    const newPt1 = { x: arc.cx + arc.r * Math.cos(a1), y: arc.cy + arc.r * Math.sin(a1) };
    const newPt2 = { x: arc.cx + arc.r * Math.cos(a2), y: arc.cy + arc.r * Math.sin(a2) };
    if (pos1 < 1e-6) {
      obj.vertices[si] = { ...obj.vertices[si], ...newPt2 };
      obj.bulges[si] = computeNewBulge(obj.vertices[si], obj.vertices[(si + 1) % n], arc.cx, arc.cy, ccw);
    } else if (pos2 > p1.sweep - 1e-6) {
      obj.vertices[(si + 1) % n] = { ...obj.vertices[(si + 1) % n], ...newPt1 };
      obj.bulges[si] = computeNewBulge(obj.vertices[si], obj.vertices[(si + 1) % n], arc.cx, arc.cy, ccw);
    } else {
      obj.vertices[(si + 1) % n] = { ...obj.vertices[(si + 1) % n], ...newPt1 };
      obj.bulges[si] = computeNewBulge(obj.vertices[si], obj.vertices[(si + 1) % n], arc.cx, arc.cy, ccw);
    }
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
    if (!circ.startAngle !== undefined) return;
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
