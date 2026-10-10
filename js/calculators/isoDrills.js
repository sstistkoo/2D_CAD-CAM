// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – vrtáky pro 📚 katalog (🧰 Knihovna nástrojů)          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Šroubovité vrtáky pro operaci Vrtání (CAM, nástroj ⌀ — cam/inserts/drill.js).
// Uživatel 7. 10. 2026: vrták má jít vybrat z knihovny, i když ho smaže ze
// zásobníku. Dva druhy:
//   HSS-Co 118° — DIN 338 (válcová stopka, do ⌀16) a DIN 345 (kužel Morse, nad ⌀16)
//   tvrdokov 140° — 5×D s vnitřním chlazením, válcová stopka h6 (⌀3–20)
// Vyložení = délka šroubovice + kousek k upínači; upínač = kleštinové
// pouzdro ER (⌀ matice) nebo redukční pouzdro Morse. Rozměry a řezné
// podmínky (ocel) jsou ORIENTAČNÍ, jako ostatní rozměry katalogu.
//
// Záznam má tvar záznamu 🧰 Knihovny (stejně jako knifeRecord v
// isoToolCatalog.js) — ✅ Použít / 🔧 Do zásobníku / 🧰 Uložit jdou stejnou cestou.

const r2 = (v) => Math.round(v * 100) / 100;
const cz = (v) => String(v).replace('.', ',');

/** Předvrtání pod metrický závit (hrubý) — jen popisek ve výběru ⌀. */
const TAP_DRILL = { 4.2: 'M5', 5: 'M6', 6.8: 'M8', 8.5: 'M10', 10.2: 'M12', 14: 'M16', 17.5: 'M20' };

/** Délka šroubovice l2 [mm]: DIN 338 řada N (do ⌀16), DIN 345 (nad ⌀16). */
const HSS_FLUTE = {
  3: 33, 4: 43, 4.2: 43, 5: 52, 6: 57, 6.8: 69, 8: 75, 8.5: 75, 10: 87, 10.2: 87,
  12: 101, 14: 108, 16: 120, 17.5: 130, 18: 130, 20: 140, 22: 155, 25: 160, 30: 175,
};
const HM_DIAMETERS = [3, 4, 4.2, 5, 6, 6.8, 8, 8.5, 10, 10.2, 12, 14, 16, 17.5, 18, 20];

export const ISO_DRILL_KINDS = [
  { id: 'hss', label: 'HSS-Co 118°', sigma: 118, vc: 25,
    desc: 'Šroubovitý vrták HSS-Co, vrchol 118° — DIN 338 (válcová stopka) do ⌀16, DIN 345 (kužel Morse) nad ⌀16. Univerzální, snese i méně tuhé upnutí.' },
  { id: 'hm', label: 'tvrdokov 140°', sigma: 140, vc: 80,
    desc: 'Tvrdokovový vrták 5×D s vnitřním chlazením, vrchol 140°, válcová stopka h6. Vyšší řezná rychlost, potřebuje tuhé upnutí a chlazení.' },
];

/** Průměry, které daný druh vrtáku má. */
export function isoDrillDiameters(kindId) {
  return kindId === 'hm' ? HM_DIAMETERS.slice() : Object.keys(HSS_FLUTE).map(Number).sort((a, b) => a - b);
}

/** Popisek průměru ve výběru: „⌀10,2 · pod M12". */
export function isoDrillLabel(d) {
  return `⌀${cz(d)}${TAP_DRILL[d] ? ` · pod ${TAP_DRILL[d]}` : ''}`;
}

/** Upínač podle druhu a ⌀: kleštinové pouzdro ER (⌀ matice) / redukce Morse. */
function holderFor(kindId, d) {
  if (kindId === 'hss' && d > 16) return d <= 23 ? { code: 'MK2', w: 40, l: 80 } : { code: 'MK3', w: 50, l: 90 };
  if (d <= 10) return { code: 'ER16', w: 32, l: 40 };
  if (d <= 16) return { code: 'ER25', w: 42, l: 50 };
  return { code: 'ER32', w: 50, l: 60 };
}

/**
 * Vrták jako záznam knihovny.
 * @param {{kind?:'hss'|'hm', diameter?:number}} [opts]
 * @returns {Object} záznam s `tool` (CAM_TOOL_KEYS) a `iso` = zvolené volby
 */
export function buildIsoDrill(opts = {}) {
  const kind = ISO_DRILL_KINDS.find((k) => k.id === opts.kind) || ISO_DRILL_KINDS[0];
  const ds = isoDrillDiameters(kind.id);
  const d = ds.includes(Number(opts.diameter)) ? Number(opts.diameter) : (ds.includes(20) ? 20 : ds[ds.length - 1]);
  const L = kind.id === 'hm' ? Math.round(5.5 * d + 12) : HSS_FLUTE[d] + 5;
  const h = holderFor(kind.id, d);
  const f = kind.id === 'hm'
    ? Math.min(0.35, Math.max(0.06, r2(0.015 * d + 0.03)))
    : Math.min(0.35, Math.max(0.05, r2(0.012 * d + 0.02)));
  const tool = {
    toolShape: 'drill', toolLength: L, toolAngle: 0, toolTipAngle: kind.sigma, toolRadius: d / 2,
    toolTipFlat: 0.1, toolTipMirror: false, toolVbdCode: '', toolClearanceAngle: 0,
    holderLength: h.l, holderWidth: h.w, holderHand: 'R', holderProfile: null,
    knifeAngle: 270, holderInflate: 0, holderInflateAll: false, toolInternal: false,
  };
  // Jméno bez diakritiky — jde do G-kódu (T="…").
  return {
    name: `Vrtak ${kind.id === 'hm' ? 'HM' : 'HSS'} D${d}`, vbdCode: '', holderCode: h.code,
    desc: kind.desc, iso: { type: 'DR', kind: kind.id, diameter: d, holder: h.code },
    material: '', tipRadius: d / 2, toolAngle: 0, tipAngle: kind.sigma, clearanceAngle: 0,
    vc: kind.vc, f, ap: r2(kind.id === 'hm' ? 3 * d : d), tool,   // ap = doporučený záběr Q
  };
}

/** Kolik vrtáků katalog nabízí (druh × ⌀). */
export function isoDrillCount() {
  return ISO_DRILL_KINDS.reduce((n, k) => n + isoDrillDiameters(k.id).length, 0);
}
