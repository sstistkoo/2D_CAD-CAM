// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Panel vlastností: obdélník                          ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js (16. 10. 2026, docs/plan-refaktoringu-ui.md, Fáze 4).
// Tělo větve switch(obj.type) z updateProperties doslova (jen o 4 mezery
// méně odsazené a bez závěrečného `break`); sdílené proměnné kostry
// (obj, tbody, H, V, pomocníci řádků) dostává parametrem.
// Kód aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { COLORS } from '../../constants.js';
import { state, pushUndo } from '../../state.js';
import { safeEvalMath, getRectCorners } from '../../utils.js';
import { _toggleSegmentSelection } from '../objectList.js';
import { _afterGeomEdit, updateProperties } from './index.js';

/** Řádky panelu vlastností obdélníku (case "rect") — tělo větve doslova. */
export function rectProps({ obj, tbody, H, V }) {
  function getRectAnchor() {
    const r = tbody.querySelector('input[name="propRectAnchor"]:checked');
    return r ? r.value : '1';
  }

  function makeRectInput(label, value, decimals, radioVal) {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    if (radioVal) {
      tdLabel.style.whiteSpace = "nowrap";
      const lbl = document.createElement("label");
      lbl.style.cssText = "display:inline-flex;align-items:center;gap:3px;cursor:pointer";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "propRectAnchor";
      radio.value = radioVal;
      radio.checked = radioVal === '1';
      radio.style.cssText = "accent-color:#4a9dff;margin:0";
      lbl.appendChild(radio);
      lbl.appendChild(document.createTextNode("\ud83d\udccc " + label));
      tdLabel.appendChild(lbl);
    } else {
      tdLabel.textContent = label;
    }
    const tdVal = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.className = "prop-input";
    input.value = parseFloat(value).toFixed(decimals !== undefined ? decimals : 3);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      e.stopPropagation();
    });
    input.addEventListener("focus", () => input.select());
    tdVal.appendChild(input);
    tr.appendChild(tdLabel);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
    return input;
  }

  // Compute actual corner positions (respecting rotation)
  const corners = getRectCorners(obj);

  // Show actual rotated corner positions in Z1/X1/Z2/X2
  const rX1 = makeRectInput(H + "1", corners[0].x, 3, '1');
  const rY1 = makeRectInput(V + "1", corners[0].y);
  const rX2 = makeRectInput(H + "2", corners[2].x, 3, '2');
  const rY2 = makeRectInput(V + "2", corners[2].y);
  const rW = makeRectInput("Šířka", Math.abs(obj.x2 - obj.x1));
  const rH = makeRectInput("Výška", Math.abs(obj.y2 - obj.y1));

  // Rotation pivot selector
  {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.innerHTML = `<div class="anchor-radio-row" style="margin-top:4px">
          <span>Otáčet kolem:</span>
          <label><input type="radio" name="propRotPivot" value="anchor" checked> \ud83d\udccc Fixní</label>
          <label><input type="radio" name="propRotPivot" value="center"> ⊕ Střed</label>
        </div>`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  const rAng = makeRectInput("Úhel (°)", ((obj.rotation || 0) * 180 / Math.PI), 2);

  // Sync: width/height → coordinates (resize from anchor)
  function syncRectFromWH() {
    const wVal = safeEvalMath(rW.value);
    const hVal = safeEvalMath(rH.value);
    if (!isFinite(wVal) || !isFinite(hVal)) return;
    // Save anchor position before change
    const oldCorners = getRectCorners(obj);
    const anchorIdx = getRectAnchor() === '1' ? 0 : 2;
    const anchor = oldCorners[anchorIdx];
    // Update base dimensions
    if (getRectAnchor() === '1') {
      const signW = obj.x2 >= obj.x1 ? 1 : -1;
      const signH = obj.y2 >= obj.y1 ? 1 : -1;
      obj.x2 = obj.x1 + signW * Math.abs(wVal);
      obj.y2 = obj.y1 + signH * Math.abs(hVal);
    } else {
      const signW = obj.x1 <= obj.x2 ? -1 : 1;
      const signH = obj.y1 <= obj.y2 ? -1 : 1;
      obj.x1 = obj.x2 + signW * Math.abs(wVal);
      obj.y1 = obj.y2 + signH * Math.abs(hVal);
    }
    // Restore anchor position (rotation shifts center)
    if (obj.rotation) {
      const newCorners = getRectCorners(obj);
      const newAnchor = newCorners[anchorIdx];
      obj.x1 += anchor.x - newAnchor.x; obj.y1 += anchor.y - newAnchor.y;
      obj.x2 += anchor.x - newAnchor.x; obj.y2 += anchor.y - newAnchor.y;
    }
  }

  // Wire coordinate inputs – editing moves the whole rect
  function wireCoordInput(input, cornerIdx, axis) {
    input.addEventListener("change", () => {
      const v = safeEvalMath(input.value);
      if (isNaN(v)) return;
      pushUndo();
      const curCorners = getRectCorners(obj);
      const delta = v - curCorners[cornerIdx][axis];
      if (axis === 'x') { obj.x1 += delta; obj.x2 += delta; }
      else { obj.y1 += delta; obj.y2 += delta; }
      _afterGeomEdit();
      updateProperties();
    });
  }
  wireCoordInput(rX1, 0, 'x');
  wireCoordInput(rY1, 0, 'y');
  wireCoordInput(rX2, 2, 'x');
  wireCoordInput(rY2, 2, 'y');

  // Wire width/height inputs
  rW.addEventListener("change", () => {
    if (isNaN(safeEvalMath(rW.value))) return;
    pushUndo();
    syncRectFromWH();
    _afterGeomEdit();
    updateProperties();
  });
  rH.addEventListener("change", () => {
    if (isNaN(safeEvalMath(rH.value))) return;
    pushUndo();
    syncRectFromWH();
    _afterGeomEdit();
    updateProperties();
  });

  // Wire angle (rotation) around selected pivot
  rAng.addEventListener("change", () => {
    const a = safeEvalMath(rAng.value);
    if (isNaN(a)) return;
    pushUndo();
    const newRot = a * Math.PI / 180;
    const pivotSel = tbody.querySelector('input[name="propRotPivot"]:checked');
    const pivotMode = pivotSel ? pivotSel.value : 'anchor';

    if (pivotMode === 'center') {
      obj.rotation = newRot;
    } else {
      // Rotate around fixed anchor point
      const cornersOld = getRectCorners(obj);
      const anchorIdx = getRectAnchor() === '1' ? 0 : 2;
      const pivot = cornersOld[anchorIdx];
      obj.rotation = newRot;
      const cornersNew = getRectCorners(obj);
      const newPivot = cornersNew[anchorIdx];
      obj.x1 += pivot.x - newPivot.x; obj.y1 += pivot.y - newPivot.y;
      obj.x2 += pivot.x - newPivot.x; obj.y2 += pivot.y - newPivot.y;
    }
    _afterGeomEdit();
    updateProperties();
  });

  // Show all 4 corners as selectable text
  {
    const rc = getRectCorners(obj);
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.style.cssText = "padding-top:6px;font-size:12px;user-select:text;cursor:text;color:" + COLORS.textMuted;
    td.innerHTML = rc.map((c, i) =>
      `Roh ${i + 1}: ${H}=${c.x.toFixed(3)} ${V}=${c.y.toFixed(3)}`
    ).join('<br>');
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  // Segment list with checkboxes (4 sides)
  {
    const rc = getRectCorners(obj);
    const rectIdx = state.selected;
    for (let i = 0; i < 4; i++) {
      const c1 = rc[i];
      const c2 = rc[(i + 1) % 4];
      const sideLen = Math.hypot(c2.x - c1.x, c2.y - c1.y);
      const objSegs = state.multiSelectedSegments.get(rectIdx);
      const isSegSel = objSegs ? objSegs.has(i) : false;

      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.title = "Checkbox pro výběr strany";
      const tdLabel = document.createElement("td");
      tdLabel.style.cssText = "display:flex;align-items:center;gap:4px";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isSegSel;
      cb.style.cssText = "accent-color:#89b4fa;margin:0;cursor:pointer";
      cb.title = "Přidat/odebrat stranu z výběru";
      cb.addEventListener("click", (e) => {
        e.stopPropagation();
        _toggleSegmentSelection(rectIdx, i);
      });
      tdLabel.appendChild(cb);
      const labelSpan = document.createElement("span");
      labelSpan.textContent = `S${i + 1}`;
      labelSpan.style.color = isSegSel ? COLORS.selected : COLORS.primary;
      tdLabel.appendChild(labelSpan);
      const tdVal = document.createElement("td");
      tdVal.textContent = `\u00fasečka, ${sideLen.toFixed(2)} mm`;
      tdVal.className = "prop-readonly";
      if (isSegSel) tdVal.style.color = COLORS.selected;
      tr.appendChild(tdLabel);
      tr.appendChild(tdVal);
      tr.addEventListener("mouseenter", () => { tr.style.background = COLORS.surfaceHover; });
      tr.addEventListener("mouseleave", () => { tr.style.background = ""; });
      tbody.appendChild(tr);
    }
  }
}
