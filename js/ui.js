// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – UI panely, toolbar, hinty                          ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS, MOBILE_BREAKPOINT, applyThemeColors } from './constants.js';
import { state, showToast, pushUndo, undo, redo, axisLabels, resetDrawingState, displayX, xPrefix, fmtStatusCoords, coordHelpers, toDisplayAngle } from './state.js';
import { typeLabel, toolLabel, bulgeToArc, safeEvalMath, _parseMathExpr, getRectCorners, getObjectSnapPoints } from './utils.js';
import { renderAll, renderAllDebounced } from './render.js';
import { drawCanvas, screenToWorld, snapPt, autoCenterView } from './canvas.js';
import { bridge } from './bridge.js';
import { addObject } from './objects.js';
import { updateAssociativeDimensions } from './dialogs/dimension.js';
import { openCuttingCalc, openTaperCalc, openThreadCalc, openConvertCalc, openWeightCalc, openToleranceCalc, openRoughnessCalc, openInsertCalc, openSinumerikHub, openCamSimulator } from './cnc-calcs.js';
import { makeOverlay, makeInputOverlay } from './dialogFactory.js';
import { getMeta, setMeta } from './idb.js';
import { showEditObjectDialog } from './dialogs/mobileEdit.js';
import { isAnchored, removeAnchorsForObject, cleanupOrphanAnchors } from './tools/anchorClick.js';

// ── Bridge registrace (rozbíjí cyklickou závislost geometry ↔ ui) ──
bridge.updateProperties = () => updateProperties();
bridge.updateObjectList = () => updateObjectList();
bridge.updateIntersectionList = () => updateIntersectionList();
bridge.updateLayerList = () => updateLayerList();
bridge.renderAll = () => renderAll();
bridge.resetHint = () => resetHint();
bridge.applyTheme = () => applyTheme();

// ── Okamžité uložení nastavení do IDB ──
let _persistTimer = null;
function persistSettings() {
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

// ── Seznam objektů ──
/** Aktualizuje seznam objektů v panelu. */
export function updateObjectList() {
  const ul = document.getElementById("objectList");
  ul.innerHTML = "";
  const icons = {
    point: "·",
    line: "/",
    constr: "⁄",
    circle: "○",
    arc: "⌒",
    rect: "□",
    polyline: "⛓",
  };

  // ── Select-all checkbox (bez kót) ──
  const nonDimObjects = state.objects.filter(o => !o.isDimension && !o.isCoordLabel);
  if (nonDimObjects.length > 0) {
    const selectAllLi = document.createElement("li");
    selectAllLi.className = "select-all-row";
    const selectAllCb = document.createElement("input");
    selectAllCb.type = "checkbox";
    selectAllCb.className = "obj-checkbox";
    selectAllCb.title = "Vybrat vše";
    const nonDimIndices = state.objects.map((o, i) => (!o.isDimension && !o.isCoordLabel) ? i : -1).filter(i => i >= 0);
    const allChecked = nonDimIndices.length > 0 && nonDimIndices.every(i => i === state.selected || state.multiSelected.has(i));
    selectAllCb.checked = allChecked;
    selectAllCb.addEventListener("change", () => {
      if (selectAllCb.checked) {
        state.multiSelected.clear();
        nonDimIndices.forEach(i => state.multiSelected.add(i));
        state.selected = nonDimIndices[0] ?? null;
      } else {
        state.selected = null;
        state.multiSelected.clear();
      }
      state.selectedSegment = null;
      state._selectedSegmentObjIdx = null;
      updateObjectList();
      updateProperties();
      renderAll();
    });
    const label = document.createElement("span");
    label.textContent = "Vše";
    label.style.opacity = "0.7";
    selectAllLi.appendChild(selectAllCb);
    selectAllLi.appendChild(label);

    // Checkbox pro číslování objektů – na stejném řádku
    const numCb = document.createElement("input");
    numCb.type = "checkbox";
    numCb.className = "obj-checkbox";
    numCb.style.marginLeft = "auto";
    numCb.title = "Zobrazit čísla objektů na výkrese";
    numCb.checked = state.showObjectNumbers;
    numCb.addEventListener("change", () => {
      state.showObjectNumbers = numCb.checked;
      renderAll();
      // Na mobilu zavřít panel aby byl vidět výkres s čísly
      if (numCb.checked && window.innerWidth <= MOBILE_BREAKPOINT) {
        const sidebar = document.getElementById("sidebar");
        const sidebarOverlay = document.getElementById("sidebarOverlay");
        sidebar.classList.remove("mobile-open");
        sidebarOverlay.classList.remove("active");
        setTimeout(() => autoCenterView(), 260);
      }
    });
    const numLabel = document.createElement("span");
    numLabel.textContent = "Číslovat";
    numLabel.style.opacity = "0.7";
    selectAllLi.appendChild(numCb);
    selectAllLi.appendChild(numLabel);

    ul.appendChild(selectAllLi);
  }

  state.objects.forEach((obj, idx) => {
    const li = document.createElement("li");
    const isChecked = idx === state.selected || state.multiSelected.has(idx);
    const isDim = obj.isDimension || obj.isCoordLabel;

    // Zjistit, jestli objekt má vybrané body (ale není sám vybraný)
    const SEL_PT_TOL_OBJ = 1e-4;
    let hasSelectedPoints = false;
    if (!isChecked && state.selectedPoint && state.selectedPoint.length > 0 && !isDim) {
      const pts = getObjectSnapPoints(obj);
      hasSelectedPoints = pts.some(p => !p.mid && state.selectedPoint.some(sp => Math.hypot(sp.x - p.x, sp.y - p.y) < SEL_PT_TOL_OBJ));
    }

    li.className = isChecked ? "selected" : (hasSelectedPoints ? "has-points" : "");

    // ── Checkbox pro ne-kóty ──
    if (!isDim) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "obj-checkbox";
      cb.checked = isChecked;
      if (hasSelectedPoints && !isChecked) cb.indeterminate = true;
      cb.addEventListener("change", (e) => {
        e.stopPropagation();
        if (cb.checked) {
          if (state.selected !== null && state.selected !== idx) {
            state.multiSelected.add(state.selected);
          }
          state.multiSelected.add(idx);
          state.selected = idx;
        } else {
          state.multiSelected.delete(idx);
          if (idx === state.selected) {
            state.selected = state.multiSelected.size > 0
              ? [...state.multiSelected].pop() : null;
          }
          if (state.multiSelected.size === 1) {
            state.selected = state.multiSelected.values().next().value;
            state.multiSelected.clear();
          }
        }
        state.selectedSegment = null;
        state._selectedSegmentObjIdx = null;
        state.multiSelectedSegments.clear();
        updateObjectList();
        updateProperties();
        renderAll();
      });
      li.appendChild(cb);
    }

    const span = document.createElement("span");
    const iconSpan = document.createElement("span");
    iconSpan.className = "obj-icon";
    iconSpan.textContent = isDim ? "⌗" : (icons[obj.type] || "?");
    span.appendChild(iconSpan);
    span.appendChild(document.createTextNode(obj.name || obj.type + " " + obj.id));
    li.appendChild(span);

    // ── Wrapper pro akční tlačítka (edit + delete) ──
    const actionsWrap = document.createElement("span");
    actionsWrap.style.display = "flex";
    actionsWrap.style.alignItems = "center";
    actionsWrap.style.flexShrink = "0";

    const editBtn = document.createElement("button");
    editBtn.className = "edit-btn";
    editBtn.title = "Upravit objekt";
    editBtn.textContent = "✏️";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selected = idx;
      state.multiSelected.clear();
      updateObjectList();
      updateProperties();
      renderAll();
      showEditObjectDialog(idx);
    });
    actionsWrap.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "del-btn";
    delBtn.title = "Smazat";
    delBtn.textContent = "✕";
    actionsWrap.appendChild(delBtn);
    li.appendChild(actionsWrap);
    span.addEventListener("click", () => {
      if (state.multiSelected.has(idx) || (idx === state.selected && state.multiSelected.size > 0)) {
        state.multiSelected.delete(idx);
        if (idx === state.selected) {
          state.selected = state.multiSelected.size > 0
            ? [...state.multiSelected].pop() : null;
        }
        if (state.multiSelected.size === 1) {
          state.selected = state.multiSelected.values().next().value;
          state.multiSelected.clear();
        }
      } else if (idx === state.selected && state.multiSelected.size === 0) {
        state.selected = null;
      } else if (state.selected !== null) {
        if (state.multiSelected.size === 0) state.multiSelected.add(state.selected);
        state.multiSelected.add(idx);
        state.selected = idx;
      } else {
        state.selected = idx;
      }
      state.selectedSegment = null;
      state._selectedSegmentObjIdx = null;
      state.multiSelectedSegments.clear();
      updateObjectList();
      updateProperties();
      renderAll();
    });
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      pushUndo();
      if (state.dragging && state.dragObjIdx === idx) {
        state.dragging = false;
        state.dragObjIdx = null;
      } else if (state.dragging && state.dragObjIdx > idx) {
        state.dragObjIdx--;
      }
      removeAnchorsForObject(state.objects[idx]);
      state.objects.splice(idx, 1);
      // Smazat osiřelé kóty (zdrojový objekt byl právě smazán)
      const existingIds = new Set(state.objects.map(o => o.id));
      for (let di = state.objects.length - 1; di >= 0; di--) {
        const d = state.objects[di];
        if (!d.isDimension) continue;
        if (d.sourceObjId && !existingIds.has(d.sourceObjId)) {
          state.objects.splice(di, 1);
          if (idx > di) idx--;
        } else if (d.dimLine1Id && d.dimLine2Id &&
                   (!existingIds.has(d.dimLine1Id) || !existingIds.has(d.dimLine2Id))) {
          state.objects.splice(di, 1);
          if (idx > di) idx--;
        }
      }
      if (state.selected === idx) state.selected = null;
      else if (state.selected > idx) state.selected--;
      const newMulti = new Set();
      for (const mi of state.multiSelected) {
        if (mi < idx) newMulti.add(mi);
        else if (mi > idx) newMulti.add(mi - 1);
      }
      state.multiSelected = newMulti;
      updateObjectList();
      updateProperties();
      if (bridge.calculateAllIntersections) bridge.calculateAllIntersections();
      cleanupOrphanAnchors();
      renderAll();
    });
    ul.appendChild(li);

    // ── Rozbalení segmentů kontury ──
    if (obj.type === 'polyline' && (idx === state.selected || state.multiSelected.has(idx))) {
      const n = obj.vertices.length;
      const segCount = obj.closed ? n : n - 1;
      for (let si = 0; si < segCount; si++) {
        const p1 = obj.vertices[si];
        const p2 = obj.vertices[(si + 1) % n];
        const b = obj.bulges[si] || 0;
        const segName = b === 0 ? `Úsečka ${si + 1}` : `Oblouk ${si + 1}`;

        const segLi = document.createElement("li");
        const objSegsSet = state.multiSelectedSegments.get(idx);
        const isSS = objSegsSet ? objSegsSet.has(si) : false;
        segLi.className = "seg-item" + (isSS ? " seg-selected" : "");
        const segSpan = document.createElement("span");
        const segIcon = document.createElement("span");
        segIcon.className = "obj-icon";
        segIcon.textContent = b === 0 ? "/" : "⌒";
        segSpan.appendChild(segIcon);
        segSpan.appendChild(document.createTextNode(segName));
        segLi.appendChild(segSpan);

        // Delete segment button
        const segDelBtn = document.createElement("button");
        segDelBtn.className = "del-btn";
        segDelBtn.title = "Smazat segment";
        segDelBtn.textContent = "✕";
        segLi.appendChild(segDelBtn);

        // Click to select segment
        segSpan.addEventListener("click", () => {
          state.selected = idx;
          state.selectedSegment = si;
          state._selectedSegmentObjIdx = idx;
          updateObjectList();
          updateProperties();
          renderAll();
        });

        // Delete segment – split contour if middle
        segDelBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          pushUndo();
          const vn = obj.vertices.length;
          const sc = obj.closed ? vn : vn - 1;
          if (si < 0 || si >= sc) return;

          if (vn <= 2) {
            // Only 1 segment → delete the whole polyline
            removeAnchorsForObject(state.objects[idx]);
            state.objects.splice(idx, 1);
            if (state.selected === idx) state.selected = null;
            else if (state.selected > idx) state.selected--;
          } else if (obj.closed) {
            const removeIdx = (si + 1) % vn;
            obj.vertices.splice(removeIdx, 1);
            obj.bulges.splice(si, 1);
            obj.closed = false;
            if (removeIdx > 0 && removeIdx < obj.vertices.length) {
              const newVerts = [...obj.vertices.slice(removeIdx), ...obj.vertices.slice(0, removeIdx)];
              const newBulges = [...obj.bulges.slice(removeIdx), ...obj.bulges.slice(0, removeIdx)];
              obj.vertices = newVerts;
              obj.bulges = newBulges;
            }
          } else if (si === 0) {
            obj.vertices.splice(0, 1);
            obj.bulges.splice(0, 1);
          } else if (si === sc - 1) {
            obj.vertices.splice(vn - 1, 1);
            obj.bulges.splice(si, 1);
          } else {
            // Middle segment → split into two polylines
            const verts1 = obj.vertices.slice(0, si + 1);
            const bulges1 = obj.bulges.slice(0, si);
            const verts2 = obj.vertices.slice(si + 1);
            const bulges2 = obj.bulges.slice(si + 1);
            obj.vertices = verts1;
            obj.bulges = bulges1;
            obj.closed = false;
            if (verts2.length >= 2) {
              const newId = state.nextId++;
              const newObj = {
                type: 'polyline',
                id: newId,
                vertices: verts2,
                bulges: bulges2,
                closed: false,
                name: `Kontura ${newId}`,
                layer: obj.layer,
                color: obj.color,
              };
              state.objects.splice(idx + 1, 0, newObj);
              // Reindex multiSelected – insertion shifts indices > idx
              const newMulti = new Set();
              for (const mi of state.multiSelected) {
                if (mi <= idx) newMulti.add(mi);
                else newMulti.add(mi + 1);
              }
              state.multiSelected = newMulti;
            }
          }
          state.selectedSegment = null;
          state._selectedSegmentObjIdx = null;
          state.multiSelectedSegments.clear();
          updateObjectList();
          updateProperties();
          if (bridge.calculateAllIntersections) bridge.calculateAllIntersections();
          cleanupOrphanAnchors();
          showToast("Segment smazán ✓");
        });
        ul.appendChild(segLi);
      }
    }

    // ── Rozbalení segmentů obdélníku ──
    if (obj.type === 'rect' && (idx === state.selected || state.multiSelected.has(idx))) {
      const rc = getRectCorners(obj);
      for (let si = 0; si < 4; si++) {
        const c1 = rc[si];
        const c2 = rc[(si + 1) % 4];
        const sideLen = Math.hypot(c2.x - c1.x, c2.y - c1.y);

        const segLi = document.createElement("li");
        const objSegsSet = state.multiSelectedSegments.get(idx);
        const isSS = objSegsSet ? objSegsSet.has(si) : false;
        segLi.className = "seg-item" + (isSS ? " seg-selected" : "");
        const segSpan = document.createElement("span");
        const segIcon = document.createElement("span");
        segIcon.className = "obj-icon";
        segIcon.textContent = "/";
        segSpan.appendChild(segIcon);
        segSpan.appendChild(document.createTextNode(`Úsečka ${si + 1} (${sideLen.toFixed(1)})`));
        segLi.appendChild(segSpan);

        // Delete segment button
        const segDelBtn = document.createElement("button");
        segDelBtn.className = "del-btn";
        segDelBtn.title = "Smazat segment";
        segDelBtn.textContent = "✕";
        segLi.appendChild(segDelBtn);

        // Click to toggle segment selection
        segSpan.addEventListener("click", () => {
          _toggleSegmentSelection(idx, si);
        });

        // Delete segment – rozpad obdélníku na 3 úsečky
        segDelBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          pushUndo();
          const corners = getRectCorners(obj);
          const newLines = [];
          for (let j = 0; j < 4; j++) {
            if (j === si) continue; // přeskočit smazaný segment
            const ca = corners[j];
            const cb = corners[(j + 1) % 4];
            const lineId = state.nextId++;
            newLines.push({
              type: 'line',
              id: lineId,
              x1: ca.x, y1: ca.y,
              x2: cb.x, y2: cb.y,
              name: `Úsečka ${lineId}`,
              layer: obj.layer,
              color: obj.color,
            });
          }
          // Nahradit obdélník třemi úsečkami
          state.objects.splice(idx, 1, ...newLines);
          // Reindex multiSelected – replaced 1 with 3 (shift by +2)
          const newMulti = new Set();
          for (const mi of state.multiSelected) {
            if (mi < idx) newMulti.add(mi);
            else if (mi > idx) newMulti.add(mi + 2);
          }
          state.multiSelected = newMulti;
          state.selected = null;
          state.selectedSegment = null;
          state._selectedSegmentObjIdx = null;
          state.multiSelectedSegments.clear();
          updateObjectList();
          updateProperties();
          if (bridge.calculateAllIntersections) bridge.calculateAllIntersections();
          renderAll();
          showToast("Segment smazán – obdélník rozložen ✓");
        });
        ul.appendChild(segLi);
      }
    }
  });
}

