// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Polární kreslení z bodu                ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { makeInputOverlay } from '../dialogFactory.js';
import { state, showToast, axisLabels } from '../state.js';
import { addObject } from '../objects.js';
import { screenToWorld, snapPt, drawCanvas } from '../canvas.js';
import { safeEvalMath, bulgeToArc } from '../utils.js';
import { findObjectAt, findSegmentAt, intersectLineLine, intersectLineCircle, getPolylineSegmentAsLine } from '../geometry.js';

// ── Polární kreslení z referenčního bodu ──
document
  .getElementById("btnPolar")
  .addEventListener("click", showPolarDrawingDialog);

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

/** Otevře dialog pro polární kreslení (délka + úhel) nebo úsečku pod úhlem. */
export function showPolarDrawingDialog() {
  let refX = 0,
    refZ = 0;
  // V INC režimu použít incReference jako výchozí referenční bod
  if (state.coordMode === 'inc') {
    refX = state.incReference.x;
    refZ = state.incReference.y;
  }
  if (state.selected !== null) {
    const sel = state.objects[state.selected];
    if (sel.type === "point") {
      refX = sel.x;
      refZ = sel.y;
    } else if (sel.type === "line" || sel.type === "constr") {
      refX = sel.x2;
      refZ = sel.y2;
    } else if (sel.type === "circle" || sel.type === "arc") {
      refX = sel.cx;
      refZ = sel.cy;
    }
  }

  const overlay = makeInputOverlay(`
    <div class="input-dialog" style="min-width:460px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h3 style="margin:0">📐 Polární / Úhel</h3>
        <button class="btn-cancel" id="polClose" style="padding:4px 8px;font-size:16px">✕</button>
      </div>
      <label>Referenční bod:</label>
      <div class="input-row">
        <div><label>${axisLabels()[0]}:</label><input type="text" id="polRefX" value="${refX}"></div>
        <div><label>${axisLabels()[1]}:</label><input type="text" id="polRefZ" value="${refZ}"></div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
        <button class="btn-ok" id="polMarkRef" style="font-size:16px;padding:4px 8px" title="Označit ref. bod">📍</button>
        <button class="btn-ok" id="polFromSelected" style="font-size:16px;padding:4px 8px;background:${COLORS.dimension};border-color:${COLORS.dimension}" title="Z vybraného objektu">📌</button>
        <button class="btn-ok" id="polPickFromMap" style="font-size:16px;padding:4px 8px;background:${COLORS.selected};border-color:${COLORS.selected};color:${COLORS.bgDark}" title="Kliknout z výkresu">🎯</button>
      </div>
      <hr style="border-color:${COLORS.surfaceHover};margin:8px 0">
      <label>Segment (polární souřadnice od ref. bodu):</label>
      <div class="input-row">
        <div><label>Délka:</label><input type="text" id="polLen" value="10"></div>
        <div><label>Úhel (°):</label><input type="text" id="polAng" value="0"></div>
      </div>
      <div class="input-row">
        <div><label>Typ:</label>
          <select id="polType" style="width:100%">
            <option value="line" selected>Úsečka</option>
            <option value="constr">Konstrukční čára</option>
            <option value="point">Bod (na konci)</option>
          </select>
        </div>
        <button class="btn-ok" id="polAdd" style="height:100%;margin-top:18px">➕ Přidat</button>
      </div>
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:10px">
        <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap">
          <input type="checkbox" id="polChain" checked> Řetězit (konec → nový ref.)
        </label>
      </div>
      <hr style="border-color:${COLORS.surfaceHover};margin:8px 0">
      <p style="font-size:11px;color:${COLORS.textMuted};margin:4px 0">Tečna napojení na kružnici/oblouk</p>
      <div class="input-row">
        <div><label>Ukončení:</label>
          <select id="angMode" style="width:100%">
            <option value="length" selected>Zadaná délka</option>
            <option value="intersect">Do průsečíku</option>
          </select>
        </div>
        <button class="btn-ok" id="angPick" title="Vybrat bod / kružnici" style="height:100%;margin-top:18px">🎯 Tečnost</button>
      </div>
      <div id="polHistory" style="max-height:120px;overflow-y:auto;font-size:11px;font-family:Consolas;color:${COLORS.label};margin:8px 0;padding:4px;background:${COLORS.bgDarker};border-radius:4px;display:none"></div>
    </div>`);

  const polRefX = overlay.querySelector("#polRefX");
  const polRefZ = overlay.querySelector("#polRefZ");
  const polLen = overlay.querySelector("#polLen");
  const polAng = overlay.querySelector("#polAng");
  const polType = overlay.querySelector("#polType");
  const polChain = overlay.querySelector("#polChain");
  const polHistory = overlay.querySelector("#polHistory");
  const angMode = overlay.querySelector("#angMode");
  let segCount = 0;

  overlay.querySelector("#polMarkRef").addEventListener("click", () => {
    const rx = safeEvalMath(polRefX.value);
    const rz = safeEvalMath(polRefZ.value);
    if (isNaN(rx) || isNaN(rz)) return;
    addObject({
      type: "point",
      x: rx,
      y: rz,
      name: `Ref ${state.nextId}`,
    });
    showToast(`Referenční bod ${axisLabels()[0]}${rx} ${axisLabels()[1]}${rz} vytvořen`);
  });

  overlay
    .querySelector("#polFromSelected")
    .addEventListener("click", () => {
      if (state.selected === null) {
        showToast("Žádný vybraný objekt");
        return;
      }
      const sel = state.objects[state.selected];
      if (sel.type === "point") {
        polRefX.value = sel.x;
        polRefZ.value = sel.y;
      } else if (sel.type === "line" || sel.type === "constr") {
        polRefX.value = sel.x2;
        polRefZ.value = sel.y2;
      } else if (sel.type === "circle" || sel.type === "arc") {
        polRefX.value = sel.cx;
        polRefZ.value = sel.cy;
      } else if (sel.type === "rect") {
        polRefX.value = sel.x1;
        polRefZ.value = sel.y1;
      }
      showToast("Ref. bod načten z vybraného objektu");
    });

  // Pick referenčního bodu kliknutím na výkres
  let _polPickCleanup = null;
  overlay.querySelector("#polPickFromMap").addEventListener("click", () => {
    overlay.style.display = "none";
    showToast("Klikněte na výkres pro výběr ref. bodu...");

    function cleanup() {
      drawCanvas.removeEventListener("click", onPick);
      drawCanvas.removeEventListener("touchend", onTouch);
      _polPickCleanup = null;
    }

    function onPick(e) {
      const rect = drawCanvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      let [wx, wy] = screenToWorld(sx, sy);
      if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
      cleanup();
      polRefX.value = parseFloat(wx.toFixed(3));
      polRefZ.value = parseFloat(wy.toFixed(3));
      overlay.style.display = "flex";
      showToast(`Ref. bod nastaven: ${axisLabels()[0]}${polRefX.value} ${axisLabels()[1]}${polRefZ.value}`);
    }

    function onTouch(e) {
      if (e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const rect = drawCanvas.getBoundingClientRect();
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        let [wx, wy] = screenToWorld(sx, sy);
        if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
        cleanup();
        polRefX.value = parseFloat(wx.toFixed(3));
        polRefZ.value = parseFloat(wy.toFixed(3));
        overlay.style.display = "flex";
        e.preventDefault();
        showToast(`Ref. bod nastaven: ${axisLabels()[0]}${polRefX.value} ${axisLabels()[1]}${polRefZ.value}`);
      }
    }

    drawCanvas.addEventListener("click", onPick);
    drawCanvas.addEventListener("touchend", onTouch);
    _polPickCleanup = cleanup;
  });

  overlay.querySelector("#polAdd").addEventListener("click", () => {
    const rx = safeEvalMath(polRefX.value);
    const rz = safeEvalMath(polRefZ.value);
    const len = safeEvalMath(polLen.value);
    const angDeg = safeEvalMath(polAng.value);
    if (
      isNaN(rx) ||
      isNaN(rz) ||
      isNaN(len) ||
      isNaN(angDeg) ||
      len <= 0
    ) {
      showToast("Zkontrolujte hodnoty (délka musí být > 0)");
      return;
    }

    // Úhel s offsetem od natočeného nulového bodu
    const angleOffset = (state.nullPointActive && state.nullPointAngle !== 0)
      ? (state.nullPointAngle * Math.PI / 180) : 0;
    const rad = (angDeg * Math.PI) / 180 + angleOffset;
    const endX = rx + len * Math.cos(rad);
    const endZ = rz + len * Math.sin(rad);
    const typ = polType.value;

    if (typ === "point") {
      addObject({
        type: "point",
        x: endX,
        y: endZ,
        name: `Bod ${state.nextId}`,
      });
    } else {
      addObject({
        type: typ === "constr" ? "constr" : "line",
        x1: rx,
        y1: rz,
        x2: endX,
        y2: endZ,
        name: `${typ === "constr" ? "Konstr" : "Úsečka"} ${state.nextId}`,
        dashed: typ === "constr",
      });
    }

    segCount++;
    polHistory.style.display = "";
    polHistory.innerHTML += `<div>#${segCount}: ${axisLabels()[0]}${rx.toFixed(2)} ${axisLabels()[1]}${rz.toFixed(2)} → d=${len} ∠${angDeg}° → ${axisLabels()[0]}${endX.toFixed(2)} ${axisLabels()[1]}${endZ.toFixed(2)}</div>`;
    polHistory.scrollTop = polHistory.scrollHeight;

    if (polChain.checked) {
      polRefX.value = endX.toFixed(3);
      polRefZ.value = endZ.toFixed(3);
    }

    polLen.focus();
    polLen.select();
    showToast(`Segment #${segCount} přidán`);
  });

  overlay
    .querySelector("#polClose")
    .addEventListener("click", () => { 
      if (_polPickCleanup) _polPickCleanup(); 
      if (_angPickCleanup) _angPickCleanup();
      overlay.remove(); 
    });

  // Funkcionalita pro režim Úhel
  let _angPickCleanup = null;

  overlay.querySelector("#angPick").addEventListener("click", () => {
    const angDeg = safeEvalMath(polAng.value);
    const mode = angMode.value;
    let length = 0;
    if (mode === 'length') {
      length = safeEvalMath(polLen.value);
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
      _angPickCleanup = null;
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
          _angPickCleanup = cleanup;
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
    _angPickCleanup = cleanup;
  });

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") {
      overlay.querySelector("#polAdd").click();
    }
    if (e.key === "Escape") {
      if (_polPickCleanup) _polPickCleanup();
      if (_angPickCleanup) _angPickCleanup();
      overlay.remove();
    }
  });

  polLen.focus();
}
