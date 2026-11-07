// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – posuv dokončení: podle Ra a ve vnitřních rozích         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 6. 11. 2026 (ladění posuvu, navazuje na arcFeedComp.js):
//
// 1) F DOKONČENÍ PODLE CÍLOVÉ DRSNOSTI. Teoretická drsnost soustružení
//    rádiusem rε posuvem f [mm/ot]:  Rz ≈ 1000 · f² / (8 · rε) µm,
//    Ra ≈ 1000 · f² / (32 · rε) µm  (Ra ≈ Rz / 4).  Obráceně
//    f = √(32 · rε · Ra / 1000). rε 0,8 + Ra 1,6 → f ≈ 0,2; velký rádius
//    smí jet výrazně rychleji. Strop „max F" (výchozí 2 × nastavené F
//    dokončení) — vysoké f u velkého rε naráží na lámání třísky a stroj.
//
// 2) VNITŘNÍ ROH. Dráha středu rε má ostrý zlom jen tam, kde má kontura
//    vnitřní (vydutý) roh — osazení, dno zápichu; vypuklé rohy offset
//    obchází tečným obloukem. V rohu bere destička naráz čelem i průměrem,
//    záběr skočí → snížený posuv na posledních rε před rohem a prvních rε
//    za ním. Vnitřní zaoblení (R ≥ rε) zlom nemá; to řeší přepočet na
//    oblouku (vydutý oblouk dostane F menší).

import { slotFinishFeed, paramsFinishFeed } from '../insertFeeds.js';

/** Ra [µm] → posuv [mm/ot] pro rádius rε. */
export function raToFeed(ra, r) {
  return (ra > 0 && r > 0) ? Math.sqrt(32 * r * ra / 1000) : null;
}

/** Posuv [mm/ot] → teoretické Ra [µm]. */
export function feedToRa(f, r) {
  return (f > 0 && r > 0) ? 1000 * f * f / (32 * r) : null;
}

/**
 * Nastavené F dokončení [mm/ot] (uživatel 7. 11. 2026: posuv podle plátku
 * a podle toho, jestli se hrubuje, nebo jede na hotovo — insertFeeds.js):
 *   dokončovací nůž ze zásobníku → jeho f dok. (fFin, jinak odhad z plátku)
 *   týž nůž → prms.finishFeed; 0 = auto z plátku; tvar bez pravidla → F
 */
export function finishBaseFeed(prms, slot = null) {
  if (slot) return slotFinishFeed(slot);
  const ff = parseFloat(prms?.finishFeed);
  if (ff > 0) return ff;
  return paramsFinishFeed(prms) ?? (parseFloat(prms?.feed) || 0);
}

/**
 * F dokončení podle Ra; null = přepínač vypnutý / neplatné hodnoty.
 * @param {object} prms  finRaOn, finRa, finRaMaxF, toolRadius, feed
 * @param {object|null} slot  dokončovací nástroj ze zásobníku ({ radius, f })
 * @returns {{f:number, ra:number, capped:boolean}|null}
 */
export function finishFeedFromRa(prms, slot = null) {
  if (!prms?.finRaOn) return null;
  const r = parseFloat(slot ? slot.radius : prms.toolRadius) || 0;
  const ra = parseFloat(prms.finRa) || 0;
  const fRa = raToFeed(ra, r);
  if (!fRa) return null;
  const base = finishBaseFeed(prms, slot);
  const cap = parseFloat(prms.finRaMaxF) > 0 ? parseFloat(prms.finRaMaxF) : 2 * base;
  const capped = cap > 0 && fRa > cap;
  const f = Math.round((capped ? cap : fRa) * 1000) / 1000;
  return { f, ra: feedToRa(f, r), capped };
}

/** Faktor posuvu ve vnitřním rohu; null = vypnuto. */
export function cornerFeedFactor(prms) {
  if (!prms?.feedCornerOn) return null;
  const p = parseFloat(prms.feedPctCorner);
  const k = Number.isFinite(p) && p > 0 ? Math.min(p, 100) / 100 : 1;
  return k < 1 ? k : null;
}