// ── Helper: toggle segment ve výběru ──
function _toggleSegmentSelection(objIdx, segIdx) {
  let s = state.multiSelectedSegments.get(objIdx);
  if (s && s.has(segIdx)) {
    s.delete(segIdx);
    if (s.size === 0) state.multiSelectedSegments.delete(objIdx);
    // Aktualizovat selectedSegment
    if (state.multiSelectedSegments.size === 0) {
      state.selectedSegment = null;
      state._selectedSegmentObjIdx = null;
    } else {
      const lastKey = [...state.multiSelectedSegments.keys()].pop();
      const lastSet = state.multiSelectedSegments.get(lastKey);
      state.selectedSegment = [...lastSet].pop();
      state._selectedSegmentObjIdx = lastKey;
    }
  } else {
    if (!s) { s = new Set(); state.multiSelectedSegments.set(objIdx, s); }
    s.add(segIdx);
    state.selectedSegment = segIdx;
    state._selectedSegmentObjIdx = objIdx;
  }
  updateObjectList();
  updateProperties();
  renderAll();
}

// ── Vlastnosti objektu ──
/** Aktualizuje panel vlastností vybraného objektu. */
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
        updateAssociativeDimensions();
        renderAll();
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

  // Helper: přidá color picker s 5 presety na jednom řádku
  function addColorRow(label, value, onChange) {
    const COLOR_PRESETS = [
      '#89b4fa', // modrá
      '#f38ba8', // červená
      '#a6e3a1', // zelená
      '#f9e2af', // žlutá
      '#ffffff', // bílá
    ];
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = label;
    const tdVal = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "color-inline-row";

    // Color picker
    const input = document.createElement("input");

    // Preset color buttons
    function updatePresetActive() {
      wrap.querySelectorAll('.color-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === input.value);
      });
    }
    COLOR_PRESETS.forEach(c => {
      const btn = document.createElement("button");
      btn.className = "color-preset-btn";
      btn.dataset.color = c;
      btn.style.background = c;
      btn.title = c;
      if (c === value) btn.classList.add('active');
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        input.value = c;
        onChange(c);
        updatePresetActive();
      });
      wrap.appendChild(btn);
    });

    // Color picker na konci
    input.type = "color";
    input.className = "prop-color-input";
    input.value = value;
    input.addEventListener("input", () => {
      onChange(input.value);
      updatePresetActive();
    });
    wrap.appendChild(input);

    tdVal.appendChild(wrap);
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

  // Typ (read-only)
  addInfoRow("Typ", typeLabel(obj.type));
  // Název (editovatelný)
  addTextRow("Název", obj.name || "", (v) => { obj.name = v; });
  // Barva (editovatelná)
  addColorRow("Barva", obj.color || COLORS.primary, (v) => { obj.color = v; renderAllDebounced(); });

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
        updateAssociativeDimensions(); renderAll();
      });
      inpY1.addEventListener("change", () => {
        const v = safeEvalMath(inpY1.value);
        if (isNaN(v)) return;
        pushUndo(); obj.y1 = v;
        syncPolarFromObj();
        updateAssociativeDimensions(); renderAll();
      });
      inpX2.addEventListener("change", () => {
        const v = safeEvalMath(inpX2.value);
        if (isNaN(v)) return;
        pushUndo(); obj.x2 = v;
        syncPolarFromObj();
        updateAssociativeDimensions(); renderAll();
      });
      inpY2.addEventListener("change", () => {
        const v = safeEvalMath(inpY2.value);
        if (isNaN(v)) return;
        pushUndo(); obj.y2 = v;
        syncPolarFromObj();
        updateAssociativeDimensions(); renderAll();
      });

      // Wire polar inputs
      inpLen.addEventListener("change", () => {
        const v = safeEvalMath(inpLen.value);
        if (isNaN(v)) return;
        pushUndo();
        syncFromPolar();
        updateAssociativeDimensions(); renderAll();
      });
      inpAng.addEventListener("change", () => {
        const v = safeEvalMath(inpAng.value);
        if (isNaN(v)) return;
        pushUndo();
        syncFromPolar();
        updateAssociativeDimensions(); renderAll();
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
      cInpH.addEventListener("change", () => { const v = safeEvalMath(cInpH.value); if (!isNaN(v)) { pushUndo(); obj.cx = v; updateAssociativeDimensions(); renderAll(); } });
      cGrid.appendChild(cInpH);
      const cLblV = document.createElement("span"); cLblV.className = "coord-label"; cLblV.textContent = "S." + V;
      cGrid.appendChild(cLblV);
      const cInpV = document.createElement("input"); cInpV.type = "text"; cInpV.inputMode = "decimal"; cInpV.className = "prop-input";
      cInpV.value = obj.cy.toFixed(3);
      cInpV.addEventListener("keydown", (e) => { if (e.key === "Enter") cInpV.blur(); e.stopPropagation(); });
      cInpV.addEventListener("focus", () => cInpV.select());
      cInpV.addEventListener("change", () => { const v = safeEvalMath(cInpV.value); if (!isNaN(v)) { pushUndo(); obj.cy = v; updateAssociativeDimensions(); renderAll(); } });
      cGrid.appendChild(cInpV);

      const cLblR = document.createElement("span"); cLblR.className = "coord-label"; cLblR.textContent = "r";
      cGrid.appendChild(cLblR);
      const cInpR = document.createElement("input"); cInpR.type = "text"; cInpR.inputMode = "decimal"; cInpR.className = "prop-input";
      cInpR.value = obj.r.toFixed(3);
      cInpR.addEventListener("keydown", (e) => { if (e.key === "Enter") cInpR.blur(); e.stopPropagation(); });
      cInpR.addEventListener("focus", () => cInpR.select());
      cInpR.addEventListener("change", () => { const v = safeEvalMath(cInpR.value); if (!isNaN(v) && v > 0) { pushUndo(); obj.r = v; updateAssociativeDimensions(); renderAll(); cInpD.value = (obj.r * 2).toFixed(3); cInpO.value = (2 * Math.PI * obj.r).toFixed(3); } });
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
      aInpH.addEventListener("change", () => { const v = safeEvalMath(aInpH.value); if (!isNaN(v)) { pushUndo(); obj.cx = v; updateAssociativeDimensions(); renderAll(); } });
      aGrid.appendChild(aInpH);
      const aLblV = document.createElement("span"); aLblV.className = "coord-label"; aLblV.textContent = "S." + V;
      aGrid.appendChild(aLblV);
      const aInpV = document.createElement("input"); aInpV.type = "text"; aInpV.inputMode = "decimal"; aInpV.className = "prop-input";
      aInpV.value = obj.cy.toFixed(3);
      aInpV.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpV.blur(); e.stopPropagation(); });
      aInpV.addEventListener("focus", () => aInpV.select());
      aInpV.addEventListener("change", () => { const v = safeEvalMath(aInpV.value); if (!isNaN(v)) { pushUndo(); obj.cy = v; updateAssociativeDimensions(); renderAll(); } });
      aGrid.appendChild(aInpV);

      const aLblR = document.createElement("span"); aLblR.className = "coord-label"; aLblR.textContent = "r";
      aGrid.appendChild(aLblR);
      const aInpR = document.createElement("input"); aInpR.type = "text"; aInpR.inputMode = "decimal"; aInpR.className = "prop-input";
      aInpR.value = obj.r.toFixed(3);
      aInpR.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpR.blur(); e.stopPropagation(); });
      aInpR.addEventListener("focus", () => aInpR.select());
      aInpR.addEventListener("change", () => { const v = safeEvalMath(aInpR.value); if (!isNaN(v) && v > 0) { pushUndo(); obj.r = v; updateAssociativeDimensions(); renderAll(); } });
      aGrid.appendChild(aInpR);
      aGrid.appendChild(document.createElement("span")); // empty
      aGrid.appendChild(document.createElement("span")); // empty

      const aLblS = document.createElement("span"); aLblS.className = "coord-label"; aLblS.textContent = "Start°";
      aGrid.appendChild(aLblS);
      const aInpS = document.createElement("input"); aInpS.type = "text"; aInpS.inputMode = "decimal"; aInpS.className = "prop-input";
      aInpS.value = (obj.startAngle * 180 / Math.PI).toFixed(2);
      aInpS.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpS.blur(); e.stopPropagation(); });
      aInpS.addEventListener("focus", () => aInpS.select());
      aInpS.addEventListener("change", () => { const v = safeEvalMath(aInpS.value); if (!isNaN(v)) { pushUndo(); obj.startAngle = v * Math.PI / 180; updateAssociativeDimensions(); renderAll(); } });
      aGrid.appendChild(aInpS);
      const aLblE = document.createElement("span"); aLblE.className = "coord-label"; aLblE.textContent = "Konec°";
      aGrid.appendChild(aLblE);
      const aInpE = document.createElement("input"); aInpE.type = "text"; aInpE.inputMode = "decimal"; aInpE.className = "prop-input";
      aInpE.value = (obj.endAngle * 180 / Math.PI).toFixed(2);
      aInpE.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpE.blur(); e.stopPropagation(); });
      aInpE.addEventListener("focus", () => aInpE.select());
      aInpE.addEventListener("change", () => { const v = safeEvalMath(aInpE.value); if (!isNaN(v)) { pushUndo(); obj.endAngle = v * Math.PI / 180; updateAssociativeDimensions(); renderAll(); } });
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
          updateAssociativeDimensions(); renderAll();
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
        updateAssociativeDimensions(); renderAll();
        updateProperties();
      });
      rH.addEventListener("change", () => {
        if (isNaN(safeEvalMath(rH.value))) return;
        pushUndo();
        syncRectFromWH();
        updateAssociativeDimensions(); renderAll();
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
        updateAssociativeDimensions(); renderAll();
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
          import('../dialogs/textDialog.js').then(({ showTextDialog }) => {
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
              pathObjectId: obj.pathObjectId != null ? obj.pathObjectId : null,
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
              obj.pathObjectId = result.pathObjectId;
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
export function updateIntersectionList() {
  const ul = document.getElementById("intersectionList");
  if (!ul) return;
  ul.innerHTML = "";
  if (state.intersections.length === 0) {
    ul.innerHTML =
      `<li style="color:${COLORS.textMuted};cursor:default">Žádné průsečíky</li>`;
    return;
  }

  const SEL_PT_TOL = 1e-4;
  const _isPtSel = (px, py) => state.selectedPoint && state.selectedPoint.some(p => Math.hypot(p.x - px, p.y - py) < SEL_PT_TOL);
  const _togglePt = (px, py, add) => {
    if (!state.selectedPoint) state.selectedPoint = [];
    if (add) {
      if (!_isPtSel(px, py)) state.selectedPoint.push({ x: px, y: py });
    } else {
      const i = state.selectedPoint.findIndex(p => Math.hypot(p.x - px, p.y - py) < SEL_PT_TOL);
      if (i >= 0) state.selectedPoint.splice(i, 1);
      if (state.selectedPoint.length === 0) state.selectedPoint = null;
    }
  };

  // ── Select-all + Číslovat řádek ──
  const selectAllLi = document.createElement("li");
  selectAllLi.className = "select-all-row";

  const selectAllCb = document.createElement("input");
  selectAllCb.type = "checkbox";
  selectAllCb.className = "int-checkbox";
  selectAllCb.title = "Vybrat vše";
  const allChecked = state.intersections.every(pt => _isPtSel(pt.x, pt.y));
  selectAllCb.checked = allChecked;
  selectAllCb.addEventListener("change", () => {
    if (selectAllCb.checked) {
      state.intersections.forEach(pt => {
        if (!_isPtSel(pt.x, pt.y)) {
          if (!state.selectedPoint) state.selectedPoint = [];
          state.selectedPoint.push({ x: pt.x, y: pt.y });
        }
      });
    } else {
      state.intersections.forEach(pt => {
        _togglePt(pt.x, pt.y, false);
      });
    }
    updateIntersectionList();
    renderAll();
  });
  const selLabel = document.createElement("span");
  selLabel.textContent = "Vše";
  selLabel.style.opacity = "0.7";
  selectAllLi.appendChild(selectAllCb);
  selectAllLi.appendChild(selLabel);

  // Checkbox pro číslování průsečíků
  const numCb = document.createElement("input");
  numCb.type = "checkbox";
  numCb.className = "int-checkbox";
  numCb.style.marginLeft = "auto";
  numCb.title = "Zobrazit čísla průsečíků na výkrese";
  numCb.checked = !!state.showIntersectionNumbers;
  numCb.addEventListener("change", () => {
    state.showIntersectionNumbers = numCb.checked;
    renderAll();
    if (numCb.checked && window.innerWidth <= MOBILE_BREAKPOINT) {
      const sidebar = document.getElementById("sidebar");
      const sidebarOverlay = document.getElementById("sidebarOverlay");
      sidebar.classList.remove("mobile-open");
      sidebarOverlay.classList.remove("active");
      setTimeout(() => autoCenterView(), 260);
    }
  });
  const numLabel = document.createElement("span");
  numLabel.textContent = "Číslovat";
  numLabel.style.opacity = "0.7";
  selectAllLi.appendChild(numCb);
  selectAllLi.appendChild(numLabel);

  ul.appendChild(selectAllLi);

  // ── Jednotlivé průsečíky ──
  const { H: _iH, V: _iV, Hp: _Hp, Vp: _Vp, fH, fV } = coordHelpers();
  state.intersections.forEach((pt, i) => {
    const li = document.createElement("li");
    const isSel = _isPtSel(pt.x, pt.y);
    li.className = isSel ? "selected" : "";

    // Checkbox pro výběr
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "int-checkbox";
    cb.checked = isSel;
    cb.addEventListener("change", (e) => {
      e.stopPropagation();
      _togglePt(pt.x, pt.y, cb.checked);
      updateIntersectionList();
      renderAll();
    });
    li.appendChild(cb);

    // Souřadnice + číslo
    const _hv = fH(pt.x);
    const _vv = fV(pt.y);
    const coordSpan = document.createElement("span");
    coordSpan.style.flex = "1";
    coordSpan.textContent = `${_Hp}${_iH}=${_hv.toFixed(state.displayDecimals)}  ${_Vp}${_iV}=${_vv.toFixed(state.displayDecimals)}`;
    li.appendChild(coordSpan);

    // Číslo průsečíku
    const numSpan = document.createElement("span");
    numSpan.style.cssText = "font-size:10px;opacity:0.5;margin-left:4px";
    numSpan.textContent = `P${i + 1}`;
    li.appendChild(numSpan);

    // Klik na text = kopírovat souřadnice
    coordSpan.addEventListener("click", () => {
      const text = `${_Hp}${_iH}${_hv.toFixed(state.displayDecimals)} ${_Vp}${_iV}${_vv.toFixed(state.displayDecimals)}`;
      navigator.clipboard
        .writeText(text)
        .then(() => showToast(`Zkopírováno: ${text}`));
    });
    coordSpan.title = "Klikněte pro zkopírování souřadnic";

    ul.appendChild(li);
  });
}

// ── Panely ──
/** @param {string} id  ID kontejneru panelu */
export function togglePanel(id) {
  const el = document.getElementById(id);
  const computed = getComputedStyle(el).display;
  const opening = computed === "none";
  el.style.display = opening ? "block" : "none";
  // Update header arrow
  const header = el.previousElementSibling;
  if (header && header.classList.contains('panel-header')) {
    const textNode = header.childNodes;
    for (const n of textNode) {
      if (n.nodeType === 3) {
        n.textContent = n.textContent.replace(/[▾▸]/, opening ? '▾' : '▸');
        break;
      }
    }
  }
  if (opening && id === 'cncPanel' && bridge.runCncExport) {
    bridge.runCncExport();
  }
  if (opening && id === 'intPanel' && bridge.calculateAllIntersections) {
    bridge.calculateAllIntersections();
  }
}

// ── Vrstvy ──
/** Aktualizuje seznam vrstev v panelu. */
export function updateLayerList() {
  const ul = document.getElementById("layerList");
  if (!ul) return;
  ul.innerHTML = "";
  state.layers.forEach((layer) => {
    const li = document.createElement("li");
    li.className = "layer-row" + (layer.id === state.activeLayer ? " active" : "");

    // Color dot
    const colorDot = document.createElement("input");
    colorDot.type = "color";
    colorDot.className = "layer-color-dot";
    colorDot.value = layer.color;
    colorDot.title = "Změnit barvu vrstvy";
    colorDot.addEventListener("input", () => {
      layer.color = colorDot.value;
      renderAllDebounced();
    });

    // Name (inline editable)
    const nameSpan = document.createElement("span");
    nameSpan.className = "layer-name";
    nameSpan.textContent = layer.name;
    nameSpan.title = "Klikněte pro přejmenování";
    nameSpan.addEventListener("dblclick", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "layer-name-input";
      input.value = layer.name;
      nameSpan.replaceWith(input);
      input.focus();
      input.select();
      const finish = () => {
        const val = input.value.trim();
        if (val) layer.name = val;
        input.replaceWith(nameSpan);
        nameSpan.textContent = layer.name;
      };
      input.addEventListener("blur", finish);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") { input.value = layer.name; input.blur(); }
        e.stopPropagation();
      });
    });

    // Visibility toggle
    const visBtn = document.createElement("button");
    visBtn.className = "layer-icon-btn" + (layer.visible ? "" : " off");
    visBtn.innerHTML = layer.visible ? "👁" : "👁‍🗨";
    visBtn.title = layer.visible ? "Skrýt vrstvu" : "Zobrazit vrstvu";
    visBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      updateLayerList();
      renderAll();
    });

    // Lock toggle
    const lockBtn = document.createElement("button");
    lockBtn.className = "layer-icon-btn" + (layer.locked ? " on" : "");
    lockBtn.innerHTML = layer.locked ? "🔒" : "🔓";
    lockBtn.title = layer.locked ? "Odemknout vrstvu" : "Zamknout vrstvu";
    lockBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      layer.locked = !layer.locked;
      updateLayerList();
    });

    // Active radio
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "activeLayer";
    radio.className = "layer-radio";
    radio.checked = layer.id === state.activeLayer;
    radio.title = "Nastavit jako aktivní vrstvu";
    radio.addEventListener("change", () => {
      state.activeLayer = layer.id;
      updateLayerList();
    });

    li.appendChild(radio);
    li.appendChild(colorDot);
    li.appendChild(nameSpan);
    li.appendChild(visBtn);
    li.appendChild(lockBtn);
    ul.appendChild(li);
  });
}

