// ╔══════════════════════════════════════════════════════════════╗
// ║  Tečna – click logika                                      ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { bulgeToArc, getNearestPointOnObject, isAngleBetween, getRectCorners } from '../utils.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { setHint, resetHint } from '../ui.js';
import {
  findObjectAt, findSegmentAt, calculateAllIntersections,
  tangentsFromPointToCircle, tangentsTwoCircles,
  circlePositionsTangentToLine, circlePositionsTangentToTwoLines,
  circlePositionsTangentToLineAndPoint, circlePositionsTangentToCircleAndLine,
  circlePositionsTangentToCircleAndPoint,
  circlePositionsTangentToTwoSegments, circleTangentToThreeSegments,
  getPolylineSegmentAsLine,
  circleThrough3Points, circleTangentToLineAndTwoPoints,
  circleTangentToTwoLinesAndPoint, circleTangentToThreeLines,
  circleTangentToCircleAndTwoPoints
} from '../geometry.js';
import { showTangentChoiceDialog, showTangentPositionDialog, showTangentCircleLineActionDialog, showTangentNewCircleRadiusDialog } from '../dialogs.js';
import { hasAnchoredPoint } from './anchorClick.js';

let _lastTangentNewCircleR = 0;

// ── Extrahuje segment jako constraint objekt {type:'line',...} nebo {type:'arc',...} ──
function extractSegmentConstraint(obj, segIdx) {
  if (obj.type === 'line' || obj.type === 'constr')
    return { type: 'line', x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
  if (obj.type === 'circle' || obj.type === 'arc')
    return { type: 'arc', cx: obj.cx, cy: obj.cy, r: obj.r };
  if (obj.type === 'polyline' && segIdx != null) {
    const bulge = obj.bulges[segIdx] || 0;
    if (bulge === 0) {
      const seg = getPolylineSegmentAsLine(obj, segIdx);
      return seg ? { type: 'line', ...seg } : null;
    }
    const p1 = obj.vertices[segIdx];
    const p2 = obj.vertices[(segIdx + 1) % obj.vertices.length];
    const arc = bulgeToArc(p1, p2, bulge);
    return arc ? { type: 'arc', cx: arc.cx, cy: arc.cy, r: arc.r } : null;
  }
  return null;
}

// ── Koncové body objektu (pro detekci propojení s výkresem) ──
function objectEndpoints(o) {
  switch (o.type) {
    case 'point': return [{ x: o.x, y: o.y }];
    case 'line': case 'constr': return [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }];
    case 'arc': return [
      { x: o.cx + o.r * Math.cos(o.startAngle), y: o.cy + o.r * Math.sin(o.startAngle) },
      { x: o.cx + o.r * Math.cos(o.endAngle),   y: o.cy + o.r * Math.sin(o.endAngle) },
    ];
    case 'rect': return getRectCorners(o);
    case 'polyline': return (o.vertices || []).map(v => ({ x: v.x, y: v.y }));
    default: return []; // kružnice nemá koncové body
  }
}

// ── Je objekt součástí výkresu? ──
// Vrací true, když se na obrysu objektu nachází koncový bod jiného objektu
// (napojení v kontuře / bod položený na kružnici) NEBO když některý vlastní
// koncový bod leží na jiném objektu. Takový objekt se při tečnosti nehýbe.
function isPartOfDrawing(idx) {
  const obj = state.objects[idx];
  if (!obj) return false;
  const TOL = 1e-2;
  const skip = o => !o || o.isDimension || o.isCoordLabel || o.type === 'text' || o.type === 'camNote';
  // 1) koncový bod jiného objektu leží na našem obrysu
  for (let j = 0; j < state.objects.length; j++) {
    if (j === idx) continue;
    const o = state.objects[j];
    if (skip(o)) continue;
    for (const ep of objectEndpoints(o)) {
      const near = getNearestPointOnObject(obj, ep.x, ep.y);
      if (near && near.dist < TOL) return true;
    }
  }
  // 2) náš koncový bod leží na jiném objektu (obloukové konce v kontuře)
  for (const ep of objectEndpoints(obj)) {
    for (let j = 0; j < state.objects.length; j++) {
      if (j === idx) continue;
      const o = state.objects[j];
      if (skip(o) || o.type === 'point') continue;
      const near = getNearestPointOnObject(o, ep.x, ep.y);
      if (near && near.dist < TOL) return true;
    }
  }
  return false;
}

