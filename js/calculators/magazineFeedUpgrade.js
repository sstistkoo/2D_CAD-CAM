// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – převod posuvu výchozích nožů v uloženém zásobníku     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 7. 11. 2026: „přednastav u kulatého nad 7 mm a polygon plátku
// hrubování na 0,8 a na hotovo dej 0,25" + „přepsat výchozí nože". Nový
// odhad posuvu je v isoToolCatalog.js (cutData); uložený zásobník má f
// zapsané u každého nože. Tady se JEDNOU (revize zásobníku < FEED_UPGRADE_REV)
// přepíše f výchozích nožů, na které uživatel nesahal: táž geometrie i jméno
// jako výchozí nůž a f pořád rovné PŮVODNÍMU odhadu. Upravený posuv zůstává.
// Totéž u S.params a částí programu, které ten nůž drží (toolName) se starým F.

import { defaultMagazineKnives, sameKnifeGeometry } from './magazineDefaults.js';
import { isoBaseCutData } from './isoToolCatalog.js';
import { _isoMagSlot } from './cam/sim/magSlots.js';

/** Revize zásobníku, od které mají výchozí nože nový posuv. */
export const FEED_UPGRADE_REV = 5;

const same = (a, b) => Math.abs((parseFloat(a) || 0) - (parseFloat(b) || 0)) < 1e-9;

/** Původní (do 7. 11. 2026) odhad f nože ve slotu; null = tvar se neměnil. */
export function legacyKnifeFeed(slot) {
  const R = parseFloat(slot.radius) || 0;
  if (slot.shape === 'round') return isoBaseCutData('round', 0, 0, R).f;
  if (slot.shape === 'polygon') return isoBaseCutData('polygon', parseFloat(slot.toolLength) || 0, parseFloat(slot.tipAngle) || 0, R).f;
  return null;
}

/**
 * Přepíše f nezměněných výchozích nožů v S.toolMagazine (a F v S.params /
 * částech programu, které je drží). Volat jen pro zásobník s revizí
 * < FEED_UPGRADE_REV. Vrací počet přepsaných nožů.
 */
export function upgradeDefaultKnifeFeeds(S) {
  const defaults = defaultMagazineKnives().map((rec) => _isoMagSlot(rec, 0));
  let n = 0;
  for (const slot of S.toolMagazine || []) {
    const def = defaults.find((d) => d.name === slot.name && sameKnifeGeometry(slot, d));
    if (!def) continue;
    const old = legacyKnifeFeed(def);
    if (old === null || same(def.f, old) || !same(slot.f, old)) continue;
    slot.f = def.f;
    n++;
    const fix = (p) => { if (p && p.toolName === slot.name && same(p.feed, old)) p.feed = def.f; };
    fix(S.params);
    for (const part of S.opParts || []) fix(part.params);
  }
  return n;
}