// Layer panel buttons
document.getElementById("btnAddLayer").addEventListener("click", () => {
  const id = state.nextLayerId++;
  state.layers.push({ id, name: `Vrstva ${id}`, color: COLORS.text, visible: true, locked: false });
  updateLayerList();
  showToast(`Vrstva ${id} přidána`);
});

document.getElementById("btnDelLayer").addEventListener("click", () => {
  if (state.activeLayer === 0) {
    showToast("Nelze smazat vrstvu 0 (Kontura)");
    return;
  }
  const idx = state.layers.findIndex(l => l.id === state.activeLayer);
  if (idx === -1) return;
  const delId = state.activeLayer;
  state.layers.splice(idx, 1);
  // Move objects from deleted layer to layer 0
  state.objects.forEach(obj => { if (obj.layer === delId) obj.layer = 0; });
  state.activeLayer = 0;
  updateLayerList();
  updateObjectList();
  renderAll();
  showToast("Vrstva smazána, objekty přesunuty na vrstvu Kontura");
});

// ── Toolbar ──
document.querySelectorAll("[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    // Zavřít rozbalené sekce toolbaru, pokud je tlačítko uvnitř nich
    const inMid = btn.closest("#toolbarMid");
    const inMore = btn.closest("#toolbarMore");
    if (inMid || inMore) {
      const toolbarMid = document.getElementById("toolbarMid");
      const toolbarMore = document.getElementById("toolbarMore");
      const btnMid = document.getElementById("btnToolbarMid");
      const btnMore = document.getElementById("btnToolbarMore");
      if (toolbarMid) { toolbarMid.classList.remove("open"); if (btnMid) btnMid.textContent = "▾"; }
      if (toolbarMore) { toolbarMore.classList.remove("open"); if (btnMore) btnMore.textContent = "▾"; }
    }
    // Deaktivovat všechna tool-tlačítka – setTool() nebo bridge funkce je znovu aktivují
    document.querySelectorAll("[data-tool]").forEach(b => b.classList.remove("active"));
    // Měření: pokud je výběr → okamžitě změřit
    if (btn.dataset.tool === 'measure' && bridge.measureSelection && bridge.measureSelection()) return;
    // Kóta: pokud je výběr → okamžitě přidat kóty
    if (btn.dataset.tool === 'dimension' && bridge.dimensionFromSelection && bridge.dimensionFromSelection()) return;
    // Tečna: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'tangent' && bridge.tangentFromSelection && bridge.tangentFromSelection()) return;
    // Offset: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'offset' && bridge.offsetFromSelection && bridge.offsetFromSelection()) return;
    // Oříznutí: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'trim' && bridge.trimFromSelection && bridge.trimFromSelection()) return;
    // Prodloužení: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'extend' && bridge.extendFromSelection && bridge.extendFromSelection()) return;
    // Zaoblení: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'fillet' && bridge.filletFromSelection && bridge.filletFromSelection()) return;
    // Zkosení: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'chamfer' && bridge.chamferFromSelection && bridge.chamferFromSelection()) return;
    // Kolmost: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'perp' && bridge.perpFromSelection && bridge.perpFromSelection()) return;
    // Vodorovnost: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'horizontal' && bridge.horizontalFromSelection && bridge.horizontalFromSelection()) return;
    // Rovnoběžka: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'parallel' && bridge.parallelFromSelection && bridge.parallelFromSelection()) return;
    // Středová značka: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'centerMark' && bridge.centerMarkFromSelection && bridge.centerMarkFromSelection()) return;
    // Škálování: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'scale' && bridge.scaleFromSelection && bridge.scaleFromSelection()) return;
    // Zaoblení/Zkosení sdružené: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'filletChamfer' && bridge.filletChamferFromSelection && bridge.filletChamferFromSelection()) return;
    // Zrcadlení: pokud je výběr → okamžitě provést
    if (btn.dataset.tool === 'mirror' && bridge.mirrorFromSelection && bridge.mirrorFromSelection()) return;
    // Otočení: pokud je výběr → okamžitě přepnout na rotate s výběrem
    if (btn.dataset.tool === 'rotate' && bridge.rotateFromSelection && bridge.rotateFromSelection()) return;
    // Lineární pole: pokud je výběr → okamžitě otevřít dialog
    if (btn.dataset.tool === 'linearArray' && bridge.linearArrayFromSelection && bridge.linearArrayFromSelection()) return;
    // Kruhové pole: pokud je výběr → okamžitě otevřít dialog
    if (btn.dataset.tool === 'circularArray' && bridge.circularArrayFromSelection && bridge.circularArrayFromSelection()) return;
    // Kopírovat & umístit: pokud je výběr → přepnout do copyPlace módu
    if (btn.dataset.tool === 'copyPlace' && bridge.copyPlaceFromSelection && bridge.copyPlaceFromSelection()) return;
    setTool(btn.dataset.tool);
  });
});

/** @param {import('./types.js').ToolType} tool */
export function setTool(tool) {
  // Auto-uložit rozpracovanou konturu při přepnutí nástroje
  if (state.tool === 'polyline' && state.drawing && state.tempPoints.length >= 2) {
    const bulges = state._polylineBulges || [];
    while (bulges.length < state.tempPoints.length - 1) bulges.push(0);
    pushUndo();
    addObject({
      type: 'polyline',
      vertices: state.tempPoints.slice(),
      bulges: bulges.slice(0, state.tempPoints.length - 1),
      closed: false,
      name: `Kontura ${state.nextId}`,
    });
    showToast(`Kontura uložena (${state.tempPoints.length} bodů)`);
  }
  // Auto-dokončit rozpracované trasování profilu
  if (state.tool === 'profileTrace' && state.drawing && state.tempPoints.length >= 2) {
    if (bridge.finishProfileTrace) bridge.finishProfileTrace();
  }
  // Auto-dokončit řetězcové kótování při přepnutí nástroje
  if (state.tool === 'chainDimension' && state.drawing) {
    if (bridge.finishChainDimension) bridge.finishChainDimension();
  }
  // Pokud už jsme v select módu a klikne se znovu na Výběr → zrušit výběr
  if (tool === 'select' && state.tool === 'select') {
    state.selected = null;
    state.selectedSegment = null;
    state._selectedSegmentObjIdx = null;
    state.multiSelected.clear();
    state.multiSelectedSegments.clear();
    state.selectedPoint = null;
    if (bridge.updateProperties) bridge.updateProperties();
  }
  // Uložit multiSelected před resetem – move a rotate zachovává výběr
  const savedMulti = (tool === 'move' || tool === 'rotate') ? new Set(state.multiSelected) : null;
  const savedSelected = (tool === 'move' || tool === 'rotate') ? state.selected : null;
  state.tool = tool;
  resetDrawingState();
  if (savedMulti && savedMulti.size > 0) {
    state.multiSelected = savedMulti;
    state.selected = savedSelected;
  }
  if (state.dragging) {
    const obj = state.objects[state.dragObjIdx];
    if (obj && state.dragObjSnapshot) {
      Object.assign(obj, JSON.parse(state.dragObjSnapshot));
    }
    state.dragging = false;
    state.dragObjIdx = null;
  }
  drawCanvas.style.cursor = tool === "move" ? "move" : "crosshair";
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.tool === tool),
    );
  // Toggle btnDelete active state for deleteObj mode
  const btnDel = document.getElementById("btnDelete");
  if (btnDel) btnDel.classList.toggle("active", tool === "deleteObj");
  document.getElementById("statusTool").textContent =
    "Nástroj: " + toolLabel(tool);
  // Sync mobile measure button
  const mmBtn = document.getElementById("mobileMeasure");
  if (mmBtn) mmBtn.classList.toggle("active", tool === "measure");
  // Aktualizovat mobilní coord bar s novým nástrojem
  if (bridge.updateMobileCoords) {
    bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
  }
  resetHint();
  renderAll();
}

// ── Hinty ──
/** @param {string} text */
export function setHint(text) {
  document.getElementById("statusHint").textContent = text;
}

/** Obnoví nápovědu pro aktuální nástroj. */
export function resetHint() {
  const hints = {
    select: "Klikněte pro výběr (další klik = přidat, znovu = odebrat)",
    move: "Klikněte na objekt pro přesun",
    point: "Klikněte pro umístění bodu",
    line: "Klikněte na počáteční bod úsečky",
    constr: "Klikněte na počáteční bod konstrukční čáry",
    circle: "Klikněte na střed kružnice",
    arc: "Klikněte na střed oblouku",
    rect: "Klikněte na první roh obdélníku",    polyline: "Klepněte na první bod kontury",    measure: "Klepněte na objekt pro info, nebo na prázdné místo pro měření",
    tangent: "Klepněte na bod nebo na první kružnici",
    offset: "Klepněte na objekt pro offset",
    snapPoint: "Klepněte na koncový bod objektu pro přichycení",
    horizontal: "Klepněte na úsečku/segment – vyrovná se vodorovně",
    perp: "Klepněte na úsečku/segment – vyrovná se svisle (kolmo)",
    parallel: "Klepněte na úsečku kterou chcete otočit → pak na referenční úsečku pro rovnoběžnost",
    text: "Klepněte na místo, kam chcete umístit textovou anotaci",
    deleteObj: "Klepněte na objekt pro smazání",
    anchor: "Klepněte na snap bod pro zakotvení/uvolnění",
    break: "Klepněte na objekt – rozdělí se v daném místě",
    centerMark: "Klepněte na kružnici/oblouk – přepne středovou značku",
    scale: "Klepněte na objekt – otevře dialog změny měřítka",
    filletChamfer: "Klepněte na první úsečku – zaoblení nebo zkosení",
    mirror: "Vyberte objekty pro zrcadlení (Shift+M)",
    boolean: "Klikněte na první uzavřenou konturu",
    circularArray: "Klepněte na objekt pro kruhové pole",
    profileTrace: "Klepněte na první bod kontury (R = radius, Enter = dokončit)",
  };
  setHint(hints[state.tool] || "");
}

// ── Snap k bodům tlačítko ──
/** Aktualizuje stav tlačítka snap k bodům. */
export function updateSnapPtsBtn() {
  const btn = document.getElementById("btnSnapPts");
  if (!btn) return;
  const ind = btn.querySelector(".snap-ind");
  ind.className =
    "snap-ind " + (state.snapToPoints ? "snap-on" : "snap-off");
  // Sync mobile snap button
  const mobileSnap = document.getElementById("mobileSnap");
  if (mobileSnap) mobileSnap.classList.toggle("snap-active", state.snapToPoints);
}

const btnSnapPts = document.getElementById("btnSnapPts");
if (btnSnapPts) {
  btnSnapPts.addEventListener("click", () => {
    state.snapToPoints = !state.snapToPoints;
    updateSnapPtsBtn();
    renderAll();
    showToast(state.snapToPoints ? "Snap k bodům: ON" : "Snap k bodům: OFF");
  });
}

// ── Grid Snap tlačítko ──
/** Aktualizuje stav tlačítka snap k mřížce. */
export function updateSnapGridBtn() {
  document.getElementById("btnSnapGrid")?.classList.toggle("active", state.snapToGrid);
}

document.getElementById("btnSnapGrid")?.addEventListener("click", () => {
  state.snapToGrid = !state.snapToGrid;
  updateSnapGridBtn();
  document.getElementById("indGrid")?.classList.toggle("active", state.snapToGrid);
  renderAll();
  showToast(state.snapToGrid ? `Snap na mřížku: ON (${state.gridSize})` : "Snap na mřížku: OFF");
});

document.getElementById("btnSnapGrid")?.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  showGridSizeDialog();
});

// ── Angle Snap tlačítko ──
/** Aktualizuje stav tlačítka úhlového snapu. */
export function updateAngleSnapBtn() {
  document.getElementById("btnAngleSnap")?.classList.toggle("active", state.angleSnap);
}

document.getElementById("btnAngleSnap")?.addEventListener("click", () => {
  state.angleSnap = !state.angleSnap;
  updateAngleSnapBtn();
  document.getElementById("indAngle")?.classList.toggle("active", state.angleSnap);
  renderAll();
  showToast(state.angleSnap ? `Úhlový snap: ON (${state.angleSnapStep}°)` : "Úhlový snap: OFF");
});

document.getElementById("btnAngleSnap")?.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  showAngleSnapDialog();
});

// ── Kóty tlačítko (3 stavy: all → intersections → none) ──
/** Aktualizuje stav tlačítka kót. */
export function updateDimsBtn() {
  const btn = document.getElementById("btnDims");
  if (!btn) return;
  btn.textContent = '📐 Kóty';
  btn.classList.remove("active");
  btn.style.background = '';
  btn.style.color = '';
  btn.style.borderColor = '';
  if (state.showDimensions === 'all') {
    btn.classList.add("active");
  } else if (state.showDimensions === 'intersections') {
    btn.style.background = COLORS.dimension;
    btn.style.color = COLORS.bgDark;
    btn.style.borderColor = COLORS.dimension;
  }
  // 'none' → výchozí neaktivní vzhled
}

