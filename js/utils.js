// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Pomocné funkce (snap body, geometrie, labely)      ║
// ╚══════════════════════════════════════════════════════════════╝

import { state } from './state.js';

// ── Bezpečný parser matematických výrazů (bez eval / new Function) ──

/**
 * Rekurzivní sestupný parser aritmetických výrazů.
 * Podporuje: +, -, *, /, ** (nebo ^), závorky, unární mínus, desetinná čísla, vědeckou notaci.
 * Matematické funkce: sin, cos, tan, asin, acos, atan, sqrt, abs, log, ln, round, floor, ceil.
 * Konstanty: pi, e.
 * @param {string} src
 * @returns {number}
 */
export function _parseMathExpr(src) {
  let pos = 0;
  const deg = Math.PI / 180;

  const FUNCS = {
    sin:   v => Math.sin(v * deg),
    cos:   v => Math.cos(v * deg),
    tan:   v => Math.tan(v * deg),
    asin:  v => Math.asin(v) / deg,
    acos:  v => Math.acos(v) / deg,
    atan:  v => Math.atan(v) / deg,
    sinr:  v => Math.sin(v),
    cosr:  v => Math.cos(v),
    tanr:  v => Math.tan(v),
    sqrt:  v => Math.sqrt(v),
    abs:   v => Math.abs(v),
    log:   v => Math.log10(v),
    ln:    v => Math.log(v),
    round: v => Math.round(v),
    floor: v => Math.floor(v),
    ceil:  v => Math.ceil(v),
  };

  const CONSTS = {
    pi: Math.PI,
    e:  Math.E,
  };

  function skip() { while (pos < src.length && src[pos] === ' ') pos++; }

  function parseIdent() {
    const start = pos;
    while (pos < src.length && ((src[pos] >= 'a' && src[pos] <= 'z') || (src[pos] >= 'A' && src[pos] <= 'Z'))) pos++;
    return src.substring(start, pos).toLowerCase();
  }

  function parseNumber() {
    skip();
    const start = pos;
    if (src[pos] === '+' || src[pos] === '-') pos++;
    if (pos < src.length && src[pos] === '.' || (src[pos] >= '0' && src[pos] <= '9')) {
      while (pos < src.length && src[pos] >= '0' && src[pos] <= '9') pos++;
      if (pos < src.length && src[pos] === '.') { pos++; while (pos < src.length && src[pos] >= '0' && src[pos] <= '9') pos++; }
    }
    if (pos < src.length && (src[pos] === 'e' || src[pos] === 'E') && (pos + 1 < src.length && (src[pos + 1] >= '0' && src[pos + 1] <= '9' || src[pos + 1] === '+' || src[pos + 1] === '-'))) {
      pos++;
      if (pos < src.length && (src[pos] === '+' || src[pos] === '-')) pos++;
      while (pos < src.length && src[pos] >= '0' && src[pos] <= '9') pos++;
    }
    const n = parseFloat(src.substring(start, pos));
    if (isNaN(n)) throw new Error('num');
    return n;
  }

  function parseAtom() {
    skip();
    if (src[pos] === '(') { pos++; const v = parseExpr(); skip(); if (src[pos] !== ')') throw new Error(')'); pos++; return v; }
    // Identifikátor – funkce nebo konstanta
    if (pos < src.length && ((src[pos] >= 'a' && src[pos] <= 'z') || (src[pos] >= 'A' && src[pos] <= 'Z'))) {
      const name = parseIdent();
      skip();
      // Funkce – očekáváme závorku
      if (src[pos] === '(') {
        const fn = FUNCS[name];
        if (!fn) throw new Error('fn:' + name);
        pos++; // skip '('
        const arg = parseExpr();
        skip();
        if (src[pos] !== ')') throw new Error(')');
        pos++;
        return fn(arg);
      }
      // Konstanta
      if (name in CONSTS) return CONSTS[name];
      throw new Error('id:' + name);
    }
    return parseNumber();
  }

  function parseUnary() {
    skip();
    if (src[pos] === '-') { pos++; return -parseUnary(); }
    if (src[pos] === '+') { pos++; return parseUnary(); }
    return parseAtom();
  }

  function parsePower() {
    let b = parseUnary(); skip();
    if (pos < src.length - 1 && src[pos] === '*' && src[pos + 1] === '*') { pos += 2; return Math.pow(b, parsePower()); }
    return b;
  }

  function parseTerm() {
    let l = parsePower(); skip();
    while (pos < src.length && (src[pos] === '*' || src[pos] === '/') && !(src[pos] === '*' && src[pos + 1] === '*')) {
      const op = src[pos++]; const r = parsePower(); l = op === '*' ? l * r : l / r; skip();
    }
    return l;
  }

  function parseExpr() {
    let l = parseTerm(); skip();
    while (pos < src.length && (src[pos] === '+' || src[pos] === '-')) {
      const op = src[pos++]; const r = parseTerm(); l = op === '+' ? l + r : l - r; skip();
    }
    return l;
  }

  const result = parseExpr();
  skip();
  if (pos !== src.length) throw new Error('end');
  return result;
}

