// SKICA – render: Kreslení základních prvků (bod, úsečka, kružnice, oblouk, obdélník, polyline)
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { ctx, screenAngle, screenCCW, worldToScreen } from '../canvas.js';
import { COLORS, LINE_WIDTH, LINE_WIDTH_SELECTED } from '../constants.js';
import { drawDimArrow, drawTangentArcArrow, resolveDimLabelPos } from './labels.js';
import { fmtCoordLabel, fmtNum, state } from '../state.js';
import { bulgeToArc, getRectCorners } from '../utils.js';
import { _ink, _tv } from './view.js';

// ── Kreslicí primitiva ──
/** @param {import('../types.js').PointObject} obj */
export function drawPoint(obj) {
  const [sx, sy] = _tv.w2s(obj.x, obj.y);

  if (obj.isCoordLabel) {
    // Odkazová čára (leader) se souřadnicemi
    const leaderLen = 30;
    const shelfLen = 40;
    const dimSize = Math.round(Math.min(21, Math.max(10, 7 + _tv.zoom() * 4)));
    _tv.ctx.font = dimSize + 'px Consolas';
    const labelText = fmtCoordLabel(obj.x, obj.y);
    const labelW = _tv.ctx.measureText(labelText).width;
    let ex, ey;
    if (obj.dimLeadDX != null && obj.dimLeadDY != null) {
      // Uživatelsky umístěná pozice odkazu (svět offset)
      [ex, ey] = _tv.w2s(obj.x + obj.dimLeadDX, obj.y + obj.dimLeadDY);
    } else {
      const baseEx = sx + leaderLen;
      const baseEy = sy - leaderLen;
      // Detekce kolize – posune výš při překryvu
      const resolved = resolveDimLabelPos(baseEx + 2, baseEy - 3, labelW + shelfLen, dimSize);
      ey = resolved.collided ? resolved.y + 3 : baseEy;
      ex = baseEx;
    }
    // Polička vede vpravo, pokud je odkaz vpravo od bodu, jinak vlevo
    const shelfDir = ex >= sx ? 1 : -1;
    // Šikmá čára od bodu
    _tv.ctx.lineWidth = 1;
    _tv.ctx.beginPath();
    _tv.ctx.moveTo(sx, sy);
    _tv.ctx.lineTo(ex, ey);
    // Vodorovná polička
    _tv.ctx.lineTo(ex + shelfDir * shelfLen, ey);
    _tv.ctx.stroke();
    // Kroužek na bodě
    _tv.ctx.beginPath();
    _tv.ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    _tv.ctx.stroke();
    // Text souřadnic – na straně poličky
    _tv.ctx.fillStyle = _ink('text');
    _tv.ctx.textAlign = shelfDir >= 0 ? 'left' : 'right';
    _tv.ctx.textBaseline = 'bottom';
    _tv.ctx.fillText(labelText, ex + shelfDir * 2, ey - 3);
    _tv.ctx.textAlign = 'start';
    _tv.ctx.textBaseline = 'alphabetic';
    return;
  }

  _tv.ctx.beginPath();
  _tv.ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  _tv.ctx.fill();
  _tv.ctx.beginPath();
  _tv.ctx.moveTo(sx - 6, sy);
  _tv.ctx.lineTo(sx + 6, sy);
  _tv.ctx.moveTo(sx, sy - 6);
  _tv.ctx.lineTo(sx, sy + 6);
  _tv.ctx.stroke();
}

