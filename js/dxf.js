// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – DXF Import / Export                                ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from './constants.js';
import { getRectCorners, bulgeToArc } from './utils.js';

const MAX_ENTITIES = 10000;
const DEFAULT_COLOR = COLORS.primary;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// DXF ACI (AutoCAD Color Index) → CSS barvy
const ACI_COLORS = {
  1: '#ff0000',   // červená
  2: '#ffff00',   // žlutá
  3: '#00ff00',   // zelená
  4: '#00ffff',   // cyan
  5: '#0000ff',   // modrá
  6: '#ff00ff',   // magenta
  7: '#ffffff',   // bílá
  8: '#808080',   // tmavě šedá
  9: '#c0c0c0',   // světle šedá
  10: '#ff0000',  // red
  11: '#ff7f7f',  // light red
  20: '#ff7f00',  // orange
  30: '#ff7f00',  // orange
  40: '#ffbf00',  // gold
  50: '#ffff00',  // yellow
  60: '#bfff00',  // yellow-green
  70: '#00ff00',  // green
  80: '#00ff7f',  // spring green
  90: '#00ffbf',  // aquamarine
  100: '#00ffff', // cyan
  110: '#007fff', // azure
  120: '#0000ff', // blue
  130: '#7f00ff', // violet
  140: '#bf00ff', // purple
  150: '#ff00ff', // magenta
  160: '#ff007f', // rose
  170: '#333333', // dark gray
  250: '#333333', // dark gray
  251: '#555555', // gray
  252: '#787878', // medium gray
  253: '#a0a0a0', // lighter gray
  254: '#c8c8c8', // lightest gray
  255: '#ffffff', // white (ByBlock)
};

// CSS barvy → ACI (pro export)
// Základní barvy mají prioritu (nižší ACI index)
const CSS_TO_ACI = {};
for (const [code, hex] of Object.entries(ACI_COLORS)) {
  const key = hex.toLowerCase();
  const aci = parseInt(code, 10);
  // Preferuj nižší ACI kódy (základní barvy 1-9)
  if (!CSS_TO_ACI[key] || aci < CSS_TO_ACI[key]) {
    CSS_TO_ACI[key] = aci;
  }
}

// Rozšířené mapování SKICA barev → ACI
CSS_TO_ACI['#89b4fa'] = 5;   // primary → modrá
CSS_TO_ACI['#6c7086'] = 8;   // construction → šedá
CSS_TO_ACI['#a6e3a1'] = 3;   // dimension → zelená
CSS_TO_ACI['#f5c2e7'] = 6;   // preview → magenta
CSS_TO_ACI['#fab387'] = 30;  // snapPoint → oranžová
CSS_TO_ACI['#cba6f7'] = 130; // snapEdge → fialová
CSS_TO_ACI['#f38ba8'] = 1;   // delete/červená
CSS_TO_ACI['#cdd6f4'] = 7;   // text → bílá

function safeFloat(val) {
  const n = parseFloat(val);
  return isFinite(n) ? n : 0;
}

function aciColor(code) {
  const c = parseInt(code, 10);
  return isNaN(c) ? DEFAULT_COLOR : (ACI_COLORS[c] || DEFAULT_COLOR);
}

function colorToAci(cssColor) {
  if (!cssColor) return 7;
  return CSS_TO_ACI[cssColor.toLowerCase()] || 7;
}

// Rozděl DXF text na páry (group code, value)
function parsePairs(text) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  let i = 0;
  while (i + 1 < lines.length) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1].trim();
    i += 2;
    if (isNaN(code)) continue;
    pairs.push({ code, value });
  }
  return pairs;
}

// Najdi sekci v DXF párech podle jména (např. 'ENTITIES', 'BLOCKS')
function findSection(pairs, sectionName) {
  let start = -1;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 2 && pairs[i].value === sectionName && start < 0) {
      start = i + 1;
      continue;
    }
    if (start >= 0 && pairs[i].code === 0 && pairs[i].value === 'ENDSEC') {
      return { start, end: i };
    }
  }
  return null;
}

function findEntitiesSection(pairs) {
  return findSection(pairs, 'ENTITIES');
}

