// POHLED NA ČELO — pohled podél osy vřetena proti sklíčidlu (soustruh) /
// upínací desce (karusel). Kreslí ŘEZ dílu v rovině Z z lišty (liveCut.js:
// plocha řezu, hrany za ním plně / zakryté čárkovaně — jako bokorys v CAD),
// polotovar (jako v CAD: čerchovaně se dvěma tečkami v rovině řezu i větší
// polotovar za ní ve směru pohledu), značku nuly osy C na kusu a operace poháněných nástrojů (díry
// na čele i na plášti, kapsy, drážky; operace na jiném čele než v rovině
// řezu jsou ztlumené). Obrábění (liveMachining.js, ▶ nebo konec soustružení):
// neobrobené díry čárkovaně, obrobené jako prázdný materiál podle dosažené
// hloubky, stopa frézy, nástroj na své poloze a stav nahoře vlevo.
// Sklíčidlo s čelistmi se nekreslí (jako bokorys v CAD) — zakrývalo díl a
// k orientaci nepomáhalo; tu dává značka C0 (uživatel 18. 10. 2026).
// Nálezy kontroly proti dílu (liveChecks.js) — díry s chybou červený
// obrys, s upozorněním žlutý, počet nálezů dole nad popiskem.
//
// Souřadnice: x vpravo = +X (C 0°, tam stojí nástroj při SPOS), y nahoru =
// C 90°. Rozměry ve světových mm, poloměry (ne průměry).
import { resolvePointsToAbsolute } from '../contourBuild.js';
import { livePositions, liveSettings } from './liveModel.js';
import { faceRadius } from '../../../faceView/faceReference.js';

const COL = {
  bg: '#1e1e2e', grid: '#313244', stock: 'rgba(108,112,134,0.30)', stockEdge: '#fab387',
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
 * @param {HTMLCanvasElement} canvas
 * @param d { prms, geo, ops, selected (index),
 *            mach: null | liveStateAt() (+ paused) — obrábění, null = jen plán,
 *            cut: null | { z, side, at, view } (liveCutAt),
 *            nav: null | { zoom, panX, panY } (liveFaceNav.js),
 *            checks: null | checkLiveOps() (liveChecks.js) }
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
  const nav = d.nav || { zoom: 1, panX: 0, panY: 0 };
  const sc = (Math.min(w, h) / 2 - 18) / (ext * 1.04) * nav.zoom;
  const cx = w / 2 + nav.panX, cy = h / 2 + nav.panY;
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
  // Polotovar jako bokorys v CAD: v rovině řezu vyplněný, obrys a větší
  // polotovar za řezem čerchovaně se dvěma tečkami (uživatel 20. 10. 2026).
  circle(sRz, COL.stock, null);
  const stockBehind = cut && cut.stockView ? cut.stockView.visible.filter(r => Math.abs(r - sRz) > 0.05) : [];
  [sRz, ...stockBehind].forEach(r => circle(r, null, COL.stockEdge, 1.3, [10, 3, 2, 3, 2, 3]));
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

  // ── operace: plán (průsvitně) nebo obrábění (odebraný materiál) ──
  const mach = d.mach;
  ops.forEach((op, oi) => {
    const sel = d.selected === oi;
    // Díry do čela jiného než v rovině řezu — ztlumit (víc čel na dílu).
    const other = cut && op.side !== 'radial' && Math.abs(op.zTop - cut.z) > 0.5;
    ctx.globalAlpha = other && !sel ? 0.28 : (d.selected == null || sel ? 1 : 0.55);
    if (op.kind !== 'mill' && op.side !== 'radial' && op.pattern === 'pcd') circle(op.pcd / 2, null, 'rgba(250,179,135,0.55)', 1, [3, 3]);
    if (mach) drawMachOp(ctx, op, oi, mach, P, sc, sel, rotRect);
    else if (op.kind === 'mill') drawMill(ctx, op, P, sc, sel);
    else if (op.side === 'radial') {
      livePositions(op).forEach((p, i) => {
        const r = op.xTop / 2;
        rotRect(p.a, r - op.depth, r, op.holeD / 2, 'rgba(148,226,213,0.30)', COL.radial);
        label(ctx, P(...polar(r + 4 + 8 / sc, p.a)), String(i + 1), COL.radial);
      });
    } else {
      livePositions(op).forEach((p, i) => {
        const [sx, sy] = P(p.x, p.y);
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, op.holeD / 2 * sc), 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(250,179,135,0.28)'; ctx.fill();
        ctx.strokeStyle = sel ? '#fff' : COL.drill; ctx.lineWidth = sel ? 1.6 : 1.2; ctx.stroke();
        label(ctx, [sx + Math.max(2, op.holeD / 2 * sc) + 3, sy - 3], String(i + 1), COL.drill);
      });
    }
  });
  ctx.globalAlpha = 1;
  if (d.checks) drawCheckMarks(ctx, ops, d.checks, cut, P, sc, rotRect);

  // ── nula osy C na kusu (nad operacemi, ať ji díra na okraji nezakryje) ──
  const rPart = at && at.outerR > 0 ? at.outerR : (geo.outerR || sR);
  drawCZero(ctx, cx, cy, Math.min(rPart, sRz) * sc, liveSettings(prms));

  // ── nástroj (SPOS: stojí na +X; při obrábění na aktuální poloze) ──
  if (mach && mach.active && mach.tool && ops[mach.tool.op]) {
    drawTool(ctx, ops[mach.tool.op], mach.tool, P, sc, rotRect);
    drawMachStatus(ctx, ops, mach);
  } else if (mach && ops.length) {
    drawMachStatus(ctx, ops, mach);
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
  const nBad = (d.checks || []).reduce((n, c) => n + (c ? c.issues.length : 0), 0);
  if (nBad) {
    const err = d.checks.some(c => c && c.sev === 'error');
    ctx.fillStyle = err ? CHK.error : CHK.warn;
    ctx.fillText(`${err ? '⛔' : '⚠'} Kontrola proti dílu: ${nBad} ${nBad === 1 ? 'nález' : (nBad <= 4 ? 'nálezy' : 'nálezů')} – podrobnosti v 🛠 Operace`, 8, h - 36);
    ctx.fillStyle = COL.text;
  }
  ctx.fillText(`Polotovar Ø${fmt(2 * sRz)}${outR > 0 ? `  ·  ${cut ? 'v řezu' : 'obrys'} Ø${fmt(2 * outR)}` : ''}${inR > 0 ? `  ·  vývrt Ø${fmt(2 * inR)}` : ''}`, 8, h - 8);
}

