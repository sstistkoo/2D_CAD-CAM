// SKICA – render: Hlavní smyčka vykreslení objektů
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { boundsOverlap, getObjectBounds, getViewportBounds } from './bounds.js';
import { ctx, drawCanvas, screenAngle, screenCCW, worldToScreen } from '../canvas.js';
import { DIM_MATCH_TOL, isDimConnectedToPoints, resolveObjectColor } from './common.js';
import { COLORS, LINE_WIDTH, LINE_WIDTH_SELECTED, PREVIEW_DASH } from '../constants.js';
import { drawConstraintMarkers } from './constraints.js';
import { computeAngleDimPlacement, computeLinearDimPlacement } from '../dialogs/dimension.js';
import { projectPointToLine } from '../geometry.js';
import { drawDimArrow, drawDimension, drawIntersectionNumbers, drawObjectNumbers, drawTangentArcArrow, resolveDimLabelPos } from './labels.js';
import { objDash, objWidthMul } from '../lineStyles.js';
import { drawFills, renderMirrorPreview } from './mirrorFills.js';
import { drawContourGapMarkers, drawContourHighlights, drawSelectedPointIndicator, drawSelectionCounter, drawSnapIndicator } from './overlays.js';
import { drawArc, drawCenterMark, drawCircle, drawLine, drawPoint, drawPolyline, drawRect } from './primitives.js';
import { fmtCoordLabel, fmtNum, state } from '../state.js';
import { drawText } from './text.js';
import { bulgeToArc, deepClone } from '../utils.js';
import { resetDimLabelRects } from './view.js';
import { drawFaceReference, inFaceDisc } from '../faceView/faceReference.js';
import { drawFrontView } from '../faceView/faceFrontView.js';
import { drawShellHoles } from '../faceView/shellHoleView.js';
import { faceViewMode } from '../faceView/faceLayer.js';

