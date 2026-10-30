// Kresba čel z CAD (◎ bokorys, js/faceView/) → operace poháněných nástrojů.
//
// Každé čelo má rovinu Z a stranu (◀ zprava / ▶ zleva; šipka = směr pohledu)
// → op.zTop a op.faceDir.
//   kružnice → vrtání do čela; kružnice se STEJNÝM Ø (a hloubkou) na stejném
//              čele = jedna operace. Stejný poloměr středů + pravidelné rozestupy →
//              roztečná kružnice (Ø, počet, počáteční úhel), jinak seznam bodů.
//              Díra s `depth` (z ◎ Rozmístění děr: skrz / hloubka / do Z,
//              faceView/faceDepth.js) dá operaci tuhle hloubku; se `zTop`
//              (první materiál za čelem, když čelo stojí ve vzduchu) začne
//              operace vrtat tam — díry s jiným zTop jsou zvlášť operace.
//   úsečka   → drážka (osa drážky, šířka = Ø frézy); se `zTop` (slotForCam,
//              čelo ve vzduchu) se frézuje od prvního materiálu.
//   ostatní (oblouky, kontury, obdélníky, texty, kóty) se přeskočí a řekne se kolik.
//
// Opakované načtení nahradí jen operace dřív načtené z CAD (`fromCad`);
// ručně přidané zůstanou. Hloubka, nástroj, otáčky… se převezmou z dřívější
// načtené operace se stejným Ø a čelem (vrtání) / pořadím na čele (drážka).
import { newLiveOp, normalizeLiveOp } from './liveModel.js';
import { withHoleExtras } from './liveHoleExtras.js';
import { threadByName } from '../../isoTaps.js';

// Závit díry z výkresu → { name, pitch, d, depth } (hloubka závitu z CAD).
const threadOf = t => {
  const m = t && threadByName(t.name);
  return m && t.depth > 0 ? { name: m.name, pitch: +t.pitch || m.pitch, d: m.d, depth: r3(t.depth) } : null;
};

const KEEP = ['name', 'depth', 'peck', 'peckDegr', 'dwell', 'safe', 'retract', 'toolD', 'stepDown',
  'toolName', 'toolNo', 'rpm', 'feed', 'kind', 'millType', 'enabled', 'autoTool', 'chipMode', 'chipBack'];
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
 * @param [opts] { spot, spotChamfer } = liveSettings — navrtání před vrtáním
 * @returns {{ ops, holes, slots, skipped }}
 */