const CHK = { error: '#f38ba8', warn: '#f9e2af' };

/**
 * Obrys děr s nálezem kontroly (checks[oi].marks: index díry → závažnost) přes
 * plán i obrábění. Operace na jiném čele než v řezu jen ztlumeně.
 */
function drawCheckMarks(ctx, ops, checks, cut, P, sc, rotRect) {
  ctx.save();
  ops.forEach((op, oi) => {
    const c = checks[oi];
    if (!c || !c.marks.size) return;
    const other = cut && op.side !== 'radial' && Math.abs(op.zTop - cut.z) > 0.5;
    ctx.globalAlpha = other ? 0.5 : 1;
    ctx.lineWidth = 2.2; ctx.setLineDash([]);
    if (op.kind === 'mill' && op.millType === 'slot') {
      const sev = c.marks.get(0);
      if (!sev) return;
      const { x1, y1, x2, y2 } = op.slot;
      capsulePath(ctx, P, x1, y1, x2, y2, op.toolD / 2 + 2 / sc);
      ctx.strokeStyle = CHK[sev]; ctx.stroke();
      return;
    }
    livePositions(op).forEach((p, i) => {
      const sev = c.marks.get(i);
      if (!sev) return;
      ctx.strokeStyle = CHK[sev];
      if (op.side === 'radial' && op.kind !== 'mill') {
        const r = op.xTop / 2;
        rotRect(p.a, r - op.depth - 2 / sc, r + 2 / sc, op.holeD / 2 + 2 / sc, null, null);
        ctx.stroke();
        return;
      }
      const [sx, sy] = P(p.x, p.y);
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, op.holeD / 2 * sc) + 3, 0, 2 * Math.PI); ctx.stroke();
    });
  });
  ctx.restore();
}

const voidFill = f => `rgba(17,17,27,${(0.5 + 0.5 * Math.min(1, f)).toFixed(2)})`;

/** Obrys drážky (stopa frézy po úsečce) jako cesta na plátně. */
function capsulePath(ctx, P, x1, y1, x2, y2, r) {
  const a = Math.atan2(y2 - y1, x2 - x1), pts = [];
  for (let k = 0; k <= 12; k++) { const t = a - Math.PI / 2 + Math.PI * k / 12; pts.push(P(x2 + r * Math.cos(t), y2 + r * Math.sin(t))); }
  for (let k = 0; k <= 12; k++) { const t = a + Math.PI / 2 + Math.PI * k / 12; pts.push(P(x1 + r * Math.cos(t), y1 + r * Math.sin(t))); }
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
}

/**
 * Operace při obrábění: plán čárkovaně, odebraný materiál tmavě (sytost =
 * dosažená hloubka / hloubka operace), hotová operace se zeleným okrajem.
 */
