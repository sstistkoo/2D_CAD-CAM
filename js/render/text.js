// SKICA – render: Text (i po cestě) a export textu/kót do cizího kontextu
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { drawDimension } from './labels.js';
import { drawLine, drawPoint } from './primitives.js';
import { getTextPathObject } from '../utils.js';
import { _textFill, _tv, _withView } from './view.js';

/** Vykreslí text do cizího 2D kontextu (export), bez značek pro výběr. */
export function drawTextOn(g, obj, view) {
  _withView(g, view, () => drawText(obj, false));
}

/**
 * Vykreslí kótu (isDimension úsečka / souřadnicový štítek isCoordLabel) do
 * cizího 2D kontextu – šipky, odkazové čáry, popisky jako na plátně.
 */
export function drawDimensionOn(g, obj, view) {
  _withView(g, view, () => {
    if (obj.type === 'point') drawPoint(obj);
    else if (obj.type === 'line') drawLine(obj);
  });
}

/** Automatické popisy rozměrů objektu (R/⌀ kružnice a oblouku, obdélník…). */
export function drawAutoDimensionOn(g, obj, view) {
  _withView(g, view, () => drawDimension(obj));
}

/** @param {import('../types.js').TextObject} obj */
export function drawText(obj, isSel) {
  const [sx, sy] = _tv.w2s(obj.x, obj.y);
  const fontSize = obj.fontSize || 14;
  const screenSize = Math.round(Math.max(1, fontSize * _tv.zoom()));
  const fontFamily = obj.fontFamily || 'Consolas, monospace';
  const bold = obj.bold ? 'bold ' : '';
  const italic = obj.italic ? 'italic ' : '';

  // Omezení velikosti fontu – prohlížeče mohou přestat kreslit velký text
  const MAX_FONT = 500;
  const fontScale = screenSize > MAX_FONT ? screenSize / MAX_FONT : 1;
  const clampedSize = Math.min(screenSize, MAX_FONT);

  _tv.ctx.font = `${italic}${bold}${clampedSize}px ${fontFamily}`;
  _tv.ctx.fillStyle = _textFill(obj, isSel);
  const align = obj.textAlign || 'left';
  _tv.ctx.textAlign = align;
  _tv.ctx.textBaseline = 'bottom';
  const spacing = (obj.letterSpacing || 0) * _tv.zoom();
  const textStr = obj.text || '';

  // Text podél cesty (úsečka nebo oblouk)
  {
    const pathObj = getTextPathObject(obj);
    if (pathObj) {
      const pathOffset = (obj.pathOffset || 0) * _tv.zoom();
      const pathStart = (obj.pathStart || 0) * _tv.zoom();
      const fontStr = _tv.ctx.font;
      if (obj.pathMode === 'line' && (pathObj.type === 'line' || pathObj.type === 'constr')) {
        _drawTextAlongLine(textStr, pathObj, screenSize, spacing, pathOffset, pathStart, align, fontStr);
      } else if (obj.pathMode === 'arc' && pathObj.type === 'arc') {
        _drawTextAlongArc(textStr, pathObj, screenSize, spacing, pathOffset, obj.pathStart || 0, align, fontStr);
      } else if (obj.pathMode === 'circle' && pathObj.type === 'circle') {
        _drawTextAlongCircle(textStr, pathObj, screenSize, spacing, pathOffset, obj.pathStart || 0, align, fontStr);
      }
      // Viditelný marker (čtvereček) na začátku cesty, aby šel text snadno vybrat
      let msx, msy;
      if (obj.pathMode === 'line' && (pathObj.type === 'line' || pathObj.type === 'constr')) {
        [msx, msy] = _tv.w2s(pathObj.x1, pathObj.y1);
      } else if (obj.pathMode === 'arc' && pathObj.type === 'arc') {
        [msx, msy] = _tv.w2s(pathObj.cx + pathObj.r * Math.cos(pathObj.startAngle), pathObj.cy + pathObj.r * Math.sin(pathObj.startAngle));
      } else if (obj.pathMode === 'circle' && pathObj.type === 'circle') {
        [msx, msy] = _tv.w2s(pathObj.cx, pathObj.cy - pathObj.r);
      } else {
        [msx, msy] = [sx, sy];
      }
      if (_tv.markers) {
        _tv.ctx.beginPath();
        const mSize = 4;
        _tv.ctx.rect(msx - mSize, msy - mSize, mSize * 2, mSize * 2);
        _tv.ctx.fillStyle = _textFill(obj, isSel);
        _tv.ctx.fill();
      }
      _tv.ctx.textAlign = 'start';
      _tv.ctx.textBaseline = 'alphabetic';
      return;
    }
  }

  // Standardní text (s/bez rotace)
  const sSx = sx / fontScale, sSy = sy / fontScale;
  const sSpacing = spacing / fontScale;
  if (sSpacing && textStr.length > 1) {
    // Vykreslení po znacích s mezerou
    _tv.ctx.save();
    if (fontScale > 1) _tv.ctx.scale(fontScale, fontScale);
    _tv.ctx.translate(sSx, sSy);
    if (obj.rotation) _tv.ctx.rotate(-obj.rotation);
    _tv.ctx.textAlign = 'left';
    let offsetX = 0;
    if (align === 'center') {
      const totalW = _measureTextSpaced(textStr, sSpacing);
      offsetX = -totalW / 2;
    } else if (align === 'right') {
      const totalW = _measureTextSpaced(textStr, sSpacing);
      offsetX = -totalW;
    }
    for (let i = 0; i < textStr.length; i++) {
      _tv.ctx.fillText(textStr[i], offsetX, 0);
      offsetX += _tv.ctx.measureText(textStr[i]).width + sSpacing;
    }
    _tv.ctx.restore();
  } else if (obj.rotation) {
    _tv.ctx.save();
    if (fontScale > 1) _tv.ctx.scale(fontScale, fontScale);
    _tv.ctx.translate(sSx, sSy);
    _tv.ctx.rotate(-obj.rotation);
    _tv.ctx.fillText(textStr, 0, 0);
    _tv.ctx.restore();
  } else {
    _tv.ctx.save();
    if (fontScale > 1) _tv.ctx.scale(fontScale, fontScale);
    _tv.ctx.fillText(textStr, sSx, sSy);
    _tv.ctx.restore();
  }
  // Malý marker na kotevním bodě (jen na plátně, ne v exportu)
  if (_tv.markers) {
    _tv.ctx.beginPath();
    _tv.ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    _tv.ctx.fill();
  }
  _tv.ctx.textAlign = 'start';
  _tv.ctx.textBaseline = 'alphabetic';
}

