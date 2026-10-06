// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Rozpis řezů soustružení závitu (čistý výpočet)      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Hloubky řezů bere ze STEJNÉ funkce jako CAM (computeThreadPassCuts:
// ubývající přísuv a_k = h·√(k/n), automaticky n = max(4, ⌈h/0,12⌉)
// s prvním řezem ≤ 0,4 mm) – kalkulačka Závity tak ukazuje tytéž
// přísuvy, jaké CAM vygeneruje.
//
// Boční přísuv: nůž jede po boku pod úhlem β = α/2 − 0,5° (modifikovaný
// boční přísuv – zadní břit lehce dořezává). Radiální hloubka a_k se tím
// nemění; start řezu je posunutý v Z o (h − a_k)·tan β od polohy
// posledního (radiálního) řezu. Střídavý: posun střídá strany.

import { computeThreadPassCuts } from './cam/threadHelpers.js';

/** Násobek automatického počtu řezů podle materiálu. */
export const MATERIAL_PASS_FACTOR = { steel: 1, cast: 1, stainless: 1.3, aluminum: 0.8 };

/** Automatický počet řezů (pravidlo CAM, upravené materiálem). */
export function autoPassCount(depth, material = 'steel') {
  if (!(depth > 0)) return 0;
  const n = computeThreadPassCuts(depth, 0).length;
  return Math.max(2, Math.round(n * (MATERIAL_PASS_FACTOR[material] ?? 1)));
}

/** Úhel bočního přísuvu [°] pro úhel profilu α (60° → 29,5°, Tr 30° → 14,5°). */
export function flankInfeedAngle(profileAngle) {
  return Math.max(0, profileAngle / 2 - 0.5);
}

/**
 * Rozpis řezů.
 * @param {number} depth - radiální hloubka závitu h [mm]
 * @param {number} n - počet řezů (bez jiskřicího)
 * @param {{method?:'radial'|'flank'|'alt', profileAngle?:number, start?:number|null, internal?:boolean}} o
 *   start – Ø, ze kterého se řeže (vnější: velký Ø d, vnitřní: malý Ø D1); null = bez X
 * @returns {{i:number, cut:number, depth:number, x:number|null, z:number}[]}
 *   cut – přísuv řezu (radiálně), depth – součet, x – Ø pro program,
 *   z – posun startu v Z (boční ≥ 0 po boku, střídavý ± podle strany)
 */
export function threadPasses(depth, n, { method = 'radial', profileAngle = 60, start = null, internal = false } = {}) {
  if (!(depth > 0) || !(n >= 1)) return [];
  const cuts = computeThreadPassCuts(depth, Math.round(n));
  const tb = Math.tan(flankInfeedAngle(profileAngle) * Math.PI / 180);
  let prev = 0;
  return cuts.map((a, k) => {
    const i = k + 1, cut = a - prev;
    prev = a;
    const rest = (depth - a) * tb;
    const z = method === 'radial' ? 0 : method === 'flank' ? rest : (i % 2 === 1 ? -rest : rest);
    const x = start > 0 ? start + (internal ? 2 * a : -2 * a) : null;
    return { i, cut, depth: a, x, z: z === 0 ? 0 : z };
  });
}