function drawMachOp(ctx, op, oi, m, P, sc, sel, rotRect) {
  const done = m.done.has(oi);
  const dep = i => m.depth.get(`${oi}:${i}`) || 0;
  const edge = (planned, col) => {
    ctx.setLineDash(planned ? [4, 3] : []);
    ctx.strokeStyle = sel ? '#fff' : (done ? COL.done : col); ctx.lineWidth = sel ? 1.6 : 1.2;
  };
  if (op.kind === 'mill') {
    const tr = op.toolD / 2, slot = op.millType === 'slot';
    (m.sweeps.get(oi) || []).forEach(line => {
      const span = Math.hypot(line[line.length - 1].x - line[0].x, line[line.length - 1].y - line[0].y);
      ctx.fillStyle = ctx.strokeStyle = voidFill(1);
      if (line.length < 2 || (span < 1e-6 && line.every(q => q.x === line[0].x && q.y === line[0].y))) {
        const [sx, sy] = P(line[0].x, line[0].y);
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.5, tr * sc), 0, 2 * Math.PI); ctx.fill();
        return;
      }
      ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, op.toolD * sc);
      ctx.beginPath(); line.forEach((q, i) => { const [sx, sy] = P(q.x, q.y); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }); ctx.stroke();
    });
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    if (slot) {
      const { x1, y1, x2, y2 } = op.slot;
      capsulePath(ctx, P, x1, y1, x2, y2, tr); edge(!done && !dep(0), COL.mill); ctx.stroke();
    } else {
      livePositions(op).forEach((p, i) => {
        const [sx, sy] = P(p.x, p.y), r = Math.max(2, op.holeD / 2 * sc);
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, 2 * Math.PI); edge(!dep(i), COL.mill); ctx.stroke();
        label(ctx, [sx + r + 3, sy - 3], String(i + 1), COL.mill);
      });
    }
  } else if (op.side === 'radial') {
    const R = op.xTop / 2;
    livePositions(op).forEach((p, i) => {
      const d = dep(i);
      ctx.setLineDash([4, 3]); rotRect(p.a, R - op.depth, R, op.holeD / 2, null, COL.radial); ctx.setLineDash([]);
      if (d > 0) rotRect(p.a, R - d, R, op.holeD / 2, voidFill(d / op.depth), done ? COL.done : COL.radial);
      label(ctx, P(...polar(R + 4 + 8 / sc, p.a)), String(i + 1), COL.radial);
    });
  } else {
    livePositions(op).forEach((p, i) => {
      const d = dep(i), [sx, sy] = P(p.x, p.y), r = Math.max(2, op.holeD / 2 * sc);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 2 * Math.PI);
      if (d > 0) { ctx.fillStyle = voidFill(d / op.depth); ctx.fill(); }
      edge(!(d > 0), d >= op.depth - 1e-6 ? COL.done : COL.drill); ctx.stroke();
      label(ctx, [sx + r + 3, sy - 3], String(i + 1), COL.drill);
    });
  }
  ctx.setLineDash([]);
}

/** Nástroj na své poloze: čelo = kruh Ø nástroje, plášť = vrták z boku. */
function drawTool(ctx, op, tl, P, sc, rotRect) {
  const dia = op.kind === 'mill' ? op.toolD : op.holeD;
  const inCut = tl.d > 1e-6;
  if (op.kind === 'drill' && op.side === 'radial') {
    const a = Math.atan2(tl.y, tl.x) * 180 / Math.PI, r = Math.hypot(tl.x, tl.y);
    rotRect(a, r, r + Math.max(14 / sc, dia * 3), dia / 2, 'rgba(249,226,175,0.45)', COL.tool);
    return;
  }
  const [sx, sy] = P(tl.x, tl.y);
  ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, dia / 2 * sc), 0, 2 * Math.PI);
  ctx.setLineDash(inCut ? [] : [3, 3]);
  ctx.strokeStyle = COL.tool; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
  if (inCut) { ctx.fillStyle = 'rgba(249,226,175,0.35)'; ctx.fill(); }
}

/** Stav obrábění nahoře vlevo: operace, díra, hloubka, čas. */
function drawMachStatus(ctx, ops, m) {
  ctx.font = '11px sans-serif';
  const time = `${mmss(m.t)} / ${mmss(m.total)}`;
  if (!m.active) {
    ctx.fillStyle = COL.done;
    ctx.fillText(`✔ Obrobeno: ${m.done.size} ${m.done.size >= 1 && m.done.size <= 4 ? 'operace' : 'operací'}  ·  ${mmss(m.total)}`, 8, 16);
    return;
  }
  const op = ops[m.tool.op], n = livePositions(op).length || 1;
  const what = op.kind === 'mill' ? (op.millType === 'slot' ? 'drážka' : `kapsa ${m.tool.hole + 1}/${n}`) : `díra ${m.tool.hole + 1}/${n}`;
  const d = Math.max(0, m.tool.d);
  ctx.fillStyle = COL.tool;
  ctx.fillText(`${m.paused ? '⏸ ' : ''}${op.name} · ${what} · hloubka ${fmt(d)} / ${fmt(op.depth)} mm`, 8, 16);
  ctx.fillStyle = COL.text;
  ctx.fillText(`${time}  ·  T${op.toolNo} ${op.toolName || ''}`.trim(), 8, 30);
}

function mmss(sec) { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

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