/** Měří šířku textu s mezerou mezi znaky */
function _measureTextSpaced(text, spacing) {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += _tv.ctx.measureText(text[i]).width;
    if (i < text.length - 1) w += spacing;
  }
  return w;
}

/** Vykreslí text podél úsečky */
function _drawTextAlongLine(text, lineObj, screenSize, spacing, pathOffset, pathStart, align, fontStr) {
  const [sx1, sy1] = _tv.w2s(lineObj.x1, lineObj.y1);
  const [sx2, sy2] = _tv.w2s(lineObj.x2, lineObj.y2);
  const dx = sx2 - sx1, dy = sy2 - sy1;
  const lineLen = Math.hypot(dx, dy);
  if (lineLen < 1) return;
  const angle = Math.atan2(dy, dx);
  const nx = dy / lineLen;
  const ny = -dx / lineLen;
  const off = pathOffset || 0;
  const startOff = pathStart || 0;

  // Omezení velikosti fontu – při velkém zoomu použij scale
  const MAX_FONT = 500;
  const fontScale = screenSize > MAX_FONT ? screenSize / MAX_FONT : 1;
  const clampedSize = Math.min(screenSize, MAX_FONT);

  _tv.ctx.save();
  if (fontStr && fontScale > 1) {
    _tv.ctx.font = fontStr.replace(/(\d+)px/, clampedSize + 'px');
  } else if (fontStr) {
    _tv.ctx.font = fontStr;
  }
  _tv.ctx.textAlign = 'left';
  _tv.ctx.textBaseline = 'bottom';

  if (fontScale > 1) _tv.ctx.scale(fontScale, fontScale);
  const sLineLen = lineLen / fontScale;
  const sOff = off / fontScale;
  const sSpacing = spacing / fontScale;
  const sSx1 = sx1 / fontScale, sSy1 = sy1 / fontScale;
  const sDx = dx / fontScale, sDy = dy / fontScale;
  const sStartOff = startOff / fontScale;

  // Vypočti celkovou šířku textu pro zarovnání
  let totalW = 0;
  for (let i = 0; i < text.length; i++) {
    totalW += _tv.ctx.measureText(text[i]).width;
    if (i < text.length - 1) totalW += sSpacing;
  }

  let offsetX = sStartOff;
  if (align === 'center') {
    offsetX += (sLineLen - totalW) / 2;
  } else if (align === 'right') {
    offsetX += sLineLen - totalW;
  }

  for (let i = 0; i < text.length; i++) {
    const charW = _tv.ctx.measureText(text[i]).width;
    if (offsetX + charW > sLineLen) break;
    if (offsetX < 0) { offsetX += charW + sSpacing; continue; }
    const px = sSx1 + sDx * (offsetX / sLineLen) + nx * sOff;
    const py = sSy1 + sDy * (offsetX / sLineLen) + ny * sOff;
    _tv.ctx.save();
    _tv.ctx.translate(px, py);
    _tv.ctx.rotate(angle);
    _tv.ctx.fillText(text[i], 0, -2);
    _tv.ctx.restore();
    offsetX += charW + sSpacing;
  }
  _tv.ctx.restore();
}

