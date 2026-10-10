// ╔══════════════════════════════════════════════════════════════╗
// ║  VYVRTÁVÁNÍ — kolize tyče s DÍLEM ve skutečném světě           ║
// ╚══════════════════════════════════════════════════════════════╝
// Simulace vyvrtávání běží v ZRCADLE (cam/ops/bore.js): zrcadlový polotovar je
// jen válec předvrtání, takže zrcadlový validátor, HolderGouge ani ContourGouge
// nevidí nic mimo díru — plné dno dílu, mezikruží kolem ústí, vnější stěnu.
// Tyč, která tudy projela (nález uživatele 9. 10. 2026: Bp Z5 za dílem →
// rychloposuv osou skrz plné dno), se proto nezobrazila červeně ani v ⛔.
//
// Tady se dráha tyče zametá VE SKUTEČNÉM SVĚTĚ proti obrysu hotového dílu
// (kontura, díra v ní už je): držák i destička při rychloposuvu, držák (bez
// destičky) při řezu. Tyč je vnější nůž převrácený k ose: vnitřní svět kreslí
// simulace s x → −x, tady stejně.

import { holderWorldLoop } from './collisionValidator.js';
import { toolFootprintVisual } from './materialRemoval.js';
import { toolSweep, polyArea, polyIntersect, polyDifference, polyOffset } from '../../geom/geomCore.js';

const TOL = 0.5;       // nejmenší průnik [mm²] — jako validátor
const SHRINK = 0.05;   // zmenšení obrysů proti falešným dotykům [mm]

const flipX = (loop) => loop.map(q => ({ x: -q.x, z: q.z }));
const shrink = (loop) => { try { return polyOffset([loop], -SHRINK)[0] || loop; } catch { return loop; } };

/** Obrys hotového dílu z kontury (světové souřadnice x = poloměr, z); oblouky tětivou. */
export function partLoopOf(calc) {
  const pts = ((calc && calc.worldPoints) || [])
    .map(p => ({ x: p.xReal, z: p.zReal }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.z));
  return pts.length >= 3 ? pts : null;
}

/**
 * Kolize dráhy tyče s hotovým dílem.
 * @param prms     parametry (tvar tyče a držáku)
 * @param simPath  dráha (jen úsek tyče), body {x, z, type, originalLineIdx}
 * @param part     obrys dílu (partLoopOf)
 * @returns {Array<{endIdx:number, kind:'rapid'|'holder', lineIdx:number|null, x:number, z:number, area:number, loops:Array}>}
 *   endIdx = index bodu simPath, kterým blok končí (pro postupné vybarvování)
 */
export function boreRealCollisions(prms, simPath, part, { maxIssues = 40, maxBlocks = 6000 } = {}) {
  const out = [];
  if (!part || !Array.isArray(simPath) || simPath.length < 2) return out;
  const insRaw = toolFootprintVisual(prms);
  // Zleva (druhé upnutí) leží držák na −Z strany — táž „zpětná" strana jako v simulaci.
  const holRaw = holderWorldLoop(prms, prms.roughingSide === 'left');
  if (!holRaw || holRaw.length < 3) return out;
  const ins = insRaw && insRaw.length >= 3 ? flipX(insRaw) : null;
  const hol = flipX(holRaw);
  let holCut = hol;
  if (ins) { try { holCut = polyDifference([hol], [ins])[0] || hol; } catch { holCut = hol; } }
  const insS = ins ? shrink(ins) : null, holS = shrink(hol), holCutS = shrink(holCut);
  const bbox = (loop) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of loop) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    return { x0, x1, z0, z1 };
  };
  const pb = bbox(part);
  // Bloky = po sobě jdoucí body dráhy se stejným řádkem a typem pohybu (jako validátor).
  let cur = null;
  const blocks = [];
  for (let i = 1; i < simPath.length; i++) {
    const p = simPath[i];
    const li = p.originalLineIdx ?? (cur ? cur.lineIdx : null);
    const type = p.type || 'G0';
    if (!cur || li !== cur.lineIdx || type !== cur.type) {
      cur = { lineIdx: li, type, pts: [simPath[i - 1], p], endIdx: i };
      blocks.push(cur);
    } else { cur.pts.push(p); cur.endIdx = i; }
  }
  const hit = (loop, pts) => {
    const sweep = toolSweep(loop, pts);
    if (!sweep || !sweep.length) return null;
    const b = bbox(sweep.flat());
    if (b.x1 < pb.x0 || b.x0 > pb.x1 || b.z1 < pb.z0 || b.z0 > pb.z1) return null;
    let inter;
    try { inter = polyIntersect(sweep, [part]); } catch { return null; }
    const area = Math.abs(polyArea(inter));
    return area > TOL ? { area, loops: inter } : null;
  };
  let nBlocks = 0;
  for (const blk of blocks) {
    if (out.length >= maxIssues) { out.truncated = 'issues'; break; }
    if (++nBlocks > maxBlocks) { out.truncated = 'blocks'; break; }
    const pts = [];
    for (const p of blk.pts) {
      const l = pts[pts.length - 1];
      if (!l || Math.hypot(p.x - l.x, p.z - l.z) > 1e-9) pts.push({ x: p.x, z: p.z });
    }
    if (pts.length < 2) continue;
    const rapid = blk.type === 'G0';
    let worst = null;
    for (const loop of rapid ? [insS, holS] : [holCutS]) {
      if (!loop) continue;
      const h = hit(loop, pts);
      if (h && (!worst || h.area > worst.area)) worst = h;
    }
    if (worst) out.push({ endIdx: blk.endIdx, kind: rapid ? 'rapid' : 'holder', lineIdx: blk.lineIdx, x: pts[0].x, z: pts[0].z, area: worst.area, loops: worst.loops });
  }
  return out;
}