export function liveOpsFromCad(input, geo, prevOps, opts = {}) {
  // Díry v plášti (faceView/shellHoles.shellHolesForCam) jdou v poli jako
  // položka { kind: 'shell', holes } vedle čel.
  const isEntry = f => f && (Array.isArray(f.objects) || f.kind === 'shell');
  const list = Array.isArray(input) && input.length && input.every(isEntry)
    ? input
    : [{ z: geo ? geo.faceZ : 0, side: 'right', objects: input || [] }];
  const faces = list.filter(f => f.kind !== 'shell');
  const shells = list.filter(f => f.kind === 'shell');
  // Odvozené operace (navrtání, závit) vznikají znovu na konci (withHoleExtras).
  const prev = (prevOps || []).filter(o => o.fromCad && !o.role);
  const manual = (prevOps || []).filter(o => !o.fromCad);
  const ops = [...manual];
  let n = ops.length, holes = 0, slots = 0, skipped = 0;
  const many = faces.length > 1;
  // Název z výkresu (`autoName`) se generuje znovu — jinak by po změně hloubky
  // v CAD zůstal „Díry Ø8 skrz" u díry hl. 12; přejmenovaná operace si název
  // nechá. Starší uložení bez autoName: výchozí tvar názvu = z výkresu.
  const carry = (op, old) => {
    const name = op.name;
    op.autoName = name;
    if (!old) return;
    KEEP.forEach(k => { if (old[k] !== undefined) op[k] = old[k]; });
    const auto = old.autoName != null ? old.name === old.autoName : /^(Díry Ø|Drážka \d)/.test(old.name || '');
    if (auto) op.name = name;
  };

  faces.forEach(face => {
    const zTop = r3(face.z);
    const faceDir = face.side === 'left' ? -1 : 1;
    const tag = many ? ` · Z${zTop} ${faceDir < 0 ? '▶' : '◀'}` : '';
    const byD = new Map();   // klíč Ø|hloubka|zTop → { d, depth, tag, zTop, pts }
    const lines = [];
    (face.objects || []).forEach(o => {
      if (!o || o.isDimension || o.isCoordLabel || o.isMeasureTemp) return;
      if (o.type === 'circle' && o.r > 0) {
        const d = r3(2 * o.r);
        const r = Math.hypot(o.cx, o.cy);
        const a = r < 1e-6 ? 0 : norm360(Math.atan2(o.cy, o.cx) * 180 / Math.PI);
        const depth = o.depth > 0 ? r3(o.depth) : null;
        const zt = Number.isFinite(o.zTop) ? r3(o.zTop) : zTop;
        const th = depth == null ? null : threadOf(o.holeThread);
        const key = (depth == null ? `${d}` : `${d}|${depth}|${o.depthTag || ''}`) + (zt === zTop ? '' : `|z${zt}`) + (o.throughStock ? '|s' : '')
          + (th ? `|${th.name}|${th.depth}` : '');
        if (!byD.has(key)) byD.set(key, { d, depth, tag: depth == null ? '' : (o.depthTag || ''), zTop: zt, stock: !!o.throughStock, thread: th, pts: [] });
        byD.get(key).pts.push({ a: r3(a), r: r3(r) });
      } else if (o.type === 'line') lines.push(o);
      else if (o.type !== 'point' && o.type !== 'constr') skipped++;
    });
    [...byD.values()].sort((x, y) => x.d - y.d || (x.depth ?? -1) - (y.depth ?? -1) || (y.zTop - x.zTop) * faceDir).forEach(g => {
      const d = g.d;
      // Začátek vrtání jinde než rovina čela → Z do názvu (jako u více čel).
      const gTag = g.zTop === zTop ? tag : ` · Z${g.zTop} ${faceDir < 0 ? '▶' : '◀'}`;
      const sameZ = o => Math.abs((o.zTop ?? 0) - g.zTop) < 1e-3 && (o.faceDir === -1 ? -1 : 1) === faceDir;
      const pts = g.pts.sort((p, q) => p.r - q.r || p.a - q.a);
      holes += pts.length;
      const op = newLiveOp('drill', geo, ++n);
      op.name = `Díry Ø${d}${g.thread ? ' ' + g.thread.name : ''}${g.tag ? ' ' + g.tag : ''}${gTag}`;
      const isHole = o => o.side !== 'radial' && !(o.kind === 'mill' && o.millType === 'slot')
        && Math.abs(o.holeD - d) < 1e-3 && sameZ(o);
      // Se zadanou hloubkou přednost dřívější operaci se stejnou hloubkou.
      carry(op, (g.depth != null && prev.find(o => isHole(o) && Math.abs(o.depth - g.depth) < 1e-3)) || prev.find(isHole));
      // throughStock: díra skrz vč. polotovaru — kontrola i proti polotovaru (liveChecks).
      Object.assign(op, { holeD: d, side: 'face', zTop: g.zTop, faceDir, fromCad: true, ...(g.stock ? { throughStock: true } : {}) });
      if (g.depth != null) op.depth = g.depth;
      // Skrz: hloubka už nese přesah na špičku (faceDepth.throughOverrun) — liveModel.drillDepth.
      if (g.depth != null && /^skrz/.test(g.tag)) op.depthAtTip = true; else delete op.depthAtTip;
      if (g.thread) op.thread = g.thread; else delete op.thread;
      const pcd = detectPcd(pts);
      if (pcd) Object.assign(op, { pattern: 'pcd' }, pcd);
      else { op.pattern = 'points'; op.points = pts.map(p => `${p.a}; ${p.r}`).join('\n'); }
      // Převzatá kapsa zůstane kapsou (Ø kapsy = Ø kružnice); vrták = Ø díry.
      if (op.kind !== 'mill') op.kind = 'drill';
      ops.push(normalizeLiveOp(op));
    });
    // Drážka se `zTop` (první materiál za čelem ve vzduchu, faceDepth.slotForCam)
    // frézuje od něj; dřívější drážky čela = stejná strana a Z čela nebo
    // začátek některé z drážek.
    const zts = new Set(lines.map(l => (Number.isFinite(l.zTop) ? r3(l.zTop) : zTop)));
    const prevSlots = prev.filter(o => o.kind === 'mill' && o.millType === 'slot' && (o.faceDir === -1 ? -1 : 1) === faceDir
      && [...zts].some(z => Math.abs((o.zTop ?? 0) - z) < 1e-3));
    lines.forEach((l, i) => {
      slots++;
      const zt = Number.isFinite(l.zTop) ? r3(l.zTop) : zTop;
      const op = newLiveOp('mill', geo, ++n);
      // Drážka nakreslená obrysem (faceView/faceSlots.js) nese šířku a hloubku.
      const w = l.slotW > 0 ? r3(l.slotW) : null;
      op.name = `Drážka ${i + 1}${w ? ` š. ${w}${l.depthTag ? ' ' + l.depthTag : ''}` : ''}${zt === zTop ? tag : ` · Z${zt} ${faceDir < 0 ? '▶' : '◀'}`}`;
      carry(op, prevSlots[i]);
      Object.assign(op, {
        kind: 'mill', millType: 'slot', zTop: zt, faceDir, fromCad: true, slotW: w,
        slot: { x1: r3(l.x1), y1: r3(l.y1), x2: r3(l.x2), y2: r3(l.y2) },
        ...(l.throughStock ? { throughStock: true } : {}),
      });
      if (l.depth > 0) op.depth = l.depth;
      // Fréza nesmí být širší než drážka (převzatá / výchozí Ø10).
      if (w && op.toolD > w) { op.toolD = w; if (/^FREZA_D/.test(op.toolName || '')) op.toolName = `FREZA_D${w}`; }
      ops.push(normalizeLiveOp(op));
    });
  });
  shells.forEach(sh => {
    const r = radialOps(sh.holes || [], geo, prev, () => ++n, carry);
    ops.push(...r.ops);
    holes += r.holes;
    const k = keywayOps(sh.slots || [], geo, prev, () => ++n, carry);
    ops.push(...k.ops);
    slots += k.slots;
    skipped += (sh.errors || []).length;
  });
  return { ops: withHoleExtras(ops, opts, prevOps || []), holes, slots, skipped };
}