/** Vykreslí text podél oblouku */
function _drawTextAlongArc(text, arcObj, screenSize, spacing, pathOffset, pathStartAngle, align, fontStr) {
  const [scx, scy] = _tv.w2s(arcObj.cx, arcObj.cy);
  const sr = arcObj.r * _tv.zoom();
  if (sr < 1) return;

  let startAngle = _tv.angle(arcObj.startAngle);
  let endAngle = _tv.angle(arcObj.endAngle);
  if (endAngle > startAngle) {
    const tmp = startAngle;
    startAngle = endAngle;
    endAngle = tmp;
  }

  // Omezení velikosti fontu – při velkém zoomu použij scale
  const MAX_FONT = 500;
  const fontScale = screenSize > MAX_FONT ? screenSize / MAX_FONT : 1;
  const clampedSize = Math.min(screenSize, MAX_FONT);

  _tv.ctx.save();
  if (fontStr && fontScale > 1) {
    _tv.ctx.font = fontStr.replace(/(\d+)px/, clampedSize + 'px');
  } else if (fontStr) {
    _tv.ctx.font = fontStr;
  }
  _tv.ctx.textAlign = 'center';
  _tv.ctx.textBaseline = 'bottom';

  const scaledRadius = (sr + (pathOffset != null ? pathOffset : 4)) / fontScale;
  const scaledSpacing = spacing / fontScale;
  const scaledSCX = scx / fontScale;
  const scaledSCY = scy / fontScale;
  if (scaledRadius < 1) { _tv.ctx.restore(); return; }

  // Celkový úhel textu pro zarovnání
  let totalAngle = 0;
  for (let i = 0; i < text.length; i++) {
    totalAngle += _tv.ctx.measureText(text[i]).width / scaledRadius;
    if (i < text.length - 1) totalAngle += scaledSpacing / scaledRadius;
  }
  const arcSpan = startAngle - endAngle;

  let currentAngle = startAngle - (pathStartAngle || 0);
  if (align === 'center') {
    currentAngle -= (arcSpan - totalAngle) / 2;
  } else if (align === 'right') {
    currentAngle -= (arcSpan - totalAngle);
  }

  if (fontScale > 1) _tv.ctx.scale(fontScale, fontScale);

  for (let i = 0; i < text.length; i++) {
    const charW = _tv.ctx.measureText(text[i]).width;
    const charAngle = charW / scaledRadius;
    const halfChar = charAngle / 2;
    const drawAngle = currentAngle - halfChar;

    if (drawAngle < endAngle) break;

    const px = scaledSCX + scaledRadius * Math.cos(drawAngle);
    const py = scaledSCY + scaledRadius * Math.sin(drawAngle);
    _tv.ctx.save();
    _tv.ctx.translate(px, py);
    _tv.ctx.rotate(drawAngle - Math.PI / 2);
    _tv.ctx.fillText(text[i], 0, 0);
    _tv.ctx.restore();

    currentAngle -= charAngle + (scaledSpacing / scaledRadius);
  }
  _tv.ctx.restore();
}

