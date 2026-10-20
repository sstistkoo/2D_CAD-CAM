// Spodní polovina řezu v CAM, když jsou operace poháněných nástrojů (díry,
// drážky): kontura a polotovar zrcadlené přes osu (x → −x) jako v CAD
// nárysu s ⇋ Zrcadlit kolem osy — díry pod osou (C 180°…360°) pak mají kde
// ležet (live/liveSection.js je do spodní poloviny sklopí; uživatel
// 20. 10. 2026). Jen zobrazení: dráhy, úběr, SNAP ani výpočty se nemění.
// Kreslí se mezi vrstvami drawOverlays a live (drawCanvas.js).
import { getArcParams, arcSteps } from '../camMath.js';
import { getLiveOps } from '../live/liveModel.js';

/** Má se kreslit spodní polovina? (operace poháněných nástrojů existují) */
export function lowerHalfOn(prms) {
  return getLiveOps(prms).length > 0;
}

/** Body kontury (worldPoints z calc) jako lomené čáry {x, z} — oblouky navzorkované. */
export function contourRuns(worldPoints, scale = 1) {
  const runs = [];
  let run = [];
  (worldPoints || []).forEach((p2, i) => {
    if (i === 0) { run.push({ x: p2.xReal, z: p2.zReal }); return; }
    const p1 = worldPoints[i - 1];
    if (p2.type === 'G0') { if (run.length > 1) runs.push(run); run = [{ x: p2.xReal, z: p2.zReal }]; return; }
    if (p2.type === 'G2' || p2.type === 'G3') {
      const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
      if (!arc.error) {
        const steps = arcSteps(arc.r, scale);
        const sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
        let eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
        if (p2.type === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (p2.type === 'G3' && eA < sA) eA += 2 * Math.PI;
        for (let j = 1; j <= steps; j++) {
          const a = sA + (eA - sA) * (j / steps);
          run.push({ x: arc.cx + Math.sin(a) * arc.r, z: arc.cz + Math.cos(a) * arc.r });
        }
        return;
      }
    }
    run.push({ x: p2.xReal, z: p2.zReal });
  });
  if (run.length > 1) runs.push(run);
  return runs;
}

/** Obrys polotovaru {x, z}: válec = obdélník od osy, odlitek = segmenty. */
export function stockRuns(prms, stockPathSegments, scale = 1) {
  if (prms.stockMode === 'cylinder') {
    const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
    const sLen = parseFloat(prms.stockLength) || 0;
    const sFace = parseFloat(prms.stockFace) || 0;
    if (!(sRad > 0)) return [];
    return [[{ x: 0, z: sFace }, { x: sRad, z: sFace }, { x: sRad, z: -sLen }, { x: 0, z: -sLen }]];
  }
  const run = [];
  (stockPathSegments || []).forEach(seg => {
    if (seg.type === 'line') {
      if (!run.length) run.push({ x: seg.p1.x, z: seg.p1.z });
      run.push({ x: seg.p2.x, z: seg.p2.z });
    } else if (seg.type === 'arc') {
      const steps = arcSteps(seg.r, scale);
      let sA = seg.startAngle, eA = seg.endAngle;
      if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
      if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
      for (let j = run.length ? 1 : 0; j <= steps; j++) {
        const a = sA + (eA - sA) * (j / steps);
        run.push({ x: seg.cx + Math.sin(a) * seg.r, z: seg.cz + Math.cos(a) * seg.r });
      }
    }
  });
  return run.length > 1 ? [run] : [];
}

/** @param f snímek kreslení z drawCanvas() */
export function drawLowerHalfLayer(f) {
  const { S, ctx, calc, prms, C, toScreen } = f;
  if (!lowerHalfOn(prms)) return;
  const M = (x, z) => toScreen(-x, z);
  const stroke = (runs, col, lw) => {
    ctx.beginPath();
    runs.forEach(run => run.forEach((p, i) => {
      const s = M(p.x, p.z);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    }));
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  };
  ctx.save();
  ctx.setLineDash([]);
  stroke(stockRuns(prms, calc.stockPathSegments, S.view.scale), 'rgba(231,76,60,0.8)', 2);
  if (!calc.profileViewActive) stroke(contourRuns(calc.worldPoints, S.view.scale), C.contour, 2);
  ctx.restore();
}