document.getElementById("btnDims")?.addEventListener("click", () => {
  // Cyklus: all → intersections → none → all
  const cycle = { all: 'intersections', intersections: 'none', none: 'all' };
  state.showDimensions = cycle[state.showDimensions] || 'all';
  const labels = { all: 'Kóty: vše', intersections: 'Kóty: pouze průsečíky', none: 'Kóty: skryté' };
  showToast(labels[state.showDimensions]);
  updateDimsBtn();
  document.getElementById("indDims")?.classList.toggle("active", state.showDimensions !== 'none');
  renderAll();
});

// ── Smazat kóty tlačítko ──
document.getElementById("btnDeleteDims").addEventListener("click", () => {
  const dimCount = state.objects.filter(o => o.isDimension || o.isCoordLabel).length;
  if (dimCount === 0) {
    showToast("Žádné kóty ke smazání");
    return;
  }
  pushUndo();
  state.objects = state.objects.filter(o => !o.isDimension && !o.isCoordLabel);
  state.selected = null;
  state.multiSelected.clear();
  state.selectedPoint = null;
  showToast(`Smazáno ${dimCount} kót`);
  if (bridge.updateObjectList) bridge.updateObjectList();
  renderAll();
});

// ── Auto-detekce R, zkosení, zápichů ──
document.getElementById("btnAutoDetect")?.addEventListener("click", () => {
  // Zavřít toolbarové panely jako ostatní tool-btn
  const toolbarMid = document.getElementById("toolbarMid");
  const toolbarMore = document.getElementById("toolbarMore");
  const btnMid = document.getElementById("btnToolbarMid");
  const btnMore = document.getElementById("btnToolbarMore");
  if (toolbarMid) { toolbarMid.classList.remove("open"); if (btnMid) btnMid.textContent = "▾"; }
  if (toolbarMore) { toolbarMore.classList.remove("open"); if (btnMore) btnMore.textContent = "▾"; }
  if (bridge.autoDetectFeatures) bridge.autoDetectFeatures();
});

// ── Coord Mode tlačítko (ABS/INC) ──
/** Aktualizuje zobrazení módu souřadnic (ABS/INC). */
export function updateCoordModeBtn() {
  const btn = document.getElementById("btnCoordMode");
  if (btn) {
    const isInc = state.coordMode === 'inc';
    const label = isInc ? 'INC' : 'ABS';
    btn.textContent = label;
    btn.classList.toggle('active', isInc);
    if (isInc) {
      btn.style.background = COLORS.selected;
      btn.style.color = COLORS.bgDark;
    } else {
      btn.style.background = '';
      btn.style.color = '';
    }
  }
  const ind = document.getElementById("indCoordMode");
  if (ind) {
    ind.textContent = state.coordMode === 'inc' ? 'INC' : 'ABS';
    ind.classList.toggle('alt', state.coordMode === 'inc');
  }
}

/** Přepne mód souřadnic ABS ↔ INC. */
export function toggleCoordMode() {
  state.coordMode = state.coordMode === 'abs' ? 'inc' : 'abs';
  updateCoordModeBtn();
  renderAll();
  if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
  showToast(state.coordMode === 'inc' ? 'Inkrementální souřadnice (INC)' : 'Absolutní souřadnice (ABS)');
}

document.getElementById("btnCoordMode")?.addEventListener("click", toggleCoordMode);

// ── X Display Mode tlačítko (Poloměr/Průměr) ──
/** Aktualizuje zobrazení režimu osy X (R/⌀). */
export function updateXDisplayBtn() {
  const btn = document.getElementById("btnXDisplay");
  if (btn) {
    const isDiam = state.xDisplayMode === 'diameter';
    btn.textContent = isDiam ? '⌀' : 'R';
    btn.classList.toggle('active', isDiam);
    if (isDiam) {
      btn.style.background = COLORS.delete;
      btn.style.color = COLORS.bgDark;
    } else {
      btn.style.background = '';
      btn.style.color = '';
    }
  }
  const ind = document.getElementById("indXDisplay");
  if (ind) {
    ind.textContent = state.xDisplayMode === 'diameter' ? '⌀' : 'R';
    ind.classList.toggle('alt', state.xDisplayMode === 'diameter');
  }
}

/** Přepne režim osy X: Poloměr ↔ Průměr. */
export function toggleXDisplay() {
  state.xDisplayMode = state.xDisplayMode === 'radius' ? 'diameter' : 'radius';
  updateXDisplayBtn();
  renderAll();
  if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
  showToast(state.xDisplayMode === 'diameter' ? 'Osa X: Průměr (⌀)' : 'Osa X: Poloměr (R)');
}

document.getElementById("btnXDisplay")?.addEventListener("click", toggleXDisplay);

// ── Machine Type tlačítko (Soustruh/Karusel) ──
/** Aktualizuje zobrazení typu stroje. */
export function updateMachineTypeBtn() {
  const btn = document.getElementById("btnMachineType");
  if (btn) {
    const isKarusel = state.machineType === 'karusel';
    btn.textContent = isKarusel ? '⚙ Karusel' : '⚙ Soustruh';
    btn.classList.toggle('active', isKarusel);
    if (isKarusel) {
      btn.style.background = COLORS.dimension;
      btn.style.color = COLORS.bgDark;
    } else {
      btn.style.background = '';
      btn.style.color = '';
    }
  }
  const ind = document.getElementById("indMachine");
  if (ind) {
    ind.textContent = state.machineType === 'karusel' ? 'KAR' : 'SOU';
    ind.classList.toggle('alt', state.machineType === 'karusel');
  }
}

/** Přepne typ stroje Soustruh ↔ Karusel (prohodí osy). */
export function toggleMachineType() {
  state.machineType = state.machineType === 'soustruh' ? 'karusel' : 'soustruh';
  updateMachineTypeBtn();
  renderAll();
  if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
  showToast(state.machineType === 'karusel'
    ? 'Karusel – X vodorovně, Z svisle'
    : 'Soustruh – Z vodorovně, X svisle');
}

document.getElementById("btnMachineType")?.addEventListener("click", toggleMachineType);

// ── Nul. bod tlačítko – nastavení/zrušení nulového bodu ──

/** Aktualizuje indikátor nulového bodu v levém panelu a styl tlačítka. */
export function updateNullPointUI() {
  const btn = document.getElementById("btnSetRef");
  const indicator = document.getElementById("nullPointIndicator");
  const coordsSpan = document.getElementById("nullPointCoords");
  if (state.nullPointActive) {
    btn.classList.add('null-active');
    const isK = state.machineType === 'karusel';
    let lbl = isK
      ? `X: ${state.incReference.x.toFixed(3)}  Z: ${state.incReference.y.toFixed(3)}`
      : `Z: ${state.incReference.x.toFixed(3)}  X: ${state.incReference.y.toFixed(3)}`;
    if (state.nullPointAngle !== 0) lbl += `  ∠${state.nullPointAngle}°`;
    coordsSpan.textContent = lbl;
    indicator.hidden = false;
  } else {
    btn.classList.remove('null-active');
    coordsSpan.textContent = '';
    indicator.hidden = true;
  }
}

/** Zruší nulový bod a vrátí se na ABS. */
export function clearNullPoint() {
  state.incReference = { x: 0, y: 0 };
  state.nullPointActive = false;
  state.nullPointAngle = 0;
  state.coordMode = 'abs';
  updateCoordModeBtn();
  updateNullPointUI();
  renderAll();
  showToast('Nulový bod zrušen – ABS režim');
}

/** Aplikuje nový nulový bod. */
function applyNullPoint(wx, wy, angle) {
  state.incReference = { x: wx, y: wy };
  state.nullPointAngle = angle || 0;
  state.nullPointActive = true;
  if (state.coordMode !== 'inc') {
    state.coordMode = 'inc';
    updateCoordModeBtn();
  }
  updateNullPointUI();
  renderAll();
  showToast(`Nulový bod: ${fmtStatusCoords(wx, wy)}${angle ? ' ∠' + angle + '°' : ''}`);
}

/** Zobrazí dialog pro nastavení nulového bodu. */
function showNullPointDialog() {
  const isK = state.machineType === 'karusel';
  const hLabel = isK ? 'X' : 'Z';
  const vLabel = isK ? 'Z' : 'X';

  const overlay = makeInputOverlay(`
    <div class="input-dialog" style="min-width:360px">
      <h3>📍 Nastavení nulového bodu</h3>
      <p style="font-size:11px;color:#9399b2;margin-bottom:10px">Zadejte souřadnice nebo vyberte bod z výkresu.</p>
      <div class="input-row">
        <div><label>${hLabel}:</label><input type="text" id="nullPtH" value="0"></div>
        <div><label>${vLabel}:</label><input type="text" id="nullPtV" value="0"></div>
        <div class="pick-col"><button type="button" class="pick-btn" id="nullPtPick" title="Vybrat z výkresu">🎯</button></div>
      </div>
      <div class="input-row" style="margin-top:4px">
        <div><label>Natočení (°):</label><input type="text" id="nullPtAngle" value="0"></div>
      </div>
      <div style="font-size:10px;color:#585b70;margin:6px 0;font-style:italic">💡 Natočení otáčí osy nulového bodu (0° = bez natočení)</div>
      <div class="btn-row">
        <button class="btn-cancel" id="nullPtCancel">Zrušit</button>
        <button class="btn-ok" id="nullPtOk">Potvrdit</button>
      </div>
    </div>`);

  const inputH = overlay.querySelector('#nullPtH');
  const inputV = overlay.querySelector('#nullPtV');
  const inputAngle = overlay.querySelector('#nullPtAngle');

  // Auto-focus
  setTimeout(() => inputH.focus(), 50);

  // -- Pick from map (stejný vzor jako v číselném zadání) --
  function pickFromMap(callback) {
    overlay.style.display = "none";
    showToast("Klikněte na výkres pro výběr bodu...");

    function cleanup() {
      drawCanvas.removeEventListener("click", onPick);
      drawCanvas.removeEventListener("touchend", onTouch);
    }

    function onPick(e) {
      const rect = drawCanvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      let [wx, wy] = screenToWorld(sx, sy);
      if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
      cleanup();
      if (!document.body.contains(overlay)) return; // overlay removed by Escape
      overlay.style.display = "flex";
      callback(wx, wy);
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
        if (!document.body.contains(overlay)) return; // overlay removed by Escape
        overlay.style.display = "flex";
        e.preventDefault();
        callback(wx, wy);
      }
    }

    drawCanvas.addEventListener("click", onPick);
    drawCanvas.addEventListener("touchend", onTouch);
  }

  // Pick button
  overlay.querySelector('#nullPtPick').addEventListener('click', () => {
    pickFromMap((wx, wy) => {
      inputH.value = wx.toFixed(3);
      inputV.value = wy.toFixed(3);
    });
  });

  // Potvrdit ručním zadáním
  overlay.querySelector('#nullPtOk').addEventListener('click', () => {
    const hVal = safeEvalMath(inputH.value);
    const vVal = safeEvalMath(inputV.value);
    const aVal = safeEvalMath(inputAngle.value);
    if (hVal == null || vVal == null || isNaN(hVal) || isNaN(vVal)) {
      showToast('Neplatné souřadnice');
      return;
    }
    const angle = (aVal != null && !isNaN(aVal)) ? aVal : 0;
    overlay.remove();
    applyNullPoint(hVal, vVal, angle);
  });

  // Enter v inputech
  function onEnter(e) {
    if (e.key === 'Enter') overlay.querySelector('#nullPtOk').click();
  }
  inputH.addEventListener('keydown', onEnter);
  inputV.addEventListener('keydown', onEnter);
  inputAngle.addEventListener('keydown', onEnter);

  // Zrušit
  overlay.querySelector('#nullPtCancel').addEventListener('click', () => overlay.remove());
}

document.getElementById("btnSetRef").addEventListener("click", () => {
  // Druhé kliknutí na aktivní nul. bod → zrušit
  if (state.nullPointActive) {
    clearNullPoint();
    return;
  }
  showNullPointDialog();
});

// Clear button v panelu
document.getElementById("btnClearNullPoint").addEventListener("click", clearNullPoint);

// ── Undo/Redo tlačítka ──
document.getElementById("btnUndo").addEventListener("click", undo);
document.getElementById("btnRedo").addEventListener("click", redo);

// ── Průsečíky (automaticky při rozbalení panelu) ──
const _btnCalcInt = document.getElementById("btnCalcInt");
if (_btnCalcInt) _btnCalcInt.addEventListener("click", () => { if (bridge.calculateAllIntersections) bridge.calculateAllIntersections(); });

// ── Smazat vše ──
document.getElementById("btnClearAll").addEventListener("click", async () => {
  if (state.objects.length === 0) return;
  if (confirm("Opravdu smazat všechny objekty?")) {
    // Uložit do historie smazaných výkresů (max 10)
    try {
      const history = (await getMeta('deletedHistory')) || [];
      const snapshot = {
        id: 'del_' + Date.now(),
        name: state.projectName || 'Bez názvu',
        date: new Date().toLocaleString('cs-CZ'),
        data: {
          objects: JSON.parse(JSON.stringify(state.objects)),
          nextId: state.nextId,
          layers: JSON.parse(JSON.stringify(state.layers)),
          activeLayer: state.activeLayer,
          nextLayerId: state.nextLayerId,
        },
      };
      history.unshift(snapshot);
      if (history.length > 10) history.length = 10;
      await setMeta('deletedHistory', history);
    } catch (e) { /* ignore storage errors */ }

    pushUndo();
    state.objects = [];
    state.selected = null;
    state.selectedPoint = null;
    state.intersections = [];
    state.nextId = 1;
    updateObjectList();
    updateProperties();
    updateIntersectionList();
    document.getElementById("cncOutput").textContent =
      "Klikněte 📋 CNC Export";
    renderAll();
  }
});

// ── Historie smazaných výkresů ──
document.getElementById("btnHistory").addEventListener("click", async () => {
  let history = (await getMeta('deletedHistory')) || [];
  if (history.length === 0) {
    showToast("Žádné smazané výkresy v historii");
    return;
  }

  function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function buildHistoryHTML(hist) {
    return hist.map((h, i) => {
      const objs = h.data ? (h.data.objects || []) : (h.objects || []);
      const name = h.name || '(bez názvu)';
      return `<li class="project-item" data-hidx="${i}">
        <div class="project-info">
          <div class="project-name">${_esc(name)}</div>
          <div class="project-meta">${_esc(h.date)} · ${objs.length} objektů</div>
        </div>
        <div class="project-actions">
          <button class="project-action-btn" data-act="restore" title="Obnovit">♻️</button>
          <button class="project-action-btn" data-act="rename" title="Přejmenovat">✏️</button>
          <button class="project-action-btn" data-act="tolib" title="Uložit do knihovny">📚</button>
          <button class="project-action-btn del" data-act="delete" title="Smazat z historie">🗑</button>
        </div>
      </li>`;
    }).join('');
  }

  const bodyHTML = `
    <div style="max-height:60vh;overflow-y:auto">
      <p style="margin:0 0 8px;font-size:13px;color:var(--ctp-subtext0)">Posledních ${history.length} smazaných výkresů:</p>
      <ul class="project-list" id="historyList">${buildHistoryHTML(history)}</ul>
    </div>`;
  const overlay = makeOverlay("history", "🕓 Historie smazaných výkresů", bodyHTML);

  function attachHistoryListeners() {
    overlay.querySelectorAll('#historyList .project-item').forEach(item => {
      const idx = parseInt(item.dataset.hidx);
      item.querySelectorAll('.project-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const act = btn.dataset.act;
          const entry = history[idx];
          if (!entry) return;

          if (act === 'restore') {
            if (state.objects.length > 0 && !confirm("Nahradit aktuální výkres obnoveným?")) return;
            pushUndo();
            if (entry.data) {
              // Nový formát – plná data projektu
              state.objects = entry.data.objects || [];
              state.nextId = entry.data.nextId || 1;
              if (entry.data.layers) {
                state.layers = entry.data.layers;
                state.activeLayer = entry.data.activeLayer || 0;
                state.nextLayerId = entry.data.nextLayerId || (state.layers.length > 0 ? Math.max(...state.layers.map(l => l.id)) + 1 : 1);
              }
            } else {
              // Starý formát – jen objects + nextId
              state.objects = entry.objects || [];
              state.nextId = entry.nextId || (Math.max(0, ...state.objects.map(o => o.id || 0)) + 1);
            }
            if (entry.name && entry.name !== '(bez názvu)') {
              state.projectName = entry.name;
              updateStatusProject();
            }
            state.selected = null;
            state.selectedPoint = null;
            state.intersections = [];
            updateObjectList();
            updateProperties();
            updateIntersectionList();
            if (bridge.calculateAllIntersections) bridge.calculateAllIntersections();
            renderAll();
            overlay.remove();
            showToast(`Výkres "${entry.name || entry.date}" obnoven ✓`);
          } else if (act === 'rename') {
            const newName = prompt('Nový název:', entry.name || '');
            if (newName && newName.trim()) {
              history[idx].name = newName.trim();
              await setMeta('deletedHistory', history);
              overlay.querySelector('#historyList').innerHTML = buildHistoryHTML(history);
              attachHistoryListeners();
            }
          } else if (act === 'tolib') {
            const libName = prompt('Název v knihovně:', entry.name || `Výkres z ${entry.date}`);
            if (libName && libName.trim()) {
              const library = (await getMeta('library')) || [];
              const objs = entry.data ? (entry.data.objects || []) : (entry.objects || []);
              library.unshift({
                id: 'lib_' + Date.now(),
                name: libName.trim(),
                date: new Date().toLocaleString('cs-CZ'),
                objectCount: objs.length,
                data: entry.data || { objects: entry.objects, nextId: entry.nextId },
              });
              await setMeta('library', library);
              showToast(`Uloženo do knihovny: "${libName.trim()}"`);
            }
          } else if (act === 'delete') {
            if (confirm('Smazat tento záznam z historie?')) {
              history.splice(idx, 1);
              await setMeta('deletedHistory', history);
              if (history.length === 0) {
                overlay.remove();
                showToast('Historie je prázdná');
              } else {
                overlay.querySelector('#historyList').innerHTML = buildHistoryHTML(history);
                attachHistoryListeners();
              }
            }
          }
        });
      });
    });
  }
  attachHistoryListeners();
});

