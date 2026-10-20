// Kresba čel z CAD (◎ bokorys, js/faceView/) → operace poháněných nástrojů.
//
// Každé čelo má rovinu Z a stranu (◀ zprava / ▶ zleva; šipka = směr pohledu)
// → op.zTop a op.faceDir.
//   kružnice → vrtání do čela; kružnice se STEJNÝM Ø (a hloubkou) na stejném
//              čele = jedna operace. Stejný poloměr středů + pravidelné rozestupy →
//              roztečná kružnice (Ø, počet, počáteční úhel), jinak seznam bodů.
//              Díra s `depth` (z ◎ Rozmístění děr: skrz / hloubka / do Z,
//              faceView/faceDepth.js) dá operaci tuhle hloubku.
//   úsečka   → drážka (osa drážky, šířka = Ø frézy).
//   ostatní (oblouky, kontury, obdélníky, texty, kóty) se přeskočí a řekne se kolik.
//
// Opakované načtení nahradí jen operace dřív načtené z CAD (`fromCad`);
// ručně přidané zůstanou. Hloubka, nástroj, otáčky… se převezmou z dřívější
// načtené operace se stejným Ø a čelem (vrtání) / pořadím na čele (drážka).
import { newLiveOp, normalizeLiveOp } from './liveModel.js';

const KEEP = ['name', 'depth', 'peck', 'dwell', 'safe', 'retract', 'toolD', 'stepDown',
  'toolName', 'toolNo', 'rpm', 'feed', 'kind', 'millType'];
const r3 = v => +(+v).toFixed(3);
const norm360 = a => ((a % 360) + 360) % 360;

/** Pravidelné rozmístění na jedné kružnici → { pcd, count, startAngle } | null. */
export function detectPcd(pts) {
  if (pts.length < 2) return null;
  const r = pts[0].r;
  if (r < 0.01 || pts.some(p => Math.abs(p.r - r) > 0.01)) return null;
  const a = pts.map(p => p.a).sort((x, y) => x - y);
  const step = 360 / a.length;
  if (a.some((v, i) => Math.abs(v - (a[0] + i * step)) > 0.05)) return null;
  return { pcd: r3(2 * r), count: a.length, startAngle: r3(a[0]) };
}

/**
 * @param input čela z faceDrawingsLocal() [{ z, side, objects }] — nebo starší
 *   tvar: rovnou pole objektů jednoho čela (Z = geo.faceZ, zprava)
 * @param geo { faceZ, outerD } z livePartGeometry (výchozí Z čela)
 * @param prevOps dosavadní operace (S.params.liveOps, normalizované)
 * @returns {{ ops, holes, slots, skipped }}
 */
export function liveOpsFromCad(input, geo, prevOps) {
  const faces = Array.isArray(input) && input.length && input[0] && Array.isArray(input[0].objects)
    ? input
    : [{ z: geo ? geo.faceZ : 0, side: 'right', objects: input || [] }];
  const prev = (prevOps || []).filter(o => o.fromCad);
  const manual = (prevOps || []).filter(o => !o.fromCad);
  const ops = [...manual];
  let n = ops.length, holes = 0, slots = 0, skipped = 0;
  const many = faces.length > 1;
  const carry = (op, old) => { if (old) KEEP.forEach(k => { if (old[k] !== undefined) op[k] = old[k]; }); };

  faces.forEach(face => {
    const zTop = r3(face.z);
    const faceDir = face.side === 'left' ? -1 : 1;
    const tag = many ? ` · Z${zTop} ${faceDir < 0 ? '▶' : '◀'}` : '';
    const sameFace = o => Math.abs((o.zTop ?? 0) - zTop) < 1e-3 && (o.faceDir === -1 ? -1 : 1) === faceDir;
    const byD = new Map();   // klíč Ø|hloubka → { d, depth, tag, pts }
    const lines = [];
    (face.objects || []).forEach(o => {
      if (!o || o.isDimension || o.isCoordLabel || o.isMeasureTemp) return;
      if (o.type === 'circle' && o.r > 0) {
        const d = r3(2 * o.r);
        const r = Math.hypot(o.cx, o.cy);
        const a = r < 1e-6 ? 0 : norm360(Math.atan2(o.cy, o.cx) * 180 / Math.PI);
        const depth = o.depth > 0 ? r3(o.depth) : null;
        const key = depth == null ? `${d}` : `${d}|${depth}|${o.depthTag || ''}`;
        if (!byD.has(key)) byD.set(key, { d, depth, tag: depth == null ? '' : (o.depthTag || ''), pts: [] });
        byD.get(key).pts.push({ a: r3(a), r: r3(r) });
      } else if (o.type === 'line') lines.push(o);
      else if (o.type !== 'point' && o.type !== 'constr') skipped++;
    });
    [...byD.values()].sort((x, y) => x.d - y.d || (x.depth ?? -1) - (y.depth ?? -1)).forEach(g => {
      const d = g.d;
      const pts = g.pts.sort((p, q) => p.r - q.r || p.a - q.a);
      holes += pts.length;
      const op = newLiveOp('drill', geo, ++n);
      op.name = `Díry Ø${d}${g.tag ? ' ' + g.tag : ''}${tag}`;
      const isHole = o => o.side !== 'radial' && !(o.kind === 'mill' && o.millType === 'slot')
        && Math.abs(o.holeD - d) < 1e-3 && sameFace(o);
      // Se zadanou hloubkou přednost dřívější operaci se stejnou hloubkou.
      carry(op, (g.depth != null && prev.find(o => isHole(o) && Math.abs(o.depth - g.depth) < 1e-3)) || prev.find(isHole));
      Object.assign(op, { holeD: d, side: 'face', zTop, faceDir, fromCad: true });
      if (g.depth != null) op.depth = g.depth;
      const pcd = detectPcd(pts);
      if (pcd) Object.assign(op, { pattern: 'pcd' }, pcd);
      else { op.pattern = 'points'; op.points = pts.map(p => `${p.a}; ${p.r}`).join('\n'); }
      // Převzatá kapsa zůstane kapsou (Ø kapsy = Ø kružnice); vrták = Ø díry.
      if (op.kind !== 'mill') op.kind = 'drill';
      ops.push(normalizeLiveOp(op));
    });
    const prevSlots = prev.filter(o => o.kind === 'mill' && o.millType === 'slot' && sameFace(o));
    lines.forEach((l, i) => {
      slots++;
      const op = newLiveOp('mill', geo, ++n);
      op.name = `Drážka ${i + 1}${tag}`;
      carry(op, prevSlots[i]);
      Object.assign(op, {
        kind: 'mill', millType: 'slot', zTop, faceDir, fromCad: true,
        slot: { x1: r3(l.x1), y1: r3(l.y1), x2: r3(l.x2), y2: r3(l.y2) },
      });
      ops.push(normalizeLiveOp(op));
    });
  });
  return { ops, holes, slots, skipped };
}
