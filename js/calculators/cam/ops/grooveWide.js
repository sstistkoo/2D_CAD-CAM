// Vnější zápich libovolné šířky (Upich + ◯ Vnější) — pravidlo 17
// (docs/cam-pravidla.md, schválil uživatel 23. 10. 2026).
//
// Z (naklikané, `partOffZ`) = bok zápichu na straně SKLÍČIDLA jako u upichu:
// šířka (`grooveWidth`) vede od Z k obráběcí straně (zprava k +Z, zleva k −Z).
// Zápichy vedle sebe s krokem ≤ 0,8 × šířka destičky; boky nechají Přídavek Z
// + Přídavek na hotovo, dno Přídavek na hotovo; dokončení: první bok na dno,
// po dně ke druhému boku, po něm nahoru. Šířka ≤ šířka destičky = dnešní
// upichnutí (ops/partOff.js beze změny).
import { getInsert } from '../inserts/index.js';
import { chamferFinishPath } from './grooveChamfer.js';

const num = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
/** Překryv sousedních zápichů: krok ≤ 0,8 × šířka destičky (jako v díře). */
const STEP_FRAC = 0.8;

/** Je zadaná šířka zápichu širší než destička (→ víc zápichů), nebo sražení hran? */
export function grooveWideActive(prms) {
  const w = getInsert(prms).widthZ || 0;
  return num(prms.grooveWidth) > (w > 0 ? w : 0) + 1e-6 || num(prms.grooveChamfer) > 0;
}

/**
 * Plán vnějšího zápichu z geometrie upichu (`partOffGeom`).
 * @returns {{ok:boolean, reason?:string, W:number, w:number, plunges:number[],
 *   xRough:number, xFinal:number, zFinA:number, zFinB:number, doFinish:boolean}}
 */
export function grooveWidePlan(prms, geom) {
  const ins = getInsert(prms);
  const w = ins.widthZ || 0;
  const r = geom.rIns;
  // Šířka 0 se sražením = jeden zápich šířkou destičky (+ sražení dokončením).
  const W = num(prms.grooveWidth) || w;
  const sCh = Math.max(0, num(prms.grooveChamfer));
  const allowZ = Math.max(0, num(prms.allowanceZ));
  const finAllow = Math.max(0, num(prms.finishAllowance));
  // Sražení dělá dokončení i bez Přídavku na hotovo (je to nový tvar, ne přídavek).
  const out = { ok: false, W, w, plunges: [], doFinish: sCh > 0 ? !!prms.doFinishing : geom.doFinish };
  if (!(w > 0)) return { ...out, reason: 'Zápich širší než destička umí jen zapichovací (upichovací) destička — kulatou jde jen jeden zápich.' };
  const fa = allowZ + finAllow;
  const span = W - 2 * fa;
  if (span < w - 1e-6) return { ...out, reason: `Zápich ${W} mm se s přídavky boků (2 × ${fa.toFixed(2)}) nevejde na destičku ${w} mm — zmenši přídavky.` };
  const n = span - w < 1e-6 ? 1 : Math.ceil((span - w) / (STEP_FRAC * w)) + 1;
  const step = n > 1 ? (span - w) / (n - 1) : 0;
  // Destička od hloubky u (od boku u sklíčidla) zabírá [u, u + w]; střed
  // pracovního rádiusu jako u upichu: Z = pz + dir·(u + r).
  const zOfU = (u) => geom.pz + geom.dir * (u + r);
  const plunges = [];
  for (let i = 0; i < n; i++) plunges.push(zOfU(fa + i * step));
  const plan = {
    ...out, ok: true, plunges,
    xFinal: geom.xCenterTarget,                 // spodní hrana na Dojezdu X
    xRough: geom.xCenterTarget + finAllow,      // dno: Přídavek na hotovo zůstává
    zFinA: zOfU(fa > 0 ? allowZ : 0), zFinB: zOfU(fa > 0 ? W - allowZ - w : 0),
  };
  if (sCh > 0) {
    // Sražení hran: povrch = Start X (spodní hrana destičky na startu), hloubka
    // ke dnu (Dojezd X); d = povrch − X středu rohu − … → X = povrch − d.
    const surf = geom.startEdgeX;
    const uA = fa > 0 ? allowZ : 0, uB = fa > 0 ? W - allowZ : W;
    const ch = chamferFinishPath({ s: sCh, uA, uB, w, r, depth: surf - geom.allowX, dStart: -(r + 0.5) });
    if (!ch.ok) return { ...out, reason: ch.reason };
    plan.chamferPath = ch.pts.map(q => ({ z: zOfU(q.u), x: surf - q.d }));
    plan.chamfer = sCh;
  }
  return plan;
}
