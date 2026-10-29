// SKICA – render: Překryvy: mezery kontury, zvýraznění, výběr, snap
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { ctx, drawCanvas, screenAngle, screenCCW, worldToScreen } from '../canvas.js';
import { DIM_MATCH_TOL } from './common.js';
import { COLORS, LINE_WIDTH } from '../constants.js';
import { fmtCoordLabel, fmtStatusCoords, state } from '../state.js';
import { bulgeToArc, getRectCorners } from '../utils.js';

// ── Mezery v kontuře (zvýraznění chyb před generováním polotovaru/G-kódu) ──
export function drawContourGapMarkers() {
  if (!state.showContourGaps) return;
  const gaps = state.contourGaps;
  if (!gaps || gaps.length === 0) return;
  ctx.save();
  ctx.strokeStyle = COLORS.delete;
  ctx.fillStyle = COLORS.delete;
  ctx.lineWidth = 2.5;
  const r = Math.round(Math.min(20, Math.max(8, 6 + state.zoom * 3)));
  for (const gp of gaps) {
    const [sx, sy] = worldToScreen(gp.x, gp.y);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
    const fontSize = Math.round(Math.min(20, Math.max(11, 8 + state.zoom * 4)));
    ctx.font = `bold ${fontSize}px Consolas`;
    ctx.fillText(gp.branch ? 'Větvení' : 'Mezera', sx + r + 4, sy - r);
  }
  ctx.restore();
}

// ── Zdvojené čáry / čáry mimo profil (široký průsvitný pruh + popisek) ──
// Zdvojená čára leží přesně na jiné, takže bez zvýraznění není vidět vůbec.
// Kreslí se bez ohledu na showContourGaps – zdvojení nikdy není záměr.
function _traceHighlightPath(obj) {
  const seg = (x1, y1, x2, y2) => {
    const [a, b] = worldToScreen(x1, y1), [c, d] = worldToScreen(x2, y2);
    ctx.moveTo(a, b); ctx.lineTo(c, d);
  };
  const arc = (cx, cy, r, sa, ea, ccw) => {
    const [sx, sy] = worldToScreen(cx, cy);
    ctx.moveTo(...worldToScreen(cx + r * Math.cos(sa), cy + r * Math.sin(sa)));
    ctx.arc(sx, sy, r * state.zoom, screenAngle(sa), screenAngle(ea), screenCCW(ccw));
  };
  switch (obj.type) {
    case 'line': seg(obj.x1, obj.y1, obj.x2, obj.y2); break;
    case 'arc': arc(obj.cx, obj.cy, obj.r, obj.startAngle, obj.endAngle, obj.ccw !== false); break;
    case 'circle': arc(obj.cx, obj.cy, obj.r, 0, Math.PI * 2, true); break;
    case 'rect': {
      const c = getRectCorners(obj);
      for (let i = 0; i < c.length; i++) seg(c[i].x, c[i].y, c[(i + 1) % c.length].x, c[(i + 1) % c.length].y);
      break;
    }
    case 'polyline': {
      const vs = obj.vertices || [], n = obj.closed ? vs.length : vs.length - 1;
      for (let i = 0; i < n; i++) {
        const v1 = vs[i], v2 = vs[(i + 1) % vs.length];
        const a = bulgeToArc(v1, v2, (obj.bulges || [])[i] || 0);
        if (a) arc(a.cx, a.cy, a.r, a.startAngle, a.endAngle, a.ccw);
        else seg(v1.x, v1.y, v2.x, v2.y);
      }
      break;
    }
    case 'point': {
      const [px, py] = worldToScreen(obj.x, obj.y);
      ctx.moveTo(px + 6, py); ctx.arc(px, py, 6, 0, Math.PI * 2);
      break;
    }
  }
}

