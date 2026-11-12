// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – „Auto" u posuvů: zapne a nastaví všechny úpravy posuvu   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 12. 11. 2026: v pravém panelu jsou volby od „Konstantní posuv na
// oblouku (dle rε)" po „Konst. tloušťka třísky" — „šlo by udělat možnost pro
// auto nastavení, kde by se to nastavilo automaticky a aktivovalo". Zaškrtnuté
// Auto zapne všechny volby a dá jim hodnoty, které se dopočítávají samy
// (strop F = 2 × F, F dokončení z Ra a rε destičky); pole hodnot jsou pak
// jen pro čtení, zaškrtávátka ne — jednotlivou volbu jde i s Auto vypnout
// (uživatel 12. 11. 2026: „ať se dají odškrtnout"). Zapne i „Nepřejíždět mezi hrby"
// (ops/sections/humpFirst.js) — volba sedí ve stejném bloku.

import { getInsert } from './inserts/index.js';

/** Hodnoty, které Auto nastaví (0 = dopočítá se z F / destičky). */
export const FEED_AUTO = Object.freeze({
  arcFeedComp: true,
  feedPlungeOn: true, feedPctPlunge: 50,
  finRaOn: true, finRa: 1.6, finRaMaxF: 0,
  feedCornerOn: true, feedPctCorner: 50,
  humpFirst: true,
});

/** Konst. tloušťka třísky jen u plátku s klíčem `chipThinning` (feedTuning.js). */
const chipThinApplies = (prms) => !!getInsert(prms).chipThinning;

/** Zapne Auto a nastaví volby posuvu (mutuje `prms`). */
export function applyFeedAuto(prms) {
  if (!prms) return prms;
  Object.assign(prms, FEED_AUTO);
  if (chipThinApplies(prms)) { prms.chipThinOn = true; prms.chipMaxF = 0; }
  prms.feedAuto = true;
  return prms;
}

/** Jsou volby posuvu zamčené Autem? */
export const feedAutoLocked = (prms) => !!(prms && prms.feedAuto);