/** @param {import('../types.js').LineObject} obj */
export function drawLine(obj) {
  const [sx1, sy1] = _tv.w2s(obj.x1, obj.y1);
  const [sx2, sy2] = _tv.w2s(obj.x2, obj.y2);

  if (obj.isDimension) {
    const dimType = obj.dimType || 'linear';
    const dimSize = Math.round(Math.min(24, Math.max(11, 8 + _tv.zoom() * 4.5)));
    _tv.ctx.font = dimSize + 'px Consolas';
    _tv.ctx.fillStyle = _ink('text');
    _tv.ctx.textAlign = 'center';
    _tv.ctx.textBaseline = 'bottom';

    if (dimType === 'angular') {
      // ── Úhlová kóta – oblouk s popiskem úhlu ──
      const cx = obj.dimCenterX, cy = obj.dimCenterY;
      const [scx, scy] = _tv.w2s(cx, cy);
      const r = obj.dimRadius || 20;
      const sr = r * _tv.zoom();
      const startA = Math.atan2(obj.y1 - cy, obj.x1 - cx);
      const endA = Math.atan2(obj.y2 - cy, obj.x2 - cx);
      // Polární úhel od osy Z → konstrukční (čárkovaný) styl
      const vsAxis = !!obj.dimVsAxis;
      // Odkazové čáry od středu k oblouku
      _tv.ctx.lineWidth = 0.7;
      if (vsAxis) _tv.ctx.setLineDash([5, 3]);
      _tv.ctx.beginPath();
      _tv.ctx.moveTo(scx, scy);
      _tv.ctx.lineTo(sx1, sy1);
      _tv.ctx.moveTo(scx, scy);
      _tv.ctx.lineTo(sx2, sy2);
      _tv.ctx.stroke();
      if (vsAxis) _tv.ctx.setLineDash([5, 3]); else _tv.ctx.setLineDash([]);
      const aR = sr * 0.8;
      const screenStart = _tv.angle(startA);
      const screenEnd = _tv.angle(endA);
      let midScreen, sweep;
      if (obj.dimMidAng != null) {
        // Kóta „od ramene k rameni" – oblouk vede přes uloženou osu (i reflexní)
        midScreen = _tv.angle(obj.dimMidAng);
        const nrm = (a) => { a %= 2 * Math.PI; return a < 0 ? a + 2 * Math.PI : a; };
        const dSE = nrm(screenEnd - screenStart);
        const dSM = nrm(midScreen - screenStart);
        const anticw = !(dSM <= dSE);   // směr tak, aby oblouk procházel osou
        _tv.ctx.lineWidth = 1.2;
        _tv.ctx.beginPath();
        _tv.ctx.arc(scx, scy, aR, screenStart, screenEnd, anticw);
        _tv.ctx.stroke();
        sweep = obj.dimAngle;
      } else {
        // Zpětná kompatibilita – vždy kratší oblouk
        let ccwSweep = screenStart - screenEnd;
        while (ccwSweep < 0) ccwSweep += 2 * Math.PI;
        while (ccwSweep >= 2 * Math.PI) ccwSweep -= 2 * Math.PI;
        const useCCW = ccwSweep <= Math.PI;
        _tv.ctx.lineWidth = 1.2;
        _tv.ctx.beginPath();
        _tv.ctx.arc(scx, scy, aR, screenStart, screenEnd, useCCW);
        _tv.ctx.stroke();
        const actualSweep = useCCW ? ccwSweep : (2 * Math.PI - ccwSweep);
        midScreen = useCCW ? screenStart - actualSweep / 2 : screenStart + actualSweep / 2;
        sweep = obj.dimAngle || actualSweep;
        if (sweep < 0) sweep += 2 * Math.PI;
      }
      if (vsAxis) _tv.ctx.setLineDash([]);   // šipky/text plnou čarou
      // Šipky TEČNĚ na oblouku – na každém konci jedna, mířící podél oblouku
      drawTangentArcArrow(scx, scy, aR, screenStart, midScreen);
      drawTangentArcArrow(scx, scy, aR, screenEnd, midScreen);
      // Text úhlu – uprostřed oblouku
      const labelX = scx + aR * Math.cos(midScreen);
      const labelY = scy + aR * Math.sin(midScreen);
      _tv.ctx.fillText(`${(sweep * 180 / Math.PI).toFixed(1)}°`, labelX, labelY - 4);
      _tv.ctx.textAlign = 'start';
      _tv.ctx.textBaseline = 'alphabetic';
      return;
    }

    if (dimType === 'diameter') {
      // ── Průměrová kóta – čára přes střed se symbolem ⌀ ──
      _tv.ctx.lineWidth = 1.2;
      _tv.ctx.beginPath();
      _tv.ctx.moveTo(sx1, sy1);
      _tv.ctx.lineTo(sx2, sy2);
      _tv.ctx.stroke();
      // Šipky na obou koncích
      drawDimArrow(sx1, sy1, sx2, sy2);
      drawDimArrow(sx2, sy2, sx1, sy1);
      // Text ⌀ hodnota
      const diam = (obj.dimRadius || 0) * 2;
      const mx = (sx1 + sx2) / 2;
      const my = (sy1 + sy2) / 2;
      const labelText = `⌀${fmtNum(diam)}`;
      const angle = Math.atan2(sy2 - sy1, sx2 - sx1);
      let textAngle = angle;
      if (textAngle > Math.PI / 2) textAngle -= Math.PI;
      if (textAngle < -Math.PI / 2) textAngle += Math.PI;
      _tv.ctx.save();
      _tv.ctx.translate(mx, my);
      _tv.ctx.rotate(textAngle);
      _tv.ctx.fillText(labelText, 0, -4);
      _tv.ctx.restore();
      _tv.ctx.textAlign = 'start';
      _tv.ctx.textBaseline = 'alphabetic';
      return;
    }

    if (dimType === 'radius' && obj.dimLeader) {
      // ── Radiální kóta jako odkaz (leader) – šipka na oblouku, popisek vytažen ──
      // (sx1,sy1) = bod na oblouku, (sx2,sy2) = umístění popisku
      _tv.ctx.lineWidth = 1.2;
      _tv.ctx.beginPath();
      _tv.ctx.moveTo(sx1, sy1);
      _tv.ctx.lineTo(sx2, sy2);
      _tv.ctx.stroke();
      // Šipka na oblouku míří dovnitř (ke středu) podél odkazu
      drawDimArrow(sx1, sy1, sx2, sy2);
      // Tečka na oblouku
      _tv.ctx.beginPath();
      _tv.ctx.arc(sx1, sy1, 2, 0, Math.PI * 2);
      _tv.ctx.fill();
      // Text R – u umístění, vodorovně, na straně od oblouku
      const radiusL = obj.dimRadius || Math.hypot(obj.x1 - (obj.dimCenterX ?? obj.x2), obj.y1 - (obj.dimCenterY ?? obj.y2));
      const side = sx2 >= sx1 ? 1 : -1;
      _tv.ctx.textAlign = side >= 0 ? 'left' : 'right';
      _tv.ctx.textBaseline = 'middle';
      _tv.ctx.fillText(`R${fmtNum(radiusL)}`, sx2 + side * 5, sy2);
      _tv.ctx.textAlign = 'start';
      _tv.ctx.textBaseline = 'alphabetic';
      return;
    }

    if (dimType === 'radius') {
      // ── Radiální kóta – čára od středu k bodu s R ──
      _tv.ctx.lineWidth = 1.2;
      _tv.ctx.beginPath();
      _tv.ctx.moveTo(sx1, sy1);
      _tv.ctx.lineTo(sx2, sy2);
      _tv.ctx.stroke();
      // Šipka pouze na vnějším konci (sx2, sy2)
      drawDimArrow(sx2, sy2, sx1, sy1);
      // Kroužek na středu
      _tv.ctx.beginPath();
      _tv.ctx.arc(sx1, sy1, 2.5, 0, Math.PI * 2);
      _tv.ctx.stroke();
      // Text R hodnota
      const radius = obj.dimRadius || Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
      const mx = (sx1 + sx2) / 2;
      const my = (sy1 + sy2) / 2;
      const labelText = `R${fmtNum(radius)}`;
      const angle = Math.atan2(sy2 - sy1, sx2 - sx1);
      let textAngle = angle;
      if (textAngle > Math.PI / 2) textAngle -= Math.PI;
      if (textAngle < -Math.PI / 2) textAngle += Math.PI;
      _tv.ctx.save();
      _tv.ctx.translate(mx, my);
      _tv.ctx.rotate(textAngle);
      _tv.ctx.fillText(labelText, 0, -4);
      _tv.ctx.restore();
      _tv.ctx.textAlign = 'start';
      _tv.ctx.textBaseline = 'alphabetic';
      return;
    }

    // ── Lineární kóta (výchozí) – odkazové čáry + odsazená kóta + šipky + text ──
    const hasSrc = obj.dimSrcX1 !== undefined;
    const ox1 = hasSrc ? obj.dimSrcX1 : obj.x1;
    const oy1 = hasSrc ? obj.dimSrcY1 : obj.y1;
    const ox2 = hasSrc ? obj.dimSrcX2 : obj.x2;
    const oy2 = hasSrc ? obj.dimSrcY2 : obj.y2;
    const [osx1, osy1] = _tv.w2s(ox1, oy1);
    const [osx2, osy2] = _tv.w2s(ox2, oy2);

    const angle = Math.atan2(sy2 - sy1, sx2 - sx1);
    const extOver = 4;
    const enx = -Math.sin(angle) * extOver;
    const eny = Math.cos(angle) * extOver;

    // Odkazové čáry
    _tv.ctx.lineWidth = 0.7;
    _tv.ctx.beginPath();
    _tv.ctx.moveTo(osx1, osy1);
    _tv.ctx.lineTo(sx1 + enx, sy1 + eny);
    _tv.ctx.moveTo(osx2, osy2);
    _tv.ctx.lineTo(sx2 + enx, sy2 + eny);
    _tv.ctx.stroke();

    // Hlavní kótovací čára
    _tv.ctx.lineWidth = 1.2;
    _tv.ctx.beginPath();
    _tv.ctx.moveTo(sx1, sy1);
    _tv.ctx.lineTo(sx2, sy2);
    _tv.ctx.stroke();

    // Šipky
    drawDimArrow(sx1, sy1, sx2, sy2);
    drawDimArrow(sx2, sy2, sx1, sy1);

    // Text délky – rotovaný rovnoběžně s kótou, s detekcí kolizí.
    // Vodorovná/svislá kóta měří průmět (rozměr v ose Z / X) = délka kótovací
    // čáry; zarovnaná (aligned) měří skutečnou délku úsečky (zdrojové body).
    const len = (obj.dimMode === 'horizontal' || obj.dimMode === 'vertical')
      ? Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1)
      : Math.hypot(ox2 - ox1, oy2 - oy1);
    const mx = (sx1 + sx2) / 2;
    const my = (sy1 + sy2) / 2;
    const labelText = fmtNum(len);
    const textW = _tv.ctx.measureText(labelText).width;
    const textH = dimSize;

    const resolved = resolveDimLabelPos(mx - textW / 2, my - 4, textW, textH);
    const labelY = resolved.y;

    if (resolved.collided) {
      _tv.ctx.strokeStyle = _ink('textSecondary');
      _tv.ctx.lineWidth = 0.7;
      _tv.ctx.setLineDash([3, 3]);
      _tv.ctx.beginPath();
      _tv.ctx.moveTo(mx, my);
      _tv.ctx.lineTo(mx, labelY);
      _tv.ctx.stroke();
      _tv.ctx.setLineDash([]);
      _tv.ctx.beginPath();
      _tv.ctx.arc(mx, my, 2, 0, Math.PI * 2);
      _tv.ctx.fill();
    }

    let textAngle = angle;
    if (textAngle > Math.PI / 2) textAngle -= Math.PI;
    if (textAngle < -Math.PI / 2) textAngle += Math.PI;
    _tv.ctx.save();
    if (resolved.collided) {
      _tv.ctx.translate(mx, labelY);
    } else {
      _tv.ctx.translate(mx, my);
      _tv.ctx.rotate(textAngle);
    }
    _tv.ctx.fillText(labelText, 0, -4);
    _tv.ctx.restore();
    _tv.ctx.textAlign = 'start';
    _tv.ctx.textBaseline = 'alphabetic';
    return;
  }

  if (obj.type === "constr" && !obj.finite) {
    // Nekonečná konstrukční čára (CAD nástroj) – natáhnout daleko za oba konce.
    // Konečná (obj.finite) konstrukční čára z CAM (oříznutá mezní/tečná čára)
    // se kreslí jen mezi koncovými body → spadne do else větve níže.
    const dx = sx2 - sx1,
      dy = sy2 - sy1;
    const len = Math.hypot(dx, dy);
    if (len < 0.1) return;
    const scale = 5000 / len;
    _tv.ctx.beginPath();
    _tv.ctx.moveTo(sx1 - dx * scale, sy1 - dy * scale);
    _tv.ctx.lineTo(sx2 + dx * scale, sy2 + dy * scale);
    _tv.ctx.stroke();
  } else {
    _tv.ctx.beginPath();
    _tv.ctx.moveTo(sx1, sy1);
    _tv.ctx.lineTo(sx2, sy2);
    _tv.ctx.stroke();
  }
  _tv.ctx.beginPath();
  _tv.ctx.arc(sx1, sy1, 2.5, 0, Math.PI * 2);
  _tv.ctx.fill();
  _tv.ctx.beginPath();
  _tv.ctx.arc(sx2, sy2, 2.5, 0, Math.PI * 2);
  _tv.ctx.fill();
}

