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
// Při obrábění se kus natáčí k nástroji (mach.rot, liveMachining.js) — výšky
// děr v řezu se počítají z natočeného úhlu, takže díra pod nástrojem je
// nahoře (X+); vrták / fréza se kreslí na dosažené hloubce.
// KARUSEL: rovina řezu leží v pohledu na čelo VODOROVNĚ (C 0° = X+, jako
// nárys CAD — faceFrontView bere u karuselu vodorovnou souřadnici bokorysu),
// takže výška v řezu = r·cos C; nástroj vpravo (0°) je na poloměru díry.
// Dřív r·sin C i u karuselu — vrták se kreslil na ose (21. 10. 2026).
import { getLiveOps, livePositions, faceOut, isKeyway, keywaySpan } from './liveModel.js';

const COLS = { drill: ['rgba(250,179,135,0.22)', '#fab387'], radial: ['rgba(148,226,213,0.22)', '#94e2d5'], mill: ['rgba(203,166,247,0.22)', '#cba6f7'] };
const EPS = 1e-6;

/** Úhel v pohledu na čelo, který v řezu míří k +X: soustruh 90° (nahoru), karusel 0°. */
export const sectBase = prms => (prms && prms.machineStructure === 'carousel' ? 0 : 90);

/** Výška bodu (úhel a [°], poloměr r) v řezu: r·cos(a − base). */
export const sectHeight = (a, r, base = 90) => r * Math.cos((a - base) * Math.PI / 180);

/** Patří poloha (úhel C ve stupních) do spodní poloviny řezu? `base` viz sectBase. */
export const lowerAt = (a, base) => sectHeight(a, 1, base) < -EPS;
/** Totéž pro soustruh (jeden argument — jde do .map). */
export const lowerAngle = a => lowerAt(a, 90);

/**
 * Rozsah výšek operace do čela v řezu [od, do] pro každou polohu (díra,
 * kapsa) nebo drážku — soustruh: svislá souřadnice v pohledu na čelo,
 * karusel (base 0): vodorovná.
 * @returns {{ y0:number, y1:number, i:number }[]} i = index polohy (stav obrábění)
 */
export function faceSpans(op, rot = 0, base = 90) {
  const c = Math.cos(rot * Math.PI / 180), s = Math.sin(rot * Math.PI / 180);
  const cb = Math.round(Math.cos(base * Math.PI / 180) * 1e12) / 1e12, sb = Math.round(Math.sin(base * Math.PI / 180) * 1e12) / 1e12;
  // Výška bodu kusu natočeného o rot (průmět do směru base).
  const Y = (x, y) => (x * c - y * s) * cb + (x * s + y * c) * sb;
  if (op.kind === 'mill' && op.millType === 'slot') {
    const { x1, y1, x2, y2 } = op.slot, tr = op.toolD / 2;
    const a = Y(x1, y1), b = Y(x2, y2);
    return [{ y0: Math.min(a, b) - tr, y1: Math.max(a, b) + tr, i: 0 }];
  }
  const h = op.holeD / 2;
  return livePositions(op).map((p, i) => { const y = Y(p.x, p.y); return { y0: y - h, y1: y + h, i }; });
}

/**
 * @param f snímek z drawCanvas.js ({ S, ctx, toScreen, prms, C })
 * @param mach stav obrábění (liveStateAt) nebo null = jen náhled
 */
export function drawLiveSectionLayer(f, mach = null) {
  const ops = getLiveOps(f.prms);
  if (!ops.length) return;
  const { ctx, toScreen } = f;
  const rot = mach && mach.active ? (mach.rot || 0) : 0;
  const base = sectBase(f.prms);
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
    if (op.enabled === false) return;   // nevybraná skupina děr se nevrtá
    const out = faceOut(op);   // čelo zleva → hloubka do +Z
    const zAt = d => op.zTop - out * d;
    if (op.side === 'radial') {
      const rX = op.xTop / 2, hd = op.holeD / 2;
      const items = livePositions(op).map((p, i) => ({ s: lowerAt(p.a + rot, base) ? -1 : 1, z: p.z, i }))
        .map(it => ({ ...it, key: `${it.s}|${it.z.toFixed(2)}` }));
      // Drážka pro pero: v Z celá délka drážky, ne jen Ø nástroje.
      const kw = isKeyway(op) ? keywaySpan(op) : null;
      merged(items, oi).forEach(({ s, z, d }) => {
        const z0 = kw ? kw.zMin : z - hd, z1 = kw ? kw.zMax : z + hd;
        plan(s * (rX - op.depth), s * rX, z0, z1, kw ? 'mill' : 'radial');
        if (d > 0) cut(s * (rX - Math.min(d, op.depth)), s * rX, z0, z1, kw ? 'mill' : 'radial');
      });
      return;
    }
    const kind = op.kind === 'mill' ? 'mill' : 'drill';
    const items = faceSpans(op, rot, base).map(sp => ({ ...sp, key: `${sp.y0.toFixed(2)}|${sp.y1.toFixed(2)}` }));
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
  if (mach && mach.active && mach.tool && ops[mach.tool.op]) drawSectionTool(ctx, toScreen, ops[mach.tool.op], mach.tool, rot, base);
  ctx.restore();
}

/**
 * Poháněný nástroj v řezu: vrták se špičkou / fréza na dosažené hloubce, ve
 * výšce bodu pod nástrojem (kus natočený o rot → nahoře u X+), radiální vrták
 * od pláště ven.
 */
function drawSectionTool(ctx, toScreen, op, tl, rot, base = 90) {
  const box = (x0, x1, z0, z1) => {
    const pts = [toScreen(x0, z0), toScreen(x1, z0), toScreen(x1, z1), toScreen(x0, z1)];
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
    ctx.fillStyle = 'rgba(249,226,175,0.55)'; ctx.fill();
    ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 1.4; ctx.stroke();
  };
  const dia = op.kind === 'mill' ? op.toolD : op.holeD, hd = dia / 2, L = Math.max(3 * dia, 25);
  const rr = Math.hypot(tl.x, tl.y), ang = Math.atan2(tl.y, tl.x) * 180 / Math.PI + rot;
  if (op.side === 'radial') {
    const sg = lowerAt(ang, base) ? -1 : 1;
    box(sg * rr, sg * (rr + L), tl.z - hd, tl.z + hd);
    return;
  }
  const y = sectHeight(ang, rr, base), out = faceOut(op);
  const cone = op.kind === 'drill' ? 0.3 * dia : 0;   // špička 118°
  box(y - hd, y + hd, tl.z + out * cone, tl.z + out * L);
  if (!cone) return;
  const a = toScreen(y - hd, tl.z + out * cone), b = toScreen(y + hd, tl.z + out * cone), t = toScreen(y, tl.z);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(t.x, t.y); ctx.lineTo(b.x, b.y); ctx.closePath();
  ctx.fillStyle = 'rgba(249,226,175,0.55)'; ctx.fill(); ctx.strokeStyle = '#f9e2af'; ctx.stroke();
}
