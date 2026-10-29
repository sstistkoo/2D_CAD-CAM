// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Seznam vrstev a tlačítka vrstev                     ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 2d). Listenery ➕ / 🗑 vrstvy jsou v initLayerButtons() — volá ji
// js/ui.js na původním místě (pořadí listenerů). Kód aplikace importuje jen
// z js/ui.js (updateLayerList), nikdy z js/ui/* napřímo.

import { COLORS } from '../constants.js';
import { state, showToast, pushUndo } from '../state.js';
import { renderAll } from '../render.js';
import { openLayerColorPicker } from './colorPicker.js';
import { updateObjectList, deleteObjectsByIndices } from '../ui.js';
import { bridge } from '../bridge.js';
import { saveSettings } from '../storage/settingsStore.js';

// ── Vrstvy ──
// Vlastní SVG ikony (místo emoji 👁/👁‍🗨, které se na některých systémech
// vykreslují monochromně černou barvou a splývají s tmavým pozadím panelu).
const ICON_EYE_OPEN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.4 19.4 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a19.5 19.5 0 0 1-2.29 3.44M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

/** Aktualizuje seznam vrstev v panelu. */
export function updateLayerList() {
  const ul = document.getElementById("layerList");
  if (!ul) return;
  ul.innerHTML = "";
  state.layers.forEach((layer) => {
    const li = document.createElement("li");
    li.className = "layer-row" + (layer.id === state.activeLayer ? " active" : "");

    // Color dot – otevře vlastní popover (7 barev duhy + vlastní), místo
    // holého nativního input[type=color] (do jehož popupu nejde nic přidat).
    const colorDot = document.createElement("button");
    colorDot.type = "button";
    colorDot.className = "layer-color-dot";
    colorDot.style.background = layer.color;
    colorDot.title = "Změnit barvu vrstvy";
    colorDot.addEventListener("click", (e) => {
      e.stopPropagation();
      openLayerColorPicker(layer, colorDot);
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
    visBtn.innerHTML = layer.visible ? ICON_EYE_OPEN : ICON_EYE_OFF;
    visBtn.title = layer.visible ? "Skrýt vrstvu" : "Zobrazit vrstvu";
    visBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      updateLayerList();
      // Průsečíky skryté vrstvy z výkresu i seznamu zmizí (shownIntersections.js).
      if (bridge.updateIntersectionList) bridge.updateIntersectionList();
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
    const clearBtn = layerClearButton(layer);
    if (clearBtn) li.appendChild(clearBtn);
    ul.appendChild(li);
  });
  const edgesRow = mirrorEdgesRow();
  if (edgesRow) ul.appendChild(edgesRow);
}

/**
 * Řádek „Hrany přes osu" — čáry, které při ⇋ Zrcadlit kolem osy spojují obě
 * poloviny nárysu (render/mirrorEdges.js). Nejsou to objekty, jen kresba, takže
 * řádek má jen oko (state.mirrorEdges, ukládá se v nastavení); barvu berou
 * z kontury / polotovaru (uživatel 29. 10. 2026).
 */
function mirrorEdgesRow() {
  if (!state.mirrorPreview || state.machineType === 'karusel') return null;
  const li = document.createElement("li");
  li.className = "layer-row";
  li.title = "Čáry přechodů, které při zrcadlení spojují obě poloviny dílu";
  const spacer = document.createElement("span");
  spacer.style.flex = "0 0 13px";   // místo přepínače aktivní vrstvy
  const dot = document.createElement("span");
  dot.className = "layer-color-dot";
  dot.style.cursor = "default";
  const stockObj = state.objects.find(o => o.isStock);
  const c1 = state.layers.find(l => l.id === 0)?.color || COLORS.text;
  const c2 = state.layers.find(l => l.id === stockObj?.layer)?.color || COLORS.stock;
  dot.style.background = `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)`;
  const name = document.createElement("span");
  name.className = "layer-name";
  name.textContent = "Hrany přes osu";
  const on = state.mirrorEdges !== false;
  const visBtn = document.createElement("button");
  visBtn.className = "layer-icon-btn" + (on ? "" : " off");
  visBtn.innerHTML = on ? ICON_EYE_OPEN : ICON_EYE_OFF;
  visBtn.title = on ? "Skrýt hrany přes osu" : "Zobrazit hrany přes osu";
  visBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.mirrorEdges = !on;
    saveSettings();
    updateLayerList();
    renderAll();
  });
  li.append(spacer, dot, name, visBtn);
  return li;
}

/**
 * 🗑 v řádku vrstvy: smaže objekty vrstvy, vrstva zůstane (třeba Konstrukce —
 * vodítka plátku z CAM; uživatel 29. 10. 2026). Jen vrstva s objekty, ne čelo
 * bokorysu (to maže celé faceView.deleteFace přes dolní 🗑 Smazat).
 */
function layerClearButton(layer) {
  if (layer.isFace) return null;
  const count = state.objects.filter(o => o.layer === layer.id).length;
  if (!count) return null;
  const btn = document.createElement("button");
  btn.className = "layer-icon-btn";
  btn.innerHTML = ICON_TRASH;
  btn.title = `Smazat objekty vrstvy (${count})`;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const idx = state.objects.flatMap((o, i) => (o.layer === layer.id ? [i] : []));   // seznam mohl zastarat
    const n = idx.length;
    if (!n) { updateLayerList(); return; }
    if (layer.locked) { showToast(`Vrstva ${layer.name} je zamčená`); return; }
    if (!confirm(`Smazat všech ${n} objektů vrstvy „${layer.name}"? (↩ Zpět je vrátí)`)) return;
    pushUndo();
    deleteObjectsByIndices(idx);   // i osiřelé kóty, kotvy a výběr (jako 🗑 v Objektech)
    updateLayerList();
    showToast(`Smazáno ${n} objektů vrstvy ${layer.name}`);
  });
  return btn;
}

/** Listenery tlačítek panelu vrstev (při načtení — volá js/ui.js na původním místě). */
export function initLayerButtons() {
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
    // Čelo bokorysu: objekty NEpřesouvat na Konturu (díry by se staly
    // profilem a šly do CAM) — smaže se celé čelo (js/faceView/faceView.js).
    if (state.layers[idx].isFace) {
      if (bridge.deleteFace) bridge.deleteFace(state.layers[idx]);
      return;
    }
    // Díry v plášti: stejně — smazat i s dírami (jedním ↩), ne na Konturu.
    if (state.layers[idx].isShell) {
      pushUndo();
      state.objects = state.objects.filter(o => o.layer !== delId);
      state.layers.splice(idx, 1);
      state.activeLayer = 0;
      updateLayerList(); updateObjectList(); renderAll();
      showToast('Vrstva Díry v plášti smazána i s dírami (↩ vrátí díry)');
      return;
    }
    state.layers.splice(idx, 1);
    // Move objects from deleted layer to layer 0
    state.objects.forEach(obj => { if (obj.layer === delId) obj.layer = 0; });
    state.activeLayer = 0;
    updateLayerList();
    updateObjectList();
    renderAll();
    showToast("Vrstva smazána, objekty přesunuty na vrstvu Kontura");
  });
}
