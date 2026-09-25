// ╔══════════════════════════════════════════════════════════════╗
// ║  ČÁRY, KTERÉ DĚLÍ DÍL NA ÚSEKY (pravidlo 1)                     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Čára zanoření vede od kontury šikmo dolů k OFFSETOVÉ čáře polotovaru
// (Přídavek X/Z polo.). Když na ni vyjede, díl se tam dělí (sectionPlan.js).
// Kulatá a polygon mají vlastní čáry zanoření (interferenceGuides).
//
// Upichovák podélně nehrubuje (`longRoughing: false`, rozhodnutí uživatele
// 25. 9. 2026), takže úseky nemá.

import { getInsert } from '../../inserts/index.js';

/**
 * @returns čáry `{ kind: 'zanoreni', x1, z1, x2, z2 }` pro dělení na úseky
 */
export function sectionGuides({ prms, interferenceGuides }) {
  if (getInsert(prms).longRoughing === false) return [];
  return (interferenceGuides || []).filter(g => g && g.kind === 'zanoreni' && !g._dominated);
}
