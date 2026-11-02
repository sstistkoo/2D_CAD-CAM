// SKICA – Přepnutí Soustruh ↔ Karusel: prohození os výkresu
//
// Soustruh: wx = Z (axiální), wy = X (poloměr). Karusel: wx = X (poloměr),
// wy = Z. Po přepnutí stroje proto výkres zrcadlíme přes úhlopříčku
// (wx, wy) → (wy, wx), aby se souřadnice dílu X/Z NEZMĚNILY — jinak by se
// prohodily jen popisky os a výkres by stál na cizích souřadnicích.
//
// Zrcadlení obrací orientaci: oblouky prohodí začátek/konec, bulge mění
// znaménko, vazby vodorovná ↔ svislá. Kresby čel (bokorys) se nezrcadlí —
// jsou to pohledy na čelo, přestaví je faceView.applyLayout podle stroje.
// Stejně se převede i historie ↩/↪, aby návrat nevracel nezrcadlený výkres.

import { state } from './state.js';
import { isFaceLayerId } from './faceView/faceLayer.js';

const HALF_PI = Math.PI / 2;
// Úhel směru po zrcadlení přes y = x
const swapAngle = a => HALF_PI - a;
const swapHV = t => (t === 'horizontal' ? 'vertical' : t === 'vertical' ? 'horizontal' : t);

function swapXY(o, kx, ky) {
  if (o[kx] == null || o[ky] == null) return;
  const t = o[kx]; o[kx] = o[ky]; o[ky] = t;
}

/**
 * Zrcadlí objekt přes úhlopříčku wx ↔ wy (na místě; id a jméno zůstávají).
 * @param {import('./types.js').DrawObject} o
 */
export function swapObjectAxes(o) {
  switch (o.type) {
    case 'point':
      swapXY(o, 'x', 'y');
      break;
    case 'line':
    case 'constr':
      swapXY(o, 'x1', 'y1');
      swapXY(o, 'x2', 'y2');
      swapXY(o, 'dimSrcX1', 'dimSrcY1');
      swapXY(o, 'dimSrcX2', 'dimSrcY2');
      swapXY(o, 'dimCenterX', 'dimCenterY');
      swapXY(o, 'dimLeadDX', 'dimLeadDY');
      if (o.dimMidAng != null) o.dimMidAng = swapAngle(o.dimMidAng);
      if (o.dimAnchorAngle != null) o.dimAnchorAngle = swapAngle(o.dimAnchorAngle);
      if (o.dimMode === 'horizontal' || o.dimMode === 'vertical') o.dimMode = swapHV(o.dimMode);
      // Šikmá kóta: normála (−sin, cos) po zrcadlení míří na druhou stranu
      else if (o.dimType === 'linear' && o.dimOffset != null) o.dimOffset = -o.dimOffset;
      if (o.constraint) o.constraint = swapHV(o.constraint);
      break;
    case 'circle':
      swapXY(o, 'cx', 'cy');
      break;
    case 'arc':
      swapXY(o, 'cx', 'cy');
      // Jako flipObject: konce zůstanou konci, zrcadlo obrací směr
      // (`ccw` neuvedeno = proti směru hodin → `=== false`, ne `!ccw`)
      o.startAngle = swapAngle(o.startAngle);
      o.endAngle = swapAngle(o.endAngle);
      o.ccw = o.ccw === false;
      break;
    case 'rect':
      // Střed se prohodí, půl-rozměry taky (S·R(A) = R(−A)·S)
      swapXY(o, 'x1', 'y1');
      swapXY(o, 'x2', 'y2');
      if (o.rotation) o.rotation = -o.rotation;
      break;
    case 'polyline':
      (o.vertices || []).forEach(v => swapXY(v, 'x', 'y'));
      if (Array.isArray(o.bulges)) o.bulges = o.bulges.map(b => -b);
      if (o.segConstraints) {
        for (const k of Object.keys(o.segConstraints)) o.segConstraints[k] = swapHV(o.segConstraints[k]);
      }
      break;
    case 'text':
      // Jen poloha — text zůstane čitelný ve stejném natočení
      swapXY(o, 'x', 'y');
      break;
    case 'fill':
      (o.loops || []).forEach(loop => loop.forEach(v => swapXY(v, 'x', 'y')));
      break;
  }
  return o;
}

/** Zrcadlí seznam objektů výkresu (kresby čel vynechá). */
export function swapObjectsAxes(objects) {
  (objects || []).forEach(o => { if (o && !isFaceLayerId(o.layer)) swapObjectAxes(o); });
}

function swapSnapshot(raw) {
  try {
    const snap = JSON.parse(raw);
    const objs = Array.isArray(snap) ? snap : snap.objects;
    swapObjectsAxes(objs);
    if (!Array.isArray(snap) && Array.isArray(snap.anchors)) snap.anchors.forEach(a => swapXY(a, 'x', 'y'));
    return JSON.stringify(snap);
  } catch { return raw; }
}

/**
 * Prohodí osy celého výkresu (objekty, kotvy, nulový bod, historie) a
 * pohled tak, aby díl zůstal na obrazovce. Volá se při změně typu stroje.
 * @param {{ panX?: number, panY?: number, zoom?: number, hSign?: number, vSign?: number,
 *   width?: number, height?: number }} [view] – rozměry plátna pro přepočet pohledu
 */
export function swapDrawingAxes(view = null) {
  swapObjectsAxes(state.objects);
  (state.anchors || []).forEach(a => swapXY(a, 'x', 'y'));
  if (state.incReference) swapXY(state.incReference, 'x', 'y');
  if (state.nullPointAngle) state.nullPointAngle = -state.nullPointAngle;
  if (state.lastClickPoint) swapXY(state.lastClickPoint, 'x', 'y');
  state.undoStack = (state.undoStack || []).map(swapSnapshot);
  state.redoStack = (state.redoStack || []).map(swapSnapshot);

  // Pohled: světový bod uprostřed plátna prohodit a vrátit doprostřed
  if (view && view.width && view.height) {
    const z = state.zoom || 1, hs = view.hSign || 1, vs = view.vSign || 1;
    const cx = view.width / 2, cy = view.height / 2;
    const wx = hs * (cx - state.panX) / z, wy = vs * (cy - state.panY) / z;
    state.panX = cx - hs * wy * z;
    state.panY = cy - vs * wx * z;
  }
}
