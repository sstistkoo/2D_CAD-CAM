// POHLED NA ČELO — pohled podél osy vřetena proti sklíčidlu (soustruh) /
// upínací desce (karusel). Kreslí sklíčidlo/desku s čelistmi, polotovar,
// průměry kontury a operace poháněných nástrojů (díry na čele i na plášti,
// kapsy, drážky). Při přehrávání (▶) jede nástroj po dírách v pořadí NC.
//
// Souřadnice: x vpravo = +X (C 0°, tam stojí nástroj při SPOS), y nahoru =
// C 90°. Rozměry ve světových mm, poloměry (ne průměry).
import { resolvePointsToAbsolute } from '../contourBuild.js';
import { livePositions, millMoves } from './liveModel.js';

const COL = {
  bg: '#1e1e2e', grid: '#313244', body: '#313244', bodyEdge: '#45475a', jaw: '#585b70',
  jawEdge: '#7f849c', slot: '#181825', stock: 'rgba(108,112,134,0.30)', stockEdge: '#6c7086',
  contour: '#89b4fa', axis: '#f38ba8', text: '#a6adc8', drill: '#fab387', radial: '#94e2d5',
  mill: '#cba6f7', tool: '#f9e2af', done: '#a6e3a1',
};

/** Poloměry dílu pro pohled: polotovar, obrys, vývrt, čelo. */
export function livePartGeometry(S) {
  const prms = S.params;
  const half = prms.mode === 'DIAMON' ? 0.5 : 1;
  const pts = resolvePointsToAbsolute(S.contourPoints || []);
  const radii = [];
  let faceZ = -Infinity;
  pts.forEach(p => {
    const r = Math.abs(p.xAbs * half);
    if (r > 0.05) radii.push(+r.toFixed(2));
    if (p.zAbs > faceZ) faceZ = p.zAbs;
  });
  let stockR;
  if (prms.stockMode === 'cylinder') stockR = (parseFloat(prms.stockDiameter) || 0) / 2;
  else {
    stockR = 0;
    resolvePointsToAbsolute(S.stockPoints || []).forEach(p => { stockR = Math.max(stockR, Math.abs(p.xAbs * half)); });
  }
  const uniq = [...new Set(radii)].sort((a, b) => a - b);
  const outerR = uniq.length ? uniq[uniq.length - 1] : stockR;
  if (!(stockR > 0)) stockR = outerR || 50;
  // Vývrt: nejmenší poloměr kontury, pokud kontura k ose nedojde.
  const touchesAxis = pts.some(p => Math.abs(p.xAbs) < 0.05);
  const innerR = !touchesAxis && uniq.length > 1 ? uniq[0] : 0;
  return {
    stockR, outerR: outerR || stockR, innerR, radii: uniq.slice(-12),
    // Výchozí Ø pláště pro nové díry: kontura může (pomocnými body) vyčnívat
    // z polotovaru — materiál ale nikdy není větší než polotovar.
    faceZ: Number.isFinite(faceZ) ? faceZ : 0, outerD: 2 * Math.min(outerR || stockR, stockR),
  };
}

/**
 * Pořadí kroků pro přehrávání: díra po díře, fréza po vzorcích dráhy.
 * [{ op, kind:'hole'|'mill', i, x, y }]
 */
