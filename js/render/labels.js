// SKICA – render: Kóty, šipky, popisky a čísla objektů/průsečíků
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { ctx, worldToScreen } from '../canvas.js';
import { ARROW_ANGLE, ARROW_LENGTH, COLORS } from '../constants.js';
import { fmtNum, state } from '../state.js';
import { bulgeToArc, getRectCorners } from '../utils.js';
import { _dimLabelRects, _ink, _tv } from './view.js';
import { shownIntersections } from '../geometry/shownIntersections.js';

// ── Šipka kóty ──
export function drawDimArrow(fromX, fromY, toX, toY) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const arrowLen = ARROW_LENGTH;
  const arrowAngle = ARROW_ANGLE;
  _tv.ctx.beginPath();
  _tv.ctx.moveTo(fromX, fromY);
  _tv.ctx.lineTo(fromX + arrowLen * Math.cos(angle + arrowAngle), fromY + arrowLen * Math.sin(angle + arrowAngle));
  _tv.ctx.moveTo(fromX, fromY);
  _tv.ctx.lineTo(fromX + arrowLen * Math.cos(angle - arrowAngle), fromY + arrowLen * Math.sin(angle - arrowAngle));
  _tv.ctx.stroke();
}

/**
 * Šipka úhlové kóty umístěná TEČNĚ na oblouku (střed scx,scy, poloměr aR)
 * v koncovém screen-úhlu `endScreen`. Barby míří podél oblouku ke středu
 * rozevření (`midScreen`), takže hrot sedí na konci oblouku.
 */
export function drawTangentArcArrow(scx, scy, aR, endScreen, midScreen) {
  const nrm = (a) => { a %= 2 * Math.PI; if (a > Math.PI) a -= 2 * Math.PI; if (a <= -Math.PI) a += 2 * Math.PI; return a; };
  const d = nrm(midScreen - endScreen);
  const step = Math.sign(d || 1) * Math.min(0.25, Math.abs(d) || 0.25);
  const tipX = scx + aR * Math.cos(endScreen);
  const tipY = scy + aR * Math.sin(endScreen);
  const towardX = scx + aR * Math.cos(endScreen + step);
  const towardY = scy + aR * Math.sin(endScreen + step);
  drawDimArrow(tipX, tipY, towardX, towardY);
}

// ── Kolize kótových popisků ──
/**
 * Ověří, zda se obdélník [x,y,w,h] překrývá s dříve umístěnými popisky.
 * Pokud ano, vrátí odsazenou pozici s volným místem.
 * Registruje výsledný obdélník do _dimLabelRects.
 * @returns {{ x: number, y: number, collided: boolean }}
 */
export function resolveDimLabelPos(x, y, textW, textH) {
  const pad = 4; // mezera kolem textu
  const rect = { x: x - pad, y: y - textH - pad, w: textW + pad * 2, h: textH + pad * 2 };

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  let collided = false;
  let offsetY = 0;
  const step = textH + pad * 2;
  let maxTries = 8;

  while (maxTries-- > 0) {
    const testRect = { x: rect.x, y: rect.y + offsetY, w: rect.w, h: rect.h };
    let hasCollision = false;
    for (const existing of _dimLabelRects) {
      if (overlaps(testRect, existing)) {
        hasCollision = true;
        collided = true;
        break;
      }
    }
    if (!hasCollision) break;
    // Zkusit posunout nahoru (záporný Y ve screen = nahoru)
    offsetY -= step;
  }

  const finalRect = { x: rect.x, y: rect.y + offsetY, w: rect.w, h: rect.h };
  _dimLabelRects.push(finalRect);
  return { x, y: y + offsetY, collided };
}

// Hit-boxy štítků čísel — aktualizují se při každém renderu
let _numLabels = [];
/** Vrátí info o štítku čísla pod světovými souřadnicemi, nebo null. */
export function findNumLabelAt(wx, wy) {
  const [sx, sy] = worldToScreen(wx, wy);
  return _numLabels.find(l => sx >= l.rx && sx <= l.rx + l.bw && sy >= l.ry && sy <= l.ry + l.bh) || null;
}

