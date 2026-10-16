// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Seznam objektů (výběr, mazání, segmenty)            ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 2e); jediná úprava je `export` u _toggleSegmentSelection (používá ho
// i panel vlastností v ui.js). updateProperties bere z rozcestníku ../ui.js
// (cyklus jen přes funkce). Kód aplikace importuje jen z js/ui.js
// (updateObjectList, deleteObjectsByIndices), nikdy z js/ui/* napřímo.

import { MOBILE_BREAKPOINT } from '../constants.js';
import { state, showToast, pushUndo } from '../state.js';
import { getRectCorners, getObjectSnapPoints } from '../utils.js';
import { renderAll } from '../render.js';
import { autoCenterView } from '../canvas.js';
import { bridge } from '../bridge.js';
import { removeOrphanDimensions, deletePolylineSegment, inheritedProps } from '../objects.js';
import { showEditObjectDialog, showMobileEditDialog } from '../dialogs/mobileEdit.js';
import { removeAnchorsForObject, cleanupOrphanAnchors } from '../tools/anchorClick.js';
import { updateProperties } from '../ui.js';

// ── Seznam objektů ──
/**
 * Smaže více objektů najednou (dle indexů) včetně osiřelých kót a kotev.
 * Volající si sám zajistí pushUndo(). Po smazání se výběr vyresetuje.
 * @param {number[]} indices
 */
