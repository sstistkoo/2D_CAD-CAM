// SKICA – geometrie výkresu: Průsečíky objektů výkresu (úsečky/kružnice), přepočet všech průsečíků a odložený CNC export.
// Vyňato z js/geometry.js (16. 10. 2026); geometry.js je rozcestník se stejnými
// exporty, importuje se dál odtamtud.
import { state } from '../state.js';
import { isAngleBetween, bulgeToArc, getRectCorners, getNearestPointOnObject } from '../utils.js';
import { renderAll } from '../render.js';
import { bridge } from '../bridge.js';

// ────────────────────────────────
// ── VÝPOČET PRŮSEČÍKŮ ──
// ────────────────────────────────

/**
 * Vrátí úsečkové segmenty objektu.
 * @param {import('../types.js').DrawObject} obj
 * @returns {import('../types.js').LineSeg[]}
 */
export function getLines(obj) {
  if (obj.type === "line" || obj.type === "constr")
    return [
      {
        x1: obj.x1,
        y1: obj.y1,
        x2: obj.x2,
        y2: obj.y2,
        // Nekonečná jen u CAD konstrukční čáry; oříznutá z CAM (finite) se
        // chová jako běžná úsečka, takže průsečíky nevzniknou mimo její konce.
        isConstr: obj.type === "constr" && !obj.finite,
      },
    ];
  if (obj.type === "rect") {
    const rc = getRectCorners(obj);
    return [
      { x1: rc[0].x, y1: rc[0].y, x2: rc[1].x, y2: rc[1].y },
      { x1: rc[1].x, y1: rc[1].y, x2: rc[2].x, y2: rc[2].y },
      { x1: rc[2].x, y1: rc[2].y, x2: rc[3].x, y2: rc[3].y },
      { x1: rc[3].x, y1: rc[3].y, x2: rc[0].x, y2: rc[0].y },
    ];
  }
  if (obj.type === "polyline") {
    const lines = [];
    const n = obj.vertices.length;
    const segCount = obj.closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      if ((obj.bulges[i] || 0) === 0) {
        const p1 = obj.vertices[i];
        const p2 = obj.vertices[(i + 1) % n];
        lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      }
    }
    return lines;
  }
  return [];
}

/**
 * Vrátí kružnicové/obloukové segmenty objektu.
 * @param {import('../types.js').DrawObject} obj
 * @returns {import('../types.js').CircleSeg[]}
 */
export function getCircles(obj) {
  if (obj.type === "circle")
    return [{ cx: obj.cx, cy: obj.cy, r: obj.r }];
  if (obj.type === "arc")
    return [
      {
        cx: obj.cx,
        cy: obj.cy,
        r: obj.r,
        startAngle: obj.startAngle,
        endAngle: obj.endAngle,
        ccw: obj.ccw,
      },
    ];
  if (obj.type === "polyline") {
    const arcs = [];
    const n = obj.vertices.length;
    const segCount = obj.closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      const b = obj.bulges[i] || 0;
      if (b !== 0) {
        const p1 = obj.vertices[i];
        const p2 = obj.vertices[(i + 1) % n];
        const arc = bulgeToArc(p1, p2, b);
        if (arc) {
          arcs.push({
            cx: arc.cx,
            cy: arc.cy,
            r: arc.r,
            startAngle: arc.startAngle,
            endAngle: arc.endAngle,
            ccw: arc.ccw,
          });
        }
      }
    }
    return arcs;
  }
  return [];
}

/**
 * Průsečík dvou úseček / konstrukčních přímek.
 * @param {import('../types.js').LineSeg} l1
 * @param {import('../types.js').LineSeg} l2
 * @returns {import('../types.js').Point2D[]}
 */
export function intersectLineLine(l1, l2) {
  const { x1, y1, x2, y2 } = l1;
  const { x1: x3, y1: y3, x2: x4, y2: y4 } = l2;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return [];
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  const tOk = l1.isConstr ? true : t >= -1e-9 && t <= 1 + 1e-9;
  const uOk = l2.isConstr ? true : u >= -1e-9 && u <= 1 + 1e-9;
  if (tOk && uOk) {
    return [{ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) }];
  }
  return [];
}

