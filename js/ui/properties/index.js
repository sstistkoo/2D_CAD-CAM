// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Panel vlastností: kostra                            ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js (16. 10. 2026, docs/plan-refaktoringu-ui.md, Fáze 4).
// Kostra updateProperties: společné řádky (typ, profil, název, barva, vrstva)
// doslova; větve switch(obj.type) jsou v sourozeneckých modulech a dostávají
// `ctx` se sdílenými proměnnými. Úpravy proti ui.js: `export` u _afterGeomEdit,
// řádek `ctx` a volání větví místo jejich těl.
// Kód aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { COLORS } from '../../constants.js';
import { state, pushUndo, axisLabels, toDisplayAngle } from '../../state.js';
import { typeLabel, safeEvalMath } from '../../utils.js';
import { renderAll } from '../../render.js';
import { bridge } from '../../bridge.js';
import { updateAssociativeDimensions } from '../../dialogs/dimension.js';
import { scrollCncToObject } from '../cncJump.js';
import { openObjectColorPicker } from '../colorPicker.js';
import { updateObjectList } from '../../ui.js';
import { lineProps } from './line.js';
import { circleProps, arcProps } from './arcCircle.js';
import { rectProps } from './rect.js';
import { polylineProps } from './polyline.js';
import { textProps } from './text.js';

// ── Vlastnosti objektu ──
/** Aktualizuje panel vlastností vybraného objektu. */
/**
 * Po ruční úpravě geometrie v panelu Vlastnosti: asociativní kóty, průsečíky
 * (body přichycení) a CNC panel (obnovuje se z calculateAllIntersections,
 * která i překreslí). Dřív se jen překreslovalo – průsečíky zůstaly na
 * staré poloze a CNC kód ze staré geometrie.
 */
export function _afterGeomEdit() {
  updateAssociativeDimensions();
  if (bridge.calculateAllIntersections) bridge.calculateAllIntersections();
  else renderAll();
}

/** Auto-otevře/sbalí panel Vlastnosti podle výběru; hint „Není vybrán objekt“ je v hlavičce. */
function _syncPropPanel(hasSelection) {
  const panel = document.getElementById("propPanel");
  if (!panel) return;
  panel.style.display = hasSelection ? "block" : "none";
  const header = panel.previousElementSibling;
  if (!header) return;
  for (const n of header.childNodes) {
    if (n.nodeType === 3 && /[▾▸]/.test(n.textContent)) {
      n.textContent = n.textContent.replace(/[▾▸]/, hasSelection ? "▾" : "▸");
      break;
    }
  }
  const hint = header.querySelector("#propHint");
  if (hint) hint.style.display = hasSelection ? "none" : "";
}

export function updateProperties() {
  const tbody = document.querySelector("#propTable tbody");
  tbody.innerHTML = "";

  _syncPropPanel(state.selected !== null);

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
  const ctx = { obj, tbody, H, V, addEditRow, addInfoRow, addTextRow };   // větve: js/ui/properties/*.js

  switch (obj.type) {
    case "point":
      addEditRow(H, obj.x, (v) => { obj.x = v; });
      addEditRow(V, obj.y, (v) => { obj.y = v; });
      break;
    case "line":
    case "constr":
      lineProps(ctx);
      break;
    case "circle":
      circleProps(ctx);
      break;
    case "arc":
      arcProps(ctx);
      break;
    case "rect":
      rectProps(ctx);
      break;
    case "polyline":
      polylineProps(ctx);
      break;
    case "text":
      textProps(ctx);
      break;
  }
}
