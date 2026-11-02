// SKICA – render: Zrcadlo kolem osy jako geometrie + SNAP na podklad
// ─────────────────────────────────────────────────────────────────────
// Dokreslená druhá polovina (⇋ Zrcadlit kolem osy; soustruh dolů, karusel doleva), hrany přes osu
// (mirrorEdges.js) a díry čel v nárysu (faceView/faceFrontView.js) nejsou
// objekty výkresu — SNAP je přesto má chytat (kótování, kreslení od díry;
// uživatel 20. 10. 2026). canvas.snapPt bere `refSnapObjects()` jako další
// objekty (body i hrany), jen bez vazby na zdroj. Modul nesmí importovat
// canvas.js (cyklus) — proto tu je i zrcadlení, které kreslí mirrorFills.js.
import { state } from '../state.js';
import { isFeatureObject } from '../faceView/faceLayer.js';
import { frontHoleSnapLines } from '../faceView/faceFrontView.js';
import { axisEdgeSnapLines } from './mirrorEdges.js';

/** Karusel: osa rotace je svislá (wx = 0), soustruh: vodorovná (wy = 0). */
export const mirrorAxisIsX = () => state.machineType === 'karusel';

/**
 * Vrátí mělkou kopii geometrického objektu zrcadlenou podle osy rotace:
 * soustruh kolem y = 0 (cad_y → −cad_y, dolů), karusel kolem x = 0
 * (cad_x → −cad_x, doleva). Oblouky/bulge mění směr (ccw flip), úhly se
 * zrcadlí (−a, resp. π − a), natočení obdélníku se neguje.
 * Vrátí null pro typy, které nedává smysl zrcadlit (text, kóty, ...).
 */
export function mirrorObjectAcrossAxis(obj, aboutX = mirrorAxisIsX()) {
  const fx = aboutX ? v => -v : v => v;          // zrcadlí se x (karusel)
  const fy = aboutX ? v => v : v => -v;          // zrcadlí se y (soustruh)
  const fa = aboutX ? a => Math.PI - a : a => -a;
  switch (obj.type) {
    case 'point':
      return { ...obj, x: fx(obj.x), y: fy(obj.y) };
    case 'line':
    case 'constr':
      return { ...obj, x1: fx(obj.x1), y1: fy(obj.y1), x2: fx(obj.x2), y2: fy(obj.y2) };
    case 'circle':
      return { ...obj, cx: fx(obj.cx), cy: fy(obj.cy) };
    case 'arc':
      return {
        ...obj,
        cx: fx(obj.cx),
        cy: fy(obj.cy),
        startAngle: fa(obj.startAngle),
        endAngle: fa(obj.endAngle),
        ccw: !(obj.ccw !== false),
      };
    case 'rect':
      return {
        ...obj, x1: fx(obj.x1), y1: fy(obj.y1), x2: fx(obj.x2), y2: fy(obj.y2),
        ...(obj.rotation ? { rotation: -obj.rotation } : {}),
      };
    case 'polyline':
      return {
        ...obj,
        vertices: obj.vertices.map(v => ({ x: fx(v.x), y: fy(v.y) })),
        bulges: (obj.bulges || []).map(b => -b),
      };
    default:
      return null;
  }
}

/** Zpětná kompatibilita: zrcadlení kolem y = 0 (soustruh). */
export const mirrorObjectAcrossY = obj => mirrorObjectAcrossAxis(obj, false);

/** Zrcadlí se (kreslí i chytá) jen geometrie kontury z viditelných vrstev. */
export function mirrorable(obj) {
  if (!obj || obj.isDimension || obj.isCoordLabel || obj.isCamPathNote || obj.type === 'text') return false;
  if (isFeatureObject(obj)) return false;   // kresba čela (bokorys) není kontura
  const layer = (state.layers || []).find(l => l.id === obj.layer);
  return !(layer && !layer.visible);
}

/**
 * Podklad pro SNAP (kopie, ne objekty výkresu): zrcadlo pod osu a hrany přes
 * osu (při ⇋ Zrcadlit kolem osy) + díry čel v nárysu.
 */
export function refSnapObjects() {
  const out = [];
  if (state.mirrorPreview) {
    state.objects.forEach(o => {
      if (!mirrorable(o)) return;
      const m = mirrorObjectAcrossAxis(o);
      if (m) out.push(m);
    });
    out.push(...axisEdgeSnapLines());
  }
  out.push(...frontHoleSnapLines());
  return out;
}