// ── Čísla objektů na výkrese ──
// Skutečný střed oblouku (bod v půlce SKUTEČNĚ vykreslené dráhy). Naivní průměr
// (startAngle+endAngle)/2 padne na OPAČNOU stranu, když oblouk jde po směru
// hodin (ccw=false) nebo když kříží ±180° — proto label „9" končil vedle oblouku.
// Konvence odpovídá drawArc(): ccw!==false = proti směru (rostoucí úhel).
function arcMidpoint(cx, cy, r, startAngle, endAngle, ccw) {
  let sweep = endAngle - startAngle;
  if (ccw) { while (sweep <= 0) sweep += 2 * Math.PI; }
  else     { while (sweep >= 0) sweep -= 2 * Math.PI; }
  const mid = startAngle + sweep / 2;
  return [cx + r * Math.cos(mid), cy + r * Math.sin(mid)];
}

export function drawObjectNumbers() {
  _numLabels = [];
  const fontSize = Math.round(Math.min(20, Math.max(13, 10 + state.zoom * 5)));
  ctx.font = `bold ${fontSize}px Consolas`;

  // Counter only for non-dimension objects (matches object list numbering)
  let num = 0;
  state.objects.forEach((obj, idx) => {
    if (obj.isDimension || obj.isCoordLabel) return;
    num++;

    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) return;

    // Compute center position of object
    let cx, cy;
    switch (obj.type) {
      case "point":
        cx = obj.x; cy = obj.y;
        break;
      case "line":
      case "constr":
        cx = (obj.x1 + obj.x2) / 2; cy = (obj.y1 + obj.y2) / 2;
        break;
      case "circle":
        cx = obj.cx; cy = obj.cy;
        break;
      case "arc":
        { const [amx, amy] = arcMidpoint(obj.cx, obj.cy, obj.r, obj.startAngle, obj.endAngle, obj.ccw !== false);
          cx = amx; cy = amy; }
        break;
      case "rect":
        cx = (obj.x1 + obj.x2) / 2; cy = (obj.y1 + obj.y2) / 2;
        break;
      case "polyline":
        if (obj.vertices && obj.vertices.length > 0) {
          let sx = 0, sy = 0;
          obj.vertices.forEach(v => { sx += v.x; sy += v.y; });
          cx = sx / obj.vertices.length; cy = sy / obj.vertices.length;
        } else { return; }
        break;
      default:
        return;
    }

    // objIdx a segIdx pro hit-test; segIdx=-1 znamená celý objekt
    function drawNumLabel(wcx, wcy, label, selected, stock, objIdx, segIdx) {
      const [scx, scy] = worldToScreen(wcx, wcy);
      const tw = ctx.measureText(label).width;
      const pad = 4;
      const bw = tw + pad * 2;
      const bh = fontSize + pad * 2;
      const rx = scx - bw / 2, ry = scy - bh / 2;
      // Barva: bílá = vybrané, oranžová = polotovar, žlutá = kontura
      ctx.fillStyle = selected ? COLORS.selected : (stock ? COLORS.stock : COLORS.yellow);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const r = 4;
      ctx.moveTo(rx + r, ry);
      ctx.lineTo(rx + bw - r, ry);
      ctx.arcTo(rx + bw, ry, rx + bw, ry + r, r);
      ctx.lineTo(rx + bw, ry + bh - r);
      ctx.arcTo(rx + bw, ry + bh, rx + bw - r, ry + bh, r);
      ctx.lineTo(rx + r, ry + bh);
      ctx.arcTo(rx, ry + bh, rx, ry + bh - r, r);
      ctx.lineTo(rx, ry + r);
      ctx.arcTo(rx, ry, rx + r, ry, r);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.bgDark;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, scx, scy);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      // Uložit hit-box pro klik
      _numLabels.push({ rx, ry, bw, bh, objIdx, segIdx: segIdx ?? -1 });
    }

    const isSel = idx === state.selected || state.multiSelected.has(idx);

    if (obj.type === 'polyline' && obj.vertices && obj.vertices.length >= 2) {
      // Pro polyline zobrazit čísla segmentů místo jednoho čísla objektu
      const n = obj.vertices.length;
      const segCount = obj.closed ? n : n - 1;
      const objSegsSet = state.multiSelectedSegments.get(idx);
      for (let si = 0; si < segCount; si++) {
        const p1 = obj.vertices[si];
        const p2 = obj.vertices[(si + 1) % n];
        const b = obj.bulges ? (obj.bulges[si] || 0) : 0;
        let wcx2, wcy2;
        if (b === 0) {
          wcx2 = (p1.x + p2.x) / 2;
          wcy2 = (p1.y + p2.y) / 2;
        } else {
          const arc = bulgeToArc(p1, p2, b);
          if (arc) {
            [wcx2, wcy2] = arcMidpoint(arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle, arc.ccw);
          } else {
            wcx2 = (p1.x + p2.x) / 2;
            wcy2 = (p1.y + p2.y) / 2;
          }
        }
        const isSegSel = isSel && (objSegsSet ? objSegsSet.has(si) : false);
        drawNumLabel(wcx2, wcy2, String(si + 1), isSegSel, !!obj.isStock, idx, si);
      }
    } else {
      drawNumLabel(cx, cy, String(num), isSel, !!obj.isStock, idx, -1);
    }
  });
}

