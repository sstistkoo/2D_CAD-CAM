// Kreslení plátna simulátoru — horní vrstva: úchopy polotovaru a body
// kontury, profilová dráha a náhled Auto/Krok, úseky podélného hrubování,
// mezní čáry (Z i X), výběr obdélníkem, vodicí čáry a indikátor SNAP,
// označený bod. Vyňato z draw() v camSimulator.js (Fáze 5); vrstvy
// skládá drawCanvas.js.
import { drawSectionPlan } from '../ops/sections/drawSections.js';
import { xBoundOn } from '../rangeX.js';

/** @param f snímek kreslení z drawCanvas(): { S, ctx, calc, prms, w, h, C, toScreen, _draggingStock, _hoverContourSeg, _draggedContourSeg, _draggingStockPt, _camAutoSegs, _camAutoRevealCount, getSectionLeftover } */
export function drawOverlayLayer(f) {
  const { S, ctx, calc, prms, w, h, C, toScreen } = f;
  const { _draggingStock, _hoverContourSeg, _draggedContourSeg, _draggingStockPt, _camAutoSegs, _camAutoRevealCount, getSectionLeftover } = f;

  // draw points
  if (!S.simRunning) {
    // Always show cylinder stock handles
    if (prms.stockMode === 'cylinder') {
      const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
      const sLen = parseFloat(prms.stockLength) || 0;
      const sFace = parseFloat(prms.stockFace) || 0;
      const handles = [toScreen(sRad, sFace), toScreen(sRad, -sLen)];
      const labels = ['⌀/Čelo', '⌀/Délka'];
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      handles.forEach((pt, i) => {
        const isHovered = (S._hoverIsStock && i === S.hoverPointId);
        const isDragged = (_draggingStock && i === S.draggedPointId);
        const radius = (isHovered || isDragged) ? 9 : 6;
        ctx.fillStyle = (isHovered || isDragged) ? '#f9e2af' : '#fab387';
        ctx.strokeStyle = '#1e1e2e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (!isDragged) {
          ctx.fillStyle = '#fab387';
          ctx.fillText(labels[i], pt.x + 12, pt.y - 10);
        }
      });
    }
    // Body kontury — VŽDY zobrazené s čísly (pro referenci při popisu bodu).
    // V contour edit módu jsou interaktivní; v stock módu jen reference (menší).
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const contourActive = S.editMode === 'contour';
    const pointPickActive = S.addPointMode || S.delPointMode;
    // Hover zvýraznění segmentu kontury/polotovaru (pod body, aby body byly navrchu)
    if (_hoverContourSeg && !S.simRunning) {
      const hs = _hoverContourSeg;
      const pts = hs.isStock ? calc.stockWorldPoints : calc.worldPoints;
      if (pts && pts[hs.idx1] && pts[hs.idx2]) {
        const a = toScreen(pts[hs.idx1].xReal, pts[hs.idx1].zReal);
        const b = toScreen(pts[hs.idx2].xReal, pts[hs.idx2].zReal);
        ctx.save();
        ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 4; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
      }
    }
    // Drag zvýraznění segmentu kontury/polotovaru (během tažení)
    if (_draggedContourSeg && !S.simRunning) {
      const ds = _draggedContourSeg;
      const pts = ds.isStock ? calc.stockWorldPoints : calc.worldPoints;
      if (pts && pts[ds.idx1] && pts[ds.idx2]) {
        const a = toScreen(pts[ds.idx1].xReal, pts[ds.idx1].zReal);
        const b = toScreen(pts[ds.idx2].xReal, pts[ds.idx2].zReal);
        ctx.save();
        ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 4; ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
      }
    }
    if (calc.worldPoints) {
      calc.worldPoints.forEach((p, i) => {
        if (!p) return;
        const pt = toScreen(p.xReal, p.zReal);
        const isHovered = (S.pointDragEnabled || contourActive || pointPickActive) && !S._hoverIsStock && i === S.hoverPointId;
        const isDragged = !_draggingStockPt && !_draggingStock && i === S.draggedPointId;
        const isSelected = contourActive && S.selectedPoints.has(i);
        // V profil módu: body původní kontury se nezobrazují (jen hover/drag/sel pro editaci)
        if (calc.profileViewActive && !isHovered && !isDragged && !isSelected) return;
        const radius = (isHovered || isDragged) ? 8 : (isSelected ? 6 : (contourActive ? 4 : 3));
        ctx.fillStyle = (isHovered || isDragged) ? '#f9e2af' : (isSelected ? '#f9e2af' : C.contour);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, radius + 3, 0, Math.PI * 2); ctx.stroke();
        }
        if (!isHovered && !isDragged && !calc.profileViewActive) {
          ctx.fillStyle = contourActive ? '#f9e2af' : C.contour;
          ctx.fillText(`${i + 1}`, pt.x + 8, pt.y - 8);
        }
      });
    }
    // Body polotovaru — VŽDY zobrazené s čísly (S1, S2...), jen pro
    // casting (ne pro cylinder — ten má své vlastní handle nahoře).
    // V stock edit módu jsou interaktivní; v contour módu jen reference.
    if (calc.stockWorldPoints && prms.stockMode !== 'cylinder') {
      const stockActive = S.editMode === 'stock';
      calc.stockWorldPoints.forEach((p, i) => {
        if (!p) return;
        const pt = toScreen(p.xReal, p.zReal);
        const isHovered = (S.pointDragEnabled || stockActive || pointPickActive) && S._hoverIsStock && i === S.hoverPointId;
        const isDragged = _draggingStockPt && i === S.draggedPointId;
        const isSelected = stockActive && S.selectedPoints.has(i);
        const radius = (isHovered || isDragged) ? 8 : (isSelected ? 6 : (stockActive ? 4 : 3));
        ctx.fillStyle = (isHovered || isDragged) ? '#f9e2af' : (isSelected ? '#f9e2af' : C.pass);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, radius + 3, 0, Math.PI * 2); ctx.stroke();
        }
        if (!isHovered && !isDragged) {
          ctx.fillStyle = stockActive ? '#f9e2af' : C.pass;
          ctx.fillText(`S${i + 1}`, pt.x + 8, pt.y - 8);
        }
      });
    }
  }

  // Profil mód: profilová dráha se kreslí MIMO if(!simRunning) blok
  // → viditelná i při spuštěné simulaci (jako overlay nad nástrojem).
  // Auto/Krok náhled (⊙ Auto, ◀ Ubrat, Přidat ▶) kreslí STEJNOU logikou, jen
  // ze segmentů _camAutoSegs (odkrytá část, revealCount) a jinou barvou,
  // ať je zřejmé, že jde o nepotvrzený náhled.
  const _autoPreviewActive = !!(_camAutoSegs && _camAutoRevealCount > 0);
  if (calc.profileViewActive || _autoPreviewActive) {
    const profSegs = _autoPreviewActive
      ? _camAutoSegs.slice(0, _camAutoRevealCount).filter(s => !s.isDegenerate)
      : (calc.machinableContour || calc.contourSegments || []).filter(s => !s.isDegenerate);
    if (profSegs.length > 0) {
      ctx.beginPath();
      let _fp = true;
      for (const s of profSegs) {
        if (s.type === 'line') {
          const a = toScreen(s.p1.x, s.p1.z), b = toScreen(s.p2.x, s.p2.z);
          // chainBreak (rychloposuv přes mezeru — viz _camBuildFinalTracePts)
          // se v NÁHLEDU trasování kreslí VIDITELNĚ (lineTo), na rozdíl od
          // drah G-kódu (offsetPath) o kousek výš — tady se ukazuje uživateli
          // rozpracovaná trasa, ne skutečná dráha nástroje, takže neviditelná
          // mezera jen matla ("kde mi zmizela čára").
          if (_fp) { ctx.moveTo(a.x, a.y); _fp = false; } else ctx.lineTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        } else if (s.type === 'arc') {
          const p1 = toScreen(s.cx + Math.sin(s.startAngle)*s.r, s.cz + Math.cos(s.startAngle)*s.r);
          if (_fp) { ctx.moveTo(p1.x, p1.y); _fp = false; } else ctx.lineTo(p1.x, p1.y);
          const steps = Math.max(6, Math.round(Math.abs(s.endAngle - s.startAngle) * s.r / 0.5));
          for (let j = 1; j <= steps; j++) {
            const a2 = s.startAngle + (s.endAngle - s.startAngle) * (j / steps);
            const pt2 = toScreen(s.cx + Math.sin(a2)*s.r, s.cz + Math.cos(a2)*s.r);
            ctx.lineTo(pt2.x, pt2.y);
          }
        }
      }
      ctx.strokeStyle = _autoPreviewActive ? C.trace : C.contour; ctx.lineWidth = 3; ctx.stroke();
      // Číslování jen krajních bodů (ne interpolace oblouku)
      const nPts = [];
      for (const s of profSegs) {
        const p1 = s.type === 'line' ? s.p1 : { x: s.cx + Math.sin(s.startAngle)*s.r, z: s.cz + Math.cos(s.startAngle)*s.r };
        const last = nPts[nPts.length - 1];
        if (!last || Math.hypot(p1.x - last.x, p1.z - last.z) > 0.1) nPts.push(p1);
      }
      const lSeg = profSegs[profSegs.length - 1];
      const lPt = lSeg.type === 'line' ? lSeg.p2 : { x: lSeg.cx + Math.sin(lSeg.endAngle)*lSeg.r, z: lSeg.cz + Math.cos(lSeg.endAngle)*lSeg.r };
      if (!nPts.length || Math.hypot(lPt.x - nPts[nPts.length-1].x, lPt.z - nPts[nPts.length-1].z) > 0.1) nPts.push(lPt);
      nPts.forEach((p, i) => {
        const pt = toScreen(p.x, p.z);
        ctx.fillStyle = _autoPreviewActive ? C.trace : C.contour;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(`${i + 1}`, pt.x + 7, pt.y - 7);
      });
    }
  }

  // Úseky podélného hrubování (pravidla 1 a 8) — čáry hranic a pořadí.
  if (S.showSections !== false) drawSectionPlan(ctx, calc.sectionPlan, toScreen, getSectionLeftover(calc));

  // Z-limity (čelisti, koník, rozsah obrábění)
  if (S.showZLimits && S.showZLimits !== 'off') {
    const drawZLine = (zVal, color, label, isRange) => {
      if (zVal === null || zVal === undefined || isNaN(zVal)) return;
      // Vodorovná (karusel) nebo svislá (soustruh) čára na pozici Z
      const isKarusel = prms.machineStructure === 'carousel';
      ctx.strokeStyle = color;
      ctx.lineWidth = (S.draggedLimit && S.zLimits[S.draggedLimit] === zVal) ? 2.5 : 1.8;
      ctx.setLineDash(isRange ? [10, 4] : [3, 5]);
      ctx.beginPath();
      if (isKarusel) {
        const py = toScreen(0, zVal).y;
        ctx.moveTo(0, py); ctx.lineTo(w, py);
      } else {
        const px = toScreen(0, zVal).x;
        ctx.moveTo(px, 0); ctx.lineTo(px, h);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // Popisek
      ctx.fillStyle = color;
      ctx.font = 'bold 11px sans-serif';
      if (isKarusel) {
        const py = toScreen(0, zVal).y;
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(`${label} Z=${zVal}`, 6, py - 3);
      } else {
        const px = toScreen(0, zVal).x;
        ctx.save();
        ctx.translate(px - 4, 8);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(`${label} Z=${zVal}`, 0, 0);
        ctx.restore();
      }
    };
    // Zobrazí jen čáry jejichž checkbox je zaškrtnutý v parametrech
    if (S.zLimits.chuckActive)  drawZLine(S.zLimits.chuck, '#f38ba8', '⛔ Čelisti', false);
    if (S.zLimits.tailActive)   drawZLine(S.zLimits.tail,  '#f38ba8', '⛔ Koník',   false);
    if (S.zLimits.rangeActive) {
      drawZLine(S.zLimits.rangeStart, '#f9e2af', '◀ Start rozsahu', true);
      drawZLine(S.zLimits.rangeEnd,   '#f9e2af', 'Konec rozsahu ▶', true);
    }
  }

  // X-rozsah obrábění (horizontální čáry pro poloměr)
  if (S.showZLimits && S.showZLimits !== 'off') {
    const drawXLine = (xVal, color, label) => {
      if (xVal === null || xVal === undefined || isNaN(xVal)) return;
      const isKarusel = prms.machineStructure === 'carousel';
      ctx.strokeStyle = color;
      ctx.lineWidth = (S.draggedLimit && S.xLimits[S.draggedLimit] === xVal) ? 2.5 : 1.8;
      ctx.setLineDash([10, 4]);
      ctx.beginPath();
      if (isKarusel) {
        const px = toScreen(xVal, 0).x;
        ctx.moveTo(px, 0); ctx.lineTo(px, h);
      } else {
        const py = toScreen(xVal, 0).y;
        ctx.moveTo(0, py); ctx.lineTo(w, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = 'bold 11px sans-serif';
      if (isKarusel) {
        const px = toScreen(xVal, 0).x;
        ctx.save();
        ctx.translate(px - 4, 8);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(`${label} X=${xVal}`, 0, 0);
        ctx.restore();
      } else {
        const py = toScreen(xVal, 0).y;
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(`${label} X=${xVal}`, w - 6, py - 3);
      }
    };
    if (xBoundOn(S.xLimits, 'min')) drawXLine(S.xLimits.rangeXMin, '#a6e3a1', '▼ X min');
    if (xBoundOn(S.xLimits, 'max')) drawXLine(S.xLimits.rangeXMax, '#a6e3a1', 'X max ▲');
  }

  // Selection rectangle
  if (S.rectSelecting && S.rectStart && S.rectEnd) {
    const rx = Math.min(S.rectStart.x, S.rectEnd.x);
    const ry = Math.min(S.rectStart.y, S.rectEnd.y);
    const rw = Math.abs(S.rectEnd.x - S.rectStart.x);
    const rh = Math.abs(S.rectEnd.y - S.rectStart.y);
    ctx.fillStyle = 'rgba(137,180,250,0.15)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#89b4fa'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
  }

  // Snap guide lines
  if (S.snapLines.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    S.snapLines.forEach(snap => {
      ctx.beginPath();
      if (snap.type === 'x') {
        const p1 = toScreen(snap.val, snap.from - 5);
        const p2 = toScreen(snap.val, snap.to + 5);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      } else {
        const p1 = toScreen(snap.from - 5, snap.val);
        const p2 = toScreen(snap.to + 5, snap.val);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  // Rect select mode indicator
  if (S.rectSelecting && !S.rectStart) {
    ctx.fillStyle = 'rgba(137,180,250,0.8)'; ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⬚ Tažením vyberte body', w / 2, 20);
  }

  // Úhlový snap – vodicí čára (vodorovně/kolmo) od ref bodu k bodu.
  if (S.snapEnabled && S._angleSnapLine && !S.simRunning) {
    const a = toScreen(S._angleSnapLine.from.x, S._angleSnapLine.from.z);
    const b = toScreen(S._angleSnapLine.to.x, S._angleSnapLine.to.z);
    ctx.strokeStyle = 'rgba(249,226,175,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  }

  // SNAP indikátor (navrch): čtvereček = bod, kolečko = hrana, + souřadnice.
  if (S.snapEnabled && S._snap && !S.simRunning) {
    const sp = toScreen(S._snap.x, S._snap.z);
    if (S._snap.type === 'point') {
      ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 2;
      ctx.strokeRect(sp.x - 6, sp.y - 6, 12, 12);
      ctx.font = '11px Consolas'; ctx.fillStyle = '#f9e2af';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('SNAP', sp.x + 9, sp.y - 3);
    } else {
      ctx.strokeStyle = '#94e2d5'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2); ctx.stroke();
    }
    const xDisp = prms.mode === 'DIAMON' ? S._snap.x * 2 : S._snap.x;
    const label = `X: ${xDisp.toFixed(3)}  Z: ${S._snap.z.toFixed(3)}`;
    ctx.font = '11px Consolas';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(30,30,46,0.9)';
    ctx.fillRect(sp.x - tw / 2 - 5, sp.y - 36, tw + 10, 17);
    ctx.fillStyle = '#cdd6f4';
    ctx.fillText(label, sp.x, sp.y - 24);
    ctx.textAlign = 'left';
  }

  // Označený bod/uzel pro dvoukrokové uchopení (mobil) – výrazný kroužek.
  if (S._camMarked && !S.simRunning) {
    const mp = toScreen(S._camMarked.x, S._camMarked.z);
    ctx.strokeStyle = '#f5c2e7'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mp.x, mp.y, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(mp.x, mp.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f5c2e7'; ctx.fill();
  }
}
