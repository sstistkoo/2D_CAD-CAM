// ╔══════════════════════════════════════════════════════════════╗
// ║  Oříznutí objektů – click logika                           ║
// ║  Podporuje: úsečky, kružnice, oblouky, obdélníky, kontury  ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { findObjectAt, calculateAllIntersections, getLines, getCircles, intersectLineLine, intersectLineCircle, intersectCircleCircle } from '../geometry.js';
import { getLineSegment, analyzeSelection } from './helpers.js';
import { showEndpointChoiceDialog } from '../dialogs.js';
import { isAnchored } from './anchorClick.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { distPointToSegment, getRectCorners } from '../utils.js';

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

    // Ponechat oblouk od sorted[nextIdx] do sorted[bracketIdx] (CCW)
    pushUndo();
    state.objects[idx] = {
      type: 'arc',
      cx, cy, r,
      startAngle: sorted[nextIdx].angle,
      endAngle: sorted[bracketIdx].angle,
      name: obj.name || `Oblouk ${obj.id}`,
      id: obj.id,
      layer: obj.layer,
      ...(obj.color ? { color: obj.color } : {}),
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

    if (segIndex === 0) {
      // Klik blízko začátku → ořízni začátek
      obj.startAngle = rightBound.angle;
    } else if (segIndex === boundaries.length - 2) {
      // Klik blízko konce → ořízni konec
      obj.endAngle = leftBound.angle;
    } else {
      // Klik uprostřed → rozdělit oblouk na dva
      const origEnd = obj.endAngle;
      obj.endAngle = leftBound.angle;

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
    }
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

// ── Hlavní vstupní bod ──

/** Ořízne objekt k nejbližšímu průsečíku na straně kliknutí. */
export function handleTrimClick(wx, wy) {
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Klepněte na objekt k oříznutí"); return; }
  const obj = state.objects[idx];

  // Kružnice / Oblouk
  if (obj.type === 'circle' || obj.type === 'arc') {
    return trimCircularObject(idx, obj, wx, wy);
  }

  // Obdélník → rozložit a oříznout hranu
  if (obj.type === 'rect') {
    return trimRectEdge(idx, obj, wx, wy);
  }

  // Úsečka / kontura (rovný segment)
  const ls = getLineSegment(obj, wx, wy);
  if (!ls) {
    showToast("Oříznutí tohoto typu objektu není podporováno");
    return;
  }
  trimLineSeg(idx, obj, ls, wx, wy);
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
