// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Mobile edit + sdílené helpery           ║
// ║  (showMobileEditDialog, showEditObjectDialog,              ║
// ║   applyMobileInputMode, wireExprInputs)                    ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { makeInputOverlay } from '../dialogFactory.js';
import { state, showToast, pushUndo, axisLabels } from '../state.js';
import { screenToWorld, snapPt, drawCanvas } from '../canvas.js';
import { renderAll } from '../render.js';
import { typeLabel, safeEvalMath } from '../utils.js';
import { updateObjectList, updateProperties } from '../ui.js';
import { calculateAllIntersections } from '../geometry.js';
import { updateAssociativeDimensions } from './dimension.js';
import { showTextDialog } from './textDialog.js';

// ── Helper: auto-select + vyhodnocení mat. výrazů při blur ──
/** @param {HTMLElement} container */
export function wireExprInputs(container) {
  container.querySelectorAll('input[type="text"]').forEach(inp => {
    inp.addEventListener("focus", () => inp.select());
    inp.addEventListener("blur", () => {
      const raw = inp.value.trim();
      if (raw === '' || /^-?\d+\.?\d*$/.test(raw)) return;
      const result = safeEvalMath(raw);
      if (isFinite(result)) inp.value = result;
    });
  });
}

// ── Helper: nastaví inputmode="decimal" na všechna numerická pole v elementu ──
/** @param {HTMLElement} container */
export function applyMobileInputMode(container) {
  container.querySelectorAll('input[type="text"]').forEach((inp) => {
    inp.setAttribute("inputmode", "decimal");
  });
}

// ── Mobile Edit Dialog ──
/** Otevře mobilní dialog pro editaci vybraného objektu. */
export function showMobileEditDialog() {
  if (state.objects.length === 0) {
    showToast("Žádné objekty k úpravě");
    return;
  }

  // Pokud je vybraný objekt, rovnou ho editovat
  if (state.selected !== null) {
    showEditObjectDialog(state.selected);
    return;
  }

  // Jinak nabídnout výběr
  let listHtml = state.objects.map((obj, idx) => {
    const icon = { point: "·", line: "╱", constr: "┄", circle: "○", arc: "◜", rect: "▭", polyline: "⛓" }[obj.type] || "?";
    return `<div class="edit-obj-item" data-idx="${idx}" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid ${COLORS.surface};display:flex;align-items:center;gap:8px;transition:background 0.15s">
      <span style="font-size:18px;width:24px;text-align:center">${icon}</span>
      <span style="flex:1;color:${COLORS.text}">${obj.name || typeLabel(obj.type)}</span>
      <span style="font-size:11px;color:${COLORS.textMuted}">${typeLabel(obj.type)}</span>
    </div>`;
  }).join("");

  const overlay = makeInputOverlay(`
    <div class="input-dialog" style="max-height:80vh;overflow-y:auto">
      <h3>✏️ Vyberte objekt k úpravě</h3>
      <div style="max-height:50vh;overflow-y:auto;border:1px solid ${COLORS.surface};border-radius:4px;margin-bottom:12px">
        ${listHtml}
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
      </div>
    </div>`);

  overlay.querySelectorAll(".edit-obj-item").forEach((item) => {
    item.addEventListener("click", () => {
      const idx = parseInt(item.dataset.idx);
      overlay.remove();
      state.selected = idx;
      updateObjectList();
      renderAll();
      showEditObjectDialog(idx);
    });
    item.addEventListener("mouseenter", () => item.style.background = COLORS.surface);
    item.addEventListener("mouseleave", () => item.style.background = "");
  });
}

