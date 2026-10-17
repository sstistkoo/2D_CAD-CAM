// Operace poháněných nástrojů v ŘEZU (hlavní plátno CAM). Díra mimo osu se
// do řezu „sklopí" (jako na výkrese): díra do čela na poloměru r se kreslí
// jako obdélník Ø díry × hloubka na r, radiální díra jako obdélník od pláště
// dovnitř ve výšce Z, kapsa / drážka jako obdélník přes svůj rozsah poloměrů.
// Jen náhled — úběr materiálu soustružení se tím nemění.
import { getLiveOps, livePositions, faceOut } from './liveModel.js';

/** @param f snímek z drawCanvas.js ({ S, ctx, toScreen, prms }) */
export function drawLiveSectionLayer(f) {
  const ops = getLiveOps(f.prms);
  if (!ops.length) return;
  const { ctx, toScreen } = f;
  const rect = (x0, x1, z0, z1, fill, stroke) => {
    const pts = [toScreen(x0, z0), toScreen(x1, z0), toScreen(x1, z1), toScreen(x0, z1)];
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.setLineDash([4, 3]); ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
  };
  ctx.save();
  ops.forEach(op => {
    const zEnd = op.zTop - faceOut(op) * op.depth;   // dno díry (čelo zleva → hloubka do +Z)
    if (op.kind === 'mill') {
      const tr = op.toolD / 2;
      let r0, r1;
      if (op.millType === 'slot') {
        const { x1, y1, x2, y2 } = op.slot;
        const ends = [Math.hypot(x1, y1), Math.hypot(x2, y2)];
        // Nejbližší bod úsečky k ose (drážka přes střed má r = 0).
        const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
        const t = L2 > 0 ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / L2)) : 0;
        r0 = Math.max(0, Math.hypot(x1 + dx * t, y1 + dy * t) - tr); r1 = Math.max(...ends) + tr;
        rect(r0, r1, op.zTop, zEnd, 'rgba(203,166,247,0.22)', '#cba6f7');
      } else {
        const seen = new Set();
        livePositions(op).forEach(p => {
          const k = p.r.toFixed(2); if (seen.has(k)) return; seen.add(k);
          r0 = Math.max(0, p.r - op.holeD / 2); r1 = p.r + op.holeD / 2;
          rect(r0, r1, op.zTop, zEnd, 'rgba(203,166,247,0.22)', '#cba6f7');
        });
      }
      return;
    }
    const hd = op.holeD / 2;
    const seen = new Set();
    livePositions(op).forEach(p => {
      if (op.side === 'radial') {
        const k = p.z.toFixed(2); if (seen.has(k)) return; seen.add(k);
        const rX = op.xTop / 2;
        rect(rX - op.depth, rX, p.z - hd, p.z + hd, 'rgba(148,226,213,0.22)', '#94e2d5');
      } else {
        const k = p.r.toFixed(2); if (seen.has(k)) return; seen.add(k);
        rect(p.r - hd, p.r + hd, op.zTop, zEnd, 'rgba(250,179,135,0.22)', '#fab387');
        // Špička vrtáku 118°.
        const tip = toScreen(p.r, zEnd - faceOut(op) * hd * 0.6);
        const a = toScreen(p.r - hd, zEnd), b = toScreen(p.r + hd, zEnd);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = '#fab387'; ctx.lineWidth = 1; ctx.stroke();
      }
    });
  });
  ctx.restore();
}
