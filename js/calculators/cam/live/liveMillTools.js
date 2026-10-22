// FRÉZA PRO FRÉZOVÁNÍ Z VÝKRESU ze 🔧 Zásobníku (uživatel 22. 10. 2026:
// „fréza do zásobníku, výběr podle Ø a řezné podmínky jako u vrtáků").
//
// Fréza v zásobníku = slot `shape: 'mill'`, Ø = 2 · radius, z = `teeth`,
// vc [m/min], f = posuv na zub fz [mm/zub], ap = krok do hloubky,
// `centerCut` (řeže středem). Otáčky n = Vc·1000 / (π·Ø), posuv
// F [mm/min] = fz · z · n. Výběr podle operace:
//   kapsa            → největší fréza, která se do kapsy vejde (Ø ≤ Ø kapsy),
//   drážka na čele   → se šířkou (slotW): největší Ø ≤ šířka (širší drážka
//                      = víc průjezdů); bez šířky (úsečka v čele) a drážka
//                      pro pero → fréza PŘESNĚ na šířku.
// Předvyplňuje se jen operace, které uživatel nástroj ani řezné podmínky
// ručně nezměnil (`autoTool !== false`). Chybí-li fréza, nabídne se
// z 📚 katalogu (isoMills.js); číslo T operace se pak posune mimo T, která
// v zásobníku patří jiným nástrojům (dřív T6 = upichovák → Fanuc T0606).
import { liveOpOn, isKeyway } from './liveModel.js';
import { buildIsoMill, isoMillDiameters } from '../../isoMills.js';

const D_TOL = 0.01;

/** Frézy v zásobníku: [{ slot, name, D, z, vc, fz, ap, centerCut }] podle T. */
export function magazineMills(magazine) {
  return (magazine || [])
    .filter(s => s && s.shape === 'mill' && parseFloat(s.radius) > 0)
    .map(s => ({
      slot: s.slot, name: s.name, D: +(2 * parseFloat(s.radius)).toFixed(3), z: Math.max(1, Math.round(parseFloat(s.teeth) || 3)),
      vc: parseFloat(s.vc) || 100, fz: parseFloat(s.f) || 0.03, ap: parseFloat(s.ap) || 0, centerCut: s.centerCut !== false,
    }))
    .sort((a, b) => a.slot - b.slot);
}

/** Otáčky a posuv frézy z Vc, fz a počtu zubů. */
export function millCutData(mill) {
  const rpm = Math.max(1, Math.round(mill.vc * 1000 / (Math.PI * mill.D)));
  return { rpm, feed: Math.max(1, Math.round(mill.fz * mill.z * rpm)) };
}

/**
 * Jakou frézu operace potřebuje: { exact } = Ø přesně (šířka drážky), nebo
 * { max } = největší Ø, které se vejde.
 */
export function millNeed(op) {
  if (isKeyway(op)) return { exact: op.toolD };
  if (op.millType === 'slot') return op.slotW > 0 ? { max: op.slotW } : { exact: op.toolD };
  return { max: op.holeD };
}

/** Fréza pro operaci ze seznamu fréz, nebo null; `near` = nejbližší jiná. */
export function pickMill(mills, op) {
  const need = millNeed(op);
  let mill = null, near = null;
  if (need.exact != null) mill = mills.find(m => Math.abs(m.D - need.exact) <= D_TOL) || null;
  else mills.forEach(m => { if (m.D <= need.max + D_TOL && (!mill || m.D > mill.D)) mill = m; });
  const target = need.exact ?? need.max;
  if (!mill) mills.forEach(m => { if (!near || Math.abs(m.D - target) < Math.abs(near.D - target)) near = m; });
  return { mill, near, need };
}