export function liveAnimSteps(ops) {
  const steps = [];
  ops.forEach((op, oi) => {
    if (op.kind === 'mill') {
      let prev = null;
      millMoves(op).forEach(mv => {
        if (mv.k === 'arc' && prev) {
          const r = Math.hypot(prev.x - mv.cx, prev.y - mv.cy);
          let a0 = Math.atan2(prev.y - mv.cy, prev.x - mv.cx), a1 = Math.atan2(mv.y - mv.cy, mv.x - mv.cx);
          if (a1 <= a0) a1 += 2 * Math.PI;
          for (let j = 1; j <= 8; j++) {
            const a = a0 + (a1 - a0) * j / 8;
            steps.push({ op: oi, kind: 'mill', x: mv.cx + r * Math.cos(a), y: mv.cy + r * Math.sin(a) });
          }
        } else steps.push({ op: oi, kind: 'mill', x: mv.x, y: mv.y });
        prev = mv;
      });
    } else {
      livePositions(op).forEach((p, i) => {
        if (op.side === 'radial') {
          const rad = p.a * Math.PI / 180, r = op.xTop / 2;
          steps.push({ op: oi, kind: 'hole', i, x: r * Math.cos(rad), y: r * Math.sin(rad), radial: true });
        } else steps.push({ op: oi, kind: 'hole', i, x: p.x, y: p.y });
      });
    }
  });
  return steps;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param d { prms, geo, ops, selected (index), anim: null | { step } , steps }
 */
export function drawFaceView(canvas, d) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  if (!(w > 0 && h > 0)) return;
  const { prms, geo, ops } = d;
  const isCar = prms.machineStructure === 'carousel';
  const sR = geo.stockR;
  const bodyR = isCar ? Math.max(sR * 1.6, sR + 60) : Math.max(sR * 1.45, sR + 30);
  // Radiální díry a frézy mimo polotovar musí být taky vidět.
  let ext = bodyR;
  ops.forEach(op => { if (op.side === 'radial') ext = Math.max(ext, op.xTop / 2 + op.retract + 10); });
  const sc = (Math.min(w, h) / 2 - 18) / (ext * 1.04);
  const cx = w / 2, cy = h / 2;
  const P = (x, y) => [cx + x * sc, cy - y * sc];
  const circle = (r, fill, stroke, lw = 1, dash) => {
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, r * sc), 0, 2 * Math.PI);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]); }
  };
  const rotRect = (angDeg, r0, r1, halfW, fill, stroke) => {
    const a = angDeg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const pts = [[r0, -halfW], [r1, -halfW], [r1, halfW], [r0, halfW]]
      .map(([u, v]) => P(ux * u + vx * v, uy * u + vy * v));
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  };

  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, w, h);

  // ── sklíčidlo / upínací deska ──
  circle(bodyR, COL.body, COL.bodyEdge, 1.5);
  if (isCar) {
    for (let k = 0; k < 8; k++) rotRect(k * 45 + 22.5, bodyR * 0.18, bodyR * 0.97, Math.max(3 / sc, bodyR * 0.018), COL.slot);
    const jawW = Math.max(8, sR * 0.22);
    [45, 135, 225, 315].forEach(a => rotRect(a, sR, Math.min(bodyR * 0.92, sR + (bodyR - sR) * 0.65), jawW / 2, COL.jaw, COL.jawEdge));
  } else {
    circle(bodyR * 0.22, COL.slot, COL.bodyEdge);
    const jawW = Math.min(Math.max(10, sR * 0.4), 60);
    [90, 210, 330].forEach(a => {
      rotRect(a, sR, bodyR * 0.96, jawW / 2, COL.jaw, COL.jawEdge);
      rotRect(a, bodyR * 0.55, bodyR * 0.96, jawW / 2 + 2, COL.jaw, COL.jawEdge);
    });
  }

  // ── polotovar + průměry kontury ──
  circle(sR, COL.stock, COL.stockEdge, 1.2);
  geo.radii.forEach(r => { if (r < geo.outerR - 1e-6) circle(r, null, 'rgba(137,180,250,0.35)', 1, [4, 4]); });
  circle(geo.outerR, null, COL.contour, 1.6);
  if (geo.innerR > 0) circle(geo.innerR, COL.bg, COL.contour, 1.2);

  // ── osy ──
  ctx.strokeStyle = COL.axis; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(...P(-ext, 0)); ctx.lineTo(...P(ext, 0));
  ctx.moveTo(...P(0, -ext)); ctx.lineTo(...P(0, ext)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = COL.axis; ctx.font = '11px sans-serif';
  ctx.fillText('X+  C0°', P(ext, 0)[0] - 52, P(ext, 0)[1] - 6);
  ctx.fillText('C90°', P(0, ext)[0] + 6, P(0, ext)[1] + 12);

  // ── operace ──
  const anim = d.anim, steps = d.steps || [];
  const doneUpTo = anim ? anim.step : -1;
  const doneHoles = new Set();
  steps.forEach((s, k) => { if (k <= doneUpTo && s.kind === 'hole') doneHoles.add(s.op + ':' + s.i); });
  ops.forEach((op, oi) => {
    const sel = d.selected === oi;
    ctx.globalAlpha = d.selected == null || sel ? 1 : 0.55;
    if (op.kind === 'mill') drawMill(ctx, op, P, sc, sel);
    else if (op.side === 'radial') {
      livePositions(op).forEach((p, i) => {
        const r = op.xTop / 2, done = doneHoles.has(oi + ':' + i);
        rotRect(p.a, r - op.depth, r, op.holeD / 2, done ? 'rgba(166,227,161,0.55)' : 'rgba(148,226,213,0.30)', COL.radial);
        label(ctx, P(...polar(r + 4 + 8 / sc, p.a)), String(i + 1), COL.radial);
      });
    } else {
      if (op.pattern === 'pcd') circle(op.pcd / 2, null, 'rgba(250,179,135,0.55)', 1, [3, 3]);
      livePositions(op).forEach((p, i) => {
        const done = doneHoles.has(oi + ':' + i);
        const [sx, sy] = P(p.x, p.y);
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, op.holeD / 2 * sc), 0, 2 * Math.PI);
        ctx.fillStyle = done ? 'rgba(166,227,161,0.75)' : 'rgba(250,179,135,0.28)'; ctx.fill();
        ctx.strokeStyle = sel ? '#fff' : COL.drill; ctx.lineWidth = sel ? 1.6 : 1.2; ctx.stroke();
        label(ctx, [sx + Math.max(2, op.holeD / 2 * sc) + 3, sy - 3], String(i + 1), COL.drill);
      });
    }
  });
  ctx.globalAlpha = 1;

  // ── nástroj (SPOS: stojí na +X; při přehrávání na aktuální poloze) ──
  if (anim && steps[anim.step] && ops[steps[anim.step].op]) {
    const s = steps[anim.step], op = ops[s.op];
    const tr = op.kind === 'mill' ? op.toolD / 2 : op.holeD / 2;
    const [sx, sy] = P(s.x, s.y);
    ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, tr * sc), 0, 2 * Math.PI);
    ctx.strokeStyle = COL.tool; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = 'rgba(249,226,175,0.35)'; ctx.fill();
  } else if (ops.length) {
    const [sx, sy] = P(Math.min(ext, sR + 12 / sc + 6), 0);
    ctx.fillStyle = COL.tool; ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(sx + 12, sy - 6); ctx.lineTo(sx + 12, sy + 6); ctx.closePath(); ctx.fill();
  }

  // ── popisek ──
  ctx.fillStyle = COL.text; ctx.font = '11px sans-serif';
  ctx.fillText(isCar ? 'Pohled shora na upínací desku' : 'Pohled proti sklíčidlu', 8, h - 22);
  ctx.fillText(`Polotovar Ø${fmt(2 * sR)}  ·  obrys Ø${fmt(2 * geo.outerR)}${geo.innerR > 0 ? `  ·  vývrt Ø${fmt(2 * geo.innerR)}` : ''}`, 8, h - 8);
}

