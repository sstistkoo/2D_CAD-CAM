// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – posuv cik caku u čela (zigzagEmit.js)                   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 6. 11. 2026: cik cak jezdí od čela k čelu a mezi vrstvami se u
// čela zanoří rampou. Rampa se od čela odkloní, takže pod ní u čela zůstane
// KLÍN. Vrstva o dvě níž, která k tomu čelu znovu přijede, bere kromě ap i
// ten klín — kulatá destička ho zabírá horní částí břitu.
//
// Snížený posuv („Posuv u čela") začne AŽ tam, kde se obrys destičky klínu
// skutečně dotkne (uživatel: „až by začal brát" — dřív se snižovalo už
// při normálním ap). Klín = místo nad dnem předchozí vrstvy (B), kam
// nedosáhla ani vrstva nad rampou (A), ani rampa A→B, ani vrstva B.
// Hledá se numericky: obrys kružnice R se posouvá po vrstvě ke stěně a
// první poloha, kde obrys leží v neobrobeném klínu (o víc než WEDGE_TOL),
// je začátek sníženého posuvu.
//
// Auto % (bod 2): F × ap / (ap + h), h = nejvyšší přebytek klínu v záběru
// u stěny (o kolik je tříska hlubší než ap). Mez AUTO_MIN.
// Posuv při zanoření řeší obecně cam/feedTuning.js (všechny strategie).
// Dráha se nemění — vodorovný pohyb k čelu se rozdělí na dva bloky.

export const WEDGE_TOL = 0.1;   // mm — menší „dotyk" se za záběr nepočítá
export const AUTO_MIN = 0.25;

/** Faktor posuvu u čela; null = vypnuto. `auto` = spočítat z klínu. */
export function zigzagWallFeed(prms) {
  if (!prms?.feedWallOn) return null;
  if (prms.feedWallAuto) return { auto: true };
  const p = parseFloat(prms.feedPctWall);
  const k = Number.isFinite(p) && p > 0 ? Math.min(p, 100) / 100 : 1;
  return k === 1 ? null : { k };
}

/** Vzdálenost bodu od úsečky a–b. */
function segDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}

/**
 * Klín u čela pro vrstvu, která k němu jede.
 * @param {{x,z}} top   horní bod rampy (konec vrstvy A u stěny)
 * @param {{x,z}} foot  pata rampy (začátek vrstvy B)
 * @param {{x,z}} from  začátek vodorovné vrstvy C
 * @param {{x,z}} to    konec vrstvy C u stěny
 * @param {number} R    rádius kulaté destičky
 * @param {number} up   znaménko „nahoru" v X (vnější = +1)
 * @returns {{start:number, h:number}|null} start = vzdálenost od konce, kde
 *          začne záběr klínu; h = max. přebytek nad ap. null = klín se nezabírá.
 */
export function wedgeEngagement(top, foot, from, to, R, up = 1) {
  if (!(R > 0)) return null;
  const s = Math.sign(to.z - from.z);
  if (!s) return null;
  const FAR = 1e4;
  const A0 = { x: top.x, z: top.z - s * FAR }, B1 = { x: foot.x, z: foot.z - s * FAR };
  const band = foot.x - up * R;                       // dno po vrstvě B
  const inWedge = (p) => up * (p.x - band) > WEDGE_TOL
    && segDist(p, A0, top) > R + WEDGE_TOL && segDist(p, top, foot) > R + WEDGE_TOL
    && segDist(p, foot, B1) > R + WEDGE_TOL;
  const len = Math.abs(to.z - from.z);
  const reach = Math.min(len, Math.abs(foot.z - top.z) + 2 * R + 1);
  const N = 72, STEP = 0.2;
  let start = null;
  for (let d = reach; d >= 0; d -= STEP) {
    const c = { x: to.x, z: to.z - s * d };
    let hit = false;
    for (let k = 0; k < N && !hit; k++) {
      const a = (2 * Math.PI * k) / N;
      hit = inWedge({ x: c.x + R * Math.cos(a), z: c.z + R * Math.sin(a) });
    }
    if (hit) { start = d; break; }
  }
  if (start === null) return null;
  // Nejvyšší přebytek klínu v kružnici na konci (mřížka 0,25 mm).
  let h = 0;
  const G = 0.25;
  for (let ix = -R; ix <= R; ix += G) {
    for (let iz = -R; iz <= R; iz += G) {
      if (ix * ix + iz * iz > R * R) continue;
      const p = { x: to.x + ix, z: to.z + iz };
      if (inWedge(p)) h = Math.max(h, up * (p.x - band));
    }
  }
  return { start: Math.min(len, start + STEP), h };
}

/**
 * Rozpis pohybů průchodu na bloky s posuvem (jen „Posuv u čela").
 * @param {Array<{g:string,x:number,z:number}>} moves  pohyby průchodu (moves[0] = start)
 * @param {object} prms  feed, toolRadius, feedWallOn, feedWallAuto, feedPctWall
 * @returns {Array<{g:string,x:number,z:number,f:number|null}>}
 */
export function zigzagFeedPlan(moves, prms) {
  const F = parseFloat(prms.feed) || 0.1;
  const wf = zigzagWallFeed(prms);
  const R = Math.max(parseFloat(prms.toolRadius) || 0, 0);
  const up = 1;                                      // vnitřní rámec cik caku = vnější soustružení
  const out = [];
  const ramps = {};                                  // strana čela (±1) → { top, foot }
  for (let i = 1; i < moves.length; i++) {
    const a = moves[i - 1], m = moves[i];
    if (m.g === 'G0') { out.push({ g: 'G0', x: m.x, z: m.z, f: null }); continue; }
    const dx = m.x - a.x, dz = m.z - a.z;
    if (wf && -dx * up > 1e-6 && Math.abs(dz) > 1e-6) {
      // Rampa do hloubky — odklání se od čela na straně −sign(dz).
      ramps[-Math.sign(dz)] = { top: { x: a.x, z: a.z }, foot: { x: m.x, z: m.z } };
    }
    const rp = wf && Math.abs(dx) < 1e-6 && Math.abs(dz) > 1e-6 ? ramps[Math.sign(dz)] : null;
    const eng = rp ? wedgeEngagement(rp.top, rp.foot, a, m, R, up) : null;
    if (eng) {
      const ap = Math.abs(rp.top.x - rp.foot.x);
      const k = wf.auto ? Math.max(AUTO_MIN, Math.min(1, ap / (ap + eng.h))) : wf.k;
      const len = Math.abs(dz);
      if (k < 1) {
        if (len - eng.start > 0.05) out.push({ g: 'G1', x: m.x, z: m.z - Math.sign(dz) * eng.start, f: F });
        out.push({ g: 'G1', x: m.x, z: m.z, f: F * k, wall: true });
        delete ramps[Math.sign(dz)];
        continue;
      }
    }
    if (rp) delete ramps[Math.sign(dz)];
    out.push({ g: 'G1', x: m.x, z: m.z, f: F });
  }
  return out;
}