// ── Tessellace ELLIPSE → polyline (nebo arc/circle pro ratio≈1) ──
function tessellateEllipse(data, color) {
  const cx = safeFloat(data.find(p => p.code === 10)?.value);
  const cy = safeFloat(data.find(p => p.code === 20)?.value);
  // Koncový bod hlavní osy (relativně k centru)
  const mx = safeFloat(data.find(p => p.code === 11)?.value);
  const my = safeFloat(data.find(p => p.code === 21)?.value);
  const ratio = safeFloat(data.find(p => p.code === 40)?.value) || 1;
  const startParam = safeFloat(data.find(p => p.code === 41)?.value);
  const endParamRaw = data.find(p => p.code === 42)?.value;
  const endParam = endParamRaw !== undefined ? safeFloat(endParamRaw) : (2 * Math.PI);

  const a = Math.sqrt(mx * mx + my * my); // hlavní poloosa
  const b = a * ratio; // vedlejší poloosa
  const rot = Math.atan2(my, mx); // rotace elipsy
  if (a <= 0) return [];

  // Pokud je ratio ≈ 1, je to kružnice/oblouk (nativní SKICA entity).
  if (Math.abs(ratio - 1) < 1e-3) {
    const isFullCircle = Math.abs(endParam - startParam - 2 * Math.PI) < 1e-3;
    if (isFullCircle) return [{ type: 'circle', cx, cy, r: a, color }];
    return [{
      type: 'arc', cx, cy, r: a,
      startAngle: startParam + rot,
      endAngle: endParam + rot,
      color,
    }];
  }

  // Skutečná elipsa → polyline (chord aproximace, dle delší poloosy).
  // Adaptivní vzorkování: minimálně 64 segmentů, víc pro velké elipsy.
  let sweep = endParam - startParam;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const isClosed = Math.abs(sweep - 2 * Math.PI) < 1e-3;
  const segments = Math.max(32, Math.ceil(a * 4 * (sweep / (2 * Math.PI))));
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const vertices = [];
  // Pro uzavřenou elipsu nepřidávat duplicitní koncový bod
  const stepCount = isClosed ? segments : segments + 1;
  for (let i = 0; i < stepCount; i++) {
    const t = startParam + (i / segments) * sweep;
    const ct = Math.cos(t), st = Math.sin(t);
    vertices.push({
      x: cx + a * ct * cosR - b * st * sinR,
      y: cy + a * ct * sinR + b * st * cosR,
    });
  }
  return [{
    type: 'polyline',
    vertices,
    bulges: vertices.map(() => 0),
    closed: isClosed,
    color,
  }];
}

// ── Tessellace SPLINE → polyline (de Boor algoritmus) ──
//
// DXF SPLINE entity (skupinové kódy):
//   70 = flags (1=closed, 2=periodic, 4=rational, 8=planar, 16=linear)
//   71 = stupeň (degree, typicky 3)
//   72 = počet uzlů (knots)
//   73 = počet řídicích bodů (control points)
//   74 = počet fit bodů
//   40 = hodnoty uzlů (opakované, počet daný 72)
//   41 = váhy (opakované pro rational spline, počet daný 73)
//   10/20 = řídicí body (počet daný 73)
//   11/21 = fit body (počet daný 74)
function tessellateSpline(data, color) {
  let degree = 3;
  let flags = 0;
  const knots = [];
  const weights = [];
  const controlPts = [];
  const fitPts = [];

  for (const p of data) {
    switch (p.code) {
      case 70: flags = parseInt(p.value, 10) || 0; break;
      case 71: degree = parseInt(p.value, 10) || 3; break;
      case 40: knots.push(safeFloat(p.value)); break;
      case 41: weights.push(safeFloat(p.value)); break;
      case 10: controlPts.push({ x: safeFloat(p.value), y: 0 }); break;
      case 20:
        if (controlPts.length > 0) controlPts[controlPts.length - 1].y = safeFloat(p.value);
        break;
      case 11: fitPts.push({ x: safeFloat(p.value), y: 0 }); break;
      case 21:
        if (fitPts.length > 0) fitPts[fitPts.length - 1].y = safeFloat(p.value);
        break;
      default: break;
    }
  }

  // Fallback: žádné control body → pokud máme fit body, použij je jako lomenou
  // čáru (real spline z fit bodů by potřeboval interpolaci, což je nad rámec).
  if (controlPts.length === 0) {
    if (fitPts.length < 2) return [];
    return [{
      type: 'polyline',
      vertices: fitPts,
      bulges: fitPts.map(() => 0),
      closed: false,
      color,
    }];
  }

  const n = controlPts.length;
  if (n < 2) return [];

  // Sanity: degree nesmí být víc než n-1
  if (degree > n - 1) degree = n - 1;

  // Pokud chybí knots, vyrobíme uniformní clamped knot vector
  if (knots.length === 0) {
    for (let i = 0; i <= n + degree; i++) {
      knots.push(i < degree + 1 ? 0 : i > n - 1 ? n - degree : i - degree);
    }
  }

  // Rational spline: pokud máme weights, použij je; jinak všechny 1
  const w = (weights.length === n) ? weights : controlPts.map(() => 1);
  const closed = !!(flags & 1);

  // Vzorkování: ~16 bodů na řídicí bod, minimálně 64.
  const samples = Math.max(64, n * 16);
  const tMin = knots[degree];
  const tMax = knots[n];
  const span = tMax - tMin;
  if (!Number.isFinite(span) || span <= 0) {
    // Degenerovaný knot vector – fallback na lomenou čáru přes control points
    return [{
      type: 'polyline',
      vertices: controlPts,
      bulges: controlPts.map(() => 0),
      closed,
      color,
    }];
  }

  const vertices = [];
  for (let s = 0; s <= samples; s++) {
    const t = tMin + (s / samples) * span;
    const pt = deBoor(t, degree, knots, controlPts, w);
    if (pt) vertices.push(pt);
  }
  if (vertices.length < 2) return [];

  return [{
    type: 'polyline',
    vertices,
    bulges: vertices.map(() => 0),
    closed,
    color,
  }];
}

/**
 * de Boor algoritmus pro evaluaci (rational) B-spline v parametru t.
 * Vrací bod {x,y} nebo null pokud t je mimo rozsah knot vektoru.
 */
