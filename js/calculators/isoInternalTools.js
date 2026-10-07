// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – vnitřní nože pro 📚 katalog: vyvrtávací tyče do díry  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 7. 10. 2026: „přidal jsem vrták, takže dokážu vyvrtat díru —
// přidej mezi držáky i vnitřní nože do díry". Ocelové vyvrtávací tyče
// (značení jako ISO 5608 s předponou tyče: S20S-PCLNR09 = tyč ⌀20, délka
// S 250 mm) a vnitřní závitový nůž SNR s destičkou IR. Kulatá tyč ⌀d délky
// l1 leží PODÉL osy; f = od špičky k ose tyče, Dmin = nejmenší díra, do
// které tyč se špičkou vleze. Rozměry ORIENTAČNÍ (typické řady výrobců).
//
// CAM zatím soustruží jen VNĚJŠÍ obrys — tyč jde do zásobníku a použije se
// na vnitřní závit; operace Vyvrtávání přijde zvlášť.
//
// Obrys je v PROFILOVÝCH souřadnicích jako u vnějších nožů, jen zrcadlově
// k ose obrobku: 0,0 = střed rádiusu špičky, +z = od špičky k ose tyče
// (u vnitřního nože k ose obrobku), +x = k obrobené straně (ven z díry,
// kudy vede tyč). Destička má stejné natočení θ jako vnější nůž téhož κr —
// vnitřní nůž = vnější zrcadlený radiálně (jako „zleva" = zrcadlení v Z).

import {
  isoSizesByIc, isoRadii, isoInsertCode, isoKnifeRecord, isoCutData, isoCloseLoop,
  isoClearanceLetter, isoInsertClearance, ISO_HOLDER_GEOM,
} from './isoToolCatalog.js';
import { ISO_THREAD_INSERTS, isoThreadTooth, isoThreadInsertsForPitch } from './isoThreadInserts.js';
import { buildInsertProfileSegments, buildInsertOutlineSegments } from './cam/insertPreview.js';
import { segPoints } from './knifeThumb.js';
import { SHAPES, sizeInfo, RADIUS_MM } from './vbdIso.js';

/**
 * Vyvrtávací tyče (ocel): ⌀d, délkový kód + l1, f = špička → osa tyče,
 * dmin = nejmenší díra, ic = rozsah IC destiček, které se do hlavy vejdou.
 * Ocelová tyč snese vyložení asi 4×d (tvrdokovová 6×d).
 */
export const ISO_BARS = [
  { d: 10, len: 'K', l1: 125, f: 7, dmin: 13, ic: [5, 6.4] },
  { d: 12, len: 'M', l1: 150, f: 9, dmin: 16, ic: [5, 6.4] },
  { d: 16, len: 'Q', l1: 180, f: 11, dmin: 20, ic: [5, 9.6] },
  { d: 20, len: 'S', l1: 250, f: 13, dmin: 25, ic: [6, 9.6] },
  { d: 25, len: 'T', l1: 300, f: 17, dmin: 32, ic: [6, 12.7] },
  { d: 32, len: 'U', l1: 350, f: 22, dmin: 40, ic: [9, 12.7] },
  { d: 40, len: 'V', l1: 400, f: 27, dmin: 50, ic: [9, 16] },
];
/** Vnitřní závitové destičky (IR) do tyče ⌀d (SNR): hrana destičky zhruba d/2 až d + 1. */
const THREAD_BAR_FIT = { 10: [11], 12: [11], 16: [11, 16], 20: [11, 16], 25: [16, 22], 32: [16, 22, 27], 40: [22, 27] };
/** Páčka negativní destičky (upnutí P) se do hlavy vejde až od tyče ⌀20. */
const NEG_MIN_D = 20;
const RELIEF_MAIN_DEG = 3;   // čelo tyče za hlavní hranou (jako levý bok vnějších držáků)

