// SKICA – render: Zrcadlo kolem osy jako geometrie + SNAP na podklad
// ─────────────────────────────────────────────────────────────────────
// Dokreslená spodní polovina (⇋ Zrcadlit kolem osy), hrany přes osu
// (mirrorEdges.js) a díry čel v nárysu (faceView/faceFrontView.js) nejsou
// objekty výkresu — SNAP je přesto má chytat (kótování, kreslení od díry;
// uživatel 20. 10. 2026). canvas.snapPt bere `refSnapObjects()` jako další
// objekty (body i hrany), jen bez vazby na zdroj. Modul nesmí importovat
// canvas.js (cyklus) — proto tu je i zrcadlení, které kreslí mirrorFills.js.
import { state } from '../state.js';
import { isFeatureObject } from '../faceView/faceLayer.js';
import { frontHoleSnapLines } from '../faceView/faceFrontView.js';
import { axisEdgeSnapLines } from './mirrorEdges.js';

/**
 * Vrátí mělkou kopii geometrického objektu zrcadlenou podle osy y=0
 * (cad_y -> -cad_y). Oblouky/bulge mění směr (ccw flip), úhly se negují.
 * Vrátí null pro typy, které nedává smysl zrcadlit (text, kóty, ...).
 */
export function mirrorObjectAcrossY(obj) {
  switch (obj.type) {
    case 'point':
      return { ...obj, y: -obj.y };
    case 'line':
    case 'constr':
      return { ...obj, y1: -obj.y1, y2: -obj.y2 };
    case 'circle':
      return { ...obj, cy: -obj.cy };
    case 'arc':
      return {
        ...obj,
        cy: -obj.cy,
        startAngle: -obj.startAngle,
        endAngle: -obj.endAngle,
        ccw: !(obj.ccw !== false),
      };
    case 'rect':
      return { ...obj, y1: -obj.y1, y2: -obj.y2 };
    case 'polyline':
      return {
        ...obj,
        vertices: obj.vertices.map(v => ({ x: v.x, y: -v.y })),
        bulges: (obj.bulges || []).map(b => -b),
      };
    default:
      return null;
  }
}

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
      const m = mirrorObjectAcrossY(o);
      if (m) out.push(m);
    });
    out.push(...axisEdgeSnapLines());
  }
  out.push(...frontHoleSnapLines());
  return out;
}
