// VRTÁK PRO DÍRY MIMO OSU ze 🔧 Zásobníku podle Ø díry a předvyplnění
// operace (uživatel 20. 10. 2026: „aby se vybral nástroj vrták a nemusel
// jsem to překlikávat a předvyplnilo se mi to").
//
// Vrták v zásobníku = slot `shape: 'drill'`, Ø = 2 · radius, řezné podmínky
// slotu vc [m/min] a f [mm/ot]. Poháněný vrták: otáčky n = Vc·1000 / (π·Ø),
// posuv F [mm/min] = f · n. Ze záložky Vrtání se převezme záběr Q, prodleva
// a bezpečná vzdálenost. Předvyplňuje se jen operace, které uživatel nástroj
// ani řezné podmínky ručně nezměnil (`autoTool !== false`).
import { liveOpOn } from './liveModel.js';
import { buildIsoDrill, isoDrillDiameters } from '../../isoDrills.js';
import { autoMillTools, millToolText } from './liveMillTools.js';

const D_TOL = 0.01;   // vrták „na Ø díry" [mm]

/** Vrtáky v zásobníku: [{ slot, name, D, vc, f }] seřazené podle T. */
export function magazineDrills(magazine) {
  return (magazine || [])
    .filter(s => s && s.shape === 'drill' && parseFloat(s.radius) > 0)
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
export function autoDrillTools(ops, magazine, prms = {}) {
  const drills = magazineDrills(magazine);
  const filled = [], missing = [];
  const out = ops.map((op, i) => {
    if (op.kind !== 'drill' || !liveOpOn(op) || op.autoTool === false) return op;
    const { drill, near } = pickDrill(drills, op.holeD);
    if (!drill) { missing.push({ op: i, D: op.holeD, near }); return op; }
    filled.push({ op: i, drill });
    return drillTabParams({ ...op, toolNo: drill.slot, toolName: drill.name, ...drillCutData(drill) }, prms);
  });
  // Frézovací operace: fréza ze zásobníku (liveMillTools.js, missing s kind 'mill').
  const m = autoMillTools(out, magazine);
  return { ops: m.ops, filled: [...filled, ...m.filled], missing: [...missing, ...m.missing] };
}

/**
 * Pole záložky Vrtání do operace vrtání: záběr Q, prodleva, bezpečná
 * vzdálenost a tříska (Vyjíždění × Lámání + Odskok → chipMode / chipBack).
 */
export function drillTabParams(op, prms = {}) {
  const o = { ...op };
  const q = parseFloat(prms.drillPeck), dw = parseFloat(prms.drillDwell), sf = parseFloat(prms.drillClearance), rb = parseFloat(prms.drillRetract);
  if (Number.isFinite(q) && q >= 0) o.peck = q;
  if (Number.isFinite(dw) && dw >= 0) o.dwell = dw;
  if (Number.isFinite(sf) && sf > 0) o.safe = sf;
  if (prms.drillChipMode) o.chipMode = prms.drillChipMode === 'break' ? 'break' : 'clear';
  if (Number.isFinite(rb) && rb > 0) o.chipBack = rb;
  return o;
}

/**
 * Změna polí záložky Vrtání (Q, prodleva, bezp. vzdálenost, tříska) se
 * propíše do vybraných děr z výkresu, které uživatel ručně nepřepsal —
 * dřív jen při kliknutí na záložku / výběru děr (21. 10. 2026).
 */
export function syncDrillTabParams(ops, prms) {
  return ops.map(op => (op.kind === 'drill' && liveOpOn(op) && op.autoTool !== false ? drillTabParams(op, prms) : op));
}

/** Text o vrtáku operace pro záložku Vrtání. */
export function drillToolText(op, magazine) {
  if (op.kind !== 'drill') return millToolText(op, magazine);
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
 */
export function toggleLiveGroup(ops, oi, plain = false) {
  const on = ops.map(liveOpOn);
  const only = !plain && ops.length > 1 && on.every(Boolean);
  return ops.map((op, i) => ({ ...op, enabled: only ? i === oi : (i === oi ? !on[i] : on[i]) }));
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
