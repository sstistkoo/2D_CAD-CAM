// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – tvar DÍRY z výkresu (vyvrtávání, cam/ops/bore.js)       ║
// ╚══════════════════════════════════════════════════════════════╝
// Uživatel 8. 10. 2026: díru chce kreslit OBOJÍM způsobem —
//   A) samostatný řetěz (nenavazuje na vnější obrys): přenos z CAD ho pošle
//      v sekci DIRA_START…DIRA_END (storage/fileIO.js) → S.borePoints,
//   B) napojenou na čelo (uzavřený řez): kontura jde ode dna díry po stěně
//      k čelu, po čele ven a dál po vnějším obrysu (nebo opačně).
// B dřív rozbíjelo i VNĚJŠÍ hrubování — díra se brala jako vzduch nad dílem
// a vrstvy jely skrz stěnu dílu až k ose. `splitBoreFromSegments` ji proto
// z vnější kontury vyjme (calculatePipeline) a vrátí ji vyvrtávání.
//
// Segmenty jako v calculatePipeline: { type:'line'|'arc', p1:{x,z}, p2:{x,z}
// (+ arc: cx, cz, r, dir, startAngle, endAngle) }, x = POLOMĚR. Úhel oblouku
// a = atan2(x − cx, z − cz).

import { getArcParams, reverseSeg } from './camMath.js';
import { resolvePointsToAbsolute } from './contourBuild.js';

const EPS = 0.01;
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < EPS;
const clone = (s) => structuredClone(s);

/** Body programu (contourPoints / borePoints) → segmenty v poloměrech; G0 = mezera (null). */
export function segmentsFromPoints(points, mode) {
  const k = mode === 'DIAMON' ? 2 : 1;
  const abs = resolvePointsToAbsolute(points || []);
  const out = [];
  for (let i = 0; i < abs.length - 1; i++) {
    const a = abs[i], b = abs[i + 1];
    const p1 = { x: a.xAbs / k, z: a.zAbs }, p2 = { x: b.xAbs / k, z: b.zAbs };
    if (b.type === 'G1') {
      if (Math.hypot(p2.x - p1.x, p2.z - p1.z) > 1e-4) out.push({ type: 'line', p1, p2 });
    } else if (b.type === 'G2' || b.type === 'G3') {
      const arc = getArcParams(p1, p2, b.rVal, b.type);
      if (!arc.error) {
        out.push({ type: 'arc', ...arc, p1, p2, dir: b.type,
          startAngle: Math.atan2(p1.x - arc.cx, p1.z - arc.cz), endAngle: Math.atan2(p2.x - arc.cx, p2.z - arc.cz) });
      }
    } else {
      out.push(null);
    }
  }
  return out;
}

/** Souvislý začátek řetězu (do první mezery). */
function connectedPrefix(segs) {
  const out = [];
  for (const s of segs) {
    if (!s || (out.length && !near(out[out.length - 1].p2, s.p1))) break;
    out.push(s);
  }
  return out;
}

/** Řetěz otočený pozpátku (pořadí i směr každého segmentu). */
function reversedChain(segs) {
  const out = segs.map(clone).reverse();
  out.forEach(reverseSeg);
  return out;
}

/**
 * Díra napojená na čelo (B). Ústí M = bod na čele (nejvyšší Z kontury),
 * ze kterého jeden segment vede po čele NAHORU k vnějšímu průměru a druhý
 * do dílu (k nižšímu Z). Díra = vše od M na straně toho druhého segmentu, dokud
 * leží pod horní hranou čela a nad osou. Vnější profil čelem dolů k ose nebo
 * sražení čela takové M nemá (čelo z něj jde DOLŮ), díra nakreslená jako
 * samostatný řetěz taky ne (na konturu nenavazuje).
 * @returns {{outer:Array, bore:Array}|null} bore začíná v ústí a vede dovnitř
 */
export function splitBoreFromSegments(segs) {
  const S = (segs || []).filter(Boolean);
  if (S.length < 3) return null;
  let zMax = -Infinity;
  for (const s of S) zMax = Math.max(zMax, s.p1.z, s.p2.z);
  const atFace = (p) => Math.abs(p.z - zMax) < EPS;
  const faceLine = (s) => s.type === 'line' && atFace(s.p1) && atFace(s.p2);
  for (let k = 1; k < S.length; k++) {
    const A = S[k - 1], B = S[k];
    const M = A.p2;
    if (!near(M, B.p1) || !atFace(M) || !(M.x > EPS)) continue;
    let side = null, faceTop = null;
    if (faceLine(B) && B.p2.x > M.x + EPS && A.p1.z < zMax - EPS) { side = 'before'; faceTop = B.p2.x; }
    else if (faceLine(A) && A.p1.x > M.x + EPS && B.p2.z < zMax - EPS) { side = 'after'; faceTop = A.p1.x; }
    if (!side) continue;
    const boreRaw = side === 'before' ? reversedChain(S.slice(0, k)) : S.slice(k).map(clone);
    const bore = connectedPrefix(boreRaw);
    const inside = bore.every(s => [s.p1, s.p2].every(p => p.x < faceTop - EPS && p.x > -EPS && p.z < zMax + EPS));
    if (!bore.length || !inside) continue;
    // Nesouvislý zbytek za díry (za mezerou) zůstává vnější kontuře.
    const rest = boreRaw.slice(bore.length);
    const outer = side === 'before'
      ? [...reversedChain(rest), ...S.slice(k).map(clone)]
      : [...S.slice(0, k).map(clone), ...rest];
    return { outer, bore };
  }
  return null;
}

/**
 * Tvar díry pro vyvrtávání ze stavu CAM: samostatný řetěz z CAD (A,
 * S.borePoints), jinak díra napojená na čelo vnější kontury (B).
 * @returns {{segs:Array, source:'separate'|'connected'}|null} segs od ústí dovnitř
 */
export function boreChainFromState(S) {
  const mode = S.params && S.params.mode;
  if (Array.isArray(S.borePoints) && S.borePoints.length > 1) {
    let segs = connectedPrefix(segmentsFromPoints(S.borePoints, mode));
    if (segs.length) {
      if (segs[0].p1.z < segs[segs.length - 1].p2.z) segs = reversedChain(segs);
      return { segs, source: 'separate' };
    }
  }
  const split = splitBoreFromSegments(segmentsFromPoints(S.contourPoints, mode));
  return split ? { segs: split.bore, source: 'connected' } : null;
}
