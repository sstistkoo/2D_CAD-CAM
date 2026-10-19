// Operace poháněných nástrojů v ŘEZU (hlavní plátno CAM). Díra mimo osu se
// do řezu „sklopí" (jako na výkrese): díra do čela na poloměru r se kreslí
// jako obdélník Ø díry × hloubka na r, radiální díra jako obdélník od pláště
// dovnitř ve výšce Z, kapsa / drážka jako obdélník přes svůj rozsah poloměrů.
// Bez obrábění jen náhled (čárkovaně, průsvitně); při obrábění
// (liveMachining.js) se odebraný materiál do dosažené hloubky vybarví barvou
// pozadí jako úběr soustružení. Úběr materiálu soustružení se nemění.
import { getLiveOps, livePositions, faceOut } from './liveModel.js';

const COLS = { drill: ['rgba(250,179,135,0.22)', '#fab387'], radial: ['rgba(148,226,213,0.22)', '#94e2d5'], mill: ['rgba(203,166,247,0.22)', '#cba6f7'] };

/**
 * @param f snímek z drawCanvas.js ({ S, ctx, toScreen, prms, C })
 * @param mach stav obrábění (liveStateAt) nebo null = jen náhled
 */
export function drawLiveSectionLayer(f, mach = null) {
  const ops = getLiveOps(f.prms);
  if (!ops.length) return;
  const { ctx, toScreen } = f;
  const voidCol = (f.C && f.C.bg) || '#1e1e2e';
  const path = (x0, x1, z0, z1) => {
    const pts = [toScreen(x0, z0), toScreen(x1, z0), toScreen(x1, z1), toScreen(x0, z1)];
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
  };
  // Plán: průsvitně + čárkovaně (při obrábění jen čárkovaný obrys).
  const plan = (x0, x1, z0, z1, kind) => {
    path(x0, x1, z0, z1);
    if (!mach) { ctx.fillStyle = COLS[kind][0]; ctx.fill(); }
    ctx.setLineDash([4, 3]); ctx.strokeStyle = COLS[kind][1]; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
  };
  // Odebráno: barva pozadí (jako úběr soustružení) a plný okraj.
  const cut = (x0, x1, z0, z1, kind) => {
    path(x0, x1, z0, z1);
    ctx.fillStyle = voidCol; ctx.fill();
    ctx.strokeStyle = COLS[kind][1]; ctx.lineWidth = 1.2; ctx.stroke();
  };
  // Díry na stejném poloměru (rozteč) se v řezu kryjí — nejhlubší z nich.
  const byKey = (op, oi, keyOf) => {
    const m = new Map();
    livePositions(op).forEach((p, i) => {
      const k = keyOf(p).toFixed(2), d = mach ? (mach.depth.get(`${oi}:${i}`) || 0) : 0;
      const e = m.get(k);
      if (!e) m.set(k, { p, d }); else e.d = Math.max(e.d, d);
    });
    return [...m.values()];
  };
  ctx.save();
  ops.forEach((op, oi) => {
    const out = faceOut(op);   // čelo zleva → hloubka do +Z
    const zAt = d => op.zTop - out * d;
    if (op.kind === 'mill') {
      const tr = op.toolD / 2;
      const spans = [];
      if (op.millType === 'slot') {
        const { x1, y1, x2, y2 } = op.slot;
        // Nejbližší bod úsečky k ose (drážka přes střed má r = 0).
        const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
        const t = L2 > 0 ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / L2)) : 0;
        const d = mach ? (mach.depth.get(`${oi}:0`) || 0) : 0;
        spans.push({ r0: Math.max(0, Math.hypot(x1 + dx * t, y1 + dy * t) - tr), r1: Math.max(Math.hypot(x1, y1), Math.hypot(x2, y2)) + tr, d });
      } else {
        byKey(op, oi, p => p.r).forEach(({ p, d }) => spans.push({ r0: Math.max(0, p.r - op.holeD / 2), r1: p.r + op.holeD / 2, d }));
      }
      spans.forEach(s => {
        plan(s.r0, s.r1, op.zTop, zAt(op.depth), 'mill');
        if (s.d > 0) cut(s.r0, s.r1, op.zTop, zAt(Math.min(s.d, op.depth)), 'mill');
      });
      return;
    }
    const hd = op.holeD / 2;
    if (op.side === 'radial') {
      const rX = op.xTop / 2;
      byKey(op, oi, p => p.z).forEach(({ p, d }) => {
        plan(rX - op.depth, rX, p.z - hd, p.z + hd, 'radial');
        if (d > 0) cut(rX - Math.min(d, op.depth), rX, p.z - hd, p.z + hd, 'radial');
      });
      return;
    }
    byKey(op, oi, p => p.r).forEach(({ p, d }) => {
      plan(p.r - hd, p.r + hd, op.zTop, zAt(op.depth), 'drill');
      if (d > 0) cut(p.r - hd, p.r + hd, op.zTop, zAt(Math.min(d, op.depth)), 'drill');
      // Špička vrtáku 118° (na dně plánu, při obrábění na dosažené hloubce).
      const dTip = mach ? Math.min(Math.max(d, 0), op.depth) : op.depth;
      if (mach && !(d > 0)) return;
      const zEnd = zAt(dTip);
      const tip = toScreen(p.r, zEnd - out * hd * 0.6);
      const a = toScreen(p.r - hd, zEnd), b = toScreen(p.r + hd, zEnd);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(b.x, b.y);
      if (mach) { ctx.fillStyle = voidCol; ctx.fill(); }
      ctx.strokeStyle = COLS.drill[1]; ctx.lineWidth = 1; ctx.stroke();
    });
  });
  ctx.restore();
}