function _highlightLabelPos(obj) {
  if (obj.type === 'arc') {
    const TAU = Math.PI * 2, ccw = obj.ccw !== false;
    let sweep = ((ccw ? obj.endAngle - obj.startAngle : obj.startAngle - obj.endAngle) % TAU + TAU) % TAU;
    if (sweep < 1e-9) sweep = TAU;
    const am = ccw ? obj.startAngle + sweep / 2 : obj.startAngle - sweep / 2;
    return { x: obj.cx + obj.r * Math.cos(am), y: obj.cy + obj.r * Math.sin(am) };
  }
  if (obj.type === 'line' || obj.type === 'rect') return { x: (obj.x1 + obj.x2) / 2, y: (obj.y1 + obj.y2) / 2 };
  if (obj.type === 'circle') return { x: obj.cx, y: obj.cy + obj.r };
  if (obj.type === 'point') return { x: obj.x, y: obj.y };
  const vs = obj.vertices || [];
  return vs.length ? vs[Math.floor(vs.length / 2)] : null;
}

export function drawContourHighlights() {
  const live = new Set(state.objects);
  const marks = [];
  // Obdélníky popisků zdvojených čar (screen px) – klik na popisek nabídne
  // smazání stejně jako klik na čáru (dialogs/contourCheck.js duplicateAt).
  state._dupLabelBoxes = [];
  for (const d of state.contourDuplicates || []) {
    if (live.has(d.obj)) marks.push({ obj: d.obj, color: COLORS.yellow, label: '2× přes sebe – klikni', dup: d });
  }
  for (const o of state.camLeftovers || []) {
    if (live.has(o)) marks.push({ obj: o, color: COLORS.snapEdge, label: 'mimo profil' });
  }
  if (marks.length === 0) return;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  const fontSize = Math.round(Math.min(20, Math.max(11, 8 + state.zoom * 4)));
  ctx.font = `bold ${fontSize}px Consolas`;
  for (const m of marks) {
    ctx.strokeStyle = m.color;
    ctx.fillStyle = m.color;
    // Široký průsvitný pruh (najde se i při malém zoomu) + plná čára v barvě
    // zvýraznění přes původní čáru (bez ní pruh přes modrou konturu zešedne).
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 14;
    ctx.beginPath();
    _traceHighlightPath(m.obj);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.stroke();
    const p = _highlightLabelPos(m.obj);
    if (p) {
      const [sx, sy] = worldToScreen(p.x, p.y);
      ctx.fillText(m.label, sx + 10, sy - 10);
      if (m.dup) {
        const w = ctx.measureText(m.label).width;
        state._dupLabelBoxes.push({ dup: m.dup, x0: sx + 6, y0: sy - 14 - fontSize, x1: sx + 14 + w, y1: sy - 4 });
      }
    }
  }
  ctx.restore();
}

// ── Indikátor vybraného bodu ──
export function drawSelectedPointIndicator() {
  if (!state.selectedPoint || state.selectedPoint.length === 0) return;
  for (const sp of state.selectedPoint) {
    // Zkontrolovat, jestli je to průsečík (ten má vlastní label)
    const isIntersection = state.intersections.some(
      pt => Math.hypot(pt.x - sp.x, pt.y - sp.y) < DIM_MATCH_TOL
    );
    if (isIntersection) continue;
    // Vykreslit kroužek + souřadnice
    const [sx, sy] = worldToScreen(sp.x, sp.y);
    ctx.strokeStyle = COLORS.selected;
    ctx.fillStyle = COLORS.selected;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fill();
    const intSize = Math.round(Math.min(24, Math.max(11, 8 + state.zoom * 4.5)));
    ctx.font = intSize + 'px Consolas';
    const ptLabel = fmtCoordLabel(sp.x, sp.y);
    ctx.fillText(ptLabel, sx + 10, sy - 10);
  }
}

/** Vrátí text počítadla vybraných objektů/segmentů/bodů, nebo '' když nic není vybráno. */
export function getSelectionCounterLabel() {
  const objCount = state.multiSelected.size > 0
    ? state.multiSelected.size
    : (state.selected !== null ? 1 : 0);
  const ptCount = state.selectedPoint ? state.selectedPoint.length : 0;
  let segCount = 0;
  for (const s of state.multiSelectedSegments.values()) segCount += s.size;

  if (objCount <= 0 && segCount <= 0 && ptCount <= 0) return '';

  const parts = [];
  if (objCount > 0) parts.push(`${objCount} obj`);
  if (segCount > 0) parts.push(`${segCount} seg`);
  if (ptCount > 0) parts.push(`${ptCount} bod${ptCount > 1 ? 'y' : ''}`);
  return parts.join(' + ');
}