export const ISO_INTERNAL_TYPES = [
  { id: 'BCL', shape: 'C', style: 'L', kr: 95, neg: 'P', pos: 'S',
    desc: 'Vyvrtávání do osazení i dna díry (κr 95°) — hrubování i dokončení. Nejuniverzálnější vnitřní nůž.' },
  { id: 'BTF', shape: 'T', style: 'F', kr: 91, pos: 'S',
    desc: 'Vyvrtávání malých děr (κr 91°), trojúhelník — malé řezné síly, méně chvění na dlouhém vyložení.' },
  { id: 'BDU', shape: 'D', style: 'U', kr: 93, neg: 'P', pos: 'S',
    desc: 'Kopírování v díře (κr 93°) — rádiusy a kužely, zanoření do ~30°.' },
  { id: 'BDQ', shape: 'D', style: 'Q', kr: 107.5, neg: 'P', pos: 'S',
    desc: 'Kopírování v díře se zpětným záběrem (κr 107,5°) — vyjede i z vybrání směrem ven.' },
  { id: 'BVU', shape: 'V', style: 'U', kr: 93, pos: 'S', minD: 16,
    desc: 'Jemné kopírování v díře (κr 93°), V 35° — úzká vybrání, zanoření do ~50°.' },
  { id: 'BTH', special: 'threading',
    desc: 'Vnitřní závit — kulatá tyč SNR s laydown destičkou 11–27IR: 60° / 55° na rozsah stoupání, Tr a Acme na jedno stoupání.' },
];

const rad = (d) => d * Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
const barOf = (d) => ISO_BARS.find((b) => b.d === Number(d)) || null;

export function isoInternalTypeById(id) {
  return ISO_INTERNAL_TYPES.find((t) => t.id === id) || null;
}

// ── Výběr variant (pro UI) ─────────────────────────────────────

/** Vnitřní závitové destičky (IR), které jdou do tyče ⌀d. */
export function isoThreadInsertsForBar(d) {
  const fit = THREAD_BAR_FIT[d] || [];
  return ISO_THREAD_INSERTS.filter((x) => fit.includes(x.size));
}

/** Vejde se tyč ⌀d do díry ⌀holeD? Tyč mimo katalog / díra neznámá → ano. */
export function isoBarFitsHole(d, holeD) {
  const bar = barOf(d);
  return !bar || !(holeD > 0) || bar.dmin <= holeD + 1e-9;
}

/** Průměry tyčí, do kterých jde vnitřní destička. */
export function isoThreadBarsFor(insert) {
  return ISO_BARS.map((b) => b.d).filter((d) => (THREAD_BAR_FIT[d] || []).includes(insert.size));
}

/**
 * Rada pro vnitřní závit: IR destička pro úhel a stoupání, jejíž tyč se
 * vejde do díry ⌀holeD (předvrtání D − 2H) → { hint: „11IR A60 (tyč ⌀10)" };
 * destička je, ale žádná tyč do díry nevleze → { hint: null, holeMin };
 * katalog destičku nemá → null. Z vhodných ta, co jde do nejvíc tyčí.
 */
export function isoInternalThreadHint(angle, P, holeD = Infinity) {
  const cands = isoThreadInsertsForPitch(angle, P);
  if (!cands.length) return null;
  const barsIn = (ins) => isoThreadBarsFor(ins).filter((d) => isoBarFitsHole(d, holeD));
  const best = cands.filter((x) => barsIn(x).length).sort((a, b) => barsIn(b).length - barsIn(a).length)[0];
  if (!best) return { hint: null, holeMin: Math.min(...cands.flatMap((x) => isoThreadBarsFor(x).map((d) => barOf(d).dmin))) };
  return { hint: `${best.size}IR ${best.code} (tyč ⌀${barsIn(best).join(', ')})` };
}

/**
 * Velikosti destičky do hlavy tyče ⌀d: IC v rozsahu tyče a zadní roh
 * destičky nejvýš 1,5 mm nad tyčí (V16 do ⌀20 ne, do ⌀25 ano — jako
 * v katalozích výrobců).
 */
export function isoInternalSizes(type, variant, d) {
  const bar = barOf(d);
  if (!bar || (type.minD && bar.d < type.minD) || (variant === 'neg' && bar.d < NEG_MIN_D)) return [];
  const eps = SHAPES.find((s) => s.v === type.shape).angle;
  return isoSizesByIc(type, variant, bar.ic[0], bar.ic[1]).filter((size) => {
    const prms = { toolShape: 'polygon', toolLength: sizeInfo(type.shape, size).edge, toolRadius: 0.4,
      toolAngle: 180 - eps - type.kr, toolTipAngle: eps, toolTipFlat: 0.1 };
    return Math.max(...segPoints(buildInsertOutlineSegments(prms)).map((p) => p.z)) <= bar.f + bar.d / 2 + 1.5;
  });
}

