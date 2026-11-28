// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – KDE podélné hrubování něco vynechalo (zóny k varováním) ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Varování „úseků polotovaru zůstalo NEOBROBENO — držák se k nim nedostane“,
// „vrstvy vynechány — do kapsy nevede ani rampa“ apod. dřív nesla jen počet.
// Kontrola pravidel (scripts/cam_rules_check.mjs) tak zbytek na dně, který
// generátor vědomě nechal, nedokázala odlišit od chybějící vrstvy (audit CAM
// 28. 11. 2026: 127 nevysvětlených hlášení, téměř všechna se stínem držáku).
// Varování teď nese i `zones: [{ zLo, zHi, x }]` — rozsah Z (a hloubku X), kde
// se vynechalo. Text se nemění.
//
// Souřadnice jsou ty, ve kterých běží výpočet: zleva zrcadlené (z → −z,
// zpátky je překlopí `unmirrorErrorZones` v calculatePipeline.js), u karuselu
// po X prohozené (jako celý výpočet).

/**
 * Zóny zahozené obálkou držáku, kam nakonec NIC nezajelo. Pokrytí se bere
 * z vydaných průchodů VČETNĚ sledování obrysu (leadIn/leadOut) — právě tím se
 * většina zahozených intervalů dobere (dojezd „bez schodků“ projede celé údolí
 * za bossem), takže bez téhle kontroly by hlášení křičelo skoro vždy. Zóna se
 * pokládá za neobrobenou, když je bez pokrytí většina její délky (vzorkuje se
 * v pětinách) — okrajové překryvy dojezdů nic nezachrání.
 * @param {Array<object>} passes
 * @param {Array<{zLo:number,zHi:number,x:number}>} dropped  holderDroppedZones
 * @returns {{ cnt: number, worst: number, zones: Array<{zLo:number,zHi:number,x:number}> }}
 */
export function uncoveredHolderZones(passes, dropped) {
  const spans = [];
  for (const p of passes) {
    if (p.type !== 'long') continue;
    let lo = Math.min(p.zStart, p.zEnd), hi = Math.max(p.zStart, p.zEnd);
    for (const key of ['contourLeadIn', 'contourLeadOut']) {
      for (const s of p[key] || []) { lo = Math.min(lo, s.z1, s.z2); hi = Math.max(hi, s.z1, s.z2); }
    }
    spans.push({ lo, hi });
  }
  const uncovered = (z) => !spans.some(s => z >= s.lo - 0.2 && z <= s.hi + 0.2);
  let worst = 0, cnt = 0;
  const zones = [];
  for (const zn of dropped) {
    const len = Math.abs(zn.zHi - zn.zLo);
    if (len < 1) continue;
    let miss = 0;
    for (let i = 1; i <= 5; i++) if (uncovered(zn.zLo + (zn.zHi - zn.zLo) * i / 6)) miss++;
    if (miss >= 3) {
      cnt++; if (len > worst) worst = len;
      zones.push(zoneOf(zn.zLo, zn.zHi, zn.x));
    }
  }
  return { cnt, worst, zones };
}

/** Zóna s uspořádaným rozsahem Z (na 0,001 mm). */
export function zoneOf(z1, z2, x) {
  const r = (v) => Math.round(v * 1000) / 1000;
  return { zLo: r(Math.min(z1, z2)), zHi: r(Math.max(z1, z2)), x: Number.isFinite(x) ? r(x) : null };
}

/**
 * Zleva: výpočet běží v zrcadle (z → −z) — zóny varování překlopit zpátky.
 * @param {Array<object|string>} errors
 * @returns {Array<object|string>}
 */
export function unmirrorErrorZones(errors) {
  return errors.map(e => (e && typeof e === 'object' && Array.isArray(e.zones))
    ? { ...e, zones: e.zones.map(z => ({ ...z, zLo: -z.zHi, zHi: -z.zLo })) } : e);
}

/**
 * Hloubky, kde obálka držáku něco zastavila (`holderBlockedDepths`). Chová se
 * jako dosavadní Set klíčů `depthKey` (počítání ztracených hloubek se nemění);
 * druhý argument `add(key, iv)` — interval vrstvy {zStart, zEnd} — si navíc
 * zapamatuje, KDE to bylo, pro zóny varování.
 */
export class BlockedDepths extends Set {
  constructor() { super(); this.where = new Map(); }
  add(key, iv) {
    super.add(key);
    if (this.where && iv && Number.isFinite(iv.zStart) && Number.isFinite(iv.zEnd)) {
      if (!this.where.has(key)) this.where.set(key, []);
      this.where.get(key).push(zoneOf(iv.zStart, iv.zEnd, key / 1000));
    }
    return this;
  }
  /** Zóny daných klíčů (ztracené hloubky). */
  zonesOf(keys) { return keys.flatMap(k => this.where.get(k) || []); }
}