export function showEditObjectDialog(idx) {
  const obj = state.objects[idx];
  if (!obj) { showToast("Objekt nenalezen"); return; }

  // Textový objekt → přesměrovat na plný textový dialog
  if (obj.type === 'text') {
    showTextDialog({
      text: obj.text || '',
      fontSize: obj.fontSize || 14,
      fontFamily: obj.fontFamily || 'Consolas, monospace',
      rotation: obj.rotation || 0,
      textAlign: obj.textAlign || 'left',
      bold: obj.bold || false,
      italic: obj.italic || false,
      letterSpacing: obj.letterSpacing || 0,
      pathMode: obj.pathMode || 'none',
      pathObjectId: obj.pathObjectId,
      pathOffset: obj.pathOffset != null ? obj.pathOffset : 2,
      editMode: true,
    }, (result) => {
      pushUndo();
      obj.text = result.text;
      obj.fontSize = result.fontSize;
      obj.fontFamily = result.fontFamily;
      obj.rotation = result.rotation;
      obj.textAlign = result.textAlign;
      obj.bold = result.bold;
      obj.italic = result.italic;
      obj.letterSpacing = result.letterSpacing;
      obj.pathMode = result.pathMode;
      obj.pathObjectId = result.pathObjectId;
      obj.pathOffset = result.pathOffset;
      obj.name = `Text "${result.text.substring(0, 20)}"`;
      updateObjectList();
      updateProperties();
      renderAll();
      showToast("Text upraven ✓");
    });
    return;
  }

  function buildFields() {
    const [H, V] = axisLabels();
    let fieldsHtml = "";
    const nameVal = obj.name || "";

    fieldsHtml += `<label>Název:</label>
      <input type="text" id="editName" value="${nameVal}" style="margin-bottom:8px">`;

    switch (obj.type) {
      case "point":
        fieldsHtml += `
          <div class="input-row"><div><label>${H}:</label><input type="text" id="editX" value="${obj.x.toFixed(3)}"></div>
          <div><label>${V}:</label><input type="text" id="editY" value="${obj.y.toFixed(3)}"></div>
          <div class="pick-col"><button type="button" class="pick-btn" data-pick="xy">🎯</button></div></div>`;
        break;
      case "line":
      case "constr":
        fieldsHtml += `
          <div class="anchor-radio-row">
            <span>📌 Fixní bod:</span>
            <label><input type="radio" name="editAnchor" value="1" checked> Bod 1</label>
            <label><input type="radio" name="editAnchor" value="2"> Bod 2</label>
          </div>
          <div class="input-row"><div><label>${H}1:</label><input type="text" id="editX1" value="${obj.x1.toFixed(3)}"></div>
          <div><label>${V}1:</label><input type="text" id="editY1" value="${obj.y1.toFixed(3)}"></div>
          <div class="pick-col"><button type="button" class="pick-btn" data-pick="p1">🎯1</button></div></div>
          <div class="input-row"><div><label>${H}2:</label><input type="text" id="editX2" value="${obj.x2.toFixed(3)}"></div>
          <div><label>${V}2:</label><input type="text" id="editY2" value="${obj.y2.toFixed(3)}"></div>
          <div class="pick-col"><button type="button" class="pick-btn" data-pick="p2">🎯2</button></div></div>
          <div class="input-row"><div><label>Délka:</label><input type="text" id="editLen" value="${Math.hypot(obj.x2-obj.x1, obj.y2-obj.y1).toFixed(3)}"></div>
          <div><label>Úhel (°):</label><input type="text" id="editAng" value="${(((Math.atan2(obj.y2-obj.y1, obj.x2-obj.x1)*180/Math.PI)+360)%360).toFixed(2)}"></div></div>`;
        break;
      case "circle":
        fieldsHtml += `
          <div class="input-row"><div><label>Střed ${H}:</label><input type="text" id="editCX" value="${obj.cx.toFixed(3)}"></div>
          <div><label>Střed ${V}:</label><input type="text" id="editCY" value="${obj.cy.toFixed(3)}"></div>
          <div class="pick-col"><button type="button" class="pick-btn" data-pick="center">🎯</button></div></div>
          <div class="input-row"><div><label>Poloměr:</label><input type="text" id="editR" value="${obj.r.toFixed(3)}"></div>
          <div><label>Průměr:</label><input type="text" id="editD" value="${(obj.r*2).toFixed(3)}"></div>
          <div class="pick-col"><button type="button" class="pick-btn" data-pick="radius">📏R</button></div></div>`;
        break;
      case "arc":
        fieldsHtml += `
          <div class="input-row"><div><label>Střed ${H}:</label><input type="text" id="editCX" value="${obj.cx.toFixed(3)}"></div>
          <div><label>Střed ${V}:</label><input type="text" id="editCY" value="${obj.cy.toFixed(3)}"></div>
          <div class="pick-col"><button type="button" class="pick-btn" data-pick="center">🎯</button></div></div>
          <div class="input-row"><div><label>Poloměr:</label><input type="text" id="editR" value="${obj.r.toFixed(3)}"></div>
          <div><label>Průměr:</label><input type="text" id="editD" value="${(obj.r*2).toFixed(3)}"></div>
          <div class="pick-col"><button type="button" class="pick-btn" data-pick="radius">📏R</button></div></div>
          <div class="input-row"><div><label>Start (°):</label><input type="text" id="editSA" value="${(obj.startAngle*180/Math.PI).toFixed(2)}"></div>
          <div><label>Konec (°):</label><input type="text" id="editEA" value="${(obj.endAngle*180/Math.PI).toFixed(2)}"></div></div>
          <div class="input-row"><div><label>Směr:</label><select id="editArcDir">
            <option value="cw" ${!obj.ccw ? 'selected' : ''}>↻ CW (po směru)</option>
            <option value="ccw" ${obj.ccw ? 'selected' : ''}>↺ CCW (proti směru)</option>
          </select></div></div>`;
        break;
      case "rect":
        fieldsHtml += `
          <div class="anchor-radio-row">
            <span>📌 Fixní roh:</span>
            <label><input type="radio" name="editAnchor" value="1" checked> Roh 1</label>
            <label><input type="radio" name="editAnchor" value="2"> Roh 2</label>
          </div>
          <div class="input-row"><div><label>${H}1:</label><input type="text" id="editX1" value="${obj.x1.toFixed(3)}"></div>
          <div><label>${V}1:</label><input type="text" id="editY1" value="${obj.y1.toFixed(3)}"></div>
          <div class="pick-col"><button type="button" class="pick-btn" data-pick="p1">🎯1</button></div></div>
          <div class="input-row"><div><label>${H}2:</label><input type="text" id="editX2" value="${obj.x2.toFixed(3)}"></div>
          <div><label>${V}2:</label><input type="text" id="editY2" value="${obj.y2.toFixed(3)}"></div>
          <div class="pick-col"><button type="button" class="pick-btn" data-pick="p2">🎯2</button></div></div>
          <div class="input-row"><div><label>Šířka:</label><input type="text" id="editW" value="${Math.abs(obj.x2-obj.x1).toFixed(3)}"></div>
          <div><label>Výška:</label><input type="text" id="editHt" value="${Math.abs(obj.y2-obj.y1).toFixed(3)}"></div></div>`;
        break;
      case "polyline": {
        const verts = obj.vertices || [];
        const bulges = obj.bulges || [];
        fieldsHtml += `<div style="margin-bottom:6px">
          <label><input type="checkbox" id="editClosed" ${obj.closed ? "checked" : ""}> Uzavřená kontura</label></div>`;
        fieldsHtml += `<div id="polyVertList" style="max-height:220px;overflow-y:auto">`;
        for (let i = 0; i < verts.length; i++) {
          const b = bulges[i] || 0;
          fieldsHtml += `<div class="input-row" style="margin-bottom:2px">
            <div><label>V${i+1} ${H}:</label><input type="text" class="polyVX" data-idx="${i}" value="${verts[i].x.toFixed(3)}"></div>
            <div><label>${V}:</label><input type="text" class="polyVY" data-idx="${i}" value="${verts[i].y.toFixed(3)}"></div>
            <div style="width:60px"><label>B:</label><input type="text" class="polyVB" data-idx="${i}" value="${b.toFixed(4)}" style="width:55px"></div>
          </div>`;
        }
        fieldsHtml += `</div>`;
        const arcCount = bulges.filter(b => b !== 0).length;
        fieldsHtml += `<div style="font-size:12px;color:${COLORS.textSecondary};margin-top:4px">Vrcholů: ${verts.length}, Segmentů: ${Math.max(0, verts.length - (obj.closed ? 0 : 1))}, Oblouků: ${arcCount}</div>`;
        break;
      }
    }
    return fieldsHtml;
  }

  const icon = { point: "·", line: "╱", constr: "┄", circle: "○", arc: "◜", rect: "▭", polyline: "⛓" }[obj.type] || "?";

  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>✏️ Upravit: ${icon} ${obj.name || typeLabel(obj.type)}</h3>
      <div id="editFields">${buildFields()}</div>
      <div class="btn-row">
        <button class="btn-cancel" id="editDelete" style="color:${COLORS.delete};border-color:${COLORS.delete}55">🗑 Smazat</button>
        <button class="btn-cancel" id="editCancel">Zrušit</button>
        <button class="btn-ok" id="editOk">Uložit</button>
      </div>
    </div>`);

  // Wire pick buttons
  function wirePickButtons() {
    overlay.querySelectorAll(".pick-btn").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        const pickType = btn.dataset.pick;
        overlay.style.display = "none";
        showToast("Klikněte na mapu pro výběr bodu...");

        function onPick(e) {
          const rect = drawCanvas.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          let [wx, wy] = screenToWorld(sx, sy);
          if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
          drawCanvas.removeEventListener("click", onPick);
          drawCanvas.removeEventListener("touchend", onTouch);
          overlay.style.display = "flex";
          fillPickedValue(pickType, wx, wy);
          showToast(`Bod: X${wx.toFixed(2)} Z${wy.toFixed(2)}`);
        }

        function onTouch(e) {
          if (e.changedTouches.length === 1) {
            const t = e.changedTouches[0];
            const rect = drawCanvas.getBoundingClientRect();
            const sx = t.clientX - rect.left;
            const sy = t.clientY - rect.top;
            let [wx, wy] = screenToWorld(sx, sy);
            if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
            drawCanvas.removeEventListener("click", onPick);
            drawCanvas.removeEventListener("touchend", onTouch);
            overlay.style.display = "flex";
            e.preventDefault();
            fillPickedValue(pickType, wx, wy);
            showToast(`Bod: X${wx.toFixed(2)} Z${wy.toFixed(2)}`);
          }
        }

        drawCanvas.addEventListener("click", onPick, { once: true });
        drawCanvas.addEventListener("touchend", onTouch, { once: true });
      });
    });
  }

  function fillPickedValue(pickType, wx, wy) {
    if (pickType === "xy") {
      const fx = overlay.querySelector("#editX");
      const fy = overlay.querySelector("#editY");
      if (fx) fx.value = wx.toFixed(3);
      if (fy) fy.value = wy.toFixed(3);
    } else if (pickType === "p1") {
      const fx = overlay.querySelector("#editX1");
      const fy = overlay.querySelector("#editY1");
      if (fx) fx.value = wx.toFixed(3);
      if (fy) fy.value = wy.toFixed(3);
    } else if (pickType === "p2") {
      const fx = overlay.querySelector("#editX2");
      const fy = overlay.querySelector("#editY2");
      if (fx) fx.value = wx.toFixed(3);
      if (fy) fy.value = wy.toFixed(3);
    } else if (pickType === "center") {
      const fx = overlay.querySelector("#editCX");
      const fy = overlay.querySelector("#editCY");
      if (fx) fx.value = wx.toFixed(3);
      if (fy) fy.value = wy.toFixed(3);
    } else if (pickType === "radius") {
      const cxV = safeEvalMath(overlay.querySelector("#editCX")?.value) || 0;
      const cyV = safeEvalMath(overlay.querySelector("#editCY")?.value) || 0;
      const r = Math.hypot(wx - cxV, wy - cyV);
      const ri = overlay.querySelector("#editR");
      const di = overlay.querySelector("#editD");
      if (ri) ri.value = r.toFixed(3);
      if (di) di.value = (r * 2).toFixed(3);
    }
    // Trigger sync listeners (length/angle, width/height, radius/diameter)
    overlay.querySelectorAll("input[type=text], input[type=number]").forEach(inp => {
      if (inp.value !== "") inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  wirePickButtons();

  // ── Sync logic for lines (length/angle ↔ endpoints) ──
  function getEditAnchor() {
    const r = overlay.querySelector('input[name="editAnchor"]:checked');
    return r ? r.value : '1';
  }

  const eX1 = overlay.querySelector("#editX1");
  const eY1 = overlay.querySelector("#editY1");
  const eX2 = overlay.querySelector("#editX2");
  const eY2 = overlay.querySelector("#editY2");
  const eLenInp = overlay.querySelector("#editLen");
  const eAngInp = overlay.querySelector("#editAng");
  const eWInp = overlay.querySelector("#editW");
  const eHtInp = overlay.querySelector("#editHt");

  if ((obj.type === 'line' || obj.type === 'constr') && eLenInp && eAngInp) {
    function syncLineFromPolar() {
      const l = safeEvalMath(eLenInp.value);
      const a = safeEvalMath(eAngInp.value);
      if (!isFinite(l) || !isFinite(a)) return;
      const rad = a * Math.PI / 180;
      if (getEditAnchor() === '1') {
        const x1 = safeEvalMath(eX1.value);
        const y1 = safeEvalMath(eY1.value);
        if (isFinite(x1) && isFinite(y1)) {
          eX2.value = (x1 + l * Math.cos(rad)).toFixed(3);
          eY2.value = (y1 + l * Math.sin(rad)).toFixed(3);
        }
      } else {
        const x2 = safeEvalMath(eX2.value);
        const y2 = safeEvalMath(eY2.value);
        if (isFinite(x2) && isFinite(y2)) {
          eX1.value = (x2 + l * Math.cos(rad)).toFixed(3);
          eY1.value = (y2 + l * Math.sin(rad)).toFixed(3);
        }
      }
    }
    function syncLineFromEndpoints() {
      const x1 = safeEvalMath(eX1.value);
      const y1 = safeEvalMath(eY1.value);
      const x2 = safeEvalMath(eX2.value);
      const y2 = safeEvalMath(eY2.value);
      if ([x1,y1,x2,y2].every(v => isFinite(v))) {
        eLenInp.value = Math.hypot(x2-x1, y2-y1).toFixed(3);
        if (getEditAnchor() === '1') {
          eAngInp.value = (((Math.atan2(y2-y1, x2-x1)*180/Math.PI)+360)%360).toFixed(2);
        } else {
          eAngInp.value = (((Math.atan2(y1-y2, x1-x2)*180/Math.PI)+360)%360).toFixed(2);
        }
      }
    }
    eX1.addEventListener('input', syncLineFromEndpoints);
    eY1.addEventListener('input', syncLineFromEndpoints);
    eX2.addEventListener('input', syncLineFromEndpoints);
    eY2.addEventListener('input', syncLineFromEndpoints);
    eLenInp.addEventListener('input', syncLineFromPolar);
    eAngInp.addEventListener('input', syncLineFromPolar);
    overlay.querySelectorAll('input[name="editAnchor"]').forEach(r => {
      r.addEventListener('change', syncLineFromEndpoints);
    });
  }

  // ── Sync logic for rects (width/height ↔ corners) ──
  if (obj.type === 'rect' && eWInp && eHtInp) {
    eWInp.addEventListener('input', () => {
      const wVal = safeEvalMath(eWInp.value);
      if (!isFinite(wVal)) return;
      if (getEditAnchor() === '1') {
        const x1 = safeEvalMath(eX1.value);
        if (isFinite(x1)) {
          const sign = (safeEvalMath(eX2.value) >= x1) ? 1 : -1;
          eX2.value = (x1 + sign * Math.abs(wVal)).toFixed(3);
        }
      } else {
        const x2 = safeEvalMath(eX2.value);
        if (isFinite(x2)) {
          const sign = (safeEvalMath(eX1.value) <= x2) ? -1 : 1;
          eX1.value = (x2 + sign * Math.abs(wVal)).toFixed(3);
        }
      }
    });
    eHtInp.addEventListener('input', () => {
      const hVal = safeEvalMath(eHtInp.value);
      if (!isFinite(hVal)) return;
      if (getEditAnchor() === '1') {
        const y1 = safeEvalMath(eY1.value);
        if (isFinite(y1)) {
          const sign = (safeEvalMath(eY2.value) >= y1) ? 1 : -1;
          eY2.value = (y1 + sign * Math.abs(hVal)).toFixed(3);
        }
      } else {
        const y2 = safeEvalMath(eY2.value);
        if (isFinite(y2)) {
          const sign = (safeEvalMath(eY1.value) <= y2) ? -1 : 1;
          eY1.value = (y2 + sign * Math.abs(hVal)).toFixed(3);
        }
      }
    });
    function syncRectWH() {
      const x1 = safeEvalMath(eX1.value);
      const y1 = safeEvalMath(eY1.value);
      const x2 = safeEvalMath(eX2.value);
      const y2 = safeEvalMath(eY2.value);
      if ([x1,y1,x2,y2].every(v => isFinite(v))) {
        eWInp.value = Math.abs(x2 - x1).toFixed(3);
        eHtInp.value = Math.abs(y2 - y1).toFixed(3);
      }
    }
    eX1.addEventListener('input', syncRectWH);
    eY1.addEventListener('input', syncRectWH);
    eX2.addEventListener('input', syncRectWH);
    eY2.addEventListener('input', syncRectWH);
  }

  // Sync radius/diameter
  const rInput = overlay.querySelector("#editR");
  const dInput = overlay.querySelector("#editD");
  if (rInput && dInput) {
    rInput.addEventListener("input", () => {
      const r = safeEvalMath(rInput.value);
      if (!isNaN(r) && r > 0) dInput.value = (r * 2).toFixed(3);
    });
    dInput.addEventListener("input", () => {
      const d = safeEvalMath(dInput.value);
      if (!isNaN(d) && d > 0) rInput.value = (d / 2).toFixed(3);
    });
  }

  // Save
  overlay.querySelector("#editOk").addEventListener("click", () => {
    pushUndo();
    obj.name = overlay.querySelector("#editName").value;
    switch (obj.type) {
      case "point":
        obj.x = safeEvalMath(overlay.querySelector("#editX").value);
        obj.y = safeEvalMath(overlay.querySelector("#editY").value);
        break;
      case "line":
      case "constr":
        obj.x1 = safeEvalMath(overlay.querySelector("#editX1").value);
        obj.y1 = safeEvalMath(overlay.querySelector("#editY1").value);
        obj.x2 = safeEvalMath(overlay.querySelector("#editX2").value);
        obj.y2 = safeEvalMath(overlay.querySelector("#editY2").value);
        break;
      case "circle":
        obj.cx = safeEvalMath(overlay.querySelector("#editCX").value);
        obj.cy = safeEvalMath(overlay.querySelector("#editCY").value);
        obj.r = safeEvalMath(overlay.querySelector("#editR").value);
        break;
      case "arc":
        obj.cx = safeEvalMath(overlay.querySelector("#editCX").value);
        obj.cy = safeEvalMath(overlay.querySelector("#editCY").value);
        obj.r = safeEvalMath(overlay.querySelector("#editR").value);
        obj.startAngle = safeEvalMath(overlay.querySelector("#editSA").value) * Math.PI / 180;
        obj.endAngle = safeEvalMath(overlay.querySelector("#editEA").value) * Math.PI / 180;
        obj.ccw = overlay.querySelector("#editArcDir")?.value === 'ccw';
        break;
      case "rect":
        obj.x1 = safeEvalMath(overlay.querySelector("#editX1").value);
        obj.y1 = safeEvalMath(overlay.querySelector("#editY1").value);
        obj.x2 = safeEvalMath(overlay.querySelector("#editX2").value);
        obj.y2 = safeEvalMath(overlay.querySelector("#editY2").value);
        break;
      case "polyline": {
        obj.closed = overlay.querySelector("#editClosed")?.checked || false;
        const vxInputs = overlay.querySelectorAll(".polyVX");
        const vyInputs = overlay.querySelectorAll(".polyVY");
        const vbInputs = overlay.querySelectorAll(".polyVB");
        for (let i = 0; i < vxInputs.length; i++) {
          obj.vertices[i] = {
            x: safeEvalMath(vxInputs[i].value) || 0,
            y: safeEvalMath(vyInputs[i].value) || 0
          };
          obj.bulges[i] = safeEvalMath(vbInputs[i].value) || 0;
        }
        break;
      }
    }
    updateAssociativeDimensions();
    updateObjectList();
    updateProperties();
    calculateAllIntersections();
    overlay.remove();
    showToast("Objekt upraven ✓");
  });

  // Delete
  overlay.querySelector("#editDelete").addEventListener("click", () => {
    pushUndo();
    state.objects.splice(idx, 1);
    if (state.selected === idx) state.selected = null;
    else if (state.selected > idx) state.selected--;
    updateObjectList();
    updateProperties();
    calculateAllIntersections();
    overlay.remove();
    showToast("Objekt smazán");
  });

  // Cancel
  overlay.querySelector("#editCancel").addEventListener("click", () => {
    overlay.remove();
  });

  // Keyboard
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") {
      overlay.querySelector("#editOk").click();
    }
    if (e.key === "Escape") overlay.remove();
  });
}