// ── Posun přímky (zachová směr i délku) tak, aby byla tečná ke kružnici/oblouku ──
// Vrací {nx, ny, k} = jednotková normála a posun po normále, nebo null.
function lineTangentToCircleShift(lineObj, circObj) {
  const dx = lineObj.x2 - lineObj.x1, dy = lineObj.y2 - lineObj.y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const nx = -dy / len, ny = dx / len;                                   // normála přímky
  const s = (circObj.cx - lineObj.x1) * nx + (circObj.cy - lineObj.y1) * ny; // znaménková vzdálenost středu
  // Dvě tečné polohy: posun normálou o k tak, aby vzdálenost byla ±r.
  const cand = [
    { k: s - circObj.r, tx: circObj.cx - nx * circObj.r, ty: circObj.cy - ny * circObj.r },
    { k: s + circObj.r, tx: circObj.cx + nx * circObj.r, ty: circObj.cy + ny * circObj.r },
  ];
  // U oblouku preferovat stranu, kde tečný bod skutečně leží na oblouku.
  if (circObj.type === 'arc') {
    const onArc = c => isAngleBetween(
      Math.atan2(c.ty - circObj.cy, c.tx - circObj.cx),
      circObj.startAngle, circObj.endAngle, circObj.ccw);
    const inSpan = cand.filter(onArc);
    if (inSpan.length === 1) return { nx, ny, k: inSpan[0].k };
  }
  // Jinak rozhoduje nejmenší pohyb (přisunout na bližší stranu).
  const best = Math.abs(cand[0].k) <= Math.abs(cand[1].k) ? cand[0] : cand[1];
  return { nx, ny, k: best.k };
}

// ── Vypočítá pozice kružnice tečné k jednomu segmentu (zachová r) ──
function singleSegTangentPositions(circ, seg) {
  if (seg.type === 'line')
    return circlePositionsTangentToLine(circ.cx, circ.cy, circ.r, seg.x1, seg.y1, seg.x2, seg.y2);
  // arc: externe (r + arc.r) nebo interně (|r - arc.r|)
  const positions = [];
  for (const sign of [1, -1]) {
    const D = circ.r + sign * seg.r;
    if (D <= 0) continue;
    const dx = circ.cx - seg.cx, dy = circ.cy - seg.cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-9) continue;
    positions.push({ cx: seg.cx + (dx / dist) * D, cy: seg.cy + (dy / dist) * D });
  }
  return positions;
}

// ── Pomocné funkce pro extrakci dat z výběru ──

/**
 * Získá úsečkové data z objektu nebo polyline segmentu.
 */