// ── Kalkulačka – clipboard schránka ──
let _calcClipboardValue = null;
export function getCalcClipboardValue() { return _calcClipboardValue; }
export function setCalcClipboardValue(v) {
  _calcClipboardValue = v;
  const btn = document.getElementById("canvasClipBtn");
  if (btn) {
    btn.textContent = v != null ? v : "—";
    btn.title = v != null ? `Schránka: ${v} (klik = vložit)` : "Schránka kalkulačky (prázdná)";
  }
}

// ── Kalkulačka – popup ──
/** Otevře vestavnou kalkulačku. */
export function openCalculator() {
  const bodyHTML = `
        <div class="calc-hist-header">
          <button class="calc-hist-clear-btn" title="Vymazat historii">🗑</button>
          <span class="calc-hist-title">Historie</span>
          <button class="calc-close-inner-btn" title="Zavřít">✕</button>
        </div>
        <div class="calc-history" id="calcHistory"></div>
        <div class="calc-expr" id="calcExpr">&nbsp;</div>
        <input type="text" id="calcDisplay" placeholder="0">
        <div class="calc-buttons">
          <div class="calc-fn-row">
            <button class="calc-btn calc-fn" data-val="sqrt">√</button>
            <button class="calc-btn calc-fn" data-val="pi">π</button>
            <button class="calc-btn calc-fn" data-val="pow">x²</button>
            <button class="calc-btn calc-fn" data-val="%">%</button>
          </div>
          <div class="calc-fn-row">
            <button class="calc-btn calc-fn" data-val="(">(</button>
            <button class="calc-btn calc-fn" data-val=")">)</button>
            <button class="calc-btn calc-fn" data-val="ans">ANS</button>
            <div class="calc-trig-wrap">
              <button class="calc-btn calc-fn calc-trig-toggle" data-val="_trig">f(x) ▾</button>
              <div class="calc-trig-dropdown" id="calcTrigDropdown">
                <button class="calc-btn calc-fn" data-val="sin">sin</button>
                <button class="calc-btn calc-fn" data-val="cos">cos</button>
                <button class="calc-btn calc-fn" data-val="tan">tan</button>
                <button class="calc-btn calc-fn" data-val="asin">asin</button>
                <button class="calc-btn calc-fn" data-val="acos">acos</button>
                <button class="calc-btn calc-fn" data-val="atan">atan</button>
              </div>
            </div>
          </div>
          <div class="calc-fn-row calc-fn-row-3">
            <button class="calc-btn calc-clear" data-val="C">C</button>
            <button class="calc-btn calc-clear" data-val="CE">←</button>
            <button class="calc-btn calc-copy" data-val="copy">📋</button>
            <button class="calc-btn calc-paste" data-val="paste" title="Vložit výsledek na pozici kurzoru">⤓</button>
          </div>
          <div class="calc-num-grid">
            <button class="calc-btn" data-val="7">7</button>
            <button class="calc-btn" data-val="8">8</button>
            <button class="calc-btn" data-val="9">9</button>
            <button class="calc-btn calc-op" data-val="/">÷</button>
            <button class="calc-btn" data-val="4">4</button>
            <button class="calc-btn" data-val="5">5</button>
            <button class="calc-btn" data-val="6">6</button>
            <button class="calc-btn calc-op" data-val="*">×</button>
            <button class="calc-btn" data-val="1">1</button>
            <button class="calc-btn" data-val="2">2</button>
            <button class="calc-btn" data-val="3">3</button>
            <button class="calc-btn calc-op" data-val="-">−</button>
            <button class="calc-btn" data-val=".">.</button>
            <button class="calc-btn" data-val="0">0</button>
            <button class="calc-btn calc-eq" data-val="=">=</button>
            <button class="calc-btn calc-op" data-val="+">+</button>
          </div>
        </div>`;
  const overlay = makeOverlay("calc", "🔢 Kalkulačka", bodyHTML, "calc-window");
  if (!overlay) return;

  // Make calculator non-blocking: no fullscreen backdrop, draggable, stays above other dialogs
  overlay.classList.add("calc-overlay-float");

  // Hide default titlebar – we use compact history header instead
  const defaultTitlebar = overlay.querySelector(".calc-titlebar");
  defaultTitlebar.style.display = "none";

  // Wire close & clear history buttons in the compact header
  const calcWin = overlay.querySelector(".calc-window");
  overlay.querySelector(".calc-close-inner-btn").addEventListener("click", () => overlay.remove());
  overlay.querySelector(".calc-hist-clear-btn").addEventListener("click", () => {
    history = [];
    saveHistory();
    renderHistory();
    showToast("Historie vymazána");
  });

  // ── Drag via history header ──
  const dragHandle = overlay.querySelector(".calc-hist-header");
  let _dragOfs = null;
  dragHandle.style.cursor = "move";
  dragHandle.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    const rect = calcWin.getBoundingClientRect();
    _dragOfs = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  });
  const onMouseMove = (e) => {
    if (!_dragOfs) return;
    calcWin.style.left = (e.clientX - _dragOfs.x) + "px";
    calcWin.style.top = (e.clientY - _dragOfs.y) + "px";
  };
  const onMouseUp = () => { _dragOfs = null; };
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  // Touch drag
  dragHandle.addEventListener("touchstart", (e) => {
    if (e.target.closest("button")) return;
    const t = e.touches[0];
    const rect = calcWin.getBoundingClientRect();
    _dragOfs = { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }, { passive: true });
  const onTouchMove = (e) => {
    if (!_dragOfs) return;
    const t = e.touches[0];
    calcWin.style.left = (t.clientX - _dragOfs.x) + "px";
    calcWin.style.top = (t.clientY - _dragOfs.y) + "px";
  };
  const onTouchEnd = () => { _dragOfs = null; };
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd);
  // Cleanup drag listeners when calculator is removed
  const dragCleanup = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("touchend", onTouchEnd);
  };
  const origRemove = overlay.remove.bind(overlay);
  overlay.remove = () => { dragCleanup(); origRemove(); };

  const display = overlay.querySelector("#calcDisplay");
  const exprDisplay = overlay.querySelector("#calcExpr");
  const historyEl = overlay.querySelector("#calcHistory");
  let expr = "";
  let lastAnswer = 0;
  let history = [];
  getMeta('calcHistory').then(h => {
    if (Array.isArray(h)) { history = h; renderHistory(); }
  });

  function updateDisplay(text) { display.value = text || "0"; }
  function updateExprDisplay(text) { exprDisplay.textContent = text || "\u00a0"; }

  function saveHistory() {
    setMeta('calcHistory', history);
  }

  function addHistory(expression, result) {
    history.push({ expr: expression, result });
    if (history.length > 50) history.shift();
    saveHistory();
    renderHistory();
  }

  function removeHistoryItem(index) {
    history.splice(index, 1);
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    historyEl.innerHTML = "";
    history.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "calc-history-item";
      const fullExpr = document.createElement("span");
      fullExpr.className = "calc-hist-full";
      fullExpr.textContent = item.expr + " = " + item.result;
      row.appendChild(fullExpr);
      const copyBtn = document.createElement("button");
      copyBtn.className = "calc-hist-copy";
      copyBtn.textContent = "📋";
      copyBtn.title = "Kopírovat výsledek";
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const v = String(item.result);
        navigator.clipboard.writeText(v).then(() => showToast("Zkopírováno: " + v));
        setCalcClipboardValue(v);
      });
      row.appendChild(copyBtn);
      const delBtn = document.createElement("button");
      delBtn.className = "calc-hist-del";
      delBtn.textContent = "✕";
      delBtn.title = "Smazat";
      delBtn.addEventListener("click", (e) => { e.stopPropagation(); removeHistoryItem(i); });
      row.appendChild(delBtn);
      row.addEventListener("click", () => {
        expr = String(item.result);
        updateDisplay(expr);
        updateExprDisplay("← " + item.result);
      });
      historyEl.appendChild(row);
    });
    // Auto-scroll dolů k nejnovějšímu
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  // Načíst historii při otevření
  renderHistory();

  function formatExpr(e) {
    return e.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−");
  }

  function safeEval(expression) {
    let e = expression
      .replace(/π/g, String(Math.PI))
      .replace(/×/g, "*").replace(/−/g, "-").replace(/÷/g, "/");
    if (!/^[\d+\-*/().eE\s%]*$/.test(e)) return null;
    // Handle % as /100
    e = e.replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
    try {
      const r = _parseMathExpr(e);
      return (typeof r === "number" && isFinite(r)) ? r : null;
    } catch (_) { return null; }
  }

  function handleFn(fn) {
    const cur = safeEval(expr);
    if (cur === null) return;
    let r;
    const fnExpr = fn + "(" + formatExpr(expr) + ")";
    switch (fn) {
      case "sqrt": r = Math.sqrt(cur); break;
      case "sin":  r = Math.sin(cur * Math.PI / 180); break;
      case "cos":  r = Math.cos(cur * Math.PI / 180); break;
      case "tan":  r = Math.tan(cur * Math.PI / 180); break;
      case "atan": r = Math.atan(cur) * 180 / Math.PI; break;
      case "asin": r = (cur >= -1 && cur <= 1) ? Math.asin(cur) * 180 / Math.PI : NaN; break;
      case "acos": r = (cur >= -1 && cur <= 1) ? Math.acos(cur) * 180 / Math.PI : NaN; break;
      case "pow":  r = cur * cur; break;
      default: return;
    }
    if (typeof r !== "number" || !isFinite(r)) { updateDisplay("Chyba"); expr = ""; return; }
    const result = parseFloat(r.toFixed(8));
    addHistory(fnExpr, result);
    updateExprDisplay(fnExpr + " = " + result);
    lastAnswer = result;
    expr = String(result);
    updateDisplay(expr);
  }

  function doEval() {
    const displayExpr = formatExpr(expr);
    const r = safeEval(expr);
    if (r === null) { updateDisplay("Chyba"); return; }
    const result = parseFloat(r.toFixed(8));
    addHistory(displayExpr, result);
    lastAnswer = result;
    // Zobrazit celý zápis: výraz = výsledek
    updateExprDisplay(displayExpr + " = " + result);
    expr = String(result);
    updateDisplay(expr);
  }

  overlay.querySelectorAll(".calc-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = btn.dataset.val;
      switch (val) {
        case "C":    expr = ""; updateDisplay("0"); updateExprDisplay(""); break;
        case "CE":   expr = expr.slice(0, -1); updateDisplay(expr); break;
        case "=":    doEval(); break;
        case "copy": {
          const v = display.value;
          navigator.clipboard.writeText(v).then(() => showToast("Zkopírováno: " + v));
          setCalcClipboardValue(v);
          break;
        }
        case "paste": {
          const v = display.value;
          if (v === null || v === undefined || v === "") { showToast("Není co vložit"); break; }
          const target = _lastFocusedInput;
          if (target && document.body.contains(target) && !target.disabled && !target.readOnly
              && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
              && !overlay.contains(target)) {
            const start = target.selectionStart || 0;
            const end = target.selectionEnd || 0;
            const before = target.value.substring(0, start);
            const after = target.value.substring(end);
            target.value = before + v + after;
            target.selectionStart = target.selectionEnd = start + String(v).length;
            target.dispatchEvent(new Event("input", { bubbles: true }));
            target.focus();
            showToast("Vloženo: " + v);
            overlay.remove();
          } else {
            setCalcClipboardValue(v);
            navigator.clipboard.writeText(v).then(() => showToast("Zkopírováno do schránky: " + v));
          }
          break;
        }
        case "_trig": {
          const dd = overlay.querySelector("#calcTrigDropdown");
          dd.classList.toggle("open");
          break;
        }
        case "pi":    expr += String(Math.PI); updateDisplay(expr); break;
        case "ans":   expr += String(lastAnswer); updateDisplay(expr); break;
        case "%":     expr += "%"; updateDisplay(expr); break;
        case "sqrt": case "sin": case "cos": case "tan": case "atan": case "asin": case "acos": case "pow":
          handleFn(val);
          // Close trig dropdown after selecting function
          { const dd = overlay.querySelector("#calcTrigDropdown"); if (dd) dd.classList.remove("open"); }
          break;
        default: expr += val; updateDisplay(expr);
      }
    });
  });

  // Keyboard input
  display.removeAttribute("readonly");
  display.addEventListener("input", () => {
    expr = display.value;
  });
  display.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); doEval(); }
    if (e.key === "Escape") { expr = ""; updateDisplay("0"); updateExprDisplay(""); }
    e.stopPropagation();
  });
}