// ── Vykreslení objektů ──
export function renderObjects() {
  const w = drawCanvas.width,
    h = drawCanvas.height;
  ctx.clearRect(0, 0, w, h);
  resetDimLabelRects(); // Reset kolizních obdélníků kót

  // Dynamická velikost písma podle zoomu
  const labelSize = Math.round(Math.min(22, Math.max(14, 10 + state.zoom * 6)));

  // Viewport culling – spočítat viditelnou oblast
  const vp = getViewportBounds();

  // Bokorys (faceView/): podklad polotovar / profil / sklíčidlo úplně dospod.
  drawFaceReference(ctx, worldToScreen);
  // Nárys dokreslený pod osu + díry čel skrytou čarou (jen podklad).
  drawFrontView(ctx, worldToScreen);
  // Díry v plášti: obrys skrytou čarou v nárysu, paprsky v bokorysu.
  drawShellHoles(ctx, worldToScreen);

  // Výplně (nástroj "Vybarvit") – kreslí se jako první vrstva, pod obrysy.
  drawFills(vp);

  state.objects.forEach((obj, idx) => {
    // Skrytá poznámka s CAM G-kódem (viz camSimulator.js handleSendToCanvas) — nikdy nevykreslovat
    if (obj.isCamPathNote) return;
    // Výplně se kreslí samostatně výše (drawFills), ne v hlavní smyčce
    if (obj.type === 'fill') return;
    // Skip objects on invisible layers
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) return;

    // Skrýt kótovací objekty podle režimu zobrazení kót
    if (state.showDimensions === 'none' && (obj.isDimension || obj.isCoordLabel)) return;
    if (state.showDimensions === 'intersections' && obj.isDimension) return;

    // Viewport culling – přeskočit objekty mimo viditelnou oblast
    // Konstrukční čáry (nekonečné) se nekullují; pomocné čáry s konci ano
    if (obj.type !== 'constr' || obj.finite) {
      const bounds = getObjectBounds(obj);
      if (bounds && !boundsOverlap(bounds, vp)) return;
    }

    const isSel = idx === state.selected || state.multiSelected.has(idx);
    // Zvýraznění kót navázaných na vybraný bod/průsečík
    const isConnectedDim = !isSel && obj.isDimension && state.selectedPoint != null
      && isDimConnectedToPoints(obj, state.selectedPoint);
    const isConstr = obj.type === "constr";
    const baseColor = resolveObjectColor(obj);
    // Pomocné čáry bez vlastní barvy kreslit šedě; s vlastní barvou (výběr
    // v dialogu Typ čáry) se respektuje zvolená barva.
    const drawColor = (isConstr && !obj.color) ? COLORS.construction : baseColor;
    ctx.strokeStyle = (isSel || isConnectedDim) ? COLORS.selected : drawColor;
    ctx.fillStyle = (isSel || isConnectedDim) ? COLORS.selected : drawColor;
    const baseWidth = (layer?.lineWidth ?? LINE_WIDTH) * objWidthMul(obj);
    ctx.lineWidth = (isSel || isConnectedDim) ? baseWidth + (LINE_WIDTH_SELECTED - LINE_WIDTH) : baseWidth;
    ctx.setLineDash(objDash(obj));

    switch (obj.type) {
      case "point":
        drawPoint(obj);
        break;
      case "line":
      case "constr":
        drawLine(obj);
        break;
      case "circle":
        drawCircle(obj);
        if (obj.showCenterMark) drawCenterMark(obj);
        break;
      case "arc":
        drawArc(obj);
        if (obj.showCenterMark) drawCenterMark(obj);
        break;
      case "rect":
        drawRect(obj, isSel, baseColor, idx);
        break;
      case "polyline":
        drawPolyline(obj, isSel, baseColor, idx);
        break;
      case "text":
        drawText(obj, isSel);
        break;
    }
    ctx.setLineDash([]);

    // Automatické popisy rozměrů (R/⌀ u oblouků a kružnic, šířka×výška
    // obdélníku, délka polyline) jsou KÓTY – patří jen do režimů „Vše" a
    // „Kóty". V režimu „Průsečíky" (a „Skryté") se stejně jako explicitní
    // kóty nezobrazují. Skrýt i když jsou zapnutá čísla objektů.
    if ((state.showDimensions === 'all' || state.showDimensions === 'dimensions')
      && !isConstr && !state.showObjectNumbers) drawDimension(obj);
  });

  // ── Náhled zrcadlení kontury kolem osy rotace (y=0) ──
  if (state.mirrorPreview) {
    renderMirrorPreview(vp);
  }

  // ── Čísla objektů na výkrese ──
  if (state.showObjectNumbers) {
    drawObjectNumbers();
  }

  // ── Čísla průsečíků na výkrese ──
  if (state.showIntersectionNumbers) {
    drawIntersectionNumbers();
  }

  // ── Vazební značky (constraints) ──
  drawConstraintMarkers();

  // Průsečíky (skrýt při číslování objektů a v režimu jen kót)
  if ((state.showDimensions === 'all' || state.showDimensions === 'intersections') && !state.showObjectNumbers) {
    // „Jen bokorys": profil je skrytý, jeho průsečíky s popisky souřadnic taky
    // (průsečíky se počítají ze všech objektů — export CNC je potřebuje).
    const faceSolo = faceViewMode() === 'solo';
    state.intersections.forEach((pt) => {
      if (faceSolo && !inFaceDisc(pt.x, pt.y)) return;
      const [sx, sy] = worldToScreen(pt.x, pt.y);
      const isSelPt = state.selectedPoint != null
        && state.selectedPoint.some(sp => Math.hypot(pt.x - sp.x, pt.y - sp.y) < DIM_MATCH_TOL);
      const ptColor = isSelPt ? COLORS.selected : COLORS.dimension;
      ctx.fillStyle = ptColor;
      ctx.strokeStyle = ptColor;
      ctx.lineWidth = isSelPt ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
      const intSize = Math.round(Math.min(24, Math.max(11, 8 + state.zoom * 4.5)));
      ctx.font = intSize + 'px Consolas';
      const ptLabel = fmtCoordLabel(pt.x, pt.y);
      const labelW = ctx.measureText(ptLabel).width;
      const resolved = resolveDimLabelPos(sx + 8, sy - 8, labelW, intSize);
      if (resolved.collided) {
        ctx.strokeStyle = ptColor;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 8, resolved.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ptColor;
      }
      ctx.fillText(ptLabel, sx + 8, resolved.y);
    });
  }

  // Zakotvené body (červené kolečka)
  if (state.anchors && state.anchors.length > 0) {
    for (const a of state.anchors) {
      const [ax, ay] = worldToScreen(a.x, a.y);
      ctx.strokeStyle = COLORS.delete;  // červená
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ax, ay, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.delete;
      ctx.fill();
    }
  }

  // ── Obdélníkový výběr ──
  if (state._rectSelecting && state._rectStart) {
    const [sx1, sy1] = worldToScreen(state._rectStart.x, state._rectStart.y);
    const [sx2, sy2] = worldToScreen(state.mouse.x, state.mouse.y);
    const rx = Math.min(sx1, sx2), ry = Math.min(sy1, sy2);
    const rw = Math.abs(sx2 - sx1), rh = Math.abs(sy2 - sy1);
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.7)';
    ctx.fillStyle = 'rgba(100, 180, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.stroke();
    ctx.fill();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Dočasné kreslení
  if (state.drawing && state.tempPoints.length > 0) {
    ctx.strokeStyle = COLORS.preview;
    ctx.fillStyle = COLORS.preview;
    ctx.lineWidth = 1;
    ctx.setLineDash(PREVIEW_DASH);
    const tp = state.tempPoints;
    const [mx, my] = [state.mouse.x, state.mouse.y];

    if (
      state.tool === "line" ||
      state.tool === "constr" ||
      state.tool === "measure"
    ) {
      const [sx1, sy1] = worldToScreen(tp[0].x, tp[0].y);
      const [sx2, sy2] = worldToScreen(mx, my);
      // Počáteční bod – zvýrazněný
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.preview;
      ctx.beginPath();
      ctx.arc(sx1, sy1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.preview;
      ctx.lineWidth = 1;
      ctx.setLineDash(PREVIEW_DASH);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      const d = Math.hypot(mx - tp[0].x, my - tp[0].y);
      const angle =
        (Math.atan2(my - tp[0].y, mx - tp[0].x) * 180) / Math.PI;
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillText(
        `${d.toFixed(3)} mm  ${angle.toFixed(1)}°`,
        (sx1 + sx2) / 2 + 8,
        (sy1 + sy2) / 2 - 8,
      );
    }
    // Kr.pole v bokorysu: roztečná kružnice od středu (tools/circularArrayClick.js).
    if (state.tool === "circle" || state.tool === "circularArray") {
      const [sx, sy] = worldToScreen(tp[0].x, tp[0].y);
      const rw = Math.hypot(mx - tp[0].x, my - tp[0].y);
      const r = rw * state.zoom;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillText(state.tool === "circle" ? `R ${rw.toFixed(3)}` : `Ø ${(2 * rw).toFixed(3)}`, sx + r + 6, sy);
    }
    if (state.tool === "rect") {
      const [sx1, sy1] = worldToScreen(tp[0].x, tp[0].y);
      const [sx2, sy2] = worldToScreen(mx, my);
      ctx.beginPath();
      ctx.rect(
        Math.min(sx1, sx2),
        Math.min(sy1, sy2),
        Math.abs(sx2 - sx1),
        Math.abs(sy2 - sy1),
      );
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillText(
        `${Math.abs(mx - tp[0].x).toFixed(1)} × ${Math.abs(my - tp[0].y).toFixed(1)}`,
        Math.max(sx1, sx2) + 6,
        Math.min(sy1, sy2) - 4,
      );
    }
    if (state.tool === "arc" && tp.length >= 2) {
      const cx = tp[0].x,
        cy = tp[0].y;
      const r = Math.hypot(tp[1].x - cx, tp[1].y - cy);
      const [scx, scy] = worldToScreen(cx, cy);
      const rr = r * state.zoom;
      const startAngle = screenAngle(Math.atan2(tp[1].y - cy, tp[1].x - cx));
      const endAngle = screenAngle(Math.atan2(my - cy, mx - cx));
      // Default direction: ccw=false → CW in math → anticlockwise=true in screen
      ctx.beginPath();
      ctx.arc(scx, scy, rr, startAngle, endAngle, screenCCW(true));
      ctx.stroke();
    }
    if (state.tool === "polyline" && tp.length >= 1) {
      // Draw already placed segments
      ctx.strokeStyle = COLORS.preview;
      ctx.lineWidth = LINE_WIDTH;
      ctx.setLineDash(PREVIEW_DASH);
      const tempBulges = state._polylineBulges || [];
      // Zvýrazněný startovací bod kontury
      const [sfx, sfy] = worldToScreen(tp[0].x, tp[0].y);
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.selected;
      ctx.beginPath();
      ctx.arc(sfx, sfy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash(PREVIEW_DASH);
      for (let i = 0; i < tp.length - 1; i++) {
        const p1 = tp[i], p2 = tp[i + 1];
        const b = tempBulges[i] || 0;
        const [sx1, sy1] = worldToScreen(p1.x, p1.y);
        const [sx2, sy2] = worldToScreen(p2.x, p2.y);
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
        // Vertex dots
        ctx.fillStyle = COLORS.preview;
        ctx.beginPath();
        ctx.arc(sx1, sy1, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Last placed vertex
      const lastPt = tp[tp.length - 1];
      const [slx, sly] = worldToScreen(lastPt.x, lastPt.y);
      ctx.fillStyle = COLORS.preview;
      ctx.beginPath();
      ctx.arc(slx, sly, 3, 0, Math.PI * 2);
      ctx.fill();
      // Preview line to cursor
      ctx.setLineDash(PREVIEW_DASH);
      ctx.strokeStyle = COLORS.preview;
      ctx.lineWidth = 1;
      const [smx, smy] = worldToScreen(mx, my);
      ctx.beginPath();
      ctx.moveTo(slx, sly);
      ctx.lineTo(smx, smy);
      ctx.stroke();
      // Koncový bod preview – zvýrazněný
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.preview;
      ctx.beginPath();
      ctx.arc(smx, smy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // Distance info
      const dd = Math.hypot(mx - lastPt.x, my - lastPt.y);
      const ang = (Math.atan2(my - lastPt.y, mx - lastPt.x) * 180) / Math.PI;
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillStyle = COLORS.preview;
      ctx.fillText(
        `${dd.toFixed(3)} mm  ${ang.toFixed(1)}°  [${tp.length} bodů]`,
        (slx + smx) / 2 + 8,
        (sly + smy) / 2 - 8,
      );
    }
    if (state.tool === "pencil" && tp.length >= 1) {
      // Náčrt tužkou: plná (nepřerušovaná) čára přes všechny dosud nasbírané body
      ctx.strokeStyle = COLORS.preview;
      ctx.lineWidth = LINE_WIDTH;
      ctx.setLineDash([]);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      const [sfx, sfy] = worldToScreen(tp[0].x, tp[0].y);
      ctx.moveTo(sfx, sfy);
      for (let i = 1; i < tp.length; i++) {
        const [sxi, syi] = worldToScreen(tp[i].x, tp[i].y);
        ctx.lineTo(sxi, syi);
      }
      const [smx, smy] = worldToScreen(mx, my);
      ctx.lineTo(smx, smy);
      ctx.stroke();
    }
    if (state.tool === "tangent" && tp.length === 1) {
      // Preview: bod tečny – zobrazit bod
      const [sx1, sy1] = worldToScreen(tp[0].x, tp[0].y);
      ctx.fillStyle = COLORS.snapPoint;
      ctx.beginPath();
      ctx.arc(sx1, sy1, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillText("Bod tečny", sx1 + 8, sy1 - 8);
    }
    // Preview: Rovnoběžka
    if (state.tool === "parallel" && state._parallelRefIdx != null) {
      const refSeg = state._parallelRefSeg;
      if (refSeg) {
        const dx = refSeg.seg.x2 - refSeg.seg.x1;
        const dy = refSeg.seg.y2 - refSeg.seg.y1;
        const px1 = mx - dx / 2, py1 = my - dy / 2;
        const px2 = mx + dx / 2, py2 = my + dy / 2;
        const [sx1, sy1] = worldToScreen(px1, py1);
        const [sx2, sy2] = worldToScreen(px2, py2);
        ctx.strokeStyle = COLORS.primary;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
        // Vzdálenost od referenční úsečky
        const foot = projectPointToLine(mx, my, refSeg.seg.x1, refSeg.seg.y1, refSeg.seg.x2, refSeg.seg.y2);
        const dist = Math.hypot(mx - foot.x, my - foot.y);
        ctx.setLineDash([]);
        ctx.font = `${labelSize}px Consolas`;
        ctx.fillStyle = COLORS.primary;
        ctx.fillText(`∥ d=${fmtNum(dist)}mm`, (sx1 + sx2) / 2 + 8, (sy1 + sy2) / 2 - 8);
      }
    }
    // Preview: Kóta (2 body)
    if (state.tool === "dimension" && tp.length === 1) {
      const [sx1, sy1] = worldToScreen(tp[0].x, tp[0].y);
      const [sx2, sy2] = worldToScreen(mx, my);
      const d = Math.hypot(mx - tp[0].x, my - tp[0].y);
      ctx.strokeStyle = COLORS.textSecondary;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      // Šipky
      drawDimArrow(sx1, sy1, sx2, sy2);
      drawDimArrow(sx2, sy2, sx1, sy1);
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillStyle = COLORS.textSecondary;
      const angle = Math.atan2(sy2 - sy1, sx2 - sx1);
      const nx = -Math.sin(angle) * 14, ny = Math.cos(angle) * 14;
      ctx.fillText(`${fmtNum(d)}mm`, (sx1 + sx2) / 2 + nx, (sy1 + sy2) / 2 + ny);
    }
    // Preview: Úhlová kóta – první úsečka vybrána, čeká se na druhou
    if (state.tool === "dimension" && state._dimFirstLine) {
      const fl = state._dimFirstLine;
      const [fsx1, fsy1] = worldToScreen(fl.x1, fl.y1);
      const [fsx2, fsy2] = worldToScreen(fl.x2, fl.y2);
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(fsx1, fsy1);
      ctx.lineTo(fsx2, fsy2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillStyle = COLORS.selected;
      ctx.fillText('∠?', (fsx1 + fsx2) / 2 + 8, (fsy1 + fsy2) / 2 - 8);
    }
    // Preview: Řetězcové kótování – zobrazit čárkovanou kótu od posledního bodu k myši
    if (state.tool === "chainDimension" && tp.length >= 1) {
      const last = tp[tp.length - 1];
      const [sx1, sy1] = worldToScreen(last.x, last.y);
      const [sx2, sy2] = worldToScreen(mx, my);
      const d = Math.hypot(mx - last.x, my - last.y);
      // Odsazená kóta (preview)
      const angle = Math.atan2(sy2 - sy1, sx2 - sx1);
      const dimOff = 20 * state.zoom;
      const nx = -Math.sin(angle) * dimOff, ny = Math.cos(angle) * dimOff;
      ctx.strokeStyle = COLORS.textSecondary;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      // Odsazená kótovací čára
      ctx.beginPath();
      ctx.moveTo(sx1 + nx, sy1 + ny);
      ctx.lineTo(sx2 + nx, sy2 + ny);
      ctx.stroke();
      // Odkazové čáry
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx1 + nx, sy1 + ny);
      ctx.moveTo(sx2, sy2);
      ctx.lineTo(sx2 + nx, sy2 + ny);
      ctx.stroke();
      ctx.setLineDash([]);
      // Šipky
      drawDimArrow(sx1 + nx, sy1 + ny, sx2 + nx, sy2 + ny);
      drawDimArrow(sx2 + nx, sy2 + ny, sx1 + nx, sy1 + ny);
      // Text
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillStyle = COLORS.textSecondary;
      const tmx = (sx1 + sx2) / 2 + nx, tmy = (sy1 + sy2) / 2 + ny;
      ctx.fillText(`${fmtNum(d)}mm`, tmx, tmy - 4);
      // Zelený bod na předchozích bodech řetězce
      ctx.fillStyle = COLORS.dimension || COLORS.textSecondary;
      for (const pt of tp) {
        const [px, py] = worldToScreen(pt.x, pt.y);
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Preview: Trasování profilu
    if (state.tool === "profileTrace" && tp.length >= 1) {
      const traceBulges = state._profileTraceBulges || [];
      // Spojnice mezi body (rovné nebo oblouky)
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      for (let i = 0; i < tp.length - 1; i++) {
        const b = traceBulges[i] || 0;
        const [sx1, sy1] = worldToScreen(tp[i].x, tp[i].y);
        const [sx2, sy2] = worldToScreen(tp[i + 1].x, tp[i + 1].y);
        if (b === 0) {
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();
        } else {
          // Oblouk
          const arc = bulgeToArc(tp[i], tp[i + 1], b);
          if (arc) {
            const [scx, scy] = worldToScreen(arc.cx, arc.cy);
            const sr = arc.r * state.zoom;
            ctx.strokeStyle = COLORS.selected;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(scx, scy, sr, screenAngle(arc.endAngle), screenAngle(arc.startAngle), screenCCW(b < 0));
            ctx.stroke();
            // Popisek R
            const midAngle = (-arc.startAngle + -arc.endAngle) / 2;
            const rx = scx + sr * Math.cos(midAngle);
            const ry = scy + sr * Math.sin(midAngle);
            ctx.setLineDash([]);
            ctx.font = `${labelSize}px Consolas`;
            ctx.fillStyle = COLORS.primary;
            ctx.fillText(`R${arc.r.toFixed(1)}`, rx + 6, ry - 6);
          }
        }
      }
      // Body s čísly
      for (let i = 0; i < tp.length; i++) {
        const [sx, sy] = worldToScreen(tp[i].x, tp[i].y);
        // Velký bod
        ctx.fillStyle = i === 0 ? COLORS.snapPoint : COLORS.selected;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        // Číslo bodu
        ctx.setLineDash([]);
        ctx.font = `bold ${labelSize}px Consolas`;
        ctx.fillStyle = COLORS.snapPoint;
        ctx.fillText(`${i + 1}`, sx + 8, sy - 8);
      }
      // Preview čára ke kurzoru
      const last = tp[tp.length - 1];
      const [slx, sly] = worldToScreen(last.x, last.y);
      const [smx, smy] = worldToScreen(mx, my);
      ctx.strokeStyle = COLORS.preview;
      ctx.lineWidth = 1;
      ctx.setLineDash(PREVIEW_DASH);
      ctx.beginPath();
      ctx.moveTo(slx, sly);
      ctx.lineTo(smx, smy);
      ctx.stroke();
      // Info text
      const dd = Math.hypot(mx - last.x, my - last.y);
      const ang = (Math.atan2(my - last.y, mx - last.x) * 180) / Math.PI;
      ctx.setLineDash([]);
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillStyle = COLORS.preview;
      ctx.fillText(
        `${dd.toFixed(3)} mm  ${ang.toFixed(1)}°  [${tp.length} bodů]`,
        (slx + smx) / 2 + 8,
        (sly + smy) / 2 - 8,
      );
    }
    ctx.setLineDash([]);
  }

  // Indikátor vybraného bodu (snapPoint nástroj)
  if (state._snapPointState) {
    const sp = state._snapPointState;
    const [spx, spy] = worldToScreen(sp.x, sp.y);
      ctx.strokeStyle = COLORS.snapPoint;
      ctx.lineWidth = LINE_WIDTH_SELECTED;
    ctx.beginPath();
    ctx.arc(spx, spy, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(spx, spy, 3, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.snapPoint;
    ctx.fill();
    // Vodící čára ke kurzoru
    const [mx, my] = worldToScreen(state.mouse.x, state.mouse.y);
    ctx.strokeStyle = "rgba(250, 179, 135, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(spx, spy);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Kóta: interaktivní umístění úhlové kóty (obě úsečky vybrány) ──
  if (state.tool === 'dimension' && state._dimAnglePlacing && state._dimFirstLine && state._dimSecondLine) {
    const l1 = state._dimFirstLine, l2 = state._dimSecondLine;
    ctx.save();
    // Zvýraznit obě úsečky
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    for (const l of [l1, l2]) {
      if (l._zAxis) continue;   // osa Z se nezvýrazňuje (už je vykreslená)
      const [a1, b1] = worldToScreen(l.x1, l.y1);
      const [a2, b2] = worldToScreen(l.x2, l.y2);
      ctx.beginPath(); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.stroke();
    }
    ctx.setLineDash([]);

    const p = computeAngleDimPlacement(l1, l2, state.mouse.x, state.mouse.y);
    if (p) {
      const [scx, scy] = worldToScreen(p.cx, p.cy);
      const [sx1, sy1] = worldToScreen(p.x1, p.y1);
      const [sx2, sy2] = worldToScreen(p.x2, p.y2);
      // Odkazové čáry od průsečíku k obloukovým bodům
      ctx.strokeStyle = COLORS.textSecondary;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(scx, scy); ctx.lineTo(sx1, sy1);
      ctx.moveTo(scx, scy); ctx.lineTo(sx2, sy2);
      ctx.stroke();
      // Oblouk kóty – vede přes osu p.midAng (zvolená strana, i reflexní)
      const sr = Math.hypot(sx1 - scx, sy1 - scy);
      const startA = screenAngle(Math.atan2(p.y1 - p.cy, p.x1 - p.cx));
      const endA = screenAngle(Math.atan2(p.y2 - p.cy, p.x2 - p.cx));
      const midScreen = screenAngle(p.midAng);
      const nrm = (a) => { a %= 2 * Math.PI; return a < 0 ? a + 2 * Math.PI : a; };
      const anticw = !(nrm(midScreen - startA) <= nrm(endA - startA));
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(scx, scy, sr, startA, endA, anticw);
      ctx.stroke();
      ctx.setLineDash([]);
      drawTangentArcArrow(scx, scy, sr, startA, midScreen);
      drawTangentArcArrow(scx, scy, sr, endA, midScreen);
      // Popisek úhlu uprostřed oblouku
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillStyle = COLORS.selected;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${(p.sweep * 180 / Math.PI).toFixed(1)}°`,
        scx + sr * Math.cos(midScreen), scy + sr * Math.sin(midScreen) - 4);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  // ── Kóta: interaktivní umístění lineární kóty (první úsečka vybrána) ──
  if (state.tool === 'dimension' && state._dimFirstLine && !state._dimAnglePlacing) {
    const fl = state._dimFirstLine;
    // Zvýraznit vybranou úsečku
    const [flsx1, flsy1] = worldToScreen(fl.x1, fl.y1);
    const [flsx2, flsy2] = worldToScreen(fl.x2, fl.y2);
    ctx.save();
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(flsx1, flsy1);
    ctx.lineTo(flsx2, flsy2);
    ctx.stroke();
    ctx.setLineDash([]);

    const p = computeLinearDimPlacement(fl, state.mouse.x, state.mouse.y);
    const [dsx1, dsy1] = worldToScreen(p.x1, p.y1);
    const [dsx2, dsy2] = worldToScreen(p.x2, p.y2);
    const [osx1, osy1] = worldToScreen(p.srcX1, p.srcY1);
    const [osx2, osy2] = worldToScreen(p.srcX2, p.srcY2);
    ctx.strokeStyle = COLORS.textSecondary;
    // Odkazové čáry od zdrojových bodů ke kótovací čáře
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(osx1, osy1); ctx.lineTo(dsx1, dsy1);
    ctx.moveTo(osx2, osy2); ctx.lineTo(dsx2, dsy2);
    ctx.stroke();
    // Kótovací čára
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(dsx1, dsy1); ctx.lineTo(dsx2, dsy2);
    ctx.stroke();
    ctx.setLineDash([]);
    drawDimArrow(dsx1, dsy1, dsx2, dsy2);
    drawDimArrow(dsx2, dsy2, dsx1, dsy1);
    // Popisek délky + režim
    const axisTag = p.mode === 'horizontal' ? ' Z' : p.mode === 'vertical' ? ' X' : '';
    ctx.font = `${labelSize}px Consolas`;
    ctx.fillStyle = COLORS.selected;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${fmtNum(p.len)}${axisTag}`,
      (dsx1 + dsx2) / 2, (dsy1 + dsy2) / 2 - 4);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ── Kóta: vytahování kóty souřadnic bodu (odkaz + souřadnice + úhel) ──
  if (state.tool === 'dimension' && state._dimCoordStart) {
    const A = state._dimCoordStart;
    const [asx, asy] = worldToScreen(A.x, A.y);
    const [msx, msy] = worldToScreen(state.mouse.x, state.mouse.y);
    // Kurzor je na snap bodu / bodu na hraně úsečky (≠ start) → změří se vzdálenost
    const onSnap = (state.mouse.snapType === 'point' || state.mouse.snapType === 'edge')
      && Math.hypot(state.mouse.x - A.x, state.mouse.y - A.y) > 1e-6;
    ctx.save();
    ctx.strokeStyle = COLORS.selected;
    ctx.fillStyle = COLORS.selected;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(asx, asy, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(asx, asy); ctx.lineTo(msx, msy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (onSnap) {
      // Cílový snap bod – zvýraznit kroužkem + vzdálenost (úsečka mezi body)
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(msx, msy, 6, 0, Math.PI * 2); ctx.stroke();
      const dist = Math.hypot(state.mouse.x - A.x, state.mouse.y - A.y);
      ctx.font = `bold ${labelSize}px Consolas`;
      ctx.fillText(`d=${fmtNum(dist)}`, msx, msy - labelSize - 8);
      ctx.fillStyle = COLORS.text;
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillText(fmtCoordLabel(state.mouse.x, state.mouse.y), msx, msy - 6);
    } else {
      ctx.beginPath(); ctx.arc(msx, msy, 3, 0, Math.PI * 2); ctx.fill();
      // Úhel odkazové čáry – nad souřadnicemi
      let ang = Math.atan2(state.mouse.y - A.y, state.mouse.x - A.x) * 180 / Math.PI;
      if (state.nullPointActive && state.nullPointAngle) ang -= state.nullPointAngle;
      ctx.font = `bold ${labelSize}px Consolas`;
      ctx.fillText(`${ang.toFixed(1)}°`, msx, msy - labelSize - 8);
      ctx.fillStyle = COLORS.text;
      ctx.font = `${labelSize}px Consolas`;
      ctx.fillText(fmtCoordLabel(A.x, A.y), msx, msy - 6);
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ── Kóta: vzdálenost mezi dvěma snap body (aligned / Z / X dle umístění) ──
  if (state.tool === 'dimension' && state._dimPointSeg) {
    const seg = state._dimPointSeg;
    const line = { x1: seg.a.x, y1: seg.a.y, x2: seg.b.x, y2: seg.b.y };
    const p = computeLinearDimPlacement(line, state.mouse.x, state.mouse.y);
    ctx.save();
    // Zvýraznit spojnici a body
    const [asx, asy] = worldToScreen(seg.a.x, seg.a.y);
    const [bsx, bsy] = worldToScreen(seg.b.x, seg.b.y);
    ctx.strokeStyle = COLORS.selected; ctx.fillStyle = COLORS.selected;
    ctx.setLineDash([6, 3]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(asx, asy); ctx.lineTo(bsx, bsy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(asx, asy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bsx, bsy, 3, 0, Math.PI * 2); ctx.fill();
    // Kótovací čára + odkazové čáry
    const [dsx1, dsy1] = worldToScreen(p.x1, p.y1);
    const [dsx2, dsy2] = worldToScreen(p.x2, p.y2);
    const [osx1, osy1] = worldToScreen(p.srcX1, p.srcY1);
    const [osx2, osy2] = worldToScreen(p.srcX2, p.srcY2);
    ctx.strokeStyle = COLORS.textSecondary;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(osx1, osy1); ctx.lineTo(dsx1, dsy1);
    ctx.moveTo(osx2, osy2); ctx.lineTo(dsx2, dsy2);
    ctx.stroke();
    ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(dsx1, dsy1); ctx.lineTo(dsx2, dsy2); ctx.stroke();
    ctx.setLineDash([]);
    drawDimArrow(dsx1, dsy1, dsx2, dsy2);
    drawDimArrow(dsx2, dsy2, dsx1, dsy1);
    const axisTag = p.mode === 'horizontal' ? ' Z' : p.mode === 'vertical' ? ' X' : '';
    ctx.font = `${labelSize}px Consolas`; ctx.fillStyle = COLORS.selected;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${fmtNum(p.len)}${axisTag}`,
      (dsx1 + dsx2) / 2, (dsy1 + dsy2) / 2 - 4);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ── Kóta: vytahování kóty R oblouku (odkaz od bodu na oblouku) ──
  if (state.tool === 'dimension' && state._dimArcRadius) {
    const ar = state._dimArcRadius;
    const ax = ar.arc.cx + ar.arc.r * Math.cos(ar.anchorAngle);
    const ay = ar.arc.cy + ar.arc.r * Math.sin(ar.anchorAngle);
    const [asx, asy] = worldToScreen(ax, ay);
    const [msx, msy] = worldToScreen(state.mouse.x, state.mouse.y);
    ctx.save();
    ctx.strokeStyle = COLORS.selected;
    ctx.fillStyle = COLORS.selected;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(asx, asy); ctx.lineTo(msx, msy); ctx.stroke();
    ctx.setLineDash([]);
    drawDimArrow(asx, asy, msx, msy);
    ctx.beginPath(); ctx.arc(asx, asy, 2, 0, Math.PI * 2); ctx.fill();
    const side = msx >= asx ? 1 : -1;
    ctx.font = `${labelSize}px Consolas`;
    ctx.textAlign = side >= 0 ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`R${fmtNum(ar.arc.r)}`, msx + side * 5, msy);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ── CopyPlace preview (ghost kopií) ──
  if (state.tool === 'copyPlace' && state._copyPlaceRef && state._copyPlaceObjects) {
    const dx = state.mouse.x - state._copyPlaceRef.x;
    const dy = state.mouse.y - state._copyPlaceRef.y;
    const [refSx, refSy] = worldToScreen(state._copyPlaceRef.x, state._copyPlaceRef.y);
    const [curSx, curSy] = worldToScreen(state.mouse.x, state.mouse.y);

    // Vodící čára od ref bodu ke kurzoru
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 179, 135, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(refSx, refSy);
    ctx.lineTo(curSx, curSy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ref bod – kolečko
    ctx.fillStyle = COLORS.preview;
    ctx.beginPath();
    ctx.arc(refSx, refSy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Ghost kopie objektů
    ctx.strokeStyle = COLORS.preview;
    ctx.fillStyle = COLORS.preview;
    ctx.lineWidth = 1;
    ctx.setLineDash(PREVIEW_DASH);
    ctx.globalAlpha = 0.5;
    for (const idx of state._copyPlaceObjects) {
      const orig = state.objects[idx];
      if (!orig) continue;
      const ghost = deepClone(orig);
      // Posunout ghost o vektor
      switch (ghost.type) {
        case 'point':
          ghost.x += dx; ghost.y += dy; break;
        case 'line': case 'constr':
          ghost.x1 += dx; ghost.y1 += dy;
          ghost.x2 += dx; ghost.y2 += dy; break;
        case 'circle': case 'arc':
          ghost.cx += dx; ghost.cy += dy; break;
        case 'rect':
          ghost.x1 += dx; ghost.y1 += dy;
          ghost.x2 += dx; ghost.y2 += dy; break;
        case 'polyline':
          for (const v of ghost.vertices) { v.x += dx; v.y += dy; }
          break;
        case 'text':
          ghost.x += dx; ghost.y += dy; break;
      }
      // Potlačit kótové popisky pro preview
      ghost.isDimension = false;
      ghost.isCoordLabel = false;
      switch (ghost.type) {
        case 'point': drawPoint(ghost); break;
        case 'line': case 'constr': drawLine(ghost); break;
        case 'circle': drawCircle(ghost); break;
        case 'arc': drawArc(ghost); break;
        case 'rect': drawRect(ghost, false, COLORS.preview); break;
        case 'polyline': drawPolyline(ghost, false, COLORS.preview); break;
        case 'text': drawText(ghost, false); break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Mezery v kontuře (kontrola uzavřenosti před generováním polotovaru/G-kódu)
  drawContourGapMarkers();
  // Zdvojené čáry (žlutě) a čáry mimo profil při přenosu do CAM (fialově)
  drawContourHighlights();

  // Snap indikátor
  drawSnapIndicator();

  // Indikátor vybraného bodu (pokud není průsečík)
  drawSelectedPointIndicator();

  // Počítadlo vybraných objektů
  drawSelectionCounter();
}
