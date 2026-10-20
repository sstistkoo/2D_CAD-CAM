// Operace poháněných nástrojů v ŘEZU (hlavní plátno CAM) — stejně jako díry
// v nárysu CAD (faceView/faceFrontView.js): díra do čela se kreslí ve výšce
// své SVISLÉ polohy v pohledu na čelo (y = r·sin C — C 0° a 180° leží na
// ose Z, 90° nahoře, 270° dole; dřív se sklápěla na poloměr a díra na ose
// v řezu nebyla, uživatel 20. 10. 2026) jako obdélník Ø díry × hloubka,
// kapsa stejně, drážka přes svůj rozsah y. Radiální díra (do pláště) se
// sklopí od pláště dovnitř: C 0°…180° nad osu, 180°…360° pod osu. Spodní
// polovinu řezu (konturu a polotovar) kreslí cam/sim/drawLowerHalf.js.
// Bez obrábění jen náhled (čárkovaně, průsvitně); při obrábění
// (liveMachining.js) se odebraný materiál do dosažené hloubky vybarví barvou
// pozadí jako úběr soustružení. Úběr materiálu soustružení se nemění.
import { getLiveOps, livePositions, faceOut } from './liveModel.js';

const COLS = { drill: ['rgba(250,179,135,0.22)', '#fab387'], radial: ['rgba(148,226,213,0.22)', '#94e2d5'], mill: ['rgba(203,166,247,0.22)', '#cba6f7'] };
const EPS = 1e-6;

/** Patří poloha (úhel C ve stupních) do spodní poloviny řezu? */
export const lowerAngle = a => Math.sin(a * Math.PI / 180) < -EPS;

/**
 * Rozsah výšek operace do čela v řezu [od, do] pro každou polohu (díra,
 * kapsa) nebo drážku — y = svislá souřadnice v pohledu na čelo.
 * @returns {{ y0:number, y1:number, i:number }[]} i = index polohy (stav obrábění)
 */
export function faceSpans(op) {
  if (op.kind === 'mill' && op.millType === 'slot') {
    const { y1, y2 } = op.slot, tr = op.toolD / 2;
    return [{ y0: Math.min(y1, y2) - tr, y1: Math.max(y1, y2) + tr, i: 0 }];
  }
  const h = op.holeD / 2;
  return livePositions(op).map((p, i) => ({ y0: p.y - h, y1: p.y + h, i }));
}

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
  // Polohy se stejnou výškou v řezu se kryjí (C 0° a 180°, C 60° a 120° …) —
  // nejhlubší z nich.
  const merged = (items, oi) => {
    const m = new Map();
    items.forEach(it => {
      const d = mach ? (mach.depth.get(`${oi}:${it.i}`) || 0) : 0;
      const e = m.get(it.key);
      if (!e) m.set(it.key, { ...it, d }); else e.d = Math.max(e.d, d);
    });
    return [...m.values()];
  };
  ctx.save();
  ops.forEach((op, oi) => {
    const out = faceOut(op);   // čelo zleva → hloubka do +Z
    const zAt = d => op.zTop - out * d;
    if (op.side === 'radial') {
      const rX = op.xTop / 2, hd = op.holeD / 2;
      const items = livePositions(op).map((p, i) => ({ s: lowerAngle(p.a) ? -1 : 1, z: p.z, i }))
        .map(it => ({ ...it, key: `${it.s}|${it.z.toFixed(2)}` }));
      merged(items, oi).forEach(({ s, z, d }) => {
        plan(s * (rX - op.depth), s * rX, z - hd, z + hd, 'radial');
        if (d > 0) cut(s * (rX - Math.min(d, op.depth)), s * rX, z - hd, z + hd, 'radial');
      });
      return;
    }
    const kind = op.kind === 'mill' ? 'mill' : 'drill';
    const items = faceSpans(op).map(sp => ({ ...sp, key: `${sp.y0.toFixed(2)}|${sp.y1.toFixed(2)}` }));
    merged(items, oi).forEach(({ y0, y1, d }) => {
      plan(y0, y1, op.zTop, zAt(op.depth), kind);
      if (d > 0) cut(y0, y1, op.zTop, zAt(Math.min(d, op.depth)), kind);
      if (kind !== 'drill') return;
      // Špička vrtáku 118° (na dně plánu, při obrábění na dosažené hloubce).
      const hd = (y1 - y0) / 2, c = (y0 + y1) / 2;
      const dTip = mach ? Math.min(Math.max(d, 0), op.depth) : op.depth;
      if (mach && !(d > 0)) return;
      const zEnd = zAt(dTip);
      const tip = toScreen(c, zEnd - out * hd * 0.6);
      const a = toScreen(y0, zEnd), b = toScreen(y1, zEnd);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(b.x, b.y);
      if (mach) { ctx.fillStyle = voidCol; ctx.fill(); }
      ctx.strokeStyle = COLS.drill[1]; ctx.lineWidth = 1; ctx.stroke();
    });
  });
  ctx.restore();
}
