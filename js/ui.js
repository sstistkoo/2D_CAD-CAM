// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – UI panely, toolbar, hinty                          ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS, applyThemeColors } from './constants.js';
import { state, showToast, pushUndo, undo, redo, axisLabels, toDisplayAngle } from './state.js';
import { typeLabel, bulgeToArc, safeEvalMath, getRectCorners, textPathIndex, textPathIdFromIndex } from './utils.js';
import { renderAll, renderAllDebounced } from './render.js';
import { bridge } from './bridge.js';
import { updateAssociativeDimensions } from './dialogs/dimension.js';
import { getMeta, setMeta } from './idb.js';
import { isAnchored } from './tools/anchorClick.js';
import { getCalcClipboardValue, setCalcClipboardValue, openCalculator, initCalcButtons } from './ui/calculator.js';
import { initLauncherButtons } from './ui/launchers.js';
import { openObjectColorPicker, openFillColorPicker } from './ui/colorPicker.js';
import { showGridSizeDialog, showAngleSnapDialog } from './ui/gridAngleDialogs.js';
import { updateNullPointUI, clearNullPoint, initNullPointButtons } from './ui/nullPoint.js';
import { initClearAllButton, showHistoryDialog } from './ui/drawingHistory.js';
import { showSettingsDialog } from './ui/settingsDialog.js';
import { updateIntersectionList, togglePanel } from './ui/intersectionList.js';
import { updateLayerList, initLayerButtons } from './ui/layerList.js';
import { deleteObjectsByIndices, updateObjectList, _toggleSegmentSelection } from './ui/objectList.js';
import { scrollCncToObject } from './ui/cncJump.js';
import { initToolbar, refreshToolbarActive, setTool, activateFilletChamfer, setHint, resetHint } from './ui/toolbar.js';
import {
  updateSnapPtsBtn, updateSnapGridBtn, toggleSnapGrid, updateAngleSnapBtn, toggleAngleSnap,
  updateDimsBtn, cycleDimsMode, updateCoordModeBtn, toggleCoordMode, updateXDisplayBtn,
  toggleXDisplay, updateMachineTypeBtn, toggleMachineType,
  initStatusButtons,
} from './ui/statusButtons.js';

// ── Bridge registrace (rozbíjí cyklickou závislost geometry ↔ ui) ──
bridge.updateProperties = () => updateProperties();
bridge.updateObjectList = () => updateObjectList();
bridge.updateIntersectionList = () => updateIntersectionList();
bridge.updateLayerList = () => updateLayerList();
bridge.renderAll = () => renderAll();
bridge.resetHint = () => resetHint();
// Přepnutí nástroje z modulů, které ui.js importovat nemůžou (cyklus
// ui.js → combinedModal.js → vkContour.js).
bridge.setTool = (tool) => setTool(tool);
bridge.applyTheme = () => applyTheme();

// ── Okamžité uložení nastavení do IDB ──
let _persistTimer = null;
export function persistSettings() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(async () => {
    try {
      const data = await getMeta('currentProjectData');
      const base = data || {};
      base.gridSize = state.gridSize;
      base.coordMode = state.coordMode;
      base.incReference = state.incReference;
      base.machineType = state.machineType;
      base.xDisplayMode = state.xDisplayMode;
      base.flipX = state.flipX;
      base.flipZ = state.flipZ;
      base.mirrorPreview = state.mirrorPreview;
      base.showContourGaps = state.showContourGaps;
      base.displayDecimals = state.displayDecimals;
      base.theme = state.theme;
      base.snapToGrid = state.snapToGrid;
      base.angleSnap = state.angleSnap;
      base.angleSnapStep = state.angleSnapStep;
      base.showDimensions = state.showDimensions;
      base.showObjectNumbers = state.showObjectNumbers;
      base.showIntersectionNumbers = state.showIntersectionNumbers;
      base.snapQuadrants = state.snapQuadrants;
      base.snapMidpoints = state.snapMidpoints;
      base.snapCenters = state.snapCenters;
      await setMeta('currentProjectData', base);
    } catch(e) { console.warn('persistSettings:', e); }
  }, 500);
}

// ── Scroll input do viditelné oblasti na mobilu (nad klávesnici) ──
document.getElementById("sidebar").addEventListener("focus", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") {
    setTimeout(() => {
      e.target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  }
}, true);

// ── Seznam objektů (mazání, seznam, výběr segmentu) → js/ui/objectList.js ──
export { deleteObjectsByIndices, updateObjectList };

// ── Skok v CNC kódu na řádek vybraného objektu → js/ui/cncJump.js ──