// ── Bezpečné vyhodnocení matematického výrazu z inputu ──
/** @param {string} str - text z inputu, např. "123+56", "200/3", "(10+5)*2" */
export function safeEvalMath(str) {
  if (typeof str !== 'string') str = String(str ?? '');
  str = str.trim().replace(/,/g, '.');
  if (str === '') return NaN;
  // Povolit: čísla, operátory +−*/(), tečky, mezery, písmena (funkce/konstanty)
  if (!/^[\d+\-*/().^\sa-zA-Z]+$/.test(str)) return NaN;
  // Kontrola závorek
  let depth = 0;
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return NaN;
  }
  if (depth !== 0) return NaN;
  try {
    const expr = str.replace(/\^/g, '**');
    const result = _parseMathExpr(expr);
    return typeof result === 'number' && isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}

// ── Snap body objektů ──
/**
 * Vrátí 4 rohy obdélníku s respektováním rotace.
 * @param {object} obj - objekt s x1,y1,x2,y2 a volitelným rotation (rad)
 * @returns {{ x: number, y: number }[]}
 */
export function getRectCorners(obj) {
  const corners = [
    { x: obj.x1, y: obj.y1 },
    { x: obj.x2, y: obj.y1 },
    { x: obj.x2, y: obj.y2 },
    { x: obj.x1, y: obj.y2 },
  ];
  const rot = obj.rotation || 0;
  if (rot === 0) return corners;
  const cx = (obj.x1 + obj.x2) / 2;
  const cy = (obj.y1 + obj.y2) / 2;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return corners.map(c => ({
    x: cx + (c.x - cx) * cos - (c.y - cy) * sin,
    y: cy + (c.x - cx) * sin + (c.y - cy) * cos,
  }));
}

/**
 * Vrátí snap body daného objektu.
 * @param {import('./types.js').DrawObject} obj
 * @returns {import('./types.js').Point2D[]}
 */