/** Vykreslí text podél kružnice */
function _drawTextAlongCircle(text, circleObj, screenSize, spacing, pathOffset, pathStartAngle, align, fontStr) {
  const [scx, scy] = _tv.w2s(circleObj.cx, circleObj.cy);
  const sr = circleObj.r * _tv.zoom();
  if (sr < 1) return;

  // Omezení velikosti fontu – při velkém zoomu použij scale
  const MAX_FONT = 500;
  const fontScale = screenSize > MAX_FONT ? screenSize / MAX_FONT : 1;
  const clampedSize = Math.min(screenSize, MAX_FONT);

  _tv.ctx.save();
  // Přepočti font s omezenou velikostí
  if (fontStr && fontScale > 1) {
    _tv.ctx.font = fontStr.replace(/(\d+)px/, clampedSize + 'px');
  } else if (fontStr) {
    _tv.ctx.font = fontStr;
  }
  _tv.ctx.textAlign = 'center';
  _tv.ctx.textBaseline = 'bottom';

  // Poloměr a odsazení – přepočítáno na scaled souřadnice
  const scaledRadius = (sr + (pathOffset != null ? pathOffset : 4)) / fontScale;
  const scaledSpacing = spacing / fontScale;
  const scaledSCX = scx / fontScale;
  const scaledSCY = scy / fontScale;
  if (scaledRadius < 1) { _tv.ctx.restore(); return; }

  // Celkový úhel textu pro zarovnání kolem kružnice
  let totalAngle = 0;
  for (let i = 0; i < text.length; i++) {
    totalAngle += _tv.ctx.measureText(text[i]).width / scaledRadius;
    if (i < text.length - 1) totalAngle += scaledSpacing / scaledRadius;
  }

  // Začátek nahoře (screen -π/2) + úhlový posun
  let currentAngle = -Math.PI / 2 - (pathStartAngle || 0);
  if (align === 'center') {
    currentAngle += totalAngle / 2;
  } else if (align === 'right') {
    currentAngle += totalAngle;
  }

  // Aplikuj scale pro velké fonty
  if (fontScale > 1) _tv.ctx.scale(fontScale, fontScale);

  for (let i = 0; i < text.length; i++) {
    const charW = _tv.ctx.measureText(text[i]).width;
    const charAngle = charW / scaledRadius;
    const halfChar = charAngle / 2;
    const drawAngle = currentAngle - halfChar;

    const px = scaledSCX + scaledRadius * Math.cos(drawAngle);
    const py = scaledSCY + scaledRadius * Math.sin(drawAngle);
    _tv.ctx.save();
    _tv.ctx.translate(px, py);
    _tv.ctx.rotate(drawAngle + Math.PI / 2);
    _tv.ctx.fillText(text[i], 0, 0);
    _tv.ctx.restore();

    currentAngle -= charAngle + (scaledSpacing / scaledRadius);
  }
  _tv.ctx.restore();
}
