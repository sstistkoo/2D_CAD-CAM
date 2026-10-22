// ZÁVITNÍK A NAVRTÁVÁK pro odvozené operace děr z výkresu (liveHoleExtras.js)
// ze 🔧 Zásobníku a řezné podmínky (uživatel 22. 10. 2026).
//
// Závitník = slot `shape: 'tap'`, Ø = 2 · radius (jmenovitý Ø závitu),
// `pitch` = stoupání, vc [m/min]. n = Vc·1000 / (π·Ø), F = P · n [mm/min]
// (posuv MUSÍ sedět na stoupání — žádné zaokrouhlení posuvu, jen otáček).
// Navrtávák = slot `shape: 'drill'` s „navrt" v názvu nebo vrcholem ≤ 100°
// (běžný vrták 118°/140°). Vybere se nejmenší s Ø ≥ Ø sražení (spotD);
// hloubka navrtání se přepočte na jeho vrchol σ. Chybí-li nástroj, nabídne
// se z 📚 katalogu (isoTaps.js / isoDrills.js navrtávák 90°).
import { liveOpOn } from './liveModel.js';
import { spotDepth } from './liveHoleExtras.js';
import { buildIsoTap, threadByName } from '../../isoTaps.js';
import { buildIsoDrill, isoDrillDiameters } from '../../isoDrills.js';

const D_TOL = 0.01;
const r3 = v => +(+v).toFixed(3);

/** Je slot zásobníku navrtávák (ne obyčejný vrták)? */
export function isSpotSlot(s) {
  if (!s || s.shape !== 'drill') return false;
  const tip = parseFloat(s.tipAngle);
  return /navrt|spot/i.test(String(s.name || '')) || (Number.isFinite(tip) && tip <= 100);
}

/** Závitníky v zásobníku: [{ slot, name, D, pitch, vc }] podle T. */
export function magazineTaps(magazine) {
  return (magazine || [])
    .filter(s => s && s.shape === 'tap' && parseFloat(s.radius) > 0)
    .map(s => ({ slot: s.slot, name: s.name, D: r3(2 * parseFloat(s.radius)), pitch: parseFloat(s.pitch) || 0, vc: parseFloat(s.vc) || 8 }))
    .sort((a, b) => a.slot - b.slot);
}

/** Navrtáváky v zásobníku: [{ slot, name, D, angle, vc, f }] podle T. */
export function magazineSpots(magazine) {
  return (magazine || [])
    .filter(s => isSpotSlot(s) && parseFloat(s.radius) > 0)
    .map(s => ({ slot: s.slot, name: s.name, D: r3(2 * parseFloat(s.radius)), angle: parseFloat(s.tipAngle) || 90, vc: parseFloat(s.vc) || 30, f: parseFloat(s.f) || 0.08 }))
    .sort((a, b) => a.slot - b.slot);
}

/** Závitník na Ø a stoupání operace, nebo null. */
export function pickTap(taps, op) {
  return taps.find(t => Math.abs(t.D - op.holeD) <= D_TOL && Math.abs(t.pitch - op.pitch) <= 1e-3) || null;
}

/** Nejmenší navrtávák s Ø ≥ Ø sražení, nebo null. */
export function pickSpot(spots, op) {
  const need = op.spotD || op.holeD;
  return spots.filter(s => s.D >= need - D_TOL).sort((a, b) => a.D - b.D || a.slot - b.slot)[0] || null;
}

/** Otáčky a posuv závitníku: F = P · n. */
export function tapCutData(tap) {
  const rpm = Math.max(1, Math.round(tap.vc * 1000 / (Math.PI * tap.D)));
  return { rpm, feed: r3(tap.pitch * rpm) };
}

/** Ø navrtáváku z 📚 katalogu pro Ø sražení (nejmenší ≥), nebo null. */
export function catalogSpotD(spotD) {
  return isoDrillDiameters('spot90').find(d => d >= spotD - D_TOL) ?? null;
}

/** Volné číslo T (žádný slot zásobníku ho nemá). */
function freeT(magazine) {
  return Math.max(0, ...(magazine || []).map(s => s.slot || 0)) + 1;
}

/**
 * Doplní závitník / navrtávák a řezné podmínky do odvozených operací
 * (vybraných, nezměněných ručně). Vrací { ops, filled, missing }
 * (missing: { op, kind: 'tap', thread, D } / { op, kind: 'spot', D }).
 */
