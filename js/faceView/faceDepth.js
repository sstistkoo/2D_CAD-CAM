// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bokorys: hloubka děr v čele (skrz / hloubka / do Z)  ║
// ╚══════════════════════════════════════════════════════════════╝
// Díra z ◎ Rozmístění děr (facePattern.js) nese `holeDepth`:
//   { mode: 'through', value: přesah | null,   skrz materiál + přesah
//     stock?: true }                           (prázdný = hrot 0,3·Ø + 1 mm);
//                                              stock = materiál i polotovar
//                                              (vrtá se před soustružením)
//   { mode: 'depth',   value: hloubka }        od roviny čela
//   { mode: 'z',       value: Z konce díry }   absolutně v ose Z profilu
// Na číselnou hloubku se převádí až při 📥 Z CAD (faceDrawingsForCam) —
// z AKTUÁLNÍHO profilu a Z / strany čela, takže posun čela nebo změna
// profilu hloubku „skrz" a „do Z" přepočítá. Čelo zprava vrtá k −Z.
import { state } from '../state.js';
import { faceDrawingsLocal, profileObjects } from './faceLayer.js';
import { materialAt, shoulderZs } from './faceReference.js';
import { tapDepth } from '../calculators/isoTaps.js';

const TOL = 1e-3;
const SECT = 0.3;   // [mm] první vzorek za rovinou čela (jako řez v bokorysu)
const r3 = v => +(+v).toFixed(3);
const fmt = v => String(r3(v)).replace('.', ',');

/** Přesah vrtáku za materiál u díry skrz: hrot 118° ≈ 0,3·Ø + 1 mm. */
export const throughOverrun = d => r3(0.3 * d + 1);

/** Popisek hloubky do názvu díry / operace: „skrz", „hl. 12", „do Z-25". */
export function holeDepthLabel(spec) {
  if (!spec) return '';
  if (spec.mode === 'through') return spec.stock ? 'skrz vč. polotovaru' : 'skrz';
  if (spec.mode === 'depth') return `hl. ${fmt(spec.value)}`;
  if (spec.mode === 'z') return `do Z${fmt(spec.value)}`;
  return '';
}

/**
 * První souvislý materiál pod stopou díry [lo, hi] (poloměry) ve směru vrtání
 * od roviny čela: { start, end } [mm od čela]; start = 0 → materiál hned za
 * čelem. Před ním může být vzduch — čelo (posuvník = odkud se díváme) stojí
 * před přírubou; nárys pak díru kreslí tam, kde ji vrták udělá
 * (faceFrontView.js). Mezera a další stěna za prvním materiálem se nevrtá.
 * `withStock`: materiál = díl NEBO polotovar (sjednocení — vrtá se ještě
 * před soustružením).
 * @returns {{ start:number, end:number }|null} null = pod stopou nic
 */
export function materialSpan(objects, machineType, faceZ, side, lo, hi, withStock = false) {
  const dir = side === 'left' ? 1 : -1;
  const sets = [(objects || []).filter(o => !o.isStock)];
  const stock = withStock ? (objects || []).filter(o => o.isStock).map(o => ({ ...o, isStock: false })) : [];
  if (stock.length) sets.push(stock);
  const shs = sets.map(s => shoulderZs(s, machineType));
  const len = Math.max(...shs.map(sh => ((dir < 0 ? sh.min : sh.max) - faceZ) * dir));
  if (!(len > SECT)) return null;
  const zs = shs.flatMap(sh => sh.zs);
  const breaks = zs.map(z => (z - faceZ) * dir).filter(t => t > SECT && t < len);
  // V rovině osazení je průsečík dvojznačný → vzorkovat těsně vedle.
  const at = t => {
    let z = faceZ + dir * t;
    if (zs.some(b => Math.abs(b - z) < 1e-4)) z += 2e-4;
    return sets.some(s => materialAt(s, machineType, z).some(([a, b]) => a < hi - TOL && b > lo + TOL));
  };
  const ts = new Set([len]);
  const step = Math.max(0.05, Math.min(0.5, len / 200));
  for (let t = SECT + step; t < len; t += step) ts.add(t);
  breaks.forEach(t => { ts.add(t - 1e-3); ts.add(t + 1e-3); });
  const list = [...ts].sort((a, b) => a - b);
  // Přechod mezi a (stav `was`) a b (opačný) → první bod s opačným stavem.
  const cross = (a, b, was) => {
    for (let k = 0; k < 30 && b - a > 1e-4; k++) { const m = (a + b) / 2; if (at(m) === was) a = m; else b = m; }
    return b;
  };
  let start = at(SECT) ? 0 : null;
  let prev = SECT;
  for (const t of list) {
    const m = at(t);
    if (start == null) { if (m) start = r3(cross(prev, t, false)); }
    else if (!m) return { start, end: r3(cross(prev, t, true)) };
    prev = t;
  }
  return start == null ? null : { start, end: r3(len) };   // materiál až do konce dílu
}