// ── Trigonometrie – popup ──
function openTrigCalc() {
  const bodyHTML = `
        <div class="trig-svg-wrap">
          <svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg">
            <!-- Triangle -->
            <polygon points="40,190 260,190 260,40" fill="none" stroke="${COLORS.border}" stroke-width="2"/>
            <!-- Right angle marker -->
            <polyline points="240,190 240,170 260,170" fill="none" stroke="${COLORS.textMuted}" stroke-width="1.5"/>
            <!-- Side labels -->
            <text x="150" y="210" text-anchor="middle" fill="${COLORS.dimension}" font-size="16" font-weight="bold" font-family="Consolas">b</text>
            <text x="275" y="120" text-anchor="start" fill="${COLORS.delete}" font-size="16" font-weight="bold" font-family="Consolas">a</text>
            <text x="140" y="105" text-anchor="end" fill="${COLORS.primary}" font-size="16" font-weight="bold" font-family="Consolas">c</text>
            <!-- Angle arcs -->
            <path d="M 70,190 A 30,30 0 0,0 56,170" fill="none" stroke="${COLORS.delete}" stroke-width="1.5"/>
            <text x="78" y="178" fill="${COLORS.delete}" font-size="13" font-family="Consolas">α</text>
            <path d="M 260,65 A 25,25 0 0,0 243,53" fill="none" stroke="${COLORS.dimension}" stroke-width="1.5"/>
            <text x="244" y="75" fill="${COLORS.dimension}" font-size="13" font-family="Consolas">β</text>
            <text x="248" y="195" fill="${COLORS.primary}" font-size="12" font-family="Consolas">90°</text>
          </svg>
        </div>
        <div class="trig-fields">
          <div class="trig-col">
            <h4>Strany</h4>
            <div class="trig-field">
              <label class="label-a">a</label>
              <input type="text" id="trigA" inputmode="text" placeholder="protilehlá">
              <span class="trig-unit">mm</span>
            </div>
            <div class="trig-field">
              <label class="label-b">b</label>
              <input type="text" id="trigB" inputmode="text" placeholder="přilehlá">
              <span class="trig-unit">mm</span>
            </div>
            <div class="trig-field">
              <label class="label-c">c</label>
              <input type="text" id="trigC" inputmode="text" placeholder="přepona">
              <span class="trig-unit">mm</span>
            </div>
          </div>
          <div class="trig-col">
            <h4>Úhly</h4>
            <div class="trig-field">
              <label class="label-alpha">α</label>
              <input type="text" id="trigAlpha" inputmode="text" placeholder="úhel u a">
              <span class="trig-unit">°</span>
            </div>
            <div class="trig-field">
              <label class="label-beta">β</label>
              <input type="text" id="trigBeta" inputmode="text" placeholder="úhel u b">
              <span class="trig-unit">°</span>
            </div>
            <div class="trig-field">
              <label class="label-gamma">γ</label>
              <input type="text" id="trigGamma" value="90" disabled>
              <span class="trig-unit">° ✓</span>
            </div>
          </div>
        </div>
        <div class="trig-actions">
          <button class="trig-btn-solve">✅ Vypočítat</button>
          <button class="trig-btn-clear">🗑 Vymazat</button>
          <button class="trig-btn-copy">📋 Kopírovat</button>
        </div>
        <div class="trig-info">Zadejte 2 hodnoty – výpočet proběhne automaticky<br><small>Funkce: sin, cos, tan, sqrt, abs, log · Příklad: sqrt(2)*50, atan(1)</small></div>
        <div class="trig-history" id="trigHistory"></div>`;
  const overlay = makeOverlay("trig", "📐 Trigonometrie – pravý trojúhelník", bodyHTML, "trig-window");
  if (!overlay) return;

  const inpA = overlay.querySelector("#trigA");
  const inpB = overlay.querySelector("#trigB");
  const inpC = overlay.querySelector("#trigC");
  const inpAlpha = overlay.querySelector("#trigAlpha");
  const inpBeta  = overlay.querySelector("#trigBeta");
  const inputs = [inpA, inpB, inpC, inpAlpha, inpBeta];
  const deg = Math.PI / 180;

  function val(inp) {
    const v = safeEvalMath(inp.value);
    return (isFinite(v) && v > 0) ? v : null;
  }

  function setComputed(inp, v) {
    inp.value = parseFloat(v.toFixed(4));
    inp.classList.add("computed");
  }

  function clearComputed() {
    inputs.forEach(i => i.classList.remove("computed"));
  }

  function solve() {
    clearComputed();
    let a = val(inpA), b = val(inpB), c = val(inpC);
    let alpha = val(inpAlpha), beta = val(inpBeta);

    // Count known values
    const known = [a, b, c, alpha, beta].filter(v => v !== null).length;
    if (known < 2) return;

    // Angles must be < 90 for non-right angle
    if (alpha !== null && alpha >= 90) return;
    if (beta !== null && beta >= 90) return;

    // If both angles known → complement
    if (alpha !== null && beta !== null) {
      // Check consistency
      if (Math.abs(alpha + beta - 90) > 0.01) return;
    }

    // Derive missing angle from one angle
    if (alpha !== null && beta === null) { beta = 90 - alpha; setComputed(inpBeta, beta); }
    if (beta !== null && alpha === null) { alpha = 90 - beta; setComputed(inpAlpha, alpha); }

    // Two sides known → Pythagoras + trig
    if (a !== null && b !== null && c === null) {
      c = Math.sqrt(a * a + b * b);
      setComputed(inpC, c);
    }
    if (a !== null && c !== null && b === null) {
      if (c <= a) return;
      b = Math.sqrt(c * c - a * a);
      setComputed(inpB, b);
    }
    if (b !== null && c !== null && a === null) {
      if (c <= b) return;
      a = Math.sqrt(c * c - b * b);
      setComputed(inpA, a);
    }

    // From sides → angles
    if (a !== null && c !== null && alpha === null) {
      alpha = Math.asin(a / c) / deg;
      setComputed(inpAlpha, alpha);
      if (beta === null) { beta = 90 - alpha; setComputed(inpBeta, beta); }
    }
    if (b !== null && c !== null && beta === null) {
      beta = Math.asin(b / c) / deg;
      setComputed(inpBeta, beta);
      if (alpha === null) { alpha = 90 - beta; setComputed(inpAlpha, alpha); }
    }
    if (a !== null && b !== null && alpha === null) {
      alpha = Math.atan(a / b) / deg;
      setComputed(inpAlpha, alpha);
      if (beta === null) { beta = 90 - alpha; setComputed(inpBeta, beta); }
    }

    // One side + one angle → all sides
    if (alpha !== null && beta !== null) {
      const sinA = Math.sin(alpha * deg);
      const cosA = Math.cos(alpha * deg);
      if (a !== null && b === null) { b = a / Math.tan(alpha * deg); setComputed(inpB, b); }
      if (a !== null && c === null) { c = a / sinA; setComputed(inpC, c); }
      if (b !== null && a === null) { a = b * Math.tan(alpha * deg); setComputed(inpA, a); }
      if (b !== null && c === null) { c = b / cosA; setComputed(inpC, c); }
      if (c !== null && a === null) { a = c * sinA; setComputed(inpA, a); }
      if (c !== null && b === null) { b = c * cosA; setComputed(inpB, b); }
    }
  }

  overlay.querySelector(".trig-btn-solve").addEventListener("click", solve);

  const trigHistoryEl = overlay.querySelector("#trigHistory");
  const trigHistory = [];

  function addTrigHistory() {
    const a = val(inpA), b = val(inpB), c = val(inpC);
    const alpha = val(inpAlpha), beta = val(inpBeta);
    if (!a || !b || !c || !alpha || !beta) return;
    const entry = `a=${inpA.value}  b=${inpB.value}  c=${inpC.value}  α=${inpAlpha.value}°  β=${inpBeta.value}°  γ=90°`;
    trigHistory.unshift(entry);
    if (trigHistory.length > 10) trigHistory.pop();
    trigHistoryEl.innerHTML = "";
    for (const item of trigHistory) {
      const row = document.createElement("div");
      row.className = "calc-history-item";
      row.textContent = item;
      row.addEventListener("click", () => {
        navigator.clipboard.writeText(item).then(() => showToast("Zkopírováno"));
      });
      trigHistoryEl.appendChild(row);
    }
  }

  overlay.querySelector(".trig-btn-clear").addEventListener("click", () => {
    // Save current result to history before clearing
    addTrigHistory();
    inputs.forEach(i => { i.value = ""; i.classList.remove("computed"); });
  });

  overlay.querySelector(".trig-btn-copy").addEventListener("click", () => {
    const parts = [];
    if (val(inpA)) parts.push("a=" + inpA.value);
    if (val(inpB)) parts.push("b=" + inpB.value);
    if (val(inpC)) parts.push("c=" + inpC.value);
    if (val(inpAlpha)) parts.push("α=" + inpAlpha.value + "°");
    if (val(inpBeta)) parts.push("β=" + inpBeta.value + "°");
    parts.push("γ=90°");
    const text = parts.join("  ");
    navigator.clipboard.writeText(text).then(() => showToast("Zkopírováno"));
    addTrigHistory();
  });
}

document.getElementById("btnOpenCalc").addEventListener("click", openCalculator);
const calcBtn = document.getElementById("canvasCalcBtn");
calcBtn.addEventListener("mousedown", (e) => {
  e.preventDefault();
  e.stopPropagation();
});
calcBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  openCalculator();
});
// Track last focused input so clipboard/calc paste can target it
let _lastFocusedInput = null;
document.addEventListener('focusin', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && !e.target.disabled && !e.target.readOnly) {
    // Don't track calculator's own display as a paste target
    if (!e.target.closest('.calc-overlay[data-type="calc"]')) {
      _lastFocusedInput = e.target;
    }
  }
});

const clipBtn = document.getElementById("canvasClipBtn");
clipBtn.addEventListener("mousedown", (e) => {
  // Prevent focus steal and overlay close
  e.preventDefault();
  e.stopPropagation();
});
clipBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const v = getCalcClipboardValue();
  if (v == null) { showToast("Schránka kalkulačky je prázdná"); return; }
  // Use tracked input – activeElement may have shifted
  const target = _lastFocusedInput;
  if (target && document.body.contains(target) && !target.disabled && !target.readOnly
      && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const before = target.value.substring(0, start);
    const after = target.value.substring(end);
    target.value = before + v + after;
    target.selectionStart = target.selectionEnd = start + String(v).length;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.focus();
    showToast("Vloženo: " + v);
  } else {
    navigator.clipboard.writeText(String(v)).then(() => showToast("Zkopírováno do schránky: " + v));
  }
});
document.getElementById("btnOpenTrig").addEventListener("click", openTrigCalc);
document.getElementById("btnOpenCutting").addEventListener("click", openCuttingCalc);
document.getElementById("btnOpenTaper").addEventListener("click", openTaperCalc);
document.getElementById("btnOpenThread").addEventListener("click", openThreadCalc);
document.getElementById("btnOpenConvert").addEventListener("click", openConvertCalc);
document.getElementById("btnOpenWeight").addEventListener("click", openWeightCalc);
document.getElementById("btnOpenTolerance").addEventListener("click", openToleranceCalc);
document.getElementById("btnOpenRoughness").addEventListener("click", openRoughnessCalc);
document.getElementById("btnOpenInserts").addEventListener("click", openInsertCalc);
document.getElementById("btnOpenSinumerik").addEventListener("click", openSinumerikHub);
document.getElementById("btnOpenCam").addEventListener("click", openCamSimulator);

