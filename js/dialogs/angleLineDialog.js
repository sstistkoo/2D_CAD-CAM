// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog / nástroj „Úhel“                             ║
// ║  Úsečka pod zadaným polárním úhlem – buď zadané délky, nebo  ║
// ║  prodloužená do průsečíku s nejbližším prvkem. Kliknutím na  ║
// ║  kružnici/oblouk se vytvoří tečna pod daným úhlem na straně  ║
// ║  kliknutí.                                                    ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { makeInputOverlay } from '../dialogFactory.js';
import { state, showToast } from '../state.js';
import { addObject } from '../objects.js';
import { screenToWorld, snapPt, drawCanvas } from '../canvas.js';
import { safeEvalMath, bulgeToArc } from '../utils.js';
import { findObjectAt, findSegmentAt, intersectLineLine, intersectLineCircle, getPolylineSegmentAsLine } from '../geometry.js';

document.getElementById("btnAngleLine").addEventListener("click", showAngleLineDialog);

/**
 * Najde nejbližší průsečík paprsku (sx,sy) → směr (dx,dy) s ostatní geometrií.
 * @param {number} sx
 * @param {number} sy
 * @param {number} dx jednotkový směrový vektor
 * @param {number} dy jednotkový směrový vektor
 * @param {number|null} excludeIdx index objektu, který se nemá testovat (např. tečnovaná kružnice)
 * @returns {{x:number,y:number}|null}
 */
function findRayIntersection(sx, sy, dx, dy, excludeIdx) {
  const ray = { x1: sx, y1: sy, x2: sx + dx, y2: sy + dy, isConstr: true };
  let best = null, bestT = Infinity;

  const consider = (pt) => {
    const t = (pt.x - sx) * dx + (pt.y - sy) * dy;
    if (t > 1e-6 && t < bestT) { bestT = t; best = pt; }
  };

  state.objects.forEach((obj, idx) => {
    if (idx === excludeIdx) return;
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && (layer.locked || !layer.visible)) return;

    if (obj.type === 'line' || obj.type === 'constr') {
      for (const pt of intersectLineLine(ray, { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 })) consider(pt);
    } else if (obj.type === 'circle' || obj.type === 'arc') {
      for (const pt of intersectLineCircle(ray, obj)) consider(pt);
    } else if (obj.type === 'polyline') {
      const n = obj.vertices.length;
      const segCount = obj.closed ? n : n - 1;
      for (let i = 0; i < segCount; i++) {
        const bulge = (obj.bulges && obj.bulges[i]) || 0;
        if (bulge === 0) {
          const seg = getPolylineSegmentAsLine(obj, i);
          if (seg) for (const pt of intersectLineLine(ray, seg)) consider(pt);
        } else {
          const p1 = obj.vertices[i], p2 = obj.vertices[(i + 1) % n];
          const arc = bulgeToArc(p1, p2, bulge);
          if (arc) for (const pt of intersectLineCircle(ray, arc)) consider(pt);
        }
      }
    }
  });

  return best;
}