/**
 * Jako materialSpan(…, withStock), jen u díry skrz VČ. POLOTOVARU (vrtá se
 * před soustružením) i s polotovarem PŘED rovinou čela: stojí-li čelo
 * v polotovaru (např. na konci hotové kontury), vrták začne na povrchu
 * polotovaru na straně nástroje — `start` je pak záporný (před čelem).
 * Dřív začínal na konci hotové kontury uvnitř polotovaru (uživatel
 * 21. 10. 2026).
 */
export function stockSpan(objects, machineType, faceZ, side, lo, hi) {
  const span = materialSpan(objects, machineType, faceZ, side, lo, hi, true);
  const stock = (objects || []).filter(o => o.isStock).map(o => ({ ...o, isStock: false }));
  if (!stock.length) return span;
  const dir = side === 'left' ? 1 : -1;
  const sh = shoulderZs(stock, machineType);
  const outer = dir < 0 ? sh.max : sh.min;   // konec polotovaru na straně nástroje
  if ((faceZ - outer) * dir <= TOL) return span;   // polotovar před čelo nesahá
  const s = materialSpan(objects, machineType, outer, side, lo, hi, true);
  if (!s) return span;
  const a = r3((outer - faceZ) * dir + s.start), b = r3((outer - faceZ) * dir + s.end);
  // Materiál začíná před rovinou čela a vede přes ni → vrtat od jeho začátku.
  return a <= TOL && b > TOL ? { start: a, end: b } : span;
}

/**
 * Tloušťka materiálu pod stopou díry [lo, hi] (poloměry) od roviny čela ve
 * směru vrtání až po místo, kde stopa z materiálu VYJDE (první souvislý
 * materiál; mezera a další stěna za ní se už nevrtá).
 * @returns {number|null} null = hned za čelem pod stopou není materiál
 */
export function materialDepth(objects, machineType, faceZ, side, lo, hi, withStock = false) {
  const s = materialSpan(objects, machineType, faceZ, side, lo, hi, withStock);
  return s && s.start === 0 ? s.end : null;
}

/**
 * Číselná hloubka díry (od roviny čela, kladná ve směru vrtání).
 * @param p { faceZ, side, d: Ø díry, lo, hi: stopa (poloměry), objects, machineType }
 * @returns {{ depth:number, thick?:number } | { error:string }}
 */
export function resolveHoleDepth(spec, p) {
  if (!spec) return { error: 'bez hloubky' };
  const dir = p.side === 'left' ? 1 : -1;
  if (spec.mode === 'depth') {
    return spec.value > 0 ? { depth: r3(spec.value) } : { error: 'hloubka musí být > 0' };
  }
  if (spec.mode === 'z') {
    if (!Number.isFinite(spec.value)) return { error: 'zadejte Z konce díry' };
    const depth = r3((spec.value - p.faceZ) * dir);
    return depth > 0 ? { depth }
      : { error: `Z${fmt(spec.value)} leží na straně nástroje — čelo Z${fmt(p.faceZ)} ${dir < 0 ? '◀ vrtá k −Z' : '▶ vrtá k +Z'}` };
  }
  if (spec.mode === 'through') {
    // Vč. polotovaru: tloušťka i s polotovarem před čelem (stockSpan).
    const ss = spec.stock ? stockSpan(p.objects, p.machineType, p.faceZ, p.side, p.lo, p.hi) : null;
    const thick = spec.stock ? (ss && ss.start <= 0 ? r3(ss.end - ss.start) : null)
      : materialDepth(p.objects, p.machineType, p.faceZ, p.side, p.lo, p.hi);
    if (thick == null) return { error: 'pod dírou za čelem není materiál' };
    const over = spec.value != null && spec.value >= 0 ? spec.value : throughOverrun(p.d);
    return { depth: r3(thick + over), thick };
  }
  return { error: 'neznámý druh hloubky' };
}

/** Parametry pro resolveHoleDepth z kružnice čela (střed vůči středu čela). */
function holeParams(o, faceZ, side) {
  const r = Math.hypot(o.cx, o.cy);
  return {
    faceZ, side, d: 2 * o.r, lo: Math.max(0, r - o.r), hi: r + o.r,
    objects: profileObjects(), machineType: state.machineType,
  };
}

/**
 * Hloubka díry nakreslené ve světě do čela `face` (vrstva s origin, faceZ,
 * faceSide) — pro hlášku po nakreslení.
 */
export function resolveFaceHole(face, hole, spec) {
  const local = { cx: hole.cx - face.origin.x, cy: hole.cy - face.origin.y, r: hole.r };
  return resolveHoleDepth(spec, holeParams(local, Number.isFinite(face.faceZ) ? face.faceZ : 0, face.faceSide === 'left' ? 'left' : 'right'));
}

