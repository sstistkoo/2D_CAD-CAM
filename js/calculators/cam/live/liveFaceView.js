// POHLED NA ČELO — pohled podél osy vřetena proti sklíčidlu (soustruh) /
// upínací desce (karusel). Kreslí ŘEZ dílu v rovině Z z lišty (liveCut.js:
// plocha řezu, hrany za ním plně / zakryté čárkovaně — jako bokorys v CAD),
// polotovar, značku nuly osy C na kusu a operace poháněných nástrojů (díry
// na čele i na plášti, kapsy, drážky; operace na jiném čele než v rovině
// řezu jsou ztlumené). Při přehrávání (▶) jede nástroj po dírách v pořadí NC.
// Sklíčidlo s čelistmi se nekreslí (jako bokorys v CAD) — zakrývalo díl a
// k orientaci nepomáhalo; tu dává značka C0 (uživatel 18. 10. 2026).
//
// Souřadnice: x vpravo = +X (C 0°, tam stojí nástroj při SPOS), y nahoru =
// C 90°. Rozměry ve světových mm, poloměry (ne průměry).
import { resolvePointsToAbsolute } from '../contourBuild.js';
import { livePositions, millMoves, liveSettings } from './liveModel.js';
import { faceRadius } from '../../../faceView/faceReference.js';

