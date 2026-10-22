// NAVRTÁNÍ A ZÁVITOVÁNÍ děr z výkresu (uživatel 22. 10. 2026: „závitování
// závitníkem do děr" a „navrtání před vrtáním").
//
// Ke každé operaci vrtání z výkresu (fromCad, bez `role`) mohou vzniknout
// odvozené operace se stejnými pozicemi děr:
//   role 'spot' — navrtávák: sražení Ø spotD = (Ø závitu | Ø díry) + 2 · sražení,
//                 hloubka = spotD/2 / tan(σ/2) (σ = vrchol navrtáváku, výchozí 90°),
//                 na jeden zátah s krátkou prodlevou. Zapíná nastavení
//                 `live.spot` (liveSettings), pořadí: všechna navrtání PŘED vrtáním.
//   role 'tap'  — závitník: Ø = jmenovitý Ø závitu, `pitch` = stoupání,
//                 hloubka závitu z CAD (faceDepth.holeForCam / shellHoles),
//                 posuv = P · n. Pořadí: PO všem vrtáních.
// Odvozená operace nese `forKey` = otisk pozic a Ø hlavní díry (holeKey) —
// výběr skupiny (enabled) se řídí hlavní operací (syncDerivedEnabled).
import { normalizeLiveOp, liveOpOn } from './liveModel.js';

export const SPOT_ANGLE = 90;          // [°] výchozí vrchol navrtáváku
export const SPOT_CHAMFER = 0.5;       // [mm] výchozí sražení hrany díry
const r3 = v => +(+v).toFixed(3);
const POS = ['side', 'pattern', 'pcd', 'count', 'startAngle', 'points', 'zTop', 'faceDir', 'xTop', 'zPos'];
// Z hlavní operace se nepřebírá nástroj ani řezné podmínky (jiný nástroj).
const TOOL = ['toolNo', 'toolName', 'rpm', 'feed', 'autoTool', 'enabled', 'dwell', 'safe', 'retract'];

/** Otisk pozic a Ø díry (spojuje odvozenou operaci s hlavní). */
export function holeKey(op) {
  return JSON.stringify([op.holeD, ...POS.map(k => op[k] ?? null)]);
}

/** Je operace hlavní vrtání z výkresu (k ní se navrtává / závituje)? */
export const isMainCadDrill = op => op && op.kind === 'drill' && !op.role && op.fromCad;

/** Hloubka navrtání pro Ø sražení a vrchol σ. */
export function spotDepth(spotD, angle = SPOT_ANGLE) {
  const a = angle > 10 && angle < 170 ? angle : SPOT_ANGLE;
  return r3(spotD / 2 / Math.tan(a * Math.PI / 360));
}

function derived(main, role, extra, prevSame) {
  const rest = { ...main };
  delete rest.thread;
  delete rest.autoName;
  const o = { ...rest, id: main.id + role[0], role, forKey: holeKey(main), fromCad: true, peck: 0, ...extra };
  if (prevSame) TOOL.forEach(k => { if (prevSame[k] !== undefined) o[k] = prevSame[k]; });
  o.enabled = main.enabled;
  return normalizeLiveOp(o);
}

/** Operace závitníku k hlavní díře s `thread` { name, pitch, d, depth }. */
export function tapOpFor(main, prev = []) {
  const t = main.thread;
  const old = prev.find(o => o.role === 'tap' && o.thread && o.thread.name === t.name && o.side === main.side);
  const rpm = old ? old.rpm : 200;
  return derived(main, 'tap', {
    name: `Závit ${t.name} → ${main.name}`, holeD: r3(t.d), pitch: t.pitch, thread: { name: t.name, pitch: t.pitch },
    depth: t.depth, dwell: 0, rpm, feed: r3(t.pitch * rpm), toolName: `ZAVITNIK_${t.name}`,
  }, old);
}

/** Operace navrtání k hlavní díře (Ø sražení podle závitu / Ø díry). */
export function spotOpFor(main, chamfer = SPOT_CHAMFER, prev = []) {
  const base = main.thread ? main.thread.d : main.holeD;
  const spotD = r3(base + 2 * Math.max(0, chamfer));
  const old = prev.find(o => o.role === 'spot' && o.side === main.side);
  const angle = old && old.spotAngle > 0 ? old.spotAngle : SPOT_ANGLE;
  return derived(main, 'spot', {
    name: `Navrtání Ø${spotD} → ${main.name}`, holeD: spotD, spotD, spotAngle: angle,
    depth: spotDepth(spotD, angle), dwell: 0.3, toolName: 'NAVRTAVAK',
  }, old);
}

/**
 * Doplní / odebere odvozené operace: navrtání (když `spot`) a závity (hlavní
 * díra s `thread`). Pořadí: ruční, navrtání, hlavní a ostatní z CAD, závity.
 * `prev` = dřívější operace (převzetí nástroje a otáček odvozených).
 */
export function withHoleExtras(ops, { spot = false, spotChamfer = SPOT_CHAMFER } = {}, prev = ops) {
  const base = ops.filter(o => !o.role);
  const manual = base.filter(o => !o.fromCad), cad = base.filter(o => o.fromCad);
  const mains = cad.filter(isMainCadDrill);
  const spots = spot ? mains.map(m => spotOpFor(m, spotChamfer, prev)) : [];
  const taps = mains.filter(m => m.thread && m.thread.depth > 0).map(m => tapOpFor(m, prev));
  return [...manual, ...spots, ...cad, ...taps];
}

/** Výběr odvozených operací = výběr hlavní díry. */
export function syncDerivedEnabled(ops) {
  const on = new Map(ops.filter(o => !o.role).map(o => [holeKey(o), liveOpOn(o)]));
  return ops.map(o => (o.role && on.has(o.forKey) && liveOpOn(o) !== on.get(o.forKey) ? { ...o, enabled: on.get(o.forKey) } : o));
}

/** Index hlavní operace k odvozené (klepnutí na díru), jinak `oi`. */
export function mainIndexOf(ops, oi) {
  const op = ops[oi];
  if (!op || !op.role) return oi;
  const i = ops.findIndex(o => !o.role && holeKey(o) === op.forKey);
  return i >= 0 ? i : oi;
}
