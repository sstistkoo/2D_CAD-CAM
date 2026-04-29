// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – SVG / PNG Export                                   ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast } from '../state.js';
import { COLORS } from '../constants.js';
import { bulgeToArc } from '../utils.js';

// ── Pomocné funkce ──

function getObjectsBoundingBox() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasObjects = false;

  for (const obj of state.objects) {
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) continue;
    hasObjects = true;

    switch (obj.type) {
      case 'point':
        minX = Math.min(minX, obj.x); maxX = Math.max(maxX, obj.x);
        minY = Math.min(minY, obj.y); maxY = Math.max(maxY, obj.y);
        break;
      case 'line': case 'constr':
        minX = Math.min(minX, obj.x1, obj.x2); maxX = Math.max(maxX, obj.x1, obj.x2);
        minY = Math.min(minY, obj.y1, obj.y2); maxY = Math.max(maxY, obj.y1, obj.y2);
        break;
      case 'circle':
        minX = Math.min(minX, obj.cx - obj.r); maxX = Math.max(maxX, obj.cx + obj.r);
        minY = Math.min(minY, obj.cy - obj.r); maxY = Math.max(maxY, obj.cy + obj.r);
        break;
      case 'arc': {
        // Start/end points
        const sx = obj.cx + obj.r * Math.cos(obj.startAngle);
        const sy = obj.cy + obj.r * Math.sin(obj.startAngle);
        const ex = obj.cx + obj.r * Math.cos(obj.endAngle);
        const ey = obj.cy + obj.r * Math.sin(obj.endAngle);
        minX = Math.min(minX, sx, ex); maxX = Math.max(maxX, sx, ex);
        minY = Math.min(minY, sy, ey); maxY = Math.max(maxY, sy, ey);
        // Check cardinal angles
        const cardinals = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
        for (const a of cardinals) {
          if (isAngleBetweenExport(obj.startAngle, obj.endAngle, a)) {
            const px = obj.cx + obj.r * Math.cos(a);
            const py = obj.cy + obj.r * Math.sin(a);
            minX = Math.min(minX, px); maxX = Math.max(maxX, px);
            minY = Math.min(minY, py); maxY = Math.max(maxY, py);
          }
        }
        break;
      }
      case 'rect':
        minX = Math.min(minX, obj.x1, obj.x2); maxX = Math.max(maxX, obj.x1, obj.x2);
        minY = Math.min(minY, obj.y1, obj.y2); maxY = Math.max(maxY, obj.y1, obj.y2);
        break;
      case 'polyline':
        for (const v of obj.vertices) {
          minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
        }
        break;
    }
  }

  if (!hasObjects) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}

function isAngleBetweenExport(start, end, angle) {
  // Normalize angles to [0, 2PI]
  const TAU = Math.PI * 2;
  const s = ((start % TAU) + TAU) % TAU;
  const e = ((end % TAU) + TAU) % TAU;
  const a = ((angle % TAU) + TAU) % TAU;
  if (s <= e) return a >= s && a <= e;
  return a >= s || a <= e;
}

function getObjColor(obj) {
  const layer = state.layers.find(l => l.id === obj.layer);
  const layerColor = layer ? layer.color : COLORS.primary;
  if (obj.type === 'constr') return COLORS.construction;
  return obj.color || layerColor;
}

function getDimensionText(obj) {
  switch (obj.type) {
    case 'line': {
      const len = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
      return { x: (obj.x1 + obj.x2) / 2 + 2, y: (obj.y1 + obj.y2) / 2 + 2, text: len.toFixed(2) };
    }
    case 'circle':
      return { x: obj.cx + 2, y: obj.cy + 2, text: `R${obj.r.toFixed(2)}` };
    case 'arc':
      return { x: obj.cx + 2, y: obj.cy + 2, text: `R${obj.r.toFixed(2)}` };
    case 'rect': {
      const w = Math.abs(obj.x2 - obj.x1), h = Math.abs(obj.y2 - obj.y1);
      return { x: (obj.x1 + obj.x2) / 2, y: Math.max(obj.y1, obj.y2) + 3, text: `${w.toFixed(2)} × ${h.toFixed(2)}` };
    }
    default: return null;
  }
}

// ── SVG Export ──