function deBoor(t, p, knots, ctrl, weights) {
  const n = ctrl.length;
  // Najdi knot interval k: knots[k] <= t < knots[k+1]
  let k = -1;
  for (let i = p; i < n; i++) {
    if (t >= knots[i] && t <= knots[i + 1]) { k = i; break; }
  }
  if (k < 0) {
    // Edge case: t = tMax → použij poslední validní interval
    if (Math.abs(t - knots[n]) < 1e-9) k = n - 1;
    else return null;
  }

  // Inicializace homogenních souřadnic [w·x, w·y, w]
  const dx = new Array(p + 1);
  const dy = new Array(p + 1);
  const dw = new Array(p + 1);
  for (let j = 0; j <= p; j++) {
    const idx = k - p + j;
    if (idx < 0 || idx >= n) return null;
    dw[j] = weights[idx];
    dx[j] = ctrl[idx].x * dw[j];
    dy[j] = ctrl[idx].y * dw[j];
  }

  // de Boor iterace
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = k - p + j;
      const denom = knots[i + p - r + 1] - knots[i];
      const alpha = denom === 0 ? 0 : (t - knots[i]) / denom;
      dx[j] = (1 - alpha) * dx[j - 1] + alpha * dx[j];
      dy[j] = (1 - alpha) * dy[j - 1] + alpha * dy[j];
      dw[j] = (1 - alpha) * dw[j - 1] + alpha * dw[j];
    }
  }

  if (dw[p] === 0) return null;
  return { x: dx[p] / dw[p], y: dy[p] / dw[p] };
}

// Parsuj jednu DXF entitu → SKICA objekt(y)
function parseEntity(type, data) {
  const colorPair = data.find(p => p.code === 62);
  const color = colorPair ? aciColor(colorPair.value) : DEFAULT_COLOR;

  switch (type) {
    case 'POINT': {
      const x = safeFloat(data.find(p => p.code === 10)?.value);
      const y = safeFloat(data.find(p => p.code === 20)?.value);
      return { type: 'point', x, y, color };
    }

    case 'LINE': {
      const x1 = safeFloat(data.find(p => p.code === 10)?.value);
      const y1 = safeFloat(data.find(p => p.code === 20)?.value);
      const x2 = safeFloat(data.find(p => p.code === 11)?.value);
      const y2 = safeFloat(data.find(p => p.code === 21)?.value);
      return { type: 'line', x1, y1, x2, y2, color };
    }

    case 'CIRCLE': {
      const cx = safeFloat(data.find(p => p.code === 10)?.value);
      const cy = safeFloat(data.find(p => p.code === 20)?.value);
      const r = safeFloat(data.find(p => p.code === 40)?.value);
      return { type: 'circle', cx, cy, r, color };
    }

    case 'ARC': {
      const cx = safeFloat(data.find(p => p.code === 10)?.value);
      const cy = safeFloat(data.find(p => p.code === 20)?.value);
      const r = safeFloat(data.find(p => p.code === 40)?.value);
      const startDeg = safeFloat(data.find(p => p.code === 50)?.value);
      const endDeg = safeFloat(data.find(p => p.code === 51)?.value);
      return {
        type: 'arc', cx, cy, r,
        startAngle: startDeg * DEG2RAD,
        endAngle: endDeg * DEG2RAD,
        color
      };
    }

    case 'LWPOLYLINE': {
      const flags = parseInt(data.find(p => p.code === 70)?.value || '0', 10);
      const closed = !!(flags & 1);

      // Sbírej vertex data do mezivrstvy – toleruje libovolné pořadí kódů
      // DXF spec: kód 10 zahajuje nový vertex, 20/42 patří k poslednímu
      const rawVerts = [];
      for (const p of data) {
        if (p.code === 10) {
          rawVerts.push({ x: safeFloat(p.value), y: 0, bulge: 0 });
        } else if (p.code === 20 && rawVerts.length > 0) {
          rawVerts[rawVerts.length - 1].y = safeFloat(p.value);
        } else if (p.code === 42 && rawVerts.length > 0) {
          rawVerts[rawVerts.length - 1].bulge = safeFloat(p.value);
        }
      }

      const vertices = rawVerts.map(v => ({ x: v.x, y: v.y }));
      const bulges = rawVerts.map(v => v.bulge);

      return { type: 'polyline', vertices, bulges, closed, color };
    }

    case 'TEXT':
    case 'MTEXT': {
      const x = safeFloat(data.find(p => p.code === 10)?.value);
      const y = safeFloat(data.find(p => p.code === 20)?.value);
      let text = data.find(p => p.code === 1)?.value || '';
      // MTEXT continuation text (kód 3) – připoj další části textu
      if (type === 'MTEXT') {
        for (const p of data) {
          if (p.code === 3) text = p.value + text;
        }
      }
      const height = safeFloat(data.find(p => p.code === 40)?.value) || 14;
      const rotation = safeFloat(data.find(p => p.code === 50)?.value) || 0;
      // MTEXT může mít formátovací kódy – odstraň je
      if (type === 'MTEXT') {
        text = text.replace(/\\[pPfFcChHwWaAqQtT][^;]*;/g, '')
                   .replace(/\{|\}/g, '')
                   .replace(/\\P/g, '\n');
      }
      if (!text.trim()) return null;
      return {
        type: 'text', x, y,
        text: text.trim(),
        fontSize: Math.round(height),
        rotation: rotation * DEG2RAD,
        color
      };
    }

    case 'ELLIPSE':
      return { _multi: tessellateEllipse(data, color) };

    case 'SPLINE':
      return { _multi: tessellateSpline(data, color) };

    case '3DFACE':
      return parse3DFace(data, color);

    default:
      return null;
  }
}