export function getObjectSnapPoints(obj) {
  switch (obj.type) {
    case "point":
      return [{ x: obj.x, y: obj.y }];
    case "line":
    case "constr": {
      const pts = [
        { x: obj.x1, y: obj.y1 },
        { x: obj.x2, y: obj.y2 },
      ];
      if (state.snapMidpoints) {
        pts.push({ x: (obj.x1 + obj.x2) / 2, y: (obj.y1 + obj.y2) / 2, mid: true });
      }
      return pts;
    }
    case "circle": {
      const pts = [];
      if (state.snapCenters) pts.push({ x: obj.cx, y: obj.cy });
      if (state.snapQuadrants) {
        pts.push(
          { x: obj.cx + obj.r, y: obj.cy, quarter: true },
          { x: obj.cx - obj.r, y: obj.cy, quarter: true },
          { x: obj.cx, y: obj.cy + obj.r, quarter: true },
          { x: obj.cx, y: obj.cy - obj.r, quarter: true },
        );
      }
      return pts;
    }
    case "arc": {
      const pts = [];
      if (state.snapCenters) pts.push({ x: obj.cx, y: obj.cy });
      pts.push(
        {
          x: obj.cx + obj.r * Math.cos(obj.startAngle),
          y: obj.cy + obj.r * Math.sin(obj.startAngle),
        },
        {
          x: obj.cx + obj.r * Math.cos(obj.endAngle),
          y: obj.cy + obj.r * Math.sin(obj.endAngle),
        },
      );
      return pts;
    }
    case "rect": {
      const c = getRectCorners(obj);
      const rPts = [...c];
      if (state.snapMidpoints) {
        rPts.push({ x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2, mid: true });
      }
      return rPts;
    }
    case "polyline": {
      const pts = obj.vertices.map(v => ({ x: v.x, y: v.y }));
      // Midpoints of each segment (tagged with mid flag)
      const n = obj.vertices.length;
      const segCount = obj.closed ? n : n - 1;
      for (let i = 0; i < segCount; i++) {
        const p1 = obj.vertices[i];
        const p2 = obj.vertices[(i + 1) % n];
        const b = obj.bulges[i] || 0;
        if (state.snapMidpoints) {
          if (b === 0) {
            pts.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, mid: true });
          } else {
            const arc = bulgeToArc(p1, p2, b);
            if (arc) {
              const midAngle = (arc.startAngle + arc.endAngle) / 2;
              // Adjust midAngle for arc direction
              let ma;
              if (b > 0) {
                ma = arc.startAngle + normalizeAngleDiff(arc.endAngle - arc.startAngle, true) / 2;
              } else {
                ma = arc.startAngle + normalizeAngleDiff(arc.endAngle - arc.startAngle, false) / 2;
              }
              pts.push({ x: arc.cx + arc.r * Math.cos(ma), y: arc.cy + arc.r * Math.sin(ma), mid: true });
            } else {
              pts.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, mid: true });
            }
          }
        }
        // Střed oblouku u bulge segmentu
        if (state.snapCenters && b !== 0) {
          const arc = bulgeToArc(p1, p2, b);
          if (arc) pts.push({ x: arc.cx, y: arc.cy });
        }
      }
      return pts;
    }
    case "text": {
      const pts = [{ x: obj.x, y: obj.y }];
      // Snap body na cestě – začátek a střed textu
      if (obj.pathMode && obj.pathMode !== 'none' && obj.pathObjectId != null) {
        const pathObj = state.objects[obj.pathObjectId];
        if (pathObj && obj.pathMode === 'line' && (pathObj.type === 'line' || pathObj.type === 'constr')) {
          pts.push({ x: pathObj.x1, y: pathObj.y1 });
          pts.push({ x: (pathObj.x1 + pathObj.x2) / 2, y: (pathObj.y1 + pathObj.y2) / 2, mid: true });
        } else if (pathObj && obj.pathMode === 'arc' && pathObj.type === 'arc') {
          const sa = pathObj.startAngle;
          pts.push({ x: pathObj.cx + pathObj.r * Math.cos(sa), y: pathObj.cy + pathObj.r * Math.sin(sa) });
        }
      }
      return pts;
    }
    default:
      return [];
  }
}

// Helper: normalize angle difference for CCW or CW direction
function normalizeAngleDiff(diff, ccw) {
  if (ccw) {
    while (diff < 0) diff += 2 * Math.PI;
    if (diff === 0) diff = 2 * Math.PI;
  } else {
    while (diff > 0) diff -= 2 * Math.PI;
    if (diff === 0) diff = -2 * Math.PI;
  }
  return diff;
}

// ── Nejbližší bod na objektu (pro snap k hraně) ──
/**
 * Vrátí nejbližší bod na hraně objektu (úsečka, kružnice, oblouk, obdélník).
 * @param {import('./types.js').DrawObject} obj
 * @param {number} wx
 * @param {number} wy
 * @returns {{x: number, y: number, dist: number}|null}
 */
