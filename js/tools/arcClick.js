import { state, showToast } from '../state.js';
import { addObject } from '../objects.js';
import { renderAll } from '../render.js';
import { setHint } from '../ui.js';
import { startDrawing, finishDrawing } from './helpers.js';
import { makeInputOverlay } from '../dialogFactory.js';

/**
 * @param {number} wx
 * @param {number} wy
 */
export function handleArcClick(wx, wy) {
  if (!state.drawing) {
    startDrawing(wx, wy, "Klepněte na počáteční bod oblouku");
  } else if (state.tempPoints.length === 1) {
    state.tempPoints.push({ x: wx, y: wy });
    setHint("Klepněte na koncový bod oblouku");
    renderAll();
  } else {
    const ctr = state.tempPoints[0],
      p1 = state.tempPoints[1];
    const r = Math.hypot(p1.x - ctr.x, p1.y - ctr.y);
    if (r < 1e-9) {
      showToast("Oblouk má nulový poloměr");
      finishDrawing();
      return;
    }
    const startAngle = Math.atan2(p1.y - ctr.y, p1.x - ctr.x);
    const endAngle = Math.atan2(wy - ctr.y, wx - ctr.x);

    // Show direction choice dialog
    showArcDirectionDialog(ctr, r, startAngle, endAngle);
  }
}

function showArcDirectionDialog(ctr, r, startAngle, endAngle) {
  const overlay = makeInputOverlay(`
    <div class="input-dialog" style="min-width:320px">
      <h3>↻ Směr oblouku</h3>
      <p style="font-size:12px;margin-bottom:12px;color:#aaa">Zvolte směr, kterým se oblouk vykreslí:</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px">
        <canvas id="arcPreviewCW" width="120" height="120" style="border:1px solid #444;border-radius:6px;cursor:pointer;background:#1a1a2e" title="Po směru hodinových ručiček"></canvas>
        <canvas id="arcPreviewCCW" width="120" height="120" style="border:1px solid #444;border-radius:6px;cursor:pointer;background:#1a1a2e" title="Proti směru hodinových ručiček"></canvas>
      </div>
      <div class="btn-row" style="gap:8px">
        <button class="btn-ok" id="arcDirCW" style="flex:1">↻ CW</button>
        <button class="btn-ok" id="arcDirCCW" style="flex:1">↺ CCW</button>
      </div>
      <div class="btn-row" style="margin-top:6px">
        <button class="btn-cancel" id="arcDirCancel">Zrušit</button>
      </div>
    </div>`);

  // Draw previews on canvases
  drawArcPreview(overlay.querySelector("#arcPreviewCW"), startAngle, endAngle, false);
  drawArcPreview(overlay.querySelector("#arcPreviewCCW"), startAngle, endAngle, true);

  function createArc(ccw) {
    addObject({
      type: "arc",
      cx: ctr.x,
      cy: ctr.y,
      r,
      startAngle,
      endAngle,
      ccw,
      name: `Oblouk ${state.nextId}`,
    });
    overlay.remove();
    finishDrawing();
  }

  overlay.querySelector("#arcDirCW").addEventListener("click", () => createArc(false));
  overlay.querySelector("#arcDirCCW").addEventListener("click", () => createArc(true));
  overlay.querySelector("#arcPreviewCW").addEventListener("click", () => createArc(false));
  overlay.querySelector("#arcPreviewCCW").addEventListener("click", () => createArc(true));
  overlay.querySelector("#arcDirCancel").addEventListener("click", () => {
    overlay.remove();
    finishDrawing();
  });
}

function drawArcPreview(canvas, startAngle, endAngle, ccw) {
  const ctx = canvas.getContext("2d");
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = 40;

  // Draw arc
  ctx.strokeStyle = ccw ? "#4fc3f7" : "#ff9800";
  ctx.lineWidth = 3;
  ctx.beginPath();
  // In screen coords (y-down), negate angles; math CCW → canvas anticlockwise=true
  ctx.arc(cx, cy, r, -startAngle, -endAngle, !!ccw);
  ctx.stroke();

  // Draw start point (green)
  const sx = cx + r * Math.cos(-startAngle);
  const sy = cy + r * Math.sin(-startAngle);
  ctx.fillStyle = "#4caf50";
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, Math.PI * 2);
  ctx.fill();

  // Draw end point (red)
  const ex = cx + r * Math.cos(-endAngle);
  const ey = cy + r * Math.sin(-endAngle);
  ctx.fillStyle = "#f44336";
  ctx.beginPath();
  ctx.arc(ex, ey, 5, 0, Math.PI * 2);
  ctx.fill();

  // Draw center dot
  ctx.fillStyle = "#888";
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  // Label
  ctx.fillStyle = "#ccc";
  ctx.font = "11px Consolas";
  ctx.textAlign = "center";
  ctx.fillText(ccw ? "CCW ↺" : "CW ↻", cx, canvas.height - 6);
}