/** Vykreslí čísla průsečíků (P1, P2, …) na výkrese. */
export function drawIntersectionNumbers() {
  const shown = shownIntersections();
  if (shown.length === 0) return;
  const fontSize = Math.round(Math.min(20, Math.max(13, 10 + state.zoom * 5)));
  ctx.font = `bold ${fontSize}px Consolas`;

  shown.forEach((pt, i) => {
    const [scx, scy] = worldToScreen(pt.x, pt.y);
    const label = `P${i + 1}`;
    const tw = ctx.measureText(label).width;
    const pad = 4;
    const bw = tw + pad * 2;
    const bh = fontSize + pad * 2;

    const isSelPt = state.selectedPoint != null
      && state.selectedPoint.some(sp => Math.hypot(pt.x - sp.x, pt.y - sp.y) < 1e-4);

    // Background pill
    ctx.fillStyle = isSelPt ? COLORS.selected : '#a6e3a1';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    const rx = scx - bw / 2, ry = scy - bh - 6;
    const r = 4;
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + bw - r, ry);
    ctx.arcTo(rx + bw, ry, rx + bw, ry + r, r);
    ctx.lineTo(rx + bw, ry + bh - r);
    ctx.arcTo(rx + bw, ry + bh, rx + bw - r, ry + bh, r);
    ctx.lineTo(rx + r, ry + bh);
    ctx.arcTo(rx, ry + bh, rx, ry + bh - r, r);
    ctx.lineTo(rx, ry + r);
    ctx.arcTo(rx, ry, rx + r, ry, r);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Number text
    ctx.fillStyle = COLORS.bgDark;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, scx, ry + bh / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  });
}