export function getNearestPointOnObject(obj, wx, wy) {
  switch (obj.type) {
    case "line":
    case "constr": {
      const p = nearestOnSegment(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2);
      return { x: p.x, y: p.y, dist: Math.hypot(wx - p.x, wy - p.y) };
    }
    case "circle": {
      const dx = wx - obj.cx, dy = wy - obj.cy;
      const d = Math.hypot(dx, dy);
      if (d < 1e-10) return { x: obj.cx + obj.r, y: obj.cy, dist: obj.r };
      return { x: obj.cx + (dx / d) * obj.r, y: obj.cy + (dy / d) * obj.r, dist: Math.abs(d - obj.r) };
    }
    case "arc": {
      const dx = wx - obj.cx, dy = wy - obj.cy;
      const d = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      if (d < 1e-10) return null;
      if (isAngleBetween(angle, obj.startAngle, obj.endAngle)) {
        return { x: obj.cx + (dx / d) * obj.r, y: obj.cy + (dy / d) * obj.r, dist: Math.abs(d - obj.r) };
      }
      // Mimo oblouk – nejbližší koncový bod
      const s = { x: obj.cx + obj.r * Math.cos(obj.startAngle), y: obj.cy + obj.r * Math.sin(obj.startAngle) };
      const e = { x: obj.cx + obj.r * Math.cos(obj.endAngle), y: obj.cy + obj.r * Math.sin(obj.endAngle) };
      const ds = Math.hypot(wx - s.x, wy - s.y);
      const de = Math.hypot(wx - e.x, wy - e.y);
      return ds < de ? { x: s.x, y: s.y, dist: ds } : { x: e.x, y: e.y, dist: de };
    }
    case "rect": {
      const rc = getRectCorners(obj);
      let best = null;
      for (let i = 0; i < 4; i++) {
        const p = nearestOnSegment(wx, wy, rc[i].x, rc[i].y, rc[(i + 1) % 4].x, rc[(i + 1) % 4].y);
        const d = Math.hypot(wx - p.x, wy - p.y);
        if (!best || d < best.dist) best = { x: p.x, y: p.y, dist: d };
      }
      return best;
    }
    case "polyline": {
      const n = obj.vertices.length;
      if (n < 2) return null;
      const segCount = obj.closed ? n : n - 1;
      let best = null;
      for (let i = 0; i < segCount; i++) {
        const p1 = obj.vertices[i];
        const p2 = obj.vertices[(i + 1) % n];
        const b = obj.bulges[i] || 0;
        let px, py, d;
        if (b === 0) {
          const np = nearestOnSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);
          px = np.x; py = np.y;
          d = Math.hypot(wx - px, wy - py);
        } else {
          const arc = bulgeToArc(p1, p2, b);
          if (arc) {
            const ddx = wx - arc.cx, ddy = wy - arc.cy;
            const dist = Math.hypot(ddx, ddy);
            const angle = Math.atan2(ddy, ddx);
            if (dist < 1e-10) {
              px = arc.cx + arc.r; py = arc.cy;
              d = arc.r;
            } else if (isAngleBetween(angle, arc.startAngle, arc.endAngle, arc.ccw)) {
              px = arc.cx + (ddx / dist) * arc.r;
              py = arc.cy + (ddy / dist) * arc.r;
              d = Math.abs(dist - arc.r);
            } else {
              const ds = Math.hypot(wx - p1.x, wy - p1.y);
              const de = Math.hypot(wx - p2.x, wy - p2.y);
              if (ds < de) { px = p1.x; py = p1.y; d = ds; }
              else { px = p2.x; py = p2.y; d = de; }
            }
          } else {
            const np = nearestOnSegment(wx, wy, p1.x, p1.y, p2.x, p2.y);
            px = np.x; py = np.y;
            d = Math.hypot(wx - px, wy - py);
          }
        }
        if (!best || d < best.dist) best = { x: px, y: py, dist: d };
      }
      return best;
    }
    default:
      return null;
  }
}

/** Nejbližší bod na úsečce. */
function nearestOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: x1, y: y1 };
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: x1 + t * dx, y: y1 + t * dy };
}

// ── Vzdálenost bodu od úsečky ──
/**
 * @param {number} px
 * @param {number} py
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number}
 */
export function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ── Test úhlu v rozsahu ──
/**
 * @param {number} angle
 * @param {number} start
 * @param {number} end
 * @param {boolean} [ccw] - Pokud true/false, testuje s tolerancí v daném směru
 * @returns {boolean}
 */
export function isAngleBetween(angle, start, end, ccw) {
  const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (ccw === undefined) {
    // Původní chování: CCW sweep, bez tolerance
    const a = norm(angle - start);
    const e = norm(end - start);
    return a <= e;
  }
  if (ccw) {
    // CCW sweep s tolerancí
    const a = norm(angle - start);
    const e = norm(end - start);
    return a <= e + 1e-9;
  } else {
    // CW sweep s tolerancí
    const a = norm(start - angle);
    const e = norm(start - end);
    return a <= e + 1e-9;
  }
}

// ── Popisky typů ──
/**
 * @param {string} t
 * @returns {string}
 */
export function typeLabel(t) {
  return (
    {
      point: "Bod",
      line: "Úsečka",
      constr: "Konstrukční",
      circle: "Kružnice",
      arc: "Oblouk",
      rect: "Obdélník",
      polyline: "Kontura",
      text: "Text",
      gear: "Ozubené kolo",
      fill: "Výplň",
    }[t] || t
  );
}

/**
 * @param {string} t
 * @returns {string}
 */
