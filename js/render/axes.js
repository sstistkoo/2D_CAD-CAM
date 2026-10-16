// SKICA – render: Mřížka a osy
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { ctx, drawCanvas, screenToWorld, worldToScreen } from '../canvas.js';
import { COLORS, GRID_BASE_STEP, GRID_MIN_PX, LINE_WIDTH } from '../constants.js';
import { displayX, state } from '../state.js';

// ── Osy ──
export function renderAxes() {
  const w = drawCanvas.width,
    h = drawCanvas.height;
  const g = ctx;

  // Adaptive step for axis labels
  const baseStep = GRID_BASE_STEP * state.zoom;
  let drawStep = baseStep,
    drawGridSize = GRID_BASE_STEP;
  while (drawStep < GRID_MIN_PX) {
    drawStep *= 2;
    drawGridSize *= 2;
  }

  // Osy – barvy podle typu stroje
  const isKarusel = state.machineType === 'karusel';
  const hColor = isKarusel ? COLORS.axisV : COLORS.axisH;
  const vColor = isKarusel ? COLORS.axisH : COLORS.axisV;
  const hLabel = isKarusel ? 'X' : 'Z';
  const vLabel = isKarusel ? 'Z' : 'X';

  g.lineWidth = LINE_WIDTH;
  g.strokeStyle = hColor + '55';
  g.beginPath();
  g.moveTo(0, state.panY);
  g.lineTo(w, state.panY);
  g.stroke();
  g.strokeStyle = vColor + '55';
  g.beginPath();
  g.moveTo(state.panX, 0);
  g.lineTo(state.panX, h);
  g.stroke();

  // Osa rotace soustruhu (Z, y=0) – čerchovaná čára (konvence osy souměrnosti)
  if (!isKarusel) {
    g.save();
    g.strokeStyle = hColor + 'aa';
    g.lineWidth = LINE_WIDTH;
    g.setLineDash([18, 4, 2, 4]);
    g.beginPath();
    g.moveTo(0, state.panY);
    g.lineTo(w, state.panY);
    g.stroke();
    g.restore();
  }

  // Mřížka – zobrazit pokud je zapnutý snap na mřížku
  if (state.snapToGrid) {
    const gs = state.gridSize * state.zoom;         // velikost buňky v px
    if (gs >= 4) {                                    // kreslit jen pokud má smysl
      g.strokeStyle = COLORS.textMuted + '18';
      g.lineWidth = 0.5;

      if (state.nullPointActive && state.nullPointAngle !== 0) {
        // ── Rotovaná mřížka ──
        const [npSx, npSy] = worldToScreen(state.incReference.x, state.incReference.y);
        const angleRad = state.nullPointAngle * Math.PI / 180;
        g.save();
        g.translate(npSx, npSy);
        g.rotate(-angleRad);
        // Maximální potřebný rozsah mřížky = diagonála canvasu
        const maxR = Math.hypot(w, h);
        const count = Math.ceil(maxR / gs);
        g.beginPath();
        for (let i = -count; i <= count; i++) {
          const pos = i * gs;
          g.moveTo(pos, -maxR);
          g.lineTo(pos, maxR);
          g.moveTo(-maxR, pos);
          g.lineTo(maxR, pos);
        }
        g.stroke();
        g.restore();
      } else if (state.nullPointActive) {
        // ── Mřížka zarovnaná k nulovému bodu (bez rotace) ──
        const [npSx, npSy] = worldToScreen(state.incReference.x, state.incReference.y);
        const gStartX = npSx % gs;
        const gStartY = npSy % gs;
        g.beginPath();
        for (let x = gStartX; x < w; x += gs) {
          g.moveTo(x, 0);
          g.lineTo(x, h);
        }
        for (let y = gStartY; y < h; y += gs) {
          g.moveTo(0, y);
          g.lineTo(w, y);
        }
        g.stroke();
      } else {
        // ── Standardní mřížka ──
        const gStartX = state.panX % gs;
        const gStartY = state.panY % gs;
        g.beginPath();
        for (let x = gStartX; x < w; x += gs) {
          g.moveTo(x, 0);
          g.lineTo(x, h);
        }
        for (let y = gStartY; y < h; y += gs) {
          g.moveTo(0, y);
          g.lineTo(w, y);
        }
        g.stroke();
      }
    }
  }

  // Popisky os – pod vodorovnou a vlevo od svislé osy (kreslí se hlavně
  // do pravého horního kvadrantu, takže tam popisky nezasahují do výkresu).
  const startX = state.panX % drawStep,
    startY = state.panY % drawStep;
  g.font = "13px Consolas";
  g.fillStyle = COLORS.textMuted;
  const labelPad = 6; // min mezera mezi popisky
  const hLabelY = state.panY + 16; // pod vodorovnou osou
  let lastLabelEndX = -Infinity;
  for (let x = startX; x < w; x += drawStep) {
    const [wx] = screenToWorld(x, 0);
    const label = Math.round(wx / drawGridSize) * drawGridSize;
    if (label === 0) continue;
    const dispLabel = isKarusel ? displayX(label) : label;
    const txt = dispLabel.toString();
    const tw = g.measureText(txt).width;
    const drawX = x + 2;
    if (drawX < lastLabelEndX + labelPad) continue; // přeskočit – překrývalo by se
    g.fillText(txt, drawX, hLabelY);
    lastLabelEndX = drawX + tw;
  }
  g.textAlign = 'right';
  const vLabelX = state.panX - 6; // vlevo od svislé osy
  let lastLabelEndY = -Infinity;
  for (let y = startY; y < h; y += drawStep) {
    const [, wy] = screenToWorld(0, y);
    const label = Math.round(wy / drawGridSize) * drawGridSize;
    if (label === 0) continue;
    const dispLabel = isKarusel ? label : displayX(label);
    const drawY = y - 3;
    if (drawY < lastLabelEndY + labelPad) continue; // přeskočit – překrývalo by se
    g.fillText(dispLabel.toString(), vLabelX, drawY);
    lastLabelEndY = drawY + 13; // přibližná výška fontu 13px
  }
  g.fillStyle = COLORS.selected;
  g.font = "14px Consolas";
  g.fillText("0", vLabelX, hLabelY);
  g.textAlign = 'left';

  // Origin marker – terčík na 0,0
  g.strokeStyle = COLORS.selected + '88';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(state.panX, state.panY, 6, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(state.panX - 10, state.panY);
  g.lineTo(state.panX + 10, state.panY);
  g.moveTo(state.panX, state.panY - 10);
  g.lineTo(state.panX, state.panY + 10);
  g.stroke();

  // Popisky os X a Z
  g.font = "bold 14px Consolas";
  g.fillStyle = hColor;
  g.fillText(hLabel, state.flipZ ? 8 : w - 18, state.panY - 8);
  g.fillStyle = vColor;
  g.fillText(vLabel, state.panX + 8, state.flipX ? h - 8 : 16);

  // ── Nulový bod – středový kříž v offsetové pozici ──
  if (state.nullPointActive) {
    const [npx, npy] = worldToScreen(state.incReference.x, state.incReference.y);
    const npColor = '#fab387'; // Oranžová – odlišná od hlavního kříže
    const angleRad = (state.nullPointAngle || 0) * Math.PI / 180;
    const hasAngle = state.nullPointAngle !== 0;

    // Čárkované osy přes celý canvas (rotované)
    g.strokeStyle = npColor + '44';
    g.lineWidth = 1;
    g.setLineDash([8, 6]);

    if (!hasAngle) {
      // Bez natočení – vodorovná a svislá čára
      g.beginPath();
      g.moveTo(0, npy);
      g.lineTo(w, npy);
      g.stroke();
      g.beginPath();
      g.moveTo(npx, 0);
      g.lineTo(npx, h);
      g.stroke();
    } else {
      // S natočením – rotované osy
      const maxLen = Math.hypot(w, h);
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      // Osa 1 (vodorovná rotovaná)
      g.beginPath();
      g.moveTo(npx - cosA * maxLen, npy + sinA * maxLen);
      g.lineTo(npx + cosA * maxLen, npy - sinA * maxLen);
      g.stroke();
      // Osa 2 (svislá rotovaná = +90°)
      g.beginPath();
      g.moveTo(npx - sinA * maxLen, npy - cosA * maxLen);
      g.lineTo(npx + sinA * maxLen, npy + cosA * maxLen);
      g.stroke();
    }
    g.setLineDash([]);

    // Terčík na nulový bod
    g.strokeStyle = npColor + 'cc';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(npx, npy, 8, 0, Math.PI * 2);
    g.stroke();

    // Malý kříž (rotovaný)
    g.beginPath();
    if (!hasAngle) {
      g.moveTo(npx - 13, npy);
      g.lineTo(npx + 13, npy);
      g.moveTo(npx, npy - 13);
      g.lineTo(npx, npy + 13);
    } else {
      const c13 = 13 * Math.cos(angleRad);
      const s13 = 13 * Math.sin(angleRad);
      g.moveTo(npx - c13, npy + s13);
      g.lineTo(npx + c13, npy - s13);
      g.moveTo(npx - s13, npy - c13);
      g.lineTo(npx + s13, npy + c13);
    }
    g.stroke();

    // Popisek "0'" + úhel
    g.font = "bold 12px Consolas";
    g.fillStyle = npColor;
    const angleLabel = hasAngle ? `0' ∠${state.nullPointAngle}°` : "0'";
    g.fillText(angleLabel, npx + 10, npy - 10);
  }
}

// ── Náhled zrcadlení kolem osy rotace (y=0) ──
