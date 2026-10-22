// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Drážky na čele (ovál): data a geometrie               ║
// ╚══════════════════════════════════════════════════════════════╝
// Drážka na čele se kreslí do BOKORYSU nástrojem Drážka (uživatel
// 22. 10. 2026): klepnutí do bokorysu → okno Drážka do čela
// (calculators/faceSlot.js). Ve výkresu je to skutečný obrys drážky —
// uzavřená polylina „stadion" (dvě rovné strany + dva půlkruhové konce,
// bulge ±1) ve vrstvě čela, s hloubkou `holeDepth` jako díry (skrz / hloubka
// / do Z). Osa a šířka se čtou z GEOMETRIE (stadiumOf), takže drážka sedí
// i po přesunu, otočení nebo Kr.pole. Dřívější úsečka v čele (= drážka
// šířky frézy) platí dál.
// Do CAM jde jako frézování „Drážka" na čele s šířkou `slotW` — širší než
// fréza se frézuje víc průjezdy (cam/live/liveModel.millMoves).
// Modul je bez UI (čte ho přenos do CAM, cadForCam.js).
import { state } from '../state.js';
import { profileObjects } from './faceLayer.js';
import { materialSpan, stockSpan, resolveHoleDepth, throughOverrun, holeDepthLabel } from './faceDepth.js';

const r3 = v => +(+v).toFixed(3);
const TOL = 1e-3;

/**
 * Je polylina stadion (drážka)? → { x1, y1, x2, y2, w } (osa mezi středy
 * půlkruhů, šířka = průměr konců) v souřadnicích polyliny, jinak null.
 * Dva oblouky po 180° (|bulge| = 1) a mezi nimi rovné úseky.
 */
export function stadiumOf(o) {
  if (!o || o.type !== 'polyline' || !o.closed || !Array.isArray(o.vertices)) return null;
  const v = o.vertices, b = o.bulges || [], n = v.length;
  if (n < 2) return null;
  const arcs = [];
  for (let i = 0; i < n; i++) {
    const bi = +b[i] || 0;
    if (Math.abs(bi) < 1e-6) continue;
    if (Math.abs(Math.abs(bi) - 1) > 1e-3) return null;   // jiný oblouk než půlkruh
    const p = v[i], q = v[(i + 1) % n];
    arcs.push({ cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2, r: Math.hypot(q.x - p.x, q.y - p.y) / 2 });
  }
  if (arcs.length !== 2 || Math.abs(arcs[0].r - arcs[1].r) > 1e-3 || !(arcs[0].r > 0)) return null;
  return { x1: arcs[0].cx, y1: arcs[0].cy, x2: arcs[1].cx, y2: arcs[1].cy, w: 2 * arcs[0].r };
}

/**
 * Polylina drážky do čela (svět): střed (cx, cy) vůči středu čela, vnější
 * délka `len`, šířka `w`, osa pod úhlem `angle` [°] od X bokorysu.
 */
export function faceSlotPolyline(face, { cx, cy, len, w, angle, depth = null }) {
  const O = face.origin, r = w / 2, h = Math.max(0, len / 2 - r);
  const t = angle * Math.PI / 180, ux = Math.cos(t), uy = Math.sin(t);
  const x1 = O.x + cx - ux * h, y1 = O.y + cy - uy * h, x2 = O.x + cx + ux * h, y2 = O.y + cy + uy * h;
  const rx = uy, ry = -ux;   // vpravo od osy
  // Proti směru hodin: vpravo od začátku → vpravo od konce → půlkruh → vlevo → půlkruh.
  const vertices = [
    { x: x1 + rx * r, y: y1 + ry * r }, { x: x2 + rx * r, y: y2 + ry * r },
    { x: x2 - rx * r, y: y2 - ry * r }, { x: x1 - rx * r, y: y1 - ry * r },
  ];
  const fmt = v => String(r3(v));
  return {
    type: 'polyline', layer: face.id, closed: true, vertices, bulges: [0, 1, 0, 1],
    dashed: false, skipIntersections: true,
    name: `Drážka ${fmt(len)}×${fmt(w)}${depth ? ' ' + holeDepthLabel(depth) : ''}`,
    ...(depth ? { holeDepth: { mode: depth.mode, value: depth.value ?? null, ...(depth.stock ? { stock: true } : {}) } } : {}),
  };
}

/** Vzdálenost bodu (0, 0) od úsečky — nejmenší poloměr osy drážky. */
function segDist(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / L2)) : 0;
  return Math.hypot(x1 + t * dx, y1 + t * dy);
}

/**
 * Drážka (stadion vůči středu čela) pro CAM jako úsečka osy se šířkou
 * `slotW`, hloubkou `depth` (z `holeDepth`, jako díra: skrz = materiál pod
 * celou stopou + přesah) a `zTop` (první materiál, stojí-li čelo ve vzduchu).
 * @returns úsečka { type: 'line', x1…y2, slotW, depth?, depthTag?, zTop?, throughStock? } nebo null
 */
export function faceSlotForCam(o, faceZ, side, objects = profileObjects(), machineType = state.machineType) {
  const s = stadiumOf(o);
  if (!s) return null;
  const r = s.w / 2;
  const lo = Math.max(0, segDist(s.x1, s.y1, s.x2, s.y2) - r);
  const hi = Math.max(Math.hypot(s.x1, s.y1), Math.hypot(s.x2, s.y2)) + r;
  const spec = o.holeDepth || null;
  const withStock = !!(spec && spec.mode === 'through' && spec.stock);
  const span = withStock ? stockSpan(objects, machineType, faceZ, side, lo, hi)
    : materialSpan(objects, machineType, faceZ, side, lo, Math.max(hi, lo + 0.01));
  const start = span ? span.start : 0;
  const dir = side === 'left' ? 1 : -1;
  const out = {
    type: 'line', x1: r3(s.x1), y1: r3(s.y1), x2: r3(s.x2), y2: r3(s.y2), slotW: r3(s.w), name: o.name,
    ...(Math.abs(start) > TOL ? { zTop: r3(faceZ + dir * start) } : {}), ...(withStock ? { throughStock: true } : {}),
  };
  if (!spec) return out;
  let depth = null;
  if (spec.mode === 'through') {
    if (span) depth = r3(span.end - start + (spec.value != null && spec.value >= 0 ? spec.value : throughOverrun(s.w)));
  } else {
    const res = resolveHoleDepth(spec, { faceZ, side, d: s.w, lo, hi, objects, machineType });
    if (res.depth > start) depth = r3(res.depth - Math.max(0, start));
  }
  return depth > 0 ? { ...out, depth, depthTag: holeDepthLabel(spec) } : out;
}
