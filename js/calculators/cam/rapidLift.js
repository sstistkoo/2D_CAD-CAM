// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – výška zdvihu „Výjezd nad konturu"                      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Přejezd v Z, který nejde vést přímo, se zvedne. Dřív se zkusila jediná
// nízká výška (vrch zbytku na rozpětí přejezdu) a když neprošla — typicky
// kvůli DRŽÁKU, který se o stěnu opírá už v cílovém bodě — skočilo se rovnou
// na vrch celého polotovaru. Uživatel 2. 11. 2026 (Úsek 2, `G0 X69.017 ;
// Výjezd nad konturu` a hned `G0 X34.680`): „zbytečné výjezdy nahoru a dolů".
// Teď se hledá nejnižší výška od té první po strop, kde přejezd projde
// týmiž testy (volá gcodeEmit.js safeRapidTo).

/**
 * @param {number} from   první zkoušená výška (X)
 * @param {number} cap    strop — vrch polotovaru + vůle (vždy použitelný)
 * @param {(h:number)=>boolean} clear  projde přejezd ve výšce h?
 * @param {number} [step] krok hledání [mm]
 * @returns {number} nejnižší průchozí výška, jinak `cap`
 */
export function lowestClearLift(from, cap, clear, step = 1) {
  for (let h = from; h < cap - 1e-6; h = Math.min(cap, h + step)) {
    if (clear(h)) return h;
  }
  return cap;
}