/**
 * Drážky pro pero v plášti → frézování „Drážka pro pero" (millType 'keyway',
 * side 'radial'). Skupina = stejná šířka, hloubka, Ø pláště a konce v Z;
 * úhly rovnoměrně → po obvodu (count, startAngle), jinak seznam úhlů. Fréza
 * Ø = šířka drážky (toolD se nepřebírá, nástroj a otáčky ano).
 */
function keywayOps(list, geo, prev, nextN, carry) {
  const byKey = new Map();
  list.forEach(s => {
    const key = `${s.w}|${s.depth}|${s.xTop}|${s.z1}|${s.z2}|${s.tag || ''}`;
    if (!byKey.has(key)) byKey.set(key, { ...s, as: [] });
    s.angles.forEach(a => byKey.get(key).as.push(r3(norm360(a))));
  });
  const ops = [];
  let count = 0;
  [...byKey.values()].sort((p, q) => q.z1 - p.z1 || p.w - q.w).forEach(g => {
    const as = [...new Set(g.as)].sort((p, q) => p - q);
    count += as.length;
    const op = newLiveOp('mill', geo, nextN());
    op.name = `Drážka pro pero ${g.w}×${r3(g.z1 - g.z2)}${g.tag ? ' ' + g.tag : ''} · Ø${g.xTop}`;
    const isKw = o => o.kind === 'mill' && o.millType === 'keyway' && Math.abs(o.toolD - g.w) < 1e-3;
    carry(op, prev.find(o => isKw(o) && Math.abs(o.kz1 - g.z1) < 1e-3 && Math.abs(o.kz2 - g.z2) < 1e-3) || prev.find(isKw));
    if (op.toolName === 'FREZA_D10' && g.w !== 10) op.toolName = `FREZA_D${g.w}`;
    Object.assign(op, {
      kind: 'mill', millType: 'keyway', side: 'radial', toolD: g.w, holeD: g.w, depth: g.depth,
      xTop: g.xTop, kz1: g.z1, kz2: g.z2, fromCad: true,
    });
    const pcd = detectPcd(as.map(a => ({ a, r: 1 })));
    if (pcd || as.length === 1) Object.assign(op, { pattern: 'pcd', count: as.length, startAngle: pcd ? pcd.startAngle : as[0] });
    else { op.pattern = 'points'; op.points = as.map(a => `${a}; ${r3((g.z1 + g.z2) / 2)}`).join('\n'); }
    ops.push(normalizeLiveOp(op));
  });
  return { ops, slots: count };
}

