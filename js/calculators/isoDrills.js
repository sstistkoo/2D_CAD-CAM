// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – vrtáky pro 📚 katalog (🧰 Knihovna nástrojů)          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Šroubovité vrtáky pro operaci Vrtání (CAM, nástroj ⌀ — cam/inserts/drill.js).
// Uživatel 7. 10. 2026: vrták má jít vybrat z knihovny, i když ho smaže ze
// zásobníku. Čtyři druhy:
//   HSS-Co 118° — DIN 338 (válcová stopka, do ⌀16) a DIN 345 (kužel Morse
//                 MK2–MK5, nad ⌀16; ⌀3–50)
//   tvrdokov 140° — 5×D s vnitřním chlazením, válcová stopka h6 (⌀3–20)
//   navrtávák 90° / 120° — krátký tuhý HSS-Co pro navrtání středu před vrtákem
//                 (12. 10. 2026); vrták 118° se v 90° důlku vede přesně
// Vyložení = délka šroubovice + kousek k upínači; upínač = kleštinové
// pouzdro ER (⌀ matice) nebo redukční pouzdro Morse. Rozměry a řezné
// podmínky (ocel) jsou ORIENTAČNÍ, jako ostatní rozměry katalogu.
//
// Záznam má tvar záznamu 🧰 Knihovny (stejně jako knifeRecord v
// isoToolCatalog.js) — ✅ Použít / 🔧 Do zásobníku / 🧰 Uložit jdou stejnou cestou.

const r2 = (v) => Math.round(v * 100) / 100;
const cz = (v) => String(v).replace('.', ',');

/** Předvrtání pod metrický závit (hrubý) — jen popisek ve výběru ⌀. */
const TAP_DRILL = { 4.2: 'M5', 5: 'M6', 6.8: 'M8', 8.5: 'M10', 10.2: 'M12', 12: 'M14', 14: 'M16', 17.5: 'M20', 21: 'M24' };

/** Délka šroubovice l2 [mm]: DIN 338 řada N (do ⌀16), DIN 345 (nad ⌀16). */
const HSS_STD_FLUTE = {
  3: 33, 4: 43, 4.2: 43, 5: 52, 6: 57, 6.8: 69, 8: 75, 8.5: 75, 10: 87, 10.2: 87,
  12: 101, 14: 108, 16: 120, 17.5: 130, 18: 130, 20: 140, 22: 155, 25: 160, 30: 175,
};
// Doplněná řada (12. 10. 2026): mezilehlé ⌀ a velké vrtáky s Morse 3–5.
const HSS_FLUTE = {
  ...HSS_STD_FLUTE, 9: 81, 11: 94, 13: 101, 15: 114, 19: 135, 21: 145,
  32: 180, 35: 190, 38: 200, 40: 205, 45: 215, 50: 225,
};
const HM_DIAMETERS = [3, 4, 4.2, 5, 6, 6.8, 8, 8.5, 9, 10, 10.2, 11, 12, 13, 14, 15, 16, 17.5, 18, 19, 20];
const SPOT_DIAMETERS = [3, 4, 5, 6, 8, 10, 12, 16, 20];
/** Vyložení vrtáku = šroubovice + tolik [mm] k upínači (kontrola hloubky — cam/live/liveChecks.js). */
export const DRILL_FLUTE_GAP = 5;
/** Navrtávák je krátký a tuhý: šroubovice ≈ 2×⌀ + 6 mm. */
const spotFlute = (d) => Math.round(2 * d + 6);

