// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Tečny (choice, pozice)                 ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { makeInputOverlay } from '../dialogFactory.js';
import { showToast } from '../state.js';

// ── Dialog pro výběr tečny ──
/**
 * @param {import('../types.js').TangentLine[]} tangentLines
 * @param {function(number[]): void} callback  indexy vybraných tečen
 */
export function showTangentChoiceDialog(tangentLines, callback) {
  if (tangentLines.length === 0) { showToast("Tečna neexistuje"); return; }
  if (tangentLines.length === 1) { callback([0]); return; }

  const btns = tangentLines.map((_, i) =>
    `<button class="btn-ok tangent-choice" data-idx="${i}" style="width:100%">Tečna ${i + 1}</button>`
  ).join("");
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Tečny – výběr</h3>
      <label>Nalezeno ${tangentLines.length} tečen. Vyberte:</label>
      <div class="btn-row" style="flex-direction:column;gap:6px">
        ${btns}
        <button class="btn-ok tangent-all" style="width:100%;background:${COLORS.dimension};color:${COLORS.bgDark}">✓ Vytvořit všechny</button>
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
      </div>
    </div>`);

  overlay.querySelectorAll(".tangent-choice").forEach(btn => {
    btn.addEventListener("click", () => {
      overlay.remove();
      callback([parseInt(btn.dataset.idx)]);
    });
  });
  overlay.querySelector(".tangent-all").addEventListener("click", () => {
    overlay.remove();
    callback(tangentLines.map((_, i) => i));
  });

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") overlay.remove();
  });
  overlay.setAttribute("tabindex", "-1");
  overlay.focus();
}

// ── Dialog: kružnice+úsečka → přesunout, nebo nová tečná kružnice ──
export function showTangentCircleLineActionDialog(onMove, onCreateNew) {
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Tečna – kružnice + úsečka</h3>
      <label>Co chcete provést?</label>
      <div class="btn-row" style="flex-direction:column;gap:6px">
        <button class="btn-ok" id="tcl-move" style="width:100%">Přesunout kružnici tečně k úsečce</button>
        <button class="btn-ok" id="tcl-new" style="width:100%;background:${COLORS.dimension};color:${COLORS.bgDark}">Nová kružnice tečná ke kružnici i úsečce…</button>
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
      </div>
    </div>`);
  overlay.querySelector("#tcl-move").addEventListener("click", () => { overlay.remove(); onMove(); });
  overlay.querySelector("#tcl-new").addEventListener("click", () => { overlay.remove(); onCreateNew(); });
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") overlay.remove(); });
  overlay.setAttribute("tabindex", "-1");
  overlay.focus();
}

// ── Dialog: zadej poloměr nové tečné kružnice ──
export function showTangentNewCircleRadiusDialog(lastR, callback) {
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Nová tečná kružnice</h3>
      <label>Poloměr nové kružnice (mm):</label>
      <input id="tcl-r" type="number" min="0.001" step="0.1" value="${lastR > 0 ? lastR : ''}" style="width:100%" />
      <div class="btn-row">
        <button class="btn-ok" id="tcl-r-ok">OK</button>
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
      </div>
    </div>`);
  const inp = overlay.querySelector("#tcl-r");
  inp.focus(); inp.select();
  const confirm = () => {
    const v = parseFloat(inp.value.replace(',', '.'));
    if (isNaN(v) || v <= 0) { inp.style.borderColor = 'red'; return; }
    overlay.remove();
    callback(v);
  };
  overlay.querySelector("#tcl-r-ok").addEventListener("click", confirm);
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") overlay.remove(); });
  overlay.setAttribute("tabindex", "-1");
}

// ── Dialog pro výběr tečné pozice kružnice ──
export function showTangentPositionDialog(positions, circle, callback) {
  if (positions.length === 0) { showToast("Žádná tečná pozice"); return; }
  if (positions.length === 1) { callback(0); return; }

  // Seřadit podle vzdálenosti od aktuální pozice kružnice
  const sorted = positions.map((p, i) => ({
    idx: i,
    dist: Math.hypot(p.cx - circle.cx, p.cy - circle.cy)
  })).sort((a, b) => a.dist - b.dist);

  const btns = sorted.map((s, i) => {
    const p = positions[s.idx];
    const label = i === 0 ? "Nejbližší pozice" : `Pozice ${i + 1}`;
    const rInfo = p.r !== undefined ? ` r=${p.r.toFixed(2)}` : '';
    return `<button class="btn-ok tangent-pos" data-idx="${s.idx}" style="width:100%">${label} (${p.cx.toFixed(1)}, ${p.cy.toFixed(1)}${rInfo})</button>`;
  }).join("");
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Tečné napojení – pozice</h3>
      <label>Vyberte pozici kružnice:</label>
      <div class="btn-row" style="flex-direction:column;gap:6px">
        ${btns}
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
      </div>
    </div>`);

  overlay.querySelectorAll(".tangent-pos").forEach(btn => {
    btn.addEventListener("click", () => {
      overlay.remove();
      callback(parseInt(btn.dataset.idx));
    });
  });

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") overlay.remove();
  });
  overlay.setAttribute("tabindex", "-1");
  overlay.focus();
}
