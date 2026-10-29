// VRTÁK PRO DÍRY MIMO OSU ze 🔧 Zásobníku podle Ø díry a předvyplnění
// operace (uživatel 20. 10. 2026: „aby se vybral nástroj vrták a nemusel
// jsem to překlikávat a předvyplnilo se mi to").
//
// Vrták v zásobníku = slot `shape: 'drill'`, Ø = 2 · radius, řezné podmínky
// slotu vc [m/min] a f [mm/ot]. Poháněný vrták: otáčky n = Vc·1000 / (π·Ø),
// posuv F [mm/min] = f · n. Předvyplňuje se jen operace, které uživatel
// nástroj ani řezné podmínky ručně nezměnil (`autoTool !== false`).
// Hloubka, Q, tříska, prodleva a bezp. vzdálenost patří operaci (jedno místo:
// řádek díry v záložce Vrtání = formulář 🛠 Operace). Dřív se Q / prodleva /
// bezp. vzd. kopírovaly z polí středové díry v ose a přepisovaly ruční
// zadání, hloubka ne — dvě nesedící nastavení (uživatel 29. 10. 2026).
import { liveOpOn, liveKindOf } from './liveModel.js';
import { buildIsoDrill, isoDrillDiameters } from '../../isoDrills.js';
import { autoMillTools, millToolText } from './liveMillTools.js';
import { autoTapSpotTools, tapSpotToolText, isSpotSlot } from './liveTapTools.js';
import { syncDerivedEnabled, mainIndexOf } from './liveHoleExtras.js';

const D_TOL = 0.01;   // vrták „na Ø díry" [mm]

/** Vrtáky v zásobníku: [{ slot, name, D, vc, f }] seřazené podle T (bez navrtáváků). */
export function magazineDrills(magazine) {
  return (magazine || [])
    .filter(s => s && s.shape === 'drill' && parseFloat(s.radius) > 0 && !isSpotSlot(s))
    .map(s => ({ slot: s.slot, name: s.name, D: +(2 * parseFloat(s.radius)).toFixed(3), vc: parseFloat(s.vc) || 25, f: parseFloat(s.f) || 0.1 }))
    .sort((a, b) => a.slot - b.slot);
}

/** Vrták na Ø díry (první v pořadí T), jinak null; `near` = nejbližší jiný. */
export function pickDrill(drills, D) {
  const exact = drills.find(d => Math.abs(d.D - D) <= D_TOL) || null;
  let near = null;
  if (!exact) drills.forEach(d => { if (!near || Math.abs(d.D - D) < Math.abs(near.D - D)) near = d; });
  return { drill: exact, near };
}

/** Otáčky a posuv poháněného vrtáku z Vc a f slotu. */
export function drillCutData(drill) {
  const rpm = Math.max(1, Math.round(drill.vc * 1000 / (Math.PI * drill.D)));
  return { rpm, feed: Math.max(1, Math.round(drill.f * rpm)) };
}

/**
 * Doplní vrták a řezné podmínky do operací vrtání (jen vybraných
 * a nezměněných ručně). Vrací nové pole operací a seznam doplněných
 * { op: index, drill } / chybějících { op, D, near }.
 */
export function autoDrillTools(ops, magazine) {
  const drills = magazineDrills(magazine);
  const filled = [], missing = [];
  const out = ops.map((op, i) => {
    if (op.kind !== 'drill' || op.role || !liveOpOn(op) || op.autoTool === false) return op;
    const { drill, near } = pickDrill(drills, op.holeD);
    if (!drill) { missing.push({ op: i, D: op.holeD, near }); return op; }
    filled.push({ op: i, drill });
    return { ...op, toolNo: drill.slot, toolName: drill.name, ...drillCutData(drill) };
  });
  // Frézovací operace: fréza ze zásobníku (liveMillTools.js, missing s kind 'mill').
  const m = autoMillTools(out, magazine);
  // Navrtání a závity (role 'spot' / 'tap'): navrtávák a závitník (liveTapTools.js).
  const t = autoTapSpotTools(m.ops, magazine);
  return { ops: t.ops, filled: [...filled, ...m.filled, ...t.filled], missing: [...missing, ...m.missing, ...t.missing] };
}