function exportSVG(background) {
  const bb = getObjectsBoundingBox();
  const padX = (bb.maxX - bb.minX) * 0.1 || 10;
  const padY = (bb.maxY - bb.minY) * 0.1 || 10;
  const vx = bb.minX - padX;
  const vy = -(bb.maxY + padY); // flip Y for SVG
  const vw = (bb.maxX - bb.minX) + 2 * padX;
  const vh = (bb.maxY - bb.minY) + 2 * padY;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('xmlns', ns);
  svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  svg.setAttribute('width', Math.round(vw));
  svg.setAttribute('height', Math.round(vh));

  // Background
  if (background !== 'transparent') {
    const bgRect = document.createElementNS(ns, 'rect');
    bgRect.setAttribute('x', vx);
    bgRect.setAttribute('y', vy);
    bgRect.setAttribute('width', vw);
    bgRect.setAttribute('height', vh);
    bgRect.setAttribute('fill', background === 'dark' ? COLORS.bgDark : '#ffffff');
    svg.appendChild(bgRect);
  }

  // Objects
  for (const obj of state.objects) {
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) continue;

    const color = getObjColor(obj);
    const strokeW = obj.type === 'constr' ? 1 : 1.5;
    const dash = (obj.type === 'constr' || obj.dashed) ? '6,4' : '';

    switch (obj.type) {
      case 'point': {
        const g = document.createElementNS(ns, 'g');
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', obj.x);
        c.setAttribute('cy', -obj.y);
        c.setAttribute('r', 2);
        c.setAttribute('fill', color);
        g.appendChild(c);
        // crosshair
        const l1 = document.createElementNS(ns, 'line');
        l1.setAttribute('x1', obj.x - 4); l1.setAttribute('y1', -obj.y);
        l1.setAttribute('x2', obj.x + 4); l1.setAttribute('y2', -obj.y);
        l1.setAttribute('stroke', color); l1.setAttribute('stroke-width', '1');
        g.appendChild(l1);
        const l2 = document.createElementNS(ns, 'line');
        l2.setAttribute('x1', obj.x); l2.setAttribute('y1', -obj.y - 4);
        l2.setAttribute('x2', obj.x); l2.setAttribute('y2', -obj.y + 4);
        l2.setAttribute('stroke', color); l2.setAttribute('stroke-width', '1');
        g.appendChild(l2);
        svg.appendChild(g);
        break;
      }
      case 'line': case 'constr': {
        const el = document.createElementNS(ns, 'line');
        el.setAttribute('x1', obj.x1); el.setAttribute('y1', -obj.y1);
        el.setAttribute('x2', obj.x2); el.setAttribute('y2', -obj.y2);
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', strokeW);
        el.setAttribute('fill', 'none');
        if (dash) el.setAttribute('stroke-dasharray', dash);
        svg.appendChild(el);
        break;
      }
      case 'circle': {
        const el = document.createElementNS(ns, 'circle');
        el.setAttribute('cx', obj.cx); el.setAttribute('cy', -obj.cy);
        el.setAttribute('r', obj.r);
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', strokeW);
        el.setAttribute('fill', 'none');
        if (dash) el.setAttribute('stroke-dasharray', dash);
        svg.appendChild(el);
        break;
      }
      case 'arc': {
        const sx = obj.cx + obj.r * Math.cos(obj.startAngle);
        const sy = obj.cy + obj.r * Math.sin(obj.startAngle);
        const ex = obj.cx + obj.r * Math.cos(obj.endAngle);
        const ey = obj.cy + obj.r * Math.sin(obj.endAngle);
        let sweep = obj.endAngle - obj.startAngle;
        if (sweep < 0) sweep += Math.PI * 2;
        const largeArc = sweep > Math.PI ? 1 : 0;
        // In SVG Y is flipped, so sweep direction is inverted
        const d = `M ${sx} ${-sy} A ${obj.r} ${obj.r} 0 ${largeArc} 0 ${ex} ${-ey}`;
        const el = document.createElementNS(ns, 'path');
        el.setAttribute('d', d);
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', strokeW);
        el.setAttribute('fill', 'none');
        if (dash) el.setAttribute('stroke-dasharray', dash);
        svg.appendChild(el);
        break;
      }
      case 'rect': {
        const el = document.createElementNS(ns, 'rect');
        const rx = Math.min(obj.x1, obj.x2);
        const ry = Math.max(obj.y1, obj.y2); // top in world = lowest -Y in SVG
        el.setAttribute('x', rx);
        el.setAttribute('y', -ry);
        el.setAttribute('width', Math.abs(obj.x2 - obj.x1));
        el.setAttribute('height', Math.abs(obj.y2 - obj.y1));
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', strokeW);
        el.setAttribute('fill', 'none');
        if (dash) el.setAttribute('stroke-dasharray', dash);
        svg.appendChild(el);
        break;
      }
      case 'polyline': {
        const n = obj.vertices.length;
        if (n < 2) break;
        const segCount = obj.closed ? n : n - 1;
        let d = `M ${obj.vertices[0].x} ${-obj.vertices[0].y}`;
        for (let i = 0; i < segCount; i++) {
          const p2 = obj.vertices[(i + 1) % n];
          const b = obj.bulges[i] || 0;
          if (b === 0) {
            d += ` L ${p2.x} ${-p2.y}`;
          } else {
            const arc = bulgeToArc(obj.vertices[i], p2, b);
            if (arc) {
              const largeArc = Math.abs(4 * Math.atan(Math.abs(b))) > Math.PI ? 1 : 0;
              const sweepFlag = b > 0 ? 0 : 1;
              d += ` A ${arc.r} ${arc.r} 0 ${largeArc} ${sweepFlag} ${p2.x} ${-p2.y}`;
            } else {
              d += ` L ${p2.x} ${-p2.y}`;
            }
          }
        }
        if (obj.closed) d += ' Z';
        const el = document.createElementNS(ns, 'path');
        el.setAttribute('d', d);
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', strokeW);
        el.setAttribute('fill', 'none');
        if (dash) el.setAttribute('stroke-dasharray', dash);
        svg.appendChild(el);
        break;
      }
    }

    // Kóty jako text
    if (state.showDimensions !== 'none' && obj.type !== 'constr') {
      const dimText = getDimensionText(obj);
      if (dimText) {
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', dimText.x);
        t.setAttribute('y', -dimText.y);
        t.setAttribute('fill', COLORS.textSecondary);
        t.setAttribute('font-size', '4');
        t.setAttribute('font-family', 'Consolas, monospace');
        t.textContent = dimText.text;
        svg.appendChild(t);
      }
    }
  }

  // Serialize and download
  const serializer = new XMLSerializer();
  const svgStr = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(svg);
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.projectName || 'skica'}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('SVG exportováno');
}