/**
 * Díra pro CAM: začátek vrtání `zTop` = první materiál pod dírou za rovinou
 * čela — čelo (posuvník = odkud se díváme) může stát ve vzduchu před
 * přírubou a vrtat od něj by byl program naprázdno, kontrola CAM by hlásila
 * „za čelem není materiál" (uživatel 20. 10. 2026). Hloubka se počítá od
 * zTop: skrz = tloušťka materiálu + přesah, hloubka / do Z = konec díry
 * stejný jako od roviny čela. Materiál hned za čelem → bez zTop (= čelo).
 * @returns objekt díry s `depth`, `depthTag`, `zTop` (co jde určit)
 */
export function holeForCam(o, faceZ, side) {
  const p = holeParams(o, faceZ, side);
  const spec = o.holeDepth || null;
  const withStock = !!(spec && spec.mode === 'through' && spec.stock);
  const span = withStock ? stockSpan(p.objects, p.machineType, faceZ, side, p.lo, p.hi)
    : materialSpan(p.objects, p.machineType, faceZ, side, p.lo, p.hi);
  const start = span ? span.start : 0;
  const dir = side === 'left' ? 1 : -1;
  // `throughStock`: CAM kontroluje díru proti dílu I polotovaru (liveChecks).
  const top = { ...(Math.abs(start) > TOL ? { zTop: r3(faceZ + dir * start) } : {}), ...(withStock ? { throughStock: true } : {}) };
  if (!spec) return { ...o, ...top };
  let depth = null, tap = null;
  const th = o.holeThread && o.holeThread.pitch > 0 ? o.holeThread : null;
  if (spec.mode === 'through') {
    if (span) {
      depth = r3(span.end - start + (spec.value != null && spec.value >= 0 ? spec.value : throughOverrun(p.d)));
      if (th) tap = tapDepth(th.pitch, { through: true, thick: span.end - start });
    }
  } else {
    const res = resolveHoleDepth(spec, p);
    if (res.depth > start) depth = r3(res.depth - Math.max(0, start));
    if (th && depth > 0) tap = tapDepth(th.pitch, { depth });
  }
  // Závit: hloubka závitu (skrz = materiál + 2·P, slepá = hloubka − 2·P) pro
  // operaci závitníku (cam/live role 'tap'); mělká díra → bez tapDepth.
  const thread = th ? { holeThread: { ...th, ...(tap ? { depth: tap } : {}) } } : {};
  return depth > 0 ? { ...o, ...top, ...thread, depth, depthTag: holeDepthLabel(spec) } : { ...o, ...top };
}

/**
 * Drážka (úsečka) pro CAM jako díra (holeForCam): stojí-li čelo ve vzduchu
 * před přírubou, frézuje se od prvního materiálu pod osou drážky (`zTop`)
 * — dřív od roviny čela naprázdno a kontrola hlásila „za čelem není
 * materiál" (uživatel 21. 10. 2026). Šířka drážky (Ø frézy) se volí až
 * v CAM — stopa je rozsah poloměrů osy drážky.
 * @returns úsečka se `zTop` (když materiál nezačíná hned za čelem)
 */
export function slotForCam(o, faceZ, side) {
  const lo = segDist(o.x1, o.y1, o.x2, o.y2), hi = Math.max(Math.hypot(o.x1, o.y1), Math.hypot(o.x2, o.y2));
  const span = materialSpan(profileObjects(), state.machineType, faceZ, side, lo, Math.max(hi, lo + 0.01));
  if (!span || !(span.start > TOL)) return o;
  return { ...o, zTop: r3(faceZ + (side === 'left' ? 1 : -1) * span.start) };
}

/** Vzdálenost bodu (0, 0) od úsečky — nejmenší poloměr drážky. */
function segDist(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / L2)) : 0;
  return Math.hypot(x1 + t * dx, y1 + t * dy);
}

/**
 * Kresby čel pro 📥 Z CAD: jako faceDrawingsLocal(), díry (kružnice) přes
 * holeForCam — `depth` a `depthTag` (popisek do názvu operace) u děr
 * s `holeDepth`, `zTop` u děr za vzduchem. Díru, jejíž hloubku nejde určit,
 * nechá bez hloubky (operace dostane výchozí). Drážky (úsečky) přes
 * slotForCam — `zTop` za vzduchem.
 */
export function faceDrawingsForCam() {
  return faceDrawingsLocal().map(f => ({
    ...f,
    objects: f.objects.map(o => (o.type === 'circle' && o.r > 0 ? holeForCam(o, f.z, f.side)
      : o.type === 'line' && !o.isDimension ? slotForCam(o, f.z, f.side) : o)),
  }));
}