// ── Poznámkový blok (profesionální verze) ──
document.getElementById("btnOpenNotes").addEventListener("click", async () => {
  // ── Data layer: multiple note tabs stored in IDB ──
  let allNotes = await getMeta('userNotesAll');
  if (!allNotes) {
    // Migrate old single-note format
    const legacy = await getMeta('userNotes') || '';
    allNotes = [{ id: 1, title: 'Poznámky', text: legacy }];
  }
  let activeId = allNotes[0].id;
  let nextId = Math.max(...allNotes.map(n => n.id)) + 1;
  let dirty = false;
  let fontSize = 'normal'; // 'sm' | 'normal' | 'lg'

  const getActive = () => allNotes.find(n => n.id === activeId);

  // ── Build overlay ──
  const overlay = makeOverlay('notes', '📝 Poznámkový blok', `
    <!-- Tabs -->
    <div class="notes-tabs" id="notesTabs"></div>
    <!-- Toolbar -->
    <div class="notes-toolbar">
      <button class="notes-tb-btn" data-act="bold" title="Tučné **text**"><b>B</b></button>
      <button class="notes-tb-btn" data-act="italic" title="Kurzíva *text*"><i>I</i></button>
      <button class="notes-tb-btn" data-act="strike" title="Přeškrtnuté ~~text~~"><s>S</s></button>
      <span class="notes-sep"></span>
      <button class="notes-tb-btn" data-act="bullet" title="Odrážka">•</button>
      <button class="notes-tb-btn" data-act="number" title="Číslo">1.</button>
      <button class="notes-tb-btn" data-act="check" title="Checkbox [ ]">☑</button>
      <button class="notes-tb-btn" data-act="heading" title="Nadpis">#</button>
      <span class="notes-sep"></span>
      <button class="notes-tb-btn" data-act="timestamp" title="Vložit datum/čas">🕐</button>
      <button class="notes-tb-btn" data-act="line" title="Oddělovač">―</button>
      <span class="notes-sep"></span>
      <button class="notes-tb-btn" data-act="fontDown" title="Menší písmo">A↓</button>
      <button class="notes-tb-btn" data-act="fontUp" title="Větší písmo">A↑</button>
      <span class="notes-sep"></span>
      <button class="notes-tb-btn" data-act="search" title="Hledat (Ctrl+F)">🔍</button>
      <button class="notes-tb-btn" data-act="undo" title="Zpět (Ctrl+Z)">↩</button>
      <button class="notes-tb-btn" data-act="redo" title="Vpřed (Ctrl+Y)">↪</button>
    </div>
    <!-- Search bar -->
    <div class="notes-search-bar" id="notesSearchBar">
      <input type="text" id="notesSearchInput" placeholder="Hledat…">
      <span class="notes-search-count" id="notesSearchCount"></span>
      <button class="notes-tb-btn" data-act="searchPrev" title="Předchozí">▲</button>
      <button class="notes-tb-btn" data-act="searchNext" title="Další">▼</button>
      <button class="notes-tb-btn" data-act="searchClose" title="Zavřít">✕</button>
    </div>
    <!-- Editor -->
    <textarea class="notes-editor" id="notesArea" placeholder="Pište své poznámky…\n\nTipy:\n  **tučné**  *kurzíva*  ~~přeškrtnuté~~\n  - odrážky\n  [ ] checkbox\n  # nadpis"></textarea>
    <!-- Status bar -->
    <div class="notes-statusbar">
      <div class="notes-status-left">
        <span class="notes-save-indicator"><span class="dot"></span> <span id="notesSaveText">Uloženo</span></span>
        <span id="notesLastSaved"></span>
      </div>
      <div class="notes-status-right">
        <span id="notesWordCount">0 slov</span>
        <span id="notesCharCount">0 znaků</span>
        <span id="notesLineCount">Ř 1</span>
      </div>
    </div>
    <!-- Actions -->
    <div class="notes-actions">
      <button class="notes-btn danger" data-act="clear">🗑 Vymazat</button>
      <button class="notes-btn" data-act="copy">📋 Kopírovat</button>
      <button class="notes-btn" data-act="download">⬇ Stáhnout .txt</button>
      <button class="notes-btn primary" data-act="save">💾 Uložit</button>
    </div>
  `, 'notes-window');
  if (!overlay) return;

  const ta = overlay.querySelector('#notesArea');
  const tabsEl = overlay.querySelector('#notesTabs');
  const dotEl = overlay.querySelector('.notes-save-indicator .dot');
  const saveTextEl = overlay.querySelector('#notesSaveText');
  const lastSavedEl = overlay.querySelector('#notesLastSaved');
  const wordEl = overlay.querySelector('#notesWordCount');
  const charEl = overlay.querySelector('#notesCharCount');
  const lineEl = overlay.querySelector('#notesLineCount');
  const searchBar = overlay.querySelector('#notesSearchBar');
  const searchInput = overlay.querySelector('#notesSearchInput');
  const searchCountEl = overlay.querySelector('#notesSearchCount');

  // ── Helpers ──
  const persist = async () => {
    await setMeta('userNotesAll', allNotes);
    // keep legacy key in sync
    const first = allNotes.find(n => n.id === 1);
    if (first) await setMeta('userNotes', first.text);
    dirty = false;
    dotEl.classList.remove('dirty');
    saveTextEl.textContent = 'Uloženo';
    const now = new Date();
    lastSavedEl.textContent = now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  };

  const markDirty = () => {
    dirty = true;
    dotEl.classList.add('dirty');
    saveTextEl.textContent = 'Neuloženo';
  };

  const updateStats = () => {
    const text = ta.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const curLine = ta.value.substring(0, ta.selectionStart).split('\n').length;
    wordEl.textContent = words + ' slov';
    charEl.textContent = chars + ' znaků';
    lineEl.textContent = 'Ř ' + curLine;
  };

  // ── Tab rendering ──
  const renderTabs = () => {
    tabsEl.innerHTML = '';
    allNotes.forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'notes-tab' + (n.id === activeId ? ' active' : '');
      btn.textContent = n.title;
      btn.addEventListener('click', () => switchTab(n.id));
      btn.addEventListener('dblclick', () => renameTab(n.id));
      btn.addEventListener('contextmenu', e => { e.preventDefault(); showTabCtx(e, n.id); });
      tabsEl.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'notes-tab-add';
    addBtn.textContent = '+';
    addBtn.title = 'Nová záložka';
    addBtn.addEventListener('click', addTab);
    tabsEl.appendChild(addBtn);
  };

  const switchTab = (id) => {
    // Save current text before switching
    const cur = getActive();
    if (cur) cur.text = ta.value;
    activeId = id;
    const note = getActive();
    ta.value = note ? note.text : '';
    renderTabs();
    updateStats();
    markDirty();
    ta.focus();
  };

  const addTab = () => {
    const title = prompt('Název nové záložky:', 'Poznámka ' + nextId);
    if (!title) return;
    allNotes.push({ id: nextId++, title, text: '' });
    switchTab(allNotes[allNotes.length - 1].id);
  };

  const renameTab = (id) => {
    const note = allNotes.find(n => n.id === id);
    if (!note) return;
    const title = prompt('Nový název:', note.title);
    if (title) { note.title = title; renderTabs(); markDirty(); }
  };

  const showTabCtx = (e, id) => {
    // Remove old context menu if any
    overlay.querySelectorAll('.notes-ctx').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'notes-ctx';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML = `
      <button data-ctx="rename">✏️ Přejmenovat</button>
      <button data-ctx="duplicate">📄 Duplikovat</button>
      ${allNotes.length > 1 ? '<button data-ctx="delete">🗑 Smazat</button>' : ''}
    `;
    overlay.appendChild(menu);
    menu.addEventListener('click', ev => {
      const act = ev.target.dataset.ctx;
      if (act === 'rename') renameTab(id);
      if (act === 'duplicate') {
        const src = allNotes.find(n => n.id === id);
        if (src) {
          allNotes.push({ id: nextId++, title: src.title + ' (kopie)', text: src.text });
          switchTab(allNotes[allNotes.length - 1].id);
        }
      }
      if (act === 'delete' && allNotes.length > 1) {
        if (confirm('Smazat záložku „' + (allNotes.find(n => n.id === id)?.title) + '"?')) {
          allNotes = allNotes.filter(n => n.id !== id);
          if (activeId === id) switchTab(allNotes[0].id);
          renderTabs();
          markDirty();
        }
      }
      menu.remove();
    });
    const dismiss = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  };

  // ── Toolbar: insert helpers ──
  const wrapSelection = (before, after) => {
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = ta.value.substring(start, end) || 'text';
    ta.setRangeText(before + sel + after, start, end, 'select');
    ta.focus();
    markDirty();
    updateStats();
  };

  const insertAtCursor = (text) => {
    const start = ta.selectionStart;
    ta.setRangeText(text, start, ta.selectionEnd, 'end');
    ta.focus();
    markDirty();
    updateStats();
  };

  const insertLinePrefix = (prefix) => {
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    ta.setRangeText(prefix, lineStart, lineStart, 'end');
    ta.focus();
    markDirty();
    updateStats();
  };

  // ── Toolbar actions ──
  const toolbarActions = {
    bold: () => wrapSelection('**', '**'),
    italic: () => wrapSelection('*', '*'),
    strike: () => wrapSelection('~~', '~~'),
    bullet: () => insertLinePrefix('- '),
    number: () => insertLinePrefix('1. '),
    check: () => insertLinePrefix('[ ] '),
    heading: () => insertLinePrefix('# '),
    timestamp: () => {
      const now = new Date();
      insertAtCursor('[' + now.toLocaleDateString('cs-CZ') + ' ' + now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) + '] ');
    },
    line: () => insertAtCursor('\n────────────────────────────────\n'),
    fontDown: () => {
      if (fontSize === 'lg') fontSize = 'normal';
      else fontSize = 'sm';
      ta.classList.remove('font-sm', 'font-lg');
      if (fontSize !== 'normal') ta.classList.add('font-' + fontSize);
    },
    fontUp: () => {
      if (fontSize === 'sm') fontSize = 'normal';
      else fontSize = 'lg';
      ta.classList.remove('font-sm', 'font-lg');
      if (fontSize !== 'normal') ta.classList.add('font-' + fontSize);
    },
    search: () => searchBar.classList.toggle('open'),
    undo: () => { document.execCommand('undo'); updateStats(); },
    redo: () => { document.execCommand('redo'); updateStats(); },
    // Search navigation
    searchClose: () => searchBar.classList.remove('open'),
    searchPrev: () => doSearch(-1),
    searchNext: () => doSearch(1),
    // Bottom actions
    save: () => { getActive().text = ta.value; persist(); showToast('Poznámky uloženy ✓'); },
    clear: () => {
      if (confirm('Opravdu vymazat obsah této záložky?')) {
        ta.value = '';
        getActive().text = '';
        markDirty();
        updateStats();
        showToast('Záložka vymazána');
      }
    },
    copy: () => {
      navigator.clipboard.writeText(ta.value).then(() => showToast('Zkopírováno do schránky ✓'));
    },
    download: () => {
      const note = getActive();
      const blob = new Blob([ta.value], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (note.title || 'poznamky') + '.txt';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('Soubor stažen ✓');
    },
  };

  // ── Search in text ──
  let searchMatches = [];
  let searchIdx = -1;
  const doSearch = (dir) => {
    const q = searchInput.value;
    if (!q) { searchCountEl.textContent = ''; return; }
    searchMatches = [];
    let i = -1;
    const lower = ta.value.toLowerCase();
    const ql = q.toLowerCase();
    while ((i = lower.indexOf(ql, i + 1)) !== -1) searchMatches.push(i);
    if (!searchMatches.length) { searchCountEl.textContent = '0 / 0'; return; }
    searchIdx = (searchIdx + dir + searchMatches.length) % searchMatches.length;
    searchCountEl.textContent = (searchIdx + 1) + ' / ' + searchMatches.length;
    ta.focus();
    ta.setSelectionRange(searchMatches[searchIdx], searchMatches[searchIdx] + q.length);
  };
  searchInput.addEventListener('input', () => { searchIdx = -1; doSearch(1); });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') searchBar.classList.remove('open');
  });

  // ── Event delegation for toolbar + action buttons ──
  overlay.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act && toolbarActions[act]) toolbarActions[act]();
  });

  // ── Text area events ──
  let autoSaveTimer = null;
  ta.addEventListener('input', () => {
    markDirty();
    updateStats();
    // Debounced autosave
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      getActive().text = ta.value;
      persist();
    }, 2000);
  });
  ta.addEventListener('click', updateStats);
  ta.addEventListener('keyup', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(e.key)) updateStats();
  });

  // Ctrl+F interceptor inside notes
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchBar.classList.add('open');
      searchInput.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      getActive().text = ta.value;
      persist();
      showToast('Poznámky uloženy ✓');
    }
    // Tab key inserts \t
    if (e.key === 'Tab') {
      e.preventDefault();
      insertAtCursor('\t');
    }
  });

  // ── Init ──
  const note = getActive();
  ta.value = note ? note.text : '';
  renderTabs();
  updateStats();
  ta.focus();

  // ── Autosave on overlay close ──
  const _obs = new MutationObserver((_, obs) => {
    if (!document.body.contains(overlay)) {
      clearTimeout(autoSaveTimer);
      getActive().text = ta.value;
      persist();
      obs.disconnect();
    }
  });
  _obs.observe(document.body, { childList: true });
});

// ── Dialog: Grid Size ──
/** Otevře dialog pro nastavení velikosti mřížky. */
export function showGridSizeDialog() {
  const overlay = document.createElement("div");
  overlay.className = "input-overlay";
  overlay.innerHTML = `
    <div class="input-dialog">
      <h3># Velikost mřížky</h3>
      <label>Velikost kroku (mm):</label>
      <input type="number" id="dlgGridSize" step="0.1" min="0.1" value="${state.gridSize}" inputmode="decimal" autofocus>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="dlgGridOk">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const inp = overlay.querySelector("#dlgGridSize");
  inp.focus();
  inp.select();
  function confirm() {
    const v = safeEvalMath(inp.value);
    if (!isNaN(v) && v > 0) {
      state.gridSize = v;
      showToast(`Mřížka: ${v} mm`);
    }
    overlay.remove();
  }
  overlay.querySelector("#dlgGridOk").addEventListener("click", confirm);
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirm();
    if (e.key === "Escape") overlay.remove();
    e.stopPropagation();
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

// ── Dialog: Angle Snap Step ──
/** Otevře dialog pro nastavení kroku úhlového snapu. */
export function showAngleSnapDialog() {
  const overlay = document.createElement("div");
  overlay.className = "input-overlay";
  overlay.innerHTML = `
    <div class="input-dialog">
      <h3>∠ Krok úhlového snapu</h3>
      <div class="btn-row" style="flex-wrap:wrap;gap:6px;margin-bottom:12px;">
        <button class="btn-cancel angle-preset" data-deg="15">15°</button>
        <button class="btn-cancel angle-preset" data-deg="30">30°</button>
        <button class="btn-cancel angle-preset" data-deg="45">45°</button>
        <button class="btn-cancel angle-preset" data-deg="90">90°</button>
      </div>
      <label>Vlastní krok (°):</label>
      <input type="number" id="dlgAngleStep" step="1" min="1" max="180" value="${state.angleSnapStep}" inputmode="decimal" autofocus>
      <label style="margin-top:8px">Tolerance přichycení (°):</label>
      <input type="number" id="dlgAngleTol" step="1" min="1" max="45" value="${state.angleSnapTolerance}" inputmode="decimal">
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="dlgAngleOk">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const inp = overlay.querySelector("#dlgAngleStep");
  inp.focus();
  inp.select();

  overlay.querySelectorAll(".angle-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      const deg = parseInt(btn.dataset.deg);
      state.angleSnapStep = deg;
      showToast(`Úhlový snap: ${deg}°`);
      overlay.remove();
    });
  });

  function confirm() {
    const v = safeEvalMath(inp.value);
    const tolInp = overlay.querySelector("#dlgAngleTol");
    const tol = safeEvalMath(tolInp.value);
    if (!isNaN(v) && v > 0 && v <= 180) {
      state.angleSnapStep = v;
    }
    if (!isNaN(tol) && tol > 0 && tol <= 45) {
      state.angleSnapTolerance = tol;
    }
    showToast(`Úhlový snap: ${state.angleSnapStep}° (tolerance ${state.angleSnapTolerance}°)`);
    overlay.remove();
  }
  overlay.querySelector("#dlgAngleOk").addEventListener("click", confirm);
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirm();
    if (e.key === "Escape") overlay.remove();
    e.stopPropagation();
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}


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