function drawMill(ctx, op, P, sc, sel) {
  ctx.strokeStyle = COL.mill; ctx.fillStyle = 'rgba(203,166,247,0.28)';
  if (op.millType === 'slot') {
    const { x1, y1, x2, y2 } = op.slot;
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(3, op.toolD * sc);
    ctx.strokeStyle = 'rgba(203,166,247,0.40)';
    ctx.beginPath(); ctx.moveTo(...P(x1, y1)); ctx.lineTo(...P(x2, y2)); ctx.stroke();
    ctx.lineWidth = sel ? 1.6 : 1; ctx.strokeStyle = COL.mill; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(...P(x1, y1)); ctx.lineTo(...P(x2, y2)); ctx.stroke();
    return;
  }
  livePositions(op).forEach((p, i) => {
    const [sx, sy] = P(p.x, p.y);
    ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, op.holeD / 2 * sc), 0, 2 * Math.PI);
    ctx.fill(); ctx.lineWidth = sel ? 1.6 : 1.2; ctx.stroke();
    label(ctx, [sx + Math.max(2, op.holeD / 2 * sc) + 3, sy - 3], String(i + 1), COL.mill);
  });
}

function polar(r, aDeg) { const a = aDeg * Math.PI / 180; return [r * Math.cos(a), r * Math.sin(a)]; }
function label(ctx, [x, y], t, col) { ctx.fillStyle = col; ctx.font = '10px sans-serif'; ctx.fillText(t, x, y); }
function fmt(v) { return String(+(+v).toFixed(2)).replace('.', ','); }