function getLineData(objIdx, segIdx) {
  const obj = state.objects[objIdx];
  if (!obj) return null;
  if (obj.type === 'line' || obj.type === 'constr') {
    return { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
  }
  if (obj.type === 'polyline' && segIdx !== null && segIdx !== undefined) {
    return getPolylineSegmentAsLine(obj, segIdx);
  }
  return null;
}

/**
 * Získá kružnici z objektu.
 */
function getCircleData(objIdx) {
  const obj = state.objects[objIdx];
  if (!obj) return null;
  if (obj.type === 'circle' || obj.type === 'arc') {
    return { idx: objIdx, cx: obj.cx, cy: obj.cy, r: obj.r };
  }
  return null;
}

/**
 * Analyzuje výběr a vrátí kategorizované objekty.
 */
function analyzeSelection() {
  const circles = [];
  const lines = [];
  const arcSegs = []; // arc segmenty z polyline (jako arc constraints, ne kružnice k přesunu)
  const points = state.selectedPoint ? [...state.selectedPoint] : [];

  const allSelected = new Set();
  if (state.selected !== null) allSelected.add(state.selected);
  for (const idx of state.multiSelected) allSelected.add(idx);
  // Přidat polyline objekty se zvoleným segmentem
  if (state._selectedSegmentObjIdx != null && state.selectedSegment != null)
    allSelected.add(state._selectedSegmentObjIdx);
  for (const idx of state.multiSelectedSegments.keys()) allSelected.add(idx);

  for (const idx of allSelected) {
    const obj = state.objects[idx];
    if (!obj) continue;

    if (obj.type === 'circle' || obj.type === 'arc') {
      circles.push({ idx, cx: obj.cx, cy: obj.cy, r: obj.r });
    } else if (obj.type === 'line' || obj.type === 'constr') {
      lines.push({ idx, x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 });
    } else if (obj.type === 'polyline') {
      const addPolylineSeg = (si) => {
        const bulge = (obj.bulges && obj.bulges[si]) || 0;
        if (bulge !== 0) {
          const p1 = obj.vertices[si];
          const p2 = obj.vertices[(si + 1) % obj.vertices.length];
          const arc = bulgeToArc(p1, p2, bulge);
          if (arc) arcSegs.push({ idx, segIdx: si, cx: arc.cx, cy: arc.cy, r: arc.r });
        } else {
          const seg = getPolylineSegmentAsLine(obj, si);
          if (seg) lines.push({ idx, segIdx: si, ...seg });
        }
      };
      // Segmenty z multiSelectedSegments (multi-výběr segmentů)
      const multiSegs = state.multiSelectedSegments.get(idx);
      if (multiSegs && multiSegs.size > 0) {
        for (const si of multiSegs) addPolylineSeg(si);
      } else if (state.selectedSegment != null && state._selectedSegmentObjIdx === idx) {
        addPolylineSeg(state.selectedSegment);
      }
    }
  }

  return { circles, lines, arcSegs, points };
}

/**
 * Zpracuje výběr a provede tečnou operaci na základě vybraných objektů.
 * Vrací true pokud se operace provedla, false pokud ne.
 */
export function tangentFromSelection() {
  const hasSelection = state.selected !== null || state.multiSelected.size > 0;
  const hasPoints = state.selectedPoint && state.selectedPoint.length > 0;
  if (!hasSelection && !hasPoints) return false;

  const { circles, lines, arcSegs, points } = analyzeSelection();
  if (circles.length === 0 && lines.length === 0 && arcSegs.length === 0 && points.length === 0) return false;

  const otherCircles = [...circles.slice(1), ...arcSegs]; // kružnice/oblouky jako vazby (ne ta co se hýbe)

  // Pomocník: aplikuje novou pozici na kružnici circles[0]
  const applyCircle = (pos, msg) => {
    pushUndo();
    const obj = state.objects[circles[0].idx];
    obj.cx = pos.cx; obj.cy = pos.cy;
    if (pos.r !== undefined) obj.r = pos.r;
    calculateAllIntersections(); renderAll();
    showToast(msg);
  };

  // Pomocník: auto-aplikuje nejbližší pozici (2+ constraint → vždy nejbližší bez dialogu)
  // autoApply=true → vždy nejbližší; false → dialog pokud víc možností
  const showOrApply = (positions, circObj, msg, autoApply = false) => {
    if (positions.length === 0) { showToast("Tečnou pozici nelze najít"); return; }
    const sorted = [...positions].sort((a, b) =>
      Math.hypot(a.cx - circObj.cx, a.cy - circObj.cy) -
      Math.hypot(b.cx - circObj.cx, b.cy - circObj.cy)
    );
    if (autoApply || sorted.length === 1) {
      applyCircle(sorted[0], msg);
    } else {
      showTangentPositionDialog(sorted, circObj, i => applyCircle(sorted[i], msg));
    }
  };

  // Vazby jako segmenty pro circleTangentToThreeSegments
  // kružnice → arc segment, bod → arc se r=0 (kružnice jím prochází)
  const segs = [
    ...lines.map(l => ({ type: 'line', x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 })),
    ...otherCircles.map(c => ({ type: 'arc', cx: c.cx, cy: c.cy, r: c.r })),
  ];
  const ptSegs = points.map(p => ({ type: 'arc', cx: p.x, cy: p.y, r: 0 }));
  const allSegs = [...segs, ...ptSegs];
  const totalConstraints = segs.length + points.length;

  // ════════════════════════════════════════════════════════════════
  // 3 body bez kružnice → vytvořit novou opsanou kružnici
  // ════════════════════════════════════════════════════════════════
  if (circles.length === 0 && lines.length === 0 && points.length >= 3) {
    const pos = circleThrough3Points(
      points[0].x, points[0].y, points[1].x, points[1].y, points[2].x, points[2].y
    );
    if (pos.length === 0) { showToast("Body jsou kolineární, kružnice neexistuje"); return true; }
    pushUndo();
    addObject({ type: 'circle', cx: pos[0].cx, cy: pos[0].cy, r: pos[0].r, name: `Kružnice ${state.nextId}` });
    calculateAllIntersections(); renderAll();
    showToast("Vytvořena opsaná kružnice přes 3 body ✓");
    return true;
  }

  if (circles.length < 1) return false;

  // Kontrola kotvení
  const circObj = state.objects[circles[0].idx];
  if (circObj && hasAnchoredPoint(circObj)) {
    showToast("Kružnice je zakotvena – nelze přesunout tečně");
    return true;
  }
  const circ = circles[0];

  // ════════════════════════════════════════════════════════════════
  // 3 vazby → změní se poloměr i pozice (Apolloniovy úlohy)
  // ════════════════════════════════════════════════════════════════
  if (totalConstraints >= 3) {
    // 3 body → opsaná kružnice (exaktní řešení)
    if (segs.length === 0 && points.length >= 3) {
      const pos = circleThrough3Points(
        points[0].x, points[0].y, points[1].x, points[1].y, points[2].x, points[2].y
      );
      if (pos.length === 0) { showToast("Body jsou kolineární"); return true; }
      showOrApply(pos, circObj, "Kružnice upravena přes 3 body ✓");
      return true;
    }

    // Obecný případ: sestavit všechny trojice a zkusit circleTangentToThreeSegments
    // (funguje pro libovolnou kombinaci úseček, kružnic a bodů jako vazeb)
    const constraints = allSegs.slice(0, 6); // max 6 vazeb, kombinace 3
    const positions = [];
    for (let i = 0; i < constraints.length - 2; i++) {
      for (let j = i + 1; j < constraints.length - 1; j++) {
        for (let k = j + 1; k < constraints.length; k++) {
          const pos = circleTangentToThreeSegments(
            constraints[i], constraints[j], constraints[k],
            circ.cx, circ.cy, circ.r
          );
          for (const p of pos) {
            if (p.r > 1e-6 && !positions.some(q =>
              Math.hypot(p.cx - q.cx, p.cy - q.cy) < 1e-3 && Math.abs(p.r - q.r) < 1e-3
            )) positions.push(p);
          }
        }
      }
    }
    if (positions.length > 0) {
      showOrApply(positions, circObj, "Kružnice upravena tečně ke třem vazbám ✓");
      return true;
    }
    showToast("Tečnou kružnici k daným vazbám nelze najít");
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 2 vazby → zachová se poloměr, přesune se střed
  // ════════════════════════════════════════════════════════════════
  if (totalConstraints === 2) {
    // 2 úsečky
    if (lines.length === 2 && otherCircles.length === 0 && points.length === 0) {
      const pos = circlePositionsTangentToTwoLines(circ.r, segs[0], segs[1]);
      showOrApply(pos, circObj, "Kružnice přesunuta tečně ke dvěma úsečkám ✓", true);
      return true;
    }
    // úsečka + bod
    if (lines.length === 1 && points.length === 1 && otherCircles.length === 0) {
      const l = lines[0];
      const pos = circlePositionsTangentToLineAndPoint(circ.r, l.x1, l.y1, l.x2, l.y2, points[0].x, points[0].y);
      showOrApply(pos, circObj, "Kružnice přesunuta tečně k úsečce přes bod ✓", true);
      return true;
    }
    // 2 body
    if (points.length === 2 && lines.length === 0 && otherCircles.length === 0) {
      const p1 = points[0], p2 = points[1];
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const half = Math.hypot(dx, dy) / 2;
      if (half > circ.r + 1e-9) { showToast("Body jsou příliš daleko – kružnice jimi nemůže procházet"); return true; }
      const h = Math.sqrt(Math.max(0, circ.r * circ.r - half * half));
      const len2 = half * 2 || 1;
      const pos = [
        { cx: mx - dy / len2 * h, cy: my + dx / len2 * h },
        { cx: mx + dy / len2 * h, cy: my - dx / len2 * h }
      ].filter((p, i, a) => !a.slice(0, i).some(q => Math.hypot(p.cx - q.cx, p.cy - q.cy) < 1e-4));
      showOrApply(pos, circObj, "Kružnice přesunuta přes 2 body ✓", true);
      return true;
    }
    // jiná kružnice + úsečka
    if (otherCircles.length === 1 && lines.length === 1 && points.length === 0) {
      const oc = otherCircles[0];
      const l = lines[0];
      const pos = circlePositionsTangentToCircleAndLine(circ.r, oc.cx, oc.cy, oc.r, l.x1, l.y1, l.x2, l.y2);
      showOrApply(pos, circObj, "Kružnice přesunuta tečně ke kružnici a úsečce ✓", true);
      return true;
    }
    // jiná kružnice + bod
    if (otherCircles.length === 1 && points.length === 1 && lines.length === 0) {
      const oc = otherCircles[0];
      const pos = circlePositionsTangentToCircleAndPoint(circ.r, oc.cx, oc.cy, oc.r, points[0].x, points[0].y);
      showOrApply(pos, circObj, "Kružnice přesunuta tečně ke kružnici přes bod ✓", true);
      return true;
    }
    // 2 jiné kružnice (i arc+arc)
    if (otherCircles.length === 2 && lines.length === 0 && points.length === 0) {
      const pos = circlePositionsTangentToTwoSegments(circ.r,
        { type: 'arc', cx: otherCircles[0].cx, cy: otherCircles[0].cy, r: otherCircles[0].r },
        { type: 'arc', cx: otherCircles[1].cx, cy: otherCircles[1].cy, r: otherCircles[1].r }
      );
      showOrApply(pos, circObj, "Kružnice přesunuta tečně ke dvěma kružnicím ✓", true);
      return true;
    }
    // obecná 2-vazba přes segmenty
    const pos2 = circlePositionsTangentToTwoSegments(circ.r, allSegs[0], allSegs[1]);
    showOrApply(pos2, circObj, "Kružnice přesunuta tečně ke dvěma vazbám ✓", true);
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 1 vazba
  // ════════════════════════════════════════════════════════════════
  if (totalConstraints === 1) {
    const seg = allSegs[0];

    // bod → tečné úsečky z bodu ke kružnici
    if (points.length === 1 && segs.length === 0) {
      const pt = points[0];
      const tangents = tangentsFromPointToCircle(pt.x, pt.y, circ.cx, circ.cy, circ.r);
      if (tangents.length === 0) { showToast("Tečna neexistuje (bod uvnitř kružnice)"); return true; }
      showTangentChoiceDialog(tangents, indices => {
        for (const i of indices)
          addObject({ type: 'line', x1: tangents[i].x1, y1: tangents[i].y1, x2: tangents[i].x2, y2: tangents[i].y2, name: `Tečna ${state.nextId}` });
        showToast(`Vytvořeno ${indices.length} tečn ✓`);
      });
      return true;
    }

    // Kružnice/oblouk je součástí výkresu a úsečka je volná (samostatný objekt,
    // nepropojený s ničím) → místo přesunu kružnice přisuneme úsečku ke kružnici.
    // (Zachová se směr i délka úsečky.)
    if (lines.length === 1 && lines[0].segIdx == null && points.length === 0 && otherCircles.length === 0) {
      const lineObj = state.objects[lines[0].idx];
      const isLineObj = lineObj && (lineObj.type === 'line' || lineObj.type === 'constr');
      if (isLineObj && isPartOfDrawing(circles[0].idx) && !isPartOfDrawing(lines[0].idx)) {
        const shift = lineTangentToCircleShift(lineObj, circObj);
        if (!shift) { showToast("Tečnou polohu úsečky nelze najít"); return true; }
        pushUndo();
        lineObj.x1 += shift.nx * shift.k; lineObj.y1 += shift.ny * shift.k;
        lineObj.x2 += shift.nx * shift.k; lineObj.y2 += shift.ny * shift.k;
        calculateAllIntersections(); renderAll();
        showToast("Úsečka přisunuta tečně ke kružnici/oblouku ✓");
        return true;
      }
    }

    // 1 segment (úsečka nebo kružnice/oblouk)
    const pos = singleSegTangentPositions(circ, seg);
    showOrApply(pos, circObj, "Kružnice přesunuta tečně k vazbě ✓");
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 2 kružnice bez dalších vazeb → tečné úsečky NEBO přesun
  // ════════════════════════════════════════════════════════════════
  if (circles.length === 2 && totalConstraints === 0) {
    const c1 = circles[0], c2 = circles[1];
    const tangents = tangentsTwoCircles(c1.cx, c1.cy, c1.r, c2.cx, c2.cy, c2.r);
    const movePos = singleSegTangentPositions(c1, { type: 'arc', cx: c2.cx, cy: c2.cy, r: c2.r });
    // Nabídni obě možnosti jen pokud obě existují; jinak auto
    if (tangents.length > 0 && movePos.length > 0) {
      showTangentChoiceDialog(
        tangents.map((t, i) => ({ ...t, label: `Tečná úsečka ${i + 1}` })),
        indices => {
          for (const i of indices)
            addObject({ type: 'line', x1: tangents[i].x1, y1: tangents[i].y1, x2: tangents[i].x2, y2: tangents[i].y2, name: `Tečna ${state.nextId}` });
          showToast(`Vytvořeno ${indices.length} tečen ✓`);
        }
      );
      return true;
    }
    if (tangents.length > 0) {
      showTangentChoiceDialog(tangents, indices => {
        for (const i of indices)
          addObject({ type: 'line', x1: tangents[i].x1, y1: tangents[i].y1, x2: tangents[i].x2, y2: tangents[i].y2, name: `Tečna ${state.nextId}` });
        showToast(`Vytvořeno ${indices.length} tečen ✓`);
      });
      return true;
    }
    return true;
  }

  return false;
}

export function handleTangentClick(wx, wy) {
  // ── Pokud nejsme v drawing režimu, zkusit selection-based operaci ──
  if (!state.drawing) {
    // Zkontrolovat předvybrané objekty
    const hasSelection = state.selected !== null || state.multiSelected.size > 0;
    const hasPoints = state.selectedPoint && state.selectedPoint.length > 0;

    if (hasSelection || hasPoints) {
      // Analyzovat výběr a zkusit provést operaci
      if (tangentFromSelection()) {
        return; // Operace se provedla z výběru
      }
    }

    // Fallback na klasický click-based režim
    const idx = findObjectAt(wx, wy);
    if (idx !== null) {
      const obj = state.objects[idx];
      if (obj.type === 'circle' || obj.type === 'arc') {
        state.drawing = true;
        state._tangentMode = 'circle-first';
        state._tangentFirstCircle = idx;
        state._tangentPoints = [];
        setHint("Klepněte na kružnici, úsečku nebo bod");
        return;
      }
    }
    // Začít bodem (prázdný klik nebo klik na Bod objekt)
    state.drawing = true;
    state._tangentMode = 'point-circle';
    state.tempPoints = [{ x: wx, y: wy }];
    setHint("Klepněte na kružnici/oblouk pro tečnu z bodu");

  } else {

    // ── Bod → Kružnice: tečné úsečky ──
    if (state._tangentMode === 'point-circle') {
      const idx = findObjectAt(wx, wy);
      if (idx === null) { showToast("Klepněte na kružnici nebo oblouk"); return; }
      const obj = state.objects[idx];
      if (obj.type !== 'circle' && obj.type !== 'arc') { showToast("Vyberte kružnici nebo oblouk"); return; }
      const p = state.tempPoints[0];
      const tangents = tangentsFromPointToCircle(p.x, p.y, obj.cx, obj.cy, obj.r);
      if (tangents.length === 0) {
        showToast("Tečna neexistuje (bod uvnitř kružnice)");
      } else {
        showTangentChoiceDialog(tangents, (indices) => {
          for (const i of indices) {
            const t = tangents[i];
            addObject({ type: 'line', x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2, name: `Tečna ${state.nextId}` });
          }
          showToast(`Vytvořeno ${indices.length} tečn${indices.length === 1 ? 'a' : indices.length < 5 ? 'y' : ''}`);
        });
      }

    // ── Kružnice → ? ──
    } else if (state._tangentMode === 'circle-first') {
      const idx = findObjectAt(wx, wy);
      const circ = state.objects[state._tangentFirstCircle];

      if (idx !== null && (state.objects[idx].type === 'circle' || state.objects[idx].type === 'arc')) {
        // → Kružnice: tečné úsečky mezi dvěma kružnicemi
        if (idx === state._tangentFirstCircle) { showToast("Vyberte jinou kružnici nebo úsečku"); return; }
        // Jiná kružnice → použít jako arc constraint (segment), pokračovat ke 2. vazbě
        const obj = state.objects[idx];
        const seg = { type: 'arc', cx: obj.cx, cy: obj.cy, r: obj.r };
        state._tangentMode = 'circle-seg-2';
        state._tangentSeg1 = seg;
        setHint("Klepněte na 2. segment, bod, nebo Esc");
        showToast("✓ Kružnice jako vazba – klepněte na 2. segment nebo Esc");
        return;
      } else if (idx !== null) {
        // → Segment: uložit jako 1. segment, čekat na 2.
        const obj = state.objects[idx];
        let segIdx = null;
        if (obj.type === 'polyline') segIdx = findSegmentAt(obj, wx, wy);
        const seg = extractSegmentConstraint(obj, segIdx);
        if (!seg) { showToast("Vyberte kružnici, úsečku nebo bod"); return; }
        state._tangentMode = 'circle-seg-2';
        state._tangentSeg1 = seg;
        setHint("Klepněte na 2. segment, bod, nebo Esc");
        showToast("✓ 1. segment – klepněte na 2. segment nebo bod");
        return;
      } else {
        // → Bod (prázdný klik): uložit jako bod, čekat na segment nebo 2. bod
        state._tangentMode = 'circle-point';
        state._tangentPoints = [{ x: wx, y: wy }];
        setHint("Klepněte na segment pro tečnu přes bod, nebo 2. bod pro přesun přes 2 body");
        showToast("✓ Bod zaznamenán – klepněte na segment nebo 2. bod");
        return;
      }

    // ── Kružnice → Bod → ? ──
    } else if (state._tangentMode === 'circle-point') {
      const circ = state.objects[state._tangentFirstCircle];
      const pt1 = state._tangentPoints[0];
      const idx = findObjectAt(wx, wy);

      if (idx !== null && (state.objects[idx].type === 'circle' || state.objects[idx].type === 'arc')) {
        showToast("Klepněte na segment nebo bod, ne kružnici"); return;
      } else if (idx !== null) {
        // → Segment: přesunout kružnici tečně k segmentu přes bod (zachovat r)
        const obj = state.objects[idx];
        let segIdx = null;
        if (obj.type === 'polyline') segIdx = findSegmentAt(obj, wx, wy);
        const seg = extractSegmentConstraint(obj, segIdx);
        if (!seg || seg.type !== 'line') { showToast("Vyberte úsečku"); return; }
        const positions = circlePositionsTangentToLineAndPoint(circ.r, seg.x1, seg.y1, seg.x2, seg.y2, pt1.x, pt1.y);
        if (positions.length === 0) { showToast("Tečnou pozici k úsečce přes bod nelze najít"); return; }
        showTangentPositionDialog(positions, circ, (chosenIdx) => {
          pushUndo();
          circ.cx = positions[chosenIdx].cx;
          circ.cy = positions[chosenIdx].cy;
          calculateAllIntersections();
          renderAll();
          showToast("Kružnice přesunuta tečně k úsečce přes bod ✓");
        });
      } else {
        // → 2. bod: přesunout kružnici přes oba body (zachovat r)
        const pt2 = { x: wx, y: wy };
        const mx = (pt1.x + pt2.x) / 2, my = (pt1.y + pt2.y) / 2;
        const dx = pt2.x - pt1.x, dy = pt2.y - pt1.y;
        const halfDist = Math.hypot(dx, dy) / 2;
        if (halfDist > circ.r + 1e-9) { showToast("Body jsou příliš daleko – kružnice jimi nemůže procházet"); return; }
        const h = Math.sqrt(Math.max(0, circ.r * circ.r - halfDist * halfDist));
        const nx = -dy / (halfDist * 2 || 1), ny = dx / (halfDist * 2 || 1);
        let positions = [{ cx: mx + nx * h, cy: my + ny * h }, { cx: mx - nx * h, cy: my - ny * h }];
        positions = positions.sort((a, b) =>
          Math.hypot(a.cx - circ.cx, a.cy - circ.cy) - Math.hypot(b.cx - circ.cx, b.cy - circ.cy)
        );
        showTangentPositionDialog(positions, circ, (chosenIdx) => {
          pushUndo();
          circ.cx = positions[chosenIdx].cx;
          circ.cy = positions[chosenIdx].cy;
          calculateAllIntersections();
          renderAll();
          showToast("Kružnice přesunuta přes 2 body ✓");
        });
      }

    // ── Kružnice → Seg1 → ? ──
    } else if (state._tangentMode === 'circle-seg-2') {
      const circ = state.objects[state._tangentFirstCircle];
      const circIdx = state._tangentFirstCircle;
      const seg1 = state._tangentSeg1;
      const idx = findObjectAt(wx, wy);

      if (idx === null) {
        // → Bod: přesunout kružnici tečně k seg1 přes bod (zachovat r)
        const pt = { x: wx, y: wy };
        if (seg1.type !== 'line') { showToast("Tečna k oblouku přes bod není podporována"); return; }
        const positions = circlePositionsTangentToLineAndPoint(circ.r, seg1.x1, seg1.y1, seg1.x2, seg1.y2, pt.x, pt.y);
        if (positions.length === 0) { showToast("Tečnou pozici k úsečce přes bod nelze najít"); return; }
        showTangentPositionDialog(positions, circ, (chosenIdx) => {
          pushUndo();
          circ.cx = positions[chosenIdx].cx;
          circ.cy = positions[chosenIdx].cy;
          calculateAllIntersections();
          renderAll();
          showToast("Kružnice přesunuta tečně k segmentu přes bod ✓");
        });
        return;
      }

      const obj = state.objects[idx];
      let segIdx = null;
      if (obj.type === 'polyline') segIdx = findSegmentAt(obj, wx, wy);
      const seg2 = extractSegmentConstraint(obj, segIdx);
      if (!seg2) { showToast("Vyberte úsečku, segment kontury nebo klikněte na prázdné místo pro bod"); return; }

      // → Segment: tečně ke dvěma segmentům (zachovat r)
      let positions = circlePositionsTangentToTwoSegments(circ.r, seg1, seg2);
      if (positions.length === 0) { showToast("Tečnou pozici ke dvěma segmentům nelze najít"); return; }
      positions = [...positions].sort((a, b) =>
        Math.hypot(a.cx - wx, a.cy - wy) - Math.hypot(b.cx - wx, b.cy - wy)
      );
      showTangentPositionDialog(positions, circ, (chosenIdx) => {
        pushUndo();
        circ.cx = positions[chosenIdx].cx;
        circ.cy = positions[chosenIdx].cy;
        calculateAllIntersections();
        renderAll();
        showToast("Klepněte na 3. segment nebo bod pro 3. vazbu, nebo Esc");
        state.drawing = true;
        state._tangentMode = 'circle-seg-3';
        state._tangentFirstCircle = circIdx;
        state._tangentSeg1 = seg1;
        state._tangentSeg2 = seg2;
        setHint("3. vazba: segment (změní r) nebo bod (změní r), nebo Esc");
      });
      return;

    // ── Kružnice → Seg1 → Seg2 → ? (změní r) ──
    } else if (state._tangentMode === 'circle-seg-3') {
      const circ = state.objects[state._tangentFirstCircle];
      const idx = findObjectAt(wx, wy);

      if (idx === null) {
        // → Bod: tečná ke dvěma segmentům přes bod (změní r)
        const pt = { x: wx, y: wy };
        const seg1 = state._tangentSeg1, seg2 = state._tangentSeg2;
        if (seg1.type !== 'line' || seg2.type !== 'line') { showToast("Tečna přes bod funguje jen s úsečkami"); return; }
        const positions = circleTangentToTwoLinesAndPoint(seg1, seg2, pt.x, pt.y);
        if (positions.length === 0) { showToast("Tečnou kružnici ke dvěma segmentům přes bod nelze najít"); return; }
        showTangentPositionDialog(positions, circ, (chosenIdx) => {
          pushUndo();
          circ.cx = positions[chosenIdx].cx;
          circ.cy = positions[chosenIdx].cy;
          circ.r  = positions[chosenIdx].r;
          calculateAllIntersections();
          renderAll();
          showToast(`Kružnice upravena tečně ke dvěma segmentům přes bod (r=${positions[chosenIdx].r.toFixed(3)}) ✓`);
        });
        return;
      }

      const obj = state.objects[idx];
      let segIdx = null;
      if (obj.type === 'polyline') segIdx = findSegmentAt(obj, wx, wy);
      const seg3 = extractSegmentConstraint(obj, segIdx);
      if (!seg3) { showToast("Vyberte segment nebo klikněte na prázdné místo pro bod"); return; }

      // → Segment: tečná ke třem segmentům (změní r)
      const positions = circleTangentToThreeSegments(state._tangentSeg1, state._tangentSeg2, seg3, circ.cx, circ.cy, circ.r);
      if (positions.length === 0) { showToast("Tečnou kružnici ke třem segmentům nelze najít"); return; }
      showTangentPositionDialog(positions, circ, (chosenIdx) => {
        pushUndo();
        circ.cx = positions[chosenIdx].cx;
        circ.cy = positions[chosenIdx].cy;
        circ.r  = positions[chosenIdx].r;
        calculateAllIntersections();
        renderAll();
        showToast(`Kružnice upravena tečně ke třem segmentům (r=${positions[chosenIdx].r.toFixed(3)}) ✓`);
      });
      return;
    }

    // Reset stavu
    state.drawing = false;
    state.tempPoints = [];
    state._tangentMode = null;
    state._tangentFirstCircle = null;
    state._tangentFirstLine = null;
    state._tangentSeg1 = null;
    state._tangentSeg2 = null;
    state._tangentPoints = [];
    resetHint();
  }
}