const COL = {
  bg: '#1e1e2e', grid: '#313244', stock: 'rgba(108,112,134,0.30)', stockEdge: '#6c7086',
  contour: '#89b4fa', axis: '#f38ba8', text: '#a6adc8', drill: '#fab387', radial: '#94e2d5',
  mill: '#cba6f7', tool: '#f9e2af', done: '#a6e3a1', zero: '#a6e3a1',
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
 * @param d { prms, geo, ops, selected (index), anim: null | { step } , steps,
 *            cut: null | { z, side, at, view } (liveCutAt) }
 */
export function drawFaceView(canvas, d) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  if (!(w > 0 && h > 0)) return;
  const { prms, geo, ops } = d;
  const isCar = prms.machineStructure === 'carousel';
  const sR = geo.stockR;
  // Obrys (pomocnými body může vyčnívat z polotovaru), radiální díry a frézy
  // mimo polotovar musí být taky vidět.
  let ext = faceRadius(Math.max(sR, geo.outerR || 0));
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

  // ── polotovar + díl (řez v rovině Z, bez řezu všechny průměry) ──
  const cut = d.cut, at = cut && cut.at;
  const sRz = at && at.stockR > 0 ? at.stockR : sR;
  circle(sRz, COL.stock, COL.stockEdge, 1.2);
  if (cut) {
    if (at.outerR > 0) {
      ctx.beginPath(); ctx.arc(cx, cy, at.outerR * sc, 0, 2 * Math.PI);
      if (at.innerR > 0) ctx.arc(cx, cy, at.innerR * sc, 0, 2 * Math.PI, true);
      ctx.fillStyle = 'rgba(137,180,250,0.16)'; ctx.fill('evenodd');
    }
    cut.view.hidden.forEach(r => circle(r, null, 'rgba(137,180,250,0.55)', 0.9, [4, 3]));
    cut.view.visible.forEach(r => circle(r, null, COL.contour, r === at.outerR ? 1.8 : 1.3));
  } else {
    geo.radii.forEach(r => { if (r < geo.outerR - 1e-6) circle(r, null, 'rgba(137,180,250,0.35)', 1, [4, 4]); });
    circle(geo.outerR, null, COL.contour, 1.6);
    if (geo.innerR > 0) circle(geo.innerR, COL.bg, COL.contour, 1.2);
  }

  // ── osy ──
  ctx.strokeStyle = COL.axis; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(...P(-ext, 0)); ctx.lineTo(...P(ext, 0));
  ctx.moveTo(...P(0, -ext)); ctx.lineTo(...P(0, ext)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = COL.axis; ctx.font = '11px sans-serif';
  // Za koncem osy (k okraji plátna) — blíž ke středu vede oblouček +C a
  // pod osou je popisek C0.
  const xl = 'X+  0°', xw = ctx.measureText(xl).width;
  ctx.fillText(xl, Math.min(P(ext, 0)[0] + 4, w - 4 - xw), P(ext, 0)[1] - 8);
  ctx.fillText('90°', P(0, ext)[0] + 6, P(0, ext)[1] + 12);

  // ── operace ──
  const anim = d.anim, steps = d.steps || [];
  const doneUpTo = anim ? anim.step : -1;
  const doneHoles = new Set();
  steps.forEach((s, k) => { if (k <= doneUpTo && s.kind === 'hole') doneHoles.add(s.op + ':' + s.i); });
  ops.forEach((op, oi) => {
    const sel = d.selected === oi;
    // Díry do čela jiného než v rovině řezu — ztlumit (víc čel na dílu).
    const other = cut && op.side !== 'radial' && Math.abs(op.zTop - cut.z) > 0.5;
    ctx.globalAlpha = other && !sel ? 0.28 : (d.selected == null || sel ? 1 : 0.55);
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

  // ── nula osy C na kusu (nad operacemi, ať ji díra na okraji nezakryje) ──
  const rPart = at && at.outerR > 0 ? at.outerR : (geo.outerR || sR);
  drawCZero(ctx, cx, cy, Math.min(rPart, sRz) * sc, liveSettings(prms));

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
  const left = cut && cut.side === 'left';
  const how = isCar ? (left ? 'pohled zdola' : 'pohled shora na upínací desku') : (left ? 'pohled od sklíčidla' : 'pohled proti sklíčidlu');
  ctx.fillText(cut ? `Řez Z${fmt(cut.z)} ${left ? '▶ zleva' : '◀ zprava'}  ·  ${how}` : how[0].toUpperCase() + how.slice(1), 8, h - 22);
  const outR = cut ? at.outerR : geo.outerR, inR = cut ? at.innerR : geo.innerR;
  ctx.fillText(`Polotovar Ø${fmt(2 * sRz)}${outR > 0 ? `  ·  ${cut ? 'v řezu' : 'obrys'} Ø${fmt(2 * outR)}` : ''}${inR > 0 ? `  ·  vývrt Ø${fmt(2 * inR)}` : ''}`, 8, h - 8);
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

/**
 * Značka nuly osy C na obvodu kusu: zářez s popiskem „C0" a oblouček „+C"
 * (kudy úhel osy C roste). Poloha podle kalibrace stroje: úhel v NC =
 * offset + směr · úhel výkresu → C0 leží na úhlu výkresu −směr · offset.
 * Bez kalibrace je to +X — tam, kde při SPOS stojí nástroj.
 */
function drawCZero(ctx, cx, cy, rPx, set) {
  if (!(rPx > 4)) return;
  const a0 = -set.angleDir * set.angleOffset * Math.PI / 180;
  const dir = set.angleDir;
  const ux = Math.cos(a0), uy = -Math.sin(a0);     // obrazovka: y dolů
  const vx = -uy, vy = ux;
  const ex = cx + ux * rPx, ey = cy + uy * rPx;
  ctx.save();
  // zářez: trojúhelník od okraje dovnitř
  ctx.beginPath();
  ctx.moveTo(ex + ux * 4 + vx * 6, ey + uy * 4 + vy * 6);
  ctx.lineTo(ex + ux * 4 - vx * 6, ey + uy * 4 - vy * 6);
  ctx.lineTo(ex - ux * 10, ey - uy * 10);
  ctx.closePath();
  ctx.fillStyle = COL.zero; ctx.fill();
  ctx.strokeStyle = COL.bg; ctx.lineWidth = 1; ctx.stroke();
  // Popisek vně obvodu na straně PROTI obloučku +C (uvnitř by kryl díru
  // na 0°, kde vrtání začíná nejčastěji). (vx, vy) míří k menšímu úhlu.
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const t = 'C0', tw = ctx.measureText(t).width;
  const lx = ex + ux * 9 + dir * vx * 14, ly = ey + uy * 9 + dir * vy * 14;
  ctx.fillStyle = 'rgba(30,30,46,0.85)';
  ctx.fillRect(lx - tw / 2 - 3, ly - 7, tw + 6, 14);
  ctx.fillStyle = COL.zero; ctx.fillText(t, lx, ly);
  // oblouček +C vně obvodu (úhel výkresu roste proti směru hodin, tj. −y obrazovky)
  const r = rPx + 9, s0 = -(a0 + dir * 0.10), s1 = -(a0 + dir * 0.60);
  ctx.beginPath(); ctx.arc(cx, cy, r, s0, s1, dir > 0);
  ctx.strokeStyle = COL.zero; ctx.lineWidth = 1.4; ctx.stroke();
  const hx = cx + r * Math.cos(s1), hy = cy + r * Math.sin(s1);
  // tečna ve směru pohybu po oblouku
  const tx = dir > 0 ? Math.sin(s1) : -Math.sin(s1), ty = dir > 0 ? -Math.cos(s1) : Math.cos(s1);
  ctx.beginPath(); ctx.moveTo(hx + tx * 7, hy + ty * 7);
  ctx.lineTo(hx - ty * 4, hy + tx * 4); ctx.lineTo(hx + ty * 4, hy - tx * 4); ctx.closePath();
  ctx.fillStyle = COL.zero; ctx.fill();
  const sm = -(a0 + dir * 0.35);
  ctx.font = '10px sans-serif';
  ctx.fillText('+C', cx + (r + 11) * Math.cos(sm), cy + (r + 11) * Math.sin(sm));
  ctx.restore();
}

function polar(r, aDeg) { const a = aDeg * Math.PI / 180; return [r * Math.cos(a), r * Math.sin(a)]; }
function label(ctx, [x, y], t, col) { ctx.fillStyle = col; ctx.font = '10px sans-serif'; ctx.fillText(t, x, y); }
function fmt(v) { return String(+(+v).toFixed(2)).replace('.', ','); }
