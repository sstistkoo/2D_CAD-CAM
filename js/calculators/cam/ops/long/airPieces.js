// ╔══════════════════════════════════════════════════════════════╗
// ║  KAPSA PŘES VZDUCH → samostatné kusy se vjezdem ze vzduchu      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Pravidlo 7: „Každá vrstva jede až na konec." Za hrbem ale booleovský sken
// vrátí JEDEN interval od stěny hrbu až po konec dílu — přes vzduch nad
// krkem i přes další bossy dál vlevo. Celý se pak bral jako jedna kapsa:
// když se vjezd hned za hrbem nevešel (držák nad hrbem), zahodil se celý —
// i bossy desítky mm dál, kam se dá vjet normálně ze vzduchu (díl uživatele
// 24. 9. 2026 s upichovákem: celá levá část Z 0…195 neobrobená).
//
// Tady se takový interval rozdělí na vzduchových mezerách polotovaru:
// první kus zůstává kapsou za hrbem, každý další kus materiálu dostane
// `airEntry` — začíná ve vzduchu o AIR_MARGIN před materiálem a obrábí se
// jako otevřený vjezd (roughLong.js mu hlídá držák podle pořadí obrábění).
// Otevřený první interval hloubky (vjezd zprava) se nedělí: přes vzduch
// v něm jede emise rychloposuvem sama.

const MIN_GAP = 2;       // kratší vzduch interval nedělí [mm]
const AIR_MARGIN = 1;    // vjezd kusu začíná tolik ve vzduchu před materiálem

/**
 * @param intervals  intervaly hloubky (zStart > zEnd)
 * @param firstOpen  je intervals[0] otevřený vjezd zprava?
 * @param crossings  průsečíky polotovaru na hloubce, sestupně (`stockCrossingsAt`)
 * @returns nové pole intervalů
 */
export function splitPocketsAtAir(intervals, firstOpen, crossings) {
  if (!Array.isArray(crossings) || crossings.length < 4) return intervals;
  const spans = [];
  for (let k = 0; k + 1 < crossings.length; k += 2) spans.push({ hi: crossings[k], lo: crossings[k + 1] });
  const out = [];
  intervals.forEach((iv, idx) => {
    if (idx === 0 && firstOpen) { out.push(iv); return; }
    const inside = spans
      .filter(s => s.hi > iv.zEnd + 1e-6 && s.lo < iv.zStart - 1e-6)
      .map(s => ({ hi: Math.min(s.hi, iv.zStart), lo: Math.max(s.lo, iv.zEnd) }));
    // Sloučit kusy, mezi kterými je vzduchu méně než MIN_GAP.
    const merged = [];
    for (const s of inside) {
      const last = merged[merged.length - 1];
      if (last && last.lo - s.hi < MIN_GAP) last.lo = s.lo; else merged.push({ ...s });
    }
    if (merged.length < 2) { out.push(iv); return; }
    merged.forEach((s, k) => {
      const lastPiece = k === merged.length - 1;
      const zEnd = lastPiece ? iv.zEnd : s.lo;
      if (k === 0) {
        out.push({ ...iv, zStart: iv.zStart, zEnd, blocked: lastPiece ? iv.blocked : false });
        return;
      }
      const prevLo = merged[k - 1].lo;
      const zStart = Math.min(s.hi + AIR_MARGIN, (prevLo + s.hi) / 2);
      out.push({ zStart, zEnd, blocked: lastPiece ? iv.blocked : false, airEntry: true });
    });
  });
  return out;
}
