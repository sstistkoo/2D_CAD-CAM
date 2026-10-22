// SKICA – render: Hrany přes osu při ⇋ Zrcadlit kolem osy (celý pohled)
// ─────────────────────────────────────────────────────────────────────
// Zrcadlení dokreslí spodní polovinu nárysu; aby byl pohled celý jako na
// technologickém výkrese (hotová kontura i polotovar kolem dokola), spojí se
// přes osu i hrany a přechody (uživatel 20. 10. 2026). Hrana = kružnice v místě
// zlomu profilu (osazení, sražení, zápich); v pohledu je to úsečka přes celý
// průměr. Podle ISO 128:
//   viditelná hrana (na vnějším povrchu)  → čarou jako obrys,
//   zakrytá (uvnitř — dno vývrtu apod.)   → tenká čárkovaná,
//   tečný přechod (konec zaoblení)        → nekreslí se.
// Díl a polotovar zvlášť (každý svou čarou, polotovar díl nezakrývá). Kreslí
// se jen chybějící kus — svislé čáry profilu a jejich zrcadlo už nakreslené jsou.
// Jen soustruh: zrcadlí se kolem y = 0 (osa vřetena).
import { state } from '../state.js';
import { LINE_WIDTH } from '../constants.js';
import { objDash, objWidthMul } from '../lineStyles.js';
import { bulgeToArc, getRectCorners } from '../utils.js';
import { resolveObjectColor } from './common.js';
import { isFeatureObject } from '../faceView/faceLayer.js';
import { materialAt, objectsHash } from '../faceView/faceReference.js';

const TYPES = new Set(['line', 'arc', 'rect', 'polyline']);
const TAN_TOL = Math.sin(2 * Math.PI / 180);   // tečný přechod = do 2°
const R_TOL = 0.1;                             // [mm] hrana na vnějším povrchu
const SIDE = 0.05;                             // [mm] vzorek materiálu vedle hrany
const HIDDEN_DASH = [5, 3];

/** Úseky prvku: [{ a, b, ta, tb, straight }] — konce a tečny v nich. */
function pieces(o) {
  const seg = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (L < 1e-9) return [];
    const t = { x: dx / L, y: dy / L };
    return [{ a, b, ta: t, tb: t, straight: true }];
  };
  const arc = (cx, cy, r, a0, a1) => ({
    a: { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) }, ta: { x: -Math.sin(a0), y: Math.cos(a0) },
    b: { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) }, tb: { x: -Math.sin(a1), y: Math.cos(a1) },
    straight: false,
  });
  if (o.type === 'line') return seg({ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 });
  if (o.type === 'arc') {
    if (!(o.r > 0) || !Number.isFinite(o.startAngle) || !Number.isFinite(o.endAngle)) return [];
    return [arc(o.cx, o.cy, o.r, o.startAngle, o.endAngle)];
  }
  if (o.type === 'rect') { const c = getRectCorners(o); return c.flatMap((p, i) => seg(p, c[(i + 1) % 4])); }
  if (o.type === 'polyline' && Array.isArray(o.vertices)) {
    const v = o.vertices, n = v.length, segs = o.closed ? n : n - 1, out = [];
    for (let i = 0; i < segs; i++) {
      const p1 = v[i], p2 = v[(i + 1) % n], bu = (o.bulges && o.bulges[i]) || 0;
      const ar = bu ? bulgeToArc(p1, p2, bu) : null;
      if (ar) out.push({ ...arc(ar.cx, ar.cy, ar.r, ar.startAngle, ar.endAngle), a: p1, b: p2 });
      else out.push(...seg(p1, p2));
    }
    return out;
  }
  return [];
}

const key3 = v => Math.round(v * 1000);
const maxEnd = iv => (iv.length ? Math.max(...iv.map(i => i[1])) : 0);

/** [lo, hi] bez pokrytých intervalů → zbylé kusy (delší než 0,01 mm). */
function subtract(lo, hi, cover) {
  let parts = [[lo, hi]];
  cover.forEach(([a, b]) => {
    parts = parts.flatMap(([p, q]) => {
      if (b <= p + 1e-6 || a >= q - 1e-6) return [[p, q]];
      return [[p, Math.min(q, a)], [Math.max(p, b), q]].filter(([x, y]) => y - x > 0.01);
    });
  });
  return parts;
}

/**
 * Hrany přes osu pro jednu skupinu objektů (díl NEBO polotovar):
 * [{ z, a, b, hidden, o }] = úsečka x = z od y = a do y = b (soustruh).
 */
