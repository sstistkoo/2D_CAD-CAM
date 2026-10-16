// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Panel vlastností: úsečka a konstrukční čára         ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js (16. 10. 2026, docs/plan-refaktoringu-ui.md, Fáze 4).
// Tělo větve switch(obj.type) z updateProperties doslova (jen o 4 mezery
// méně odsazené a bez závěrečného `break`); sdílené proměnné kostry
// (obj, tbody, H, V, pomocníci řádků) dostává parametrem.
// Kód aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { state, pushUndo } from '../../state.js';
import { safeEvalMath } from '../../utils.js';
import { renderAll } from '../../render.js';
import { isAnchored } from '../../tools/anchorClick.js';
import { _afterGeomEdit } from './index.js';

/** Řádky panelu vlastností úsečky / konstrukční čáry (case "line" + "constr") — tělo větve doslova. */
export function lineProps({ obj, tbody, H, V }) {
  function getPropAnchor() {
    const r = tbody.querySelector('input[name="propAnchor"]:checked');
    return r ? r.value : '1';
  }

  // Helper: vytvoří input element pro grid
  function makeGridInput(value, decimals) {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.className = "prop-input";
    input.value = parseFloat(value).toFixed(decimals !== undefined ? decimals : 3);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); e.stopPropagation(); });
    input.addEventListener("focus", () => input.select());
    return input;
  }

  // 3×2 grid: vlevo labely+inputy, vpravo labely+inputy
  const gridTr = document.createElement("tr");
  const gridTd = document.createElement("td");
  gridTd.colSpan = 2;
  const grid = document.createElement("div");
  grid.className = "prop-grid-3x2";

  // Row 1: 📌 Z1 [input]  X1 [input]  [⚓☑]
  const pt1anchored = isAnchored(obj.x1, obj.y1);
  const anchor1 = document.createElement("label");
  anchor1.className = "prop-grid-anchor" + (pt1anchored ? " anchored-point" : "");
  const radio1 = document.createElement("input");
  radio1.type = "radio"; radio1.name = "propAnchor"; radio1.value = "1"; radio1.checked = true;
  radio1.style.cssText = "accent-color:#4a9dff;margin:0";
  anchor1.appendChild(radio1);
  anchor1.appendChild(document.createTextNode(pt1anchored ? " ⚓" : " 📌"));
  grid.appendChild(anchor1);

  const lblH1 = document.createElement("span"); lblH1.className = "coord-label"; lblH1.textContent = H + "1";
  grid.appendChild(lblH1);
  const inpX1 = makeGridInput(obj.x1, 3); grid.appendChild(inpX1);
  const lblV1 = document.createElement("span"); lblV1.className = "coord-label"; lblV1.textContent = V + "1";
  grid.appendChild(lblV1);
  const inpY1 = makeGridInput(obj.y1, 3); grid.appendChild(inpY1);

  // Checkbox pro přidání bodu 1 do výběru + kotva indikátor
  const ptCtrl1 = document.createElement("span");
  ptCtrl1.className = "prop-point-ctrl";
  if (pt1anchored) {
    const badge1 = document.createElement("span");
    badge1.className = "anchor-badge";
    badge1.title = "Bod je zakotven";
    badge1.textContent = "⚓";
    ptCtrl1.appendChild(badge1);
  }
  const ptCb1 = document.createElement("input");
  ptCb1.type = "checkbox";
  ptCb1.title = "Přidat bod 1 do výběru";
  const SEL_PT_TOL = 1e-4;
  const _isPtSelected = (px, py) => state.selectedPoint && state.selectedPoint.some(p => Math.hypot(p.x - px, p.y - py) < SEL_PT_TOL);
  const _togglePt = (px, py, add) => {
    if (!state.selectedPoint) state.selectedPoint = [];
    if (add) {
      if (!_isPtSelected(px, py)) state.selectedPoint.push({ x: px, y: py });
    } else {
      const i = state.selectedPoint.findIndex(p => Math.hypot(p.x - px, p.y - py) < SEL_PT_TOL);
      if (i >= 0) state.selectedPoint.splice(i, 1);
      if (state.selectedPoint.length === 0) state.selectedPoint = null;
    }
  };
  ptCb1.checked = _isPtSelected(obj.x1, obj.y1);
  ptCb1.addEventListener("change", () => {
    _togglePt(obj.x1, obj.y1, ptCb1.checked);
    renderAll();
  });
  ptCtrl1.appendChild(ptCb1);
  grid.appendChild(ptCtrl1);

  // Row 2: 📌 Z2 [input]  X2 [input]  [⚓☑]
  const pt2anchored = isAnchored(obj.x2, obj.y2);
  const anchor2 = document.createElement("label");
  anchor2.className = "prop-grid-anchor" + (pt2anchored ? " anchored-point" : "");
  const radio2 = document.createElement("input");
  radio2.type = "radio"; radio2.name = "propAnchor"; radio2.value = "2";
  radio2.style.cssText = "accent-color:#4a9dff;margin:0";
  anchor2.appendChild(radio2);
  anchor2.appendChild(document.createTextNode(pt2anchored ? " ⚓" : " 📌"));
  grid.appendChild(anchor2);

  const lblH2 = document.createElement("span"); lblH2.className = "coord-label"; lblH2.textContent = H + "2";
  grid.appendChild(lblH2);
  const inpX2 = makeGridInput(obj.x2, 3); grid.appendChild(inpX2);
  const lblV2 = document.createElement("span"); lblV2.className = "coord-label"; lblV2.textContent = V + "2";
  grid.appendChild(lblV2);
  const inpY2 = makeGridInput(obj.y2, 3); grid.appendChild(inpY2);

  // Checkbox pro přidání bodu 2 do výběru + kotva indikátor
  const ptCtrl2 = document.createElement("span");
  ptCtrl2.className = "prop-point-ctrl";
  if (pt2anchored) {
    const badge2 = document.createElement("span");
    badge2.className = "anchor-badge";
    badge2.title = "Bod je zakotven";
    badge2.textContent = "⚓";
    ptCtrl2.appendChild(badge2);
  }
  const ptCb2 = document.createElement("input");
  ptCb2.type = "checkbox";
  ptCb2.title = "Přidat bod 2 do výběru";
  ptCb2.checked = _isPtSelected(obj.x2, obj.y2);
  ptCb2.addEventListener("change", () => {
    _togglePt(obj.x2, obj.y2, ptCb2.checked);
    renderAll();
  });
  ptCtrl2.appendChild(ptCb2);
  grid.appendChild(ptCtrl2);

  // Row 3: Délka [input]  Úhel° [input]
  const spacer = document.createElement("span"); grid.appendChild(spacer);
  const lblLen = document.createElement("span"); lblLen.className = "coord-label"; lblLen.textContent = "Délka";
  grid.appendChild(lblLen);
  const inpLen = makeGridInput(Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1), 3); grid.appendChild(inpLen);
  const lblAng = document.createElement("span"); lblAng.className = "coord-label"; lblAng.textContent = "Úhel°";
  grid.appendChild(lblAng);

  function computeAngle() {
    const offset = (state.nullPointActive && state.nullPointAngle !== 0) ? state.nullPointAngle : 0;
    if (getPropAnchor() === '1') {
      return (((Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1) * 180) / Math.PI - offset) + 360) % 360;
    } else {
      return (((Math.atan2(obj.y1 - obj.y2, obj.x1 - obj.x2) * 180) / Math.PI - offset) + 360) % 360;
    }
  }
  const inpAng = makeGridInput(computeAngle(), 2); grid.appendChild(inpAng);
  const spacer2 = document.createElement("span"); grid.appendChild(spacer2); // prázdná buňka v 6. sloupci

  gridTd.appendChild(grid);
  gridTr.appendChild(gridTd);
  tbody.appendChild(gridTr);

  // Sync: polar → coordinates
  function syncFromPolar() {
    const l = safeEvalMath(inpLen.value);
    const a = safeEvalMath(inpAng.value);
    if (!isFinite(l) || !isFinite(a)) return;
    const offset = (state.nullPointActive && state.nullPointAngle !== 0) ? state.nullPointAngle : 0;
    const rad = (a + offset) * Math.PI / 180;
    if (getPropAnchor() === '1') {
      obj.x2 = obj.x1 + l * Math.cos(rad);
      obj.y2 = obj.y1 + l * Math.sin(rad);
      inpX2.value = obj.x2.toFixed(3);
      inpY2.value = obj.y2.toFixed(3);
    } else {
      obj.x1 = obj.x2 + l * Math.cos(rad);
      obj.y1 = obj.y2 + l * Math.sin(rad);
      inpX1.value = obj.x1.toFixed(3);
      inpY1.value = obj.y1.toFixed(3);
    }
  }

  // Sync: coordinates → polar
  function syncPolarFromObj() {
    inpLen.value = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1).toFixed(3);
    inpAng.value = computeAngle().toFixed(2);
  }

  // Wire coordinate inputs
  inpX1.addEventListener("change", () => {
    const v = safeEvalMath(inpX1.value);
    if (isNaN(v)) return;
    pushUndo(); obj.x1 = v;
    syncPolarFromObj();
    _afterGeomEdit();
  });
  inpY1.addEventListener("change", () => {
    const v = safeEvalMath(inpY1.value);
    if (isNaN(v)) return;
    pushUndo(); obj.y1 = v;
    syncPolarFromObj();
    _afterGeomEdit();
  });
  inpX2.addEventListener("change", () => {
    const v = safeEvalMath(inpX2.value);
    if (isNaN(v)) return;
    pushUndo(); obj.x2 = v;
    syncPolarFromObj();
    _afterGeomEdit();
  });
  inpY2.addEventListener("change", () => {
    const v = safeEvalMath(inpY2.value);
    if (isNaN(v)) return;
    pushUndo(); obj.y2 = v;
    syncPolarFromObj();
    _afterGeomEdit();
  });

  // Wire polar inputs
  inpLen.addEventListener("change", () => {
    const v = safeEvalMath(inpLen.value);
    if (isNaN(v)) return;
    pushUndo();
    syncFromPolar();
    _afterGeomEdit();
  });
  inpAng.addEventListener("change", () => {
    const v = safeEvalMath(inpAng.value);
    if (isNaN(v)) return;
    pushUndo();
    syncFromPolar();
    _afterGeomEdit();
  });

  // When anchor changes, update angle display
  tbody.querySelectorAll('input[name="propAnchor"]').forEach(r => {
    r.addEventListener("change", () => {
      inpAng.value = computeAngle().toFixed(2);
    });
  });
}
