// ╔══════════════════════════════════════════════════════════════╗
// ║  VYVRTÁVÁNÍ Z PLNÉHO — předvrtání vrtákem, pak vyvrtávací tyč   ║
// ╚══════════════════════════════════════════════════════════════╝
// Uživatel 9. 10. 2026: „u vyvrtávání ať je možnost nastavit i vrták a pak
// ten vyvrtávací nůž, ať je to automatizované a není to tak nepřehledné,
// když je materiál zplna v kontuře". Jeden program = dvě části:
//
//   1. VRTÁNÍ vrtákem ze 🔧 Zásobníku (ops/drill.js beze změny) v ose od
//      čela díry. Hloubka: špička skončí na dně díry + Přídavek Z
//      (rozhodnutí uživatele 9. 10. 2026: „špička nesmí do dna") — u slepé
//      díry s rovným dnem by plný ⌀ až na dno udělal špičkou důlek do
//      hotového dílu.
//   2. VYVRTÁVÁNÍ tyčí (ops/bore.js) z předvrtání ⌀ vrtáku: válec do hloubky
//      plného ⌀ + kužel špičky (`borePreTip`). Kužel uprostřed dna tyč
//      nevezme (musela by přes osu) — zůstane a ukáže se v simulaci.
//
// Obě části se spojí stejně jako části programu „➕ Operace" (mergePrograms:
// výměna nástroje, STOPRE, vřeteno/chlazení). Vrták: zvolený slot, jinak
// největší vrták ze zásobníku, který nechá na stěně aspoň přídavek + 1 mm
// (a dosáhne na dno); když žádný není, poradí se z 📚 katalogu
// (`catalogDrillFor`) — přidá ho UI.

import { boreGeom } from './bore.js';
import { boreChainFromState } from '../boreContour.js';
import { mergePrograms } from '../gcodeMerge.js';
import { buildIsoDrill, isoDrillDiameters } from '../../isoDrills.js';
import { slotToolParams } from '../camDefaults.js';
import { getInsert } from '../inserts/index.js';

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const r3 = (v) => Math.round(v * 1000) / 1000;
/** Na stěně musí po vrtání zůstat aspoň přídavek + tolik, ať má tyč co brát [mm]. */
const WALL_STOCK = 1;
/** Značka části vyvrtávání ve sloučeném programu (komentář mergePrograms). */
export const PREDRILL_BORE_MARK = 'VYVRTAVANI';

/** Osová délka špičky vrtáku ⌀D s vrcholovým úhlem σ [mm]. */
export function drillPointLength(D, sigma) {
  const half = Math.max(1, Math.min(179, num(sigma, 118))) / 2 * Math.PI / 180;
  return D > 0 ? (D / 2) / Math.tan(half) : 0;
}

/** Slot zásobníku je vrták — podle klíče plátku, ne podle tvaru. */
const isDrillSlot = (s) => !!s && num(s.radius, 0) > 0 && !!getInsert(slotToolParams(s)).canDrill;

/**
 * Tvar díry pro předvrtání: čelo zF, strana s, nejmenší poloměr stěny (kam až
 * smí vrták) a hloubka dna L pro předvrtání ⌀D (body uvnitř předvrtání se do
 * hloubky nepočítají — viz boreGeom).
 */
function holeShape(S, D) {
  const prms = S.params;
  const src = prms.boreSource === 'cad' ? boreChainFromState(S) : null;
  const g = boreGeom({ ...prms, borePreDiameter: D, borePreDepth: 1e9, borePreTip: 0 }, src ? src.segs : null);
  let rMin = g.r;
  if (g.chain) {
    // Stěna = body řetězu nad dnem (dno díry k ose se nepočítá).
    const wall = g.chain.flatMap(sg => [sg.p1, sg.p2]).filter(p => g.s * (g.zF - p.z) < g.L - 0.01);
    if (wall.length) rMin = Math.min(...wall.map(p => p.x));
  }
  return { zF: g.zF, s: g.s, L: g.L, rMin, fromCad: prms.boreSource === 'cad', chainOk: !(prms.boreSource === 'cad' && !g.chain) };
}

