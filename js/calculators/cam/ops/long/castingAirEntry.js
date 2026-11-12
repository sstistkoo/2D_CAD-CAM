// ╔══════════════════════════════════════════════════════════════╗
// ║  Vjezd na hraně odlitku ze vzduchu — bez rampy (pravidlo 10/2)  ║
// ╚══════════════════════════════════════════════════════════════╝
// U odlitku leží vjezd do vrstvy na průsečíku s polotovarem (`passEntryZ`),
// ne na kraji okna (`effZMax`). roughLong.js takový vjezd bral jako „umělou
// hranici" (`entryZ !== effZMax` → `entryCapped`) a vynucoval rampu — a když
// mělčí vrstva vjela rampou, další se na ni řetězila (pocketReposition).
//
// Díl uživatele (karusel Od středu, ap 4, 11. 11. 2026): šikmá stěna odlitku
// X557→597 nad V-údolím S10–S11. Z174 vjela malou rampou po povrchu, Z170…155
// pak řetězem ramp 15° od X572 doprava a pod rampovou čarou zůstal klín
// X557–628 × Z105–175. Vrstvy Z126 a níž jely pod ním až ke stěně a držák
// klínem projel (12 nálezů, až 1132 mm²). Nad hranou je přitom vzduch až
// nahoru — vjezd ze vzduchu vodorovně (pravidlo 10, bod 2) má přednost před
// rampou (bod 3).
//
// Vjezd se pustí bez rampy jen když: odlitek; vjezd posunul jen průsečík
// polotovaru (ne rozsah 📐 ani hranice regionu); povrch nad vjezdem je pod
// BŘITEM (sloupec nad nosem vybraný / bez polotovaru — stejný práh jako
// výjimka pro hranici regionu v roughLong.js); a vejde se držák.

/**
 * @returns {boolean} true = vjezd ze vzduchu, rampa netřeba (`noRampNeeded`)
 */
export function castingAirEntry({ prms, entryZ, effZMax, rangeCapped, regionCapped, currentX, noseLift, surfAt, holderFits }) {
  if (!prms || prms.stockMode !== 'casting') return false;
  if (rangeCapped || regionCapped) return false;
  if (!(Math.abs(entryZ - effZMax) > 1e-9)) return false;
  const surf = typeof surfAt === 'function' ? surfAt(entryZ) : null;
  if (surf === null || !Number.isFinite(surf)) return false;
  if (surf > currentX - (noseLift || 0) + 0.05) return false;
  return typeof holderFits === 'function' ? !!holderFits(entryZ, currentX) : false;
}
