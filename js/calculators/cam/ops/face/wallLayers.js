// ── ČELNÍ HRUBOVÁNÍ: SJEZD PO KOLMÉ STĚNĚ (pravidlo 3) ──
// Mřížka vrstev jde po ap od kraje polotovaru a na kolmou stěnu (čelo dílu,
// osazení) nesedne. Vrstva před stěnou leží až ap daleko, vrstva za ní
// zastaví na vršku stěny — před stěnou pak zůstane až ap navíc. Uživatel
// 31. 10. 2026, `projekt_2026-10-31`, upichovák zleva: čelo Z 0 nechalo
// 1,2 mm (od osy po X 30,8), osazení Z 205 2,4 mm.
// Pravidlo 3: „Na dně ani na schodu nesmí zůstat víc než přídavek."
//
// Uživatel 1. 11. 2026: žádná vrstva navíc (nad stěnou by vyšla tenká) —
// „u dráhy by zvrchu zabral ap, a jak by dorazil k průměru, tak by se posunul
// doleva a sjel by to až dolů." Průchod ZA stěnou tedy dostane dojezd:
// po vršku stěny ke svislici offsetu (WALL_GAP před ní — přímo na ní by ji
// tolerance `offsetXAt` vrátila jako vršek) a po ní dolů na dno.
//
// Stěna = svislý úsek offsetové čáry, za kterým (ve směru postupu) offset
// stoupá.
const WALL_GAP = 0.02;
const MIN_RISE = 0.3;      // nižší „stěna" je jen hrana, sebere ji průchod sám
const MIN_LEFT = 0.1;      // užší zbytek před stěnou než tohle se nedojíždí

/**
 * Sjezdy po stěnách: { zw, zNew, zBeyond } — `zBeyond` je vrstva za stěnou,
 * jejíž průchod sjede na `zNew` (WALL_GAP před svislicí offsetu).
 * @param zList      Z vrstev v pořadí postupu (střed / programovaný bod)
 * @param offsetPath hrubovací offset (kontura + R + přídavek)
 * @param offsetXAt  (z) → max X offsetu v z, nebo null
 * @param sgn        směr postupu v Z (+1 / −1)
 */
export function wallDescents(zList, offsetPath, offsetXAt, sgn) {
  const out = [];
  if (zList.length < 2) return out;
  for (const s of offsetPath) {
    if (s.type !== 'line' || s.isDegenerate) continue;
    if (Math.abs(s.p1.z - s.p2.z) > 1e-3 || Math.abs(s.p1.x - s.p2.x) < MIN_RISE) continue;
    const zw = (s.p1.z + s.p2.z) / 2;
    const before = offsetXAt(zw - sgn * 0.1) ?? 0;   // za koncem dílu je osa
    const after = offsetXAt(zw + sgn * 0.1);
    if (after === null || after <= before + MIN_RISE) continue;
    const zNew = zw - sgn * WALL_GAP;
    // Poslední vrstva před zNew a první za ním (ve směru postupu).
    let prev = null, beyond = null;
    for (const z of zList) {
      const d = sgn * (z - zNew);
      if (d <= 0 && (prev === null || sgn * (z - prev) > 0)) prev = z;
      if (d > 0 && (beyond === null || sgn * (z - beyond) < 0)) beyond = z;
    }
    if (beyond === null) continue;
    if (prev !== null && sgn * (zNew - prev) < MIN_LEFT) continue;   // vrstva už u stěny je
    out.push({ zw, zNew, zBeyond: beyond });
  }
  return out;
}

/**
 * Připojí průchodům za stěnou sjezd po stěně jako `contourLeadOut`
 * (po vršku stěny v Z, pak dolů na dno). Vrací počet připojených.
 * @param floorAt (z) → X dna na zNew (null = nesjíždět)
 */
export function attachWallDescents(passes, descents, floorAt) {
  let n = 0;
  for (const d of descents) {
    const p = passes.find(q => q.type === 'face' && Math.abs(q.z - d.zBeyond) < 1e-6);
    if (!p) continue;
    const xF = floorAt(d.zNew);
    if (xF === null || !(p.xEnd > xF + 0.05)) continue;
    // Dojezd „bez schodků", který po stěně na dno už sjede (a jede dál po
    // dně), je lepší — nepřepisovat (face-cylinder, polygon: Z 31,4 → 32).
    if (p.contourLeadOut && p.contourLeadOut.some(g => g.x2 <= xF + 0.05)) continue;
    p.contourLeadOut = [
      { type: 'line', x1: p.xEnd, z1: p.z, x2: p.xEnd, z2: d.zNew },
      { type: 'line', x1: p.xEnd, z1: d.zNew, x2: xF, z2: d.zNew },
    ];
    p.wallDescent = true;
    n++;
  }
  return n;
}