// ── Vlastnosti objektu ──
/** Aktualizuje panel vlastností vybraného objektu. */
/**
 * Po ruční úpravě geometrie v panelu Vlastnosti: asociativní kóty, průsečíky
 * (body přichycení) a CNC panel (obnovuje se z calculateAllIntersections,
 * která i překreslí). Dřív se jen překreslovalo – průsečíky zůstaly na
 * staré poloze a CNC kód ze staré geometrie.
 */
function _afterGeomEdit() {
  updateAssociativeDimensions();
  if (bridge.calculateAllIntersections) bridge.calculateAllIntersections();
  else renderAll();
}

export function updateProperties() {
  const tbody = document.querySelector("#propTable tbody");
  tbody.innerHTML = "";

  if (state.selected === null) {
    tbody.innerHTML =
      `<tr><td colspan="2" style="color:${COLORS.textMuted}">Není vybrán objekt</td></tr>`;
    return;
  }

  // Multi-selection info
  if (state.multiSelected.size > 1) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.style.color = COLORS.selected;
    td.style.fontWeight = "bold";
    td.style.padding = "4px 6px";
    td.textContent = `Vybráno ${state.multiSelected.size} objektů`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  const obj = state.objects[state.selected];

  if (state.multiSelected.size <= 1) {
    scrollCncToObject(obj);
  }

  // Helper: přidá řádek s editovatelným inputem
  function addEditRow(label, value, onChange, step) {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = label;
    const tdVal = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.className = "prop-input";
    input.value = parseFloat(value).toFixed(3);
    input.addEventListener("change", () => {
      const v = safeEvalMath(input.value);
      if (!isNaN(v)) {
        pushUndo();
        onChange(v);
        _afterGeomEdit();
        refreshComputedProps();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      e.stopPropagation();
    });
    input.addEventListener("focus", () => input.select());
    tdVal.appendChild(input);
    tr.appendChild(tdLabel);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  }

  // Helper: přidá read-only řádek
  function addInfoRow(label, value) {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = label;
    const tdValue = document.createElement("td");
    tdValue.className = "prop-readonly";
    tdValue.textContent = value;
    tr.appendChild(tdLabel);
    tr.appendChild(tdValue);
    tbody.appendChild(tr);
  }

  // Helper: přidá textový input (pro jméno)
  function addTextRow(label, value, onChange) {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = label;
    const tdVal = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "prop-name-input";
    input.value = value;
    input.addEventListener("change", () => {
      onChange(input.value);
      updateObjectList();
    });
    input.addEventListener("focus", () => input.select());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      e.stopPropagation();
    });
    tdVal.appendChild(input);
    tr.appendChild(tdLabel);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  }


  // Aktualizace computed polí bez rebuild
  function refreshComputedProps() {
    const computed = tbody.querySelectorAll(".prop-readonly");
    if (!computed.length) return;
    const compData = getComputedData(obj);
    computed.forEach((el, i) => {
      if (compData[i] !== undefined) el.textContent = compData[i];
    });
  }

  function getComputedData(o) {
    switch (o.type) {
      case "line":
      case "constr":
        return [
          Math.hypot(o.x2 - o.x1, o.y2 - o.y1).toFixed(3),
          toDisplayAngle((Math.atan2(o.y2 - o.y1, o.x2 - o.x1) * 180) / Math.PI).toFixed(2) + "°"
        ];
      case "circle":
        return [
          (o.r * 2).toFixed(3),
          (2 * Math.PI * o.r).toFixed(3)
        ];
      case "rect":
        return [];
      default:
        return [];
    }
  }

  // Pořadové číslo vybraného objektu (stejná logika jako updateObjectList)
  let _selSeq = 0;
  for (let i = 0; i <= state.selected; i++) {
    const o = state.objects[i];
    if (!o) break;
    if (!o.isDimension && !o.isCoordLabel) _selSeq++;
  }
  const _cleanName = (obj.name || '').replace(/\s+\d+\s*$/, '') || typeLabel(obj.type);

  // Typ (read-only)
  addInfoRow("Typ", typeLabel(obj.type));

  // Objekty aktuálního výběru (platí pro Profil i Barvu níže)
  const allObjs = state.multiSelected.size > 1
    ? [...state.multiSelected].map(i => state.objects[i])
    : [obj];

  // Kontura / Polotovar přepínač (platí pro celý výběr)
  {
    const stockCount = allObjs.filter(o => o.isStock).length;
    const currentVal = stockCount === allObjs.length ? 'stock'
      : stockCount === 0 ? 'kontura' : 'mixed';

    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = "Profil";
    const tdVal = document.createElement("td");
    const sel = document.createElement("select");
    sel.className = "prop-layer-select";
    if (currentVal === 'mixed') {
      const optMixed = document.createElement("option");
      optMixed.value = 'mixed';
      optMixed.textContent = "— smíšené —";
      sel.appendChild(optMixed);
    }
    const optK = document.createElement("option");
    optK.value = 'kontura';
    optK.textContent = "Kontura";
    optK.selected = currentVal === 'kontura';
    const optS = document.createElement("option");
    optS.value = 'stock';
    optS.textContent = "Polotovar";
    optS.selected = currentVal === 'stock';
    sel.appendChild(optK);
    sel.appendChild(optS);
    sel.addEventListener("change", () => {
      pushUndo();
      const toStock = sel.value === 'stock';
      allObjs.forEach(o => { o.isStock = toStock; });
      _afterGeomEdit();   // kontura/polotovar mění i CNC výstup
      updateObjectList();
      updateProperties();
    });
    tdVal.appendChild(sel);
    tr.appendChild(tdLabel);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  }

  // Název (editovatelný) — zobrazí čistý název + pořadové číslo
  addTextRow("Název", `${_cleanName} ${_selSeq}`, (v) => { obj.name = v; });

  // Barva (editovatelná, aplikuje se na celý výběr najednou)
  {
    const colors = new Set(allObjs.map(o => o.color || COLORS.primary));
    const mixed = colors.size > 1;
    const displayColor = mixed ? COLORS.textMuted : allObjs[0].color || COLORS.primary;

    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = "Barva";
    const tdVal = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "color-inline-row";
    const swatchBtn = document.createElement("button");
    swatchBtn.type = "button";
    swatchBtn.className = "layer-color-dot";
    swatchBtn.style.background = displayColor;
    swatchBtn.title = mixed ? "Barvy ve výběru se liší – klikněte pro sjednocení" : "Změnit barvu";
    swatchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openObjectColorPicker(allObjs, swatchBtn);
    });
    wrap.appendChild(swatchBtn);
    if (mixed) {
      const mixedLabel = document.createElement("span");
      mixedLabel.textContent = "— smíšené —";
      mixedLabel.className = "color-mixed-label";
      wrap.appendChild(mixedLabel);
    }
    tdVal.appendChild(wrap);
    tr.appendChild(tdLabel);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  }

  // Vrstva (select)
  {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = "Vrstva";
    const tdVal = document.createElement("td");
    const sel = document.createElement("select");
    sel.className = "prop-input";
    state.layers.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.name;
      if (l.id === obj.layer) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => {
      pushUndo();
      obj.layer = parseInt(sel.value, 10);
      renderAll();
    });
    sel.addEventListener("keydown", (e) => e.stopPropagation());
    tdVal.appendChild(sel);
    tr.appendChild(tdLabel);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  }

  const [H, V] = axisLabels();

  switch (obj.type) {
    case "point":
      addEditRow(H, obj.x, (v) => { obj.x = v; });
      addEditRow(V, obj.y, (v) => { obj.y = v; });
      break;
    case "line":
    case "constr": {
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

      break;
    }
    case "circle": {
      // Grid: Střed Z+X vedle sebe, Poloměr+Průměr vedle sebe
      const cGridTr = document.createElement("tr");
      const cGridTd = document.createElement("td"); cGridTd.colSpan = 2;
      const cGrid = document.createElement("div"); cGrid.className = "prop-grid-2x2";

      const cLblH = document.createElement("span"); cLblH.className = "coord-label"; cLblH.textContent = "S." + H;
      cGrid.appendChild(cLblH);
      const cInpH = document.createElement("input"); cInpH.type = "text"; cInpH.inputMode = "decimal"; cInpH.className = "prop-input";
      cInpH.value = obj.cx.toFixed(3);
      cInpH.addEventListener("keydown", (e) => { if (e.key === "Enter") cInpH.blur(); e.stopPropagation(); });
      cInpH.addEventListener("focus", () => cInpH.select());
      cInpH.addEventListener("change", () => { const v = safeEvalMath(cInpH.value); if (!isNaN(v)) { pushUndo(); obj.cx = v; _afterGeomEdit(); } });
      cGrid.appendChild(cInpH);
      const cLblV = document.createElement("span"); cLblV.className = "coord-label"; cLblV.textContent = "S." + V;
      cGrid.appendChild(cLblV);
      const cInpV = document.createElement("input"); cInpV.type = "text"; cInpV.inputMode = "decimal"; cInpV.className = "prop-input";
      cInpV.value = obj.cy.toFixed(3);
      cInpV.addEventListener("keydown", (e) => { if (e.key === "Enter") cInpV.blur(); e.stopPropagation(); });
      cInpV.addEventListener("focus", () => cInpV.select());
      cInpV.addEventListener("change", () => { const v = safeEvalMath(cInpV.value); if (!isNaN(v)) { pushUndo(); obj.cy = v; _afterGeomEdit(); } });
      cGrid.appendChild(cInpV);

      const cLblR = document.createElement("span"); cLblR.className = "coord-label"; cLblR.textContent = "r";
      cGrid.appendChild(cLblR);
      const cInpR = document.createElement("input"); cInpR.type = "text"; cInpR.inputMode = "decimal"; cInpR.className = "prop-input";
      cInpR.value = obj.r.toFixed(3);
      cInpR.addEventListener("keydown", (e) => { if (e.key === "Enter") cInpR.blur(); e.stopPropagation(); });
      cInpR.addEventListener("focus", () => cInpR.select());
      cInpR.addEventListener("change", () => { const v = safeEvalMath(cInpR.value); if (!isNaN(v) && v > 0) { pushUndo(); obj.r = v; _afterGeomEdit(); cInpD.value = (obj.r * 2).toFixed(3); cInpO.value = (2 * Math.PI * obj.r).toFixed(3); } });
      cGrid.appendChild(cInpR);
      const cLblD = document.createElement("span"); cLblD.className = "coord-label"; cLblD.textContent = "⌀";
      cGrid.appendChild(cLblD);
      const cInpD = document.createElement("span"); cInpD.className = "prop-readonly"; cInpD.textContent = (obj.r * 2).toFixed(3);
      cGrid.appendChild(cInpD);

      const cLblO = document.createElement("span"); cLblO.className = "coord-label"; cLblO.textContent = "Obvod";
      cGrid.appendChild(cLblO);
      const cInpO = document.createElement("span"); cInpO.className = "prop-readonly"; cInpO.textContent = (2 * Math.PI * obj.r).toFixed(3);
      cGrid.appendChild(cInpO);
      // empty cells to fill grid
      cGrid.appendChild(document.createElement("span"));
      cGrid.appendChild(document.createElement("span"));

      cGridTd.appendChild(cGrid);
      cGridTr.appendChild(cGridTd);
      tbody.appendChild(cGridTr);
      break;
    }
    case "arc": {
      // Grid: Střed Z+X, Poloměr + empty, Start° + Konec°
      const aGridTr = document.createElement("tr");
      const aGridTd = document.createElement("td"); aGridTd.colSpan = 2;
      const aGrid = document.createElement("div"); aGrid.className = "prop-grid-2x2";

      const aLblH = document.createElement("span"); aLblH.className = "coord-label"; aLblH.textContent = "S." + H;
      aGrid.appendChild(aLblH);
      const aInpH = document.createElement("input"); aInpH.type = "text"; aInpH.inputMode = "decimal"; aInpH.className = "prop-input";
      aInpH.value = obj.cx.toFixed(3);
      aInpH.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpH.blur(); e.stopPropagation(); });
      aInpH.addEventListener("focus", () => aInpH.select());
      aInpH.addEventListener("change", () => { const v = safeEvalMath(aInpH.value); if (!isNaN(v)) { pushUndo(); obj.cx = v; _afterGeomEdit(); } });
      aGrid.appendChild(aInpH);
      const aLblV = document.createElement("span"); aLblV.className = "coord-label"; aLblV.textContent = "S." + V;
      aGrid.appendChild(aLblV);
      const aInpV = document.createElement("input"); aInpV.type = "text"; aInpV.inputMode = "decimal"; aInpV.className = "prop-input";
      aInpV.value = obj.cy.toFixed(3);
      aInpV.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpV.blur(); e.stopPropagation(); });
      aInpV.addEventListener("focus", () => aInpV.select());
      aInpV.addEventListener("change", () => { const v = safeEvalMath(aInpV.value); if (!isNaN(v)) { pushUndo(); obj.cy = v; _afterGeomEdit(); } });
      aGrid.appendChild(aInpV);

      const aLblR = document.createElement("span"); aLblR.className = "coord-label"; aLblR.textContent = "r";
      aGrid.appendChild(aLblR);
      const aInpR = document.createElement("input"); aInpR.type = "text"; aInpR.inputMode = "decimal"; aInpR.className = "prop-input";
      aInpR.value = obj.r.toFixed(3);
      aInpR.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpR.blur(); e.stopPropagation(); });
      aInpR.addEventListener("focus", () => aInpR.select());
      aInpR.addEventListener("change", () => { const v = safeEvalMath(aInpR.value); if (!isNaN(v) && v > 0) { pushUndo(); obj.r = v; _afterGeomEdit(); } });
      aGrid.appendChild(aInpR);
      aGrid.appendChild(document.createElement("span")); // empty
      aGrid.appendChild(document.createElement("span")); // empty

      const aLblS = document.createElement("span"); aLblS.className = "coord-label"; aLblS.textContent = "Start°";
      aGrid.appendChild(aLblS);
      const aInpS = document.createElement("input"); aInpS.type = "text"; aInpS.inputMode = "decimal"; aInpS.className = "prop-input";
      aInpS.value = (obj.startAngle * 180 / Math.PI).toFixed(2);
      aInpS.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpS.blur(); e.stopPropagation(); });
      aInpS.addEventListener("focus", () => aInpS.select());
      aInpS.addEventListener("change", () => { const v = safeEvalMath(aInpS.value); if (!isNaN(v)) { pushUndo(); obj.startAngle = v * Math.PI / 180; _afterGeomEdit(); } });
      aGrid.appendChild(aInpS);
      const aLblE = document.createElement("span"); aLblE.className = "coord-label"; aLblE.textContent = "Konec°";
      aGrid.appendChild(aLblE);
      const aInpE = document.createElement("input"); aInpE.type = "text"; aInpE.inputMode = "decimal"; aInpE.className = "prop-input";
      aInpE.value = (obj.endAngle * 180 / Math.PI).toFixed(2);
      aInpE.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpE.blur(); e.stopPropagation(); });
      aInpE.addEventListener("focus", () => aInpE.select());
      aInpE.addEventListener("change", () => { const v = safeEvalMath(aInpE.value); if (!isNaN(v)) { pushUndo(); obj.endAngle = v * Math.PI / 180; _afterGeomEdit(); } });
      aGrid.appendChild(aInpE);

      aGridTd.appendChild(aGrid);
      aGridTr.appendChild(aGridTd);
      tbody.appendChild(aGridTr);
      break;
    }
    case "rect": {
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

      break;
    }
    case "polyline": {
      const pn = obj.vertices.length;
      const pSegCnt = obj.closed ? pn : pn - 1;
      const selSeg = state.selectedSegment;
      // Detail mode jen pokud selectedSegment je nastaven a NEjsme v multi-seg checkbox mode
      const objSegsForDetail = state.multiSelectedSegments.get(state.selected);
      const inCheckboxMode = objSegsForDetail && objSegsForDetail.size > 0;
      const hasSelSeg = selSeg !== null && selSeg >= 0 && selSeg < pSegCnt && !inCheckboxMode;

      if (hasSelSeg) {
        // ── Segment detail mode ──
        const si = selSeg;
        const p1 = obj.vertices[si];
        const p2 = obj.vertices[(si + 1) % pn];
        const b = obj.bulges[si] || 0;

        addInfoRow("Režim", "Editace segmentu");
        addInfoRow("Segment", `${si + 1} / ${pSegCnt}`);
        addInfoRow("Typ", b === 0 ? "Úsečka" : "Oblouk");

        // Editable start vertex
        addEditRow(`Start ${H}`, p1.x, (val) => { p1.x = val; });
        addEditRow(`Start ${V}`, p1.y, (val) => { p1.y = val; });
        // Editable end vertex
        addEditRow(`Konec ${H}`, p2.x, (val) => { p2.x = val; });
        addEditRow(`Konec ${V}`, p2.y, (val) => { p2.y = val; });

        if (b === 0) {
          // Straight segment info
          const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const segAngle = toDisplayAngle((Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI);
          addInfoRow("Délka", segLen.toFixed(3));
          addInfoRow("Úhel", segAngle.toFixed(2) + "°");
        } else {
          // Arc segment info
          const parc = bulgeToArc(p1, p2, b);
          if (parc) {
            const theta = 4 * Math.atan(Math.abs(b));
            addInfoRow("Poloměr", parc.r.toFixed(3));
            addInfoRow("Délka oblouku", (parc.r * theta).toFixed(3));
            addInfoRow("Střed X", parc.cx.toFixed(3));
            addInfoRow("Střed Z", parc.cy.toFixed(3));
          }
        }
        addEditRow("Bulge", b, (val) => { obj.bulges[si] = val; }, "0.01");

        // Button: back to polyline overview
        {
          const tr = document.createElement("tr");
          const td = document.createElement("td");
          td.colSpan = 2;
          td.style.paddingTop = "8px";
          const btn = document.createElement("button");
          btn.textContent = "← Zpět na konturu";
          btn.className = "prop-input";
          btn.style.cssText = `cursor:pointer;background:${COLORS.surfaceHover};color:${COLORS.text};border:1px solid ${COLORS.border};border-radius:4px;padding:4px 8px;width:100%`;
          btn.addEventListener("click", () => {
            state.selectedSegment = null;
            state._selectedSegmentObjIdx = null;
            state.multiSelectedSegments.clear();
            updateProperties();
            renderAll();
          });
          td.appendChild(btn);
          tr.appendChild(td);
          tbody.appendChild(tr);
        }
      } else {
        // ── Polyline overview mode ──
        addInfoRow("Vrcholů", pn);
        addInfoRow("Uzavřená", obj.closed ? "Ano" : "Ne");
        // Total length
        let polyLen = 0;
        let arcCount = 0;
        for (let i = 0; i < pSegCnt; i++) {
          const pp1 = obj.vertices[i];
          const pp2 = obj.vertices[(i + 1) % pn];
          const pb = obj.bulges[i] || 0;
          if (pb === 0) {
            polyLen += Math.hypot(pp2.x - pp1.x, pp2.y - pp1.y);
          } else {
            arcCount++;
            const parc = bulgeToArc(pp1, pp2, pb);
            if (parc) {
              const theta = 4 * Math.atan(Math.abs(pb));
              polyLen += parc.r * theta;
            }
          }
        }
        addInfoRow("Celková délka", polyLen.toFixed(3));
        addInfoRow("Segmentů", pSegCnt + " (" + arcCount + " oblouků)");

        // Clickable segment list with checkboxes
        for (let i = 0; i < pSegCnt; i++) {
          const sp1 = obj.vertices[i];
          const sp2 = obj.vertices[(i + 1) % pn];
          const sb = obj.bulges[i] || 0;
          const segType = sb === 0 ? "úsečka" : "oblouk";
          const segLen = sb === 0
            ? Math.hypot(sp2.x - sp1.x, sp2.y - sp1.y)
            : (() => { const a = bulgeToArc(sp1, sp2, sb); return a ? a.r * 4 * Math.atan(Math.abs(sb)) : 0; })();

          const objIdx = state.selected;
          const objSegs = state.multiSelectedSegments.get(objIdx);
          const isSegSel = objSegs ? objSegs.has(i) : false;

          const tr = document.createElement("tr");
          tr.style.cursor = "pointer";
          tr.title = "Klikněte pro detail / checkbox pro výběr";
          const tdLabel = document.createElement("td");
          tdLabel.style.cssText = "display:flex;align-items:center;gap:4px";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = isSegSel;
          cb.style.cssText = "accent-color:#89b4fa;margin:0;cursor:pointer";
          cb.title = "Přidat/odebrat segment z výběru";
          cb.addEventListener("click", (e) => {
            e.stopPropagation();
            _toggleSegmentSelection(objIdx, i);
          });
          tdLabel.appendChild(cb);
          const labelSpan = document.createElement("span");
          labelSpan.textContent = `S${i + 1}`;
          labelSpan.style.color = isSegSel ? COLORS.selected : COLORS.primary;
          tdLabel.appendChild(labelSpan);
          const tdVal = document.createElement("td");
          tdVal.textContent = `${segType}, ${segLen.toFixed(2)} mm`;
          tdVal.className = "prop-readonly";
          if (isSegSel) tdVal.style.color = COLORS.selected;
          tr.appendChild(tdLabel);
          tr.appendChild(tdVal);
          tr.addEventListener("click", () => {
            state.selectedSegment = i;
            state._selectedSegmentObjIdx = state.selected;
            updateProperties();
            renderAll();
          });
          tr.addEventListener("mouseenter", () => { tr.style.background = COLORS.surfaceHover; });
          tr.addEventListener("mouseleave", () => { tr.style.background = ""; });
          tbody.appendChild(tr);
        }

        // Show vertices
        obj.vertices.forEach((v, vi) => {
          addEditRow(`V${vi + 1} X`, v.x, (val) => { v.x = val; });
          addEditRow(`V${vi + 1} Z`, v.y, (val) => { v.y = val; });
        });
      }
      break;
    }
    case "text": {
      addEditRow(H, obj.x, (v) => { obj.x = v; });
      addEditRow(V, obj.y, (v) => { obj.y = v; });
      addEditRow("Velikost", obj.fontSize || 14, (v) => { obj.fontSize = v; });
      addEditRow("Rotace°", (obj.rotation || 0) * 180 / Math.PI, (v) => { obj.rotation = v * Math.PI / 180; }, 5);
      addEditRow("Rozpal", obj.letterSpacing || 0, (v) => { obj.letterSpacing = v; });
      addTextRow("Text", obj.text || "", (v) => { obj.text = v; obj.name = `Text "${v.substring(0, 20)}"`; renderAllDebounced(); });

      // Font family
      {
        const FONTS = [
          { value: 'Consolas, monospace', label: 'Consolas' },
          { value: 'Arial, sans-serif', label: 'Arial' },
          { value: 'Times New Roman, serif', label: 'Times' },
          { value: 'Courier New, monospace', label: 'Courier' },
          { value: 'Verdana, sans-serif', label: 'Verdana' },
          { value: 'Georgia, serif', label: 'Georgia' },
        ];
        const tr = document.createElement("tr");
        const tdLabel = document.createElement("td");
        tdLabel.textContent = "Písmo";
        const tdVal = document.createElement("td");
        const sel = document.createElement("select");
        sel.className = "prop-input";
        FONTS.forEach(f => {
          const opt = document.createElement("option");
          opt.value = f.value;
          opt.textContent = f.label;
          if (f.value === (obj.fontFamily || 'Consolas, monospace')) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener("change", () => {
          pushUndo();
          obj.fontFamily = sel.value;
          renderAll();
        });
        sel.addEventListener("keydown", (e) => e.stopPropagation());
        tdVal.appendChild(sel);
        tr.appendChild(tdLabel);
        tr.appendChild(tdVal);
        tbody.appendChild(tr);
      }
      // Zarovnání
      {
        const tr = document.createElement("tr");
        const tdLabel = document.createElement("td");
        tdLabel.textContent = "Zarovnání";
        const tdVal = document.createElement("td");
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;gap:2px";
        ['left', 'center', 'right'].forEach(a => {
          const btn = document.createElement("button");
          btn.textContent = a === 'left' ? '⫷' : a === 'center' ? '☰' : '⫸';
          btn.title = a;
          btn.style.cssText = "flex:1;padding:4px;border:1px solid var(--ctp-surface1);border-radius:4px;cursor:pointer;background:" + ((obj.textAlign || 'left') === a ? 'var(--ctp-blue)' : 'var(--ctp-surface0)') + ";color:var(--ctp-text);font-size:14px";
          btn.addEventListener("click", () => {
            pushUndo();
            obj.textAlign = a;
            renderAll();
            updateProperties();
          });
          wrap.appendChild(btn);
        });
        tdVal.appendChild(wrap);
        tr.appendChild(tdLabel);
        tr.appendChild(tdVal);
        tbody.appendChild(tr);
      }
      // Bold + Italic
      {
        const tr = document.createElement("tr");
        const tdLabel = document.createElement("td");
        tdLabel.textContent = "Styl";
        const tdVal = document.createElement("td");
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;gap:6px;align-items:center";
        const cbBold = document.createElement("input");
        cbBold.type = "checkbox";
        cbBold.checked = !!obj.bold;
        cbBold.addEventListener("change", () => { pushUndo(); obj.bold = cbBold.checked; renderAll(); });
        const lblBold = document.createElement("span");
        lblBold.textContent = "B";
        lblBold.style.cssText = "font-weight:bold;cursor:pointer";
        lblBold.addEventListener("click", () => { cbBold.checked = !cbBold.checked; cbBold.dispatchEvent(new Event('change')); });
        wrap.appendChild(cbBold);
        wrap.appendChild(lblBold);

        const cbItalic = document.createElement("input");
        cbItalic.type = "checkbox";
        cbItalic.checked = !!obj.italic;
        cbItalic.addEventListener("change", () => { pushUndo(); obj.italic = cbItalic.checked; renderAll(); });
        const lblItalic = document.createElement("span");
        lblItalic.textContent = "I";
        lblItalic.style.cssText = "font-style:italic;cursor:pointer;margin-left:6px";
        lblItalic.addEventListener("click", () => { cbItalic.checked = !cbItalic.checked; cbItalic.dispatchEvent(new Event('change')); });
        wrap.appendChild(cbItalic);
        wrap.appendChild(lblItalic);
        tdVal.appendChild(wrap);
        tr.appendChild(tdLabel);
        tr.appendChild(tdVal);
        tbody.appendChild(tr);
      }
      // Editace textu – tlačítko pro otevření kompletního dialogu
      {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 2;
        const btn = document.createElement("button");
        btn.textContent = "📝 Otevřít editor textu";
        btn.style.cssText = "width:100%;padding:6px;background:var(--ctp-blue);color:var(--ctp-base);border:none;border-radius:4px;cursor:pointer;font-size:13px;margin-top:4px";
        btn.addEventListener("click", () => {
          import('./dialogs/textDialog.js').then(({ showTextDialog }) => {
            showTextDialog({
              text: obj.text,
              fontSize: obj.fontSize || 14,
              fontFamily: obj.fontFamily || 'Consolas, monospace',
              rotation: obj.rotation || 0,
              textAlign: obj.textAlign || 'left',
              bold: !!obj.bold,
              italic: !!obj.italic,
              letterSpacing: obj.letterSpacing || 0,
              pathMode: obj.pathMode || 'none',
              pathObjectId: textPathIndex(obj),
              pathOffset: obj.pathOffset || 2,
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
              obj.pathObjId = textPathIdFromIndex(result.pathObjectId);
              delete obj.pathObjectId;
              obj.pathOffset = result.pathOffset;
              obj.name = `Text "${result.text.substring(0, 20)}"`;
              renderAll();
              updateProperties();
            });
          });
        });
        td.appendChild(btn);
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
      break;
    }
  }
}

// ── Seznam průsečíků, rozbalování panelů → js/ui/intersectionList.js ──
export { updateIntersectionList, togglePanel };

// ── Výběr barvy (duha, vlastní, kapátko) → js/ui/colorPicker.js ──
bridge.openFillColorPicker = openFillColorPicker;

// ── Vrstvy (seznam, ➕ / 🗑) → js/ui/layerList.js ──
export { updateLayerList };
initLayerButtons();

// ── Přídavek (př/pl), lišta [data-tool], setTool, hinty → js/ui/toolbar.js ──
initToolbar();
export { refreshToolbarActive, setTool, activateFilletChamfer, setHint, resetHint };

// ── Přepínače stavového řádku a indikátory → js/ui/statusButtons.js ──
export {
  updateSnapPtsBtn, updateSnapGridBtn, toggleSnapGrid, updateAngleSnapBtn, toggleAngleSnap,
  updateDimsBtn, cycleDimsMode, updateCoordModeBtn, toggleCoordMode, updateXDisplayBtn,
  toggleXDisplay, updateMachineTypeBtn, toggleMachineType,
};
initStatusButtons();

// ── Nulový bod (📍, indikátor, dialog) → js/ui/nullPoint.js ──
export { updateNullPointUI, clearNullPoint };
initNullPointButtons();

// ── Undo/Redo tlačítka ──
document.getElementById("btnUndo").addEventListener("click", undo);
document.getElementById("btnRedo").addEventListener("click", redo);

// ── Průsečíky (automaticky při rozbalení panelu) ──
const _btnCalcInt = document.getElementById("btnCalcInt");
if (_btnCalcInt) _btnCalcInt.addEventListener("click", () => { if (bridge.calculateAllIntersections) bridge.calculateAllIntersections(); });

// ── Smazat vše → js/ui/drawingHistory.js ──
initClearAllButton();

// ── Historie smazaných výkresů → js/ui/drawingHistory.js ──
document.getElementById("btnHistory")?.addEventListener("click", showHistoryDialog);

// ── Kalkulačka (schránka, popup, 🔢/📋) → js/ui/calculator.js ──
export { getCalcClipboardValue, setCalcClipboardValue, openCalculator };

// ── Trigonometrie – popup → js/ui/trigCalc.js ──

initCalcButtons();   // 🔢, 📋, sledování posledního pole (js/ui/calculator.js)
initLauncherButtons();   // CNC kalkulačky, Trigonometrie, ✏️ Editor, VK, CAM, AI, 📝 (js/ui/launchers.js)

// ── Dialogy mřížky a kroku úhlového snapu → js/ui/gridAngleDialogs.js ──
export { showGridSizeDialog, showAngleSnapDialog };


// ╔══════════════════════════════════════════════════════════════╗
// ║  Statusbar – název projektu                                  ║
// ╚══════════════════════════════════════════════════════════════╝

/** Aktualizuje název projektu ve stavovém řádku. */
export function updateStatusProject() {
  const el = document.getElementById('statusProject');
  if (el) el.textContent = 'Projekt: ' + (state.projectName || 'Bez názvu');
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  Help overlay                                                ║
// ╚══════════════════════════════════════════════════════════════╝

/** Zobrazí nápovědu (modal). */
export function showHelp() {
  const overlay = document.getElementById('helpOverlay');
  if (overlay) overlay.classList.add('visible');
}

/** Skryje nápovědu. */
export function hideHelp() {
  const overlay = document.getElementById('helpOverlay');
  if (overlay) overlay.classList.remove('visible');
}

/** Přepne viditelnost nápovědy. */
export function toggleHelp() {
  const overlay = document.getElementById('helpOverlay');
  if (!overlay) return;
  if (overlay.classList.contains('visible')) {
    hideHelp();
  } else {
    showHelp();
  }
}

// Help close button
document.getElementById('helpCloseBtn')?.addEventListener('click', hideHelp);

// Help overlay click on background
document.getElementById('helpOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'helpOverlay') hideHelp();
});

// Help toolbar button
document.getElementById('btnHelp')?.addEventListener('click', toggleHelp);

// ── First-run help ──
/** Zkontroluje a zobrazí nápovědu při prvním spuštění. */
export async function checkFirstRunHelp() {
  const shown = await getMeta('helpShown');
  if (!shown) {
    showHelp();
    setMeta('helpShown', '1');
  }
}

// ══════════════════════════════════════════════════════════════
// ║  Nastavení – dialog s konfigurací aplikace                ║
// ══════════════════════════════════════════════════════════════

/** Aplikuje aktuální motiv na CSS i canvas barvy. */
export function applyTheme() {
  const isLight = state.theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  applyThemeColors(state.theme);
  renderAll();
  showToast(isLight ? 'Světlý motiv' : 'Tmavý motiv');
}

// ── Dialog ⚙️ Nastavení → js/ui/settingsDialog.js ──
document.getElementById('btnSettings')?.addEventListener('click', showSettingsDialog);
document.getElementById('mobileSettings')?.addEventListener('click', showSettingsDialog);
document.getElementById('desktopSettings')?.addEventListener('click', showSettingsDialog);