// ── Kóty / rozměry ──
export function drawDimension(obj) {
  const dimSize = Math.round(Math.min(18, Math.max(12, 8 + _tv.zoom() * 4)));
  _tv.ctx.font = `${dimSize}px Consolas`;
  _tv.ctx.fillStyle = _ink('textSecondary');
  const offset = 14;
  switch (obj.type) {
    case "line":
      // Délka úsečky se zobrazuje jen přes explicitní kótu (isDimension)
      break;
    case "circle": {
      // Skrýt původní popis u středu, když je kružnice okótovaná explicitní kótou
      if (obj.id != null && state.objects.some(o => o.isDimension && o.sourceObjId === obj.id)) break;
      const [sx, sy] = _tv.w2s(obj.cx, obj.cy);
      const rText = `R${fmtNum(obj.r)}`;
      const dText = `⌀${fmtNum((obj.r * 2))}`;
      const rW = _tv.ctx.measureText(rText).width;
      const dW = _tv.ctx.measureText(dText).width;
      const r1 = resolveDimLabelPos(sx + 6, sy - 6, rW, dimSize);
      _tv.ctx.fillText(rText, sx + 6, r1.y);
      if (r1.collided) { _tv.ctx.strokeStyle = _ink('textSecondary'); _tv.ctx.lineWidth = 0.5; _tv.ctx.setLineDash([2,2]); _tv.ctx.beginPath(); _tv.ctx.moveTo(sx, sy); _tv.ctx.lineTo(sx + 6, r1.y); _tv.ctx.stroke(); _tv.ctx.setLineDash([]); }
      const d1 = resolveDimLabelPos(sx + 6, sy + 14, dW, dimSize);
      _tv.ctx.fillText(dText, sx + 6, d1.y);
      break;
    }
    case "arc": {
      // Skrýt původní popis u středu, když je oblouk okótovaný explicitní kótou
      if (obj.id != null && state.objects.some(o => o.isDimension && o.sourceObjId === obj.id)) break;
      const [sx, sy] = _tv.w2s(obj.cx, obj.cy);
      const rText = `R${fmtNum(obj.r)}`;
      const rW = _tv.ctx.measureText(rText).width;
      const r1 = resolveDimLabelPos(sx + 6, sy - 6, rW, dimSize);
      _tv.ctx.fillText(rText, sx + 6, r1.y);
      if (r1.collided) { _tv.ctx.strokeStyle = _ink('textSecondary'); _tv.ctx.lineWidth = 0.5; _tv.ctx.setLineDash([2,2]); _tv.ctx.beginPath(); _tv.ctx.moveTo(sx, sy); _tv.ctx.lineTo(sx + 6, r1.y); _tv.ctx.stroke(); _tv.ctx.setLineDash([]); }
      break;
    }
    case "rect": {
      const rc = getRectCorners(obj);
      const w = Math.abs(obj.x2 - obj.x1),
        h = Math.abs(obj.y2 - obj.y1);
      const [sx1r, sy1r] = _tv.w2s(rc[0].x, rc[0].y);
      const [sx2r, sy2r] = _tv.w2s(rc[1].x, rc[1].y);
      const [sx3r, sy3r] = _tv.w2s(rc[2].x, rc[2].y);
      _tv.ctx.fillText(
        fmtNum(w),
        (sx1r + sx2r) / 2 - 15,
        Math.min(sy1r, sy2r) - 4,
      );
      _tv.ctx.fillText(
        fmtNum(h),
        Math.max(sx2r, sx3r) + 4,
        (sy2r + sy3r) / 2 + 4,
      );
      break;
    }
    case "polyline": {
      // Total length
      let totalLen = 0;
      const pn = obj.vertices.length;
      const pSegCount = obj.closed ? pn : pn - 1;
      for (let i = 0; i < pSegCount; i++) {
        const pp1 = obj.vertices[i];
        const pp2 = obj.vertices[(i + 1) % pn];
        const pb = obj.bulges[i] || 0;
        if (pb === 0) {
          totalLen += Math.hypot(pp2.x - pp1.x, pp2.y - pp1.y);
        } else {
          const parc = bulgeToArc(pp1, pp2, pb);
          if (parc) {
            const theta = 4 * Math.atan(Math.abs(pb));
            totalLen += parc.r * theta;
          }
        }
      }
      if (pn >= 1) {
        const [psx, psy] = _tv.w2s(obj.vertices[0].x, obj.vertices[0].y);
        _tv.ctx.fillText(`L${fmtNum(totalLen)} [${pn}v]`, psx + 8, psy - 8);
      }
      break;
    }
  }
}