export function toolLabel(t) {
  return (
    {
      select: "Výběr",
      move: "Přesun",
      point: "Bod",
      line: "Úsečka",
      constr: "Konstr. čára",
      circle: "Kružnice",
      arc: "Oblouk",
      rect: "Obdélník",
      polyline: "Kontura",
      measure: "Měření",
      tangent: "Tečna",
      offset: "Offset",
      trim: "Oříznout",
      extend: "Prodloužit",
      fillet: "Zaoblení",
      perp: "Kolmice",
      horizontal: "Vodorovnost",
      parallel: "Rovnoběžka",
      dimension: "Kóta",
      chainDimension: "Řetězcová kóta",
      snapPoint: "Přichytit bod",
      text: "Text",
      gear: "Ozubené kolo",
      deleteObj: "Smaž obj.",
      anchor: "Kotva",
      break: "Rozdělit",
      centerMark: "Střed. značka",
      scale: "Měřítko",
      chamfer: "Zkosení",
      filletChamfer: "Zaob./Zkos.",
      mirror: "Zrcadlení",
      circularArray: "Kruhové pole",
      linearArray: "Lineární pole",
      copyPlace: "Kopírovat",
      boolean: "Boolean",
      rotate: "Otočit",
      profileTrace: "Trasování profilu",
      fill: "Vybarvit",
    }[t] || t
  );
}

// ── Bulge → Arc konverze (DXF standard) ──
// bulge = tan(θ/4), kladný = CCW, záporný = CW
/**
 * @param {import('./types.js').Point2D} p1
 * @param {import('./types.js').Point2D} p2
 * @param {number} bulge
 * @returns {import('./types.js').BulgeArc|null}
 */
export function bulgeToArc(p1, p2, bulge) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-10 || bulge === 0) return null;

  const theta = 4 * Math.atan(Math.abs(bulge));
  const r = d / (2 * Math.sin(theta / 2));

  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;

  // Unit normal to chord (pointing left of P1→P2)
  const nx = -dy / d;
  const ny = dx / d;

  const h = r * Math.cos(theta / 2);
  const sign = bulge > 0 ? 1 : -1;
  const cx = mx + sign * h * nx;
  const cy = my + sign * h * ny;

  const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  const endAngle = Math.atan2(p2.y - cy, p2.x - cx);

  return { cx, cy, r, startAngle, endAngle, ccw: bulge > 0 };
}

/**
 * Jako bulgeToArc, ale výsledek vždy v CCW zápisu. Samostatné 'arc' objekty
 * se kreslí proti směru hodin (obj.ccw se při rozkladu nezachovává) — u CW
 * oblouku (záporný bulge) se proto prohodí start/end úhel, jinak by se po
 * rozkladu polyline vykreslil doplňkový (přetočený) oblouk.
 * @param {import('./types.js').Point2D} p1
 * @param {import('./types.js').Point2D} p2
 * @param {number} bulge
 * @returns {import('./types.js').BulgeArc|null}
 */
export function bulgeToCcwArc(p1, p2, bulge) {
  const arc = bulgeToArc(p1, p2, bulge);
  if (!arc) return null;
  if (!arc.ccw) {
    const t = arc.startAngle;
    arc.startAngle = arc.endAngle;
    arc.endAngle = t;
    arc.ccw = true;
  }
  return arc;
}

// ── Radius + direction → bulge ──
/**
 * @param {import('./types.js').Point2D} p1
 * @param {import('./types.js').Point2D} p2
 * @param {number} radius
 * @param {boolean} cw
 * @returns {number}
 */
export function radiusToBulge(p1, p2, radius, cw) {
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (d < 1e-10 || radius < d / 2 - 1e-10) return 0;
  const halfAngle = Math.asin(Math.min(1, d / (2 * radius)));
  const bulge = Math.tan(halfAngle / 2);
  return cw ? -bulge : bulge;
}

// ── Hluboká kopie objektu ──
/**
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function deepClone(obj) {
  return structuredClone(obj);
}

// ── Zjednodušení polyline – odstranění kolineárních vrcholů ──
/**
 * Vrátí novou polylinu se zachovanými poli `vertices` a `bulges`, kde se
 * odstranily vrcholy, jejichž okolí (předchozí, tento, následující) leží
 * na společné přímce a oba sousední bulges jsou 0.
 *
 * Konzervativní: nikdy neodstraní vrchol, k němuž (nebo z něj) vede oblouk.
 * Iteruje až do stabilního stavu, takže odstraní i řetězce kolineárních
 * vrcholů (typický výstup `combineUnion` dvou sousedních obdélníků).
 *
 * @param {{vertices:{x:number,y:number}[], bulges?:number[], closed?:boolean}} poly
 * @param {number} [tolerance=1e-6]  maximální vzdálenost bodu od přímky (mm)
 * @returns {{vertices:{x:number,y:number}[], bulges:number[], closed:boolean}}
 */