/** Varianty (neg/pos), pro které má tyč aspoň jednu destičku. */
export function isoInternalVariants(type, d) {
  if (type.special === 'threading') return isoThreadInsertsForBar(Number(d)).length ? ['neg'] : [];
  return ['neg', 'pos'].filter((v) => isoInternalSizes(type, v, d).length > 0);
}

/** Tyče, pro které typ něco má. */
export function isoInternalBars(type) {
  return ISO_BARS.filter((b) => isoInternalVariants(type, b.d).length > 0);
}

/** Počet kombinací (typ × tyč × varianta × velikost × rádius / závitová destička). */
export function isoInternalCount() {
  let n = 0;
  for (const t of ISO_INTERNAL_TYPES) {
    for (const b of isoInternalBars(t)) {
      if (t.special === 'threading') { n += isoThreadInsertsForBar(b.d).length; continue; }
      for (const v of isoInternalVariants(t, b.d)) {
        for (const sz of isoInternalSizes(t, v, b.d)) n += isoRadii(t, sz).length;
      }
    }
  }
  return n;
}

// ── Geometrie ──────────────────────────────────────────────────

/**
 * Obrys vyvrtávací tyče s polygonální destičkou. Hlava od spojnice konců
 * hran (FA–FB, o ISO_HOLDER_GEOM.edge od břitů dovnitř — hlava nesmí končit
 * na prodloužení břitu), čelo tyče za hlavní hranou s úlevou 3°, spodek
 * (strana stěny díry) od konce vedlejší hrany s úlevou ISO_HOLDER_GEOM.relief
 * ke spodku tyče. Strmá vedlejší hrana (D, V) končí nad spodkem tyče — pak
 * hlava jde vodorovně 1 mm za roh destičky a dolů.
 */
function boringBarHolder(prms, bar, geom) {
  const cut = buildInsertProfileSegments(prms);           // [t1→FA, FA→FB, FB→t2, oblouk]
  const FA0 = cut[0].to, FB0 = cut[1].to;
  const cl = Math.hypot(FB0.x - FA0.x, FB0.z - FA0.z);
  const ux = (FB0.x - FA0.x) / cl, uz = (FB0.z - FA0.z) / cl;
  const off = Math.min(geom.edge / Math.sin(rad((180 - prms.toolTipAngle) / 2)), 0.3 * cl);
  const FA = { x: FA0.x + ux * off, z: FA0.z + uz * off }, FB = { x: FB0.x - ux * off, z: FB0.z - uz * off };
  const zTip = Math.min(...segPoints([cut[3]]).map((p) => p.z));   // nos nejblíž stěně díry
  const zLo = zTip + bar.f - bar.d / 2;
  const zHi = Math.max(zTip + bar.f + bar.d / 2, FB.z + 1);
  const theta = prms.toolAngle, eps = prms.toolTipAngle;
  let bottom;
  if (FA.z < zLo) {
    const a = rad(Math.max(theta, 0) + geom.relief);
    bottom = [FA, { x: FA.x + (zLo - FA.z) / Math.tan(a), z: zLo }];
  } else {
    const xd = Math.max(FA.x, FA0.x) + geom.edge;
    bottom = [FA, { x: xd, z: FA.z }, { x: xd, z: zLo }];
  }
  const b = rad(theta + eps - RELIEF_MAIN_DEG);
  const xTop = FB.x + (zHi - FB.z) * Math.cos(b) / Math.sin(b);
  return [...bottom, { x: bar.l1, z: zLo }, { x: bar.l1, z: zHi }, { x: xTop, z: zHi }, FB];
}

/** Obrys závitové tyče SNR: rovná tyč, destička na jejím konci, zub vyčnívá ke stěně díry. */
function threadingBarHolder(prms, bar) {
  const w2 = Math.max(...segPoints(buildInsertOutlineSegments(prms)).map((p) => Math.abs(p.x)));
  const zLo = bar.f - bar.d / 2, zHi = bar.f + bar.d / 2, xL = -(w2 + 0.5);
  return [{ x: xL, z: zLo }, { x: bar.l1, z: zLo }, { x: bar.l1, z: zHi }, { x: xL, z: zHi }];
}

