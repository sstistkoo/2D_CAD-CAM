// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – výchozí nože 🔧 Zásobníku = ISO nože z katalogu      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 6. 10. 2026: místo provizorních nožů (plátek + obdélník /
// nakreslený obrys) mají být na začátku zásobníku skutečné nože s držákem.
// Každý dřívější výchozí nůž (cam/camToolPicker.js DEFAULT_TOOL_MAGAZINE)
// má náhradu ve STEJNÉ roli a na stejném místě (T1–T6):
//
//   Hrub čelo  → PSKNR 2525M12 + SNMG 120408   (táž geometrie: čtverec, κr 75° k čelu)
//   Hrubovaci  → PSBNR 2525M12 + SNMG 120408   (táž geometrie: čtverec natočený 15°, κr 75°)
//   Šlicht     → PDJNR 2525M15 + DNMG 150604   (dokončení, profil)
//   Kulaty     → SRSCR 2525M20 + RCMT 2006M0   (R10 jako dřív, dojede k čelu)
//   Zavit      → SER 2525M16 + 16ER AG60
//   Upichovak  → MGEHR 2525-5 + MGMN 500-M     (š 5, R 0,8 jako dřív)
//
// Za nimi (bez staré předlohy) vrták HSS ⌀20 z 📚 katalogu (isoDrills.js)
// pro operaci Vrtání (7. 10. 2026).
//
// DEFAULT_TOOL_MAGAZINE zůstává beze změny: stojí na něm měření
// (scripts/cam_sweep.mjs bere obrys „Hrubovaci") a podle něj se poznají
// staré výchozí nože v uloženém zásobníku (migrateLegacyMagazine).

import { DEFAULT_TOOL_MAGAZINE as LEGACY_MAGAZINE } from './cam/camToolPicker.js';
import { buildIsoKnife } from './isoToolCatalog.js';
import { buildIsoDrill } from './isoDrills.js';

/**
 * Revize výchozí sady. Uložený zásobník si pamatuje, kterou už dostal
 * (`magazineDefaultsRev` ve stavu CAM); nože přidané v novější revizi se mu
 * přidají JEDNOU (na konec) — smazaný se pak už nevrací.
 *   1 — ISO nože místo provizorních (6. 10. 2026)
 *   2 — PSBNR 2525M12 jako hrubovací (T2 místo PCLNR)
 *   3 — vrták ⌀20 pro operaci Vrtání (7. 10. 2026)
 */
export const MAGAZINE_DEFAULTS_REV = 3;
export const DEFAULTS_ADDED_IN_REV = { 2: ['SB'], 3: ['DR'] };

/** Nože výchozí sady přidané po revizi `rev` (záznamy knihovny). */
export function isoDefaultsAddedSince(rev) {
  const ids = [];
  for (let r = (rev || 0) + 1; r <= MAGAZINE_DEFAULTS_REV; r++) ids.push(...(DEFAULTS_ADDED_IN_REV[r] || []));
  const knives = defaultMagazineKnives();
  return [...ISO_DEFAULT_SET, ...EXTRA_DEFAULT_SET].map((s, i) => (ids.includes(s.id) ? knives[i] : null)).filter(Boolean);
}

/** Výchozí nože MIMO ISO katalog držáků (bez staré předlohy) — za ISO noži. */
export const EXTRA_DEFAULT_SET = [
  { id: 'DR', opts: { kind: 'hss', diameter: 20 }, role: 'vrtání v ose — HSS ⌀20 118° (DIN 345, pouzdro MK2)' },
];

/** Celá výchozí sada zásobníku: ISO nože (T1–T6) + vrták (T7) — vrták je
 *  týž záznam jako v 📚 katalogu (Vrtáky), takže smazaný jde vrátit odtud. */
export function defaultMagazineKnives() {
  return [...isoDefaultKnives(), ...EXTRA_DEFAULT_SET.map((s) => buildIsoDrill(s.opts))];
}

/**
 * VÝCHOZÍ NŮŽ TVARU — tlačítka ● ■ ▮ ▽ ⌀ (uživatel 7. 10. 2026: „přednastav
 * kulatý SRSCR2525M20, polygon PSBNR2525M12, upichovák MGEHR2525-5, závit
 * SER2525M16 a na vrtání Vrtak D20"). Tlačítko dřív měnilo jen tvar a geometrii
 * doplnilo z paměti sezení nebo z předvolby tvaru — kulatá předvolbu neměla,
 * takže po vrtáku zdědila jeho vyložení 145 mm (náhradní držák pak seděl
 * 145 mm nad destičkou a nehlídal se), úhel 118° a pouzdro 40 × 80 bez obrysu.
 * Klíč = tvar, hodnota = `id` z ISO_DEFAULT_SET / EXTRA_DEFAULT_SET.
 */
export const SHAPE_PRESET_KNIFE_ID = { round: 'RS', polygon: 'SB', parting: 'GR', threading: 'TH', drill: 'DR' };

/** Záznam knihovny výchozího nože pro tvar destičky; null = tvar bez předvolby. */
export function presetKnifeForShape(shape) {
  const id = SHAPE_PRESET_KNIFE_ID[shape];
  const k = id ? [...ISO_DEFAULT_SET, ...EXTRA_DEFAULT_SET].findIndex((s) => s.id === id) : -1;
  return k >= 0 ? defaultMagazineKnives()[k] : null;
}

