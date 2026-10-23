// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – čelní zapichovací nože pro 📚 katalog (pravidlo 19)    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Čelní (axiální) zápich — třeba pro O-kroužek (uživatel 23. 10. 2026).
// Upichovací destička MGMN natočená o −90°: ostří míří k −Z (do čela), tělo
// a čepel k +Z. Čepel je zakřivená podle průměru zápichu, proto má každý
// nůž ROZSAH PRŮMĚRŮ, ve kterém smí zapichovat (d1 ≥ Dmin, d2 ≤ Dmax).
// Dosah = největší hloubka zápichu (délka čepele). Rozměry ORIENTAČNÍ
// (typické řady výrobců).
//
// Obrys držáku je v profilových souřadnicích CAM (profil.z = svět X
// radiálně, profil.x = svět Z axiálně — holderWorldLoop), nenatáčí se:
// čepel o šířce destičky jde od těla destičky osově (+Z) a nad dosahem
// přechází v dřík, který vede radiálně ven nad čelem dílu.

import { ISO_GROOVE_INSERTS, isoKnifeRecord, isoCloseLoop } from './isoToolCatalog.js';
import { PARTING_BODY_MIN_H_MM } from './cam/insertPreview.js';

export const FACE_GROOVE_TYPE = {
  id: 'FG', special: 'facegroove', groups: ['facegroove'],
  desc: 'Čelní (axiální) zápich, např. pro O-kroužek — destička natočená do čela, zakřivená čepel pro rozsah průměrů. Upich → ⊚ Čelní.',
};

/** Rozsahy průměrů čepele (Dmin–Dmax) — první zápich musí ležet v rozsahu. */
export const FACE_GROOVE_RANGES = [
  { dmin: 20, dmax: 30 }, { dmin: 30, dmax: 45 }, { dmin: 45, dmax: 70 },
  { dmin: 70, dmax: 120 }, { dmin: 120, dmax: 250 }, { dmin: 250, dmax: 600 },
];
/** Šířka destičky → dosah (hloubka zápichu); úzká čepel snese menší. */
const REACH_BY_WIDTH = { 3: 6, 4: 9, 5: 12, 6: 14 };
/** Na malé průměry jen užší destičky (zakřivená čepel). */
const MAX_W_FOR_DMIN = (dmin) => (dmin < 30 ? 4 : 6);
const SHANK = { l1: 150, b: 25, code: '2525' };

/** Šířky destiček pro rozsah průměrů → [{ w, r, a, code }]. */
export function isoFaceGrooveWidths(range) {
  const maxW = MAX_W_FOR_DMIN(range.dmin);
  return ISO_GROOVE_INSERTS.filter((g) => REACH_BY_WIDTH[g.w] && g.w <= maxW)
    .map((g) => ({ w: g.w, r: g.r, a: REACH_BY_WIDTH[g.w], code: g.code }));
}

/** Počet kombinací (rozsah × šířka). */
export function isoFaceGrooveCount() {
  return FACE_GROOVE_RANGES.reduce((n, rg) => n + isoFaceGrooveWidths(rg).length, 0);
}

/** Čelní zapichovací nůž ze jména („FGR2525-3-A6-D30-45") → { w, a, dmin, dmax }, jinak null. */
export function isoFaceGrooveFromName(name) {
  const m = /^FG[RL]\d{4}-([\d.]+)-A([\d.]+)-D(\d+)-(\d+)$/.exec(String(name || '').trim());
  return m ? { w: Number(m[1]), a: Number(m[2]), dmin: Number(m[3]), dmax: Number(m[4]) } : null;
}

/**
 * Obrys držáku (profil): čepel šířky destičky (o 0,1 mm užší z každé
 * strany) od těla destičky osově, dřík nad dosahem radiálně ven.
 * Svět: destička natočená −90° zabírá X ∈ [−(w − r), r], tělo Z ∈ [−r, 15].
 */
function faceHolder(w, r, a) {
  const x0 = -(w - r) + 0.1, x1 = r - 0.1;              // čepel radiálně (svět X)
  const zb = PARTING_BODY_MIN_H_MM - 1;                   // čepel začíná v těle destičky
  const zs = Math.max(PARTING_BODY_MIN_H_MM, a + 2);     // spodek dříku nad dosahem
  const world = [{ x: x0, z: zb }, { x: x1, z: zb }, { x: x1, z: zs }, { x: SHANK.l1, z: zs },
    { x: SHANK.l1, z: zs + SHANK.b }, { x: x0, z: zs + SHANK.b }];
  return world.map((p) => ({ x: p.z, z: p.x }));          // svět → profil
}

/**
 * Postaví čelní zapichovací nůž (záznam knihovny s `tool` = CAM_TOOL_KEYS).
 * @param {{range?:number, width?:number, hand?:'R'|'L'}} [opts] range = index FACE_GROOVE_RANGES
 */
export function buildIsoFaceGroove(opts = {}) {
  const hand = opts.hand === 'L' ? 'L' : 'R';
  const rg = FACE_GROOVE_RANGES[Number(opts.range)] || FACE_GROOVE_RANGES[1];
  const ws = isoFaceGrooveWidths(rg);
  const g = ws.find((x) => x.w === Number(opts.width)) || ws.find((x) => x.w === 3) || ws[0];
  const prms = { toolShape: 'parting', toolLength: g.w, toolRadius: g.r, toolAngle: -90, toolTipAngle: 90,
    toolTipFlat: 0.1, toolClearanceAngle: 0, toolVbdCode: g.code };
  return isoKnifeRecord({
    name: `FG${hand}${SHANK.code}-${g.w}-A${g.a}-D${rg.dmin}-${rg.dmax}`, vbdCode: g.code,
    holder: isoCloseLoop(faceHolder(g.w, g.r, g.a)), prms, sh: { l1: SHANK.l1, b: SHANK.b }, hand,
    cut: { vc: 100, f: Math.round((0.03 + 0.008 * g.w) * 1000) / 1000, ap: 1 },
    desc: FACE_GROOVE_TYPE.desc,
    iso: { type: 'FG', hand, width: g.w, reach: g.a, dmin: rg.dmin, dmax: rg.dmax, range: FACE_GROOVE_RANGES.indexOf(rg), face: true },
  });
}
