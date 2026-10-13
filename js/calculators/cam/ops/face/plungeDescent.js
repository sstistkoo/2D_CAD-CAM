// ╔═══════════════════════════════════════════╗
// ║  ČELNÍ HRUBOVÁNÍ — zanoření do PLNÉHO materiálu ║
// ╚═══════════════════════════════════════════╝
// Post-proces nad hotovým polem `passes` (jako ostatní moduly v ops/face/).
// Jen pro plátek s klíčem `faceDescentAtPlungeAngle` (kulatá, inserts/round.js).
//
// PRAVIDLO 6: do plného materiálu se zanořuje pod úhlem zanoření. Čelní
// průchod jede k ose a jeho krok do strany je ap. Když ale končí o hodně
// HLOUBĚJI než dno předchozí vrstvy a vedle něj (na obrobené straně) ještě
// stojí materiál, vjede kulatý nos do plného materiálu kolmo a bere plnou
// šířkou — hrozí vylomení destičky i držáku (uživatel 13. 10. 2026, krček pod
// přírubou: průchod Z186,432 sjel z dna X32,3 rovnou na X22,8). Průchod proto
// smí jít nejvýš o |dz|·tan(úhel zanoření) pod dno předchozí vrstvy — při 45°
// o ap — a další vrstva zase o ap níž, až dosedne na konturu.
//
// DNO předchozí vrstvy = kam je materiál pod ní opravdu odebraný: její konec
// řezu, ale nejvýš povrch polotovaru (+ offset nosu) — průchod, který skončil
// nad polotovarem, pod sebou nic neodebral. Kde na předchozím Z polotovar
// není (za čelem, za koncem polotovaru) nebo vrstva dojela k ose, je vedle
// vzduch a mez neplatí — tam se do materiálu vjíždí bokem jako vždy.

import { getEffectivePlungeAngle } from '../../camMath.js';

/** Pod osou materiál není — dno u osy je vzduch, ne stěna (jako v layerDepth.js). */
const AXIS_NO_MAT = 0.5;

export function makeFaceDescentLimit(deps) {
  const {
    prms, ins, passes, foundErrors, zList, xTouchAt, castingOuterOrNull, faceOffsetOut,
  } = deps;
  let raised = 0, dropped = 0;
  const limitDescent = (report) => {
    if (!ins.faceDescentAtPlungeAngle) return;
    const tanA = Math.tan(Math.min(89.5, getEffectivePlungeAngle(prms)) * Math.PI / 180);
    const byZ = new Map(passes.filter(p => p.type === 'face').map(p => [p.z.toFixed(3), p]));
    const drop = new Set();
    // Dno na Z předchozí vrstvy (střed nosu); -Infinity = vedle je vzduch.
    const floorAt = (z) => {
      const sf = castingOuterOrNull(z);
      if (sf === null || sf < AXIS_NO_MAT) return -Infinity;
      const stockFloor = sf + faceOffsetOut;
      const q = byZ.get(z.toFixed(3));
      if (!q || drop.has(q)) return stockFloor;
      if (q.xEnd < AXIS_NO_MAT) return -Infinity;
      return Math.min(q.xEnd, stockFloor);
    };
    for (let i = 1; i < zList.length; i++) {
      const p = byZ.get(zList[i].toFixed(3));
      if (!p || p.runOut) continue;
      const floor = floorAt(zList[i - 1]);
      if (!Number.isFinite(floor)) continue;
      const need = floor - Math.abs(p.z - zList[i - 1]) * tanA;
      if (need <= p.xEnd + 0.01) continue;
      // Zvednutí nad mez dotyku = průchod by jel vzduchem → vynechat.
      if (need >= p.xStart - 0.05 || need >= xTouchAt(p.z) - 0.01) {
        drop.add(p);
        dropped++;
        continue;
      }
      p.xEnd = need;
      p.descentClamped = true;
      raised++;
      // Dojezd byl spočítaný pro hlubší dno — po zvednutí by šel pod něj.
      if (p.contourLeadOut) delete p.contourLeadOut;
    }
    if (drop.size > 0) {
      for (let i = passes.length - 1; i >= 0; i--) if (drop.has(passes[i])) passes.splice(i, 1);
    }
    if (report && raised + dropped > 0) {
      foundErrors.push({ type: 'warning', msg: `Zanoření do plného materiálu (čelně): ${raised} průchodů zkráceno`
        + (dropped > 0 ? `, ${dropped} vynecháno` : '')
        + ` — kulatá destička jde do plného materiálu nejvýš o ap pod úhlem zanoření (${getEffectivePlungeAngle(prms).toFixed(0)}°), ne kolmo. Materiál pod touto mezí zůstane.` });
    }
  };
  return limitDescent;
}
