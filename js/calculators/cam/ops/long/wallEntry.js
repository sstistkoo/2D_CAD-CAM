// ╔══════════════════════════════════════════════════════════════╗
// ║  VJEZD PO STĚNĚ OD MĚLČÍ VRSTVY — pravidlo 10, bod 1            ║
// ╚══════════════════════════════════════════════════════════════╝
//
// „Do vrstvy se vjíždí jedním postupem, v tomto pořadí — první možnost,
// která projde, platí: 1. Po stěně od mělčí vrstvy — sjezd nejvýš pod úhlem
// zanoření, sloupec nad začátkem sjezdu už vybraný. … 3. Rampou …"
// (docs/cam-pravidla.md). A pravidlo 7, bod 5: „Vrstva za hrbem začíná tam,
// kde začíná její materiál — u stěny, kde vrstva nad ní ze stěny sjela,
// a dál jde po stěně dolů."
//
// Nález uživatele 30. 9. 2026 (polygon 15°, zleva, úsek 2, za hrbem
// X 41,618 / Z 128,99): vrstva X 39,118 za hrbem vjížděla rampou 15° od
// Z 132,01 (`N2400 G1 X39.118 Z141.269 ; Rampa 15.0°`), ale stěna tam klesá
// jen asi 10° — mezi rampou a stěnou zůstal klín 0,5 mm. *„Mělo by to
// udělat nadvakrát: napřed úhel od kontury materiálu a pak úhel od
// zanořování na hloubku ap."* Stopa po offsetu to umí (10° po stěně, pak 15°
// po čáře spodní hrany), jen se dřív zkoušela AŽ PO rampě.

const TOL = 0.02;
// Začátek vjezdu = poslední bod stopy NA podlaze mělčí vrstvy. Přísně: už
// 0,02 mm pod ní by svislý nájezd k začátku řezal kolmo (pravidlo 6).
const FLOOR_TOL = 1e-3;

/** Bod na segmentu stopy (úsečka nebo oblouk jako v traceOffsetPath). */
function at(s, t) {
  if (s.type === 'arc' && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle)) {
    const a = s.startAngle + (s.endAngle - s.startAngle) * t;
    return { x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r };
  }
  return { x: s.x1 + (s.x2 - s.x1) * t, z: s.z1 + (s.z2 - s.z1) * t };
}

/** Segment od parametru t do konce (oblouk si nese úhly, úsečka body). */
function tailOf(s, t) {
  const p = at(s, t);
  if (s.type === 'arc' && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle)) {
    return { ...s, startAngle: s.startAngle + (s.endAngle - s.startAngle) * t, x1: p.x, z1: p.z };
  }
  return { ...s, x1: p.x, z1: p.z };
}

/**
 * Ocas stopy od POSLEDNÍHO místa, kde se dotýká podlahy mělčí vrstvy
 * (`xTop`), do konce. Na rozdíl od `leadInTail` (humpOrder.js) počítá
 * i s plošinou PŘESNĚ na úrovni mělčí vrstvy — tu už vrstva nad ní projela,
 * takže vjezd začíná až na jejím konci, kde stěna klesne.
 * @returns segmenty ocasu, nebo null (stopa na podlahu nedosáhne)
 */
export function tailFromFloor(li, xTop) {
  if (!Array.isArray(li) || li.length === 0) return null;
  for (let k = li.length - 1; k >= 0; k--) {
    const s = li[k];
    const n = Math.max(8, Math.ceil(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) / 0.05));
    for (let j = n; j >= 0; j--) {
      if (at(s, j / n).x < xTop - FLOOR_TOL) continue;
      if (j === n) return k + 1 < li.length ? li.slice(k + 1) : null;
      // Přesný konec dotyku bisekcí mezi j/n (na podlaze) a (j+1)/n (pod ní).
      let lo = j / n, hi = (j + 1) / n;
      for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (at(s, m).x >= xTop - FLOOR_TOL) lo = m; else hi = m; }
      return [tailOf(s, lo), ...li.slice(k + 1)];
    }
  }
  return null;
}

/** Nikde strměji než úhel zanoření (pravidlo 6) — vzorkováno po 0,1 mm. */
export function notSteeperThan(segs, plungeTan) {
  let prev = null;
  for (const s of segs) {
    const n = Math.max(2, Math.ceil(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) / 0.1));
    for (let j = 0; j <= n; j++) {
      const p = at(s, j / n);
      if (prev) {
        const dx = prev.x - p.x, dz = Math.abs(p.z - prev.z);
        if (dx > plungeTan * dz * 1.001 + 1e-4) return false;
      }
      prev = p;
    }
  }
  return true;
}

/**
 * Délka úseků stopy, které klesají MÍRNĚJI než úhel zanoření (nebo stoupají
 * či jdou rovně). Stopa celá po přímce zanoření je jen rampa — vjezd po ní
 * nic nepřidá a jako nájezd po kontuře by vypadla z řetězu ramp (úsek 4
 * dílu uživatele: vrstvy u čela pak vjížděly dřív než vrstvy nad nimi).
 */
export function gentleLength(segs, plungeTan) {
  let len = 0, prev = null;
  for (const s of segs) {
    const n = Math.max(2, Math.ceil(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) / 0.1));
    for (let j = 0; j <= n; j++) {
      const p = at(s, j / n);
      if (prev) {
        const dx = prev.x - p.x, dz = Math.abs(p.z - prev.z);
        if (dx < plungeTan * dz * 0.99) len += Math.hypot(dx, dz);
      }
      prev = p;
    }
  }
  return len;
}

const GENTLE_MIN = 0.5;   // [mm] stěny mírnější než rampa, aby vjezd po ní měl smysl

/**
 * Vjezd po stěně od mělčí vrstvy, nebo null.
 * @param li        nájezd po kontuře končící na začátku vrstvy (traceLeadInTo)
 * @param X         hloubka vrstvy
 * @param floors    hloubky mělčích průchodů nejvýš o ap výš, u kterých
 *                  `covers(xTop, z)` řekne, jestli průchod sloupcem z projel
 */
export function wallEntryLeadIn({ li, X, step, plungeTan, floors, covers }) {
  if (!Array.isArray(li) || li.length === 0) return null;
  const last = li[li.length - 1];
  if (!(Math.abs(last.x2 - X) <= TOL)) return null;
  for (const xTop of floors) {
    if (!(xTop > X + 0.05 && xTop <= X + step + 0.05)) continue;
    const tail = tailFromFloor(li, xTop);
    if (!tail || tail.length === 0) continue;
    const s0 = tail[0];
    if (!covers(xTop, s0.z1)) continue;
    if (!notSteeperThan(tail, plungeTan)) continue;
    if (gentleLength(tail, plungeTan) < GENTLE_MIN) continue;
    return tail;
  }
  return null;
}
