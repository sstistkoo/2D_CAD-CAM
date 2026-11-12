// ╔══════════════════════════════════════════════════════════════╗
// ║  Nájezd kapsy po už vybrané dráze se nejede posuvem (pravidlo 5) ║
// ╚══════════════════════════════════════════════════════════════╝
// První zákrok kapsy (pocketPass.js, `pocketEntry`) najíždí po offsetu
// obrobitelné kontury od horního rohu. Když mezní čáru zanoření, po které ten
// nájezd vede, už předtím vybral řetěz ramp (pravidlo 14), jede nájezd celou
// délku vzduchem pracovním posuvem.
//
// Díl uživatele 12. 11. 2026 (soustruh zleva, PSBNR, ap 4): po opravě řetězu
// od S15 jel nájezd kapsy `G0 X189.995 Z69.150` → `G1 X133.000 Z281.859`,
// tedy 220 mm posuvem po čáře, kterou rampy X186…134 už vybraly.
//
// Začátek nájezdu (celé úseky), který podle modelu zbytku nic neubere, se vynechá.
// K prvnímu bodu, kde materiál začíná, se najede bezpečným rychloposuvem
// (`safeRapidTo` v roughEmit.js, nad konturou).

// Práh „nic nového" na délku: film do 0,05 mm (dráha rampy řetězu a offset
// kontury se liší o setiny — na dílu uživatele 3,6 mm² na 220 mm).
const FILM = 0.05;      // mm²/mm
const MIN_SKIP = 1;     // mm — kratší kus vzduchu nestojí za rychloposuv navíc

/**
 * @param {object} pass  průchod kapsy s `contourLeadIn`
 * @param {Function} newCutArea  (segs) => plocha nového řezu [mm²]
 * @param {boolean} [keepLast=true]  false = smí odpadnout i poslední úsek (dobrání
 *   kapsy: tělo má nulovou délku, dál pokračuje dojezd po kontuře)
 * @returns {boolean} true = začátek nájezdu se zkrátil
 */
export function dropCutLeadInPrefix(pass, newCutArea, keepLast = true) {
  const li = pass && pass.contourLeadIn;
  if (!Array.isArray(li) || li.length < (keepLast ? 2 : 1) || typeof newCutArea !== 'function') return false;
  // Jen CELÉ úseky (poslední zůstane vždy): bod uprostřed úseku může ležet
  // pod povrchem zbytku a sjezd k němu by byl svislé zanoření (zkoušeno:
  // vjezd X129,54 pod vrstvou X130 → svisle 90°).
  let k = 0, skipped = 0;
  for (; k < li.length - (keepLast ? 1 : 0); k++) {
    const s = li[k];
    if (s.type !== 'line' || ![s.x1, s.z1, s.x2, s.z2].every(Number.isFinite)) break;
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (!(newCutArea([s]) <= Math.max(0.01, FILM * len))) break;
    skipped += len;
  }
  if (k === 0 || !(skipped >= MIN_SKIP)) return false;
  if (k < li.length) pass.contourLeadIn = li.slice(k); else delete pass.contourLeadIn;
  return true;
}