export const ISO_DRILL_KINDS = [
  { id: 'hss', label: 'HSS-Co 118°', sigma: 118, vc: 25,
    desc: 'Šroubovitý vrták HSS-Co, vrchol 118° — DIN 338 (válcová stopka) do ⌀16, DIN 345 (kužel Morse) nad ⌀16. Univerzální, snese i méně tuhé upnutí.' },
  { id: 'hm', label: 'tvrdokov 140°', sigma: 140, vc: 80,
    desc: 'Tvrdokovový vrták 5×D s vnitřním chlazením, vrchol 140°, válcová stopka h6. Vyšší řezná rychlost, potřebuje tuhé upnutí a chlazení.' },
  { id: 'spot90', label: 'navrtávák 90°', sigma: 90, vc: 30, spot: true, name: 'Navrtavak 90',
    desc: 'Navrtávák HSS-Co, vrchol 90° — navrtá střed a sražení před vrtákem (vrták 118° se v důlku nevede po hraně). Krátký, tuhý; na jeden zátah bez výjezdů.' },
  { id: 'spot120', label: 'navrtávák 120°', sigma: 120, vc: 30, spot: true, name: 'Navrtavak 120',
    desc: 'Navrtávák HSS-Co, vrchol 120° — před vrtáky 118–140°; důlek je plošší než u 90°, takže vrták nesedne na hranu. Na jeden zátah bez výjezdů.' },
];
const kindOf = (id) => ISO_DRILL_KINDS.find((k) => k.id === id) || ISO_DRILL_KINDS[0];

/** Průměry, které daný druh vrtáku má. */
export function isoDrillDiameters(kindId) {
  if (kindId === 'hm') return HM_DIAMETERS.slice();
  if (kindOf(kindId).spot) return SPOT_DIAMETERS.slice();
  return Object.keys(HSS_FLUTE).map(Number).sort((a, b) => a - b);
}

/**
 * ⌀ HSS vrtáků, ze kterých CAM vybírá PŘEDVRTÁNÍ pro vyvrtávání z plného
 * (ops/borePreDrill.js). Zůstává původní řada — doplněním ⌀ do katalogu se
 * nemá změnit, který vrták CAM zvolí, a tím ani dráhy.
 */
export function isoPreDrillDiameters() {
  return Object.keys(HSS_STD_FLUTE).map(Number).sort((a, b) => a - b);
}

/** Popisek průměru ve výběru: „⌀10,2 · pod M12" (navrtávák bez předvrtání pod závit). */
export function isoDrillLabel(d, kindId) {
  return `⌀${cz(d)}${TAP_DRILL[d] && !kindOf(kindId).spot ? ` · pod ${TAP_DRILL[d]}` : ''}`;
}

/** Upínač podle druhu a ⌀: kleštinové pouzdro ER (⌀ matice) / redukce Morse. */
function holderFor(kindId, d) {
  if (kindId === 'hss' && d > 16) {
    if (d <= 23) return { code: 'MK2', w: 40, l: 80 };
    if (d <= 31.5) return { code: 'MK3', w: 50, l: 90 };
    return d <= 44 ? { code: 'MK4', w: 63, l: 100 } : { code: 'MK5', w: 80, l: 120 };
  }
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
  const kind = kindOf(opts.kind);
  const ds = isoDrillDiameters(kind.id);
  const dDef = kind.spot ? 10 : 20;
  const d = ds.includes(Number(opts.diameter)) ? Number(opts.diameter) : (ds.includes(dDef) ? dDef : ds[ds.length - 1]);
  const L = kind.id === 'hm' ? Math.round(5.5 * d + 12) : (kind.spot ? spotFlute(d) : HSS_FLUTE[d]) + DRILL_FLUTE_GAP;
  const h = holderFor(kind.id, d);
  const f = kind.spot
    ? Math.min(0.2, Math.max(0.04, r2(0.008 * d + 0.02)))
    : kind.id === 'hm'
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
    name: `${kind.name || (kind.id === 'hm' ? 'Vrtak HM' : 'Vrtak HSS')} D${d}`, vbdCode: '', holderCode: h.code,
    desc: kind.desc, iso: { type: 'DR', kind: kind.id, diameter: d, holder: h.code },
    material: '', tipRadius: d / 2, toolAngle: 0, tipAngle: kind.sigma, clearanceAngle: 0,
    vc: kind.vc, f, ap: kind.spot ? 0 : r2(kind.id === 'hm' ? 3 * d : d), tool,   // ap = doporučený záběr Q (navrtávák 0 = na jeden zátah)
  };
}

/** Kolik vrtáků a navrtáváků katalog nabízí (druh × ⌀). */
export function isoDrillCount() {
  return ISO_DRILL_KINDS.reduce((n, k) => n + isoDrillDiameters(k.id).length, 0);
}