/** Text o vrtáku operace pro záložku Vrtání. */
export function drillToolText(op, magazine) {
  if (op.kind !== 'drill') return millToolText(op, magazine);
  if (op.role) return tapSpotToolText(op, magazine);
  const { drill, near } = pickDrill(magazineDrills(magazine), op.holeD);
  const cut = `${op.rpm} ot/min · F${op.feed} mm/min`;
  if (drill && drill.slot === op.toolNo) return `T${drill.slot} ${drill.name} · ${cut}`;
  if (drill) return `T${drill.slot} ${drill.name} (vybere se při vrtání)`;
  return `⚠ vrták Ø${op.holeD} není v 🔧 Zásobníku${near ? ` (nejbližší Ø${near.D} T${near.slot})` : ''} — přidej ho z 🧰 Knihovna → 📚 → Vrtáky · teď T${op.toolNo} ${op.toolName || ''}`;
}

/**
 * Klepnutí na skupinu děr (operaci) `oi` v pohledu na čelo: když se vrtá
 * všechno, vybere se JEN tahle skupina („kliknu na díry, které chci"); jinak
 * se přepne. `plain` = obyčejné přepnutí (zaškrtávátko v záložce Vrtání).
 * Vrtání a frézování jsou oddělené záložky — „jen tahle skupina" se týká
 * jen operací téhož druhu (liveKindOf), druhý druh zůstane, jak je.
 */
export function toggleLiveGroup(ops, oi, plain = false) {
  // Navrtání / závit se vybírá s hlavní dírou (liveHoleExtras.js).
  oi = mainIndexOf(ops, oi);
  const kind = liveKindOf(ops[oi]);
  const same = o => liveKindOf(o) === kind;
  const on = ops.map(liveOpOn);
  const mains = ops.filter(o => !o.role && same(o)).length;
  const only = !plain && mains > 1 && ops.every(o => o.role || !same(o) || liveOpOn(o));
  return syncDerivedEnabled(ops.map((op, i) => (op.role || !same(op) ? op : { ...op, enabled: only ? i === oi : (i === oi ? !on[i] : on[i]) })));
}

/**
 * Záznam vrtáku HSS z 📚 katalogu na Ø díry: přesně z katalogu, jinak podle
 * nejbližšího Ø katalogu (délka, upínač) s Ø díry — katalog nemá každý Ø
 * (např. 7: nález uživatele 20. 10. 2026, vrták se nenabídl). null = Ø ≤ 0.
 */
export function catalogDrillRec(D) {
  const ds = isoDrillDiameters('hss');
  if (!(D > 0) || !ds.length) return null;
  const exact = ds.find(d => Math.abs(d - D) <= D_TOL);
  const near = exact ?? ds.reduce((b, d) => (Math.abs(d - D) < Math.abs(b - D) ? d : b), ds[0]);
  const rec = buildIsoDrill({ kind: 'hss', diameter: near });
  if (exact != null) return rec;
  const dd = +(+D).toFixed(3);
  return {
    ...rec, name: `Vrtak HSS D${dd}`, tipRadius: dd / 2, iso: { ...rec.iso, diameter: dd },
    f: Math.min(0.35, Math.max(0.05, Math.round((0.012 * dd + 0.02) * 100) / 100)),
    tool: { ...rec.tool, toolRadius: dd / 2 },
  };
}

/** Jde vrták na Ø díry přidat z 📚 (každý kladný Ø, viz catalogDrillRec)? */
export function catalogDrillD(D) { return D > 0 ? +(+D).toFixed(3) : null; }

/**
 * Přidá do zásobníku vrtáky HSS z 📚 katalogu na chybějící Ø (každý Ø jednou,
 * od dalšího volného T). `makeSlot(rec, T)` = stavba slotu ze záznamu
 * katalogu (simulátor předá magSlots._isoMagSlot — cam/live nesmí importovat
 * cam/sim). Vrací přidané sloty.
 */
export function addCatalogDrills(magazine, diameters, makeSlot) {
  const added = [];
  [...new Set(diameters.map(catalogDrillD).filter(d => d != null))].forEach(d => {
    if (pickDrill(magazineDrills(magazine), d).drill) return;
    const next = Math.max(0, ...magazine.map(s => s.slot)) + 1;
    const slot = makeSlot(catalogDrillRec(d), next);
    magazine.push(slot);
    added.push(slot);
  });
  return added;
}
