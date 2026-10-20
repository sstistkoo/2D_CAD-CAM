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
    const thick = materialDepth(p.objects, p.machineType, p.faceZ, p.side, p.lo, p.hi, !!spec.stock);
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
 * Kresby čel pro 📥 Z CAD: jako faceDrawingsLocal(), díry s `holeDepth`
 * dostanou číselné `depth` a `depthTag` (popisek do názvu operace). Díru,
 * jejíž hloubku nejde určit, nechá bez hloubky (operace dostane výchozí).
 */
export function faceDrawingsForCam() {
  return faceDrawingsLocal().map(f => ({
    ...f,
    objects: f.objects.map(o => {
      if (o.type !== 'circle' || !o.holeDepth) return o;
      const res = resolveHoleDepth(o.holeDepth, holeParams(o, f.z, f.side));
      return res.depth > 0 ? { ...o, depth: res.depth, depthTag: holeDepthLabel(o.holeDepth) } : o;
    }),
  }));
}