// ── PNG Export ──

function exportPNG(scale, background) {
  const bb = getObjectsBoundingBox();
  const padX = (bb.maxX - bb.minX) * 0.1 || 10;
  const padY = (bb.maxY - bb.minY) * 0.1 || 10;
  const worldW = (bb.maxX - bb.minX) + 2 * padX;
  const worldH = (bb.maxY - bb.minY) + 2 * padY;

  // Base pixel size: 1 world unit = 2 pixels at 1×
  const basePixPerUnit = 2;
  const canvasW = Math.ceil(worldW * basePixPerUnit * scale);
  const canvasH = Math.ceil(worldH * basePixPerUnit * scale);

  const offCanvas = document.createElement('canvas');
  offCanvas.width = canvasW;
  offCanvas.height = canvasH;
  const g = offCanvas.getContext('2d');

  // Background
  if (background === 'transparent') {
    g.clearRect(0, 0, canvasW, canvasH);
  } else {
    g.fillStyle = background === 'dark' ? COLORS.bgDark : '#ffffff';
    g.fillRect(0, 0, canvasW, canvasH);
  }

  // Transform: world → offscreen pixel coords
  const zoom = basePixPerUnit * scale;
  const panX = -bb.minX * zoom + padX * zoom;
  const panY = bb.maxY * zoom + padY * zoom;

  function w2s(wx, wy) {
    return [wx * zoom + panX, -wy * zoom + panY];
  }

  // Render all visible objects
  for (const obj of state.objects) {
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) continue;

    const color = getObjColor(obj);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = 1.5 * scale;
    g.setLineDash((obj.type === 'constr' || obj.dashed) ? [6 * scale, 4 * scale] : []);

    switch (obj.type) {
      case 'point': {
        const [sx, sy] = w2s(obj.x, obj.y);
        g.beginPath(); g.arc(sx, sy, 3 * scale, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(sx - 6 * scale, sy); g.lineTo(sx + 6 * scale, sy);
        g.moveTo(sx, sy - 6 * scale); g.lineTo(sx, sy + 6 * scale); g.stroke();
        break;
      }
      case 'line': case 'constr': {
        const [sx1, sy1] = w2s(obj.x1, obj.y1);
        const [sx2, sy2] = w2s(obj.x2, obj.y2);
        g.beginPath(); g.moveTo(sx1, sy1); g.lineTo(sx2, sy2); g.stroke();
        break;
      }
      case 'circle': {
        const [sx, sy] = w2s(obj.cx, obj.cy);
        const r = obj.r * zoom;
        g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.stroke();
        break;
      }
      case 'arc': {
        const [sx, sy] = w2s(obj.cx, obj.cy);
        const r = obj.r * zoom;
        g.beginPath(); g.arc(sx, sy, r, -obj.endAngle, -obj.startAngle); g.stroke();
        break;
      }
      case 'rect': {
        const [sx1, sy1] = w2s(obj.x1, obj.y1);
        const [sx2, sy2] = w2s(obj.x2, obj.y2);
        g.beginPath();
        g.rect(Math.min(sx1, sx2), Math.min(sy1, sy2), Math.abs(sx2 - sx1), Math.abs(sy2 - sy1));
        g.stroke();
        break;
      }
      case 'polyline': {
        const n = obj.vertices.length;
        if (n < 2) break;
        const segCount = obj.closed ? n : n - 1;
        for (let i = 0; i < segCount; i++) {
          const p1 = obj.vertices[i];
          const p2 = obj.vertices[(i + 1) % n];
          const b = obj.bulges[i] || 0;
          const [sx1, sy1] = w2s(p1.x, p1.y);
          const [sx2, sy2] = w2s(p2.x, p2.y);
          if (b === 0) {
            g.beginPath(); g.moveTo(sx1, sy1); g.lineTo(sx2, sy2); g.stroke();
          } else {
            const arc = bulgeToArc(p1, p2, b);
            if (arc) {
              const [scx, scy] = w2s(arc.cx, arc.cy);
              const sr = arc.r * zoom;
              g.beginPath(); g.arc(scx, scy, sr, -arc.endAngle, -arc.startAngle, b < 0); g.stroke();
            }
          }
        }
        break;
      }
    }
    g.setLineDash([]);
  }

  offCanvas.toBlob((blob) => {
    if (!blob) { showToast('Chyba při generování PNG'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.projectName || 'skica'}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('PNG exportováno');
  }, 'image/png');
}

// ── Dialog ──

/** Otevře dialog pro export obrázku (PNG). */
export function showExportImageDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'input-overlay';
  overlay.innerHTML = `
    <div class="input-dialog">
      <h3>🖼 Export obrazu</h3>
      <label>Formát:</label>
      <select id="expFormat">
        <option value="svg">SVG (vektorový)</option>
        <option value="png">PNG (rastrový)</option>
      </select>
      <div id="pngOptions">
        <label>Rozlišení PNG:</label>
        <select id="expScale">
          <option value="1">1× (standardní)</option>
          <option value="2" selected>2× (vysoké)</option>
          <option value="4">4× (velmi vysoké)</option>
        </select>
      </div>
      <label>Pozadí:</label>
      <select id="expBg">
        <option value="dark">Tmavé (${COLORS.bgDark})</option>
        <option value="white">Bílé</option>
        <option value="transparent">Průhledné</option>
      </select>
      <div class="btn-row">
        <button class="btn-cancel" id="expCancel">Zrušit</button>
        <button class="btn-ok" id="expOk">Exportovat</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const fmtSel = overlay.querySelector('#expFormat');
  const pngOpts = overlay.querySelector('#pngOptions');
  fmtSel.addEventListener('change', () => {
    pngOpts.style.display = fmtSel.value === 'png' ? '' : 'none';
  });

  overlay.querySelector('#expOk').addEventListener('click', () => {
    const format = fmtSel.value;
    const bg = overlay.querySelector('#expBg').value;
    const scale = parseInt(overlay.querySelector('#expScale')?.value || '2');
    overlay.remove();
    if (format === 'svg') {
      exportSVG(bg);
    } else {
      exportPNG(scale, bg);
    }
  });
  overlay.querySelector('#expCancel').addEventListener('click', () => overlay.remove());
  // Propagace keydown prevence
  overlay.querySelectorAll('select').forEach(sel => {
    sel.addEventListener('keydown', e => e.stopPropagation());
  });
}
