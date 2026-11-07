// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – převod posuvu výchozích nožů v uloženém zásobníku     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Posuv nožů se odhaduje podle plátku, zvlášť hrubování (f) a dokončení
// (fFin) — insertFeeds.js (uživatel 7. 11. 2026). Uložený zásobník má f
// zapsané u každého nože. Tady se JEDNOU (revize zásobníku < FEED_UPGRADE_REV)
// přepíše posuv výchozích nožů, na které uživatel nesahal: táž geometrie i
// jméno jako výchozí nůž a f pořád rovné některému DŘÍVĚJŠÍMU odhadu
// (do revize 4 baseCutData, v revizi 5 paušál 0,8 / 0,25). Upravený posuv
// zůstává. Totéž u S.params a částí programu, které ten nůž drží (toolName).

import { defaultMagazineKnives, sameKnifeGeometry } from './magazineDefaults.js';
import { isoBaseCutData } from './isoToolCatalog.js';
import { _isoMagSlot } from './cam/sim/magSlots.js';

/** Revize zásobníku, od které mají výchozí nože posuv podle plátku. */
export const FEED_UPGRADE_REV = 6;

const num = (v) => parseFloat(v) || 0;
const same = (a, b) => Math.abs(num(a) - num(b)) < 1e-9;

/** Dřívější odhady f nože ve slotu (rev ≤ 4 a rev 5); [] = tvar se neměnil. */
export function legacyKnifeFeeds(slot) {
  const R = num(slot.radius), eps = num(slot.tipAngle);
  if (slot.shape === 'round') {
    const base = isoBaseCutData('round', 0, 0, R).f;
    return [base, R > 7 ? 0.8 : base];
  }
  if (slot.shape === 'polygon') {
    const base = isoBaseCutData('polygon', num(slot.toolLength), eps, R).f;
    return [base, eps >= 80 ? 0.8 : 0.25];
  }
  return [];
}

/**
 * Přepíše f (a doplní fFin) nezměněných výchozích nožů v S.toolMagazine,
 * F v S.params / částech programu, které je drží, a posuv dokončení 0,25
 * z revize 5 vrátí na auto (0). Volat jen pro revizi < FEED_UPGRADE_REV.
 * Vrací počet přepsaných nožů.
 */
export function upgradeDefaultKnifeFeeds(S) {
  const defaults = defaultMagazineKnives().map((rec) => _isoMagSlot(rec, 0));
  const fixFinish = (p) => { if (p && same(p.finishFeed, 0.25)) p.finishFeed = 0; };
  fixFinish(S.params);
  for (const part of S.opParts || []) fixFinish(part.params);
  let n = 0;
  for (const slot of S.toolMagazine || []) {
    const def = defaults.find((d) => d.name === slot.name && sameKnifeGeometry(slot, d));
    if (!def) continue;
    const olds = legacyKnifeFeeds(def);
    const old = olds.find((f) => same(slot.f, f));
    if (old === undefined) continue;
    if (!same(slot.f, def.f) || (def.fFin && !same(slot.fFin, def.fFin))) n++;
    slot.f = def.f;
    if (def.fFin) slot.fFin = def.fFin;
    const fix = (p) => { if (p && p.toolName === slot.name && olds.some((f) => same(p.feed, f))) p.feed = def.f; };
    fix(S.params);
    for (const part of S.opParts || []) fix(part.params);
  }
  return n;
}