const startPt = (s) => (s.type === 'line' ? s.p1 : { x: s.cx + Math.sin(s.startAngle) * s.r, z: s.cz + Math.cos(s.startAngle) * s.r });
const endPt = (s) => (s.type === 'line' ? s.p2 : { x: s.cx + Math.sin(s.endAngle) * s.r, z: s.cz + Math.cos(s.endAngle) * s.r });

/** Jednotkový směr jízdy na začátku (`atEnd` = false) / konci úseku. */
function dirAt(s, atEnd) {
  if (s.type === 'line') {
    const dx = s.p2.x - s.p1.x, dz = s.p2.z - s.p1.z, l = Math.hypot(dx, dz);
    return l > 1e-9 ? { x: dx / l, z: dz / l } : null;
  }
  // Bod oblouku = střed + r·(sin a, cos a); G3 úhel roste, G2 klesá (finishEmit.js).
  const a = atEnd ? s.endAngle : s.startAngle, sg = s.dir === 'G2' ? -1 : 1;
  return { x: sg * Math.cos(a), z: -sg * Math.sin(a) };
}

function insideLoop(p, loop) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Je mezi úseky a → b vnitřní roh kontury? Zlom směru > minDeg a bod za
 * vrcholem rohu (po vnější ose úhlu, ve vzdálenosti, kde leží roh kontury)
 * je v dílu. Bez smyčky dílu rozhodne jen zlom.
 */
export function isInnerCorner(a, b, r, partLoop = null, minDeg = 20) {
  const d1 = dirAt(a, true), d2 = dirAt(b, false);
  if (!d1 || !d2) return false;
  const P = endPt(a), Q0 = startPt(b);
  if (Math.hypot(P.x - Q0.x, P.z - Q0.z) > 0.01) return false;   // nenavazují
  const turn = Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.z * d2.z)));
  if (turn < (minDeg * Math.PI) / 180) return false;
  if (!partLoop || partLoop.length < 3) return true;
  // Vnější osa úhlu = proti součtu (−d1 + d2); roh kontury leží r / sin(φ/2) za vrcholem.
  const bx = d1.x - d2.x, bz = d1.z - d2.z, bl = Math.hypot(bx, bz);
  if (bl < 1e-9) return false;
  const phi = Math.PI - turn;                                    // vnitřní úhel dráhy
  const dist = r / Math.max(Math.sin(phi / 2), 0.05) + 0.1;
  return insideLoop({ x: P.x + (bx / bl) * dist, z: P.z + (bz / bl) * dist }, partLoop);
}

/**
 * Pro každý úsek: vnitřní roh před ním / za ním (v rámci řetězu).
 * @returns {Array<{before:boolean, after:boolean}>}
 */
export function innerCornerFlags(segs, r, partLoop) {
  const out = segs.map(() => ({ before: false, after: false }));
  for (let i = 0; i + 1 < segs.length; i++) {
    if (segs[i + 1].chainBreak) continue;
    if (isInnerCorner(segs[i], segs[i + 1], r, partLoop)) { out[i].after = true; out[i + 1].before = true; }
  }
  return out;
}

/**
 * Rozdělí PŘÍMKU na kusy se sníženým posuvem u rohů (délka L, nejvýš
 * třetina úseku na každý konec).
 * @returns {Array<{x:number, z:number, slow:boolean}>} cílové body kusů
 */
export function splitLineAtCorners(seg, before, after, L) {
  const len = Math.hypot(seg.p2.x - seg.p1.x, seg.p2.z - seg.p1.z);
  const at = (t) => ({ x: seg.p1.x + (seg.p2.x - seg.p1.x) * t, z: seg.p1.z + (seg.p2.z - seg.p1.z) * t });
  if (!(len > 1e-6) || (!before && !after)) return [{ ...seg.p2, slow: false }];
  const l = Math.min(L, len / (before && after ? 2 : 1));
  const tB = before ? l / len : 0, tA = after ? 1 - l / len : 1;
  const out = [];
  if (before) out.push({ ...at(tB), slow: true });
  if (tA - tB > 1e-6) out.push({ ...at(tA), slow: false });
  if (after) out.push({ ...seg.p2, slow: true });
  return out;
}