/** Ø frézy z 📚 katalogu pro chybějící frézu (přesně / největší vhodný), nebo null. */
export function catalogMillD(need) {
  const ds = isoMillDiameters();
  if (need.exact != null) return ds.find(d => Math.abs(d - need.exact) <= D_TOL) ?? null;
  const fit = ds.filter(d => d <= need.max + D_TOL);
  return fit.length ? fit[fit.length - 1] : null;
}

/** Volné číslo T (žádný slot zásobníku ho nemá). */
function freeT(magazine, used) {
  let t = Math.max(0, ...(magazine || []).map(s => s.slot || 0)) + 1;
  while (used.has(t)) t++;
  return t;
}

/**
 * Doplní frézu a řezné podmínky do frézovacích operací (jen vybraných
 * a nezměněných ručně). Bez frézy v zásobníku se aspoň číslo T posune na
 * volné, když ho v zásobníku má jiný nástroj. Vrací { ops, filled, missing }
 * (missing: { op, kind: 'mill', D, near }).
 */
export function autoMillTools(ops, magazine) {
  const mills = magazineMills(magazine);
  const other = new Set((magazine || []).filter(s => s && s.shape !== 'mill').map(s => s.slot));
  const filled = [], missing = [];
  const out = ops.map((op, i) => {
    if (op.kind !== 'mill' || !liveOpOn(op) || op.autoTool === false) return op;
    const { mill, near, need } = pickMill(mills, op);
    if (!mill) {
      missing.push({ op: i, kind: 'mill', D: catalogMillD(need), need: need.exact ?? need.max, near });
      // T nesmí volat jiný nástroj zásobníku (výchozí T6 = upichovák).
      if (other.has(op.toolNo)) return { ...op, toolNo: freeT(magazine, other) };
      return op;
    }
    filled.push({ op: i, mill });
    const o = { ...op, toolNo: mill.slot, toolName: mill.name, toolCenterCut: mill.centerCut, ...millCutData(mill) };
    // Kapsa a širší drážka: Ø frézy z vybrané frézy; drážka na šířku frézy
    // a pero mají Ø = šířka (vybraná fréza ho má přesně).
    o.toolD = mill.D;
    if (isKeyway(o)) o.holeD = mill.D;
    if (mill.ap > 0) o.stepDown = Math.min(mill.ap, o.depth || mill.ap);
    return o;
  });
  return { ops: out, filled, missing };
}

/** Text o fréze operace pro záložku Vrtání. */
export function millToolText(op, magazine) {
  const { mill, near, need } = pickMill(magazineMills(magazine), op);
  const cut = `${op.rpm} ot/min · F${op.feed} mm/min`;
  if (mill && mill.slot === op.toolNo) return `T${mill.slot} ${mill.name} · ${cut}${mill.centerCut ? '' : ' · ⚠ neřeže středem'}`;
  if (mill) return `T${mill.slot} ${mill.name} (vybere se při frézování)`;
  const what = need.exact != null ? `Ø${need.exact}` : `do Ø${need.max}`;
  return `⚠ fréza ${what} není v 🔧 Zásobníku${near ? ` (nejbližší Ø${near.D} T${near.slot})` : ''} — přidej ji z 📚 → Frézy · teď T${op.toolNo} ${op.toolName || ''} Ø${op.toolD}`;
}

/**
 * Přidá do zásobníku frézy VHM z 📚 katalogu na zadané Ø (každý jednou, od
 * dalšího volného T). `makeSlot(rec, T)` = magSlots._isoMagSlot. Vrací přidané.
 */
export function addCatalogMills(magazine, diameters, makeSlot) {
  const added = [];
  [...new Set(diameters.filter(d => d > 0))].forEach(d => {
    if (magazineMills(magazine).some(m => Math.abs(m.D - d) <= D_TOL)) return;
    const next = Math.max(0, ...magazine.map(s => s.slot)) + 1;
    const slot = makeSlot(buildIsoMill({ kind: 'hm3', diameter: d }), next);
    magazine.push(slot);
    added.push(slot);
  });
  return added;
}