/**
 * Průsečíky přímky a kružnice/oblouku.
 * @param {import('../types.js').LineSeg} line
 * @param {import('../types.js').CircleSeg} circle
 * @returns {import('../types.js').Point2D[]}
 */
export function intersectLineCircle(line, circle) {
  const { x1, y1, x2, y2 } = line;
  const { cx, cy, r } = circle;
  const dx = x2 - x1,
    dy = y2 - y1;
  const fx = x1 - cx,
    fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return []; // Degenerovaná úsečka (nulová délka)
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  // Tolerance pro tečné případy – diskriminant může být mírně záporný
  // kvůli floating-point nepřesnosti; škálujeme s velikostí dat
  const discTol = 1e-6 * Math.max(1, a);
  if (disc < -discTol) return [];
  if (disc < 0) disc = 0;
  disc = Math.sqrt(disc);
  const results = [];
  for (const sign of [-1, 1]) {
    const t = (-b + sign * disc) / (2 * a);
    const tOk = line.isConstr ? true : t >= -1e-9 && t <= 1 + 1e-9;
    if (tOk) {
      const pt = { x: x1 + t * dx, y: y1 + t * dy };
      if (circle.startAngle !== undefined) {
        const angle = Math.atan2(pt.y - cy, pt.x - cx);
        if (!isAngleBetween(angle, circle.startAngle, circle.endAngle, circle.ccw))
          continue;
      }
      results.push(pt);
    }
  }
  // Deduplikace tečných bodů – při tečnosti disc ≈ 0 vzniknou dva téměř totožné body
  if (results.length === 2 &&
      Math.hypot(results[0].x - results[1].x, results[0].y - results[1].y) < 1e-4) {
    results.pop();
  }
  return results;
}

/**
 * Průsečíky dvou kružnic/oblouků.
 * @param {import('../types.js').CircleSeg} c1
 * @param {import('../types.js').CircleSeg} c2
 * @returns {import('../types.js').Point2D[]}
 */
export function intersectCircleCircle(c1, c2) {
  const dx = c2.cx - c1.cx,
    dy = c2.cy - c1.cy;
  const d = Math.hypot(dx, dy);
  if (
    d > c1.r + c2.r + 1e-10 ||
    d < Math.abs(c1.r - c2.r) - 1e-10 ||
    d < 1e-10
  )
    return [];
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const px = c1.cx + (a * dx) / d,
    py = c1.cy + (a * dy) / d;
  const results = [];
  for (const sign of [-1, 1]) {
    const pt = {
      x: px + (sign * h * dy) / d,
      y: py - (sign * h * dx) / d,
    };
    let ok = true;
    if (c1.startAngle !== undefined) {
      const ang = Math.atan2(pt.y - c1.cy, pt.x - c1.cx);
      if (!isAngleBetween(ang, c1.startAngle, c1.endAngle, c1.ccw)) ok = false;
    }
    if (c2.startAngle !== undefined) {
      const ang = Math.atan2(pt.y - c2.cy, pt.x - c2.cx);
      if (!isAngleBetween(ang, c2.startAngle, c2.endAngle, c2.ccw)) ok = false;
    }
    if (ok) results.push(pt);
  }
  if (
    results.length === 2 &&
    Math.hypot(results[0].x - results[1].x, results[0].y - results[1].y) <
      1e-4
  )
    results.pop();
  return results;
}