/**
 * Parsuje DXF 3DFACE (3 nebo 4 rohy, Z se ignoruje pro 2D projekci).
 * Rohy: 10/20 (1), 11/21 (2), 12/22 (3), 13/23 (4).
 * Pokud roh 4 == roh 3, je to trojúhelník.
 * Vrátí uzavřenou polylinu (3 nebo 4 vrcholy) v rovině XY.
 */
function parse3DFace(data, color) {
  const corners = [];
  const codes = [[10, 20], [11, 21], [12, 22], [13, 23]];
  for (const [cx, cy] of codes) {
    const xRaw = data.find(p => p.code === cx);
    const yRaw = data.find(p => p.code === cy);
    if (xRaw === undefined || yRaw === undefined) continue;
    corners.push({ x: safeFloat(xRaw.value), y: safeFloat(yRaw.value) });
  }
  if (corners.length < 3) return null;
  // Pokud 4. roh == 3. roh → trojúhelník
  const isTriangle = corners.length >= 4 &&
    Math.abs(corners[3].x - corners[2].x) < 1e-9 &&
    Math.abs(corners[3].y - corners[2].y) < 1e-9;
  const vertices = isTriangle ? corners.slice(0, 3) : corners;
  return {
    type: 'polyline',
    vertices,
    bulges: vertices.map(() => 0),
    closed: true,
    color,
  };
}

/**
 * Parsuje BLOCKS sekci DXF souboru a vrátí mapu jméno → seznam entit.
 * Každý blok začíná `0 BLOCK`, končí `0 ENDBLK`, mezi tím obsahuje
 * sub-entity ve stejném formátu jako ENTITIES sekce.
 *
 * @param {Array<{code:number, value:string}>} pairs
 * @returns {Object<string, object[]>}  mapa jméno bloku → SKICA entity
 */
function parseBlocks(pairs) {
  const blocks = {};
  const section = findSection(pairs, 'BLOCKS');
  if (!section) return blocks;

  let i = section.start;
  while (i < section.end) {
    if (pairs[i].code !== 0) { i++; continue; }
    if (pairs[i].value !== 'BLOCK') { i++; continue; }
    i++;

    // Sbírej hlavičku bloku (jméno, base point) až do prvního dalšího kódu 0
    const headerData = [];
    while (i < section.end && pairs[i].code !== 0) {
      headerData.push(pairs[i]);
      i++;
    }
    const name = headerData.find(p => p.code === 2)?.value || '';
    const baseX = safeFloat(headerData.find(p => p.code === 10)?.value);
    const baseY = safeFloat(headerData.find(p => p.code === 20)?.value);

    // Sbírej entity bloku až do ENDBLK
    const subEntities = [];
    while (i < section.end) {
      if (pairs[i].code !== 0) { i++; continue; }
      const t = pairs[i].value;
      i++;
      if (t === 'ENDBLK') {
        while (i < section.end && pairs[i].code !== 0) i++;
        break;
      }
      const entityData = [];
      while (i < section.end && pairs[i].code !== 0) {
        entityData.push(pairs[i]);
        i++;
      }
      // Použij stejný parseEntity – v bloku NEpodporujeme nested INSERT
      // (rekurze by mohla být nekonečná u špatně sestaveného DXF).
      const obj = parseEntity(t, entityData);
      if (obj) {
        if (obj._multi) subEntities.push(...obj._multi);
        else subEntities.push(obj);
      }
    }
    if (name) blocks[name] = { entities: subEntities, baseX, baseY };
  }
  return blocks;
}

/**
 * Aplikuje translaci, rotaci a měřítko na bod (relativně k 0,0 bloku).
 * Pořadí transformací: scale → rotate → translate (= matrix M = T·R·S).
 */
function transformPoint(x, y, t) {
  const sx = x * t.sx;
  const sy = y * t.sy;
  const rx = sx * t.cos - sy * t.sin;
  const ry = sx * t.sin + sy * t.cos;
  return { x: rx + t.tx, y: ry + t.ty };
}

/**
 * Transformuje SKICA entitu (deep copy) přes danou transformaci.
 * Podporované typy: point, line, circle, arc, polyline, text, rect.
 * Pro circle/arc se škálování projeví v poloměru (uniformní – průměr
 * z absolutních hodnot sx, sy; v praxi vždy sx===sy u většiny DXF).
 */