/** Největší ⌀ vrtáku, který nechá na stěně přídavek + WALL_STOCK. */
export function preDrillMaxDiameter(prms, rMin) {
  return 2 * (rMin - Math.max(0, num(prms.allowanceX, 0)) - WALL_STOCK);
}

/**
 * Vrták z 📚 katalogu pro díru: HSS 118°, největší ⌀ ≤ dMax, který dosáhne
 * (vyložení) aspoň do `reach`; když nedosáhne žádný, největší ⌀ ≤ dMax.
 * @returns {Object|null} záznam knihovny (buildIsoDrill)
 */
export function catalogDrillFor(dMax, reach = 0) {
  const ds = isoDrillDiameters('hss').filter(d => d <= dMax + 1e-9).sort((a, b) => b - a);
  if (!ds.length) return null;
  for (const d of ds) {
    const rec = buildIsoDrill({ kind: 'hss', diameter: d });
    if (rec.tool.toolLength >= reach) return rec;
  }
  return buildIsoDrill({ kind: 'hss', diameter: ds[0] });
}

/**
 * Plán předvrtání pro vyvrtávání z plného.
 * @returns {{ok:boolean, reason?:string, idx:number, slot:Object|null, auto:boolean,
 *   D:number, sigma:number, tipL:number, zF:number, s:number, L:number,
 *   depthTip:number, L0:number, dMax:number}}
 */
export function preDrillPlan(S) {
  const prms = S.params;
  const mag = Array.isArray(S.toolMagazine) ? S.toolMagazine : [];
  const allowZ = Math.max(0, num(prms.allowanceZ, 0));
  // Mez ⌀ a hloubka se počítají s nejmenším možným předvrtáním — přesně je
  // dopočítá až zvolený vrták (L závisí na ⌀: body dna uvnitř předvrtání
  // se nepočítají).
  const h0 = holeShape(S, 0.01);
  const dMax = preDrillMaxDiameter(prms, h0.rMin);
  const base = { ok: false, idx: -1, slot: null, auto: true, D: 0, sigma: 118, tipL: 0, zF: h0.zF, s: h0.s, L: h0.L, depthTip: 0, L0: 0, dMax };
  if (!h0.chainOk) return { ...base, reason: 'Ve výkresu není díra — předvrtání nejde naplánovat.' };
  if (!(h0.L > 0) || !(h0.rMin > 0)) return { ...base, reason: 'Díra nemá průměr nebo délku — předvrtání nejde naplánovat.' };
  let idx = Number.isInteger(prms.borePreDrillSlot) && isDrillSlot(mag[prms.borePreDrillSlot]) ? prms.borePreDrillSlot : -1;
  const auto = idx < 0;
  if (auto) {
    // Největší vrták, který se do díry vejde; přednost má ten, který dosáhne na dno.
    const reachNeed = h0.L - allowZ;
    let best = -1, bestReach = false;
    mag.forEach((s, i) => {
      if (!isDrillSlot(s)) return;
      const D = 2 * num(s.radius, 0);
      if (D > dMax + 1e-6) return;
      const reaches = num(s.toolLength, 0) >= reachNeed;
      if (best < 0 || (reaches && !bestReach) || (reaches === bestReach && D > 2 * num(mag[best].radius, 0))) {
        best = i; bestReach = reaches;
      }
    });
    idx = best;
  }
  if (idx < 0) {
    return { ...base, reason: dMax > 0
      ? `V 🔧 Zásobníku není vrták do ⌀${r3(dMax)} — přidej ho z 🧰 Knihovna → 📚 ISO katalog → Vrtáky.`
      : 'Díra je na předvrtání moc úzká.' };
  }
  const slot = mag[idx];
  const D = 2 * num(slot.radius, 0);
  const sigma = num(slot.tipAngle, 118);
  const tipL = drillPointLength(D, sigma);
  const h = holeShape(S, D);
  const depthTip = h.L - allowZ;
  const L0 = depthTip - tipL;
  const plan = { ...base, idx, slot, auto, D, sigma, tipL: r3(tipL), zF: h.zF, s: h.s, L: h.L, depthTip: r3(depthTip), L0: r3(L0) };
  if (D > dMax + 1e-6) return { ...plan, reason: `Vrták ⌀${D} je na díru moc velký — na stěně musí zůstat přídavek + ${WALL_STOCK} mm (nejvýš ⌀${r3(dMax)}).` };
  if (!(L0 > 0.5)) return { ...plan, reason: `Díra (${r3(h.L)} mm) je na vrták ⌀${D} moc mělká — špička (${r3(tipL)} mm) by sjela pod dno.` };
  return { ...plan, ok: true };
}

