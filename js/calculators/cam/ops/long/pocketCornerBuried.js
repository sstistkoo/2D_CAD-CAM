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
  const floor = chainFloorAt(passes, corner.z);
  if (floor === null || !(floor - corner.x > (Number(step) || 0) + 0.5)) return false;
  if (typeof newCutArea !== 'function') return true;
  return newCutArea([{ type: 'line', x1: floor, z1: corner.z, x2: corner.x, z2: corner.z }]) > 0.5;
}
