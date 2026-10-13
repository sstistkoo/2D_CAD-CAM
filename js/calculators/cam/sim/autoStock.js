// Polotovar z kontury v CAM simulátoru: „🎯 Auto-rozměr" válce a výchozí
// obrys „Vlastní tvar". Vyňato z camSimulator.js (blok „auto stock",
// docs/plan-rozdeleni-cam-simulatoru.md) — stav simulátoru `S` a jeho akce
// se předávají parametrem.
import { getArcParams } from '../camMath.js';
import { resolvePointsToAbsolute } from '../contourBuild.js';

/**
 * 🎯 Auto-rozměr: průměr, délka a čelo válcového polotovaru tak, aby obalil
 * konturu (i vrcholy oblouků) s přídavkem `stockMargin`; pak přepočet a
 * vycentrování pohledu.
 * @param ctx.S          stav simulátoru
 * @param ctx.fullUpdate přepočet drah + překreslení
 * @param ctx.fitView    vycentrování pohledu
 */
export function handleAutoStock({ S, fullUpdate, fitView }) {
  const absPts = resolvePointsToAbsolute(S.contourPoints);
  if (absPts.length === 0) return;
  const prms = S.params;
  let minZ = Infinity, maxZ = -Infinity, maxR = 0;
  // Convert to radius for consistent comparison
  absPts.forEach(p => {
    const r = prms.mode === 'DIAMON' ? Math.abs(p.xAbs) / 2 : Math.abs(p.xAbs);
    if (r > maxR) maxR = r;
    if (p.zAbs < minZ) minZ = p.zAbs; if (p.zAbs > maxZ) maxZ = p.zAbs;
  });
  // Also check arc extremes (the arc peak can exceed endpoint X values)
  for (let i = 0; i < absPts.length - 1; i++) {
    const p2 = absPts[i + 1];
    if (p2.type === 'G2' || p2.type === 'G3') {
      const x1 = prms.mode === 'DIAMON' ? absPts[i].xAbs / 2 : absPts[i].xAbs;
      const z1 = absPts[i].zAbs;
      const x2 = prms.mode === 'DIAMON' ? p2.xAbs / 2 : p2.xAbs;
      const z2 = p2.zAbs;
      const arc = getArcParams({ x: x1, z: z1 }, { x: x2, z: z2 }, p2.rVal, p2.type);
      if (!arc.error) {
        const arcMaxR = Math.abs(arc.cx) + arc.r;
        if (arcMaxR > maxR) maxR = arcMaxR;
        if (arc.cz - arc.r < minZ) minZ = arc.cz - arc.r;
      }
    }
  }
  const margin = parseFloat(prms.stockMargin) || 5;
  // stockDiameter is always diameter
  S.params.stockDiameter = Math.ceil((maxR + margin) * 2);
  S.params.stockLength = Math.ceil(Math.abs(minZ) + margin);
  S.params.stockFace = Math.ceil(maxZ) + 2;
  fullUpdate();
  fitView();
}

/** Výchozí obrys „Vlastní tvar": 5 mm kolem koncových bodů kontury → `S.stockPoints`. */
export function generateDefaultStock(S) {
  const absPts = resolvePointsToAbsolute(S.contourPoints);
  if (absPts.length === 0) return;
  let minZ = Infinity, maxX = 0;
  absPts.forEach(p => {
    const x = S.params.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs;
    if (Math.abs(x) > maxX) maxX = Math.abs(x);
    if (p.zAbs < minZ) minZ = p.zAbs;
  });
  const sR = maxX + 5, sL = minZ - 5;
  const stockX = S.params.mode === 'DIAMON' ? sR * 2 : sR;
  S.stockPoints = [
    { id: Date.now(), type: 'G0', x: stockX, z: 2, r: 0, mode: 'ABS' },
    { id: Date.now() + 1, type: 'G1', x: stockX, z: sL, r: 0, mode: 'ABS' },
    { id: Date.now() + 2, type: 'G1', x: 0, z: sL, r: 0, mode: 'ABS' }
  ];
}