export function axisEdgeLines(objects) {
  const groups = new Map();   // konec → [{ t, o }]
  const verticals = [];       // svislé úsečky { z, a, b }
  objects.forEach(o => pieces(o).forEach(pc => {
    [[pc.a, pc.ta], [pc.b, pc.tb]].forEach(([p, t]) => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const k = `${key3(p.x)},${key3(p.y)}`;
      if (!groups.has(k)) groups.set(k, { p, list: [] });
      groups.get(k).list.push({ t, o });
    });
    if (pc.straight && Math.abs(pc.a.x - pc.b.x) < 1e-6) {
      verticals.push({ z: pc.a.x, a: Math.min(pc.a.y, pc.b.y), b: Math.max(pc.a.y, pc.b.y) });
    }
  }));
  // Materiál skupiny (polotovar jako „díl", ať ho materialAt nevyřadí).
  const mat = objects.map(o => (o.isStock ? { ...o, isStock: false } : o));
  const outerMemo = new Map();   // víc rohů ve stejném Z (osazení) → materiál jednou
  const outerAt = z => {
    const k = key3(z);
    if (!outerMemo.has(k)) outerMemo.set(k, Math.max(maxEnd(materialAt(mat, 'soustruh', z - SIDE)), maxEnd(materialAt(mat, 'soustruh', z + SIDE))));
    return outerMemo.get(k);
  };
  const byZ = new Map();      // z → { z, vis: {r, o}, hid: {r, o} }
  groups.forEach(({ p, list }) => {
    const r = Math.abs(p.y);
    if (r < 0.05) return;
    const corner = list.length === 1 || list.some((e, i) => list.some((f, j) => j > i
      && Math.abs(e.t.x * f.t.y - e.t.y * f.t.x) > TAN_TOL));
    if (!corner) return;
    const zk = key3(p.x);
    if (!byZ.has(zk)) byZ.set(zk, { z: p.x, vis: null, hid: null });
    const slot = byZ.get(zk);
    const outer = outerAt(p.x);
    const which = !(outer > 0) || r >= outer - R_TOL ? 'vis' : 'hid';
    if (!slot[which] || r > slot[which].r) slot[which] = { r, o: list[0].o };
  });
  const out = [];
  byZ.forEach(({ z, vis, hid }) => {
    const e = vis || hid;
    const cover = [];
    verticals.forEach(v => { if (Math.abs(v.z - z) < 1e-3) cover.push([v.a, v.b], [-v.b, -v.a]); });
    subtract(-e.r, e.r, cover).forEach(([a, b]) => out.push({ z, a, b, hidden: !vis, o: e.o }));
  });
  return out;
}

let _cache = null;

/** Hrany přes osu z posledního vykreslení jako úsečky pro SNAP (mirrorSnap.js). */
export function axisEdgeSnapLines() {
  if (!_cache || state.machineType === 'karusel') return [];
  return _cache.lines.map(({ z, a, b, o }) => ({ type: 'line', layer: o.layer, x1: z, y1: a, x2: z, y2: b }));
}

/**
 * Nakreslí hrany přes osu (volá render/mirrorFills.renderMirrorPreview).
 * @param g CanvasRenderingContext2D
 * @param w2s worldToScreen → [sx, sy]
 */
export function drawAxisEdges(g, w2s) {
  if (state.machineType === 'karusel') return;
  const off = new Set((state.layers || []).filter(l => !l.visible).map(l => l.id));
  const objs = state.objects.filter(o => o && TYPES.has(o.type) && !o.isDimension && !o.isCoordLabel
    && !o.isCamPathNote && !off.has(o.layer) && !isFeatureObject(o));
  const key = objectsHash(objs);
  if (!_cache || _cache.key !== key) {
    _cache = { key, lines: [...axisEdgeLines(objs.filter(o => !o.isStock)), ...axisEdgeLines(objs.filter(o => o.isStock))] };
  }
  g.save();
  _cache.lines.forEach(({ z, a, b, hidden, o }) => {
    const layer = (state.layers || []).find(l => l.id === o.layer);
    g.strokeStyle = resolveObjectColor(o);
    g.lineWidth = hidden ? 1 : (layer?.lineWidth ?? LINE_WIDTH) * objWidthMul(o);
    g.setLineDash(hidden ? HIDDEN_DASH : objDash(o));
    const p = w2s(z, a), q = w2s(z, b);
    g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
  });
  g.restore();
}