/**
 * Díry v plášti → operace vrtání do pláště (side 'radial'). Skupina = stejný
 * Ø, hloubka a Ø pláště; díry z jedné výšky Z s rovnoměrnými úhly → po
 * obvodu (count, startAngle, zPos), jinak seznam bodů „úhel; Z" (např.
 * Lin.pole podél osy). Nástroj, otáčky… z dřívější radiální operace se
 * stejným Ø.
 */
function radialOps(holes, geo, prev, nextN, carry) {
  const byKey = new Map();
  holes.forEach(h => {
    const th = threadOf(h.thread);
    const key = `${h.d}|${h.depth}|${h.xTop}|${h.tag || ''}${th ? `|${th.name}|${th.depth}` : ''}`;
    if (!byKey.has(key)) byKey.set(key, { d: h.d, depth: h.depth, xTop: h.xTop, tag: h.tag || '', thread: th, pts: [] });
    h.angles.forEach(a => byKey.get(key).pts.push({ a: r3(norm360(a)), z: r3(h.z) }));
  });
  const ops = [];
  let count = 0;
  [...byKey.values()].sort((p, q) => p.d - q.d || q.xTop - p.xTop).forEach(g => {
    const pts = g.pts.sort((p, q) => q.z - p.z || p.a - q.a);
    count += pts.length;
    const op = newLiveOp('drill', geo, nextN());
    op.name = `Díry Ø${g.d}${g.thread ? ' ' + g.thread.name : ''} do pláště${g.tag ? ' ' + g.tag : ''} · Ø${g.xTop}`;
    const isRad = o => o.side === 'radial' && o.kind === 'drill' && Math.abs(o.holeD - g.d) < 1e-3;
    carry(op, prev.find(o => isRad(o) && Math.abs(o.xTop - g.xTop) < 1e-3) || prev.find(isRad));
    Object.assign(op, { kind: 'drill', side: 'radial', holeD: g.d, depth: g.depth, xTop: g.xTop, fromCad: true });
    if (g.thread) op.thread = g.thread; else delete op.thread;
    // Skrz stěnu do vývrtu zadané ve výkresu = záměr (kontrola to nehlásí).
    // Hloubka skrz stěnu už nese přesah na špičku (shellHoles) — liveModel.drillDepth.
    if (g.tag === 'skrz') { op.throughWall = true; op.depthAtTip = true; }
    else { delete op.throughWall; delete op.depthAtTip; }
    const oneZ = pts.every(p => Math.abs(p.z - pts[0].z) < 1e-6);
    const pcd = oneZ ? detectPcd(pts.map(p => ({ a: p.a, r: 1 }))) : null;
    if (oneZ && (pcd || pts.length === 1)) {
      Object.assign(op, { pattern: 'pcd', count: pts.length, startAngle: pcd ? pcd.startAngle : pts[0].a, zPos: pts[0].z });
    } else {
      op.pattern = 'points';
      op.points = pts.map(p => `${p.a}; ${p.z}`).join('\n');
    }
    ops.push(normalizeLiveOp(op));
  });
  return { ops, holes: count };
}