/** @param {import('../types.js').CircleObject} obj */
export function drawCircle(obj) {
  const [sx, sy] = worldToScreen(obj.cx, obj.cy);
  const r = obj.r * state.zoom;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx, sy, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** @param {import('../types.js').ArcObject} obj */
export function drawArc(obj) {
  const [sx, sy] = worldToScreen(obj.cx, obj.cy);
  const r = obj.r * state.zoom;
  ctx.beginPath();
  // ccw in math → canvas anticlockwise=true; default (no ccw) = CCW for backward compat
  ctx.arc(sx, sy, r, screenAngle(obj.startAngle), screenAngle(obj.endAngle), screenCCW(obj.ccw !== false));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx, sy, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Středová značka (křížek) pro kružnice a oblouky. */
export function drawCenterMark(obj) {
  if (!obj.r || obj.r <= 0) return;
  const [sx, sy] = worldToScreen(obj.cx, obj.cy);
  const r = obj.r * state.zoom;
  const ext = Math.min(r * 0.15, 8); // přesah za kružnici
  const halfLen = r + ext;
  const savedStroke = ctx.strokeStyle;
  const savedWidth = ctx.lineWidth;
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx - halfLen, sy);
  ctx.lineTo(sx + halfLen, sy);
  ctx.moveTo(sx, sy - halfLen);
  ctx.lineTo(sx, sy + halfLen);
  ctx.stroke();
  // Malé kolečko ve středu
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = savedStroke;
  ctx.lineWidth = savedWidth;
}

/** @param {import('../types.js').RectObject} obj */
export function drawRect(obj, isSel, normalColor, objIdx) {
  const c = getRectCorners(obj);
  const sc = c.map(p => worldToScreen(p.x, p.y));
  const objSegs = state.multiSelectedSegments.get(objIdx);
  const isSegMode = objSegs && objSegs.size > 0;
  const isSegSelected = (i) => isSegMode && objSegs.has(i);

  if (isSegMode) {
    const baseStroke = ctx.strokeStyle;
    const baseWidth = ctx.lineWidth;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      if (isSegSelected(i)) {
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = LINE_WIDTH_SELECTED;
      } else {
        ctx.strokeStyle = normalColor || COLORS.primary;
        ctx.lineWidth = LINE_WIDTH;
      }
      ctx.beginPath();
      ctx.moveTo(sc[i][0], sc[i][1]);
      ctx.lineTo(sc[j][0], sc[j][1]);
      ctx.stroke();
    }
    // Vertex dots
    for (let i = 0; i < 4; i++) {
      const isVtxSel = isSegSelected(i) || isSegSelected((i + 3) % 4);
      ctx.fillStyle = isVtxSel ? COLORS.selected : (normalColor || COLORS.primary);
      ctx.beginPath();
      ctx.arc(sc[i][0], sc[i][1], isVtxSel ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = baseStroke;
    ctx.lineWidth = baseWidth;
    ctx.fillStyle = baseStroke;
  } else {
    ctx.beginPath();
    ctx.moveTo(sc[0][0], sc[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(sc[i][0], sc[i][1]);
    ctx.closePath();
    ctx.stroke();
  }
}

/** @param {import('../types.js').PolylineObject} obj */
export function drawPolyline(obj, isSel, normalColor, objIdx) {
  const n = obj.vertices.length;
  if (n < 2) return;
  const segCount = obj.closed ? n : n - 1;
  const objSegs = state.multiSelectedSegments.get(objIdx);
  const isSegMode = objSegs && objSegs.size > 0;
  const isSegSelected = (i) => isSegMode && objSegs.has(i);

  // Save current styles
  const baseStroke = ctx.strokeStyle;
  const baseWidth = ctx.lineWidth;

  for (let i = 0; i < segCount; i++) {
    const p1 = obj.vertices[i];
    const p2 = obj.vertices[(i + 1) % n];
    const b = obj.bulges[i] || 0;
    const [sx1, sy1] = worldToScreen(p1.x, p1.y);
    const [sx2, sy2] = worldToScreen(p2.x, p2.y);

    // When a segment is selected: selected segment = white, rest = normal color
    if (isSegSelected(i)) {
      ctx.strokeStyle = COLORS.selected;  // White for selected segment
      ctx.lineWidth = LINE_WIDTH_SELECTED;
    } else if (isSegMode) {
      ctx.strokeStyle = normalColor || COLORS.primary;
      ctx.lineWidth = LINE_WIDTH;
    }

    if (b === 0) {
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    } else {
      const arc = bulgeToArc(p1, p2, b);
      if (arc) {
        const [scx, scy] = worldToScreen(arc.cx, arc.cy);
        const sr = arc.r * state.zoom;
        ctx.beginPath();
        ctx.arc(scx, scy, sr, screenAngle(arc.endAngle), screenAngle(arc.startAngle), screenCCW(b < 0));
        ctx.stroke();
      }
    }
  }

  // Restore styles
  ctx.strokeStyle = baseStroke;
  ctx.lineWidth = baseWidth;

  // Vertex dots — skrýt u polylines s mnoha vertexy (boolean výsledky, kruhové aproximace)
  const showVertexDots = n <= 20 || isSel || isSegMode;
  if (showVertexDots) {
    for (let vi = 0; vi < n; vi++) {
      const v = obj.vertices[vi];
      const [sx, sy] = worldToScreen(v.x, v.y);
      // Highlight vertices of selected segments in white, others in normal color
      const isVtxSel = isSegMode && (isSegSelected(vi) || isSegSelected(((vi - 1) % n + n) % n));
      if (isSegMode) {
        ctx.fillStyle = isVtxSel ? COLORS.selected : (normalColor || COLORS.primary);
      } else {
        ctx.fillStyle = baseStroke;
      }
      ctx.beginPath();
      ctx.arc(sx, sy, isVtxSel ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Restore fillStyle
  ctx.fillStyle = baseStroke;
}
