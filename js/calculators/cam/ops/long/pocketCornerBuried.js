// ╔══════════════════════════════════════════════════════════════╗
// ║  Dobrání kapsy („kapsa bez schodků"): je roh vůbec odkrytý?    ║
// ╚══════════════════════════════════════════════════════════════╝
// Dobrání kapsy (pocketPass.js, fáze 2) bez navázání na poslední rampu
// začíná v ROHU kapsy a sjede k němu ze vzduchu. Předpoklad: rampy řetězu
// sjely po mezní čáře zanoření od tohohle rohu, takže sloupec nad ním je
// vybraný a dobrání bere jen hřebínky (~0,5 mm) po krocích ap.
//
// Neplatí, když rampy jedou po JINÉ, vyšší přímce (a kapsa vlastní řetěz
// nemá vůbec). Díl uživatele (karusel
// po X, 11. 11. 2026, Úsek 2): celá kapsa S8–S5 leží pod mezní čárou
// zanoření od S11, rampy z X535 Z128 dojely po 15° jen na levou stěnu v
// Z66. Nad rohem S8 (Z64) zůstalo 40 mm materiálu a dobrání do něj sjelo
// svisle posuvem (`G0 Z104.99` → `G1 Z64`) a jelo celé dno plnou hloubkou:
// 3 kolize držáku, porušení pravidel 3 a 6. Materiál pod mezní čárou má
// zůstat stát a nahlásit se (pravidlo 6).

/**
 * Výška dna, kam řez řetězu dosáhl nad souřadnicí `z` (min. přes vrstvy a
 * rampy průchodů); null = žádný průchod nad `z` nejel.
 * @param {Array<{type:string,x:number,zStart:number,zEnd:number,ramp?:{x0:number,z0:number}}>} passes
 */
export function chainFloorAt(passes, z) {
  let floor = null;
  const take = (v) => { if (Number.isFinite(v) && (floor === null || v < floor)) floor = v; };
  for (const p of passes) {
    if (!p || p.type !== 'long' || !Number.isFinite(p.x)) continue;
    const lo = Math.min(p.zStart, p.zEnd), hi = Math.max(p.zStart, p.zEnd);
    if (z >= lo - 1e-6 && z <= hi + 1e-6) take(p.x);
    const r = p.ramp;
    if (r && Number.isFinite(r.x0) && Number.isFinite(r.z0)) {
      const a = Math.min(r.z0, p.zStart), b = Math.max(r.z0, p.zStart);
      if (z >= a - 1e-6 && z <= b + 1e-6) {
        const span = r.z0 - p.zStart;
        take(Math.abs(span) < 1e-9 ? Math.min(r.x0, p.x) : p.x + (r.x0 - p.x) * (z - p.zStart) / span);
      }
    }
  }
  return floor;
}

/**
 * Zůstal nad rohem kapsy po dosavadních průchodech víc než jedna vrstva (ap)?
 * @param {Array} passes  dosud naplánované průchody (vrstvy, rampy)
 * @param {{x:number,z:number}} corner
 * @param {number} step  Hloubka ap
 * @param {Function} [newCutArea]  model zbytku (roughLong makeAlreadyCut): je-li k dispozici,
 *   rozhodne, zda svislý sjezd nad rohem opravdu řeže materiál (odlitek s dutinou ne).
 */
export function pocketCornerBuried(passes, corner, step, newCutArea) {
  if (!corner || !Array.isArray(passes) || passes.length === 0) return false;
  return pointBuried(passes, corner, step, newCutArea);
}

function pointBuried(passes, pt, step, newCutArea) {
  const floor = chainFloorAt(passes, pt.z);
  if (floor === null || !(floor - pt.x > (Number(step) || 0) + 0.5)) return false;
  if (typeof newCutArea !== 'function') return true;
  return newCutArea([{ type: 'line', x1: floor, z1: pt.z, x2: pt.x, z2: pt.z }]) > 0.5;
}

/**
 * Vede trasa dobrání (nájezd i dojezd po kontuře) někde víc než ap pod tím,
 * kam dosáhly dosavadní průchody? Roh může být odkrytý, a přesto rampy
 * dojely jen kousek — dobrání by pak jelo mezní čarou zanoření skrz plný
 * materiál. Díl uživatele (karusel Od středu, 11. 11. 2026): roh S1 X69 Z190
 * odkrytý, rampy kapsy jen na Z178, dobrání `G1 Z133 X281.859` →
 * `G1 Z57.152 X571.2` napříč celou kapsou: 11 069 mm² držáku.
 * @param {Array} segs  úseky trasy {x1,z1,x2,z2} (oblouky jen krajními body)
 */
export function pocketPathBuried(passes, segs, step, newCutArea) {
  if (!Array.isArray(passes) || passes.length === 0 || !Array.isArray(segs)) return false;
  const STEP = 2;   // vzorkování po trase [mm]
  for (const s of segs) {
    if (!s || ![s.x1, s.z1, s.x2, s.z2].every(Number.isFinite)) continue;
    const n = s.type === 'line' || !s.type ? Math.max(1, Math.ceil(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) / STEP)) : 1;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (pointBuried(passes, { x: s.x1 + (s.x2 - s.x1) * t, z: s.z1 + (s.z2 - s.z1) * t }, step, newCutArea)) return true;
    }
  }
  return false;
}