/** Parametry programu VRTÁNÍ podle plánu (nástroj ze slotu, hloubka na špičku). */
export function preDrillParams(prms, plan) {
  return {
    ...prms,
    ...slotToolParams(plan.slot),
    drillActive: true, boreActive: false, threadActive: false, partOffZ: null,
    drillZStart: plan.zF, drillDepth: plan.depthTip, drillDepthFullDia: false,
  };
}

/**
 * Předvrtání z plánu do parametrů vyvrtávání (⌀, hloubka plného ⌀, kužel).
 * Volá se v pipeline (calculatePipeline) — UI, náhled i simulace pak vidí
 * totéž co emise. Bez předvrtání vrtákem se kužel nuluje (ruční předvrtání
 * = válec, jako dřív).
 */
export function applyPreDrillPlan(S) {
  const prms = S && S.params;
  if (!prms) return null;
  if (!(prms.boreActive && prms.borePreDrill)) {
    if (num(prms.borePreTip, 0) !== 0) prms.borePreTip = 0;
    return null;
  }
  const plan = preDrillPlan(S);
  if (plan.ok) {
    prms.borePreDiameter = plan.D;
    prms.borePreDepth = plan.L0;
    prms.borePreTip = plan.tipL;
  }
  return plan;
}

/**
 * Celý program vyvrtávání z plného: vrtání + vyvrtávání, sloučené jako části
 * programu. `generateAutoGCode` se předává (žádný cyklus importů).
 * @returns {Array<{text:string, simIdx:null}>|null} null = plán nevyšel
 *   (volající vydá samotné vyvrtávání; důvod je v S.genNotes)
 */
export function emitBorePreDrilled({ S, calc, generateAutoGCode }) {
  const plan = applyPreDrillPlan(S);
  if (!plan) return null;
  if (!plan.ok) {
    S.genNotes.push({ type: 'warning', msg: `Předvrtání: ${plan.reason}` });
    return null;
  }
  const Sd = { ...S, params: preDrillParams(S.params, plan), genNotes: [] };
  const drill = generateAutoGCode(Sd, calc);
  const Sb = { ...S, params: { ...S.params, borePreDrill: false }, genNotes: [] };
  const bore = generateAutoGCode(Sb, calc);
  S.genNotes = [...(Sd.genNotes || []), ...(Sb.genNotes || [])];
  const text = (lines) => lines.map(l => l.text).join('\n');
  const code = mergePrograms([
    { name: `VRTANI ${plan.slot.name}`, code: text(drill) },
    { name: `${PREDRILL_BORE_MARK} ${S.params.toolName || ''}`.trim(), code: text(bore) },
  ], S.params.controlSystem);
  return code.split('\n').map(t => ({ text: t, simIdx: null }));
}

/**
 * Kde ve sloučeném programu začíná vyvrtávání: první bod simulace za značkou
 * části. @returns {number|null} index do simPath, null = program není sloučený
 */
export function preDrillSplitIndex(simPath, code) {
  if (!Array.isArray(simPath) || !code) return null;
  const lines = code.split('\n');
  const mark = lines.findIndex(l => l.includes(`===== ${PREDRILL_BORE_MARK}`));
  if (mark < 0) return null;
  const i = simPath.findIndex(p => p && Number.isInteger(p.originalLineIdx) && p.originalLineIdx > mark);
  return i > 0 ? i : null;
}