/** Koncové body objektu (pro filtrování napojení vs průsečíků). */
function getObjectEndpoints(obj) {
  switch (obj.type) {
    case 'line':
    case 'constr':
      return [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
    case 'arc':
      return [
        { x: obj.cx + obj.r * Math.cos(obj.startAngle), y: obj.cy + obj.r * Math.sin(obj.startAngle) },
        { x: obj.cx + obj.r * Math.cos(obj.endAngle), y: obj.cy + obj.r * Math.sin(obj.endAngle) },
      ];
    case 'rect':
      return [
        { x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y1 },
        { x: obj.x2, y: obj.y2 }, { x: obj.x1, y: obj.y2 },
      ];
    case 'polyline':
      return obj.vertices.map(v => ({ x: v.x, y: v.y }));
    default:
      return [];
  }
}

// Automatické obnovení CNC kódu v pravém panelu po každé změně výkresu
// (bez toho zůstával panel se starým kódem, dokud uživatel neklikl na
// export ručně). Debounced, aby se export nepřepočítával při každém
// dílčím kroku vícekrokové operace, jen ~300 ms po poslední změně.
let _autoCncExportTimer = null;
function scheduleAutoCncExport() {
  clearTimeout(_autoCncExportTimer);
  _autoCncExportTimer = setTimeout(() => {
    _autoCncExportTimer = null;
    if (bridge.autoSortAllGroups) bridge.autoSortAllGroups();
    if (bridge.runCncExport) bridge.runCncExport();
  }, 300);
}

/**
 * Čekající obnovení CNC panelu provede hned. Volá se před přenosem do CAM:
 * jinak by doběhlo až po otevření dotazu „mimo profil" a smazalo by jeho
 * fialové zvýraznění (runCncExport → _reportContourIssues).
 */
export function flushAutoCncExport() {
  if (!_autoCncExportTimer) return;
  clearTimeout(_autoCncExportTimer);
  _autoCncExportTimer = null;
  if (bridge.autoSortAllGroups) bridge.autoSortAllGroups();
  if (bridge.runCncExport) bridge.runCncExport();
}

/** Přepočítá všechny průsečíky mezi objekty. */
export function calculateAllIntersections() {
  const pts = [];
  const objs = state.objects;
  for (let i = 0; i < objs.length; i++) {
    if (objs[i].isDimension || objs[i].isCoordLabel || objs[i].skipIntersections) continue;
    for (let j = i + 1; j < objs.length; j++) {
      if (objs[j].isDimension || objs[j].isCoordLabel || objs[j].skipIntersections) continue;
      const lines1 = getLines(objs[i]),
        lines2 = getLines(objs[j]);
      const circs1 = getCircles(objs[i]),
        circs2 = getCircles(objs[j]);

      // Bod ležící na jiném objektu = průsečík (přesune bod přesně na objekt)
      const PT_TOL = 0.5;
      if (objs[i].type === 'point' && objs[j].type !== 'point') {
        const near = getNearestPointOnObject(objs[j], objs[i].x, objs[i].y);
        if (near && near.dist < PT_TOL) {
          objs[i].x = near.x;
          objs[i].y = near.y;
          pts.push({ x: near.x, y: near.y });
        }
        continue;
      }
      if (objs[j].type === 'point' && objs[i].type !== 'point') {
        const near = getNearestPointOnObject(objs[i], objs[j].x, objs[j].y);
        if (near && near.dist < PT_TOL) {
          objs[j].x = near.x;
          objs[j].y = near.y;
          pts.push({ x: near.x, y: near.y });
        }
        continue;
      }

      // Filtrování: bod na koncovém bodě obou objektů = napojení, ne průsečík
      const eps1 = getObjectEndpoints(objs[i]);
      const eps2 = getObjectEndpoints(objs[j]);
      const EP_TOL = 1e-4;
      const isSharedEndpoint = (pt) =>
        eps1.some(ep => Math.hypot(pt.x - ep.x, pt.y - ep.y) < EP_TOL)
        && eps2.some(ep => Math.hypot(pt.x - ep.x, pt.y - ep.y) < EP_TOL);

      for (const l1 of lines1)
        for (const l2 of lines2)
          for (const pt of intersectLineLine(l1, l2))
            if (!isSharedEndpoint(pt)) pts.push(pt);
      for (const l of lines1)
        for (const c of circs2)
          for (const pt of intersectLineCircle(l, c))
            if (!isSharedEndpoint(pt)) pts.push(pt);
      for (const l of lines2)
        for (const c of circs1)
          for (const pt of intersectLineCircle(l, c))
            if (!isSharedEndpoint(pt)) pts.push(pt);
      for (const c1 of circs1)
        for (const c2 of circs2)
          for (const pt of intersectCircleCircle(c1, c2))
            if (!isSharedEndpoint(pt)) pts.push(pt);
    }
  }
  const unique = [];
  for (const pt of pts) {
    if (!unique.some((u) => Math.hypot(u.x - pt.x, u.y - pt.y) < 1e-4))
      unique.push(pt);
  }
  state.intersections = unique;
  if (bridge.updateIntersectionList) bridge.updateIntersectionList();
  renderAll();
  scheduleAutoCncExport();
}
