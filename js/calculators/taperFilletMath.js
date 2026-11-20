// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel: tvarový přechod (rádius kužel ↔ čelo)          ║
// ╚══════════════════════════════════════════════════════════════╝
// Čistá matematika bez DOM. Polořez: r = poloměr od osy, z = poloha podél osy
// od spodní hrany kužele (0 … L). Čelo je kolmé k ose (z = konst.) a od hrany
// kužele pokračuje buď k většímu Ø ('out'), nebo k ose ('in').
//
// Rádius R je tečný k povrchu kužele i k čelu. Zadat jde buď průsečík (ostrá
// hrana kužele s čelem = Ø kužele na hraně), nebo začátek rádiusu na čele
// (Ø, kde rádius z čela odbočí) – průsečík se pak dopočítá.

const EPS = 1e-9;

/**
 * Obecný přechod mezi dvěma polopřímkami z rohu P.
 * @param {{r:number,z:number}} P  roh (průsečík)
 * @param {{r:number,z:number}} u1 jednotkový směr po kuželu (od rohu)
 * @param {{r:number,z:number}} u2 jednotkový směr po čele (od rohu)
 * @param {number} R
 */
export function filletAt(P, u1, u2, R) {
  const cos = Math.max(-1, Math.min(1, u1.r * u2.r + u1.z * u2.z));
  const phi = Math.acos(cos);                           // úhel mezi kuželem a čelem
  if (phi < 1e-6 || Math.PI - phi < 1e-6) return null;  // rovnoběžné – rádius nemá smysl
  const t = R / Math.tan(phi / 2);                      // vzdálenost tečných bodů od rohu
  const br = u1.r + u2.r, bz = u1.z + u2.z, bl = Math.hypot(br, bz);
  const k = R / Math.sin(phi / 2);
  return {
    t, phi,
    onCone: { r: P.r + t * u1.r, z: P.z + t * u1.z },
    onFace: { r: P.r + t * u2.r, z: P.z + t * u2.z },
    center: { r: P.r + k * br / bl, z: P.z + k * bz / bl },
  };
}

/**
 * Body oblouku nejdál a nejblíž ose (r = střed ± R), leží-li UVNITŘ oblouku
 * mezi tečnými body (kratší oblouk). Na koncích oblouku je to tečný bod –
 * ten se nevrací (je v tabulce zvlášť).
 */
export function arcExtremes(c, R, p1, p2) {
  const a1 = Math.atan2(p1.z - c.z, p1.r - c.r), a2 = Math.atan2(p2.z - c.z, p2.r - c.r);
  let sw = a2 - a1;
  while (sw > Math.PI) sw -= 2 * Math.PI;
  while (sw < -Math.PI) sw += 2 * Math.PI;
  const inside = (q) => {
    let o = q - a1;
    while (o > Math.PI) o -= 2 * Math.PI;
    while (o < -Math.PI) o += 2 * Math.PI;
    return sw >= 0 ? o > 1e-7 && o < sw - 1e-7 : o < -1e-7 && o > sw + 1e-7;
  };
  return {
    max: inside(0) ? { r: c.r + R, z: c.z } : null,
    min: inside(Math.PI) ? { r: c.r - R, z: c.z } : null,
  };
}

/**
 * Směr po kuželu od hrany `side` k druhé hraně (jednotkový, v r/z).
 * @param {'A'|'B'} side  A = spodek (z = 0), B = vrch (z = L)
 * @param {number} C      kuželovitost (změna Ø na mm délky)
 * @param {'A'|'B'} bigSide
 */
export function coneDir(side, C, bigSide) {
  const a = Math.atan(C / 2);                           // α – sklon povrchu k ose
  const s = bigSide === 'A' ? 1 : -1;                   // r roste směrem ke spodku?
  // od vrchu dolů: z klesá, r roste když je větší Ø dole
  return side === 'B' ? { r: s * Math.sin(a), z: -Math.cos(a) } : { r: -s * Math.sin(a), z: Math.cos(a) };
}

/**
 * Ø průsečíku z Ø začátku rádiusu na čele.
 * @returns {number} Ø průsečíku (NaN když nejde)
 */
export function cornerFromStart(startDia, R, side, C, bigSide, face) {
  const u1 = coneDir(side, C, bigSide), u2 = { r: face === 'in' ? -1 : 1, z: 0 };
  const f = filletAt({ r: 0, z: 0 }, u1, u2, R);
  if (!f) return NaN;
  return startDia - 2 * f.t * u2.r;
}

/**
 * Přechody na obou hranách kužele.
 * @param {object} p
 * @param {number} p.D @param {number} p.d @param {number} p.L @param {number} p.C
 * @param {'A'|'B'} p.bigSide
 * @param {Record<'A'|'B', null | {R:number, face:'in'|'out', given:'corner'|'start', dia?:number}>} p.edges
 * @returns {{ edges: Record<string, any>, error: string }}
 */
export function taperFillets(p) {
  const { D, d, L, C, bigSide } = p;
  const out = { edges: {}, error: '' };
  const coneDia = { A: bigSide === 'A' ? D : d, B: bigSide === 'B' ? D : d };
  const slant = L / Math.cos(Math.atan(C / 2));         // délka površky kužele
  let tSum = 0;
  for (const side of ['B', 'A']) {
    const e = p.edges[side];
    if (!e || !(e.R > 0)) continue;
    const z = side === 'B' ? L : 0;
    let cornerDia = coneDia[side];
    if (e.given === 'start') {
      if (!(e.dia > 0)) { out.edges[side] = { error: 'Zadej Ø začátku rádiusu na čele' }; continue; }
      cornerDia = cornerFromStart(e.dia, e.R, side, C, bigSide, e.face);
    }
    const u1 = coneDir(side, C, bigSide), u2 = { r: e.face === 'in' ? -1 : 1, z: 0 };
    const f = filletAt({ r: cornerDia / 2, z }, u1, u2, e.R);
    if (!f || !Number.isFinite(cornerDia)) { out.edges[side] = { error: 'Rádius nejde spočítat' }; continue; }
    tSum += f.t;
    // Krajní Ø na oblouku: kvadrant (tečna rovnoběžná s osou) uvnitř oblouku –
    // místo, kde jde Ø změřit posuvkou (bez dopočítávání od středu R).
    const ext = arcExtremes(f.center, e.R, f.onFace, f.onCone);
    const res = {
      side, R: e.R, face: e.face, given: e.given, t: f.t,
      corner: { dia: cornerDia, z },
      onFace: { dia: 2 * f.onFace.r, z: f.onFace.z },
      onCone: { dia: 2 * f.onCone.r, z: f.onCone.z },
      center: { dia: 2 * f.center.r, z: f.center.z },
      maxDia: ext.max ? { dia: 2 * ext.max.r, z: ext.max.z } : null,
      minDia: ext.min ? { dia: 2 * ext.min.r, z: ext.min.z } : null,
      // Průsečík ze začátku R nesedí s Ø kužele na hraně
      mismatch: e.given === 'start' && Number.isFinite(coneDia[side]) ? cornerDia - coneDia[side] : 0,
      error: '',
    };
    if (res.onFace.dia < -EPS) res.error = 'Rádius přesahuje přes osu – je moc velký';
    else if (f.t > slant + EPS) res.error = 'Rádius je delší než kužel';
    out.edges[side] = res;
  }
  if (!out.error && tSum > slant + EPS && out.edges.A?.t && out.edges.B?.t) {
    out.error = 'Rádiusy se na kužel nevejdou (tečné body se překrývají)';
  }
  return out;
}