function transformEntity(obj, t) {
  const pt = (x, y) => transformPoint(x, y, t);
  switch (obj.type) {
    case 'point': {
      const p = pt(obj.x, obj.y);
      return { ...obj, x: p.x, y: p.y };
    }
    case 'line':
    case 'constr': {
      const a = pt(obj.x1, obj.y1);
      const b = pt(obj.x2, obj.y2);
      return { ...obj, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case 'circle': {
      const c = pt(obj.cx, obj.cy);
      const r = obj.r * (Math.abs(t.sx) + Math.abs(t.sy)) / 2;
      return { ...obj, cx: c.x, cy: c.y, r };
    }
    case 'arc': {
      const c = pt(obj.cx, obj.cy);
      const r = obj.r * (Math.abs(t.sx) + Math.abs(t.sy)) / 2;
      const rot = Math.atan2(t.sin, t.cos);
      return {
        ...obj, cx: c.x, cy: c.y, r,
        startAngle: obj.startAngle + rot,
        endAngle: obj.endAngle + rot,
      };
    }
    case 'rect': {
      const a = pt(obj.x1, obj.y1);
      const b = pt(obj.x2, obj.y2);
      return { ...obj, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case 'polyline': {
      const vertices = (obj.vertices || []).map(v => pt(v.x, v.y));
      return { ...obj, vertices, bulges: (obj.bulges || []).slice() };
    }
    case 'text': {
      const p = pt(obj.x, obj.y);
      const rot = Math.atan2(t.sin, t.cos);
      return {
        ...obj, x: p.x, y: p.y,
        rotation: (obj.rotation || 0) + rot,
        fontSize: (obj.fontSize || 14) * Math.abs(t.sy),
      };
    }
    default:
      return null;
  }
}

/**
 * Expanduje DXF INSERT entitu: pro každý "blokový" výskyt vytvoří
 * transformované kopie všech entit bloku. Podporuje arrays (rows×cols).
 *
 * @param {object[]} data        skupinové kódy entity INSERT
 * @param {Object} blocks        mapa bloků
 * @returns {object[]}           pole SKICA entit (může být prázdné)
 */
function expandInsert(data, blocks) {
  const name = data.find(p => p.code === 2)?.value;
  if (!name || !blocks[name]) return [];
  const block = blocks[name];
  const ix = safeFloat(data.find(p => p.code === 10)?.value);
  const iy = safeFloat(data.find(p => p.code === 20)?.value);
  const sxRaw = data.find(p => p.code === 41);
  const syRaw = data.find(p => p.code === 42);
  const sx = sxRaw !== undefined ? safeFloat(sxRaw.value) : 1;
  const sy = syRaw !== undefined ? safeFloat(syRaw.value) : 1;
  const rotDeg = safeFloat(data.find(p => p.code === 50)?.value);
  const rotRad = rotDeg * DEG2RAD;
  const cols = parseInt(data.find(p => p.code === 70)?.value || '1', 10);
  const rows = parseInt(data.find(p => p.code === 71)?.value || '1', 10);
  const colSpacing = safeFloat(data.find(p => p.code === 44)?.value);
  const rowSpacing = safeFloat(data.find(p => p.code === 45)?.value);

  // Base point bloku se odečítá při klonování – DXF konvence
  const out = [];
  for (let r = 0; r < Math.max(1, rows); r++) {
    for (let c = 0; c < Math.max(1, cols); c++) {
      const t = {
        sx, sy,
        cos: Math.cos(rotRad),
        sin: Math.sin(rotRad),
        tx: ix + c * colSpacing,
        ty: iy + r * rowSpacing,
      };
      for (const e of block.entities) {
        // Posun o -base, pak transformace
        const shifted = transformEntity(e, { sx: 1, sy: 1, cos: 1, sin: 0, tx: -block.baseX, ty: -block.baseY });
        if (!shifted) continue;
        const final = transformEntity(shifted, t);
        if (final) out.push(final);
      }
    }
  }
  return out;
}

/**
 * Parsuje DXF text a vrací entity.
 * Podporuje:
 *   POINT, LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE (heavy),
 *   TEXT, MTEXT,
 *   ELLIPSE (ratio=1 → circle/arc, jinak polyline aproximace),
 *   SPLINE (de Boor evaluace B-spline / NURBS, fallback na fit body),
 *   3DFACE (3/4 rohy → uzavřená polylina v rovině XY),
 *   INSERT (expanze BLOCK definice s translací/rotací/měřítkem; arrays).
 * @param {string} text
 * @returns {import('./types.js').DXFParseResult}
 */
export function parseDXF(text) {
  const entities = [];
  const errors = [];

  const pairs = parsePairs(text);
  // BLOCKS sekce se parsuje předem, aby INSERT entity uměly expandovat
  const blocks = parseBlocks(pairs);
  const section = findEntitiesSection(pairs);

  if (!section) {
    errors.push('Sekce ENTITIES nenalezena v DXF souboru');
    return { entities, errors };
  }

  // ── První průchod: seskup heavy POLYLINE (POLYLINE/VERTEX/SEQEND) ──
  const rawEntities = [];
  let i = section.start;
  while (i < section.end) {
    if (pairs[i].code !== 0) { i++; continue; }

    const entityType = pairs[i].value;
    i++;

    const entityData = [];
    while (i < section.end && pairs[i].code !== 0) {
      entityData.push(pairs[i]);
      i++;
    }

    if (entityType === 'POLYLINE') {
      // Heavy POLYLINE: sbírej VERTEX entity až do SEQEND
      const colorPair = entityData.find(p => p.code === 62);
      const color = colorPair ? aciColor(colorPair.value) : DEFAULT_COLOR;
      const flags = parseInt(entityData.find(p => p.code === 70)?.value || '0', 10);
      const closed = !!(flags & 1);
      const vertices = [];
      const bulges = [];

      while (i < section.end) {
        if (pairs[i].code !== 0) { i++; continue; }
        const vType = pairs[i].value;
        i++;
        if (vType === 'SEQEND') {
          // Přeskoč data SEQEND
          while (i < section.end && pairs[i].code !== 0) i++;
          break;
        }
        if (vType === 'VERTEX') {
          let vx = 0, vy = 0, vb = 0;
          while (i < section.end && pairs[i].code !== 0) {
            if (pairs[i].code === 10) vx = safeFloat(pairs[i].value);
            else if (pairs[i].code === 20) vy = safeFloat(pairs[i].value);
            else if (pairs[i].code === 42) vb = safeFloat(pairs[i].value);
            i++;
          }
          vertices.push({ x: vx, y: vy });
          bulges.push(vb);
        } else {
          // Neznámá sub-entita v POLYLINE
          while (i < section.end && pairs[i].code !== 0) i++;
        }
      }

      if (vertices.length >= 2) {
        rawEntities.push({ entityType: 'LWPOLYLINE', entityData: [] });
        entities.push({ type: 'polyline', vertices, bulges, closed, color });
        if (entities.length >= MAX_ENTITIES) {
          errors.push(`Dosažen limit ${MAX_ENTITIES} entit, zbytek ignorován`);
          break;
        }
      }
      continue;
    }

    rawEntities.push({ entityType, entityData });
  }

  // ── Druhý průchod: parsuj normální entity ──
  for (const { entityType, entityData } of rawEntities) {
    if (entityType === 'LWPOLYLINE' && entityData.length === 0) continue; // heavy polyline already processed

    // INSERT: expanduj blok do entit s transformací
    if (entityType === 'INSERT') {
      const expanded = expandInsert(entityData, blocks);
      if (expanded.length === 0) {
        const name = entityData.find(p => p.code === 2)?.value || '?';
        errors.push(`INSERT '${name}': blok není definovaný nebo prázdný`);
        continue;
      }
      for (const e of expanded) {
        entities.push(e);
        if (entities.length >= MAX_ENTITIES) break;
      }
      if (entities.length >= MAX_ENTITIES) {
        errors.push(`Dosažen limit ${MAX_ENTITIES} entit, zbytek ignorován`);
        break;
      }
      continue;
    }

    const obj = parseEntity(entityType, entityData);
    if (obj) {
      if (obj._multi) {
        // Tessellované entity (ELLIPSE, SPLINE) → více objektů
        for (const sub of obj._multi) {
          entities.push(sub);
          if (entities.length >= MAX_ENTITIES) break;
        }
        if (obj._multi.length === 0) {
          errors.push(`${entityType}: nedostatek dat pro tessellaci`);
        }
      } else {
        entities.push(obj);
      }
    } else {
      errors.push(`Neznámá/nepodporovaná entita: ${entityType}`);
    }

    if (entities.length >= MAX_ENTITIES) {
      errors.push(`Dosažen limit ${MAX_ENTITIES} entit, zbytek ignorován`);
      break;
    }
  }

  return { entities, errors };
}

// ═══════════════════════════════════════════════════════════════
// ── DXF EXPORT ──
// ═══════════════════════════════════════════════════════════════

// Group code → řádek bez paddingu (kompatibilní se všemi parsery)
function gc(code, value) {
  return code + '\n' + value;
}

function entityLines(obj) {
  const out = [];
  const layerName = obj.layerName || '0';
  const fmt = n => n.toFixed(6);

  switch (obj.type) {
    case 'point':
      out.push(gc(0, 'POINT'), gc(8, layerName));
      out.push(gc(10, fmt(obj.x)), gc(20, fmt(obj.y)), gc(30, '0'));
      break;

    case 'line':
    case 'constr':
      if (obj.isDimension) break;
      out.push(gc(0, 'LINE'), gc(8, layerName));
      out.push(gc(10, fmt(obj.x1)), gc(20, fmt(obj.y1)), gc(30, '0'));
      out.push(gc(11, fmt(obj.x2)), gc(21, fmt(obj.y2)), gc(31, '0'));
      break;

    case 'circle':
      out.push(gc(0, 'CIRCLE'), gc(8, layerName));
      out.push(gc(10, fmt(obj.cx)), gc(20, fmt(obj.cy)), gc(30, '0'));
      out.push(gc(40, fmt(obj.r)));
      break;

    case 'arc': {
      out.push(gc(0, 'ARC'), gc(8, layerName));
      out.push(gc(10, fmt(obj.cx)), gc(20, fmt(obj.cy)), gc(30, '0'));
      out.push(gc(40, fmt(obj.r)));
      // DXF ARC is always CCW; for CW arcs (ccw===false) swap start/end
      const dxfStart = obj.ccw === false ? obj.endAngle : obj.startAngle;
      const dxfEnd = obj.ccw === false ? obj.startAngle : obj.endAngle;
      out.push(gc(50, (dxfStart * RAD2DEG).toFixed(6)));
      out.push(gc(51, (dxfEnd * RAD2DEG).toFixed(6)));
      break;
    }

    case 'rect': {
      const rc = getRectCorners(obj);
      out.push(gc(0, 'LWPOLYLINE'), gc(8, layerName));
      out.push(gc(90, 4), gc(70, 1), gc(43, '0.0'));
      for (const c of rc) {
        out.push(gc(10, fmt(c.x)), gc(20, fmt(c.y)));
      }
      break;
    }

    case 'polyline':
      out.push(gc(0, 'LWPOLYLINE'), gc(8, layerName));
      out.push(gc(90, obj.vertices.length));
      out.push(gc(70, obj.closed ? 1 : 0));
      out.push(gc(43, '0.0'));
      for (let i = 0; i < obj.vertices.length; i++) {
        out.push(gc(10, fmt(obj.vertices[i].x)));
        out.push(gc(20, fmt(obj.vertices[i].y)));
        if (obj.bulges && obj.bulges[i] && obj.bulges[i] !== 0) {
          out.push(gc(42, fmt(obj.bulges[i])));
        }
      }
      break;

    case 'text':
      out.push(gc(0, 'TEXT'), gc(8, layerName));
      out.push(gc(10, fmt(obj.x)), gc(20, fmt(obj.y)), gc(30, '0'));
      out.push(gc(40, (obj.fontSize || 14).toFixed(6)));
      out.push(gc(1, obj.text || ''));
      if (obj.rotation) out.push(gc(50, (obj.rotation * RAD2DEG).toFixed(6)));
      break;

    default:
      return '';
  }
  return out.join('\n');
}

/**
 * Exportuje SKICA objekty do DXF textu (minimální AC1009 formát).
 * Stejný styl jako DXF-JSON konvertor – funguje ve Fusion 360.
 * @param {object[]} objects - pole SKICA objektů
 * @param {object[]} [layers] - volitelné pole vrstev [{id, name}]
 * @returns {string} DXF text
 */
export function exportDXF(objects, layers) {
  const out = [];

  // Připrav mapování layer ID → jméno pro export
  const layerMap = {};
  if (layers && layers.length > 0) {
    for (const l of layers) {
      layerMap[l.id] = l.name || `Vrstva_${l.id}`;
    }
  }

  // Přiřaď layerName ke každému objektu
  const enriched = objects.map(obj => ({
    ...obj,
    layerName: layerMap[obj.layer] || '0',
  }));

  // ── HEADER (AC1009 – minimální) ──
  out.push(gc(0, 'SECTION'), gc(2, 'HEADER'));
  out.push(gc(9, '$ACADVER'), gc(1, 'AC1009'));
  out.push(gc(9, '$INSUNITS'), gc(70, 4));  // 4 = milimetry
  out.push(gc(0, 'ENDSEC'));

  // ── ENTITIES ──
  out.push(gc(0, 'SECTION'), gc(2, 'ENTITIES'));
  for (const obj of enriched) {
    const str = entityLines(obj);
    if (str.length > 0) out.push(str);
  }
  out.push(gc(0, 'ENDSEC'));

  out.push(gc(0, 'EOF'));

  return out.join('\n') + '\n';
}

// ═══════════════════════════════════════════════════════════════
// ── DXF / SVG EXPORT přes Maker.js (robustní, Fusion 360) ──
// ═══════════════════════════════════════════════════════════════
//
// POZNÁMKA k ose Y:
//   Uložené souřadnice objektů v SKICA už používají konvenci Y-nahoru
//   (worldToScreen v canvas.js osu Y obrací jen pro vykreslení na plátno).
//   DXF i Maker.js pracují rovněž s Y-nahoru a `toSVG` si osu Y obrátí sám,
//   proto souřadnice předáváme 1:1 BEZ negace – jinak by se exporty svisle
//   zrcadlově převrátily oproti tomu, co je na plátně.

/** Vrátí globální instanci Maker.js (z lokálního bundlu) nebo null. */
export function getMaker() {
  if (typeof window === 'undefined') return null;
  if (window.makerjs) return window.makerjs;
  try {
    if (typeof window.require === 'function') {
      const m = window.require('makerjs');
      if (m) { window.makerjs = m; return m; }
    }
  } catch (e) { /* Maker.js není dostupný */ }
  return window.makerjs || null;
}

/** Očistí název vrstvy pro DXF (zakázané znaky → '_'). */
function dxfLayerName(name) {
  const s = String(name == null ? '0' : name)
    .replace(/[<>/\\":;?*|=`,]+/g, '_')
    .replace(/\s+/g, '_');
  return s || '0';
}

/** Sestaví Maker.js path pro oblouk se správným směrem (CCW). */
function makerArc(mk, center, r, startAngle, endAngle, ccw) {
  const s = startAngle * RAD2DEG;
  const e = endAngle * RAD2DEG;
  // Maker.js Arc vede VŽDY CCW od start→end. Pro CW oblouk (ccw===false)
  // prohodíme úhly – stejně jako manuální DXF export (kódy 50/51).
  return ccw === false
    ? new mk.paths.Arc(center, r, e, s)
    : new mk.paths.Arc(center, r, s, e);
}

/** Převede polylajnu (s bulge) na Maker.js model složený z úseček a oblouků. */
function polylineToMaker(obj, mk) {
  const verts = obj.vertices || [];
  if (verts.length < 2) return null;
  const n = verts.length;
  const segCount = obj.closed ? n : n - 1;
  const paths = {};
  for (let i = 0; i < segCount; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % n];
    const b = (obj.bulges && obj.bulges[i]) || 0;
    if (b === 0) {
      paths['s' + i] = new mk.paths.Line([p1.x, p1.y], [p2.x, p2.y]);
    } else {
      const arc = bulgeToArc(p1, p2, b);
      paths['s' + i] = arc
        ? makerArc(mk, [arc.cx, arc.cy], arc.r, arc.startAngle, arc.endAngle, arc.ccw)
        : new mk.paths.Line([p1.x, p1.y], [p2.x, p2.y]);
    }
  }
  return { paths };
}

/** Převede jeden SKICA objekt na Maker.js model/path. Bez negace Y. */
export function objToMakerModel(obj, mk) {
  switch (obj.type) {
    case 'point': {
      // Maker.js nemá POINT entitu → malý křížek (dvě úsečky)
      const s = 1.5;
      return { paths: {
        h: new mk.paths.Line([obj.x - s, obj.y], [obj.x + s, obj.y]),
        v: new mk.paths.Line([obj.x, obj.y - s], [obj.x, obj.y + s]),
      } };
    }
    case 'line':
    case 'constr':
      return { paths: { p: new mk.paths.Line([obj.x1, obj.y1], [obj.x2, obj.y2]) } };
    case 'circle':
      return { paths: { p: new mk.paths.Circle([obj.cx, obj.cy], obj.r) } };
    case 'arc':
      return { paths: { p: makerArc(mk, [obj.cx, obj.cy], obj.r, obj.startAngle, obj.endAngle, obj.ccw) } };
    case 'rect': {
      const rc = getRectCorners(obj);
      return new mk.models.ConnectTheDots(true, rc.map(c => [c.x, c.y]));
    }
    case 'polyline':
      return polylineToMaker(obj, mk);
    case 'text': {
      if (!obj.text) return null;
      const rot = obj.rotation || 0; // rotace 1:1 (bez negace, data jsou Y-nahoru)

      // Vektorový text přes makerjs.models.Text + opentype font, je-li
      // načtený. Jinak fallback na Maker.js caption (původní chování).
      const font = (typeof window !== 'undefined' && window.__skicaFont) || null;
      if (font && mk.models && mk.models.Text) {
        try {
          const fontSize = obj.size || obj.height || 10;
          const textModel = new mk.models.Text(font, String(obj.text), fontSize, false, false);
          // Maker.js Text vykreslí baseline na y=0, počátek na x=0.
          // Posun na (obj.x, obj.y) + volitelná rotace okolo (obj.x, obj.y).
          mk.model.move(textModel, [obj.x, obj.y]);
          if (rot) mk.model.rotate(textModel, rot * 180 / Math.PI, [obj.x, obj.y]);
          return textModel;
        } catch (err) {
          console.warn('Vektorový text selhal, fallback na caption:', err && err.message);
        }
      }

      const anchor = new mk.paths.Line(
        [obj.x, obj.y],
        [obj.x + Math.cos(rot), obj.y + Math.sin(rot)],
      );
      return { paths: {}, caption: { text: String(obj.text), anchor } };
    }
    default:
      return null;
  }
}

/**
 * Sestaví Maker.js model ze SKICA objektů.
 * @param {object[]} objects
 * @param {object} [opts]
 * @param {'dxf'|'svg'} [opts.target] - cílový formát (ovlivňuje pojmenování vrstev)
 * @param {(obj:object)=>string} [opts.getColor] - vrátí CSS barvu objektu (pro SVG)
 * @param {(obj:object)=>string} [opts.getLayer] - vrátí název vrstvy (pro DXF)
 * @returns {{mk:object, model:object, layerOptions:object}|null}
 */
export function buildMakerModel(objects, opts = {}) {
  const mk = getMaker();
  if (!mk) return null;

  const target = opts.target || 'dxf';
  const getColor = opts.getColor || (() => '#000000');
  const getLayer = opts.getLayer || (() => '0');

  const model = { units: mk.unitType.Millimeter, models: {} };
  const layerOptions = {};
  let count = 0;

  for (const obj of objects) {
    if (!obj || obj.isDimension || obj.isCoordLabel) continue;
    let sub;
    try {
      sub = objToMakerModel(obj, mk);
    } catch (e) {
      sub = null;
    }
    if (!sub) continue;

    // Vrstvy: pro SVG použijeme barvu (přesné barvy přes layerOptions),
    // pro DXF smysluplný název vrstvy.
    if (target === 'svg') {
      const color = getColor(obj);
      sub.layer = color;
      layerOptions[color] = { stroke: color };
    } else {
      sub.layer = dxfLayerName(getLayer(obj));
    }

    model.models['e' + (count++)] = sub;
  }

  if (count === 0) return null;
  return { mk, model, layerOptions };
}

/**
 * Exportuje SKICA objekty do DXF přes Maker.js (validní formát pro Fusion 360).
 * Y se NEneguje (data jsou už Y-nahoru). Vrací null, pokud Maker.js není dostupný.
 * @param {object[]} objects
 * @param {object[]} [layers] - [{id, name}]
 * @returns {string|null}
 */
export function exportDXFMaker(objects, layers) {
  const layerMap = {};
  if (layers && layers.length > 0) {
    for (const l of layers) layerMap[l.id] = l.name || ('Vrstva_' + l.id);
  }
  const built = buildMakerModel(objects, {
    target: 'dxf',
    getLayer: (o) => layerMap[o.layer] || '0',
  });
  if (!built) return null;
  return built.mk.exporter.toDXF(built.model, { units: 'mm' });
}