export function deleteObjectsByIndices(indices) {
  const sorted = [...new Set(indices)].sort((a, b) => b - a); // sestupně, aby splice neposouval indexy
  for (const idx of sorted) {
    const obj = state.objects[idx];
    if (!obj) continue;
    removeAnchorsForObject(obj);
    state.objects.splice(idx, 1);
  }
  // Smazat osiřelé kóty (zdrojový objekt byl právě smazán)
  removeOrphanDimensions();
  if (state.dragging) { state.dragging = false; state.dragObjIdx = null; }
  state.selected = null;
  state.multiSelected.clear();
  state.selectedSegment = null;
  state._selectedSegmentObjIdx = null;
  state.multiSelectedSegments.clear();
  updateObjectList();
  updateProperties();
  if (bridge.calculateAllIntersections) bridge.calculateAllIntersections();
  cleanupOrphanAnchors();
  renderAll();
}

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
    fill: "🎨",
  };

  // ── Přepínač „Číslovat" v hlavičce panelu (statický prvek) ──
  const headerNumCb = document.getElementById("objNumberCb");
  if (headerNumCb) {
    headerNumCb.checked = state.showObjectNumbers;
    headerNumCb.onchange = () => {
      state.showObjectNumbers = headerNumCb.checked;
      renderAll();
      // Na mobilu zavřít panel aby byl vidět výkres s čísly
      if (headerNumCb.checked && window.innerWidth <= MOBILE_BREAKPOINT) {
        const sidebar = document.getElementById("sidebar");
        const sidebarOverlay = document.getElementById("sidebarOverlay");
        sidebar.classList.remove("mobile-open");
        sidebarOverlay.classList.remove("active");
        setTimeout(() => autoCenterView(), 260);
      }
    };
  }

  // ── Řádek „Vše" (cyklický výběr) + akční tlačítka (bez kót) ──
  const nonDimObjects = state.objects.filter(o => !o.isDimension && !o.isCoordLabel && !o.isCamPathNote);
  if (nonDimObjects.length > 0) {
    const selectAllLi = document.createElement("li");
    selectAllLi.className = "select-all-row";

    const nonDimIndices = state.objects.map((o, i) => (!o.isDimension && !o.isCoordLabel && !o.isCamPathNote) ? i : -1).filter(i => i >= 0);
    const normalIndices = nonDimIndices.filter(i => !state.objects[i].isStock);
    const stockIndices = nonDimIndices.filter(i => state.objects[i].isStock);

    // Aktuální fáze odvozená přímo z výběru (bezstavově):
    // 0 = nic vybráno, 1 = vše, 2 = kontura (normální), 3 = polotovar, -1 = vlastní výběr
    const selSet = new Set(state.multiSelected);
    if (state.selected != null) selSet.add(state.selected);
    const sameSet = (arr) => arr.length > 0 && arr.length === selSet.size && arr.every(i => selSet.has(i));
    let phase;
    if (selSet.size === 0) phase = 0;
    else if (sameSet(nonDimIndices)) phase = 1;
    else if (sameSet(normalIndices)) phase = 2;
    else if (sameSet(stockIndices)) phase = 3;
    else phase = -1;

    const selectAllCb = document.createElement("input");
    selectAllCb.type = "checkbox";
    selectAllCb.className = "obj-checkbox";
    selectAllCb.title = "Klikáním cyklicky: vše → kontura → polotovar → zrušit";
    selectAllCb.checked = phase === 1;
    selectAllCb.indeterminate = phase === 2 || phase === 3;

    const applySel = (indices) => {
      state.multiSelected.clear();
      indices.forEach(i => state.multiSelected.add(i));
      state.selected = indices[0] ?? null;
    };
    selectAllCb.addEventListener("click", (e) => {
      e.preventDefault(); // sami řídíme vizuální stav checkboxu
      const next = phase === -1 ? 1 : (phase + 1) % 4; // 1→2→3→0
      if (next === 1) applySel(nonDimIndices);
      else if (next === 2) applySel(normalIndices);
      else if (next === 3) applySel(stockIndices);
      else { state.selected = null; state.multiSelected.clear(); }
      state.selectedSegment = null;
      state._selectedSegmentObjIdx = null;
      state.multiSelectedSegments.clear();
      updateObjectList();
      updateProperties();
      renderAll();
    });

    const label = document.createElement("span");
    label.textContent = "Vše";
    label.style.opacity = "0.7";

    const modeLabel = document.createElement("span");
    modeLabel.style.cssText = "opacity:.55;font-size:10px;margin-left:2px";
    modeLabel.textContent = phase === 1 ? "(vše)" : phase === 2 ? "(kontura)" : phase === 3 ? "(polotovar)" : "";

    selectAllLi.appendChild(selectAllCb);
    selectAllLi.appendChild(label);
    selectAllLi.appendChild(modeLabel);

    // Akční tlačítka zarovnaná nad tlačítky jednotlivých objektů (✏️ + ✕)
    const actionsWrap = document.createElement("span");
    actionsWrap.style.cssText = "display:flex;align-items:center;flex-shrink:0;margin-left:auto";

    const editAllBtn = document.createElement("button");
    editAllBtn.className = "edit-btn";
    editAllBtn.title = "Upravit objekt";
    editAllBtn.textContent = "✏️";
    editAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showMobileEditDialog();
    });
    actionsWrap.appendChild(editAllBtn);

    const delAllBtn = document.createElement("button");
    delAllBtn.className = "del-btn";
    delAllBtn.title = "Smazat vybrané objekty";
    delAllBtn.textContent = "✕";
    delAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sel = new Set(state.multiSelected);
      if (state.selected != null) sel.add(state.selected);
      const toDelete = [...sel].filter(i => {
        const o = state.objects[i];
        return o && !o.isDimension && !o.isCoordLabel && !o.isCamPathNote;
      });
      if (toDelete.length === 0) { showToast("Nejsou vybrány žádné objekty"); return; }
      pushUndo();
      deleteObjectsByIndices(toDelete);
    });
    actionsWrap.appendChild(delAllBtn);

    selectAllLi.appendChild(actionsWrap);
    ul.appendChild(selectAllLi);
  }

  // Pořadové číslo pro panel se počítá stejně jako v render.drawObjectNumbers:
  // přeskakuje kóty/coord labels, takže panel a canvas mají identické číslování.
  let _seqNum = 0;
  state.objects.forEach((obj, idx) => {
    if (obj.isCamPathNote) return;
    const li = document.createElement("li");
    const isChecked = idx === state.selected || state.multiSelected.has(idx);
    const isDim = obj.isDimension || obj.isCoordLabel;
    if (!isDim) _seqNum++;

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
    // Pořadové číslo (matchuje labely v canvasu) — kóty číslo nedostávají.
    if (!isDim) {
      const numSpan = document.createElement("span");
      numSpan.className = "obj-seq";
      numSpan.textContent = `${_seqNum}.`;
      numSpan.style.cssText = 'opacity:.6;font-variant-numeric:tabular-nums;margin:0 6px 0 2px;min-width:1.5em;display:inline-block;';
      span.appendChild(numSpan);
    }
    // Zobrazit jen typ/název BEZ koncového ID čísla — pořadové číslo už
    // máme jako prefix. Pokud obj.name končí číslem (např. „Úsečka 1003",
    // „Polotovar oblouk 6"), to číslo se odstraní.
    const rawName = obj.name || obj.type;
    const cleanName = rawName.replace(/\s+\d+\s*$/, '');
    span.appendChild(document.createTextNode(cleanName));
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
      // Výběr i tažení přepočítat přes identitu objektů – mazání kót níž
      // posouvá indexy i PŘED smazaným objektem.
      const delObj = state.objects[idx];
      const selObj = state.selected !== null ? state.objects[state.selected] : null;
      const multiObjs = [...state.multiSelected].map(i => state.objects[i]);
      const dragObj = state.dragging && state.dragObjIdx >= 0 ? state.objects[state.dragObjIdx] : null;
      removeAnchorsForObject(delObj);
      state.objects.splice(idx, 1);
      // Smazat osiřelé kóty (zdrojový objekt byl právě smazán)
      removeOrphanDimensions();
      const indexOf = (o) => { const i = o ? state.objects.indexOf(o) : -1; return i >= 0 ? i : null; };
      state.selected = indexOf(selObj);
      state.multiSelected = new Set(multiObjs.map(indexOf).filter(i => i !== null));
      if (dragObj) {
        const di = indexOf(dragObj);
        if (di === null) { state.dragging = false; state.dragObjIdx = null; }
        else state.dragObjIdx = di;
      }
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

      // Řádek "Vše" pro segmenty — select all / deselect all
      const selectAllSegLi = document.createElement("li");
      selectAllSegLi.className = "seg-item seg-select-all-row";
      const saSegsSet = state.multiSelectedSegments.get(idx);
      const allSegsSel = saSegsSet && saSegsSet.size === segCount;
      const saSegCb = document.createElement("input");
      saSegCb.type = "checkbox";
      saSegCb.className = "obj-checkbox";
      saSegCb.checked = allSegsSel;
      saSegCb.indeterminate = !allSegsSel && saSegsSet && saSegsSet.size > 0;
      saSegCb.addEventListener("change", (e) => {
        e.stopPropagation();
        state.selected = idx;
        if (saSegCb.checked) {
          const s = new Set();
          for (let i = 0; i < segCount; i++) s.add(i);
          state.multiSelectedSegments.set(idx, s);
          state.selectedSegment = segCount - 1;
          state._selectedSegmentObjIdx = idx;
        } else {
          state.multiSelectedSegments.delete(idx);
          state.selectedSegment = null;
          state._selectedSegmentObjIdx = null;
        }
        updateObjectList();
        updateProperties();
        renderAll();
      });
      const saLabel = document.createElement("span");
      saLabel.textContent = "Vše";
      saLabel.style.opacity = "0.7";
      saLabel.style.fontSize = "11px";
      selectAllSegLi.appendChild(saSegCb);
      selectAllSegLi.appendChild(saLabel);
      ul.appendChild(selectAllSegLi);

      for (let si = 0; si < segCount; si++) {
        const p1 = obj.vertices[si];
        const p2 = obj.vertices[(si + 1) % n];
        const b = obj.bulges[si] || 0;
        const segName = b === 0 ? `Úsečka ${si + 1}` : `Oblouk ${si + 1}`;

        const segLi = document.createElement("li");
        const objSegsSet = state.multiSelectedSegments.get(idx);
        const isSS = objSegsSet ? objSegsSet.has(si) : false;
        segLi.className = "seg-item" + (isSS ? " seg-selected" : "");

        // Checkbox pro výběr segmentu
        const segCb = document.createElement("input");
        segCb.type = "checkbox";
        segCb.className = "obj-checkbox";
        segCb.checked = isSS;
        segCb.addEventListener("change", (e) => {
          e.stopPropagation();
          state.selected = idx;
          state.selectedSegment = si;
          state._selectedSegmentObjIdx = idx;
          if (segCb.checked) {
            if (!state.multiSelectedSegments.has(idx)) state.multiSelectedSegments.set(idx, new Set());
            state.multiSelectedSegments.get(idx).add(si);
          } else {
            state.multiSelectedSegments.get(idx)?.delete(si);
          }
          updateObjectList();
          updateProperties();
          renderAll();
        });
        segLi.appendChild(segCb);

        const segSpan = document.createElement("span");
        const segIcon = document.createElement("span");
        segIcon.className = "obj-icon";
        segIcon.textContent = b === 0 ? "/" : "⌒";
        segSpan.appendChild(segIcon);
        const segNumSpan = document.createElement("span");
        segNumSpan.className = "obj-seq";
        segNumSpan.textContent = `${si + 1}.`;
        segNumSpan.style.cssText = 'opacity:.6;font-variant-numeric:tabular-nums;margin:0 6px 0 2px;min-width:1.5em;display:inline-block;';
        segSpan.appendChild(segNumSpan);
        segSpan.appendChild(document.createTextNode(b === 0 ? "Úsečka" : "Oblouk"));
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
          const vn = obj.vertices.length;
          const sc = obj.closed ? vn : vn - 1;
          if (si < 0 || si >= sc) return;
          pushUndo();
          // Výběr přepočítat přes identitu – smazání/rozdělení posouvá indexy.
          const selObj = state.selected !== null ? state.objects[state.selected] : null;
          const multiObjs = [...state.multiSelected].map(i => state.objects[i]);
          if (sc <= 1) removeAnchorsForObject(obj);
          if (deletePolylineSegment(idx, si) === 'deleted') removeOrphanDimensions();
          const indexOf = (o) => { const i = o ? state.objects.indexOf(o) : -1; return i >= 0 ? i : null; };
          state.selected = indexOf(selObj);
          state.multiSelected = new Set(multiObjs.map(indexOf).filter(i => i !== null));
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
              ...inheritedProps(obj),
              type: 'line',
              id: lineId,
              x1: ca.x, y1: ca.y,
              x2: cb.x, y2: cb.y,
              name: `Úsečka ${lineId}`,
            });
          }
          // Nahradit obdélník třemi úsečkami
          state.objects.splice(idx, 1, ...newLines);
          // Kóty obdélníku po něm zůstaly viset – pryč s nimi (jako při smazání)
          if (removeOrphanDimensions() > 0) state.multiSelected.clear();
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
export function _toggleSegmentSelection(objIdx, segIdx) {
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
