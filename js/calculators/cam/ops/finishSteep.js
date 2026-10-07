// ╔══════════════════════════════════════════════════════════════╗
// ║  PRAVIDLO 15 — dokončování nesjíždí strměji než úhel zanoření   ║
// ╚══════════════════════════════════════════════════════════════╝
// docs/cam-pravidla.md, pravidlo 15 (uživatel 7. 10. 2026): hotovní dráha
// nikde nesjíždí k ose strměji než „Úhel zanoření". Dokončí se celý kus
// kontury před místem, kde začne klesat strměji; odtud rovný průměr
// (`finRunOut` v ops/finishEmit.js — spustí se sám, protože řetěz tu končí)
// a odjezd. Strmý kus se nedokončuje a v náhledu se nekreslí.
//
// Nález: díl uživatele `projekt_2026-10-07 (3)`, úsek 2, kulatá R 10, 45°:
// `N2360 G3 X36.836 Z106.625 CR=20.000` jela po oblouku až do 160°, kde
// klesá skoro kolmo. Hotovní referenční čára (růžová tečkovaná) přitom už
// končí na 133,6° — tam, kde sklon oblouku dosáhne 45° a kde začíná mezní
// čára zanoření (`joinPlungeGuideOffsets` v calculatePipeline.js).
//
// Úsek se posuzuje ve SMĚRU JÍZDY dokončování: zprava ve směru −Z (pořadí
// kontury), zleva +Z (finishEmit.js konturu otočí).

const ANG_TOL = 0.5 * Math.PI / 180;   // tolerance úhlu (úsek přesně pod úhlem zanoření projde)

/** Sklon směru (vx, vz) ve směru jízdy `dirZ`: true = klesá k ose strměji než `limitRad`. */
function steeper(vx, vz, dirZ, limitRad) {
  if (!(vx < -1e-9)) return false;                 // nestoupá dolů k ose
  const fwd = vz * dirZ;                           // složka ve směru jízdy
  return Math.atan2(-vx, fwd) > limitRad + ANG_TOL;
}

/** Rozsah úhlů oblouku dokončovací dráhy (stejně jako segSamplePts ve finish.js). */
function arcSweep(s) {
  let sA = s.startAngle, eA = s.endAngle;
  if (s.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
  if (s.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
  return [sA, eA];
}

/** Kus oblouku mezi úhly a0 → a1 (v pořadí kontury), i s referenčními body kontury. */
function subArc(s, a0, a1) {
  const rRef = s.refP1 ? Math.hypot(s.refP1.x - s.cx, s.refP1.z - s.cz) : null;
  const ref = (a) => (rRef === null ? undefined : { x: s.cx + Math.sin(a) * rRef, z: s.cz + Math.cos(a) * rRef });
  const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  return { ...s, startAngle: norm(a0), endAngle: norm(a1), refP1: ref(a0), refP2: ref(a1) };
}

/**
 * Rozdělí úsek dokončovací dráhy v místě, kde ve směru jízdy začne klesat
 * strměji než úhel zanoření.
 * @param seg      úsek dráhy (line {p1,p2} | arc {cx,cz,r,dir,startAngle,endAngle})
 * @param limitDeg úhel zanoření [°]
 * @param dirZ     směr jízdy v Z (−1 zprava, +1 zleva)
 * @returns { keep, steep, steepFirst } — keep = část před strmým místem
 *   (null = celý úsek strmý), steep = strmá část (null = žádná);
 *   steepFirst = strmá část leží v pořadí kontury PŘED zachovanou (zleva).
 */
export function splitSteepFinish(seg, limitDeg, dirZ) {
  const lim = Math.max(0.5, Math.min(90, limitDeg)) * Math.PI / 180;
  if (seg.type === 'line') {
    // Ve směru jízdy: zprava p1 → p2, zleva p2 → p1 (dráha se otočí).
    const back = dirZ > 0;
    const vx = (seg.p2.x - seg.p1.x) * (back ? -1 : 1), vz = (seg.p2.z - seg.p1.z) * (back ? -1 : 1);
    return steeper(vx, vz, dirZ, lim) ? { keep: null, steep: seg, steepFirst: false } : { keep: seg, steep: null, steepFirst: false };
  }
  if (seg.type !== 'arc' || ![seg.cx, seg.cz, seg.r, seg.startAngle, seg.endAngle].every(Number.isFinite))
    return { keep: seg, steep: null, steepFirst: false };
  const [sA, eA] = arcSweep(seg);
  const sweepSign = Math.sign(eA - sA) || 1;
  const back = dirZ > 0;
  // Úhel oblouku pro parametr jízdy u ∈ [0, 1] a sklon v něm.
  const angAt = (u) => (back ? eA + (sA - eA) * u : sA + (eA - sA) * u);
  const steepAt = (u) => {
    const a = angAt(u), d = (back ? -1 : 1) * sweepSign;
    return steeper(Math.cos(a) * d, -Math.sin(a) * d, dirZ, lim);
  };
  const N = Math.max(16, Math.ceil(Math.abs(eA - sA) * seg.r / 0.2));
  let first = -1;
  for (let k = 0; k <= N; k++) if (steepAt(k / N)) { first = k; break; }
  if (first < 0) return { keep: seg, steep: null, steepFirst: false };
  if (first === 0) return { keep: null, steep: seg, steepFirst: false };
  // Přesná hranice bisekcí mezi posledním mírným a prvním strmým vzorkem.
  let lo = (first - 1) / N, hi = first / N;
  for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (steepAt(m)) hi = m; else lo = m; }
  const aCut = angAt(lo);
  // Zachovaná část je v pořadí jízdy první; v pořadí kontury zprava taky,
  // zleva (jízda pozpátku) až za strmou.
  if (!back) return { keep: subArc(seg, sA, aCut), steep: subArc(seg, aCut, eA), steepFirst: false };
  return { keep: subArc(seg, aCut, eA), steep: subArc(seg, sA, aCut), steepFirst: true };
}