/** Otevře dialog pro úsečku pod zadaným úhlem. */
export function showAngleLineDialog() {
  const overlay = makeInputOverlay(`
    <div class="input-dialog" style="min-width:380px">
      <h3>📐 Úhel</h3>
      <p style="font-size:12px;color:${COLORS.textMuted};margin-bottom:10px">
        Zadejte polární úhel a způsob ukončení úsečky, pak klikněte na
        „Vybrat bod / kružnici“. Kliknutím na bod se úsečka vytvoří z tohoto
        bodu, kliknutím na kružnici/oblouk vznikne tečna pod daným úhlem na
        straně, na kterou kliknete.
      </p>
      <div class="input-row">
        <div><label>Úhel (°):</label><input type="text" id="angAngle" value="0"></div>
        <div><label>Ukončení:</label>
          <select id="angMode" style="width:100%">
            <option value="length" selected>Zadaná délka</option>
            <option value="intersect">Do průsečíku</option>
          </select>
        </div>
      </div>
      <div class="input-row" id="angLengthRow">
        <div><label>Délka:</label><input type="text" id="angLength" value="10"></div>
      </div>
      <div class="btn-row">
        <button class="btn-cancel" id="angClose">Zavřít</button>
        <button class="btn-ok" id="angPick">🎯 Vybrat bod / kružnici</button>
      </div>
    </div>`);

  const angAngle = overlay.querySelector("#angAngle");
  const angMode = overlay.querySelector("#angMode");
  const angLength = overlay.querySelector("#angLength");
  const angLengthRow = overlay.querySelector("#angLengthRow");

  const updateModeVisibility = () => {
    angLengthRow.style.display = angMode.value === 'length' ? '' : 'none';
  };
  angMode.addEventListener("change", updateModeVisibility);
  updateModeVisibility();

  let _pickCleanup = null;

  overlay.querySelector("#angPick").addEventListener("click", () => {
    const angDeg = safeEvalMath(angAngle.value);
    const mode = angMode.value;
    let length = 0;
    if (mode === 'length') {
      length = safeEvalMath(angLength.value);
      if (isNaN(length) || length <= 0) {
        showToast("Délka musí být > 0");
        return;
      }
    }
    if (isNaN(angDeg)) {
      showToast("Zkontrolujte úhel");
      return;
    }

    const angleOffset = (state.nullPointActive && state.nullPointAngle !== 0)
      ? (state.nullPointAngle * Math.PI / 180) : 0;
    const rad = (angDeg * Math.PI) / 180 + angleOffset;
    const dirX = Math.cos(rad), dirY = Math.sin(rad);

    overlay.style.display = "none";
    showToast("Klikněte na bod, nebo na kružnici/oblouk pro tečnu...");

    function cleanup() {
      drawCanvas.removeEventListener("click", onPick);
      drawCanvas.removeEventListener("touchend", onTouch);
      _pickCleanup = null;
    }

    function processPick(wx, wy) {
      if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);

      let startX = wx, startY = wy, excludeIdx = null;

      const idx = findObjectAt(wx, wy);
      let circ = null;
      if (idx !== null) {
        const obj = state.objects[idx];
        if (obj.type === 'circle' || obj.type === 'arc') {
          circ = { cx: obj.cx, cy: obj.cy, r: obj.r };
          excludeIdx = idx;
        } else if (obj.type === 'polyline') {
          const segIdx = findSegmentAt(obj, wx, wy);
          if (segIdx != null) {
            const bulge = (obj.bulges && obj.bulges[segIdx]) || 0;
            if (bulge !== 0) {
              const p1 = obj.vertices[segIdx];
              const p2 = obj.vertices[(segIdx + 1) % obj.vertices.length];
              const arc = bulgeToArc(p1, p2, bulge);
              if (arc) circ = { cx: arc.cx, cy: arc.cy, r: arc.r };
            }
          }
        }
      }

      if (circ) {
        // Normála ke směru úhlu – dva možné tečné body
        const nx = -dirY, ny = dirX;
        const t1 = { x: circ.cx + circ.r * nx, y: circ.cy + circ.r * ny };
        const t2 = { x: circ.cx - circ.r * nx, y: circ.cy - circ.r * ny };
        const d1 = Math.hypot(wx - t1.x, wy - t1.y);
        const d2 = Math.hypot(wx - t2.x, wy - t2.y);
        const t = d1 <= d2 ? t1 : t2;
        startX = t.x; startY = t.y;
      }

      let endX, endY;
      if (mode === 'length') {
        endX = startX + dirX * length;
        endY = startY + dirY * length;
      } else {
        const hit = findRayIntersection(startX, startY, dirX, dirY, excludeIdx);
        if (!hit) {
          showToast("Žádný průsečík ve směru úhlu nenalezen");
          overlay.style.display = "flex";
          drawCanvas.addEventListener("click", onPick);
          drawCanvas.addEventListener("touchend", onTouch);
          _pickCleanup = cleanup;
          return;
        }
        endX = hit.x; endY = hit.y;
      }

      addObject({
        type: 'line',
        x1: startX, y1: startY, x2: endX, y2: endY,
        name: `Úhel ${state.nextId}`,
      });
      cleanup();
      overlay.remove();
      showToast(`Úsečka pod úhlem ${angDeg}° vytvořena ✓`);
    }

    function onPick(e) {
      const rect = drawCanvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const [wx, wy] = screenToWorld(sx, sy);
      cleanup();
      processPick(wx, wy);
    }

    function onTouch(e) {
      if (e.changedTouches.length === 1) {
        const tch = e.changedTouches[0];
        const rect = drawCanvas.getBoundingClientRect();
        const sx = tch.clientX - rect.left;
        const sy = tch.clientY - rect.top;
        const [wx, wy] = screenToWorld(sx, sy);
        cleanup();
        e.preventDefault();
        processPick(wx, wy);
      }
    }

    drawCanvas.addEventListener("click", onPick);
    drawCanvas.addEventListener("touchend", onTouch);
    _pickCleanup = cleanup;
  });

  overlay.querySelector("#angClose").addEventListener("click", () => {
    if (_pickCleanup) _pickCleanup();
    overlay.remove();
  });

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT")
      overlay.querySelector("#angPick").click();
    if (e.key === "Escape") {
      if (_pickCleanup) _pickCleanup();
      overlay.remove();
    }
  });

  angAngle.focus();
  angAngle.select();
}