export function simplifyPolyline(poly, tolerance = 1e-6) {
  if (!poly || !Array.isArray(poly.vertices) || poly.vertices.length < 3) {
    return {
      vertices: (poly && poly.vertices) ? poly.vertices.slice() : [],
      bulges: (poly && poly.bulges) ? poly.bulges.slice() : [],
      closed: !!(poly && poly.closed),
    };
  }
  const closed = !!poly.closed;
  let verts = poly.vertices.slice();
  let bulges = (poly.bulges || verts.map(() => 0)).slice();
  if (bulges.length < verts.length) {
    while (bulges.length < verts.length) bulges.push(0);
  }

  let changed = true;
  while (changed) {
    changed = false;
    const n = verts.length;
    if (n < 3) break;
    const keep = new Array(n).fill(true);
    const startIdx = closed ? 0 : 1;
    const endIdx = closed ? n : n - 1;

    for (let i = startIdx; i < endIdx; i++) {
      // Najdi nejbližší zachovaný předchůdce (pokud iterujeme po více vrcholech)
      let prevIdx = (i - 1 + n) % n;
      while (!keep[prevIdx] && prevIdx !== i) prevIdx = (prevIdx - 1 + n) % n;
      const nextIdx = (i + 1) % n;
      // Sousední bulges (incoming = bulges[prevIdx], outgoing = bulges[i])
      const bIncoming = bulges[prevIdx] || 0;
      const bOutgoing = bulges[i] || 0;
      if (bIncoming !== 0 || bOutgoing !== 0) continue;

      const p1 = verts[prevIdx], p2 = verts[i], p3 = verts[nextIdx];
      const dx = p3.x - p1.x, dy = p3.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len < tolerance) continue; // zhroucené – raději zachovat
      // Perpendicular distance od p2 k přímce p1-p3
      const dist = Math.abs((p2.x - p1.x) * dy - (p2.y - p1.y) * dx) / len;
      if (dist < tolerance) {
        keep[i] = false;
        changed = true;
      }
    }

    if (changed) {
      const newVerts = [];
      const newBulges = [];
      for (let i = 0; i < n; i++) {
        if (keep[i]) {
          newVerts.push(verts[i]);
          newBulges.push(bulges[i] || 0);
        }
      }
      verts = newVerts;
      bulges = newBulges;
    }
  }

  return { vertices: verts, bulges, closed };
}

// ── Konverze starých polyline objektů (AI Profil) na segmenty ──
/**
 * Převede staré polyline objekty (AI Profil) na jednotlivé úsečky a oblouky.
 * Vrátí { objects, nextId }.
 */
export function expandPolylineObjects(objects, nextId) {
  let id = nextId;
  let changed = false;
  const expanded = [];
  for (const obj of objects) {
    if (obj.type !== 'polyline') { expanded.push(obj); continue; }
    changed = true;
    const n = obj.vertices.length;
    const segCount = obj.closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      const p1 = obj.vertices[i];
      const p2 = obj.vertices[(i + 1) % n];
      const b = (obj.bulges && obj.bulges[i]) || 0;
      const segId = id++;
      const base = { id: segId, layer: obj.layer ?? 0, ...(obj.isStock ? { isStock: true } : {}), ...(obj.color ? { color: obj.color } : {}) };
      if (b !== 0) {
        // bulgeToCcwArc: CW oblouk (záporný bulge) normalizovat prohozením
        // úhlů — samostatný 'arc' objekt se kreslí vždy CCW.
        const arc = bulgeToCcwArc(p1, p2, b);
        if (arc) expanded.push({ ...base, type: 'arc', cx: arc.cx, cy: arc.cy, r: arc.r, startAngle: arc.startAngle, endAngle: arc.endAngle, name: `Oblouk ${segId}` });
      } else {
        expanded.push({ ...base, type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, name: `Úsečka ${segId}` });
      }
    }
  }
  return { objects: changed ? expanded : objects, nextId: id };
}

export function exportFileName(ext, date = new Date()) {
  const ymd =
    date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const raw = (state.projectName || '').trim();
  const base = !raw || raw === 'Bez názvu' ? 'vykres' : raw;
  // Očisti pro bezpečný název souboru (zachovej diakritiku, nahraď mezery a zakázané znaky)
  const safe = base
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'vykres';
  return `SKICA_${safe}_${ymd}.${ext}`;
}