// ── Stavba nože ────────────────────────────────────────────────

/**
 * Postaví vnitřní nůž (záznam knihovny s `tool` = CAM_TOOL_KEYS).
 * @param {string} typeId  id z ISO_INTERNAL_TYPES
 * @param {{bar?:number, variant?:'neg'|'pos', size?:string, radius?:string,
 *          hand?:'R'|'L', thread?:string}} [opts]
 * @returns {Object|null}
 */
export function buildIsoInternalKnife(typeId, opts = {}) {
  const type = isoInternalTypeById(typeId);
  if (!type) return null;
  const hand = opts.hand === 'L' ? 'L' : 'R';
  const bars = isoInternalBars(type);
  const bar = bars.find((b) => b.d === Number(opts.bar)) || bars.find((b) => b.d === 20) || bars[0];
  if (!bar) return null;
  const sh = { l1: bar.l1, b: bar.d };
  const iso = { type: type.id, bar: bar.d, hand, dmin: bar.dmin, internal: true };

  if (type.special === 'threading') {
    const fit = isoThreadInsertsForBar(bar.d);
    const th = fit.find((x) => x.id === opts.thread) || fit.find((x) => x.id === 'AG60') || fit[0];
    const { flat, flank } = isoThreadTooth(th);
    const vbdCode = `${th.size}I${hand}${th.code}`;
    const prms = { toolShape: 'threading', toolLength: flank, toolRadius: 0, toolAngle: 0, toolTipAngle: th.angle, toolTipFlat: flat,
      toolClearanceAngle: 0, toolVbdCode: vbdCode };
    const f = th.kind === 'partial' ? Math.min(Math.max(1.5, th.pMin), th.pMax) : th.P;
    return isoKnifeRecord({ name: `SN${hand}${String(bar.d).padStart(4, '0')}${bar.len}${th.size}`, vbdCode,
      holder: isoCloseLoop(threadingBarHolder(prms, bar)), prms, sh, hand,
      cut: { vc: 100, f: r3(f), ap: 0.1 }, desc: type.desc, iso: { ...iso, thread: th.id } });
  }

  const variants = isoInternalVariants(type, bar.d);
  const variant = variants.includes(opts.variant) ? opts.variant : variants[0];
  const sizes = isoInternalSizes(type, variant, bar.d);
  const size = sizes.includes(opts.size) ? opts.size : sizes[sizes.length - 1];
  const radii = isoRadii(type, size);
  // Malá tyč = menší rádius (menší radiální síla, méně chvění).
  const prefR = bar.d <= 16 ? '04' : '08';
  const radius = radii.includes(opts.radius) ? opts.radius : (radii.includes(prefR) ? prefR : radii[0]);
  const eps = SHAPES.find((s) => s.v === type.shape).angle;
  const edge = sizeInfo(type.shape, size).edge;
  const R = RADIUS_MM[radius];
  const vbdCode = isoInsertCode(type, variant, size, radius);
  const prms = { toolShape: 'polygon', toolLength: edge, toolRadius: R, toolAngle: 180 - eps - type.kr, toolTipAngle: eps,
    toolTipFlat: 0.1, toolTipMirror: false, toolVbdCode: vbdCode, toolClearanceAngle: isoInsertClearance(type, variant) };
  // Záběr omezí i tyč: ap ≤ d/8 (vyložení, chvění).
  const cut = isoCutData('polygon', edge, eps, R);
  cut.ap = Math.min(cut.ap, Math.max(0.5, Math.round((bar.d / 8) * 2) / 2));
  const name = `S${String(bar.d).padStart(2, '0')}${bar.len}-${type[variant]}${type.shape}${type.style}${isoClearanceLetter(type, variant)}${hand}${size}`;
  return isoKnifeRecord({ name, vbdCode, holder: isoCloseLoop(boringBarHolder(prms, bar, ISO_HOLDER_GEOM)), prms, sh, hand,
    cut, desc: type.desc, iso: { ...iso, variant, size, radius } });
}