// ── Počítadlo výběru (mobil: canvas overlay; desktop: viz #cursorCoords u kurzoru v events.js) ──
export function drawSelectionCounter() {
  const desktop = window.innerWidth > 900;
  let label = getSelectionCounterLabel();
  // Desktop: nahoře uprostřed poslední kliknutá souřadnice + počet vybraných (jako na mobilu)
  if (desktop) {
    const lc = state.lastClickPoint;
    const coords = lc && lc.x !== null ? fmtStatusCoords(lc.x, lc.y) : '';
    label = [coords, label].filter(Boolean).join('   |   ');
  }
  if (!label) return;
  const fontSize = 14;
  ctx.font = `bold ${fontSize}px Consolas`;
  const w = ctx.measureText(label).width + 16;
  const h = fontSize + 12;
  const x = (drawCanvas.width - w) / 2;
  // desktop: pod plovoucím toolbarem (jeho výška se mění s rozbalením Úprav/Více)
  const topbar = desktop ? document.getElementById('topbar') : null;
  const y = desktop ? (topbar ? topbar.getBoundingClientRect().bottom : 0) + 6 : 124; // mobil: pod #mobileCanvasCoords (X/Z/zoom text nad tím, viz style.css)
  ctx.fillStyle = 'rgba(30,30,46,0.85)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = COLORS.selected;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// ── Snap indikátor u kurzoru ──
export function drawSnapIndicator() {
  if (!state.mouse.snapped) return;
  const [sx, sy] = worldToScreen(state.mouse.x, state.mouse.y);
  const snapLabelSize = Math.round(Math.min(22, Math.max(14, 10 + state.zoom * 6)));

  if (state.mouse.snapType === 'point') {
    // Snap k bodu – žlutý čtvereček
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(sx - 6, sy - 6, 12, 12);
    ctx.stroke();
    ctx.font = `${Math.max(9, snapLabelSize - 4)}px Consolas`;
    ctx.fillStyle = COLORS.selected;
    ctx.fillText("SNAP", sx + 9, sy - 3);
  } else if (state.mouse.snapType === 'grid') {
    // Snap na mřížku – menší indikátor, jiná barva
    ctx.strokeStyle = COLORS.label;
    ctx.lineWidth = LINE_WIDTH;
    ctx.beginPath();
    ctx.rect(sx - 4, sy - 4, 8, 8);
    ctx.stroke();
    ctx.font = `${Math.max(9, snapLabelSize - 4)}px Consolas`;
    ctx.fillStyle = COLORS.label;
    ctx.fillText("GRID", sx + 7, sy - 3);
  } else if (state.mouse.snapType === 'edge') {
    // Snap k hraně objektu – kolečko + souřadnice nad ním
    ctx.strokeStyle = COLORS.snapEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.stroke();
    const coordLabel = fmtCoordLabel(state.mouse.x, state.mouse.y);
    const fontSize = Math.max(9, snapLabelSize - 4);
    ctx.font = `${fontSize}px Consolas`;
    ctx.fillStyle = COLORS.snapEdge;
    const tw = ctx.measureText(coordLabel).width;
    ctx.fillText(coordLabel, sx - tw / 2, sy - 40);
  }

  // Vodící čára od raw pozice k snap pozici
  if (state.mouse.rawX !== undefined) {
    const [rawSx, rawSy] = worldToScreen(state.mouse.rawX, state.mouse.rawY);
    const dist = Math.hypot(rawSx - sx, rawSy - sy);
    if (dist > 3) {
      ctx.strokeStyle = "rgba(137, 180, 250, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(rawSx, rawSy);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
