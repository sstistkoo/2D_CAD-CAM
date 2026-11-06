// ╔═══════════════════════════════════╗
// ║  KONSTANTNÍ POSUV NA OBLOUKU (rε)      ║
// ╚═══════════════════════════════════╝
// CAM vypisuje dráhu STŘEDU rádiusu destičky (offset kontury o rε), bez
// G41/G42 — řídicí systém tedy o kontuře neví a jeho vlastní CFC (Sinumerik)
// ani obdoba u Fanucu nemá z čeho počítat. Naprogramovaný posuv F platí pro
// střed rε, ale řeže se na kontuře:
//   vypuklý oblouk R (nástroj venku):  střed jede po R + rε → na kontuře
//                                      je posuv MENŠÍ než F,
//   vydutý oblouk R (nástroj uvnitř):  střed jede po R − rε → na kontuře
//                                      je posuv VĚTŠÍ než F (až násobně).
// Aby byl posuv v bodě řezu (na kontuře) stále roven F, přepočte se F
// středu poměrem poloměrů:  F_střed = F · r_dráhy / R_kontury.
//
// Poloměr kontury se bere z `refP1` (bod kontury, ze kterého offsetový
// oblouk vznikl — `toolOffset.js`, `ops/finish.js`). Oblouky bez něj
// (proložené elipsy, pomocné spojky) se nepřepočítávají — F zůstane.

/** Mez poměru — u vydutého R ≈ rε by střed skoro stál a F šlo k nule. */
export const ARC_FEED_MIN_FACTOR = 0.1;
export const ARC_FEED_MAX_FACTOR = 3;

/**
 * Poměr F_střed / F_kontura pro offsetový oblouk, nebo null (nepřepočítat).
 * @param {{type:string, cx:number, cz:number, r:number, refP1?:{x:number,z:number}}} seg
 */
export function arcFeedFactor(seg, tipR = 0) {
  if (!seg || seg.type !== 'arc') return null;
  const rPath = Math.abs(seg.r);
  let rCont;
  if (seg.refP1) rCont = Math.hypot(seg.refP1.x - seg.cx, seg.refP1.z - seg.cz);
  else {
    // Hrubovací oblouk (x1/z1 → x2/z2 + střed) nese jen dráhu středu rε.
    // Řeže se o rε blíž ke středu (vypuklý) / dál od něj (vydutý); vypuklost
    // stejným pravidlem jako offset (toolOffset.js isOuterArc: střed kružnice
    // blíž ose než střed oblouku).
    const p1 = seg.p1 || { x: seg.x1, z: seg.z1 }, p2 = seg.p2 || { x: seg.x2, z: seg.z2 };
    if (!(tipR > 0) || ![p1.x, p1.z, p2.x, p2.z, seg.cx, seg.cz].every(Number.isFinite)) return null;
    const sA = Math.atan2(p1.x - seg.cx, p1.z - seg.cz);
    let eA = Math.atan2(p2.x - seg.cx, p2.z - seg.cz);
    if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
    if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
    const midX = seg.cx + Math.sin((sA + eA) / 2) * rPath;
    rCont = Math.abs(seg.cx) < Math.abs(midX) ? rPath - tipR : rPath + tipR;
  }
  if (!(rPath > 1e-6) || !(rCont > 1e-6)) return null;
  const k = Math.min(ARC_FEED_MAX_FACTOR, Math.max(ARC_FEED_MIN_FACTOR, rPath / rCont));
  return Math.abs(k - 1) < 0.01 ? null : k;
}

/** Posuv pro zápis do bloku (3 desetinná místa, bez koncových nul). */
export function formatFeed(f) {
  // Nikdy F0: zaokrouhlení velmi malého posuvu (5 % z 0,01…) by dalo „F0“ → alarm řízení.
  const v = Math.max(parseFloat((parseFloat(f) || 0).toFixed(3)), 0.001);
  return String(v);
}

/**
 * Hlídač modálního F pro emisi: po bloku s přepočteným F vrátí další
 * řezný blok (G1/G2/G3 bez vlastního F) na základní posuv.
 * @param {(line:string, ...rest:any[]) => any} addN původní zápis bloku
 * @param {number|string} baseFeed základní posuv operace
 */
export function makeArcFeedWriter(addN, baseFeed, maxFeed = Infinity) {
  let dirty = false;
  const base = formatFeed(baseFeed);
  const withF = (line, f) => line.replace(/^(\s*G0?[123]\b[^;(]*?)(\s*[;(].*)?$/i, (m, cmd, rest) => `${cmd} F${f}${rest || ''}`);
  const write = (line, ...rest) => {
    if (dirty && /^\s*G0?[123]\b/i.test(line)) {
      if (!/\bF[\d.]/i.test(line.replace(/[;(].*$/, ''))) line = withF(line, base);
      dirty = false;
    }
    return addN(line, ...rest);
  };
  /** Zapíše oblouk s přepočteným F (k = arcFeedFactor). */
  const writeArc = (line, k, ...rest) => {
    if (!k) return write(line, ...rest);
    // Strop maxFeed: F z Ra (až 2×) × oblouk (až 3×) by jinak dalo 6× nastaveného F.
    const r = addN(withF(line, formatFeed(Math.min(maxFeed, (parseFloat(baseFeed) || 0) * k))), ...rest);
    dirty = true;
    return r;
  };
  return { write, writeArc };
}
