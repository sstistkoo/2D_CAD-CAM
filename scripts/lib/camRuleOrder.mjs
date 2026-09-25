// ╔══════════════════════════════════════════════════════════════╗
// ║  Kontrola POŘADÍ obrábění — pravidla 7 a 8 (docs/cam-pravidla) ║
// ╚══════════════════════════════════════════════════════════════╝
// Obojí se posuzuje na ZAČÁTKU každého průchodu (první posuv po
// rychloposuvu), proti materiálu, který v tu chvíli stojí.
//
//   P7  Průchod začíná ZA HRBEM (níž než jeho vrchol), a přitom před hrbem
//       (na straně, odkud se obrábí) ještě stojí materiál nad přídavkem →
//       přejelo se přes hrb dřív, než byla pravá strana hotová.
//       Vrstva, která hrb jen kopíruje a pokračuje (začala PŘED ním), je v pořádku.
//   P8  Průchod v úseku A jde hlouběji než vrch úseku B, který leží blíž
//       ke straně obrábění a ještě není hotový → měl se nejdřív dodělat B.
//       Úseky = pravidlo 1: pata čáry zanoření, která vyjede z polotovaru;
//       upichovák svislá čára u paty strmé stěny.
//
// „u" = souřadnice ve směru, ODKUD se obrábí (zprava: u = z, zleva: u = −z).
// Vyšší u = blíž začátku obrábění („vpravo").

import { sectionFeet } from '../../js/calculators/cam/ops/long/sectionFeet.js';

const DZ = 0.5;          // krok vzorkování sloupců [mm]
const HUMP_MIN = 1;      // hrb musí na obě strany klesnout aspoň o 1 mm
const TOL = 0.1;         // mm pod vrcholem = „níž než"
// „Nehotovo" = zbývá víc než ap (chybí celé vrstvy). Tenčí zbytek je
// porušení P3 (zbytek na dně) a hlásí se tam — tady by se jen zdvojil.

export function makeOrderChecks({ ap, part, allowLoop, stockLoop, guides, cutsFullWidth,
  offsetXAt, dir, topAt, topXOnLoop, pointInLoop }) {
  let zLo = Infinity, zHi = -Infinity;
  for (const p of part) { zLo = Math.min(zLo, p.z); zHi = Math.max(zHi, p.z); }
  const uLo = Math.min(zLo * dir, zHi * dir), uHi = Math.max(zLo * dir, zHi * dir);
  const zOf = (u) => u * dir;
  const allowTop = (u) => topXOnLoop(allowLoop, zOf(u));

  // ── Hrby hotovní kontury (s přídavkem) ─────────────────────────────
  const us = [], xs = [];
  for (let u = uLo + DZ; u < uHi; u += DZ) { const x = allowTop(u); if (x !== null) { us.push(u); xs.push(x); } }
  const humps = [];
  for (let i = 1; i < xs.length - 1; i++) {
    if (!(xs[i] >= xs[i - 1] && xs[i] >= xs[i + 1])) continue;
    let j = i; while (j + 1 < xs.length && Math.abs(xs[j + 1] - xs[i]) < 0.02) j++;   // plošina
    const top = xs[i];
    let lMin = top, rMin = top;
    for (let k = i - 1; k >= 0 && xs[k] <= top + 0.02; k--) lMin = Math.min(lMin, xs[k]);
    for (let k = j + 1; k < xs.length && xs[k] <= top + 0.02; k++) rMin = Math.min(rMin, xs[k]);
    if (top - lMin >= HUMP_MIN && top - rMin >= HUMP_MIN) {
      // Pravá strana (před hrbem) sahá, dokud kontura nepřeroste vrchol hrbu.
      let k = j + 1; while (k < xs.length && xs[k] < top) k++;
      humps.push({ uBack: us[i], uFront: us[j], top, frontEnd: k < xs.length ? us[k] : uHi, zTop: zOf(us[i]) });
    }
    i = j;
  }

  // ── Úseky (pravidlo 1) — TÁŽ funkce jako v generátoru ─────────────
  const inStock = (pt) => { try { return pointInLoop(pt, stockLoop) !== 'outside'; } catch { return true; } };
  const feet = sectionFeet({
    guides: (guides || []).map(g => ({ ...g, z1: g.z1 * dir, z2: g.z2 * dir })),
    isOutside: (pt) => !inStock({ x: pt.x, z: zOf(pt.z) }),
    parting: cutsFullWidth ? { offsetXAt: (u) => offsetXAt(zOf(u)), uLo, uHi } : null,
  });
  const cuts = [uLo, ...feet, uHi];
  const stockTop = (u) => topXOnLoop(stockLoop, zOf(u));
  const sections = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    let top = -Infinity;
    for (let u = cuts[k]; u <= cuts[k + 1]; u += DZ) { const t = stockTop(u); if (t !== null) top = Math.max(top, t); }
    if (Number.isFinite(top)) sections.push({ lo: cuts[k], hi: cuts[k + 1], top, zLo: zOf(cuts[k]), zHi: zOf(cuts[k + 1]) });
  }

  // Nejvíc materiálu nad přídavkem v rozsahu u (0 = hotovo).
  const leftover = (loops, u0, u1) => {
    let worst = 0;
    for (let u = Math.min(u0, u1); u <= Math.max(u0, u1); u += DZ) {
      const top = topAt(loops, zOf(u)), at = allowTop(u);
      if (top !== null && at !== null && top - at > worst) worst = top - at;
    }
    return worst;
  };

  const found = { hump: [], order: [] };
  const seenHump = new Set(), seenOrder = new Set();
  const onPassStart = (i, x, z, edge, loops) => {
    const u = z * dir;
    // P7 — start za hrbem, pod jeho vrcholem, s nehotovou pravou stranou.
    for (const h of humps) {
      if (!(u < h.uBack - DZ) || !(edge < h.top - TOL)) continue;
      if (seenHump.has(h)) continue;
      const rest = leftover(loops, h.uFront, h.frontEnd);
      if (rest > ap) { seenHump.add(h); found.hump.push({ i, v: rest, zTop: h.zTop }); }
    }
    // P8 — hlouběji než vrch nehotového úseku blíž ke straně obrábění.
    const A = sections.find(s => u >= s.lo - 1e-6 && u <= s.hi + 1e-6);
    if (!A) return;
    for (const B of sections) {
      if (B === A || !(B.lo >= A.hi - 1e-6) || !(edge < B.top - TOL)) continue;
      const key = `${A.lo}|${B.lo}`;
      if (seenOrder.has(key)) continue;
      const rest = leftover(loops, B.lo, B.hi);
      if (rest > ap) { seenOrder.add(key); found.order.push({ i, v: rest, A, B }); }
    }
  };

  return { humps, sections, onPassStart, found };
}