function showSettingsDialog() {
  const act = (cond) => cond ? 'border-color:var(--ctp-green);background:var(--ctp-green);color:var(--ctp-base)' : 'border-color:var(--ctp-surface1);background:var(--ctp-surface0);color:var(--ctp-text)';
  const btnS = 'flex:1;padding:5px 6px;font-size:12px;border-radius:5px;cursor:pointer;border:2px solid transparent;';
  const bodyHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;min-width:300px;max-width:420px">

      <!-- Projekty a export – zabalovací -->
      <details style="border:1px solid var(--ctp-surface1);border-radius:6px;margin:0;background:var(--ctp-mantle)">
        <summary style="padding:6px 10px;cursor:pointer;font-size:12px;color:var(--ctp-blue);font-weight:600;user-select:none;list-style:none;display:flex;align-items:center;gap:4px">
          <span id="settProjArrow" style="transition:transform .2s;display:inline-block">▸</span> 📂 Projekty a export
        </summary>
        <div style="padding:4px 10px 8px;display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;gap:6px">
            <button class="calc-btn" id="settProjects" style="${btnS}background:var(--ctp-surface0);color:var(--ctp-text);border-color:var(--ctp-surface1)">📁 Projekty</button>
            <button class="calc-btn" id="settCNC" style="${btnS}background:var(--ctp-surface0);color:var(--ctp-text);border-color:var(--ctp-surface1)">📋 CNC Export</button>
          </div>
          <button class="calc-btn" id="settDxfJson" style="width:100%;padding:5px 6px;font-size:12px;border-radius:5px;cursor:pointer;background:#a6e3a1;color:#1e1e2e;border:1px solid #a6e3a1">🔄 DXF - JSON konvertor</button>
        </div>
      </details>

      <!-- Kóty -->
      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:6px;padding:6px 10px;margin:0">
        <legend style="color:var(--ctp-blue);font-size:12px;padding:0 4px">📐 Kóty</legend>
        <div style="display:flex;gap:6px;margin-top:2px;flex-wrap:wrap">
          <button class="calc-btn" id="settDimsAll" style="${btnS}min-width:60px;${act(state.showDimensions === 'all')}">Vše</button>
          <button class="calc-btn" id="settDimsIntersect" style="${btnS}min-width:60px;${act(state.showDimensions === 'intersections')}">Průsečíky</button>
          <button class="calc-btn" id="settDimsNone" style="${btnS}min-width:60px;${act(state.showDimensions === 'none')}">Skryté</button>
        </div>
      </fieldset>

      <!-- Přesnost zobrazení -->
      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:6px;padding:6px 10px;margin:0">
        <legend style="color:var(--ctp-blue);font-size:12px;padding:0 4px">🔢 Přesnost zobrazení</legend>
        <div style="display:flex;align-items:center;gap:8px;margin-top:2px">
          <label style="flex:1;font-size:12px;color:var(--ctp-text)">Desetinná místa:</label>
          <select id="settDecimals" style="padding:4px 8px;border-radius:5px;border:1px solid var(--ctp-surface1);background:var(--ctp-surface0);color:var(--ctp-text);font-size:13px">
            <option value="0"${state.displayDecimals === 0 ? ' selected' : ''}>0 (1 mm)</option>
            <option value="1"${state.displayDecimals === 1 ? ' selected' : ''}>1 (0.1)</option>
            <option value="2"${state.displayDecimals === 2 ? ' selected' : ''}>2 (0.01)</option>
            <option value="3"${state.displayDecimals === 3 ? ' selected' : ''}>3 (0.001)</option>
          </select>
        </div>
      </fieldset>

      <!-- Zobrazení os a stroje -->
      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:6px;padding:6px 10px;margin:0">
        <legend style="color:var(--ctp-blue);font-size:12px;padding:0 4px">📏 Zobrazení</legend>
        <div style="display:flex;gap:6px;margin-top:2px">
          <button class="calc-btn" id="settXRadius" style="${btnS}${act(state.xDisplayMode === 'radius')}">R Poloměr</button>
          <button class="calc-btn" id="settXDiam" style="${btnS}${act(state.xDisplayMode === 'diameter')}">⌀ Průměr</button>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="calc-btn" id="settCoordAbs" style="${btnS}${act(state.coordMode === 'abs')}">ABS</button>
          <button class="calc-btn" id="settCoordInc" style="${btnS}${act(state.coordMode === 'inc')}">INC</button>
          <button class="calc-btn" id="settMachSoustruh" style="${btnS}${act(state.machineType === 'soustruh')}">Soustruh</button>
          <button class="calc-btn" id="settMachKarusel" style="${btnS}${act(state.machineType === 'karusel')}">Karusel</button>
        </div>
      </fieldset>

      <!-- Mřížka a snap -->
      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:6px;padding:6px 10px;margin:0">
        <legend style="color:var(--ctp-blue);font-size:12px;padding:0 4px"># Mřížka a snap</legend>
        <div style="display:flex;gap:6px;margin-top:2px">
          <button class="calc-btn" id="settSnapGrid" style="${btnS}${act(state.snapToGrid)}"># Mřížka: ${state.snapToGrid ? 'ON' : 'OFF'}</button>
          <button class="calc-btn" id="settAngleSnap" style="${btnS}${act(state.angleSnap)}">∠ Úhel: ${state.angleSnap ? 'ON' : 'OFF'}</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:5px;align-items:center">
          <label style="font-size:11px;color:var(--ctp-subtext0)">Mřížka:</label>
          <input id="settGrid" type="number" min="0.1" max="100" step="0.1" value="${state.gridSize}"
            style="width:56px;padding:3px 6px;border-radius:5px;border:1px solid var(--ctp-surface1);background:var(--ctp-surface0);color:var(--ctp-text);font-size:12px;text-align:center">
          <label style="font-size:11px;color:var(--ctp-subtext0)">Úhel (°):</label>
          <input id="settAngleStep" type="number" min="1" max="90" step="1" value="${state.angleSnapStep}"
            style="width:56px;padding:3px 6px;border-radius:5px;border:1px solid var(--ctp-surface1);background:var(--ctp-surface0);color:var(--ctp-text);font-size:12px;text-align:center">
        </div>
        <div style="display:flex;gap:6px;margin-top:5px">
          <button class="calc-btn" id="settSnapQuadrants" style="${btnS}font-size:11px;${act(state.snapQuadrants)}">◎ Quadranty: ${state.snapQuadrants ? 'ON' : 'OFF'}</button>
          <button class="calc-btn" id="settSnapMidpoints" style="${btnS}font-size:11px;${act(state.snapMidpoints)}">½ Středy: ${state.snapMidpoints ? 'ON' : 'OFF'}</button>
        </div>
      </fieldset>

      <!-- Kotvy -->
      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:6px;padding:6px 10px;margin:0">
        <legend style="color:var(--ctp-blue);font-size:12px;padding:0 4px">⚓ Kotvy</legend>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--ctp-subtext0)">Aktivních: <strong id="settAnchorCount">${state.anchors.length}</strong></span>
          <button class="calc-btn" id="settListAnchors" title="Seznam kotev" style="padding:2px 6px;font-size:14px;border-radius:5px;cursor:pointer;background:var(--ctp-surface0);color:var(--ctp-text);border:1px solid var(--ctp-surface1);opacity:${state.anchors.length === 0 ? '0.5' : '1'}"${state.anchors.length === 0 ? ' disabled' : ''}>📋</button>
          <button class="calc-btn" id="settDeleteAnchors" title="Smazat všechny kotvy" style="margin-left:auto;padding:4px 10px;font-size:11px;border-radius:5px;cursor:pointer;background:var(--ctp-red);color:var(--ctp-base);border:1px solid var(--ctp-red);opacity:${state.anchors.length === 0 ? '0.5' : '1'}"${state.anchors.length === 0 ? ' disabled' : ''}>🗑️ Smazat vše</button>
        </div>
        <div id="settAnchorList" style="display:none;max-height:140px;overflow-y:auto;margin-top:4px;border:1px solid var(--ctp-surface1);border-radius:5px;background:var(--ctp-mantle)"></div>
      </fieldset>

      <!-- Motiv – malý přepínač dole -->
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:4px 0;border-top:1px solid var(--ctp-surface0);margin-top:2px">
        <span style="font-size:11px;color:var(--ctp-subtext0)">Motiv:</span>
        <button class="calc-btn" id="settThemeDark" title="Tmavý motiv" style="padding:3px 10px;font-size:11px;border-radius:4px;cursor:pointer;border:2px solid transparent;${act(state.theme === 'dark')}">🌙 Tmavý</button>
        <button class="calc-btn" id="settThemeLight" title="Světlý motiv" style="padding:3px 10px;font-size:11px;border-radius:4px;cursor:pointer;border:2px solid transparent;${act(state.theme === 'light')}">☀️ Světlý</button>
      </div>

    </div>`;

  const overlay = makeOverlay('settings', '⚙️ Nastavení', bodyHTML, 'cnc-window');
  if (!overlay) return;

  // ── Helpers ──
  const activeStyle = 'border-color:var(--ctp-green);background:var(--ctp-green);color:var(--ctp-base)';
  const inactiveStyle = 'border-color:var(--ctp-surface1);background:var(--ctp-surface0);color:var(--ctp-text)';
  const btnBase = 'flex:1;padding:5px 6px;font-size:12px;border-radius:5px;cursor:pointer;border:2px solid transparent;';
  const btnBaseSmall = 'flex:1;padding:5px 6px;font-size:11px;border-radius:5px;cursor:pointer;border:2px solid transparent;';

  // ── Rozbalovací šipka ──
  const detailsEl = overlay.querySelector('details');
  if (detailsEl) {
    detailsEl.addEventListener('toggle', () => {
      const arrow = overlay.querySelector('#settProjArrow');
      if (arrow) arrow.style.transform = detailsEl.open ? 'rotate(90deg)' : '';
    });
  }

  // ── Motiv ──
  function updateThemeBtns() {
    const dBtn = overlay.querySelector('#settThemeDark');
    const lBtn = overlay.querySelector('#settThemeLight');
    dBtn.style.cssText = `padding:3px 10px;font-size:11px;border-radius:4px;cursor:pointer;border:2px solid transparent;${state.theme === 'dark' ? activeStyle : inactiveStyle}`;
    lBtn.style.cssText = `padding:3px 10px;font-size:11px;border-radius:4px;cursor:pointer;border:2px solid transparent;${state.theme === 'light' ? activeStyle : inactiveStyle}`;
  }
  overlay.querySelector('#settThemeDark').addEventListener('click', () => {
    state.theme = 'dark';
    applyTheme();
    updateThemeBtns();
    persistSettings();
  });
  overlay.querySelector('#settThemeLight').addEventListener('click', () => {
    state.theme = 'light';
    applyTheme();
    updateThemeBtns();
    persistSettings();
  });

  // ── Přesnost zobrazení ──
  overlay.querySelector('#settDecimals').addEventListener('change', (e) => {
    state.displayDecimals = parseInt(e.target.value);
    renderAll();
    persistSettings();
    showToast(`Přesnost: ${state.displayDecimals} des. míst`);
  });

  // ── Typ stroje ──
  function updateMachBtns() {
    const sBtn = overlay.querySelector('#settMachSoustruh');
    const kBtn = overlay.querySelector('#settMachKarusel');
    sBtn.style.cssText = `${btnBase}${state.machineType === 'soustruh' ? activeStyle : inactiveStyle}`;
    kBtn.style.cssText = `${btnBase}${state.machineType === 'karusel' ? activeStyle : inactiveStyle}`;
  }
  overlay.querySelector('#settMachSoustruh').addEventListener('click', () => {
    state.machineType = 'soustruh';
    updateMachineTypeBtn();
    updateMachBtns();
    renderAll();
    persistSettings();
  });
  overlay.querySelector('#settMachKarusel').addEventListener('click', () => {
    state.machineType = 'karusel';
    updateMachineTypeBtn();
    updateMachBtns();
    renderAll();
    persistSettings();
  });

  // ── Osa X ──
  function updateXBtns() {
    const rBtn = overlay.querySelector('#settXRadius');
    const dBtn = overlay.querySelector('#settXDiam');
    rBtn.style.cssText = `${btnBase}${state.xDisplayMode === 'radius' ? activeStyle : inactiveStyle}`;
    dBtn.style.cssText = `${btnBase}${state.xDisplayMode === 'diameter' ? activeStyle : inactiveStyle}`;
  }
  overlay.querySelector('#settXRadius').addEventListener('click', () => {
    state.xDisplayMode = 'radius';
    updateXDisplayBtn();
    updateXBtns();
    renderAll();
    persistSettings();
  });
  overlay.querySelector('#settXDiam').addEventListener('click', () => {
    state.xDisplayMode = 'diameter';
    updateXDisplayBtn();
    updateXBtns();
    renderAll();
    persistSettings();
  });

  // ── Snap mřížka ON/OFF ──
  function updateSnapGridSettBtn() {
    const btn = overlay.querySelector('#settSnapGrid');
    btn.style.cssText = `${btnBase}${state.snapToGrid ? activeStyle : inactiveStyle}`;
    btn.textContent = `# Mřížka: ${state.snapToGrid ? 'ON' : 'OFF'}`;
  }
  overlay.querySelector('#settSnapGrid').addEventListener('click', () => {
    state.snapToGrid = !state.snapToGrid;
    updateSnapGridBtn();
    document.getElementById("indGrid")?.classList.toggle("active", state.snapToGrid);
    updateSnapGridSettBtn();
    renderAll();
    persistSettings();
    showToast(state.snapToGrid ? `Snap na mřížku: ON (${state.gridSize})` : "Snap na mřížku: OFF");
  });

  // ── Úhlový snap ON/OFF ──
  function updateAngleSnapSettBtn() {
    const btn = overlay.querySelector('#settAngleSnap');
    btn.style.cssText = `${btnBase}${state.angleSnap ? activeStyle : inactiveStyle}`;
    btn.textContent = `∠ Úhel: ${state.angleSnap ? 'ON' : 'OFF'}`;
  }
  overlay.querySelector('#settAngleSnap').addEventListener('click', () => {
    state.angleSnap = !state.angleSnap;
    updateAngleSnapBtn();
    document.getElementById("indAngle")?.classList.toggle("active", state.angleSnap);
    updateAngleSnapSettBtn();
    renderAll();
    persistSettings();
    showToast(state.angleSnap ? `Úhlový snap: ON (${state.angleSnapStep}°)` : "Úhlový snap: OFF");
  });

  // ── Mřížka ──
  overlay.querySelector('#settGrid').addEventListener('change', (e) => {
    const val = parseFloat(e.target.value);
    if (val > 0 && val <= 100) {
      state.gridSize = val;
      renderAll();
      persistSettings();
    }
  });

  // ── Úhlový snap krok ──
  overlay.querySelector('#settAngleStep').addEventListener('change', (e) => {
    const val = parseInt(e.target.value);
    if (val >= 1 && val <= 90) {
      state.angleSnapStep = val;
      persistSettings();
    }
  });

  // ── Quadranty kružnice ON/OFF ──
  function updateSnapQuadrantsBtn() {
    const btn = overlay.querySelector('#settSnapQuadrants');
    btn.style.cssText = `${btnBaseSmall}${state.snapQuadrants ? activeStyle : inactiveStyle}`;
    btn.textContent = `◎ Quadranty: ${state.snapQuadrants ? 'ON' : 'OFF'}`;
  }
  overlay.querySelector('#settSnapQuadrants').addEventListener('click', () => {
    state.snapQuadrants = !state.snapQuadrants;
    updateSnapQuadrantsBtn();
    renderAll();
    persistSettings();
    showToast(state.snapQuadrants ? 'Snap quadranty kružnice: ON' : 'Snap quadranty kružnice: OFF');
  });

  // ── Středy úseček ON/OFF ──
  function updateSnapMidpointsBtn() {
    const btn = overlay.querySelector('#settSnapMidpoints');
    btn.style.cssText = `${btnBaseSmall}${state.snapMidpoints ? activeStyle : inactiveStyle}`;
    btn.textContent = `½ Středy: ${state.snapMidpoints ? 'ON' : 'OFF'}`;
  }
  overlay.querySelector('#settSnapMidpoints').addEventListener('click', () => {
    state.snapMidpoints = !state.snapMidpoints;
    updateSnapMidpointsBtn();
    renderAll();
    persistSettings();
    showToast(state.snapMidpoints ? 'Snap středy úseček: ON' : 'Snap středy úseček: OFF');
  });

  // ── Souřadnice ABS/INC ──
  function updateCoordBtns() {
    const aBtn = overlay.querySelector('#settCoordAbs');
    const iBtn = overlay.querySelector('#settCoordInc');
    aBtn.style.cssText = `${btnBase}${state.coordMode === 'abs' ? activeStyle : inactiveStyle}`;
    iBtn.style.cssText = `${btnBase}${state.coordMode === 'inc' ? activeStyle : inactiveStyle}`;
  }
  overlay.querySelector('#settCoordAbs').addEventListener('click', () => {
    state.coordMode = 'abs';
    updateCoordModeBtn();
    updateCoordBtns();
    renderAll();
    if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
    persistSettings();
    showToast('Absolutní souřadnice (ABS)');
  });
  overlay.querySelector('#settCoordInc').addEventListener('click', () => {
    state.coordMode = 'inc';
    updateCoordModeBtn();
    updateCoordBtns();
    renderAll();
    if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
    persistSettings();
    showToast('Inkrementální souřadnice (INC)');
  });

  // ── Kóty režim ──
  function updateDimsBtns() {
    const modes = ['all', 'intersections', 'none'];
    const ids = ['#settDimsAll', '#settDimsIntersect', '#settDimsNone'];
    modes.forEach((m, i) => {
      const btn = overlay.querySelector(ids[i]);
      btn.style.cssText = `${btnBase}min-width:60px;${state.showDimensions === m ? activeStyle : inactiveStyle}`;
    });
  }
  ['all', 'intersections', 'none'].forEach((mode, i) => {
    const ids = ['#settDimsAll', '#settDimsIntersect', '#settDimsNone'];
    overlay.querySelector(ids[i]).addEventListener('click', () => {
      state.showDimensions = mode;
      updateDimsBtn();
      document.getElementById("indDims")?.classList.toggle("active", state.showDimensions !== 'none');
      updateDimsBtns();
      renderAll();
      persistSettings();
      const labels = { all: 'Kóty: vše', intersections: 'Kóty: pouze průsečíky', none: 'Kóty: skryté' };
      showToast(labels[mode]);
    });
  });

  // ── Projekty ──
  overlay.querySelector('#settProjects').addEventListener('click', () => {
    overlay.remove();
    if (bridge.showProjectsDialog) bridge.showProjectsDialog();
  });

  // ── CNC Export ──
  overlay.querySelector('#settCNC').addEventListener('click', () => {
    overlay.remove();
    if (bridge.runCncExport) bridge.runCncExport();
  });

  // ── DXF - JSON ──
  overlay.querySelector('#settDxfJson').addEventListener('click', () => {
    overlay.remove();
    window.open('dxf-json.html', '_blank');
  });

  // ── Smazat všechny kotvy ──
  function refreshAnchorUI() {
    const countEl = overlay.querySelector('#settAnchorCount');
    const delBtn = overlay.querySelector('#settDeleteAnchors');
    const listBtn = overlay.querySelector('#settListAnchors');
    const listEl = overlay.querySelector('#settAnchorList');
    if (countEl) countEl.textContent = String(state.anchors.length);
    const empty = state.anchors.length === 0;
    if (delBtn) { delBtn.disabled = empty; delBtn.style.opacity = empty ? '0.5' : '1'; }
    if (listBtn) { listBtn.disabled = empty; listBtn.style.opacity = empty ? '0.5' : '1'; }
    if (listEl && listEl.style.display !== 'none') renderAnchorList();
  }

  function renderAnchorList() {
    const listEl = overlay.querySelector('#settAnchorList');
    if (!listEl) return;
    const [H, V] = axisLabels();
    const dec = state.displayDecimals;
    if (state.anchors.length === 0) {
      listEl.innerHTML = '<p style="margin:0;padding:8px;font-size:12px;color:var(--ctp-subtext0);text-align:center">Žádné kotvy</p>';
      return;
    }
    listEl.innerHTML = state.anchors.map((a, i) => {
      const hVal = displayX(a.x).toFixed(dec);
      const vVal = a.y.toFixed(dec);
      return `<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--ctp-surface0);font-size:12px" data-anchor-idx="${i}">
        <span style="color:var(--ctp-red);font-size:14px">⚓</span>
        <span style="flex:1;color:var(--ctp-text);font-family:monospace">${H}${xPrefix()}${hVal} &nbsp; ${V}${vVal}</span>
        <button class="anchor-del-btn" data-idx="${i}" title="Smazat kotvu" style="padding:2px 6px;font-size:12px;border-radius:4px;cursor:pointer;background:transparent;color:var(--ctp-red);border:1px solid var(--ctp-red);line-height:1">✕</button>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.anchor-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        if (idx >= 0 && idx < state.anchors.length) {
          pushUndo();
          state.anchors.splice(idx, 1);
          renderAll();
          refreshAnchorUI();
          showToast('Kotva odstraněna ✓');
        }
      });
    });
  }

  // ── Zobrazit/skrýt seznam kotev ──
  overlay.querySelector('#settListAnchors').addEventListener('click', () => {
    const listEl = overlay.querySelector('#settAnchorList');
    if (!listEl) return;
    if (listEl.style.display === 'none') {
      listEl.style.display = 'block';
      renderAnchorList();
    } else {
      listEl.style.display = 'none';
    }
  });

  overlay.querySelector('#settDeleteAnchors').addEventListener('click', () => {
    if (state.anchors.length === 0) return;
    pushUndo();
    const count = state.anchors.length;
    state.anchors.length = 0;
    renderAll();
    refreshAnchorUI();
    const listEl = overlay.querySelector('#settAnchorList');
    if (listEl) listEl.style.display = 'none';
    showToast(`Smazáno ${count} kotev ✓`);
  });
}

document.getElementById('btnSettings')?.addEventListener('click', showSettingsDialog);