export function autoTapSpotTools(ops, magazine) {
  const taps = magazineTaps(magazine), spots = magazineSpots(magazine);
  const taken = new Set((magazine || []).map(s => s.slot));
  const filled = [], missing = [];
  const out = ops.map((op, i) => {
    if (op.kind !== 'drill' || !op.role || !liveOpOn(op) || op.autoTool === false) return op;
    if (op.role === 'tap') {
      const tap = pickTap(taps, op);
      if (!tap) {
        missing.push({ op: i, kind: 'tap', thread: op.thread && op.thread.name, D: op.holeD });
        // T nesmí volat jiný nástroj zásobníku.
        return taken.has(op.toolNo) ? { ...op, toolNo: freeT(magazine) } : { ...op, feed: r3(op.pitch * op.rpm) };
      }
      filled.push({ op: i, tool: tap });
      return { ...op, toolNo: tap.slot, toolName: tap.name, ...tapCutData(tap) };
    }
    const sp = pickSpot(spots, op);
    if (!sp) {
      missing.push({ op: i, kind: 'spot', D: catalogSpotD(op.spotD || op.holeD) });
      return taken.has(op.toolNo) ? { ...op, toolNo: freeT(magazine) } : op;
    }
    filled.push({ op: i, tool: sp });
    const rpm = Math.max(1, Math.round(sp.vc * 1000 / (Math.PI * sp.D)));
    return { ...op, toolNo: sp.slot, toolName: sp.name, rpm, feed: Math.max(1, Math.round(sp.f * rpm)), spotAngle: sp.angle, depth: spotDepth(op.spotD || op.holeD, sp.angle) };
  });
  return { ops: out, filled, missing };
}

/** Text o nástroji odvozené operace pro záložku Vrtání. */
export function tapSpotToolText(op, magazine) {
  const cut = `${op.rpm} ot/min · F${op.feed} mm/min`;
  if (op.role === 'tap') {
    const tap = pickTap(magazineTaps(magazine), op);
    const nm = op.thread ? op.thread.name : `Ø${op.holeD}`;
    if (tap && tap.slot === op.toolNo) return `T${tap.slot} ${tap.name} · ${cut} (F = P${op.pitch} · n)`;
    if (tap) return `T${tap.slot} ${tap.name} (vybere se při vrtání)`;
    return `⚠ závitník ${nm}×${op.pitch} není v 🔧 Zásobníku — přidej ho z 📚 → Závitníky · teď T${op.toolNo} ${op.toolName || ''}`;
  }
  const sp = pickSpot(magazineSpots(magazine), op);
  if (sp && sp.slot === op.toolNo) return `T${sp.slot} ${sp.name} · ${cut} · sražení Ø${op.spotD} hl. ${op.depth}`;
  if (sp) return `T${sp.slot} ${sp.name} (vybere se při vrtání)`;
  return `⚠ navrtávák Ø ≥ ${op.spotD || op.holeD} není v 🔧 Zásobníku — přidej ho z 📚 → Vrtáky (navrtávák 90°) · teď T${op.toolNo} ${op.toolName || ''}`;
}

/**
 * Přidá do zásobníku chybějící závitníky (HSS-E B, každý závit jednou)
 * a navrtáváky 90° (každý Ø jednou) z 📚 katalogu. `missing` z autoTapSpotTools,
 * `makeSlot(rec, T)` = magSlots._isoMagSlot. Vrací přidané sloty.
 */
export function addCatalogTapsSpots(magazine, missing, makeSlot) {
  const added = [];
  const push = rec => {
    const slot = makeSlot(rec, freeT(magazine));
    magazine.push(slot);
    added.push(slot);
  };
  [...new Set(missing.filter(m => m.kind === 'tap' && threadByName(m.thread)).map(m => m.thread))].forEach(name => {
    const t = threadByName(name);
    if (!magazineTaps(magazine).some(x => Math.abs(x.D - t.d) <= D_TOL && Math.abs(x.pitch - t.pitch) <= 1e-3)) push(buildIsoTap({ kind: 'hsse-b', thread: name }));
  });
  [...new Set(missing.filter(m => m.kind === 'spot' && m.D > 0).map(m => m.D))].forEach(d => {
    if (!magazineSpots(magazine).some(x => Math.abs(x.D - d) <= D_TOL)) push(buildIsoDrill({ kind: 'spot90', diameter: d }));
  });
  return added;
}