/** Index slotu zásobníku s výchozím nožem tvaru (stejné jméno i tvar); −1 = v zásobníku není. */
export function presetSlotIndex(magazine, shape) {
  const rec = presetKnifeForShape(shape);
  if (!rec || !Array.isArray(magazine)) return -1;
  return magazine.findIndex((s) => s && s.name === rec.name && (s.shape || 'round') === shape);
}

/** Výchozí nože v pořadí obrábění; `legacy` = jméno nože, který nahrazují. */
export const ISO_DEFAULT_SET = [
  { id: 'SK', opts: { size: '12', radius: '08' }, legacy: 'Hrub čelo', role: 'čelní hrubování' },
  // Hrubování: čtverec natočený 15° (κr 75°) — přání uživatele 6. 10. 2026,
  // táž geometrie jako dřívější „Hrubovaci". Do 6. 10. odpoledne tu byl PCLNR.
  { id: 'SB', opts: { size: '12', radius: '08' }, legacy: 'Hrubovaci', role: 'podélné hrubování, čtverec natočený 15° (κr 75°)' },
  { id: 'DJ', opts: { size: '15', radius: '04' }, legacy: 'Šlicht', role: 'dokončení a profil' },
  { id: 'RS', opts: { size: '20' }, legacy: 'Kulaty', role: 'kulatá R10, dojede k čelu' },
  { id: 'TH', opts: { thread: 'AG60' }, legacy: 'Zavit', role: 'závit 60°' },
  { id: 'GR', opts: { width: 5 }, legacy: 'Upichovak', role: 'upichování / zapichování 5 mm' },
];

/**
 * Výchozí nože jako záznamy knihovny (dřík 25×25). Vždy pravá ruka —
 * jména se pak nemění se stranou hrubování (CAM levou stranu zrcadlí sám).
 * Do zásobníku jdou jen když je PRÁZDNÝ (první spuštění, reset) — smazaný
 * nůž se sám nevrací (camSimulator.js, uživatel 6. 10. 2026).
 */
export function isoDefaultKnives() {
  return ISO_DEFAULT_SET.map((s) => buildIsoKnife(s.id, { ...s.opts, shank: '2525', hand: 'R' }));
}

const GEOM_KEYS = ['radius', 'tipAngle', 'toolAngle', 'toolLength', 'clearanceAngle', 'holderWidth', 'holderLength'];
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const profileKey = (p) => JSON.stringify(p
  ? ['sideA', 'sideB'].map((k) => (p[k] || []).map((q) => [Math.round(num(q.x) * 1000), Math.round(num(q.z) * 1000)]))
  : null);

/** Táž geometrie nože (tvar, destička, držák vč. obrysu) — řezné podmínky, ruka a jméno se nesrovnávají. */
export function sameKnifeGeometry(a, b) {
  if (!a || !b || (a.shape || 'round') !== (b.shape || 'round')) return false;
  if (GEOM_KEYS.some((k) => Math.abs(num(a[k]) - num(b[k])) > 1e-6)) return false;
  if (Math.abs(num(a.knifeAngle, 270) - num(b.knifeAngle, 270)) > 1e-6) return false;
  return profileKey(a.holderProfile) === profileKey(b.holderProfile);
}

/**
 * Nahradí v uloženém zásobníku staré výchozí nože ISO noži — NA MÍSTĚ
 * (stejná pozice i číslo T). Jen ty, které uživatel nezměnil (táž geometrie
 * jako DEFAULT_TOOL_MAGAZINE); upravený nůž je už jeho a zůstane. Shodná
 * kopie nového nože jinde v zásobníku (např. z 📚 katalogu) se odebere —
 * odkazy na ni přejdou na nůž, který ji nahradil.
 *
 * @param {Object[]} magazine  sloty zásobníku (nemění se)
 * @param {(rec:Object, slotNum:number) => Object} toSlot  záznam katalogu → slot
 * @returns {{ magazine:Object[], map:(number|null)[], replaced:number[], dropped:number }}
 *   map[i] = nový index starého slotu i; replaced = nové indexy nahrazených
 */
export function migrateLegacyMagazine(magazine, toSlot) {
  const knives = isoDefaultKnives();
  const out = [], map = [], replaced = [];
  magazine.forEach((slot, i) => {
    const li = LEGACY_MAGAZINE.findIndex((d) => d.name === slot.name);
    if (li >= 0 && knives[li] && sameKnifeGeometry(slot, LEGACY_MAGAZINE[li])) {
      out.push(toSlot(knives[li], slot.slot));
      replaced.push(out.length - 1);
    } else {
      out.push(slot);
    }
    map[i] = out.length - 1;
  });
  // Shodné kopie nových nožů jinde v zásobníku → pryč, odkazy na náhradu.
  const keep = [], newIdx = [];
  out.forEach((slot, k) => {
    const twin = replaced.includes(k) ? -1
      : replaced.find((r) => out[r].name === slot.name && sameKnifeGeometry(out[r], slot));
    newIdx[k] = twin === undefined || twin === -1 ? null : twin;
    if (newIdx[k] === null) keep.push(k);
  });
  const pos = new Map(keep.map((k, j) => [k, j]));
  const finalIdx = (k) => pos.get(newIdx[k] === null ? k : newIdx[k]);
  return {
    magazine: keep.map((k) => out[k]),
    map: map.map(finalIdx),
    replaced: replaced.map((r) => pos.get(r)),
    dropped: out.length - keep.length,
  };
}
